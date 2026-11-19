// 轻量 Markdown -> HTML 转换（覆盖 html2md 产出的语法：标题、段落、列表、引用、代码块、表格、图片、链接等）

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function md2html(md) {
  return block(md.replace(/\r\n?/g, '\n').split('\n'));
}

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = esc(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" />')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/ {2,}\n/g, '<br />');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}

const isList = (l) => /^\s*([-*+]|\d+\.)\s+/.test(l);
const isTableSep = (l) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => inline(c.trim().replace(/\\\|/g, '|')));

function block(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (!line.trim()) { i++; continue; }

    if ((m = line.match(/^(`{3,}|~{3,})\s*(\S*)/))) {
      const fence = m[1];
      const buf = [];
      for (i++; i < lines.length && !lines[i].startsWith(fence); i++) buf.push(lines[i]);
      i++;
      out.push(`<pre><code${m[2] ? ` class="language-${esc(m[2])}"` : ''}>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      out.push(`<h${m[1].length}>${inline(m[2].replace(/\s+#+\s*$/, ''))}</h${m[1].length}>`);
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr />'); i++; continue; }
    if (/^\s*>/.test(line)) {
      const buf = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) buf.push(lines[i].replace(/^\s*> ?/, ''));
      out.push(`<blockquote>${block(buf)}</blockquote>`);
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      const rows = [];
      for (i += 2; i < lines.length && lines[i].includes('|') && lines[i].trim(); i++) rows.push(cells(lines[i]));
      out.push('<table><thead><tr>' + head.map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + head.map((_, j) => `<td>${r[j] || ''}</td>`).join('') + '</tr>').join('') +
        '</tbody></table>');
      continue;
    }
    if (isList(line)) {
      const buf = [];
      for (; i < lines.length && (isList(lines[i]) || /^\s{2,}\S/.test(lines[i])); i++) buf.push(lines[i]);
      out.push(list(buf));
      continue;
    }
    const buf = [];
    for (; i < lines.length && lines[i].trim() && !/^(#{1,6}\s|`{3,}|~{3,}|\s*>)/.test(lines[i]) && !(buf.length && isList(lines[i])); i++) {
      buf.push(lines[i]);
    }
    const p = inline(buf.join('\n')).replace(/\n/g, ' ');
    out.push(/^<img [^>]*\/>$/.test(p) ? p : `<p>${p}</p>`);
  }
  return out.join('\n');
}

function list(lines) {
  const base = lines[0].match(/^\s*/)[0].length;
  const ordered = /^\s*\d+\./.test(lines[0]);
  const items = [];
  for (const l of lines) {
    const indent = l.match(/^\s*/)[0].length;
    if (indent <= base && isList(l)) items.push([l.replace(/^\s*([-*+]|\d+\.)\s+/, '')]);
    else items[items.length - 1]?.push(l);
  }
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>` + items.map(([first, ...rest]) => {
    const sub = rest.length ? (rest.some(isList) ? list(rest.filter((l) => l.trim())) : ' ' + inline(rest.join(' ').trim())) : '';
    return `<li>${inline(first)}${sub}</li>`;
  }).join('') + `</${tag}>`;
}
