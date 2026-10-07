//! Android WebView media streams with bounded memory and HTTP byte ranges.
//! Only database-registered media is published, behind a process-local token.
use std::{
    collections::HashMap,
    fs::File,
    io::{self, Read, Seek, SeekFrom},
    net::TcpListener,
    path::{Path, PathBuf},
    sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex},
    thread,
};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

#[derive(Default)]
pub struct PlaybackState(Mutex<Option<PlaybackServer>>);
impl PlaybackState {
    pub fn source(&self, id: i64, path: PathBuf, kind: &str, origin: String) -> Result<String, String> {
        let mut state = self.0.lock().map_err(|_| "재생 서버 상태를 읽을 수 없습니다.")?;
        if state.is_none() {
            *state = Some(PlaybackServer::start().map_err(|e| format!("재생 서버를 시작할 수 없습니다: {e}"))?);
        }
        state.as_ref().unwrap().register(id, path, kind, origin)
            .map_err(|e| format!("재생 파일을 열 수 없습니다: {e}"))
    }
}

#[derive(Clone)]
struct Media { path: PathBuf, mime: &'static str, origin: String }
struct PlaybackServer {
    server: Arc<Server>,
    stopped: Arc<AtomicBool>,
    files: Arc<Mutex<HashMap<String, Media>>>,
    address: String,
    token: String,
}
impl PlaybackServer {
    fn start() -> io::Result<Self> {
        let listener = TcpListener::bind("127.0.0.1:0")?;
        let address = listener.local_addr()?.to_string();
        let server = Arc::new(Server::from_listener(listener, None).map_err(io::Error::other)?);
        let stopped = Arc::new(AtomicBool::new(false));
        let files = Arc::new(Mutex::new(HashMap::<String, Media>::new()));
        let token = uuid::Uuid::new_v4().simple().to_string();
        for index in 0..2 {
            let (worker, done, records, host) = (server.clone(), stopped.clone(), files.clone(), address.clone());
            thread::Builder::new().name(format!("album-playback-{index}")).spawn(move || {
                while !done.load(Ordering::Acquire) {
                    let Ok(request) = worker.recv() else { break };
                    if done.load(Ordering::Acquire) { break; }
                    serve(request, &host, &records);
                }
            })?;
        }
        Ok(Self { server, stopped, files, address, token })
    }
    fn register(&self, id: i64, path: PathBuf, kind: &str, origin: String) -> io::Result<String> {
        if !File::open(&path)?.metadata()?.is_file() {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "미디어 파일이 아닙니다."));
        }
        let url_path = format!("/{}/{id}", self.token);
        let mime = mime_type(&path, kind);
        self.files.lock().map_err(|_| io::Error::other("재생 목록을 읽을 수 없습니다."))?
            .insert(url_path.clone(), Media { path, mime, origin });
        Ok(format!("http://{}{url_path}", self.address))
    }
}
impl Drop for PlaybackServer {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Release);
        for _ in 0..2 { self.server.unblock(); }
    }
}

fn header<'a>(request: &'a Request, name: &str) -> Option<&'a str> {
    request.headers().iter().find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name)).map(|h| h.value.as_str())
}
fn headers(media: &Media) -> Vec<Header> {
    [("Content-Type", media.mime), ("Accept-Ranges", "bytes"), ("Cache-Control", "no-store"),
        ("X-Content-Type-Options", "nosniff"), ("Access-Control-Allow-Origin", &media.origin),
        ("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges"), ("Vary", "Origin")]
        .into_iter().filter_map(|(name, value)| Header::from_bytes(name, value).ok()).collect()
}
fn serve(request: Request, address: &str, files: &Mutex<HashMap<String, Media>>) {
    if header(&request, "Host") != Some(address) {
        let _ = request.respond(Response::empty(StatusCode(403))); return;
    }
    let media = files.lock().ok().and_then(|files| files.get(request.url()).cloned());
    let Some(media) = media else { let _ = request.respond(Response::empty(StatusCode(404))); return; };
    if header(&request, "Origin").is_some_and(|origin| origin != media.origin) {
        let _ = request.respond(Response::empty(StatusCode(403))); return;
    }
    if request.method() == &Method::Options {
        let mut response = Response::empty(StatusCode(204));
        for h in headers(&media) { response.add_header(h); }
        response.add_header(Header::from_bytes("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS").unwrap());
        response.add_header(Header::from_bytes("Access-Control-Allow-Headers", "Range").unwrap());
        let _ = request.respond(response); return;
    }
    if !matches!(request.method(), Method::Get | Method::Head) {
        let _ = request.respond(Response::empty(StatusCode(405))); return;
    }
    let Ok(mut file) = File::open(&media.path) else { let _ = request.respond(Response::empty(StatusCode(404))); return; };
    let Ok(metadata) = file.metadata() else { let _ = request.respond(Response::empty(StatusCode(404))); return; };
    let total = metadata.len();
    let requested = header(&request, "Range");
    let range = requested.map(|value| byte_range(value, total));
    let (start, length, status) = match range {
        Some(Ok((start, end))) => (start, end - start + 1, 206),
        Some(Err(())) => {
            let mut response = Response::empty(StatusCode(416));
            for h in headers(&media) { response.add_header(h); }
            response.add_header(Header::from_bytes("Content-Range", format!("bytes */{total}")).unwrap());
            let _ = request.respond(response); return;
        }
        None => (0, total, 200),
    };
    if file.seek(SeekFrom::Start(start)).is_err() {
        let _ = request.respond(Response::empty(StatusCode(500))); return;
    }
    let Ok(length_usize) = usize::try_from(length) else { let _ = request.respond(Response::empty(StatusCode(500))); return; };
    let mut response = Response::new(StatusCode(status), headers(&media), file.take(length), Some(length_usize), None);
    if status == 206 {
        response.add_header(Header::from_bytes("Content-Range", format!("bytes {start}-{}/{total}", start + length - 1)).unwrap());
    }
    let _ = request.respond(response);
}

fn byte_range(value: &str, total: u64) -> Result<(u64, u64), ()> {
    let (first, last) = value.strip_prefix("bytes=").ok_or(())?.split_once('-').ok_or(())?;
    if total == 0 || last.contains('-') || value.contains(',') { return Err(()); }
    if first.is_empty() {
        let suffix = last.parse::<u64>().map_err(|_| ())?;
        if suffix == 0 { return Err(()); }
        return Ok((total.saturating_sub(suffix), total - 1));
    }
    let start = first.parse::<u64>().map_err(|_| ())?;
    let end = if last.is_empty() { total - 1 } else { last.parse::<u64>().map_err(|_| ())?.min(total - 1) };
    if start >= total || end < start { return Err(()); }
    Ok((start, end))
}
fn mime_type(path: &Path, kind: &str) -> &'static str {
    match path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "mp4" | "m4v" => "video/mp4", "mov" => "video/quicktime", "webm" => "video/webm",
        "mkv" => "video/x-matroska", "avi" => "video/x-msvideo", "3gp" => "video/3gpp",
        "mp3" => "audio/mpeg", "m4a" => "audio/mp4", "aac" => "audio/aac", "wav" => "audio/wav",
        "ogg" => "audio/ogg", "flac" => "audio/flac",
        _ if kind == "audio" => "application/octet-stream", _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::Write, net::TcpStream};
    #[test]
    fn parses_closed_open_and_suffix_ranges_without_overflow() {
        for (value, expected) in [("bytes=2-5", (2,5)), ("bytes=2-", (2,9)), ("bytes=-3", (7,9)),
            ("bytes=0-100", (0,9)), ("bytes=-100", (0,9)), ("bytes=9-18446744073709551615", (9,9))] {
            assert_eq!(byte_range(value, 10), Ok(expected));
        }
        for value in ["items=0-2", "bytes=10-", "bytes=5-2", "bytes=-0", "bytes=-", "bytes=0-2,5-9", "bytes=18446744073709551616-"] {
            assert_eq!(byte_range(value, 10), Err(()));
        }
        assert_eq!(byte_range("bytes=0-", 0), Err(()));
    }
    #[test]
    fn streams_registered_files_and_rejects_other_paths_and_origins() {
        let server = PlaybackServer::start().unwrap();
        let path = std::env::temp_dir().join(format!("playback-{}.mp4", uuid::Uuid::new_v4()));
        std::fs::write(&path, b"0123456789").unwrap();
        let url = server.register(1, path.clone(), "video", "http://tauri.localhost".into()).unwrap();
        let route = url.strip_prefix(&format!("http://{}", server.address)).unwrap();
        let send = |method: &str, route: &str, extra: &str| {
            let mut socket = TcpStream::connect(&server.address).unwrap();
            socket.set_read_timeout(Some(std::time::Duration::from_secs(5))).unwrap();
            write!(socket, "{method} {route} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n{extra}\r\n", server.address).unwrap();
            let mut result = String::new(); socket.read_to_string(&mut result).unwrap(); result
        };
        let full = send("GET", route, "");
        assert!(full.starts_with("HTTP/1.1 200")); assert!(full.ends_with("0123456789"));
        let partial = send("GET", route, "Origin: http://tauri.localhost\r\nRange: bytes=3-6\r\n");
        assert!(partial.starts_with("HTTP/1.1 206")); assert!(partial.ends_with("3456"));
        assert!(partial.to_ascii_lowercase().contains("content-range: bytes 3-6/10"));
        assert!(partial.to_ascii_lowercase().contains("access-control-allow-origin: http://tauri.localhost"));
        assert!(send("GET", route, "Range: bytes=10-\r\n").starts_with("HTTP/1.1 416"));
        assert!(send("GET", route, "Origin: https://evil.example\r\n").starts_with("HTTP/1.1 403"));
        assert!(send("GET", "/album.sqlite", "").starts_with("HTTP/1.1 404"));
        assert!(send("POST", route, "").starts_with("HTTP/1.1 405"));
        let head = send("HEAD", route, ""); assert!(head.starts_with("HTTP/1.1 200")); assert!(head.ends_with("\r\n\r\n"));
        assert!(send("OPTIONS", route, "Origin: http://tauri.localhost\r\n").starts_with("HTTP/1.1 204"));
        std::fs::remove_file(path).unwrap();
    }
}
