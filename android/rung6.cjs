const {spawn}=require("child_process");
const fs=require("fs");
const out=fs.createWriteStream("run6.log",{flags:"a"});
const p=spawn("C:/Android/Sdk/gradle-8.9/bin/gradle.bat",
 ["--no-daemon","--console=plain",
  "-x","lint","-x","test","-x","lintVitalRelease",
  "-x","lintDebug","-x","testDebugUnitTest",
  "-x","testDebugAndroidTest",
  "assembleDebug"],
 {cwd:"C:/Dev/reach-ai-agent/android",shell:true,
  env:{...process.env,
   ANDROID_HOME:"C:/Android/Sdk",
   ANDROID_SDK_ROOT:"C:/Android/Sdk",
   JAVA_HOME:"C:/Program Files/Java/jdk-17",
   USERPROFILE:"C:/Users/pc",
   GRADLE_OPTS:"-Dorg.gradle.internal.http.socketTimeout=30000 -Dorg.gradle.internal.http.connectionTimeout=30000",
   ORG_GRADLE_PROJECT_REPOS:"file:/C:/Dev/reach-ai-agent/android/build.gradle"
  }});
p.stdout.pipe(out);p.stderr.pipe(out);
p.on("exit",c=>{console.log("RUN6-EXIT",c);process.exit(c||0);});
setTimeout(()=>{console.log("RUN6-STILL-RUNNING");},8000);
