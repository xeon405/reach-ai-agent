const { spawn } = require("child_process");
const args = process.argv.slice(2);
const child = spawn("bubblewrap.cmd", args, { shell: true });
const KP = "OutreachAI2026!\n";
let buf = "";
child.stdout.on("data", (d) => {
  buf += d.toString(); process.stdout.write(d);
  const q = buf.match(/\?[^\n]*$/);
  if (q) {
    const s = q[0].toLowerCase();
    const a = s.includes("password") ? KP : (/(\(y\/n\)|\(Y\/n\))/.test(s) ? "y\n" : "\n");
    setTimeout(() => { try { child.stdin.write(a); } catch(e){} }, 300); buf = "";
  }
});
child.stderr.on("data", (d) => process.stderr.write(d));
child.on("close", (c) => { console.log("EXIT=" + c); process.exit(c || 0); });
