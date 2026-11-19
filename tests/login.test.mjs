// 登录探测逻辑测试：node --test tests/
// 覆盖 readLogin 对美篇/即刻真实 localStorage 键名的识别，以及 loginFromTab 的各分支
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginFromTab, readLogin } from '../lib/login.js';

function withLocalStorage(entries) {
  const map = new Map(Object.entries(entries));
  globalThis.localStorage = {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i],
    getItem: (k) => (map.has(k) ? map.get(k) : null),
  };
}

// 模拟 Chrome 扩展 API：executeScript 对临时探测页（id 999）返回 probeResult，
// 对已打开的平台页面返回 scan(tabId)
function mockChrome({ tabs = [], scan = () => null, probeResult = undefined, probeThrows = false, injectThrows = false } = {}) {
  const store = {};
  globalThis.__probeCalls = 0;
  globalThis.chrome = {
    tabs: {
      query: async () => tabs,
      create: async ({ url }) => ({ id: 999, url }),
      get: async () => ({ id: 999, url: 'https://probe.example/', status: 'complete' }),
      remove: async () => {},
      onUpdated: { addListener() {}, removeListener() {} },
    },
    scripting: {
      executeScript: async ({ target }) => {
        if (target.tabId === 999) {
          globalThis.__probeCalls++;
          if (probeThrows) throw new Error('页面加载超时');
          return [{ result: probeResult }];
        }
        if (injectThrows) throw new Error('Cannot access contents of the page');
        return [{ result: scan(target.tabId) }];
      },
    },
    storage: {
      session: {
        get: async (k) => ({ [k]: store[k] }),
        set: async (o) => Object.assign(store, o),
      },
    },
  };
  return store;
}

test('readLogin：即刻 JK_ACCESS_TOKEN 视为已登录', () => {
  withLocalStorage({ JK_ACCESS_TOKEN: 'eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOjEyM30.abcdef123456' });
  assert.deepEqual(readLogin(), { name: '' });
});

test('readLogin：即刻无令牌（设备号等）视为未登录', () => {
  withLocalStorage({ JK_DEVICE_ID: 'f3a9c1e2b4d5f6a7b8c9', LAST_SHOW_WHATS_NEW_VERSION: '2.0' });
  assert.equal(readLogin(), null);
});

test('readLogin：美篇 userInfo 视为已登录并取昵称', () => {
  withLocalStorage({ userInfo: JSON.stringify({ userId: 1, nickname: '张三' }) });
  assert.deepEqual(readLogin(), { name: '张三' });
});

test('readLogin：美篇 app_token 视为已登录，空 userInfo 与过期时间戳不算', () => {
  withLocalStorage({ app_token: 'k9x2m7p4q1w8e5r3t6y0u2i4o6a8s1d' });
  assert.deepEqual(readLogin(), { name: '' });
  withLocalStorage({ userInfo: '{}', app_token_exprise: String(Date.now() + 259200000), login: 'true' });
  assert.equal(readLogin(), null);
});

test('readLogin：长值的 userAgent、过期键不误判', () => {
  withLocalStorage({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    accessTokenExpire: String(Date.now() + 100000),
  });
  assert.equal(readLogin(), null);
});

test('loginFromTab：没有打开页面时后台临时探测，直接使用探测结果', async () => {
  mockChrome({ tabs: [], probeResult: { name: '张三' } });
  const r = await loginFromTab('https://*.meipian.cn/*', 'https://www.meipian.cn/');
  assert.deepEqual(r, { name: '张三' });
});

test('loginFromTab：探测结果缓存，短时间内不重复打开页面', async () => {
  mockChrome({ tabs: [], probeResult: { name: '张三' } });
  const r1 = await loginFromTab('https://*.okjike.com/*', 'https://web.okjike.com/');
  const calls = globalThis.__probeCalls;
  const r2 = await loginFromTab('https://*.okjike.com/*', 'https://web.okjike.com/');
  assert.deepEqual(r1, { name: '张三' });
  assert.deepEqual(r2, { name: '张三' });
  assert.equal(globalThis.__probeCalls, calls, '第二次应命中缓存，不再打开探测页');
});

test('loginFromTab：标准域名页面明确未登录 → null，不再探测', async () => {
  mockChrome({
    tabs: [{ id: 1, url: 'https://www.meipian.cn/mine', status: 'complete' }],
    scan: () => null,
    probeResult: { name: 'x' },
  });
  const r = await loginFromTab('https://*.meipian.cn/*', 'https://www.meipian.cn/');
  assert.equal(r, null);
  assert.equal(globalThis.__probeCalls, 0, '主域名页面已给出结论，不应打开探测页');
});

test('loginFromTab：只开着其他子域名且未登录 → 仍探测主域名', async () => {
  mockChrome({
    tabs: [{ id: 2, url: 'https://meipian3.cn/editor', status: 'complete' }],
    scan: () => null,
    probeResult: { name: '李四' },
  });
  const r = await loginFromTab('https://*.meipian.cn/*', 'https://www.meipian.cn/');
  assert.deepEqual(r, { name: '李四' });
});

test('loginFromTab：注入失败且探测失败 → undefined（无法判断，不误报未登录）', async () => {
  mockChrome({
    tabs: [{ id: 3, url: 'https://www.meipian.cn/mine', status: 'complete' }],
    injectThrows: true,
    probeThrows: true,
  });
  const r = await loginFromTab('https://*.meipian.cn/*', 'https://www.meipian.cn/');
  assert.equal(r, undefined);
});

test('loginFromTab：休眠的标签页被跳过，改走探测', async () => {
  mockChrome({
    tabs: [{ id: 4, url: 'https://www.meipian.cn/mine', status: 'unloaded' }],
    probeResult: { name: '王五' },
  });
  const r = await loginFromTab('https://*.meipian.cn/*', 'https://www.meipian.cn/');
  assert.deepEqual(r, { name: '王五' });
});

test('loginFromTab：已打开页面扫到登录 → 直接返回', async () => {
  mockChrome({
    tabs: [{ id: 5, url: 'https://web.okjike.com/', status: 'complete' }],
    scan: () => ({ name: '' }),
  });
  const r = await loginFromTab('https://*.okjike.com/*', 'https://web.okjike.com/');
  assert.deepEqual(r, { name: '已登录' });
});

test('loginFromTab：未提供 probeUrl 且没有打开页面 → undefined', async () => {
  mockChrome({ tabs: [] });
  const r = await loginFromTab('https://*.okjike.com/*');
  assert.equal(r, undefined);
});
