import { request, NotLoggedIn } from '../lib/http.js';
import { fetchImage, rehostImages, imageNote } from '../lib/images.js';

// 简书：作者后台接口。新建文章 → 写入内容；图片下载后上传到简书图床（七牛）
const JS = 'https://www.jianshu.com';
const headers = { Accept: 'application/json' };

export default {
  id: 'jianshu',
  name: '简书',
  home: 'https://www.jianshu.com/sign_in',

  async checkLogin() {
    try {
      const r = await request(JS + '/author/current_user', { headers });
      return r?.nickname ? { name: r.nickname } : null;
    } catch {
      return null;
    }
  },

  // 用户默认编辑器是 Markdown 时写入 Markdown，否则写入 HTML（富文本）
  async isMarkdown() {
    try {
      const r = await request(JS + '/settings/basic.json', { headers });
      return (r?.data?.preferred_note_type || r?.preferred_note_type) === 'markdown';
    } catch {
      return false;
    }
  },

  // prev: 上次同步结果 { id, notebookId }，存在时更新原文章，失败再新建
  async publish(article, prev) {
    if (!(await this.checkLogin())) throw new NotLoggedIn(this.name);
    // 简书的「抓取外链图片」接口由简书服务器去下载图片，会被公众号防盗链拦截（返回 500）；
    // 改为插件自己下载，再按简书编辑器的流程上传：先取七牛上传凭证，再直传七牛
    const images = await rehostImages(article, async (src) => {
      const { blob, name } = await fetchImage(src);
      const t = await request(`${JS}/upload_images/token.json?filename=${encodeURIComponent(name)}`, { headers });
      if (!t?.token || !t?.key) throw new Error('获取简书图片上传凭证失败');
      const form = new FormData();
      form.append('token', t.token);
      form.append('key', t.key);
      form.append('x:protocol', 'https');
      form.append('file', blob, name);
      const r = await request('https://upload.qiniup.com/', { method: 'POST', form });
      return r?.url;
    });
    article = images.article;
    const content = (await this.isMarkdown()) ? article.markdown : article.html;
    const note = imageNote(images);

    const write = (id) => request(`${JS}/author/notes/${id}`, {
      method: 'PUT',
      headers,
      json: { id, autosave_control: Date.now(), title: article.title, content },
    });
    const editUrl = (nb, id) => `${JS}/writer#/notebooks/${nb}/notes/${id}`;

    if (prev?.id && prev?.notebookId) {
      try {
        await write(prev.id);
        return { id: prev.id, notebookId: prev.notebookId, updated: true, url: editUrl(prev.notebookId, prev.id), note };
      } catch (e) {
        console.warn('[jianshu] 更新文章失败，改为新建', e);
      }
    }

    const notebooks = await request(JS + '/author/notebooks', { headers });
    const nb = notebooks?.[0]?.id;
    if (!nb) throw new Error('简书：没有找到文集，请先在简书创建一个文集');
    const created = await request(JS + '/author/notes', {
      method: 'POST',
      headers,
      json: { notebook_id: nb, title: article.title, at_bottom: false },
    });
    if (!created?.id) throw new Error('简书新建文章失败');
    await write(created.id);
    return { id: created.id, notebookId: nb, url: editUrl(nb, created.id), note };
  },
};
