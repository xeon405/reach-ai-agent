const fs=require("fs"),https=require("https");
const BASE="https://mirrors.cloud.tencent.com/nexus/repository/maven-public";
const CH=2097152;
const SEED={
 "com/android/tools/build/bundletool/1.18.1/bundletool-1.18.1.jar":13356668,
 "com/google/guava/guava/33.3.1-jre/guava-33.3.1-jre.jar":3079289,
 "com/android/tools/build/gradle/8.7.3/gradle-8.7.3.jar":12429787,
 "org/jetbrains/kotlin/kotlin-gradle-plugin/2.0.21/kotlin-gradle-plugin-2.0.21.jar":14959240,
 "org/jetbrains/kotlin/kotlin-compiler-embeddable/2.0.21/kotlin-compiler-embeddable-2.0.21.jar":58272093,
};
const POMS={
 "com/android/tools/build/bundletool/1.18.1/bundletool-1.18.1.pom":true,
 "com/google/guava/guava/33.3.1-jre/guava-33.3.1-jre.pom":true,
 "com/android/tools/build/gradle/8.7.3/gradle-8.7.3.pom":true,
 "org/jetbrains/kotlin/kotlin-gradle-plugin/2.0.21/kotlin-gradle-plugin-2.0.21.pom":true,
 "org/jetbrains/kotlin/kotlin-compiler-embeddable/2.0.21/kotlin-compiler-embeddable-2.0.21.pom":true,
};
const got=p=>fs.existsSync("m2local/"+p)?fs.statSync("m2local/"+p).size:0;
function grab(u,a,en,o){return new Promise(res=>{const req=https.request(u,{method:"GET",headers:{Range:`bytes=${a}-${en}`}},r=>{if(r.statusCode!==206&&r.statusCode!==200){r.resume();return res(false);}const fd=fs.openSync(o,"a");r.on("data",d=>fs.writeSync(fd,d));r.on("end",()=>{try{fs.closeSync(fd);}catch(e){}res(true);});r.on("error",()=>{try{fs.closeSync(fd);}catch(e){}res(false);});});req.on("error",()=>res(false));req.end();});}
(async()=>{
 for(const p of Object.keys(SEED)){
  const sz=SEED[p],NC=Math.ceil(sz/CH);
  fs.mkdirSync("m2local/"+p.split("/").slice(0,-1).join("/"),{recursive:true});
  for(let rnd=0;rnd<600;rnd++){
   const pend=[];for(let i=0;i<NC;i++){const st=i*CH,want=i<NC-1?CH:sz-(NC-1)*CH;if(got(p)-st<want)pend.push(i);}
   if(!pend.length)break;
   if(rnd%10===0)console.log("seed",p,"rnd",rnd,"left",pend.length);
   for(const i of pend){
    const st=i*CH,want=i<NC-1?CH:sz-(NC-1)*CH;
    for(let t=0;t<50;t++){
     if(got(p)-st>=want)break;
     const a=st+got(p)-st;
     const ok=await grab(BASE+"/"+p,a,Math.min(st+want-1,sz-1),"m2local/"+p);
     if(!ok)await new Promise(r=>setTimeout(r,150));
    }
   }
  }
  console.log("SEED-OK",p,got(p),sz);
 }
 for(const p of Object.keys(POMS)){
  if(!fs.existsSync("m2local/"+p)){await grab(BASE+"/"+p,0,64*1024,"m2local/"+p).catch(()=>{});}
  console.log("POM",p,got(p));
 }
 const total=["bundletool","guava","agp","kotlin-plugin","kotlin-compiler"].reduce((a,k,)=>a,0);
 console.log("M2LOCAL-DONE",Object.keys(SEED).map(p=>p.split("/").pop()+"="+got(p)).join(","));
})().catch(e=>{console.error(e);process.exit(1);});
