const fs=require("fs"),https=require("https");
const BASE="https://mirrors.cloud.tencent.com/nexus/repository/maven-public";
const CH=2097152;                          // 2MB chunk = the max the box trusts
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
const mkdir=p=>fs.mkdirSync(TOP+p.slice(0,p.lastIndexOf("/")),{recursive:true});
const grab=(u,a,en,o)=>new Promise(res=>{
  const q=https.request(u,{method:"GET",headers:{Range:`bytes=${a}-${en}`,`User-Agent`:"gradle/8.9"}},(r)=>{
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
    mkdir(p);
    const NC=Math.ceil(sz/CH);
    let missing=NC;
    for(let i=0;i<NC;i++){
      const st=i*CH, want=i<NC-1?CH:sz-st;   // bytes that must be present in (i*CH, i*CH+want)
      const lo=i*CH, hi=Math.min(lo+want,sz);
      // existing covered bytes in this chunk
      let covered=0;
      for(let a=lo;a<hi;){
        const fp=TOP+p;
        const g=got(p);
        if(g<=a)break;
        covered=Math.min(g,hi)-a;
        a=Math.min(g,hi);
        if(g>=hi)break;
        a=Math.min(g,hi); // safety
        if(a>=hi)break;
        a=hi===a?hi:a;    // no-op, guards empty range
        break;
      }
      if(covered>=want){missing--;continue;}
      const a=lo+covered, en=lo+want-1;
      // try up to N times per chunk
      for(let t=0;t<1200;t++){
        const g=got(p);
        if(g>=hi){covered=want;break;}
        const aa=Math.max(a,Math.min(g,hi));
        if(aa>=hi)break;
        if(await grab(BASE+"/"+p,aa,hi-1,TOP+p)){continue;} // keep appending until hi
        await new Promise(r=>setTimeout(r,300));
      }
      if(got(p)>=hi)missing--;
    }
    console.log("JAR",p.split("/").pop(),got(p),"/",sz,got(p)===sz?"DONE":"INCOMPLETE");
  }
  console.log("ALL-SEED-ATTEMPT-END");
})().catch(e=>{console.error("SEEDERR",e.message);process.exit(1);});
