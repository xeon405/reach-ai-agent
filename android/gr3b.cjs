const fs=require("fs"),https=require("https");
const BASE="https://mirrors.cloud.tencent.com/nexus/repository/maven-public";
const CH=2097152,TOP="m2local/";
const got=p=>{try{return fs.statSync(TOP+p).size;}catch(e){return 0;}};
function grab(u,a,en,o){return new Promise(res=>{const q=https.request(u,{method:"GET",headers:{Range:`bytes=${a}-${en}`}},(r)=>{if((r.statusCode!==206&&r.statusCode!==200)||!r){try{r.resume();}catch(e){}return res(false);}const fd=fs.openSync(o,"a");r.on("data",d=>fs.writeSync(fd,d));r.on("end",()=>{try{fs.closeSync(fd);}catch(e){}res(true);});r.on("error",()=>{try{fs.closeSync(fd);}catch(e){}res(false);});});q.on("error",()=>{try{fs.closeSync(fd);}catch(e){}res(false);});q.end();});}
const SEED={
"com/android/tools/sdk-common/31.7.3/sdk-common-31.7.3.jar":14891924,
"com/google/protobuf/protobuf-java/3.22.3/protobuf-java-3.22.3.jar":169402,
};
const POMS={
"com/android/tools/sdk-common/31.7.3/sdk-common-31.7.3.pom":true,
"com/google/protobuf/protobuf-java/3.22.3/protobuf-java-3.22.3.pom":true,
};
(async()=>{
 for(const p of Object.keys(SEED)){
  const sz=SEED[p],NC=Math.ceil(sz/CH);
  fs.mkdirSync(TOP+p.split("/").slice(0,-1).join("/"),{recursive:true});
  for(let rnd=0;rnd<900;rnd++){
   const pend=[];for(let i=0;i<NC;i++){const st=i*CH,want=i<NC-1?CH:sz-(NC-1)*CH;const g=got(p)-st;if(g<want)pend.push(i);}
   if(!pend.length)break;
   if(rnd%40===0)console.log("GR3B-RND",rnd,"left",pend.length,p.split("/").pop());
   for(const i of pend){
    const st=i*CH,want=i<NC-1?CH:sz-(NC-1)*CH;
    for(let t=0;t<300;t++){
     let g=got(p)-st;if(g>=want)break;
     const a=st+g,en=Math.min(st+want-1,sz-1);
     const ok=await grab(BASE+"/"+p,a,en,TOP+p);
     if(!ok)await new Promise(r=>setTimeout(r,250));
    }
   }
  }
  console.log("GR3B-DONE",p,got(p),sz);
 }
 for(const p of Object.keys(POMS)){
  if(got(p))continue;
  await grab(BASE+"/"+p,0,1<<20,TOP+p);
  console.log("GR3B-POM",p.split("/").pop(),got(p));
 }
 console.log("GR3B-ALL-DONE");
})().catch(e=>{console.error(e);process.exit(1);});
