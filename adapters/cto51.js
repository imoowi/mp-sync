import { request, pick, NotLoggedIn } from '../lib/http.js';
import { fetchImage } from '../lib/images.js';

// 51CTO 博客：从发布页取 csrf-token，再提交草稿表单（Markdown）
const BLOG = 'https://blog.51cto.com';

// 封面上传：先取 upload-sign，再取 COS 直传凭据，最后把文件 multipart 直传到 COS
async function uploadCover(src) {
  const { blob, name } = await fetchImage(src);
  const sign = await request(BLOG + '/blogger/upload-sign', {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  const info = sign?.data;
  if (sign?.status !== 1 || !info?.sign || !info?.url) {
    throw new Error(sign?.msg || '51CTO 获取上传签名失败');
  }
  if (info.sizeLimit && blob.size > info.sizeLimit) {
    throw new Error(`封面图片超过 ${info.sizeLimitMessage || info.sizeLimit + ' 字节'}`);
  }
  const oss = await request(BLOG + '/blogger/getoss', {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    form: {
      uploadSign: info.sign,
      ext: blob.type || 'image/png',
      name,
      uploadType: 'image',
    },
  });
  const d = oss?.data;
  if (oss?.status !== 1 || !d?.url || !d?.fields?.key) {
    throw new Error(oss?.msg || '51CTO 获取 OSS 上传凭据失败');
  }
  const form = new FormData();
  for (const [k, v] of Object.entries(d.fields)) form.append(k, v);
  // COS policy 里校验了 Content-Type，必须和文件 MIME 一致
  form.append('content-type', blob.type || 'image/png');
  form.append('file', blob, name);
  await request(d.url, { method: 'POST', form, type: 'text' });
  return info.url.replace(/\/$/, '') + '/' + d.fields.key.replace(/^\//, '');
}

export default {
  id: 'cto51',
  name: '51CTO',
  home: 'https://home.51cto.com/index',

  async meta() {
    const html = await request('https://blog.51cto.com/blogger/publish', { type: 'text' });
    let name = pick(html,
      /"user_?name"\s*:\s*"([^"]+)"/i,
      /"userName"\s*:\s*"([^"]+)"/,
      /"nick_?name"\s*:\s*"([^"]+)"/i,
      /class=["'][^"']*\buser-base\b[^"']*["'][\s\S]{0,500}?<span>\s*([^<]{1,30}?)\s*<\/span>/,
      /class=["'][^"']*\buser-name\b[^"']*["'][^>]*>([^<]{1,30})</,
    ).trim();
    // 发布页上封面选项（单图/三图/无图）等元素的文字也会被 class 匹配到，不能当昵称
    if (/^[单三无多\d]+图$|^封面|^图片$/.test(name) || name.length > 20) name = '';
    return {
      csrf: pick(html, /name="csrf-token"\s+content="([^"]+)"/, /content="([^"]+)"\s+name="csrf-token"/),
      name,
      loggedIn: !/passport\.51cto\.com|home\.51cto\.com\/index\?reback/.test(html),
    };
  },

  async checkLogin() {
    try {
      const m = await this.meta();
      return m.csrf && m.loggedIn ? { name: m.name || '已登录' } : null;
    } catch {
      return null;
    }
  },

  // prev: 上次同步结果 { id }，填入 did 即更新原草稿
  async publish(article, prev) {
    const m = await this.meta();
    if (!m.csrf || !m.loggedIn) throw new NotLoggedIn(this.name);
    const coverSrc = article.cover || article.images?.[0] || '';
    const notes = [];
    let coverUrl = '';
    if (coverSrc) {
      try {
        coverUrl = await uploadCover(coverSrc);
        notes.push('已上传封面');
      } catch (e) {
        console.warn('[cto51] 封面上传失败', e);
        notes.push(`封面上传失败：${e.message}`);
      }
    } else {
      notes.push('原文没有可用封面，未设置封面');
    }
    // 正文图片暂不转存：保留公众号原图链接（公众号图片有防盗链，编辑器里可能需要手动替换）
    if (article.images?.length) notes.push(`正文图片未转存（${article.images.length} 张），请在 51CTO 编辑器中重新上传`);
    const note = notes.join('；');
    const save = (did) => {
      const fields = {
        title: article.title,
        copy_code: '1',
        is_old: '0',
        content: article.markdown,
        pid: '',
        cate_id: '',
        custom_id: '',
        tag: '',
        abstract: article.summary,
        did,
        blog_type: '',
        blog_id: '',
        banner_type: coverUrl ? '1' : '0',
        img_urls: coverUrl ? [coverUrl] : [],
        _csrf: m.csrf,
      };
      const form = new URLSearchParams();
      for (const [k, v] of Object.entries(fields)) {
        if (Array.isArray(v)) v.forEach((x) => form.append(k + '[]', x));
        else form.append(k, v ?? '');
      }
      return request(BLOG + '/blogger/draft', {
        method: 'POST',
        headers: { 'X-CSRF-Token': m.csrf, 'X-Requested-With': 'XMLHttpRequest' },
        body: form,
      });
    };
    let r = null;
    if (prev?.id) {
      try {
        r = await save(String(prev.id));
        if (r.status !== 1) {
          console.warn('[cto51] 更新草稿失败，改为新建', r);
          r = null;
        }
      } catch (e) {
        console.warn('[cto51] 更新草稿失败，改为新建', e);
      }
    }
    const updated = !!r;
    r ||= await save('');
    const id = r.data?.did || r.data?.id || (updated ? prev.id : '');
    if (r.status !== 1 && !id) throw new Error(r.msg || '51CTO 保存草稿失败');
    const url = id ? `https://blog.51cto.com/blogger/draft/${id}` : 'https://blog.51cto.com/creative-center/draft';
    return { id, updated, url, note };
  },
};
