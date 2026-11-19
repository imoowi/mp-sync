// 一键打包商店上传用的 zip：node scripts/pack.mjs
// 先跑发布前自检，通过后把插件运行所需文件打成 dist/<名称>-<版本>.zip（manifest.json 位于 zip 根目录）
// 纯 Node 实现（zlib deflate + 手写 zip 结构），不依赖任何第三方包
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE = ['manifest.json', 'background.js', 'adapters', 'content', 'lib', 'popup', 'icons'];

// 1. 自检
if (!process.argv.includes('--skip-test')) {
  try {
    const tests = readdirSync(join(root, 'tests'))
      .filter((n) => n.endsWith('.mjs'))
      .map((n) => join(root, 'tests', n));
    execFileSync(process.execPath, ['--test', ...tests], { stdio: 'pipe' });
    console.log('✓ 自检通过');
  } catch (e) {
    console.error(String(e.stdout || e));
    console.error('✗ 自检未通过，已停止打包（加 --skip-test 可跳过）');
    process.exit(1);
  }
}

// 2. 收集文件
function walk(p) {
  const full = join(root, p);
  if (!existsSync(full)) throw new Error('缺少 ' + p);
  if (statSync(full).isFile()) return [p];
  return readdirSync(full).filter((n) => !n.startsWith('.')).flatMap((n) => walk(join(p, n)));
}
const files = INCLUDE.flatMap(walk).map((p) => p.split(sep).join('/')).sort();

// 3. 写 zip
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const d = new Date();
const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

const locals = [];
const centrals = [];
let offset = 0;
for (const f of files) {
  const data = readFileSync(join(root, f));
  const comp = deflateRawSync(data, { level: 9 });
  const name = Buffer.from(f, 'utf8');
  const crc = crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(0x0800, 6); // UTF-8 文件名
  head.writeUInt16LE(8, 8); // deflate
  head.writeUInt16LE(dosTime, 10);
  head.writeUInt16LE(dosDate, 12);
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(comp.length, 18);
  head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(name.length, 26);
  locals.push(head, name, comp);

  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(20, 4);
  cen.writeUInt16LE(20, 6);
  cen.writeUInt16LE(0x0800, 8);
  cen.writeUInt16LE(8, 10);
  cen.writeUInt16LE(dosTime, 12);
  cen.writeUInt16LE(dosDate, 14);
  cen.writeUInt32LE(crc, 16);
  cen.writeUInt32LE(comp.length, 20);
  cen.writeUInt32LE(data.length, 24);
  cen.writeUInt16LE(name.length, 28);
  cen.writeUInt32LE(offset, 42);
  centrals.push(cen, name);
  offset += head.length + name.length + comp.length;
}
const cenSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cenSize, 12);
end.writeUInt32LE(offset, 16);

const { version } = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', `gzh-sync-${version}.zip`);
const zip = Buffer.concat([...locals, ...centrals, end]);
writeFileSync(out, zip);
console.log(`✓ 已打包 ${files.length} 个文件，${(zip.length / 1024).toFixed(1)} KB → ${relative(root, out)}`);
