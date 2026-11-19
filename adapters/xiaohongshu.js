import { request, NotLoggedIn } from '../lib/http.js';
import { openTab, runInTab } from '../lib/tab.js';

// 小红书没有可用的长文草稿接口：打开创作中心长文编辑器，并在页面中自动填充标题/正文
const EDITOR = 'https://creator.xiaohongshu.com/publish/publish?from=menu&target=article';

export default {
  id: 'xiaohongshu',
  name: '小红书',
  home: 'https://creator.xiaohongshu.com/login',

  // 小红书未登录访客也会有 web_session Cookie，所以必须调用用户信息接口判断
  async checkLogin() {
    try {
      const r = await request('https://creator.xiaohongshu.com/api/galaxy/user/info');
      const d = r?.data;
      if (r?.success && d && (d.userName || d.userId)) return { name: d.userName || '已登录' };
    } catch (e) {
      console.warn('[xiaohongshu] creator user/info', e);
    }
    try {
      const r = await request('https://edith.xiaohongshu.com/api/sns/web/v2/user/me');
      const d = r?.data;
      if (r?.success && d && !d.guest && d.user_id) return { name: d.nickname || '已登录' };
    } catch (e) {
      console.warn('[xiaohongshu] user/me', e);
    }
    return null;
  },

  async publish(article) {
    // 前台打开：编辑器在后台标签页中可能不渲染，且需要用户检查结果
    const tab = await openTab(EDITOR, { active: true });
    if (/login/.test(tab.url)) throw new NotLoggedIn(this.name);
    const r = await runInTab(tab.id, fill, [article.title, article.html]);
    console.log('[xiaohongshu] fill', r);
    if (!r.saved) throw new Error(`小红书：${r.steps.join('；')}（编辑器页面已打开，请检查）`);
    return { url: tab.url, note: r.steps.join('；') };
  },
};

// 在小红书页面中执行：进入长文编辑器 → 填标题 → 粘贴正文 → 点「暂存离开/存草稿」
async function fill(title, html) {
  const steps = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (fn, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const el = fn();
      if (el) return el;
      await sleep(300);
    }
    return null;
  };
  const byText = (re) => Array.from(document.querySelectorAll('button,div,span,a'))
    .filter((el) => el.offsetParent && re.test((el.textContent || '').trim()) && (el.textContent || '').trim().length < 12)
    .sort((a, b) => a.children.length - b.children.length)[0];
  const click = (el) => {
    (el.closest('button') || el).click();
  };

  // 1. 进入长文编辑器：可能需要点「写长文」→「新的创作」
  for (const re of [/^写长文$/, /^新的创作$/]) {
    const btn = await wait(() => byText(re), 4000);
    if (btn) {
      click(btn);
      steps.push('点击' + btn.textContent.trim());
      await sleep(1500);
    }
  }

  // 2. 标题
  const titleEl = await wait(() => document.querySelector('textarea[placeholder*="标题"], input[placeholder*="标题"]'));
  if (titleEl) {
    titleEl.focus();
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(titleEl), 'value').set;
    setter.call(titleEl, title.slice(0, 64));
    titleEl.dispatchEvent(new Event('input', { bubbles: true }));
    titleEl.dispatchEvent(new Event('change', { bubbles: true }));
    steps.push('已填标题');
  } else {
    steps.push('未找到标题输入框');
  }

  // 3. 正文：模拟粘贴，失败则用 insertHTML
  const editor = await wait(() => document.querySelector('.ProseMirror, .tiptap, [contenteditable="true"]'));
  if (!editor) return { saved: false, steps: [...steps, '未找到正文编辑器'] };
  editor.focus();
  const before = editor.innerText.length;
  const dt = new DataTransfer();
  dt.setData('text/html', html);
  dt.setData('text/plain', new DOMParser().parseFromString(html, 'text/html').body.innerText);
  editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  await sleep(800);
  if (editor.innerText.length <= before + 5) {
    document.execCommand('insertHTML', false, html);
    await sleep(800);
  }
  const filled = editor.innerText.length > before + 5;
  steps.push(filled ? `已填正文 ${editor.innerText.length} 字` : '正文填充失败');
  if (!filled) return { saved: false, steps };

  // 4. 保存草稿
  await sleep(1500);
  const saveBtn = byText(/^(暂存离开|存草稿|保存草稿|暂存)$/);
  if (!saveBtn) return { saved: false, steps: [...steps, '未找到「暂存/存草稿」按钮，请手动保存'] };
  click(saveBtn);
  steps.push('已点击' + saveBtn.textContent.trim());
  await sleep(2000);
  return { saved: true, steps };
}
