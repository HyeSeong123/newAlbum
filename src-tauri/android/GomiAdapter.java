package com.oraedameun.album;

import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/** Verified, APK-owned Gomi adapter. Never accepts a path from the WebView. */
public final class GomiAdapter {
    private GomiAdapter() {}
    public static final String ASSET = "companion/gomi-v4.gguf";
    public static final String SHA256 = "d67da0699c53b34694e52199e42147ecee702f66e3df68594ad5a9d719909ee4";
    public static final long BYTES = 23612896L;
    private static final String BASE_SHA256 = "3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597";

    public interface AssetSource { InputStream open() throws IOException; }
    public static boolean applies(String characterId, String modelSha256) {
        return "gomi".equals(characterId) && BASE_SHA256.equals(modelSha256);
    }
    private static MessageDigest digest() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch(NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder();
        for(byte value : bytes) out.append(String.format("%02x", value & 255));
        return out.toString();
    }
    private static void plainPath(File file) throws IOException {
        if(!file.getAbsoluteFile().equals(file.getCanonicalFile()))
            throw new IOException("AI_ADAPTER: 고미 학습 파일 경로를 확인하지 못했어요.");
    }
    public static boolean verified(File file) throws IOException {
        plainPath(file);
        if(!file.isFile() || file.length()!=BYTES) return false;
        MessageDigest sha = digest();
        byte[] buffer = new byte[32768];
        try(InputStream in = new FileInputStream(file)) {
            int count;
            while((count=in.read(buffer))!=-1) sha.update(buffer,0,count);
        }
        return SHA256.equals(hex(sha.digest()));
    }
    public static File install(File appFiles, AssetSource source) throws IOException {
        File root = appFiles.getCanonicalFile();
        File directory = new File(root,"companion-gomi-v4");
        plainPath(directory);
        if(!directory.isDirectory() && !directory.mkdirs())
            throw new IOException("AI_ADAPTER: 고미 학습 파일을 보관하지 못했어요.");
        plainPath(directory);
        File file = new File(directory,"gomi-v4.gguf");
        plainPath(file);
        if(verified(file)) return file;
        File part = new File(directory,"gomi-v4.gguf.part");
        plainPath(part);
        try {
            long total = 0;
            MessageDigest sha = digest();
            byte[] buffer = new byte[32768];
            try(InputStream in=source.open(); FileOutputStream out=new FileOutputStream(part)) {
                int count;
                while((count=in.read(buffer))!=-1) {
                    total+=count;
                    if(total>BYTES) throw new IOException("AI_ADAPTER: 고미 학습 파일 크기가 달라요.");
                    sha.update(buffer,0,count); out.write(buffer,0,count);
                }
                out.getFD().sync();
            }
            if(total!=BYTES || !SHA256.equals(hex(sha.digest())))
                throw new IOException("AI_ADAPTER: 고미 학습 파일을 검증하지 못했어요. 앱 업데이트를 확인해 주세요.");
            plainPath(file);
            try { Files.move(part.toPath(),file.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING); }
            catch(AtomicMoveNotSupportedException unsupported) {
                Files.move(part.toPath(),file.toPath(),StandardCopyOption.REPLACE_EXISTING);
            }
            return file;
        } finally { Files.deleteIfExists(part.toPath()); }
    }
}
