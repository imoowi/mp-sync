import { request, pick, NotLoggedIn } from '../lib/http.js';

// 微信公众号：保存到自己公众号后台的草稿箱（operate_appmsg 接口，需要后台页面 URL 中的 token）
const MP = 'https://mp.weixin.qq.com';

async function session() {
  const res = await request(MP + '/', { type: 'response' });
  const token = (res.url.match(/[?&]token=(\d+)/) || [])[1];
  if (!token) return null;
  const html = await res.text();
  const name = pick(html, /nick_name\s*[:=]\s*["']([^"']+)["']/, /class="weui-desktop-account__nickname"[^>]*>([^<]+)</);
  return { token, name: name || '已登录' };
}

const editUrl = (id, token) =>
  `${MP}/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=77&appmsgid=${id}&token=${token}&lang=zh_CN`;

// 把 <pre><code> 转为公众号编辑器的代码块结构：每行一个 <code>
// （普通 <pre> 中的换行会被公众号编辑器吞掉，变成一行）
// 不输出行号列表 <ul class="code-snippet__line-index">：外部写入时它不会被识别为行号，
// 而是渲染成一串黑点并把代码挤到右侧
// 运行在 service worker 中，没有 DOMParser，用正则处理；代码内容已是转义过的 HTML
function wechatCode(html) {
  return html.replace(/<pre[^>]*>\s*<code([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/g, (_, attrs, body) => {
    const lang = ((attrs.match(/language-([\w+#-]+)/) || [])[1] || 'plaintext').toLowerCase();
    const lines = body.replace(/\n+$/, '').split('\n');
    const cls = `code-snippet__${lang}`;
    return `<section class="code-snippet__fix ${cls}">` +
      `<pre class="${cls}" data-lang="${lang}">` +
      lines.map((l) => `<code><span leaf="">${l || '<br>'}</span></code>`).join('') +
      '</pre></section>';
  });
}

export default {
  id: 'wechat',
  name: '微信公众号',
  home: MP + '/',

  async checkLogin() {
    try {
      const s = await session();
      return s ? { name: s.name } : null;
    } catch {
      return null;
    }
  },

  // prev: 上次同步结果 { id }，存在时更新原草稿，失败（如草稿已删除）再新建
  async publish(article, prev) {
    const s = await session();
    if (!s) throw new NotLoggedIn(this.name);
    // 封面：原文封面本身就在微信 CDN（mmbiz.qpic.cn），直接引用；没有则用正文第一张图
    const cover = (article.cover || article.images?.[0] || '').replace(/^http:/, 'https:');
    const save = async (appMsgId) => {
      const sub = appMsgId ? 'update' : 'create';
      const r = await request(`${MP}/cgi-bin/operate_appmsg?t=ajax-response&sub=${sub}&type=77&token=${s.token}&lang=zh_CN`, {
        method: 'POST',
        form: {
          token: s.token, lang: 'zh_CN', f: 'json', ajax: '1', random: String(Math.random()),
          AppMsgId: appMsgId || '', count: '1', data_seq: '0', operate_from: 'Chrome', isnew: '0',
          title0: article.title.slice(0, 64),
          author0: (article.author || '').slice(0, 16),
          writerid0: '0',
          digest0: (article.summary || '').slice(0, 120),
          auto_gen_digest0: article.summary ? '0' : '1',
          content0: wechatCode(article.html),
          sourceurl0: '',
          need_open_comment0: '1', only_fans_can_comment0: '0',
          fileid0: '', cdn_url0: cover, cdn_235_1_url0: cover, cdn_1_1_url0: cover, cdn_url_back0: cover, crop_list0: '',
          show_cover_pic0: '0', copyright_type0: '0', can_reward0: '0', is_share_copyright0: '0',
          share_page_type0: '0', share_imageinfo0: '{"list":[]}', dot0: '{}', categories_list0: '[]',
        },
      });
      const ret = r.base_resp?.ret ?? r.ret;
      if (ret !== 0) throw new Error(`公众号保存草稿失败（ret=${ret}${r.base_resp?.err_msg ? '，' + r.base_resp.err_msg : ''}）`);
      return String(r.appMsgId || appMsgId);
    };

    // 草稿被删除或已发表时，update 接口仍可能返回成功，需打开编辑页确认草稿还在
    const exists = async (id) => {
      try {
        const html = await request(editUrl(id, s.token), { type: 'text' });
        return !/此草稿已被删除|此草稿已发表|草稿不存在/.test(html);
      } catch {
        return false;
      }
    };

    if (prev?.id) {
      if (await exists(prev.id)) {
        try {
          const id = await save(prev.id);
          return { id, updated: true, url: editUrl(id, s.token) };
        } catch (e) {
          console.warn('[wechat] 更新草稿失败，改为新建', e);
        }
      } else {
        console.warn('[wechat] 原草稿已删除或已发表，改为新建', prev.id);
      }
    }
    const id = await save('');
    return { id, url: editUrl(id, s.token), note: cover ? '已保存到公众号草稿箱（含封面）' : '已保存到公众号草稿箱，原文无封面，发布前请设置' };
  },
};
