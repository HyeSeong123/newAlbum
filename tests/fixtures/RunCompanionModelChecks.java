import java.nio.file.*;
import java.net.URLClassLoader;
import javax.tools.ToolProvider;
class RunCompanionModelChecks {
  public static void main(String[] args) throws Exception {
    Path out=Files.createTempDirectory("companion-model-checks-");
    int result=ToolProvider.getSystemJavaCompiler().run(null,System.out,System.err,"-d",out.toString(),args[0],args[1]);
    if(result!=0)throw new IllegalStateException("model policy compilation failed");
    try(URLClassLoader loader=new URLClassLoader(new java.net.URL[]{out.toUri().toURL()})){
      loader.loadClass("com.oraedameun.album."+(args.length>2?args[2]:"CompanionModelPolicyChecks")).getMethod("main",String[].class).invoke(null,(Object)new String[0]);
    }finally{
      try(var paths=Files.walk(out)){paths.sorted(java.util.Comparator.reverseOrder()).forEach(p->{try{Files.delete(p);}catch(Exception e){throw new RuntimeException(e);}});}
    }
  }
}
