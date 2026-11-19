import { request, getCookie, NotLoggedIn } from '../lib/http.js';

// 知乎专栏：HTML 草稿；图片通过 uploaded_images 接口转存（可绕过公众号防盗链）
export default {
  id: 'zhihu',
  name: '知乎',
  home: 'https://www.zhihu.com/signin',

  async checkLogin() {
    try {
      const r = await request('https://www.zhihu.com/api/v4/me');
      return r?.name ? { name: r.name, avatar: r.avatar_url } : null;
    } catch {
      return null;
    }
  },

  async headers() {
    return { 'x-xsrftoken': await getCookie('https://www.zhihu.com', '_xsrf') };
  },

  async uploadImage(src) {
    const r = await request('https://zhuanlan.zhihu.com/api/uploaded_images', {
      method: 'POST',
      headers: await this.headers(),
      form: { image_url: src, source: 'article' },
    });
    return r.src;
  },

  // prev: 上次同步结果 { id }，存在时直接 PATCH 原草稿，失败再新建
  async publish(article, prev) {
    if (!(await this.checkLogin())) throw new NotLoggedIn(this.name);
    const headers = await this.headers();

    let html = article.html;
    let titleImage = '';
    for (const src of new Set([...article.images, article.cover].filter(Boolean))) {
      try {
        const url = await this.uploadImage(src);
        if (url) html = html.split(src).join(url);
        if (url && src === article.cover) titleImage = url;
      } catch (e) {
        console.warn('[zhihu] 图片转存失败', src, e);
      }
    }

    const patch = (id) => request(`https://zhuanlan.zhihu.com/api/articles/${id}/draft`, {
      method: 'PATCH',
      headers,
      json: { title: article.title, content: html, delta_time: 0, ...(titleImage ? { titleImage, isTitleImageFullScreen: false } : {}) },
      type: 'text',
    });
    if (prev?.id) {
      try {
        await patch(prev.id);
        return { id: prev.id, updated: true, url: `https://zhuanlan.zhihu.com/p/${prev.id}/edit` };
      } catch (e) {
        console.warn('[zhihu] 更新草稿失败，改为新建', e);
      }
    }
    const draft = await request('https://zhuanlan.zhihu.com/api/articles/drafts', {
      method: 'POST',
      headers,
      json: { title: article.title, delta_time: 0 },
    });
    await patch(draft.id);
    return { id: draft.id, url: `https://zhuanlan.zhihu.com/p/${draft.id}/edit` };
  },
};
