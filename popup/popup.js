import { html2md } from '../lib/html2md.js';
import { md2html } from '../lib/md2html.js';

const $ = (s) => document.querySelector(s);
const send = (msg) => chrome.runtime.sendMessage(msg);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// 各平台官网
const SITES = {
  wechat: 'https://mp.weixin.qq.com/',
  juejin: 'https://juejin.cn/',
  csdn: 'https://www.csdn.net/',
  zhihu: 'https://www.zhihu.com/',
  xiaohongshu: 'https://www.xiaohongshu.com/',
  segmentfault: 'https://segmentfault.com/',
  oschina: 'https://www.oschina.net/',
  cto51: 'https://blog.51cto.com/',
  toutiao: 'https://www.toutiao.com/',
  baijiahao: 'https://baijiahao.baidu.com/',
  jianshu: 'https://www.jianshu.com/',
  douban: 'https://www.douban.com/',
  meipian: 'https://www.meipian.cn/',
  jike: 'https://web.okjike.com/',
  bilibili: 'https://member.bilibili.com/platform/upload/text',
  sohu: 'https://mp.sohu.com/',
  xueqiu: 'https://mp.xueqiu.com/writeV2',
  woshipm: 'https://www.woshipm.com/writing',
  douyin: 'https://creator.douyin.com/',
};

let article = null;
let platforms = [];

// 两种模式：公众号页面板只负责读取文章并进入编辑；编辑页内嵌的同步面板（mode=sync）负责选择平台并同步
const params = new URLSearchParams(location.search);
const syncMode = params.get('mode') === 'sync';

async function loadArticle() {
  if (syncMode) {
    draftKey = 'draft:' + params.get('url');
    const draft = (await chrome.storage.local.get(draftKey))[draftKey];
    if (!draft?.original) {
      $('#status').innerHTML = '<span class="error">没有找到文章，请回到公众号文章页重新打开</span>';
      return;
    }
    // 本地新建的文章（local:时间戳）没有公众号原文链接
    const url = params.get('url');
    source = { url: url.startsWith('local:') ? '' : url, ...draft.original };
    applyDraft(draft);
    return;
  }
  const embedded = params.has('embed');
  const tab = embedded
    ? await chrome.tabs.get(await send({ type: 'currentTabId' }))
    : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab?.url?.startsWith('https://mp.weixin.qq.com/')) {
    $('#status').innerHTML = '<span class="error">请在微信公众号文章页（mp.weixin.qq.com）打开本插件</span>';
    return;
  }
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/wechat.js'],
  });
  if (!result || result.error) {
    $('#status').innerHTML = `<span class="error">${esc(result?.error || '读取文章失败')}</span>`;
    return;
  }
  // 原文存入 draft:<url>，编辑页修改后写回 edited，这里监听变化实时应用
  draftKey = 'draft:' + result.url;
  const draft = (await chrome.storage.local.get(draftKey))[draftKey] || {};
  draft.original = {
    title: result.title, summary: result.summary, html: result.html,
    author: result.author, cover: result.cover,
  };
  await chrome.storage.local.set({ [draftKey]: draft });
  source = result;
  applyDraft(draft);
}

let source = null;
let draftKey = null;

function applyDraft(draft) {
  const e = draft?.edited;
  const a = { ...source, ...(e ? { title: e.title, summary: e.summary } : {}) };
  if (e?.markdown != null) {
    // Markdown 编辑：Markdown 平台直接用，HTML 平台（知乎/小红书）由 Markdown 生成
    a.markdown = e.markdown;
    a.html = md2html(e.markdown);
  } else {
    if (e?.html) a.html = e.html;
    a.markdown = html2md(a.html);
  }
  {
    const doc = new DOMParser().parseFromString(a.html, 'text/html');
    a.images = Array.from(doc.querySelectorAll('img')).map((i) => i.getAttribute('src')).filter(Boolean);
  }
  article = a;
  article.summary ||= article.markdown.replace(/[#>*`!\[\]\(\)\-]/g, '').slice(0, 120);
  $('#article').innerHTML = `
    <div class="title">${esc(article.title)}</div>
    <div class="meta">${esc(article.author || '')} · ${article.markdown.length} 字符 · ${article.images.length} 张图片
      ${draft?.edited ? '<span class="edited">· 已编辑</span>' : ''}</div>
    ${syncMode ? '' : `<div class="article-actions">
      <button id="edit" class="small">去同步</button>
      ${draft?.edited ? '<button id="revert" class="small ghost">恢复原文</button>' : ''}
    </div>`}`;
  updateButton();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && draftKey && changes[draftKey] && source) applyDraft(changes[draftKey].newValue);
});

$('#article').addEventListener('click', async (e) => {
  if (e.target.id === 'edit') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/editor.html') + '?url=' + encodeURIComponent(source.url) });
  } else if (e.target.id === 'revert' && confirm('放弃编辑内容，恢复为公众号原文？')) {
    const draft = (await chrome.storage.local.get(draftKey))[draftKey];
    delete draft.edited;
    await chrome.storage.local.set({ [draftKey]: draft });
  }
});

async function loadPlatforms() {
  platforms = await send({ type: 'platforms' });
  const { selected = platforms.map((p) => p.id) } = await chrome.storage.local.get('selected');
  $('#platforms').innerHTML = platforms.map((p) => `
    <li data-id="${p.id}">
      <label><input type="checkbox" value="${p.id}" ${selected.includes(p.id) ? 'checked' : ''} /> ${p.name}</label>
      <a class="site" href="${SITES[p.id]}" target="_blank" title="${SITES[p.id]}">官网↗</a>
      <span class="state">检测登录…</span>
    </li>`).join('');

  platforms.forEach(async (p) => {
    let user = await send({ type: 'checkLogin', id: p.id });
    if (user?.debug) {
      console.log(`[${p.id}]`, user.debug);
      const li = document.querySelector(`li[data-id="${p.id}"]`);
      li.title = user.debug;
      if (user.needSpace) {
        li.insertAdjacentHTML('afterend', `<li class="space-row">
          <input id="space-${p.id}" placeholder="粘贴个人主页地址，如 https://my.oschina.net/u/123" style="flex:1;font-size:12px;padding:3px" />
          <button data-save="${p.id}" style="width:auto;padding:3px 8px;font-size:12px">保存</button></li>`);
      }
      user = null;
    }
    setState(p.id, user
      ? `<span title="${esc(user.name)}">${esc(user.name)}</span>`
      : `<a href="${p.home}" target="_blank">未登录，去登录</a>`, user ? '' : 'fail');
    // 已登录且之前同步过：直接显示上次的草稿链接
    const last = user && syncedResults[p.id] && fixUrl(p.id, prevOf(p.id));
    if (last) showResult(p.id, last);
  });
  syncAllBox();
  updateButton(); // 文章可能先于平台列表加载完，这里按已勾选平台再刷新一次按钮
}

// 上次同步结果，保存在 draft.synced[平台id] = { url, note, time }
let syncedResults = {};

function showResult(id, r) {
  const warn = /失败/.test(r.note || '') ? ' ⚠' : '';
  const time = r.time ? new Date(r.time).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const tip = [r.updated ? '已更新原草稿' : '', r.note, time && `同步于 ${time}`].filter(Boolean).join('；');
  // 没有草稿的平台（即刻）：内容只填在打开的页面里，点击切回那个标签页去发布
  if (r.filledOnly) {
    setState(id, `<a href="${esc(r.url)}" data-tab="${r.tabId}" title="${esc(tip)}">✓ 已填写，去发布${warn}</a>`, 'ok');
    return;
  }
  setState(id, `<a href="${esc(r.url)}" target="_blank" title="${esc(tip)}">✓ ${r.updated ? '已更新' : '打开草稿'}${warn}</a>`, 'ok');
}

// 多个平台并发完成，串行写入避免互相覆盖
let saveChain = Promise.resolve();
function saveResult(id, r) {
  syncedResults[id] = {
    id: r.id || syncedResults[id]?.id, notebookId: r.notebookId, url: r.url, note: r.note || '', time: Date.now(),
  };
  saveChain = saveChain.then(async () => {
    const draft = (await chrome.storage.local.get(draftKey))[draftKey] || {};
    draft.synced = { ...draft.synced, [id]: syncedResults[id] };
    await chrome.storage.local.set({ [draftKey]: draft });
  });
  return saveChain;
}

function setState(id, html, cls = '') {
  const el = document.querySelector(`li[data-id="${id}"] .state`);
  el.className = 'state ' + cls;
  el.innerHTML = html;
}

function checked() {
  return Array.from(document.querySelectorAll('#platforms input:checked')).map((i) => i.value);
}

function syncAllBox() {
  $('#all').checked = checked().length === platforms.length;
}

function updateButton() {
  if (!syncMode) return;
  $('#sync').disabled = !article || checked().length === 0;
}

$('#platforms').addEventListener('change', () => {
  chrome.storage.local.set({ selected: checked() });
  syncAllBox();
  updateButton();
});

$('#all').addEventListener('change', (e) => {
  document.querySelectorAll('#platforms input').forEach((i) => (i.checked = e.target.checked));
  chrome.storage.local.set({ selected: checked() });
  updateButton();
});

// 旧版同步记录没有 id，从草稿地址中解析
function prevOf(id) {
  const p = syncedResults[id];
  if (!p || p.id) return p;
  const m = p.url?.match(/drafts\/(\d+)|articleId=(\d+)|\/p\/(\d+)\/edit|draftId=(\w+)|draft\/(\d+)|appmsgid=(\d+)|article_id=(\d+)/)
    || p.note?.match(/草稿 ID (\d+)/); // 51CTO 旧记录的 ID 在说明里
  const parsed = m && m.slice(1).find(Boolean);
  return parsed ? { ...p, id: parsed } : p;
}

// 51CTO 旧记录指向草稿箱列表，改为具体草稿地址
function fixUrl(id, r) {
  if (id === 'cto51' && r.id && /creative-center\/draft/.test(r.url)) {
    return { ...r, url: `https://blog.51cto.com/blogger/draft/${r.id}` };
  }
  return r;
}

$('#sync').addEventListener('click', async () => {
  $('#sync').disabled = true;
  $('#sync').textContent = '同步中…';
  await Promise.all(checked().map(async (id) => {
    const prev = prevOf(id);
    setState(id, prev?.id ? '更新草稿中…' : '同步中…');
    const r = await send({ type: 'publish', id, article, prev });
    if (r.ok) {
      showResult(id, { ...r, time: Date.now() });
      // 没有草稿的平台不保存记录：页面关闭后内容就没了，下次打开不应再显示链接
      if (!r.filledOnly) await saveResult(id, r);
    } else {
      const p = platforms.find((x) => x.id === id);
      setState(id, r.notLoggedIn
        ? `<a href="${p.home}" target="_blank">未登录，去登录</a>`
        : esc(r.error), 'fail');
    }
  }));
  $('#sync').textContent = '同步为草稿';
  updateButton();
});

$('#platforms').addEventListener('click', (e) => {
  const save = e.target.closest('[data-save]');
  if (save) {
    const id = save.dataset.save;
    const v = document.querySelector(`#space-${id}`).value.trim();
    const m = v.match(/my\.oschina\.net\/(u\/\d+|[A-Za-z0-9_-]+)/) || v.match(/^(u\/\d+)$/) || v.match(/^(\d+)$/);
    if (!m) return alert('地址格式不正确，例如 https://my.oschina.net/u/1538378');
    const space = /^\d+$/.test(m[1]) ? 'u/' + m[1] : m[1];
    chrome.storage.local.set({ oschinaSpace: space }).then(() => {
      save.closest('li').remove();
      setState(id, esc(space));
    });
    return;
  }
  const a = e.target.closest('a');
  if (a) {
    e.preventDefault();
    if (a.dataset.tab) {
      // 切回已填写内容的标签页；若已被关闭，提示重新同步
      const tabId = +a.dataset.tab;
      chrome.tabs.update(tabId, { active: true })
        .then((t) => chrome.windows.update(t.windowId, { focused: true }))
        .catch(() => alert('该页面已关闭，填写的内容没有保存，请重新同步'));
      return;
    }
    chrome.tabs.create({ url: a.href });
  }
});

// 公众号页面板不显示平台列表与同步按钮
if (syncMode) {
  chrome.storage.local.get('draft:' + params.get('url')).then((s) => {
    syncedResults = Object.values(s)[0]?.synced || {};
    loadPlatforms();
  });
}
else document.querySelectorAll('.sync-only').forEach((n) => n.remove());
loadArticle();

// 内嵌在页面面板中时，把内容高度告诉父页面以自适应
if (window.parent !== window) {
  $('#hd').style.display = 'none';
  document.body.style.width = 'auto';
  // 用 body 实际高度：documentElement.scrollHeight 不会小于 iframe 当前高度，导致无法缩小
  // 同步模式下页面固定为 iframe 高度，只有平台列表滚动；上报时加回列表被隐藏的部分，即内容的完整高度
  if (syncMode) document.body.classList.add('fit');
  const list = $('#platforms');
  const report = () => {
    const hidden = list ? list.scrollHeight - list.clientHeight : 0;
    window.parent.postMessage({ mpSyncHeight: Math.ceil(document.body.getBoundingClientRect().height + hidden) }, '*');
  };
  const ro = new ResizeObserver(report);
  ro.observe(document.body);
  if (list) {
    ro.observe(list);
    new MutationObserver(report).observe(list, { childList: true, subtree: true });
  }
}
