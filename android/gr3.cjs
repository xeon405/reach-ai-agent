const fs=require("fs"),https=require("https");
const BASE="https://mirrors.cloud.tencent.com/nexus/repository/maven-public";
const CH=2097152,TOP="C:/Dev/reach-ai-agent/android/m2local/";
const SEED={
 "com/android/tools/sdk-common/31.7.3/sdk-common-31.7.3.jar":13881662,
 "com/google/protobuf/protobuf-java/3.22.3/protobuf-java-3.22.3.jar":456534Creator263,
 "org/checkerframework/checker-qual/3.42.0/checker-qual-3.42.0.jar":1231864,
};
const POMS={
 "com/android/tools/sdk-common/31.7.3/sdk-common-31.7.3.pom":true,
 "com/google/protobuf/protobuf-java/3.22.3/protobuf-java-3.22.3.pom":true,
};
const got=p=>fs.existsSync(TOP+p)?fs.statSync(TOP+p).size:0;
function grab(u,a,en,o){return new Promise(res=>{const q=https.request(u,{method:"GET",headers:{Range:`bytes=${a}-${en}`}},(r)=>{if(r.statusCode!==206&&r.statusCode!==200){r.resume();return res(false);}const fd=fs.openSync(o,"a");r.on("data",d=>fs.writeSync(fd,d));r.on("end",()=>{try{fs.closeSync(fd);}catch(e){}res(true);});r.on("error",()=>{try{fs.closeSync(fd);}catch(e){}res(false);});});q.on("error",()=>res(false));q.end();});}
(async()=>{
 for(const p of Object.keys(SEED)){
  const sz=SEED[p],NC=Math.ceil(sz/CH);
  fs.mkdirSync(TOP+p.split("/").slice(0,-1).join("/"),{recursive:true});
  for(let rnd=0;rnd<800;rnd++){
   const pend=[];for(let i=0;i<NC;i++){const st=i*CH,want=i<NC-1?CH:sz-(NC-1)*CH;if(got(p)-st<want)pend.push(i);}
   if(!pend.length)break;
   if(rnd%20===0)console.log("GR3",p.split("/").pop(),"rnd",rnd,"left",pend.length);
   for(const i of pend){
    const st=i*CH,want=i<NC-1?CH:sz-(NC-1)*CH;
    for(let t=0;t<200;t++){
     if(got(p)-st>=want)break;
     const a=st+got(p)-st;
     const en=Math.min(st+want-1,sz-1);
     const ok=await grab(BASE+"/"+p,a,en,TOP+p);
     if(!ok)await new Promise(r=>setTimeout(r,250));
    }
   }
  }
  console.log("GR3-OK",p.split("/").pop(),got(p),sz);
 }
 for(const p of Object.keys(POMS)){if(got(p)>0)continue;await grab(BASE+"/"+p,0,1048576,TOP+p);console.log("GR3-POM",p.split("/").pop(),got(p));}
})().catch(e=>{console.error(e);process.exit(1);});
