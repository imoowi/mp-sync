import juejin from './adapters/juejin.js';
import csdn from './adapters/csdn.js';
import zhihu from './adapters/zhihu.js';
import segmentfault from './adapters/segmentfault.js';
import oschina from './adapters/oschina.js';
import cto51 from './adapters/cto51.js';
import xiaohongshu from './adapters/xiaohongshu.js';
import wechat from './adapters/wechat.js';
import toutiao from './adapters/toutiao.js';
import baijiahao from './adapters/baijiahao.js';
import douban from './adapters/douban.js';
import jianshu from './adapters/jianshu.js';
import meipian from './adapters/meipian.js';
import jike from './adapters/jike.js';
import bilibili from './adapters/bilibili.js';
import sohu from './adapters/sohu.js';
import xueqiu from './adapters/xueqiu.js';
import woshipm from './adapters/woshipm.js';
import douyin from './adapters/douyin.js';

const adapters = Object.fromEntries(
  [wechat, juejin, csdn, zhihu, xiaohongshu, segmentfault, oschina, cto51,
    toutiao, baijiahao, jianshu, douban, meipian, jike,
    bilibili, sohu, xueqiu, woshipm, douyin]
    .map((a) => [a.id, a]));

// 扩展后台发出的请求 Origin 为 chrome-extension://，部分平台（如掘金）会返回 403，
// 这里把后台请求（tabId = -1）的 Origin/Referer 改写为平台自身域名
const SPOOF = [
  ['api.juejin.cn', 'https://juejin.cn'],
  ['bizapi.csdn.net', 'https://editor.csdn.net'],
  ['imgservice.csdn.net', 'https://editor.csdn.net'],
  ['myhuaweicloud.com', 'https://editor.csdn.net'],
  ['zhuanlan.zhihu.com', 'https://zhuanlan.zhihu.com'],
  ['www.zhihu.com', 'https://www.zhihu.com'],
  ['segmentfault.com', 'https://segmentfault.com'],
  ['my.oschina.net', 'https://my.oschina.net'],
  ['apiv1.oschina.net', 'https://my.oschina.net'],
  ['creator.xiaohongshu.com', 'https://creator.xiaohongshu.com'],
  ['edith.xiaohongshu.com', 'https://www.xiaohongshu.com'],
  ['blog.51cto.com', 'https://blog.51cto.com'],
  ['myqcloud.com', 'https://blog.51cto.com'],
  ['mmbiz.qpic.cn', 'https://mp.weixin.qq.com'],
  ['mp.weixin.qq.com', 'https://mp.weixin.qq.com'],
  ['mp.toutiao.com', 'https://mp.toutiao.com'],
  ['baijiahao.baidu.com', 'https://baijiahao.baidu.com'],
  ['www.jianshu.com', 'https://www.jianshu.com'],
  ['api.bilibili.com', 'https://member.bilibili.com'],
  ['mp.sohu.com', 'https://mp.sohu.com'],
  ['mp.xueqiu.com', 'https://mp.xueqiu.com'],
  ['www.woshipm.com', 'https://www.woshipm.com'],
];

chrome.runtime.onInstalled.addListener(setupRules);
chrome.runtime.onStartup.addListener(setupRules);

async function setupRules() {
  const rules = SPOOF.map(([domain, origin], i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Origin', operation: 'set', value: origin },
        { header: 'Referer', operation: 'set', value: origin + '/' },
      ],
    },
    condition: { requestDomains: [domain], tabIds: [-1] },
  }));
  const old = await chrome.declarativeNetRequest.getSessionRules();
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: old.map((r) => r.id),
    addRules: rules,
  });
}
setupRules();

const handlers = {
  async platforms() {
    return Object.values(adapters).map(({ id, name, home }) => ({ id, name, home }));
  },

  async checkLogin({ id }) {
    try {
      return await adapters[id].checkLogin();
    } catch {
      return null;
    }
  },

  async publish({ id, article, prev }) {
    try {
      return { ok: true, ...(await adapters[id].publish(article, prev)) };
    } catch (e) {
      console.error(`[${id}]`, e);
      return { ok: false, error: e.message, notLoggedIn: !!e.notLoggedIn };
    }
  },
};

// 点击工具栏图标：在公众号文章页切换面板；面板已关闭则重新注入
// 其他任意页面：打开上次编辑的本地文章；没有则新建一篇空白文章（可直接写，或导入本地 .md 后同步）
chrome.action.onClicked.addListener(async (tab) => {
  if (!/^https:\/\/mp\.weixin\.qq\.com\/s/.test(tab.url || '')) {
    const { lastLocalDraft } = await chrome.storage.local.get('lastLocalDraft');
    let url = lastLocalDraft && (await chrome.storage.local.get(lastLocalDraft))[lastLocalDraft]
      ? lastLocalDraft.slice('draft:'.length)
      : '';
    if (!url) {
      url = 'local:' + Date.now();
      await chrome.storage.local.set({
        ['draft:' + url]: { original: { title: '', summary: '', html: '', author: '', cover: '' } },
        lastLocalDraft: 'draft:' + url,
      });
    }
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/editor.html') + '?url=' + encodeURIComponent(url) });
    return;
  }
  try {
    const [{ result: exists }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => !!window.__mpSyncPanel,
    });
    if (exists) {
      chrome.tabs.sendMessage(tab.id, { type: 'togglePanel' });
    } else {
      await chrome.storage.local.set({ panelCollapsed: false });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/panel.js'] });
    }
  } catch (e) {
    console.error('[panel]', e);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'currentTabId') {
    sendResponse(sender.tab?.id);
    return false;
  }
  const h = handlers[msg.type];
  if (!h) return false;
  h(msg).then(sendResponse);
  return true;
});
