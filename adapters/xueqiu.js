import { request, NotLoggedIn } from '../lib/http.js';
import { rehostImages, imageNote, fetchImage } from '../lib/images.js';
import { md2html } from '../lib/md2html.js';

// 雪球：草稿接口直接保存（HTML）。用精简过的 HTML（由 Markdown 转换），避免公众号排版结构干扰编辑器
async function currentUser() {
  const html = await request('https://mp.xueqiu.com/writeV2', { type: 'text' });
  const m = html.match(/window\.UOM_CURRENTUSER\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
  if (m) {
    try {
      const u = JSON.parse(m[1]).currentUser;
      if (u?.id) return u;
    } catch { /* 结构有变化时退回正则 */ }
  }
  const id = (html.match(/"currentUser"\s*:\s*\{[^}]*"id"\s*:\s*"?(\d+)"?/) || [])[1];
  const name = (html.match(/"screen_name"\s*:\s*"([^"]+)"/) || [])[1];
  return id ? { id, screen_name: name || '' } : null;
}

async function uploadImage(src) {
  const { blob } = await fetchImage(src);
  const form = new FormData();
  form.append('file', blob, 'image.jpg');
  const r = await request('https://mp.xueqiu.com/xq/photo/upload.json', { method: 'POST', form });
  if (!r?.url || !r?.filename) throw new Error('雪球图片上传失败');
  const base = r.url.startsWith('//') ? `https:${r.url}` : r.url;
  return `${base}/${r.filename}`;
}

export default {
  id: 'xueqiu',
  name: '雪球',
  home: 'https://mp.xueqiu.com/writeV2',

  async checkLogin() {
    try {
      const u = await currentUser();
      return u ? { name: u.screen_name || '已登录' } : null;
    } catch {
      return null;
    }
  },

  async publish(article) {
    const u = await currentUser();
    if (!u) throw new NotLoggedIn(this.name);
    let md = article.markdown;
    let cover = '';
    let images = { total: 0, failed: 0 };
    try {
      const source = { ...article, cover: article.cover || article.images?.[0] || '' };
      const r = await rehostImages(source, uploadImage);
      md = r.article.markdown;
      cover = r.article.cover || '';
      images = r;
    } catch (e) {
      console.warn('[xueqiu] 图片转存失败', e);
      images = { total: article.images.length, failed: article.images.length };
    }
    const html = md2html(md).replace(/<img\b([^>]*)>/g, '<img$1 class="ke_img">');
    const r = await request('https://mp.xueqiu.com/xq/statuses/draft/save.json', {
      method: 'POST',
      form: {
        text: html,
        title: article.title,
        cover_pic: cover,
        flags: 'false',
        original_event: '',
        status_id: '',
        legal_user_visible: 'false',
        is_private: 'false',
      },
    });
    if (!r?.id) throw new Error(r?.error_description || '雪球保存草稿失败');
    return {
      id: r.id,
      url: `https://mp.xueqiu.com/write/draft/${r.id}`,
      note: imageNote(images),
    };
  },
};
