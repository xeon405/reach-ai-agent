const {spawn}=require("child_process"),fs=require("fs");
const p=spawn(
 "C:/Android/Sdk/gradle-8.9/bin/gradle.bat",
 ["--no-daemon","--console=plain",
  "-x","lint","-x","test","-x","lintVitalRelease",
  "-x","lintDebug","-x","testDebugUnitTest","-x","lint",
  "assembleDebug"],
 {cwd:"C:/Dev/reach-ai-agent/android",
  env:{...process.env,
   ANDROID_HOME:"C:/Android/Sdk",ANDROID_SDK_ROOT:"C:/Android/Sdk",
   ANDROID_SDK_HOME:"C:/Android/Sdk",
   JAVA_HOME:"C:/Program Files/Java/jdk-17",
   USERPROFILE:"C:/Dev/reach-ai-agent",
   GRADLE_OPTS:"-Dorg.gradle.internal.http.socketTimeout=30000 -Dorg.gradle.internal.http.connectionTimeout=30000"
  }});
const out=fs.createWriteStream("dbg.log",{flags:"a"});
p.stdout.pipe(out);p.stderr.pipe(out);
p.on("exit",c=>{console.log("RUNG-EXIT",c);process.exit(c||0);});
setTimeout(()=>{console.log("RUNG-STILL-RUNNING");},5000);
