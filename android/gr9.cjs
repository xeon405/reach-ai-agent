const fs=require("fs"),https=require("https");
const CH=524288;
const TOP="m2local/";
const BASE="https://mirrors.cloud.tencent.com/nexus/repository/maven-public";
const SEED={
 "com/android/tools/sdk-common/31.7.3/sdk-common-31.7.3.jar":{"u":"https://dl.google.com/dl/android/maven2/com/android/tools/sdk-common/31.7.3/sdk-common-31.7.3.jar","sz":14891924},
 "com/google/protobuf/protobuf-java/3.22.3/protobuf-java-3.22.3.jar":{"u":BASE+"/com/google/protobuf/protobuf-java/3.22.3/protobuf-java-3.22.3.jar","sz":169402},
};
const got=p=>{try{return fs.statSync(TOP+p).size;}catch(e){return 0;}};
const mk=p=>fs.mkdirSync(TOP+p.slice(0,p.lastIndexOf("/")),{recursive:true});
const grab=(u,a,en,o)=>new Promise(res=>{
  const fd=fs.openSync(o,"a");
  const q=https.request(u,{method:"GET",headers:{Range:"bytes="+a+"-"+en,"User-Agent":"Mozilla/5.0"}},(r)=>{
    if(r.statusCode!==206&&r.statusCode!==200){r.resume();try{fs.closeSync(fd);}catch(e){}return res("http");
    r.on("data",d=>{try{fs.writeSync(fd,d);}catch(e){}});
    r.on("end",()=>{try{fs.closeSync(fd);}catch(e){}res("ok")});
    r.on("error",()=>{try{fs.closeSync(fd);}catch(e){}res("err")});
  });
  q.on("error",()=>{try{fs.closeSync(fd);}catch(e){}res("reqerr")});
  q.end();
});
(async()=>{
  for(const p of Object.keys(SEED)){
    const sz=SEED[p].sz,u=SEED[p].u,NC=Math.ceil(sz/CH);
    mk(p);
    for(let i=0;i<NC;i++){
      const st=i*CH,want=i<NC-1?CH:sz-(NC-1)*CH;
      for(let t=0;t<99999;t++){
        const gv=got(p)-st;
        if(gv>=want)break;
        const a=st+gv,en=Math.min(st+want-1,sz-1);
        const s=await grab(u,a,en,TOP+p);
        if(s!=="ok")await new Promise(r=>setTimeout(r,200));
      }
    }
    console.log(new Date().toISOString().slice(11,19),"JAR-DONE",p.split("/").pop(),got(p)+"/"+sz);
  }
  console.log("ALL-SEEDED-CH512");
})().catch(e=>{console.error("SEEDERR",e.message);process.exit(1);});
