import subprocess, os, sys
log=open(r"C:\Dev\reach-ai-agent\android\gradlebuild.log","ab")
env=dict(os.environ)
env["ANDROID_HOME"]=r"C:\Android\Sdk"
env["JAVA_HOME"]=r"C:\Program Files\Java\jdk-17"
cmd=[r"C:\Android\Sdk\gradle-8.9\bin\gradle.bat","--init-script",r"C:\Dev\reach-ai-agent\android\tcmirror.init.gradle","assembleDebug","--stacktrace","--no-daemon"]
p=subprocess.Popen(cmd,cwd=r"C:\Dev\reach-ai-agent\android",env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=0x08000000)
open(r"C:\Dev\reach-ai-agent\android\gradlebuild.pid","w").write(str(p.pid))
print("GRADLE-PID",p.pid,flush=True)
