import { request, NotLoggedIn } from '../lib/http.js';
import { rehostImages, imageNote, fetchImage } from '../lib/images.js';

// 人人都是产品经理：草稿接口直接保存（HTML）；图片上传需要页面里的 jltoken
async function session() {
  const html = await request('https://www.woshipm.com/writing', { type: 'text' });
  const uid = (html.match(/var\s+userSettings\s*=\s*\{[^}]*"uid"\s*:\s*"(\d+)"/) || [])[1];
  const jltoken = (html.match(/"jltoken"\s*:\s*"([^"]+)"/) || [])[1] || '';
  if (!uid) return null;
  const r = await request(`https://www.woshipm.com/api2/user/profile?uid=${uid}`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  const u = r?.RESULT?.userInfoVo;
  return r?.CODE === 200 && u?.uid ? { uid, jltoken, name: u.nickName || '' } : null;
}

async function uploadImage(src, jltoken) {
  const { blob, name } = await fetchImage(src);
  const form = new FormData();
  form.append('action', 'wpuf_insert_image');
  form.append('name', name);
  form.append('files', blob, name);
  const r = await request('https://www.woshipm.com/tensorflow/upyun/upload', {
    method: 'POST',
    form,
    headers: {
      Origin: 'https://www.woshipm.com',
      Referer: 'https://www.woshipm.com/writing',
      ...(jltoken ? { jlstar: `Bearer ${jltoken}` } : {}),
    },
  });
  const url = r?.data?.[0]?.url;
  if (!url) throw new Error(r?.error || '人人都是产品经理图片上传失败');
  return url;
}

export default {
  id: 'woshipm',
  name: '人人都是产品经理',
  home: 'https://www.woshipm.com/writing',

  async checkLogin() {
    try {
      const s = await session();
      return s ? { name: s.name || '已登录' } : null;
    } catch {
      return null;
    }
  },

  async publish(article) {
    const s = await session();
    if (!s) throw new NotLoggedIn(this.name);
    let html = article.html;
    let images = { total: 0, failed: 0 };
    try {
      const r = await rehostImages(article, (src) => uploadImage(src, s.jltoken));
      html = r.article.html;
      images = r;
    } catch (e) {
      console.warn('[woshipm] 图片转存失败', e);
      images = { total: article.images.length, failed: article.images.length };
    }
    const r = await request('https://www.woshipm.com/wp-admin/admin-ajax.php', {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      form: { action: 'add_draft', post_title: article.title, post_content: html },
      type: 'text',
    });
    let data;
    try {
      data = JSON.parse(r);
    } catch {
      throw new Error(`人人都是产品经理：保存草稿返回异常（${String(r).slice(0, 100)}）`);
    }
    if (!data.post_id) throw new Error(data.error || '人人都是产品经理保存草稿失败');
    return {
      id: String(data.post_id),
      url: data.url || `https://www.woshipm.com/writing?pid=${data.post_id}`,
      note: imageNote(images),
    };
  },
};
