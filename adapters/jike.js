import { fillInTab } from '../lib/fill.js';
import { loginFromTab } from '../lib/login.js';

// 即刻：没有长文和草稿，只能发短动态。打开网页版，把「标题 + 摘要 + 原文链接」填入输入框，由用户自己点发送
const MAX = 900;

export default {
  id: 'jike',
  name: '即刻',
  home: 'https://web.okjike.com/login',

  // 即刻网页版的登录令牌存在页面 localStorage 中（JK_ACCESS_TOKEN），后台读不到，
  // 只能从即刻页面里读取；没有打开的即刻页面时后台临时打开首页读一次（见 lib/login.js）
  async checkLogin() {
    const r = await loginFromTab('https://*.okjike.com/*', 'https://web.okjike.com/');
    if (r) return r;
    // 兜底：网页 localStorage 里没有令牌时，再看 Cookie 里是否有登录 token
    const cookies = await chrome.cookies.getAll({ domain: 'okjike.com' }).catch(() => []);
    if (cookies.some((c) => /token|session/i.test(c.name) && c.value)) return { name: '已登录' };
    return r === undefined ? { name: '打开后确认' } : null;
  },

  publish(article) {
    const link = article.url ? `\n\n原文：${article.url}` : '';
    let text = `【${article.title}】\n\n${(article.summary || '').trim()}`;
    text = text.slice(0, MAX - link.length) + link;
    return fillInTab(this.name, article, {
      url: 'https://web.okjike.com/',
      loginRe: /\/login/,
      bodySel: 'textarea[placeholder], [contenteditable="true"]',
      mode: 'text',
      text,
    }).then((r) => ({ ...r, note: '即刻没有草稿：已填好动态内容，请在页面中确认后自己点发送' }));
  },
};
