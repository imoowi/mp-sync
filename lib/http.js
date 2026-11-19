// 通用请求工具（运行在 service worker 中）

export async function request(url, { method = 'GET', headers = {}, body, json, form, type = 'json' } = {}) {
  const init = { method, headers: { ...headers }, credentials: 'include' };
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (form !== undefined) {
    init.body = form instanceof FormData ? form : new URLSearchParams(form);
  } else if (body !== undefined) {
    init.body = body;
  }
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${method} ${url}`);
  if (type === 'response') return res;
  return type === 'json' ? res.json() : res.text();
}

export async function getCookie(url, name) {
  const c = await chrome.cookies.get({ url, name });
  return c?.value || '';
}

export function pick(html, ...regexps) {
  for (const re of regexps) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return '';
}

// 在任意嵌套 JSON 中按 key 名查找第一个非空字符串值
export function findKey(obj, re, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 12) return '';
  for (const [k, v] of Object.entries(obj)) {
    if (re.test(k) && typeof v === 'string' && v) return v;
  }
  for (const v of Object.values(obj)) {
    const r = findKey(v, re, depth + 1);
    if (r) return r;
  }
  return '';
}

export class NotLoggedIn extends Error {
  constructor(platform) {
    super(`未登录${platform}，请先在浏览器中登录`);
    this.notLoggedIn = true;
  }
}
