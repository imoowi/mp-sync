import { request, NotLoggedIn } from '../lib/http.js';
import { fetchImage, rehostImages, imageNote, sha256Hex, hmac, crc32 } from '../lib/images.js';

// 掘金图床为字节 ImageX：先取临时凭证，再 Apply → PUT 上传 → Commit，最后换取可访问地址
const IMAGEX = 'https://imagex.bytedanceapi.com/';
const SERVICE_ID = 'k3u1fbpfcp';

// 火山引擎 / ImageX 的 AWS4 风格签名
async function imagex(action, cred, { method = 'GET', query = {}, body = '' } = {}) {
  const q = { Action: action, Version: '2018-08-01', ServiceId: SERVICE_ID, ...query };
  const qs = Object.keys(q).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(q[k])}`).join('&');
  const now = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
  const date = now.slice(0, 8);
  const scope = `${date}/cn-north-1/imagex/aws4_request`;
  const headers = { 'x-amz-date': now, 'x-amz-security-token': cred.SessionToken };
  const signed = Object.keys(headers).sort();
  const canonical = [method, '/', qs, signed.map((h) => `${h}:${headers[h]}\n`).join(''), signed.join(';'), await sha256Hex(body)].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', now, scope, await sha256Hex(canonical)].join('\n');
  let key = await hmac('AWS4' + cred.SecretAccessKey, date);
  for (const part of ['cn-north-1', 'imagex', 'aws4_request']) key = await hmac(key, part);
  const sig = Array.from(new Uint8Array(await hmac(key, toSign)), (b) => b.toString(16).padStart(2, '0')).join('');
  const res = await fetch(IMAGEX + '?' + qs, {
    method,
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${cred.AccessKeyId}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${sig}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body || undefined,
  });
  const r = await res.json();
  if (r.ResponseMetadata?.Error) throw new Error(`ImageX ${action}: ${r.ResponseMetadata.Error.Message}`);
  return r.Result;
}

async function uploadImage(src, cred) {
  const { blob } = await fetchImage(src);
  const buf = await blob.arrayBuffer();
  const apply = await imagex('ApplyImageUpload', cred);
  const addr = apply.UploadAddress;
  const store = addr.StoreInfos[0];
  const put = await fetch(`https://${addr.UploadHosts[0]}/${store.StoreUri}`, {
    method: 'PUT',
    headers: { Authorization: store.Auth, 'Content-CRC32': crc32(buf), 'Content-Type': 'application/octet-stream' },
    body: buf,
  });
  if (!put.ok) throw new Error(`上传图片失败 HTTP ${put.status}`);
  await imagex('CommitImageUpload', cred, {
    method: 'POST',
    query: { SessionKey: addr.SessionKey },
    body: JSON.stringify({ SessionKey: addr.SessionKey }),
  });
  const r = await request(`https://api.juejin.cn/imagex/v2/get_img_url?aid=2608&uri=${encodeURIComponent(store.StoreUri)}&img_type=private`);
  return r.data?.main_url || r.data?.backup_url;
}

// 掘金：草稿接口（Markdown）
export default {
  id: 'juejin',
  name: '掘金',
  home: 'https://juejin.cn/',

  async checkLogin() {
    const r = await request('https://api.juejin.cn/user_api/v1/user/get');
    if (r.err_no !== 0 || !r.data) return null;
    return { name: r.data.user_name, avatar: r.data.avatar_large };
  },

  // prev: 上次同步结果 { id }，存在时更新原草稿，失败（如草稿已删除）再新建
  async publish(article, prev) {
    if (!(await this.checkLogin())) throw new NotLoggedIn(this.name);
    let images = { total: 0 };
    try {
      const t = await request('https://api.juejin.cn/imagex/v2/gen_token?aid=2608&client=web');
      const cred = t.data?.token;
      if (!cred) throw new Error(t.err_msg || '获取图片上传凭证失败');
      images = await rehostImages(article, (src) => uploadImage(src, cred));
      article = images.article;
    } catch (e) {
      console.warn('[juejin] 图片转存失败', e);
      images = { total: article.images.length, failed: article.images.length };
    }
    const data = {
      category_id: '0',
      tag_ids: [],
      link_url: '',
      cover_image: images.article ? article.cover || '' : '', // 只用已转存的封面
      title: article.title,
      brief_content: article.summary.slice(0, 100),
      edit_type: 10,
      html_content: 'deprecated',
      mark_content: article.markdown,
      theme_ids: [],
    };
    const note = imageNote(images);
    if (prev?.id) {
      try {
        const u = await request('https://api.juejin.cn/content_api/v1/article_draft/update', {
          method: 'POST',
          json: { id: prev.id, ...data },
        });
        if (u.err_no === 0) return { id: prev.id, updated: true, url: `https://juejin.cn/editor/drafts/${prev.id}`, note };
        console.warn('[juejin] 更新草稿失败，改为新建', u);
      } catch (e) {
        console.warn('[juejin] 更新草稿失败，改为新建', e);
      }
    }
    const r = await request('https://api.juejin.cn/content_api/v1/article_draft/create', { method: 'POST', json: data });
    if (r.err_no !== 0) throw new Error(r.err_msg || '掘金创建草稿失败');
    return { id: r.data.id, url: `https://juejin.cn/editor/drafts/${r.data.id}`, note };
  },
};
