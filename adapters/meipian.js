import { loginFromTab } from '../lib/login.js';
import { fillInTab } from '../lib/fill.js';

// 美篇：网页版编辑器自动填充；美篇以 App 为主，网页写作入口可能变动，失败时正文会复制到剪贴板
export default {
  id: 'meipian',
  name: '美篇',
  home: 'https://www.meipian.cn/',

  // 美篇的登录凭证不在 Cookie 里，而是存在网页的 localStorage 中（userInfo / app_token），
  // 只能从美篇页面里读取；没有打开的美篇页面时后台临时打开首页读一次（见 lib/login.js）
  async checkLogin() {
    const r = await loginFromTab('https://*.meipian.cn/*', 'https://www.meipian.cn/');
    if (r) return r;
    // 兜底：网页 localStorage 被清过但登录 Cookie 还在
    const cookies = await chrome.cookies.getAll({ domain: 'meipian.cn' }).catch(() => []);
    if (cookies.some((c) => /token|session|passport|auth/i.test(c.name) && c.value?.length >= 10)) return { name: '已登录' };
    return r === undefined ? { name: '打开后确认' } : null;
  },

  // 美篇编辑器没有「存草稿」按钮：点「返回文章列表」会弹出「是否保存草稿？」，点「保存草稿」即可
  // 保存后的文章在「我的文章」页的「N 篇草稿待完成」里
  publish(article) {
    return fillInTab(this.name, article, {
      url: 'https://www.meipian.cn/editor?from=mine',
      loginRe: /login|passport/,
      titleSel: 'textarea[placeholder*="标题"], input[placeholder*="标题"], [contenteditable="true"][placeholder*="标题"]',
      bodySel: '.ProseMirror, .ql-editor, [contenteditable="true"]',
      // 封面：点「更换封面」打开弹窗，弹窗里的「上传封面」背后是图片上传框，直接写入文件即可
      // （不点「上传封面」，否则会弹出系统文件选择框）；上传后选中新图并点「确定」
      coverClickRe: [/^更换封面$/],
      saveEnterRe: [/^返回文章列表$/],
      saveRe: /^保存草稿$/,
    }).then((r) => ({
      ...r,
      url: 'https://www.meipian.cn/mine',
      note: `已保存为美篇草稿，可在「我的文章」→「草稿待完成」中找到；${r.note}`,
    }));
  },
};
