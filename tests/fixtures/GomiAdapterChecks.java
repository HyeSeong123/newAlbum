package com.oraedameun.album;
import java.io.*;
import java.nio.file.*;
import java.util.concurrent.atomic.AtomicInteger;

public class GomiAdapterChecks {
    private static void check(boolean value, String name) {
        if (!value) throw new AssertionError(name);
    }
    public static void main(String[] args) throws Exception {
        final String base = "3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597";
        check(GomiAdapter.applies("gomi", base), "Gomi and exact4B");
        for (String character : new String[]{null, "", "potato", "Gomi", "gomi-other"})
            check(!GomiAdapter.applies(character, base), "other characters never inherit LoRA");
        check(!GomiAdapter.applies("gomi", "legacy-sha"), "legacy model excluded");
        check(!GomiAdapter.applies("gomi", "future-other-4b"), "different4B proof excluded");
        File app = new File(args[1], "app-files");
        Files.createDirectories(app.toPath());
        File marker = new File(app, "original-photo-record.txt");
        Files.write(marker.toPath(), new byte[]{11,22,33});
        final AtomicInteger opened = new AtomicInteger();
        GomiAdapter.AssetSource source = () -> { opened.incrementAndGet(); return new FileInputStream(args[0]); };
        File installed = GomiAdapter.install(app, source);
        check(GomiAdapter.verified(installed), "asset bytes and digest verified");
        check(opened.get()==1, "initial copy once");
        check(GomiAdapter.install(app, source).equals(installed) && opened.get()==1, "valid cached adapter reused");
        Files.write(installed.toPath(), new byte[]{0});
        boolean rejected = false;
        try { GomiAdapter.install(app, () -> new ByteArrayInputStream(new byte[]{1,2,3})); }
        catch(IOException expected) { rejected=true; }
        check(rejected, "bad packaged asset rejected");
        check(!new File(installed.getPath()+".part").exists(), "failed copy cleaned");
        check(GomiAdapter.verified(GomiAdapter.install(app, source)), "next retry repairs corrupt cache");
        check(Files.readAllBytes(marker.toPath())[0]==11, "unrelated user record preserved");
        if (!System.getProperty("os.name").toLowerCase().contains("windows")) {
            File outside = new File(args[1], "outside"); Files.createDirectories(outside.toPath());
            File other = new File(args[1], "other-app"); Files.createDirectories(other.toPath());
            Files.createSymbolicLink(new File(other, "companion-gomi-v4").toPath(), outside.toPath());
            rejected=false;
            try { GomiAdapter.install(other, source); } catch(IOException expected) { rejected=true; }
            check(rejected, "symlink directory rejected before writing");
            check(outside.list().length==0, "outside directory untouched");
        }
        System.out.println("Gomi adapter checks passed");
    }
}
