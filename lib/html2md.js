// 轻量 HTML -> Markdown 转换（使用 DOMParser，适合在 popup/页面中运行）

export function html2md(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const md = walk(doc.body.firstChild, { listDepth: 0 });
  return md.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim() + '\n';
}

function children(node, ctx) {
  return Array.from(node.childNodes).map((n) => walk(n, ctx)).join('');
}

function inline(s) {
  return s.replace(/\s*\n\s*/g, ' ');
}

function walk(node, ctx) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent.replace(/ /g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const tag = node.tagName.toLowerCase();

  switch (tag) {
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
      const t = inline(children(node, ctx)).trim();
      return t ? `\n\n${'#'.repeat(+tag[1])} ${t}\n\n` : '';
    }
    case 'p': case 'section': case 'div': {
      const t = children(node, ctx);
      return t.trim() ? `\n\n${t.trim()}\n\n` : '';
    }
    case 'br': return '  \n';
    case 'hr': return '\n\n---\n\n';
    case 'strong': case 'b': {
      const t = children(node, ctx).trim();
      return t ? `**${t}**` : '';
    }
    case 'em': case 'i': {
      const t = children(node, ctx).trim();
      return t ? `*${t}*` : '';
    }
    case 'del': case 's': {
      const t = children(node, ctx).trim();
      return t ? `~~${t}~~` : '';
    }
    case 'a': {
      const t = children(node, ctx).trim();
      const href = node.getAttribute('href') || '';
      return href && !href.startsWith('javascript') ? `[${t || href}](${href})` : t;
    }
    case 'img': {
      const src = node.getAttribute('src') || '';
      return src ? `\n\n![${node.getAttribute('alt') || ''}](${src})\n\n` : '';
    }
    case 'pre': {
      const code = node.querySelector('code') || node;
      const lang = (code.className.match(/language-(\S+)/) || [])[1] || '';
      return `\n\n\`\`\`${lang}\n${code.textContent.replace(/\n$/, '')}\n\`\`\`\n\n`;
    }
    case 'code': return '`' + node.textContent + '`';
    case 'blockquote': {
      const t = children(node, ctx).trim();
      return '\n\n' + t.split('\n').map((l) => '> ' + l).join('\n') + '\n\n';
    }
    case 'ul': case 'ol': {
      // 公众号代码块的行号列表（每行一个空 li），跳过
      if (/line-index/.test(node.className)) return '';
      const sub = { ...ctx, listDepth: ctx.listDepth + 1 };
      const indent = '  '.repeat(ctx.listDepth);
      const bodies = Array.from(node.children)
        .filter((c) => c.tagName === 'LI')
        .map((li) => children(li, sub).trim().replace(/\n{2,}/g, '\n'))
        .filter(Boolean);
      if (!bodies.length) return '';
      const out = bodies.map((body, i) => {
        const marker = tag === 'ol' ? `${i + 1}.` : '-';
        return `${indent}${marker} ${body}`;
      }).join('\n');
      return `\n\n${out}\n\n`;
    }
    case 'table': {
      const rows = Array.from(node.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.children).map((c) => inline(children(c, ctx)).trim().replace(/\|/g, '\\|')));
      if (!rows.length) return '';
      const n = Math.max(...rows.map((r) => r.length));
      const line = (r) => '| ' + Array.from({ length: n }, (_, i) => r[i] || '').join(' | ') + ' |';
      return '\n\n' + [line(rows[0]), line(Array(n).fill('---')), ...rows.slice(1).map(line)].join('\n') + '\n\n';
    }
    case 'script': case 'style': return '';
    default: return children(node, ctx);
  }
}
