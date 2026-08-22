const fs = require('fs');
const path = require('path');

const serverDir = path.join(__dirname, 'dist/server');
const distDir = path.join(__dirname, 'dist');

// Copy all files from dist/server to dist recursively
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(serverDir, distDir);

// Rename index.js to _worker.js
fs.copyFileSync(
  path.join(distDir, 'index.js'),
  path.join(distDir, '_worker.js')
);

console.log('✅ dist/server copied and _worker.js created!');