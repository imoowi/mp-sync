import { request, getCookie, NotLoggedIn } from '../lib/http.js';
import { rehostImages, imageNote, fetchImage } from '../lib/images.js';

// 哔哩哔哩专栏：草稿接口直接保存（HTML），图片必须转存到 B 站自家图床，否则正文不显示
const API = 'https://api.bilibili.com';

async function nav() {
  const r = await request(`${API}/x/web-interface/nav?build=0&mobi_app=web`);
  return r?.code === 0 && r.data?.isLogin ? r.data : null;
}

async function uploadImage(src, csrf) {
  const { blob } = await fetchImage(src);
  const form = new FormData();
  form.append('binary', blob, 'image.jpg');
  form.append('csrf', csrf);
  const r = await request(`${API}/x/article/creative/article/upcover`, { method: 'POST', form });
  if (r?.code !== 0 || !r.data?.url) throw new Error(r?.message || 'B站图片上传失败');
  return r.data.url;
}

export default {
  id: 'bilibili',
  name: '哔哩哔哩',
  home: 'https://member.bilibili.com/platform/upload/text',

  async checkLogin() {
    try {
      const u = await nav();
      return u ? { name: u.uname } : null;
    } catch {
      return null;
    }
  },

  async publish(article) {
    const u = await nav();
    if (!u) throw new NotLoggedIn(this.name);
    const csrf = await getCookie('https://www.bilibili.com', 'bili_jct');
    if (!csrf) throw new Error('B站：未找到 bili_jct 登录凭证，请刷新 B 站任意页面后重试');
    const notes = [];
    let title = article.title;
    if (title.length > 40) {
      title = title.slice(0, 40);
      notes.push('标题超过 40 字，已截断');
    }
    let html = article.html;
    let cover = '';
    let images = { total: 0, failed: 0 };
    try {
      // 专栏支持独立封面：优先用原文封面，没有时用正文第一张图
      const source = { ...article, cover: article.cover || article.images?.[0] || '' };
      const r = await rehostImages(source, (src) => uploadImage(src, csrf), undefined, { uploadCoverAlways: true });
      html = r.article.html;
      cover = r.article.cover || '';
      images = r;
    } catch (e) {
      console.warn('[bilibili] 图片转存失败', e);
      images = { total: article.images.length, failed: article.images.length };
    }
    // B 站只接受自家 CDN 的图片，外链图片会显示不出来，直接去掉
    html = html.replace(/<img\b[^>]*>/gi, (tag) => (/hdslb\.com|biliimg\.com|bilibili\.com/.test(tag) ? tag : ''));
    const r = await request(`${API}/x/article/creative/draft/addupdate`, {
      method: 'POST',
      form: {
        tid: 4,
        title,
        content: html,
        csrf,
        save: 0,
        pgc_id: 0,
        ...(cover ? { image_urls: cover } : {}),
      },
    });
    if (r?.code !== 0 || !r.data?.aid) throw new Error(`B站保存草稿失败：${r?.message || r?.code}`);
    if (cover) notes.push('已上传封面');
    return {
      id: r.data.aid,
      url: `https://member.bilibili.com/platform/upload/text/edit?aid=${r.data.aid}`,
      note: [imageNote(images), ...notes].filter(Boolean).join('；'),
    };
  },
};
