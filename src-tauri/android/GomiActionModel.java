package com.oraedameun.album;

import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/** APK-owned standalone Gomi weights, confined to Home action reactions. */
public final class GomiActionModel {
    private GomiActionModel() {}
    public static final String ASSET = "companion/gomi-action-v3.gguf";
    public static final String MANIFEST = "companion/gomi-action-v3.json";
    public interface AssetSource { InputStream open() throws IOException; }
    public static boolean applies(String characterId, String usage) {
        return "gomi".equals(characterId) && "home-actions".equals(usage);
    }
    public static final class Spec {
        public final long bytes;
        public final String sha256;
        public Spec(String characterId, String usage, String file, long bytes, String sha256) {
            if (!applies(characterId,usage) || !"gomi-action-v3.gguf".equals(file) || bytes < 4 ||
                bytes > 1024L*1024*1024 || sha256 == null || !sha256.matches("[0-9a-f]{64}"))
                throw new IllegalArgumentException("AI_MODEL: 고미 모델 정책을 확인하지 못했어요.");
            this.bytes=bytes; this.sha256=sha256;
        }
        public boolean canGenerate(long availableMemory, boolean lowMemory, long threshold) {
            // Conservative initial bound for the compact mmap model and context.
            long reserve=Math.max(bytes+256L*1024*1024,threshold+256L*1024*1024);
            return !lowMemory && availableMemory>=reserve;
        }
    }
    private static MessageDigest digest() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private static String hex(byte[] bytes) {
        StringBuilder value=new StringBuilder();
        for(byte b:bytes)value.append(String.format("%02x",b&255));
        return value.toString();
    }
    private static void plainPath(File file) throws IOException {
        if(!file.getAbsoluteFile().equals(file.getCanonicalFile()))
            throw new IOException("AI_MODEL: 고미 모델 보관 경로를 확인하지 못했어요.");
    }
    public static boolean verified(File file, Spec spec) throws IOException {
        plainPath(file);
        if(!file.isFile() || file.length()!=spec.bytes)return false;
        MessageDigest sha=digest();byte[] buffer=new byte[256*1024];
        try(InputStream in=new FileInputStream(file)) {
            int count;while((count=in.read(buffer))!=-1)sha.update(buffer,0,count);
        }
        return spec.sha256.equals(hex(sha.digest()));
    }
    public static File install(File appFiles, Spec spec, AssetSource source) throws IOException {
        File root=appFiles.getCanonicalFile();
        File directory=new File(root,"companion-gomi-action-v3");plainPath(directory);
        if(!directory.isDirectory() && !directory.mkdirs())throw new IOException("AI_MODEL: 고미 모델 저장 공간을 만들지 못했어요.");
        File file=new File(directory,"gomi-action-v3.gguf");plainPath(file);
        if(verified(file,spec))return file;
        File part=new File(directory,"gomi-action-v3.gguf.part");plainPath(part);
        try {
            MessageDigest sha=digest();long total=0;byte[] buffer=new byte[256*1024];
            try(InputStream in=source.open();FileOutputStream out=new FileOutputStream(part)) {
                int count;while((count=in.read(buffer))!=-1) {
                    total+=count;if(total>spec.bytes)throw new IOException("AI_MODEL: 고미 모델 크기가 달라요.");
                    sha.update(buffer,0,count);out.write(buffer,0,count);
                }
                out.getFD().sync();
            }
            if(total!=spec.bytes || !spec.sha256.equals(hex(sha.digest())))throw new IOException("AI_MODEL: 고미 모델 무결성을 확인하지 못했어요.");
            plainPath(directory);plainPath(file);plainPath(part);
            Files.move(part.toPath(),file.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
            return file;
        } finally { Files.deleteIfExists(part.toPath()); }
    }
}
