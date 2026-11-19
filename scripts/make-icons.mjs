// 生成插件图标 icons/icon{16,32,48,128}.png：绿色圆角方块 + 白色双向同步箭头
// 用法：node scripts/make-icons.mjs（纯 Node，无依赖）
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const GREEN = [7, 193, 96];
const WHITE = [255, 255, 255];

// 在 0..1 的单位坐标中判断点属于哪种颜色
function shade(x, y) {
  // 圆角方块
  const r = 0.22;
  const dx = Math.max(r - x, 0, x - (1 - r));
  const dy = Math.max(r - y, 0, y - (1 - r));
  if (dx * dx + dy * dy > r * r) return null;

  // 上方箭头 →：杆 + 三角头
  const bar = (y0) => y > y0 - 0.055 && y < y0 + 0.055;
  if (bar(0.36) && x > 0.2 && x < 0.62) return WHITE;
  if (x >= 0.6 && x < 0.82 && Math.abs(y - 0.36) < (0.82 - x) * 0.75) return WHITE;
  // 下方箭头 ←
  if (bar(0.64) && x > 0.38 && x < 0.8) return WHITE;
  if (x > 0.18 && x <= 0.4 && Math.abs(y - 0.64) < (x - 0.18) * 0.75) return WHITE;
  return GREEN;
}

function render(size) {
  const ss = 4; // 超采样抗锯齿
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = shade((i + (sx + 0.5) / ss) / size, (j + (sy + 0.5) / ss) / size);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const o = (j * size + i) * 4;
      if (a) { px[o] = r / a; px[o + 1] = g / a; px[o + 2] = b / a; }
      px[o + 3] = Math.round((a / (ss * ss)) * 255);
    }
  }
  return png(size, px);
}

function png(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let j = 0; j < size; j++) rgba.copy(raw, j * (size * 4 + 1) + 1, j * size * 4, (j + 1) * size * 4);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 位 RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const s of [16, 32, 48, 128]) {
  writeFileSync(new URL(`../icons/icon${s}.png`, import.meta.url), render(s));
}
console.log('icons generated');
