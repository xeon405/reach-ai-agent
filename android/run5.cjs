const {spawn}=require("child_process"),fs=require("fs");
const p=spawn("C:/Android/Sdk/gradle-8.9/bin/gradle.bat",
 ["--no-daemon","--console=plain",
  "--init-script","C:/Dev/reach-ai-agent/android/dc-init.init.gradle",
  "-x","lint","-x","test","-x","lintVitalRelease",
  "-x","lintDebug","-x","testDebugUnitTest",
  "assembleDebug"],
 {cwd:"C:/Dev/reach-ai-agent/android",shell:true,
  env:{...process.env,
   ANDROID_HOME:"C:/Android/Sdk",ANDROID_SDK_ROOT:"C:/Android/Sdk",
   ANDROID_NDK_HOME:"C:/Android/Sdk/ndk",JAVA_HOME:"C:/Program Files/Java/jdk-17",
   USERPROFILE:"C:/Users/pc",
   GRADLE_OPTS:"-Dorg.gradle.internal.http.socketTimeout=30000 -Dorg.gradle.internal.http.connectionTimeout=30000"
 }});
p.stdout.pipe(fs.createWriteStream("dbg.log",{flags:"a"}));
p.stderr.pipe(fs.createWriteStream("dbg.log",{flags:"a"}));
p.on("exit",c=>{console.log("RUN5-EXIT",c);process.exit(c||0);});
setTimeout(()=>console.log("RUN5-STILL"),5000);
setTimeout(()=>console.log("RUN5-STILL-2"),120000);
