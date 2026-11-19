import { NotLoggedIn } from './http.js';
import { openTab, runInTab, waitComplete } from './tab.js';
import { fetchImage } from './images.js';

// 下载封面并转成 data URL 传入页面（公众号图片防盗链，只能在后台下载）
async function coverData(src) {
  if (!src) return null;
  try {
    const { blob, name } = await fetchImage(src);
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { dataUrl: `data:${blob.type || 'image/jpeg'};base64,${btoa(bin)}`, name, type: blob.type || 'image/jpeg' };
  } catch (e) {
    console.warn('[fill] 封面下载失败', e);
    return null;
  }
}

// 正文图片（如抖音图文要求多图）：按顺序下载前 max 张，转成 data URL
async function imagesData(srcs, max) {
  const out = [];
  for (const src of (srcs || []).slice(0, max)) {
    const d = await coverData(src);
    if (d) out.push(d);
  }
  return out;
}

// 没有可用草稿接口的平台：前台打开平台编辑器，在页面中自动填写标题和正文
// 只会点击「存草稿」类按钮，绝不点击「发布」；填充失败时把正文复制到剪贴板，由用户手动粘贴
// opts: { url, loginRe, titleSel, bodySel, saveRe, saveSel, saveEnterRe, saveEnterSel, enterRe,
//         mode: 'html' | 'text', coverClickRe, attachImages }
// saveEnterSel：存草稿前要先点的无字图标按钮（如 X 的关闭按钮），点后才弹出保存对话框
// attachImages：正文图片上传数量上限（如抖音图文，先传图编辑器才出现标题/正文输入框）
// coverClickRe：设置封面前依次点击的按钮文字（如「单图」「选择封面」「本地上传」），之后把封面写入图片上传框
// coverCaptureClick：封面入口点击后直接弹系统文件选择框时，拦截 HTMLInputElement.click，
//                    拿到页面动态创建的 file input 再写入文件，避免系统选择框卡住流程
// afterSaveRe：保存后页面会跳到发布页时，自动点这里的按钮（如抖音的「继续编辑」）回到草稿编辑页
// 同时勾选多个此类平台时依次执行，避免多个前台标签页互相抢焦点（粘贴、剪贴板依赖焦点）
let queue = Promise.resolve();
export function fillInTab(platform, article, opts) {
  const run = queue.then(() => doFill(platform, article, opts));
  queue = run.catch(() => {});
  return run;
}

async function doFill(platform, article, opts) {
  const tab = await openTab(opts.url, { active: true });
  if ((opts.loginRe || /login|passport|signin/).test(tab.url)) throw new NotLoggedIn(platform);
  const text = opts.mode === 'text' ? opts.text : '';
  const cover = opts.coverClickRe ? await coverData(article.cover || article.images?.[0]) : null;
  const images = opts.attachImages ? await imagesData(article.images, opts.attachImages) : [];
  // 在页面主环境中执行，才能调用页面编辑器自身的 API（如百家号的 UEditor）
  const r = await runInTab(tab.id, fill, [{
    title: article.title,
    html: article.html,
    text,
    titleSel: opts.titleSel || '',
    bodySel: opts.bodySel,
    saveSrc: opts.saveRe?.source || '',
    saveSel: opts.saveSel || '',
    saveEnterSrc: (opts.saveEnterRe || []).map((re) => re.source),
    saveEnterSel: opts.saveEnterSel || [],
    enterSrc: (opts.enterRe || []).map((re) => re.source),
    cover,
    coverClickSrc: (opts.coverClickRe || []).map((re) => re.source),
    coverCaptureClick: !!opts.coverCaptureClick,
    images,
  }], 'MAIN');
  console.log(`[${platform}] fill`, r);
  if (!r.filled) throw new Error(`${platform}：${r.steps.join('；')}（编辑器页面已打开，请检查）`);
  // 存草稿后编辑器会把地址改成带草稿 ID 的地址（如百家号 &article_id=...），等它变化后再取
  let url = tab.url;
  for (let i = 0; i < 10; i++) {
    const t = await chrome.tabs.get(tab.id).catch(() => null);
    if (!t) break;
    url = t.url;
    if (url !== tab.url) break;
    await new Promise((res) => setTimeout(res, 500));
  }
  // 抖音保存文章后会跳回「发布页」，需要再点「继续编辑」才能拿到带 creation_id 的草稿编辑地址
  if (opts.afterSaveRe) {
    let clicked = false;
    for (let i = 0; i < 20 && !clicked; i++) {
      await waitComplete(tab.id, 10000).catch(() => {});
      clicked = await runInTab(tab.id, clickByText, [opts.afterSaveRe.source]).catch(() => false);
      // 点击可能触发同步跳转，注入脚本来不及返回；直接看地址是否已经变成草稿编辑页
      if (!clicked) {
        const t = await chrome.tabs.get(tab.id).catch(() => null);
        if (t && /[?&]creation_id=/.test(t.url)) {
          url = t.url;
          clicked = true;
          break;
        }
      }
      if (!clicked) await new Promise((res) => setTimeout(res, 500));
    }
    if (clicked) {
      r.steps.push('已打开草稿');
      for (let i = 0; i < 20; i++) {
        const t = await chrome.tabs.get(tab.id).catch(() => null);
        if (!t) break;
        url = t.url;
        if (/[?&]creation_id=/.test(url)) break;
        await new Promise((res) => setTimeout(res, 500));
      }
    }
  }
  return { url, tabId: tab.id, filledOnly: !opts.saveRe && !opts.saveSel, note: r.steps.join('；') };
}

// 在页面中按文字点击按钮（自包含，供 executeScript 使用）
function clickByText(src) {
  const re = new RegExp(src);
  const btn = Array.from(document.querySelectorAll('button,a,div,span'))
    .filter((el) => el.offsetParent && re.test((el.textContent || '').trim()) && (el.textContent || '').trim().length < 12)
    .sort((a, b) => a.children.length - b.children.length)[0];
  if (!btn) return false;
  (btn.closest('button,a') || btn).click();
  return true;
}

// 在平台页面中执行（必须自包含）
async function fill({ title, html, text, titleSel, bodySel, saveSrc, saveSel, saveEnterSrc, saveEnterSel, enterSrc, cover, coverClickSrc, coverCaptureClick, images }) {
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
  const plain = text || new DOMParser().parseFromString(html, 'text/html').body.innerText;

  // 1. 可能需要先点入口按钮（如「写文章」）
  for (const src of enterSrc) {
    const btn = await wait(() => byText(new RegExp(src)), 8000);
    if (btn) {
      (btn.closest('button') || btn).click();
      steps.push('点击' + btn.textContent.trim());
      await sleep(1500);
    }
  }

  // 2. 正文图片（如抖音图文：先传图，标题/描述输入框才出现）
  if (images?.length) {
    try {
      const input = await wait(() => Array.from(document.querySelectorAll('input[type="file"]'))
        .filter((i) => (!i.accept || /image/.test(i.accept)) && i.offsetParent !== null).pop(), 10000)
        || await wait(() => Array.from(document.querySelectorAll('input[type="file"]'))
          .filter((i) => !i.accept || /image/.test(i.accept)).pop(), 3000);
      if (!input) throw new Error('未找到图片上传入口');
      const dt = new DataTransfer();
      for (const im of images) {
        const blob = await (await fetch(im.dataUrl)).blob();
        dt.items.add(new File([blob], im.name, { type: im.type }));
      }
      input.files = dt.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      steps.push(`已上传 ${images.length} 张图片`);
      await sleep(4000);
    } catch (e) {
      steps.push('图片未能自动上传（' + e.message + '），请手动添加');
    }
  }

  // 3. 标题：编辑器初始化可能会重置标题，所以正文填完后再检查一次，没填上就重填
  const titleOf = (el) => (el.isContentEditable ? el.innerText : el.value || '').trim();
  const fillTitle = async () => {
    const el = await wait(() => Array.from(document.querySelectorAll(titleSel)).find((e) => e.offsetParent), 15000);
    if (!el) return false;
    el.focus();
    if (el.isContentEditable) {
      // 只选中标题元素自身，避免 selectAll 选中整页
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertText', false, title);
    } else {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, title);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    await sleep(300);
    return titleOf(el) === title.trim();
  };
  let titleOk = false;
  if (titleSel) titleOk = await fillTitle();

  // 4. 正文：UEditor（百家号等）优先用编辑器自身 API 写入，模拟粘贴会经过它的粘贴过滤，可能混入杂字符
  let filled = false;
  const found = await wait(() => document.querySelector(bodySel));
  const ue = !text && window.UE?.instants && Object.values(window.UE.instants)[0];
  if (found && ue?.setContent) {
    try {
      ue.setContent(html);
      ue.fireEvent?.('contentchange');
      await sleep(800);
      filled = ue.getContentTxt().trim().length > 5;
    } catch (e) {
      console.warn('[mp-sync] UEditor setContent', e);
    }
  }
  if (found && !filled) {
    let doc = document;
    let target = found;
    if (found.tagName === 'IFRAME') {
      doc = found.contentDocument;
      target = doc?.body;
    }
    if (target) {
      target.focus();
      const before = (target.innerText || target.value || '').length;
      const len = () => (target.innerText || target.value || '').length;
      if (target.tagName === 'TEXTAREA') {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(target, plain);
        target.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        const dt = new DataTransfer();
        if (!text) dt.setData('text/html', html);
        dt.setData('text/plain', plain);
        target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        await sleep(800);
        if (len() <= before + 5) {
          doc.execCommand(text ? 'insertText' : 'insertHTML', false, text || html);
          await sleep(800);
        }
      }
      filled = len() > before + 5;
    }
  }
  if (filled) {
    // 清理首尾只有花括号等杂字符的段落（编辑器粘贴/写入过滤时可能残留）
    const body = found.tagName === 'IFRAME' ? found.contentDocument?.body : found;
    const junk = /^[\s{}]+$/;
    const clean = () => {
      for (const pick of ['firstChild', 'lastChild']) {
        let n = body?.[pick];
        while (n && (n.nodeType === Node.TEXT_NODE || n.nodeType === Node.ELEMENT_NODE) &&
          !n.querySelector?.('img') && junk.test(n.textContent || '') && /[{}]/.test(n.textContent || '')) {
          const next = n[pick === 'firstChild' ? 'nextSibling' : 'previousSibling'];
          n.remove();
          n = next;
        }
        // 段落内首尾的花括号文本（代码块里的花括号是真实内容，不处理）
        const edge = body?.[pick];
        const walker = edge && !edge.closest?.('pre,code') && !edge.querySelector?.('pre,code') &&
          document.createTreeWalker(edge, NodeFilter.SHOW_TEXT);
        if (walker) {
          let t = walker.nextNode();
          if (pick === 'lastChild') { let last = t; while ((t = walker.nextNode())) last = t; t = last; }
          if (t) t.textContent = pick === 'firstChild' ? t.textContent.replace(/^[\s{}]+/, '') : t.textContent.replace(/[\s{}]+$/, '');
        }
      }
    };
    if (body) {
      clean();
      ue?.fireEvent?.('contentchange');
    }
    steps.push('已填正文');
  } else {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })]);
      steps.push('自动填充正文失败，已复制正文，请在编辑器中粘贴（Ctrl+V）');
    } catch {
      steps.push('自动填充正文失败');
    }
    return { filled: false, steps };
  }

  // 正文填完后复查标题（粘贴可能把焦点或内容带到标题框，或编辑器初始化清空了标题）
  if (titleSel) {
    const el = Array.from(document.querySelectorAll(titleSel)).find((e) => e.offsetParent);
    if (!el || titleOf(el) !== title.trim()) titleOk = await fillTitle();
    steps.unshift(titleOk ? '已填标题' : '标题未能自动填写，请手动填写');
  }

  // 封面：依次点击打开封面上传入口，再把图片写入 <input type=file> 并触发 change
  if (coverClickSrc?.length) {
    if (!cover) {
      steps.push('原文无封面或封面下载失败，请手动设置封面');
    } else {
      try {
        let captured = null;
        const proto = HTMLInputElement.prototype;
        const origClick = proto.click;
        // 有些编辑器点封面入口时动态创建 input 并立即 click() 弹系统选择框，DOM 里查不到这个 input。
        // 先拦截 click，把动态 input 留下来，再直接写入文件并触发 change。
        if (coverCaptureClick) {
          proto.click = function () {
            if (this.type === 'file') {
              captured = this;
              return;
            }
            return origClick.call(this);
          };
        }
        try {
          for (const src of coverClickSrc) {
            const btn = await wait(() => byText(new RegExp(src)), 3000);
            if (btn) {
              (btn.closest('button,label') || btn).click();
              await sleep(800);
            }
          }
          if (coverCaptureClick) captured = await wait(() => captured, 5000);
        } finally {
          if (coverCaptureClick) proto.click = origClick;
        }
        const input = coverCaptureClick ? captured : await wait(() => Array.from(document.querySelectorAll('input[type="file"]'))
          .filter((i) => !i.accept || /image/.test(i.accept)).pop(), 5000);
        if (!input) throw new Error('未找到封面上传入口');
        // 记下上传前已有的图片，上传后找出新出现的缩略图并选中它
        const thumbs = () => Array.from(document.querySelectorAll('img'))
          .filter((i) => i.offsetParent && i.getBoundingClientRect().width < 220);
        const before = new Set(thumbs().map((i) => i.src));
        const blob = await (await fetch(cover.dataUrl)).blob();
        const dt = new DataTransfer();
        dt.items.add(new File([blob], cover.name, { type: cover.type }));
        input.files = dt.files;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        const added = await wait(() => thumbs().filter((i) => !before.has(i.src)).pop(), 10000);
        if (added) {
          added.click();
          await sleep(1000);
        } else {
          await sleep(coverCaptureClick ? 4000 : 2000);
        }
        // 上传后可能弹出裁剪框或选择框，点确认
        const ok = byText(/^(确定|确认|完成)$/);
        if (ok) {
          (ok.closest('button') || ok).click();
          await sleep(1000);
        }
        steps.push(added ? '已上传封面，请检查' : '已提交封面图片，请检查封面是否更换');
      } catch (e) {
        steps.push('封面未能自动设置（' + e.message + '），请手动设置');
      }
    }
  }

  // 5. 存草稿（只匹配草稿类按钮，不会点击发布）
  // saveEnterSrc：存草稿前要先点的按钮（如美篇的「返回文章列表」，点后才弹出「保存草稿」）
  // saveEnterSel：存草稿前要先点的无字图标按钮（如 X 的关闭按钮，点后弹出保存对话框）
  // saveSel：没有文字的图标按钮（如豆瓣），用选择器定位
  if (saveSrc || saveSel) {
    await sleep(1500);
    for (const src of saveEnterSrc || []) {
      const b = byText(new RegExp(src));
      if (b) {
        (b.closest('button,a') || b).click();
        await sleep(1000);
      }
    }
    for (const sel of saveEnterSel || []) {
      const b = Array.from(document.querySelectorAll(sel)).find((e) => e.offsetParent);
      if (b) {
        (b.closest('button') || b).click();
        await sleep(1000);
      }
    }
    const btn = await wait(() => (saveSel && Array.from(document.querySelectorAll(saveSel)).find((e) => e.offsetParent))
      || (saveSrc && byText(new RegExp(saveSrc))), 5000);
    if (btn) {
      (btn.closest('button,a') || btn).click();
      steps.push('已点击' + (btn.textContent.trim() || btn.getAttribute('title') || btn.getAttribute('aria-label') || '保存'));
      await sleep(1500);
    } else {
      steps.push('未找到存草稿按钮，请手动保存');
    }
  }
  return { filled: true, steps };
}
