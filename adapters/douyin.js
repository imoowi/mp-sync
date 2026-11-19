import { getCookie } from '../lib/http.js';
import { fillInTab } from '../lib/fill.js';

// 抖音：没有可用的发布接口，打开创作者中心编辑器自动填充。
// - 正文有 ≥2 张图片：走「图文」（先上传图片，标题/描述框才会出现，点「暂存离开」存草稿）
// - 没有配图：走「文章」形式（标题 + 正文，不强制配图）
// 文章编辑器不在发布页的 default-tab 里：default-tab=4 现在是「发布全景视频」，
// 文章要先从发布页点「我要发文」，对应下面这个独立路由。
const ARTICLE_EDITOR = 'https://creator.douyin.com/creator-micro/content/post/article'
  + '?default-tab=4&enter_from=publish_page&media_type=article&type=new';

export default {
  id: 'douyin',
  name: '抖音图文',
  home: 'https://creator.douyin.com/',

  async checkLogin() {
    // 创作者中心的登录会话是 sessionid / sid_guard Cookie
    for (const name of ['sessionid', 'sid_guard']) {
      if (await getCookie('https://creator.douyin.com', name)) return { name: '已登录' };
    }
    return null;
  },

  async publish(article) {
    const imgs = article.images?.length || 0;
    const notes = [];
    let title = article.title;
    // 抖音文章标题上限 30 字；图文标题上限更宽，保留原来的 55 字截断
    const titleLimit = imgs < 2 ? 30 : 55;
    if (title.length > titleLimit) {
      title = title.slice(0, titleLimit);
      notes.push(`标题超过 ${titleLimit} 字，已截断`);
    }
    const layout = 'input[placeholder*="标题"], textarea[placeholder*="标题"]';
    const editor = '.ProseMirror, [contenteditable="true"], textarea[placeholder*="描述"], textarea[placeholder*="文案"], textarea[placeholder*="正文"]';
    const save = /^(暂存离开|存草稿|保存草稿)$/;

    // 图文要求 2–35 张图片：没有配图时改用「文章」形式
    if (imgs < 2) {
      notes.unshift('正文图片不足 2 张，已改用抖音「文章」形式（不强制配图）');
      const coverSrc = article.cover || article.images?.[0] || '';
      const base = {
        url: ARTICLE_EDITOR,
        loginRe: /login|passport/,
        titleSel: layout,
        bodySel: editor,
      };
      // 文章没有封面时不要点「暂存离开」：抖音会校验封面并跳回发布页，草稿不会保存。
      // 留在编辑器里让用户手动选封面，再自己保存。
      if (!coverSrc) {
        return fillInTab(this.name, { ...article, title }, base).then((r) => ({
          ...r,
          filledOnly: true,
          note: `已填入抖音文章（标题 + 正文）；原文没有可用封面，请在页面中设置封面后点「暂存离开」；${[...notes, r.note].filter(Boolean).join('；')}`,
        }));
      }
      return fillInTab(this.name, { ...article, title }, {
        ...base,
        saveRe: save,
        // 「点击上传封面图」会直接弹系统文件选择框，拦截后把封面写入动态创建的 file input
        coverClickRe: [/^点击上传封面图$/],
        coverCaptureClick: true,
        // 保存后抖音会跳回发布页，点「继续编辑」才能拿到带 creation_id 的草稿编辑地址
        afterSaveRe: /^继续编辑$/,
      }).then((r) => {
        const draftUrl = /[?&]creation_id=/.test(r.url)
          ? r.url
          : 'https://creator.douyin.com/creator-micro/content/manage';
        return {
          ...r,
          url: draftUrl,
          note: `已填入抖音文章并保存草稿；点击「打开草稿」会进入抖音文章编辑器；${[...notes, r.note].filter(Boolean).join('；')}`,
        };
      });
    }

    return fillInTab(this.name, { ...article, title }, {
      // default-tab=3 是「发布图文」
      url: 'https://creator.douyin.com/creator-micro/content/upload?default-tab=3',
      loginRe: /login|passport/,
      // 图文要求 2–35 张图片，先上传正文图片，标题/描述输入框才会出现
      attachImages: 9,
      titleSel: layout,
      bodySel: editor,
      // 图文页的存草稿按钮叫「暂存离开」，视频页叫「存草稿」
      saveRe: save,
    }).then((r) => ({
      ...r,
      url: 'https://creator.douyin.com/creator-micro/content/manage',
      note: `已填入抖音图文（图片 ${imgs} 张），请在页面中确认后保存/发布；草稿在「作品管理」中；${[...notes, r.note].filter(Boolean).join('；')}`,
    }));
  },
};
