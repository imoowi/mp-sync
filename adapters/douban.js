import { getCookie } from '../lib/http.js';
import { fillInTab } from '../lib/fill.js';

// 豆瓣日记：打开写日记页面自动填充（豆瓣会自动保存草稿）
export default {
  id: 'douban',
  name: '豆瓣',
  home: 'https://accounts.douban.com/passport/login',

  async checkLogin() {
    // dbcl2 形如 "123456:xxxx"，登录后才有
    const v = await getCookie('https://www.douban.com', 'dbcl2');
    return v ? { name: '已登录' } : null;
  },

  publish(article) {
    return fillInTab(this.name, article, {
      url: 'https://www.douban.com/note/create',
      loginRe: /accounts\.douban\.com|passport/,
      titleSel: 'textarea[name="note_title"], input[name="note_title"], [placeholder*="标题"]',
      bodySel: '.DraftEditor-root [contenteditable="true"], .ProseMirror, [contenteditable="true"]',
      // 豆瓣的保存按钮是「草稿箱」右边的一个软盘图标，没有文字，按提示文字或图标类名定位
      saveSel: [
        '[title*="保存"]', '[aria-label*="保存"]', '[data-tooltip*="保存"]', '[data-tip*="保存"]',
        '[class*="save"]:not([class*="saved"])',
      ].join(', '),
      saveRe: /^(存草稿|保存草稿|保存)$/,
    }).then((r) => ({
      ...r,
      url: 'https://www.douban.com/note/create',
      note: `已保存到豆瓣草稿箱（写日记页右上角「草稿箱」）；${r.note}`,
    }));
  },
};
