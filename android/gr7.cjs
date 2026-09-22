const fs=require("fs"),https=require("https");
const BASE="https://mirrors.cloud.tencent.com/nexus/repository/maven-public";
const CH=2097152;
const TOP="m2local/";
const SEED={
 "com/android/tools/build/gradle/8.7.3/gradle-8.7.3.jar":12429787,
 "org/jetbrains/kotlin/kotlin-gradle-plugin/2.0.21/kotlin-gradle-plugin-2.0.21.jar":14959240,
 "org/jetbrains/kotlin/kotlin-compiler-embeddable/2.0.21/kotlin-compiler-embeddable-2.0.21.jar":58272093,
 "com/android/tools/build/bundletool/1.18.1/bundletool-1.18.1.jar":13356668,
 "com/google/guava/guava/33.3.1-jre/guava-33.3.1-jre.jar":3079289,
 "com/android/tools/sdk-common/31.7.3/sdk-common-31.7.3.jar":14891924,
 "com/google/protobuf/protobuf-java/3.22.3/protobuf-java-3.22.3.jar":169402,
};
const got=p=>{try{return fs.statSync(TOP+p).size;}catch(e){return 0;}};
const grab=(u,a,en,o)=>new Promise(res=>{
  const q=https.request(u,{method:"GET",headers:{
    "Range":("bytes="+a+"-"+en),
    "User-Agent":"gradle/8.9"
  }},(r)=>{
    const ok=r.statusCode===206||r.statusCode===200;
    if(!ok){r.resume();return res(false);}
    const fd=fs.openSync(o,"a");
    r.on("data",d=>{try{fs.writeSync(fd,d);}catch(e){}});
    r.on("end",()=>{try{fs.closeSync(fd);}catch(e){};res(true);});
    r.on("error",()=>{try{fs.closeSync(fd);}catch(e){};res(false);});
  });
  q.on("error",()=>res(false));
  q.end();
});
(async()=>{
  for(const [p,sz] of Object.entries(SEED)){
    const dir=TOP+p.slice(0,p.lastIndexOf("/"));
    fs.mkdirSync(dir,{recursive:true});
    const NC=Math.ceil(sz/CH);
    for(let i=0;i<NC;i++){
      const st=i*CH, want=(i<NC-1)?CH:(sz-(NC-1)*CH);
      for(let t=0;t<99999;t++){
        const g=got(p)-st;
        if(g>=want)break;
        const a=st+Math.max(0,Math.min(g,want));
        if(a>=st+want)break;
        const en=(a+CH-1<sz)?(a+CH-1):(sz-1);
        const ok=await grab(BASE+"/"+p,a,en,TOP+p);
        if(!ok)await new Promise(r=>setTimeout(r,400));
      }
    }
    console.log("JAR",p.split("/").pop(),got(p)+"/"+sz, got(p)===sz?"DONE":"INCOMPLETE");
  }
  console.log("ALL-SEED-COMPLETE");
})().catch(e=>{console.error("SEEDERR",e.message);process.exit(1);});
