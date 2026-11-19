// 图片转存：把正文中的公众号图片上传到目标平台图床，并替换 markdown / html 中的地址
// 公众号图片按 Referer 防盗链，后台请求的 Referer 已在 background.js 中改写为 mp.weixin.qq.com

const isWechat = (src) => /^https?:\/\/[^/]*qpic\.cn\//.test(src);

export async function fetchImage(src) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`下载图片失败 HTTP ${res.status}`);
  const blob = await res.blob();
  const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  return { blob, ext, name: `image.${ext}` };
}

// upload(src) 返回新地址；失败的图片保留原地址
// 封面（article.cover）一并转存；转存失败时清空，避免平台引用被防盗链的封面
export async function rehostImages(article, upload, uploadCover = upload, options = {}) {
  const srcs = [...new Set(article.images.filter((s) => s && isWechat(s)))];
  let { markdown, html, cover } = article;
  let failed = 0;
  const uploaded = new Map();
  for (const src of srcs) {
    try {
      const url = await upload(src);
      if (!url) throw new Error('上传接口未返回地址');
      uploaded.set(src, url);
      markdown = markdown.split(src).join(url);
      html = html.split(src).join(url).split(src.replace(/&/g, '&amp;')).join(url);
    } catch (e) {
      failed++;
      console.warn('[images] 转存失败', src, e);
    }
  }
  const coverSrc = cover && (options.uploadCoverAlways || isWechat(cover)) ? cover : '';
  const separateCoverUpload = uploadCover !== upload || !uploaded.has(coverSrc);
  const total = srcs.length + (coverSrc && separateCoverUpload ? 1 : 0);
  if (coverSrc) {
    try {
      const url = separateCoverUpload ? await uploadCover(coverSrc) : uploaded.get(coverSrc);
      if (!url) throw new Error('封面上传接口未返回地址');
      cover = url;
    } catch (e) {
      failed++;
      cover = '';
      console.warn('[images] 封面转存失败', coverSrc, e);
      if (options.throwOnCoverFailure) {
        throw new Error(`封面图片上传失败：${e?.message || e}`);
      }
    }
  }
  return { article: { ...article, markdown, html, cover }, total, failed };
}

// 给发布结果附加转存说明
export function imageNote(r) {
  if (!r.total) return '';
  return r.failed ? `图片转存 ${r.total - r.failed}/${r.total} 成功，失败的仍为公众号外链` : `已转存 ${r.total} 张图片`;
}

// ---- 签名 / 校验工具 ----

const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(data) {
  return hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));
}

export async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}

let crcTable;
export function crc32(buf) {
  crcTable ||= Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const b of new Uint8Array(buf)) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}
