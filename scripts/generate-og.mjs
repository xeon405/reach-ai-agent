import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const W = 1200, H = 630;
const px = Buffer.alloc(W * H * 3);

function lerp(a, b, t) { return a + (b - a) * t; }
// Diagonal violet gradient #8b5cf6 -> #4c1d95
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = (x / W) * 0.45 + (y / H) * 0.55;
    const i = (y * W + x) * 3;
    px[i] = Math.round(lerp(0x8b, 0x4c, t));
    px[i + 1] = Math.round(lerp(0x5c, 0x1d, t));
    px[i + 2] = Math.round(lerp(0xf6, 0x95, t));
  }
}
function rect(x0, y0, w, h, [r, g, b]) {
  for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++)
    for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) {
      const i = (y * W + x) * 3;
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
    }
}
function outline(x0, y0, w, h, th, c) {
  rect(x0, y0, w, th, c); rect(x0, y0 + h - th, w, th, c);
  rect(x0, y0, th, h, c); rect(x0 + w - th, y0, th, h, c);
}
const WHITE = [255, 255, 255], GREEN = [34, 197, 94];
// Envelope card
const cx = 420, cy = 175, ew = 360, eh = 250, th = 14;
outline(cx, cy, ew, eh, th, WHITE);
// Flap V
for (let s = 0; s < th; s++) {
  const yTop = cy + th + s;
  const span = Math.floor((eh / 2 - th) * (1 - s / (eh / 2)));
  rect(cx + th + span - span, cy + th, 2, 2, WHITE); // keep corners clean
  for (let k = 0; k <= span; k++) {
    let i = ((yTop) * W + (cx + th + k)) * 3; if (k === 0 || k >= span - 1) { px[i] = 255; px[i+1] = 255; px[i+2] = 255; }
    i = ((yTop) * W + (cx + ew - th - k)) * 3; if (k === 0 || k >= span - 1) { px[i] = 255; px[i+1] = 255; px[i+2] = 255; }
  }
}
// Green check badge bottom-right of envelope
const bx = cx + ew - 40, by = cy + eh - 30, R = 52;
for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
  if (x * x + y * y <= R * R) {
    const gx = bx + x, gy = by + y;
    if (gx > 0 && gy > 0 && gx < W && gy < H) {
      const onRing = x * x + y * y >= (R - 9) * (R - 9);
      const i = (gy * W + gx) * 3;
      if (onRing) { px[i] = 255; px[i+1] = 255; px[i+2] = 255; }
      else { px[i] = GREEN[0]; px[i+1] = GREEN[1]; px[i+2] = GREEN[2]; }
    }
  }
}

// PNG encode (RGB, no filter per row)
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
}
const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync("public/og.png", png);
console.log("og.png written:", png.length, "bytes");
