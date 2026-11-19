import { request, pick, findKey, getCookie, NotLoggedIn } from '../lib/http.js';
import { fetchImage, rehostImages, imageNote } from '../lib/images.js';

// 思否：Next.js 站点，登录信息与网关 token 在 __NEXT_DATA__ 或内联脚本中
export default {
  id: 'segmentfault',
  name: '思否',
  home: 'https://segmentfault.com/user/login',

  async token() {
    const html = await request('https://segmentfault.com/write', { type: 'text' });
    let data = null;
    const raw = pick(html, /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (raw) {
      try { data = JSON.parse(raw); } catch { /* ignore */ }
    }
    const token = (data && findKey(data, /^(token|accessToken|Token)$/))
      || pick(html, /"(?:accessToken|token|Token)"\s*:\s*"([^"]+)"/, /token\s*=\s*['"]([^'"]{16,})['"]/);
    const user = (data && (findKey(data?.props?.pageProps?.sessionUser, /^(name|nickname|slug)$/)
        || findKey(data?.props?.pageProps?.user, /^(name|nickname|slug)$/)))
      || pick(html, /"sessionUser"\s*:\s*\{[\s\S]*?"name"\s*:\s*"([^"]+)"/);
    const redirectedToLogin = /\/user\/login/.test(html.slice(0, 2000)) && !user;
    return { token, user, redirectedToLogin };
  },

  async checkLogin() {
    try {
      const { token, user, redirectedToLogin } = await this.token();
      if (user) return { name: user };
      if (token && !redirectedToLogin) return { name: '已登录' };
    } catch (e) {
      console.warn('[segmentfault] checkLogin', e);
    }
    // 兜底：存在登录 cookie 即视为已登录
    const remember = await getCookie('https://segmentfault.com', 'sf_remember');
    return remember ? { name: '已登录' } : null;
  },

  // prev: 上次同步结果 { id }，存在时 PUT 更新原草稿，失败再新建
  async publish(article, prev) {
    const { token } = await this.token();
    if (!token) throw new NotLoggedIn(this.name);
    const images = await rehostImages(article, async (src) => {
      const { blob, name } = await fetchImage(src);
      const form = new FormData();
      form.append('image', blob, name);
      const r = await request('https://segmentfault.com/gateway/image', { method: 'POST', headers: { token }, form });
      const url = r.url || r.data?.url || (Array.isArray(r) ? r[1] : '');
      return url && url.startsWith('/') ? 'https://segmentfault.com' + url : url;
    });
    article = images.article;
    const data = { title: article.title, tags: [], text: article.markdown, object_id: '', type: 'article' };
    const note = imageNote(images);
    if (prev?.id) {
      try {
        await request(`https://segmentfault.com/gateway/draft/${prev.id}`, { method: 'PUT', headers: { token }, json: data });
        return { id: prev.id, updated: true, url: `https://segmentfault.com/write?draftId=${prev.id}`, note };
      } catch (e) {
        console.warn('[segmentfault] 更新草稿失败，改为新建', e);
      }
    }
    const r = await request('https://segmentfault.com/gateway/draft', { method: 'POST', headers: { token }, json: data });
    const id = r.id || r.data?.id;
    if (!id) throw new Error(r.msg || r.message || '思否保存草稿失败');
    return { id, url: `https://segmentfault.com/write?draftId=${id}`, note };
  },
};
