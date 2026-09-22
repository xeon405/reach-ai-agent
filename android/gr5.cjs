const fs=require("fs"),https=require("https");
const BASE="https://mirrors.cloud.tencent.com/nexus/repository/maven-public";
const CH=2097152;
const TOP="m2local/";
const SZ={"com/android/tools/sdk-common/31.7.3/sdk-common-31.7.3.jar":14891924,
          "com/google/protobuf/protobuf-java/3.22.3/protobuf-java-3.22.3.jar":169402};
const POM=1;
const got=p=>{try{return fs.statSync(TOP+p).size;}catch(e){return 0;}};
const grab=(u,a,en,o)=>new Promise(res=>{
 const q=https.request(u,{method:"GET",headers:{Range:`bytes=${a}-${en}`}},(r)=>{
  if(r.statusCode!==206&&r.statusCode!==200){r.resume();return res(false);}
  const fd=fs.openSync(o,"a");r.on("data",d=>fs.writeSync(fd,d));
  r.on("end",()=>{try{fs.closeSync(fd);}catch(e){}res(true);});
  r.on("error",()=>{try{fs.closeSync(fd);}catch(e){}res(false);});
 });q.on("error",()=>res(false));q.end();});
(async()=>{
 for(const p of ["com/android/tools/sdk-common/31.7.3/sdk-common-31.7.3.jar",
                 "com/google/protobuf/protobuf-java/3.22.3/protobuf-java-3.22.3.jar"]){
  const sz=SZ[p],NC=Math.ceil(sz/CH);
  fs.mkdirSync(TOP+p.split("/").slice(0,-1).join("/"),{recursive:true});
  for(let i=0;i<NC;i++){
   const st=i*CH,want=i<NC-1?CH:sz-(NC-1)*CH;
   for(let t=0;t<600;t++){
    if(got(p)-st>=want)break;
    const a=st+got(p)-st,en=Math.min(st+want-1,sz-1);
    const ok=await grab(BASE+"/"+p,a,en,TOP+p);
    if(!ok)await new Promise(r=>setTimeout(r,250));
   }
  }
  console.log("SEED-JAR-OK",p.split("/").pop(),got(p),sz);
  const pom=p.replace(/\.jar$/,".pom");
  if(got(pom)<50)await grab(BASE+"/"+pom,0,1048576,TOP+pom);
  console.log("SEED-POM",pom.split("/").pop(),got(pom));
 }
})();
