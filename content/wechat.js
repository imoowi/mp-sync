// 注入到公众号文章页，返回结构化文章数据（作为 executeScript 的结果）
(() => {
  const root = document.querySelector('#js_content');
  if (!root) return { error: '当前页面不是公众号文章页（未找到 #js_content）' };

  const text = (sel) => (document.querySelector(sel)?.textContent || '').trim();
  const clone = root.cloneNode(true);

  // 懒加载图片：data-src -> src
  clone.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('data-src') || img.getAttribute('src') || '';
    img.setAttribute('src', src);
    ['data-src', 'style', 'class', 'data-ratio', 'data-w', 'data-type'].forEach((a) => img.removeAttribute(a));
  });

  // 取代码文本：textContent 会丢掉 <br> 和块级元素的换行，这里手动补回
  const codeText = (node) => {
    let s = '';
    node.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) s += n.textContent;
      else if (n.nodeName === 'BR') s += '\n';
      else if (n.nodeType === Node.ELEMENT_NODE) {
        const block = /^(P|DIV|SECTION|LI)$/.test(n.nodeName);
        if (block && s && !s.endsWith('\n')) s += '\n';
        s += codeText(n);
        if (block && !s.endsWith('\n')) s += '\n';
      }
    });
    return s;
  };

  // 公众号代码块：<pre><code>行</code><code>行</code></pre> 合并为单个 code
  clone.querySelectorAll('pre').forEach((pre) => {
    const codes = pre.querySelectorAll('code');
    const content = (codes.length > 1
      ? Array.from(codes).map(codeText).join('\n')
      : codeText(pre)).replace(/ /g, ' ').replace(/\n+$/, '');
    const lang = (pre.getAttribute('data-lang') || '').trim();
    pre.innerHTML = '';
    const code = document.createElement('code');
    if (lang) code.className = 'language-' + lang;
    code.textContent = content;
    pre.appendChild(code);
  });

  // 代码块行号列表（每行一个空 li）及其他全空列表
  clone.querySelectorAll('ul,ol').forEach((list) => {
    if (/line-index/.test(list.className) || !list.textContent.trim() && !list.querySelector('img')) list.remove();
  });

  // 去掉脚本、样式与空节点
  clone.querySelectorAll('script,style,mpvoice,mpvideo,iframe').forEach((n) => n.remove());
  clone.querySelectorAll('*').forEach((n) => n.removeAttribute('style'));

  const cover =
    document.querySelector('meta[property="og:image"]')?.content ||
    clone.querySelector('img')?.getAttribute('src') || '';
  const summary = document.querySelector('meta[name="description"]')?.content || '';

  return {
    title: text('#activity-name') || document.title,
    author: text('#js_name'),
    url: location.href.split('#')[0],
    cover,
    summary,
    html: clone.innerHTML,
    images: Array.from(clone.querySelectorAll('img')).map((i) => i.getAttribute('src')).filter(Boolean),
  };
})();
