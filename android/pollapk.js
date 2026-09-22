const fs=require("fs");
const logp=()=>{try{const d=fs.readFileSync("C:/Dev/reach-ai-agent/android/rung.out","utf8").split(/\r?\n/).filter(Boolean);return d.slice(-40);}catch(e){return["NO-LOG"];}};
const poll=()=>{
 const apks=[];try{apks.push(...fs.readdirSync("C:/Dev/reach-ai-agent/android/app/build/outputs/apk/debug").filter(x=>x.endsWith(".apk")));}catch(e){}
 const tail=logp().filter(l=>/BUILD|Task :|error|FAILED|SUCCES|:compileDebug|:mergeDebug|:packageDebug|Exception|not found/i.test(l)).slice(-6);
 const still=process.platform==="win32"||true;
 let pidAlive=false;
 try{pidAlive=process.kill(Number(fs.readFileSync("C:/Dev/reach-ai-agent/android/rung.pid","utf8")),0);}catch(e){}
 console.log(JSON.stringify({t:new Date().toISOString().slice(11,19),pidAlive,apks,tail}));
 if(apks.length||tail.some(l=>l.includes("BUILD SUCCESSFUL")||l.includes("BUILD FAILED")||l.includes("Execution failed for task"))){console.log("POLL-DONE");process.exit(0);}
};
const iv=setInterval(poll,20000);setTimeout(()=>clearInterval(iv),3900000);poll();
