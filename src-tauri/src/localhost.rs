//! The installed app serves only its embedded frontend on the loopback interface.
//! SQLite, original media and native commands are never exposed over HTTP.
use std::{
    io,
    net::TcpListener,
    sync::{atomic::{AtomicBool, Ordering}, Arc},
    thread,
};
use tauri::AppHandle;
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

pub const ADDRESS: &str = "127.0.0.1:5173";
pub const ORIGIN: &str = "http://127.0.0.1:5173";

// Opt-in startup diagnostics used by the installed-app CI check.
pub fn trace(message: &str) {
    use std::io::Write;
    if let Some(path) = std::env::var_os("ORAEDAMEUN_STARTUP_LOG") {
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{message}");
        }
    }
}

pub struct LocalServer {
    server: Arc<Server>,
    stopped: Arc<AtomicBool>,
}

impl LocalServer {
    pub fn start(app: &AppHandle) -> io::Result<Self> {
        // Keep the bound socket: a port probe followed by a second bind races.
        let listener = TcpListener::bind(ADDRESS)?;
        trace("localhost socket bound");
        let server = Arc::new(Server::from_listener(listener, None).map_err(io::Error::other)?);
        let stopped = Arc::new(AtomicBool::new(false));
        let worker_server = server.clone();
        let worker_stopped = stopped.clone();
        let assets = app.asset_resolver();
        thread::Builder::new().name("album-localhost".into()).spawn(move || {
            while !worker_stopped.load(Ordering::Acquire) {
                let Ok(request) = worker_server.recv() else { break };
                trace(&format!("request {} {}", request.method(), request.url()));
                if worker_stopped.load(Ordering::Acquire) { break; }
                if let Err(status) = validate_request(&request) {
                    let _ = request.respond(Response::empty(StatusCode(status)));
                    continue;
                }
                let path = request.url().split('?').next().unwrap_or("/");
                let path = if path == "/" { "/index.html" } else { path };
                // The server always uses HTTP. Avoid querying the webview map
                // while the main thread is still creating its first webview.
                if let Some(asset) = assets.get_for_scheme(path.to_owned(), false) {
                    trace("embedded asset resolved");
                    let mut response = Response::from_data(asset.bytes);
                    for (name, value) in [
                        ("Content-Type", asset.mime_type.as_str()),
                        ("Cache-Control", "no-store"),
                        ("X-Content-Type-Options", "nosniff"),
                        ("X-Frame-Options", "DENY"),
                        ("Cross-Origin-Resource-Policy", "same-origin"),
                    ] {
                        if let Ok(header) = Header::from_bytes(name, value) { response.add_header(header); }
                    }
                    if let Some(csp) = asset.csp_header {
                        if let Ok(header) = Header::from_bytes("Content-Security-Policy", csp) { response.add_header(header); }
                    }
                    // A disconnected webview must not terminate the server.
                    let result = request.respond(response);
                    trace(&format!("response complete: {result:?}"));
                } else {
                    let _ = request.respond(Response::empty(StatusCode(404)));
                }
            }
        })?;
        Ok(Self { server, stopped })
    }

    pub fn stop(&self) {
        self.stopped.store(true, Ordering::Release);
        self.server.unblock();
    }
}

impl Drop for LocalServer {
    fn drop(&mut self) { self.stop(); }
}

fn validate_request(request: &Request) -> Result<(), u16> {
    let header = |name: &str| request.headers().iter()
        .find(|header| header.field.as_str().as_str().eq_ignore_ascii_case(name))
        .map(|header| header.value.as_str());
    validate_parts(request.method(), request.url(), header("Host"), header("Origin"), header("Sec-Fetch-Site"))
}

fn validate_parts(method: &Method, path: &str, host: Option<&str>, origin: Option<&str>, site: Option<&str>) -> Result<(), u16> {
    if host != Some(ADDRESS) || origin.is_some_and(|value| value != ORIGIN)
        || site.is_some_and(|value| value != "same-origin" && value != "none") {
        return Err(403);
    }
    if !matches!(method, Method::Get | Method::Head) { return Err(405); }
    // No absolute URLs, encoded paths, backslashes or traversal. Assets use
    // generated ASCII URLs; query strings do not affect asset resolution.
    let path = path.split('?').next().unwrap_or("");
    if !path.starts_with('/') || path.starts_with("//") || path.contains(['%', '\\'])
        || path.split('/').any(|part| part == "." || part == "..") {
        return Err(400);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_app_origin_can_read_embedded_assets() {
        assert_eq!(validate_parts(&Method::Get, "/assets/app.js?v=1", Some(ADDRESS), None, Some("same-origin")), Ok(()));
        assert_eq!(validate_parts(&Method::Head, "/", Some(ADDRESS), Some(ORIGIN), Some("none")), Ok(()));
        assert_eq!(validate_parts(&Method::Get, "/", Some("evil.example:5173"), None, None), Err(403));
        assert_eq!(validate_parts(&Method::Get, "/", Some(ADDRESS), Some("https://evil.example"), None), Err(403));
        assert_eq!(validate_parts(&Method::Get, "/", Some(ADDRESS), None, Some("cross-site")), Err(403));
        assert_eq!(validate_parts(&Method::Post, "/", Some(ADDRESS), None, None), Err(405));
    }

    #[test]
    fn rejects_file_paths_and_traversal() {
        for path in ["/../album.sqlite", "/%2e%2e/album.sqlite", "//host/file", "http://host/file", "/C:\\Pictures\\photo.jpg"] {
            assert_eq!(validate_parts(&Method::Get, path, Some(ADDRESS), None, None), Err(400));
        }
    }

    #[test]
    fn port_conflicts_are_reported_and_listener_is_released() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        assert!(TcpListener::bind(address).is_err());
        let server = Server::from_listener(listener, None).unwrap();
        assert!(TcpListener::bind(address).is_err());
        drop(server);
        // tiny_http releases its accept thread asynchronously.
        for _ in 0..100 {
            if TcpListener::bind(address).is_ok() { return; }
            thread::sleep(std::time::Duration::from_millis(10));
        }
        panic!("local listener was not released");
    }
}
