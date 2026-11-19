import { NotLoggedIn } from '../lib/http.js';
import { openTab, runInTab } from '../lib/tab.js';

// 开源中国（新版）：在编辑器页面中调用 apiv1.oschina.net 保存草稿，请求自动带上页面的登录态
// 个人空间 uid 由用户在面板中填写一次（如 1538378），保存在 storage 中
const editorUrl = (uid) => `https://my.oschina.net/u/${uid}/blog/ai-write?type=blog`;

async function getUid() {
  const { oschinaSpace = '' } = await chrome.storage.local.get('oschinaSpace');
  return (oschinaSpace.match(/(\d+)/) || [])[1] || '';
}

export default {
  id: 'oschina',
  name: '开源中国',
  home: 'https://www.oschina.net/home/login',

  async checkLogin() {
    const uid = await getUid();
    return uid ? { name: 'u/' + uid } : { debug: '请填写个人主页地址', needSpace: true };
  },

  // prev: 上次同步结果 { id }，带上 id 尝试更新原草稿；接口不认 id 时会新建
  async publish(article, prev) {
    const uid = await getUid();
    if (!uid) throw new NotLoggedIn(this.name);
    const tab = await openTab(editorUrl(uid));
    try {
      if (/login/.test(tab.url)) throw new NotLoggedIn(this.name);
      const r = await runInTab(tab.id, saveDraft, [+uid, article.title, article.markdown, prev?.id || null]);
      console.log('[oschina] save_draft', r);
      if (r.error) throw new Error('开源中国：' + r.error);
      // 编辑器页可能从 u/<uid> 跳转到个性域名（如 /iyaoqing/），草稿地址沿用实际空间路径
      const space = (tab.url.match(/^https:\/\/my\.oschina\.net\/(u\/\d+|[^/?#]+)\//) || [])[1] || `u/${uid}`;
      const id = r.id || prev?.id;
      return {
        id,
        updated: !!prev?.id && String(id) === String(prev.id),
        url: id ? `https://my.oschina.net/${space}/blog/write/draft/${id}` : `https://my.oschina.net/${space}/?key=blog-sync`,
        note: `草稿 ID ${id}`,
      };
    } finally {
      chrome.tabs.remove(tab.id).catch(() => {});
    }
  },
};

// 在开源中国编辑器页面中执行
async function saveDraft(uid, title, content, id) {
  try {
    const res = await fetch('https://apiv1.oschina.net/oschinapi/api/draft/save_draft', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(id ? { id } : {}),
        title,
        user: uid,
        content,
        contentType: 1,
        catalog: 0,
        originUrl: '',
        privacy: true,
        disableComment: false,
      }),
    });
    const text = await res.text();
    let r;
    try { r = JSON.parse(text); } catch { return { error: `HTTP ${res.status} ${text.slice(0, 120)}` }; }
    if (!r.success) return { error: r.message || text.slice(0, 120) };
    return { id: r.result?.id };
  } catch (e) {
    return { error: e.message };
  }
}
