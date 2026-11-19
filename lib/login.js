import { runInTab, withTempTab } from './tab.js';

// 登录凭证存在网页 localStorage 中的平台（美篇、即刻）：扩展后台读不到，只能在页面里读取。
// - 有已打开的平台页面：直接在页面里读；
// - 没有打开的页面：临时在后台打开 probeUrl 读取一次再关闭（这样浏览器里登录着就能检测到，
//   不需要一直开着平台页面），结果缓存 5 分钟，避免频繁打开弹窗时反复开后台标签页。
// 返回 { name }（已登录）/ null（确认未登录）/ undefined（页面打不开，无法判断）

const CACHE_TTL = 5 * 60 * 1000;

export async function loginFromTab(urlPattern, probeUrl) {
  const tabs = (await chrome.tabs.query({ url: urlPattern }).catch(() => []))
    .filter((t) => t.status !== 'unloaded'); // 休眠的标签页无法注入

  let inspected = 0;      // 成功读取过的页面数
  let sameOrigin = false; // 标准域名下的页面已确认未登录
  for (const tab of tabs) {
    try {
      const r = await runInTab(tab.id, readLogin);
      inspected++;
      if (r) return { name: r.name || '已登录' };
      if (probeUrl && originOf(tab.url) === originOf(probeUrl)) sameOrigin = true;
    } catch { /* 页面还在加载或被休眠，换下一个 */ }
  }
  // 标准域名下的页面明确显示未登录：可信（localStorage 按域名分开存，子域名里的结果不一定代表主域名）
  if (sameOrigin) {
    await cacheProbe(urlPattern, null).catch(() => {});
    return null;
  }

  if (!probeUrl) return inspected ? null : undefined;

  const cacheKey = 'loginProbe:' + urlPattern;
  const cached = (await (chrome.storage.session?.get(cacheKey).catch(() => ({})) ?? {}))[cacheKey];
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.loggedIn ? { name: cached.name || '已登录' } : null;
  }

  // 没有可用的已打开页面（或只开着其他子域名）：后台临时打开平台首页读一次
  let r;
  try {
    ({ result: r } = await withTempTab(probeUrl, readLogin));
  } catch {
    r = undefined;
  }
  if (r === undefined) return inspected ? null : undefined; // 页面打不开，无法判断
  await cacheProbe(urlPattern, r).catch(() => {});
  return r ? { name: r.name || '已登录' } : null;
}

function originOf(u) {
  try { return new URL(u).origin; } catch { return ''; }
}

function cacheProbe(urlPattern, r) {
  if (!chrome.storage.session) return Promise.resolve();
  return chrome.storage.session.set({
    ['loginProbe:' + urlPattern]: { loggedIn: !!r, name: r?.name || '', time: Date.now() },
  });
}

// 在平台页面中执行（必须自包含）：在 localStorage 中找登录凭证和昵称
// 只返回是否登录和昵称，不把凭证本身带出页面
// （导出仅为单元测试使用，executeScript 只依赖函数自身，不受影响）
export function readLogin() {
  let loggedIn = false;
  let name = '';
  const findName = (o, d = 0) => {
    if (!o || typeof o !== 'object' || d > 4) return '';
    for (const [k, v] of Object.entries(o)) {
      if (/^(screenName|screen_name|nickname|nick_name|user_name|username|name)$/i.test(k) && typeof v === 'string' && v) return v;
    }
    for (const v of Object.values(o)) {
      const r = findName(v, d + 1);
      if (r) return r;
    }
    return '';
  };
  // 明确的登录凭证键：美篇 userInfo / app_token，即刻 JK_ACCESS_TOKEN / JK_REFRESH_TOKEN 等
  const EXPLICIT = /^(user_?info|app_token|access_?token|refresh_?token|jk_access_token|jk_refresh_token|authorization|token)$/i;
  // 疑似键：值要足够长才当真，避免把 "1"、"true" 之类的标志位误判为登录
  const GENERIC = /token|sess|auth|login/i;
  const isCredential = (k, v) => {
    if (!v || v === 'null' || v === 'undefined' || v === '""' || v === '{}' || v === '[]') return false;
    if (/expire|exprise|device|fingerprint|fontsize/i.test(k)) return false; // 过期时间、设备号不算登录凭证
    if (EXPLICIT.test(k)) return true;
    return GENERIC.test(k) && v.length >= 20;
  };
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const v = localStorage.getItem(k) || '';
    if (!v || v === 'null' || v === 'undefined' || v === '""') continue;
    if (isCredential(k, v)) {
      loggedIn = true;
      try { name ||= findName(JSON.parse(v)); } catch { /* 不是 JSON */ }
    }
  }
  return loggedIn ? { name } : null;
}
