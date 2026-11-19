import { request, getCookie, NotLoggedIn } from '../lib/http.js';
import { fetchImage } from '../lib/images.js';

// CSDN：bizapi 需要阿里云网关签名（key/secret 取自 CSDN 编辑器前端公开代码）
const CA_KEY = '203803574';
const CA_SECRET = '9znpamsyl2c7cdrr9sas0le9vbc3r6ba';

async function sign(method, path, accept, contentType, nonce) {
  const str = `${method}\n${accept}\n\n${contentType}\n\nx-ca-key:${CA_KEY}\nx-ca-nonce:${nonce}\n${path}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(CA_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(str));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function bizPost(path, data, contentType = 'application/json') {
  const nonce = crypto.randomUUID();
  const accept = '*/*';
  return request('https://bizapi.csdn.net' + path, {
    method: 'POST',
    headers: {
      accept,
      'Content-Type': contentType,
      'x-ca-key': CA_KEY,
      'x-ca-nonce': nonce,
      'x-ca-timestamp': String(Date.now()),
      'x-ca-signature-headers': 'x-ca-key,x-ca-nonce',
      'x-ca-signature': await sign('POST', path, accept, contentType, nonce),
    },
    body: JSON.stringify(data),
  });
}

// 两步上传：先取对象存储直传凭据，再把图片 multipart 传到存储 host，返回公网地址
async function uploadImage(src, kind = 'cover') {
  const { blob, ext, name } = await fetchImage(src);
  const imageSuffix = (ext || 'png').toLowerCase();
  const sig = await bizPost('/resource-api/v1/image/direct/upload/signature', {
    appName: kind === 'cover' ? 'direct_blog_coverimage' : 'direct_blog',
    imageTemplate: kind === 'cover' ? '' : 'standard',
    imageSuffix,
  }, 'application/json;charset=UTF-8');
  const d = sig?.data;
  if (sig?.code !== 200 || !d?.host || !d?.filePath || !d?.policy || !d?.signature) {
    throw new Error(sig?.msg || 'CSDN 获取图片上传凭据失败');
  }
  const host = /^https?:\/\//.test(d.host) ? d.host : 'https://' + d.host;
  const form = new FormData();
  form.append('key', d.filePath);
  form.append('policy', d.policy);
  form.append('signature', d.signature);
  form.append('callbackBody', d.callbackBody || '');
  form.append('callbackBodyType', d.callbackBodyType || '');
  if (d.provider === 'obs') {
    form.append('AccessKeyId', d.accessId || '');
    form.append('callbackUrl', d.callbackUrl || '');
  } else {
    form.append('OSSAccessKeyId', d.accessId || '');
    form.append('callback', d.callbackUrl || '');
  }
  for (const [k, v] of Object.entries(d.customParam || {})) form.append('x:' + k, String(v));
  form.append('file', blob, name);
  const up = await request(host, { method: 'POST', form });
  const imageUrl = up?.data?.imageUrl || up?.imageUrl;
  if (!imageUrl) throw new Error('CSDN 图片上传未返回地址');
  return imageUrl;
}

export default {
  id: 'csdn',
  name: 'CSDN',
  home: 'https://passport.csdn.net/login',

  async checkLogin() {
    const name = await getCookie('https://www.csdn.net', 'UserName');
    return name ? { name } : null;
  },

  // prev: 上次同步结果 { id }，带上 id 即更新原文章草稿
  async publish(article, prev) {
    if (!(await this.checkLogin())) throw new NotLoggedIn(this.name);
    const coverSrc = article.cover || article.images?.[0] || '';
    let coverUrl = '';
    const notes = [];
    if (coverSrc) {
      try {
        coverUrl = await uploadImage(coverSrc, 'cover');
        notes.push('已上传封面');
      } catch (e) {
        console.warn('[csdn] 封面上传失败', e);
        notes.push(`封面上传失败：${e.message}`);
      }
    } else {
      notes.push('原文没有可用封面，未设置封面');
    }
    // 正文图片暂不转存：保留公众号原图链接（公众号图片有防盗链，编辑器里可能需要手动替换）
    if (article.images?.length) notes.push(`正文图片未转存（${article.images.length} 张），请在 CSDN 编辑器中重新上传`);
    const data = {
      title: article.title,
      markdowncontent: article.markdown,
      content: article.html,
      readType: 'public',
      level: 0,
      tags: '',
      status: 2,
      categories: '',
      type: 'original',
      original_link: '',
      authorized_status: false,
      Description: article.summary,
      not_auto_saved: '1',
      source: 'pc_mdeditor',
      cover_images: coverUrl ? [coverUrl] : [],
      cover_type: coverUrl ? 1 : 0,
      is_new: 1,
      vote_id: 0,
      resource_id: '',
      pubStatus: 'draft',
    };
    const note = notes.join('；');
    if (prev?.id) {
      try {
        const u = await bizPost('/blog-console-api/v3/mdeditor/saveArticle', { ...data, id: String(prev.id), is_new: 0 });
        if (u.code === 200) {
          const id = u.data?.id || prev.id;
          return { id, updated: true, url: `https://editor.csdn.net/md/?articleId=${id}`, note };
        }
        console.warn('[csdn] 更新草稿失败，改为新建', u);
      } catch (e) {
        console.warn('[csdn] 更新草稿失败，改为新建', e);
      }
    }
    const r = await bizPost('/blog-console-api/v3/mdeditor/saveArticle', data);
    if (r.code !== 200) throw new Error(r.msg || 'CSDN 保存草稿失败');
    return { id: r.data.id, url: `https://editor.csdn.net/md/?articleId=${r.data.id}`, note };
  },
};
