package com.oraedameun.album;
public class CompanionModelPolicyChecks {
  private static void check(boolean result,String name){if(!result)throw new AssertionError(name);}
  public static void main(String[] args){
    var old=CompanionModelRegistry.LEGACY;var upgrade=CompanionModelRegistry.DIALOGUE;
    check(CompanionModelRegistry.select(false,false)==null,"no installed model");
    check(CompanionModelRegistry.select(false,true)==old,"keep installed legacy model");
    check(CompanionModelRegistry.select(true,true)==upgrade,"prefer verified upgrade");
    check(CompanionModelRegistry.select(true,false)==upgrade,"upgrade alone works");
    check(old.verified(1107409472L,"b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897",17,17),"legacy download proof retained");
    check(upgrade.verified(2497281120L,"3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597",18,18),"upgrade proof accepted");
    check(!upgrade.verified(2497281119L,upgrade.sha256,18,18),"partial file rejected");
    check(!upgrade.verified(upgrade.bytes,old.sha256,18,18),"wrong hash rejected");
    check(!upgrade.verified(upgrade.bytes,upgrade.sha256,17,18),"modified file rejected");
    check(old.canGenerate(2000L*1024*1024,false),"legacy stays usable at previous memory level");
    check(!upgrade.canGenerate(2000L*1024*1024,false),"upgrade cannot load with legacy-only memory");
    check(upgrade.canGenerate(3600L*1024*1024,false),"upgrade has headroom");
    check(!upgrade.canGenerate(3600L*1024*1024,true),"Android low-memory signal respected");
    check(!upgrade.canDownload(2497281120L),"download reserves verification headroom");
    check(upgrade.canDownload(2800000000L),"download accepts enough free storage");
    String prompt="<|im_start|>user\n터치 /no_think<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n";
    check(old.preparePrompt(prompt).equals(prompt),"legacy chat template unchanged");
    check(upgrade.preparePrompt(prompt).equals("<|im_start|>user\n터치 <|im_end|>\n<|im_start|>assistant\n"),"non-thinking instruct template");
    System.out.println("17 companion model policy checks passed");
  }
}
