import { request } from '../lib/http.js';
import { fillInTab } from '../lib/fill.js';

// 百家号：打开图文编辑器（UEditor，正文在 iframe 中）自动填充后点「存草稿」
// 把 <pre><code class="language-x"> 转成百家号编辑器自己的代码块：
// <div data-bjh-box="codeBlock" data-bjh-payload='{"lang":"go","content":"原始代码\n"}'>
// 编辑器读取 payload 渲染代码块，内部的 CodeMirror 结构由它自己生成
const unescape = (s) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function bjhCode(html) {
  return html.replace(/<pre[^>]*>\s*<code([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/g, (_, attrs, body) => {
    const lang = ((attrs.match(/language-([\w+#-]+)/) || [])[1] || 'plaintext').toLowerCase();
    const content = unescape(body).replace(/\n+$/, '') + '\n';
    return `<div data-bjh-box="codeBlock" data-bjh-payload="${attr(JSON.stringify({ lang, content }))}"></div>`;
  });
}

export default {
  id: 'baijiahao',
  name: '百家号',
  home: 'https://baijiahao.baidu.com/',

  async checkLogin() {
    try {
      const r = await request('https://baijiahao.baidu.com/builder/app/appinfo');
      const name = r?.data?.user?.name || r?.data?.user?.username;
      return name ? { name } : null;
    } catch (e) {
      console.warn('[baijiahao] appinfo', e);
      return null;
    }
  },

  publish(article) {
    return fillInTab(this.name, { ...article, html: bjhCode(article.html) }, {
      url: 'https://baijiahao.baidu.com/builder/rc/edit?type=news',
      loginRe: /login|passport/,
      // 百家号标题是带 placeholder 的输入框或 contenteditable 的 div，类名多次改版，这里尽量多覆盖
      titleSel: [
        'textarea[placeholder*="标题"]',
        'input[placeholder*="标题"]',
        '[contenteditable="true"][placeholder*="标题"]',
        '[contenteditable="true"][data-placeholder*="标题"]',
        '.client_pages_edit_components_titleInput [contenteditable="true"]',
        '[class*="titleInput"] [contenteditable="true"]',
        '[class*="title-input"] [contenteditable="true"]',
        '[class*="titleInput"] textarea',
        '[class*="title"] textarea',
      ].join(', '),
      bodySel: 'iframe#ueditor_0, iframe[id^="ueditor"], .ProseMirror, .ql-editor',
      saveRe: /^(存草稿|保存草稿)$/,
      // 封面：选「单图」→ 点封面区域 → 「本地上传」，然后写入上传框
      coverClickRe: [/^单图$/, /^(选择封面|添加封面|上传封面|\+)$/, /^(本地上传|上传图片|本地图片)$/],
    });
  },
};
