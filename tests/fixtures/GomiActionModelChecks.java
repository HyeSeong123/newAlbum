package com.oraedameun.album;
import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicInteger;

public class GomiActionModelChecks {
    private static void check(boolean value, String name) { if (!value) throw new AssertionError(name); }
    public static void main(String[] args) throws Exception {
        byte[] original = "GGUF compact action fixture".getBytes("UTF-8");
        StringBuilder digest = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(original)) digest.append(String.format("%02x", value & 255));
        GomiActionModel.Spec spec = new GomiActionModel.Spec("gomi", "home-actions", "gomi-action-v3.gguf", original.length, digest.toString());
        check(GomiActionModel.applies("gomi", "home-actions"), "only Gomi Home actions");
        for (String id : new String[]{null, "", "potato", "Gomi"}) check(!GomiActionModel.applies(id,"home-actions"), "other characters excluded");
        for (String usage : new String[]{null,"","chat","home"}) check(!GomiActionModel.applies("gomi",usage), "free chat excluded");
        boolean rejected=false;
        try { new GomiActionModel.Spec("gomi","home-actions","../escape",10,digest.toString()); } catch(IllegalArgumentException expected){rejected=true;}
        check(rejected,"manifest cannot choose arbitrary file path");
        check(spec.canGenerate(1024L*1024*1024,false,0),"compact model has separate memory budget");
        check(!spec.canGenerate(100,false,0) && !spec.canGenerate(Long.MAX_VALUE,true,0),"low memory rejected");
        File app = new File(args[0],"app"); Files.createDirectories(app.toPath());
        File marker = new File(app,"photo.txt"); Files.write(marker.toPath(),new byte[]{13});
        AtomicInteger copies = new AtomicInteger();
        GomiActionModel.AssetSource source=()->{copies.incrementAndGet();return new ByteArrayInputStream(original);};
        File installed=GomiActionModel.install(app,spec,source);
        check(GomiActionModel.verified(installed,spec),"installed model hash verified");
        check(GomiActionModel.install(app,spec,source).equals(installed) && copies.get()==1,"valid model reused");
        byte[] corrupt=original.clone();corrupt[5]^=1;Files.write(installed.toPath(),corrupt);
        rejected=false;
        try { GomiActionModel.install(app,spec,()->new ByteArrayInputStream(corrupt)); } catch(IOException expected){rejected=true;}
        check(rejected,"same size tampering rejected");
        check(!new File(installed+".part").exists(),"partial copy removed");
        check(GomiActionModel.verified(GomiActionModel.install(app,spec,source),spec),"valid APK repairs corrupt cache");
        rejected=false;
        try { GomiActionModel.install(app,new GomiActionModel.Spec("gomi","home-actions","gomi-action-v3.gguf",original.length-1,digest.toString()),source); } catch(IOException expected){rejected=true;}
        check(rejected,"oversize asset rejected");
        check(Files.readAllBytes(marker.toPath())[0]==13,"user records preserved");
        if (!System.getProperty("os.name").toLowerCase().contains("windows")) {
            File outside=new File(args[0],"outside");Files.createDirectories(outside.toPath());
            File other=new File(args[0],"other");Files.createDirectories(other.toPath());
            Files.createSymbolicLink(new File(other,"companion-gomi-action-v3").toPath(),outside.toPath());
            rejected=false;try{GomiActionModel.install(other,spec,source);}catch(IOException expected){rejected=true;}
            check(rejected && outside.list().length==0,"symlink escape rejected");
        }
        System.out.println("Gomi action model checks passed");
    }
}
