import { request, getCookie } from '../lib/http.js';
import { fillInTab } from '../lib/fill.js';

// 今日头条（头条号）：打开图文编辑器自动填充，编辑器会自动保存草稿
export default {
  id: 'toutiao',
  name: '今日头条',
  home: 'https://mp.toutiao.com/',

  async checkLogin() {
    try {
      const r = await request('https://mp.toutiao.com/mp/agw/media/get_media_info');
      const name = r?.data?.user?.screen_name || r?.data?.media?.name;
      if (name) return { name };
    } catch (e) {
      console.warn('[toutiao] media_info', e);
    }
    return (await getCookie('https://mp.toutiao.com', 'sessionid')) ? { name: '已登录' } : null;
  },

  publish(article) {
    return fillInTab(this.name, article, {
      url: 'https://mp.toutiao.com/profile_v4/graphic/publish',
      loginRe: /login|passport|auth\/page/,
      titleSel: 'textarea[placeholder*="标题"], input[placeholder*="标题"]',
      bodySel: '.ProseMirror, [contenteditable="true"]',
      saveRe: /^(存草稿|保存草稿)$/,
      // 封面区域默认单图；点「预览」打开封面选择弹窗，再写入其中隐藏的图片上传框
      coverClickRe: [/^单图$/, /^预览$/],
    });
  },
};
