const fs=require("fs");
const http=require("http");
const {spawn}=require("child_process");
const cwd=r"C:\Dev\reach-ai-agent\android";
const dbg="C:/Dev/reach-ai-agent/android/dbgd.log";
fs.writeFileSync(dbg,"");
const g=spawn(r"C:\Android\Sdk\gradle-8.9\bin\gradle.bat",
 ["--no-daemon","--console=plain",
  "-Dorg.gradle.internal.http.socketTimeout=30000",
  "-Dorg.gradle.internal.http.connectionTimeout=30000",
  "-x","lint","-x","test","-x","lintVitalRelease","-x","lintDebug",
  "assembleDebug"],
 {cwd,shell:true,
  env:{...process.env,
   ANDROID_HOME:"C:/Android/Sdk",ANDROID_SDK_ROOT:"C:/Android/Sdk",
   JAVA_HOME:"C:/Dev/reach-ai-agent/android/gr-jdk17",
   GRADLE_USER_HOME:"C:/Dev/reach-ai-agent/android/gr-cache",
   USERPROFILE:"C:/Dev"}});
const out=fs.createWriteStream(dbg,{flags:"a"});
g.stdout.pipe(out);g.stderr.pipe(out);
const iv=setInterval(()=>{
 const text=fs.readFileSync(dbg,"utf8");
 if(/BUILD (SUCCESSFUL|FAILED)|error: |FAILURE:/m.test(text)){clearInterval(iv);}
 console.log("POLL-T",text.match(/> Task :\w+:[^ ]+/g)?.slice(-2).join(" | ")||text.trim().split("\n").slice(-1)[0]);
},25000);
g.on("exit",c=>{clearInterval(iv);console.log("RUNG3-EXIT",c);process.exit(c||0);});
setTimeout(()=>{console.log("SILLY-STATUS-LINE-OK", new Date().toISOString());},4000);
