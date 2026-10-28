package com.oraedameun.album;

import java.io.*;
import java.nio.file.*;
import java.util.Comparator;

public final class CompanionStorageChecks {
    private static File current(File root) { return new File(new File(root, CompanionModelRegistry.DIALOGUE.directory), CompanionModelRegistry.DIALOGUE.filename); }
    private static File legacy(File root) { return new File(new File(root, CompanionModelRegistry.LEGACY.directory), CompanionModelRegistry.LEGACY.filename); }
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private static void write(File file, int size) throws Exception { file.getParentFile().mkdirs(); Files.write(file.toPath(), new byte[size]); }
    private static void ready(File root) throws Exception {
        File file = current(root); file.getParentFile().mkdirs();
        try (RandomAccessFile data = new RandomAccessFile(file, "rw")) {
            data.setLength(CompanionModelRegistry.DIALOGUE.bytes);
            data.writeLong(0x12345678L); data.seek(data.length()-1); data.write(37);
        }
    }
    private static void remove(Path root) throws Exception {
        try (var paths=Files.walk(root)) { for (Path path:paths.sorted(Comparator.reverseOrder()).toList()) Files.delete(path); }
    }
    public static void main(String[] args) throws Exception {
        Path temp=Files.createTempDirectory("companion-storage-");
        try {
            File root=temp.resolve("missing").toFile(); write(legacy(root),17);
            check(CompanionModelRegistry.retireLegacyFiles(root,false,current(root).lastModified(),()->{throw new AssertionError("release without current");})==0,"legacy-only must stay");
            check(CompanionModelRegistry.retireLegacyFiles(root,true,current(root).lastModified(),()->{throw new AssertionError("release missing current");})==0,"stale proof must not delete fallback");
            write(current(root),9);
            check(CompanionModelRegistry.retireLegacyFiles(root,true,current(root).lastModified(),()->{throw new AssertionError("release partial current");})==0,"partial current must preserve fallback");
            ready(root);
            check(CompanionModelRegistry.retireLegacyFiles(root,false,current(root).lastModified(),()->{throw new AssertionError("release unverified");})==0 && legacy(root).isFile(),"full length without proof must stay");

            File valid=temp.resolve("valid").toFile(); ready(valid); write(legacy(valid),17);
            File part=new File(legacy(valid).getParentFile(),"download.part"); write(part,7);
            File unrelated=new File(legacy(valid).getParentFile(),"conversation.keep"); write(unrelated,11);
            File photo=new File(valid,"photos/photo.jpg"); write(photo,13);
            long mtime=current(valid).lastModified(); int[] releases={0};
            long retired=CompanionModelRegistry.retireLegacyFiles(valid,true,current(valid).lastModified(),()->{
                check(legacy(valid).exists(),"release must precede removal"); releases[0]++;
            });
            check(retired==24 && releases[0]==1 && !legacy(valid).exists() && !part.exists(),"retire both exact obsolete files");
            check(unrelated.length()==11 && photo.length()==13,"unrelated files must survive");
            check(current(valid).length()==2497281120L && current(valid).lastModified()==mtime,"current file metadata must survive");
            try(RandomAccessFile data=new RandomAccessFile(current(valid),"r")) {
                check(data.readLong()==0x12345678L,"current header changed"); data.seek(data.length()-1); check(data.read()==37,"current tail changed");
            }
            check(CompanionModelRegistry.retireLegacyFiles(valid,true,current(valid).lastModified(),()->{throw new AssertionError("repeat release");})==0,"repeat must be no-op");
            write(part,7);
            check(CompanionModelRegistry.retireLegacyFiles(valid,true,current(valid).lastModified(),()->{throw new AssertionError("partial is not mapped");})==7,"partial-only cleanup need not release current model");

            File fail=temp.resolve("fail").toFile(); ready(fail); write(legacy(fail),17);
            try { CompanionModelRegistry.retireLegacyFiles(fail,true,current(fail).lastModified(),()->{throw new IllegalStateException("release failed");}); throw new AssertionError("must propagate release failure"); }
            catch(IllegalStateException expected) { check(legacy(fail).exists(),"release failure must retain legacy"); }
            long oldTime=current(fail).lastModified();
            check(CompanionModelRegistry.retireLegacyFiles(fail,true,current(fail).lastModified(),()->check(current(fail).setLastModified(oldTime+2000),"fixture mtime"))==0 && legacy(fail).exists(),"changed current must retain fallback");

            File stale=temp.resolve("stale-proof").toFile(); ready(stale); write(legacy(stale),17);
            long verifiedMtime=current(stale).lastModified();
            boolean verified=CompanionModelRegistry.DIALOGUE.verified(current(stale).length(), CompanionModelRegistry.DIALOGUE.sha256, verifiedMtime, current(stale).lastModified());
            check(current(stale).setLastModified(verifiedMtime+2000),"fixture pre-entry mtime");
            check(CompanionModelRegistry.retireLegacyFiles(stale,verified,verifiedMtime,()->{})==0 && legacy(stale).exists(),"a changed file before cleanup entry must not retire offline fallback");

            File outside=temp.resolve("outside").toFile(); write(outside,19);
            File leaf=temp.resolve("leaf-link").toFile(); ready(leaf); legacy(leaf).getParentFile().mkdirs(); Files.createSymbolicLink(legacy(leaf).toPath(),outside.toPath());
            check(CompanionModelRegistry.retireLegacyFiles(leaf,true,current(leaf).lastModified(),()->{throw new AssertionError("linked legacy");})==0 && outside.length()==19,"legacy symlink must not be followed");
            File directory=temp.resolve("directory-link").toFile(); ready(directory);
            File external=temp.resolve("external-models").toFile(); write(new File(external,CompanionModelRegistry.LEGACY.filename),23);
            Files.createSymbolicLink(legacy(directory).getParentFile().toPath(),external.toPath());
            check(CompanionModelRegistry.retireLegacyFiles(directory,true,current(directory).lastModified(),()->{throw new AssertionError("linked directory");})==0 && new File(external,CompanionModelRegistry.LEGACY.filename).length()==23,"legacy directory symlink must stay");
            File linkedCurrent=temp.resolve("current-link").toFile(); write(legacy(linkedCurrent),17); current(linkedCurrent).getParentFile().mkdirs();
            Files.createSymbolicLink(current(linkedCurrent).toPath(),current(valid).toPath());
            check(CompanionModelRegistry.retireLegacyFiles(linkedCurrent,true,current(linkedCurrent).lastModified(),()->{throw new AssertionError("linked current");})==0 && legacy(linkedCurrent).exists(),"current symlink cannot authorize deletion");
            File nested=temp.resolve("nested").toFile(); ready(nested); File child=new File(legacy(nested),"keep"); write(child,29);
            check(CompanionModelRegistry.retireLegacyFiles(nested,true,current(nested).lastModified(),()->{throw new AssertionError("not a file");})==0 && child.length()==29,"no recursive deletion");
            System.out.println("companion storage checks passed");
        } finally { remove(temp); }
    }
}
