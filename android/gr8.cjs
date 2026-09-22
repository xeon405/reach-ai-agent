const fs=require("fs"),https=require("https");
const CH=2097152;
const TOP="m2local/";
const SEED={
 "com/android/tools/sdk-common/31.7.3/sdk-common-31.7.3.jar":{h:"https://dl.google.com/dl/android/maven2",sz:14891924},
 "com/google/protobuf/protobuf-java/3.22.3/protobuf-java-3.22.3.jar":{h:"https://mirrors.cloud.tencent.com/nexus/repository/maven-public",sz:169402},
};
const got=p=>{try{return fs.statSync(TOP+p).size;}catch(e){return 0;}};
const mkdir=p=>fs.mkdirSync(TOP+p.slice(0,p.lastIndexOf("/")),{recursive:true});
const grab=(u,a,en,o)=>new Promise(res=>{
  const fd=fs.openSync(o,"a");
  const q=https.request(u,{method:"GET",headers:{Range:"bytes="+a+"-"+en,"User-Agent":"gradle/8.9"}},(r)=>{
    if(r.statusCode!==206&&r.statusCode!==200){r.resume();try{fs.closeSync(fd);}catch(e){}return res(false);}
    r.on("data",d=>{try{fs.writeSync(fd,d);}catch(e){}});
    r.on("end",()=>{try{fs.closeSync(fd);}catch(e){}res(true);});
    r.on("error",()=>{try{fs.closeSync(fd);}catch(e){}res(false);});
  });
  q.on("error",()=>{try{fs.closeSync(fd);}catch(e){}res(false);});
  q.end();
});
(async()=>{
  for(const [p,o] of Object.entries(SEED)){
    mkdir(p);
    const sz=o.sz,NC=Math.ceil(sz/CH);
    for(let i=0;i<NC;i++){
      const st=i*CH,want=i<NC-1?CH:sz-(NC-1)*CH;
      for(let t=0;t<99999;t++){
        const g=got(p)-st;if(g>=want)break;
        const a=st+Math.max(0,Math.min(g,want)),en=(a+want-st<st+want)?(a+want-st-1):(st+want-1);
        if(a>=st+want)break;
        const ok=await grab(o.h+"/"+p,a,en,TOP+p);
        if(!ok)await new Promise(r=>setTimeout(r,300));
      }
      console.log("CH",i,p.split("/").pop(),got(p)+"/"+sz);
    }
    console.log("JAR-DONE",p.split("/").pop(),got(p)+"/"+sz,got(p)===sz?"OK":"PARTIAL");
  }
  console.log("ALL-SDK-SEEDED");
})().catch(e=>{console.error("SEEDERR",e.message);process.exit(1);});
