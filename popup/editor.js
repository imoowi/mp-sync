// 同步前的 Markdown 编辑页：编辑结果存到 chrome.storage.local 的 draft:<文章地址>，同步面板会实时读取
import { html2md } from '../lib/html2md.js';
import { md2html } from '../lib/md2html.js';

const $ = (s) => document.querySelector(s);
const key = 'draft:' + new URLSearchParams(location.search).get('url');
const md = $('#md');

let draft = null;

async function load() {
  draft = (await chrome.storage.local.get(key))[key];
  if (!draft) {
    document.body.innerHTML = '<p style="padding:40px;text-align:center">没有找到要编辑的文章，请在公众号文章页的同步面板中点击「编辑文章」打开。</p>';
    return;
  }
  try {
    if (localStorage.getItem('mpSyncNoPreview')) $('#preview-toggle').checked = false;
  } catch {}
  togglePreview();
  render(draft.edited);
}

function render(edited) {
  const o = draft.original;
  $('#title').value = edited?.title ?? o.title;
  $('#summary').value = edited?.summary ?? o.summary ?? '';
  // 旧版编辑器保存的是 HTML，这里一并兼容
  md.value = edited?.markdown ?? html2md(edited?.html ?? o.html);
  preview();
  $('#saved').textContent = edited ? '已编辑' : '原文';
}

let timer;
function preview() {
  clearTimeout(timer);
  timer = setTimeout(() => ($('#preview').innerHTML = md2html(md.value)), 150);
}

async function save() {
  clearTimeout(autoTimer);
  // 重新读取再写回，避免覆盖同步面板写入的 synced 等字段
  draft = { ...draft, ...(await chrome.storage.local.get(key))[key] };
  draft.edited = {
    title: $('#title').value.trim(),
    summary: $('#summary').value.trim(),
    markdown: md.value,
  };
  await chrome.storage.local.set({ [key]: draft, ...(key.startsWith('draft:local:') ? { lastLocalDraft: key } : {}) });
  $('#saved').textContent = '已保存 ' + new Date().toLocaleTimeString();
}

// 工具栏：data-wrap 中 | 表示选中文本位置；无 | 时作为行首前缀
function apply(wrap) {
  const { selectionStart: s, selectionEnd: e, value } = md;
  const sel = value.slice(s, e);
  let text, cursor;
  if (wrap.includes('|')) {
    const [pre, post] = wrap.split('|');
    text = pre + sel + post;
    cursor = [s + pre.length, s + pre.length + sel.length];
  } else {
    const ls = value.lastIndexOf('\n', s - 1) + 1;
    md.setSelectionRange(ls, e);
    const lines = value.slice(ls, e).split('\n');
    text = lines.map((l, i) => (wrap === '1. ' ? `${i + 1}. ` : wrap) + l.replace(/^(#{1,6} |[-*] |\d+\. |> )/, '')).join('\n');
    cursor = [ls + text.length, ls + text.length];
  }
  md.focus();
  document.execCommand('insertText', false, text); // 保留撤销记录
  md.setSelectionRange(...cursor);
  preview();
}

$('.tools').addEventListener('click', (e) => {
  const b = e.target.closest('[data-wrap]');
  if (b) apply(b.dataset.wrap);
});

function togglePreview() {
  const on = $('#preview-toggle').checked;
  document.body.classList.toggle('no-preview', !on);
  try {
    on ? localStorage.removeItem('mpSyncNoPreview') : localStorage.setItem('mpSyncNoPreview', '1');
  } catch {}
}
$('#preview-toggle').addEventListener('change', togglePreview);

// 自动保存：停止输入 1 秒后保存
let autoTimer;
function changed() {
  $('#saved').textContent = '未保存';
  clearTimeout(autoTimer);
  autoTimer = setTimeout(save, 1000);
}

md.addEventListener('input', () => {
  preview();
  changed();
});
$('#title').addEventListener('input', changed);
$('#summary').addEventListener('input', changed);

// 编辑区滚动时预览按比例同步
md.addEventListener('scroll', () => {
  const p = $('#preview');
  const ratio = md.scrollTop / Math.max(1, md.scrollHeight - md.clientHeight);
  p.scrollTop = ratio * (p.scrollHeight - p.clientHeight);
});

md.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    document.execCommand('insertText', false, '  ');
  }
});

$('#save').addEventListener('click', save);

// 新建空白文章：当前内容先保存，再跳到新的本地文章
$('#new-doc').addEventListener('click', async () => {
  if ($('#saved').textContent === '未保存') await save();
  const url = 'local:' + Date.now();
  const k = 'draft:' + url;
  await chrome.storage.local.set({
    [k]: { original: { title: '', summary: '', html: '', author: '', cover: '' } },
    lastLocalDraft: k,
  });
  location.href = chrome.runtime.getURL('popup/editor.html') + '?url=' + encodeURIComponent(url);
});

// 从本地 Markdown 文件导入：开头的一级标题作为标题，紧随其后的引用作为摘要（与导出格式对应）
$('#import-md').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!confirm(`用「${file.name}」替换当前的标题和正文？`)) return;
  let text = (await file.text()).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  // 去掉 YAML front matter，取其中的 title
  let fmTitle = '';
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    fmTitle = fm[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1] || '';
    text = text.slice(fm[0].length);
  }
  let title = fmTitle;
  const h1 = text.match(/^\s*#\s+(.+?)\s*#*\s*\n/);
  if (h1) {
    title ||= h1[1];
    text = text.slice(h1[0].length);
  }
  let summary = '';
  const quote = text.match(/^\s*((?:>.*\n?)+)/);
  if (h1 && quote) {
    summary = quote[1].split('\n').map((l) => l.replace(/^>\s?/, '')).join('\n').trim();
    text = text.slice(quote[0].length);
  }
  $('#title').value = title || file.name.replace(/\.(md|markdown|txt)$/i, '');
  if (summary) $('#summary').value = summary;
  md.value = text.trim() + '\n';
  preview();
  await save();
});

// 导出为本地 Markdown 文件：标题作一级标题，摘要作引用，文件名取标题
$('#export-md').addEventListener('click', () => {
  const title = $('#title').value.trim() || '未命名文章';
  const summary = $('#summary').value.trim();
  const text = `# ${title}\n\n${summary ? `> ${summary.replace(/\n/g, '\n> ')}\n\n` : ''}${md.value.trim()}\n`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  a.download = title.replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 80) + '.md';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// 同步面板：先保存，再打开内嵌的同步页（popup.html?mode=sync）
$('#open-sync').addEventListener('click', async () => {
  if ($('#saved').textContent === '未保存') await save();
  const frame = $('#sync-frame');
  if (!frame.src) {
    frame.src = chrome.runtime.getURL('popup/popup.html') + '?mode=sync&url=' +
      encodeURIComponent(new URLSearchParams(location.search).get('url'));
  }
  $('#sync-panel').hidden = false;
});
$('#close-sync').addEventListener('click', () => ($('#sync-panel').hidden = true));
window.addEventListener('message', (e) => {
  if (e.data?.mpSyncHeight && e.source === $('#sync-frame').contentWindow) {
    $('#sync-frame').style.height = Math.min(e.data.mpSyncHeight, innerHeight - 100) + 'px';
  }
});

$('#reset').addEventListener('click', async () => {
  if (!confirm('放弃所有修改，恢复为公众号原文？')) return;
  clearTimeout(autoTimer);
  draft = { ...draft, ...(await chrome.storage.local.get(key))[key] };
  delete draft.edited;
  await chrome.storage.local.set({ [key]: draft });
  render(null);
});

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); save(); }
  else if (k === 'b' && document.activeElement === md) { e.preventDefault(); apply('**|**'); }
  else if (k === 'i' && document.activeElement === md) { e.preventDefault(); apply('*|*'); }
});

// 关闭或切走页面时立即保存未保存的修改
window.addEventListener('beforeunload', () => {
  if ($('#saved').textContent === '未保存') save();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && $('#saved').textContent === '未保存') save();
});

load();
