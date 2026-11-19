import { request, getCookie, NotLoggedIn } from '../lib/http.js';
import { rehostImages, imageNote, fetchImage } from '../lib/images.js';

// 搜狐号：草稿接口直接保存（HTML），支持多子账号（默认用第一个）

async function account() {
  try {
    const r = await request(`https://mp.sohu.com/mpbp/bp/account/list?_=${Date.now()}`);
    const acc = (r?.data?.data || []).flatMap((g) => g.accounts || [])[0];
    if (acc?.id) return acc;
  } catch { /* 新版接口失败时退回单账号接口 */ }
  const r = await request(`https://mp.sohu.com/mpbp/bp/account/register-info?_=${Date.now()}`);
  return r?.code === 2000000 && r.data?.account?.id ? r.data.account : null;
}

const deviceId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

async function uploadImage(src, acc) {
  const { blob } = await fetchImage(src);
  const form = new FormData();
  form.append('file', blob, 'image.jpg');
  form.append('accountId', acc.id);
  const r = await request(`https://mp.sohu.com/commons/front/outerUpload/image/file?accountId=${acc.id}`, { method: 'POST', form });
  if (!r?.url) throw new Error(r?.msg || '搜狐号图片上传失败');
  return r.url;
}

export default {
  id: 'sohu',
  name: '搜狐号',
  home: 'https://mp.sohu.com/',

  async checkLogin() {
    try {
      const acc = await account();
      return acc ? { name: acc.nickName || '已登录' } : null;
    } catch {
      return null;
    }
  },

  async publish(article) {
    const acc = await account();
    if (!acc) throw new NotLoggedIn(this.name);
    let html = article.html;
    let cover = '';
    let images = { total: 0, failed: 0 };
    try {
      const source = { ...article, cover: article.cover || article.images?.[0] || '' };
      const r = await rehostImages(source, (src) => uploadImage(src, acc));
      html = r.article.html;
      cover = r.article.cover || '';
      images = r;
    } catch (e) {
      console.warn('[sohu] 图片转存失败', e);
      images = { total: article.images.length, failed: article.images.length };
    }
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      'dv-id': deviceId(),
      'sp-cm': (await getCookie('https://mp.sohu.com', 'mp-cv')) || `100-${Date.now()}-${deviceId()}`,
    };
    const data = {
      title: article.title,
      brief: '',
      content: html,
      channelId: 24,
      categoryId: -1,
      id: 0,
      userColumnId: 0,
      columnNewsIds: [],
      businessCode: 0,
      declareOriginal: false,
      cover,
      topicIds: [],
      isAd: 0,
      userLabels: '[]',
      reprint: false,
      customTags: '',
      infoResource: 0,
      sourceUrl: '',
      visibleToLoginedUsers: 0,
      attrIds: [],
      auto: true,
      accountId: Number(acc.id),
    };
    // 新版 v2 接口（JSON）；失败时退回旧版接口（表单）
    let id = '';
    try {
      const r = await request(`https://mp.sohu.com/mpbp/bp/news/v4/news/draft/v2?accountId=${acc.id}`, {
        method: 'POST', headers, json: data,
      });
      if (!r?.success) throw new Error(r?.msg || '搜狐号保存草稿失败');
      id = r.data;
    } catch (e) {
      console.warn('[sohu] v2 草稿接口失败，尝试旧接口', e);
      // 旧接口只接受表单且没有数组字段
      const { columnNewsIds, topicIds, attrIds, ...rest } = data;
      const r = await request(`https://mp.sohu.com/mpbp/bp/news/v4/news/draft?accountId=${acc.id}`, {
        method: 'POST', headers, form: rest,
      });
      if (!r?.success) throw new Error(r?.msg || '搜狐号保存草稿失败');
      id = r.data;
    }
    return {
      id,
      url: `https://mp.sohu.com/mpfe/v4/contentManagement/news/addarticle?spm=smmp.articlelist.0.0&contentStatus=2&id=${id}`,
      note: imageNote(images),
    };
  },
};
