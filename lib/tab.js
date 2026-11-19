// 在后台标签页中打开页面并执行脚本（用于需要真实浏览器环境的平台）

export function waitComplete(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('页面加载超时'));
    }, timeout);
    const done = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') done();
    };
    chrome.tabs.onUpdated.addListener(listener);
    // 监听注册前可能已加载完成
    chrome.tabs.get(tabId).then((t) => t.status === 'complete' && done(), () => {});
  });
}

export async function openTab(url, { active = false } = {}) {
  const tab = await chrome.tabs.create({ url, active });
  await waitComplete(tab.id);
  return chrome.tabs.get(tab.id);
}

// world: 'ISOLATED'（默认）或 'MAIN'（可访问页面自身的 JS 对象，如 UEditor 实例）
export async function runInTab(tabId, func, args = [], world = 'ISOLATED') {
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func, args, world });
  return result;
}

// 打开临时标签页 -> 执行 func -> 关闭
export async function withTempTab(url, func, args = []) {
  const tab = await openTab(url);
  try {
    return { url: tab.url, result: await runInTab(tab.id, func, args) };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}
