const {spawn}=require("child_process");
const fs=require("fs");
const p=spawn(
 "C:/Android/Sdk/gradle-8.9/bin/gradle.bat",
 ["--init-script","C:/Dev/reach-ai-agent/android/dc-init.init.gradle",
  "--no-daemon","--console=plain",
  "-x","lint","-x","test","-x","lintVitalRelease",
  "-x","lintDebug","-x","testDebugUnitTest",
  "assembleDebug"
 ],
 {cwd:"C:/Dev/reach-ai-agent/android",
  shell:true,
  env:{...process.env,
   ANDROID_HOME:"C:/Android/Sdk",
   ANDROID_SDK_ROOT:"C:/Android/Sdk",
   JAVA_HOME:"C:/Program Files/Java/jdk-17",
   USERPROFILE:"C:/Users/pc",
   GRADLE_OPTS:"-Dorg.gradle.internal.http.socketTimeout=30000 -Dorg.gradle.internal.http.connectionTimeout=30000"
  }
 });
p.stdout.pipe(fs.createWriteStream("dbg.log",{flags:"a"}));
p.stderr.pipe(fs.createWriteStream("dbg.log",{flags:"a"}));
p.on("exit",c=>{console.log("RUNG-EXIT",c);process.exit(c||0);});
setTimeout(()=>{console.log("RUNG-STILL-RUNNING");},5000);
