// 在公众号文章页右侧注入可缩小/展开的同步面板（内嵌 popup.html）
(() => {
  if (window.__mpSyncPanel) return;
  window.__mpSyncPanel = true;

  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;top:80px;right:20px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .panel { width: 364px; background: #f5f6f7; border-radius: 12px; overflow: hidden;
        box-shadow: 0 6px 24px rgba(0,0,0,.18); font: 13px -apple-system,"Segoe UI","Microsoft YaHei",sans-serif; }
      .bar { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px;
        background: #07c160; color: #fff; cursor: move; user-select: none; }
      .bar b { font-size: 13px; }
      .bar button { all: unset; cursor: pointer; padding: 0 6px; font-size: 16px; line-height: 20px; }
      iframe { display: block; width: 364px; height: 120px; border: 0; }
      .mini { display: none; width: 44px; height: 44px; border-radius: 50%; background: #07c160; color: #fff;
        font: 600 12px sans-serif; align-items: center; justify-content: center; cursor: pointer;
        box-shadow: 0 4px 14px rgba(0,0,0,.2); user-select: none; }
      :host([data-collapsed]) .panel { display: none; }
      :host([data-collapsed]) .mini { display: flex; }
    </style>
    <div class="panel">
      <div class="bar"><b>公众号文章同步助手</b><span><button class="min" title="缩小为小圆钮">×</button></span></div>
      <iframe src="${chrome.runtime.getURL('popup/popup.html')}?embed=1"></iframe>
    </div>
    <div class="mini" title="展开 公众号文章同步助手">同步</div>`;
  document.documentElement.appendChild(host);

  const iframe = root.querySelector('iframe');
  const setCollapsed = (v) => {
    host.toggleAttribute('data-collapsed', v);
    chrome.storage.local.set({ panelCollapsed: v });
  };
  chrome.storage.local.get('panelCollapsed').then(({ panelCollapsed }) => {
    host.toggleAttribute('data-collapsed', !!panelCollapsed);
  });

  root.querySelector('.min').onclick = () => setCollapsed(true);

  // 拖动：标题栏拖动面板，小圆钮拖动后不触发展开
  let drag = null;
  const start = (e) => {
    if (e.target.tagName === 'BUTTON') return;
    const r = host.getBoundingClientRect();
    drag = { x: e.clientX - r.left, y: e.clientY - r.top, moved: false };
    iframe.style.pointerEvents = 'none';
    e.preventDefault();
  };
  root.querySelector('.bar').addEventListener('mousedown', start);
  root.querySelector('.mini').addEventListener('mousedown', start);
  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    drag.moved = true;
    host.style.left = Math.max(0, Math.min(innerWidth - 44, e.clientX - drag.x)) + 'px';
    host.style.top = Math.max(0, Math.min(innerHeight - 44, e.clientY - drag.y)) + 'px';
    host.style.right = 'auto';
  });
  window.addEventListener('mouseup', () => {
    if (drag) iframe.style.pointerEvents = '';
    setTimeout(() => (drag = null));
  });
  root.querySelector('.mini').addEventListener('click', () => {
    if (!drag?.moved) setCollapsed(false);
  });

  // popup 内容高度自适应
  window.addEventListener('message', (e) => {
    if (e.data?.mpSyncHeight && e.source === iframe.contentWindow) {
      iframe.style.height = Math.min(e.data.mpSyncHeight, innerHeight - 140) + 'px';
    }
  });

  // 工具栏图标点击：切换展开/缩小
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'togglePanel') setCollapsed(!host.hasAttribute('data-collapsed'));
  });
})();
