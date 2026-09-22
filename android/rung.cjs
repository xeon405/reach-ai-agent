const {spawn}=require("child_process");
const fs=require("fs");
const out=fs.createWriteStream("dbg2.log",{flags:"a"});
const p=spawn(
 "C:/Android/Sdk/gradle-8.9/bin/gradle.bat",
 ["--no-daemon","--console=plain",
  "-x","lint","-x","test","-x","lintVitalRelease",
  "-x","lintDebug","-x","testDebugUnitTest",
  "-x","lint","-x","lintVitalRelease",
  "assembleDebug"],
 {cwd:"C:/Dev/reach-ai-agent/android",
  shell:false,
  env:{...process.env,
   ANDROID_HOME:"C:/Android/Sdk",
   ANDROID_SDK_ROOT:"C:/Android/Sdk",
   ANDROID_SDK_HOME:"C:/Android/Sdk",
   USERPROFILE:"C:/Users/pc",
   JAVA_HOME:"C:/Program Files/Java/jdk-17",
   PATH:process.env.PATH+";C:/Android/Sdk/build-tools/android-34;C:/Android/Sdk/platform-tools;C:/Android/Sdk/gradle-8.9/bin;C:/Program Files/Java/jdk-17/bin;C:/Dev/reach-ai-agent/android"
  }});
p.stdout.pipe(out);
p.stderr.pipe(out);
p.on("exit",c=>{console.log("RUNG-EXIT",c);process.exit(c||0);});
setTimeout(()=>{console.log("RUNG-STILL-RUNNING");},5000);
