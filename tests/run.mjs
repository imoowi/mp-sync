// 发布前自检：node --test tests/
// 覆盖：manifest 与文件、权限说明与 host_permissions 一致、所有脚本语法、Markdown -> HTML 转换
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { md2html } from '../lib/md2html.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

test('manifest：名称、版本、引用文件都存在', () => {
  assert.equal(manifest.name, '公众号文章同步助手');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.description.length <= 132, 'Chrome 商店描述不能超过 132 字符');
  const files = [
    manifest.background.service_worker,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    ...manifest.content_scripts.flatMap((c) => c.js),
  ];
  for (const f of files) assert.ok(existsSync(join(root, f)), `缺少文件 ${f}`);
});

test('图标是对应尺寸的 PNG', () => {
  for (const [size, f] of Object.entries(manifest.icons)) {
    const b = readFileSync(join(root, f));
    assert.equal(b.toString('hex', 0, 8), '89504e470d0a1a0a', `${f} 不是 PNG`);
    assert.equal(b.readUInt32BE(16), Number(size), `${f} 宽度不对`);
    assert.equal(b.readUInt32BE(20), Number(size), `${f} 高度不对`);
  }
});

test('权限说明覆盖所有 permissions 和 host_permissions', () => {
  const doc = read('docs/permissions.md');
  for (const p of manifest.permissions) assert.ok(doc.includes('`' + p + '`'), `权限说明缺少 ${p}`);
  for (const h of manifest.host_permissions) {
    const host = h.replace(/^https:\/\//, '').replace(/\/\*$/, '');
    assert.ok(doc.includes('`' + host + '`'), `权限说明缺少站点 ${host}`);
  }
});

test('隐私政策：联系邮箱、名称、所有图片存储服务', () => {
  const html = read('docs/privacy.html');
  assert.ok(html.includes('simpleyuan@gmail.com'));
  assert.ok(html.includes('公众号文章同步助手'));
  for (const s of ['ImageX', '七牛云', '阿里云']) assert.ok(html.includes(s), `隐私政策缺少 ${s}`);
  for (const s of ['Limited Use', 'localStorage', '不向开发者', 'Microsoft Edge', 'Chrome Web Store']) {
    assert.ok(html.includes(s), `隐私政策缺少 ${s}`);
  }
});

test('审核测试说明：包含测试路径、账号占位符和权限解释', () => {
  const md = read('docs/review-notes.md');
  for (const s of ['Notes for Certification', 'PUBLIC_WECHAT_ARTICLE_URL', 'CSDN_TEST_USERNAME',
    'declarativeNetRequestWithHostAccess', '只保存草稿']) {
    assert.ok(md.includes(s), `审核测试说明缺少 ${s}`);
  }
});

test('不再残留旧名称', () => {
  const files = ['manifest.json', 'README.md', 'docs/privacy.html', 'docs/permissions.md',
    'content/panel.js', 'popup/popup.html', 'popup/editor.html'];
  for (const f of files) assert.doesNotMatch(read(f), /MP-Sync|微信文章同步助手/, f);
});

test('所有脚本语法正确', () => {
  const dirs = ['.', 'adapters', 'content', 'lib', 'popup'];
  for (const d of dirs) {
    for (const f of readdirSync(join(root, d)).filter((n) => n.endsWith('.js'))) {
      execFileSync(process.execPath, ['--check', join(root, d, f)]);
    }
  }
});

test('background.js 注册的平台都有对应适配器文件', () => {
  const bg = read('background.js');
  const imports = [...bg.matchAll(/from '\.\/adapters\/(\w+)\.js'/g)].map((m) => m[1]);
  assert.equal(imports.length, 19, '应有 19 个平台');
  for (const a of imports) assert.ok(existsSync(join(root, 'adapters', a + '.js')), a);
});

test('md2html：标题、段落、强调、链接、图片', () => {
  const h = md2html('## 标题\n\n一段 **粗体** 和 *斜体*、`code`。\n\n[链接](https://a.com)\n\n![图](https://a.com/x.png)');
  assert.match(h, /<h2[^>]*>标题<\/h2>/);
  assert.match(h, /<strong>粗体<\/strong>/);
  assert.match(h, /<em>斜体<\/em>/);
  assert.match(h, /<code>code<\/code>/);
  assert.match(h, /<a [^>]*href="https:\/\/a\.com"/);
  assert.match(h, /<img [^>]*src="https:\/\/a\.com\/x\.png"/);
});

test('md2html：代码块保留换行和缩进、转义尖括号', () => {
  const h = md2html('```go\nfunc main() {\n    a := 1 < 2\n}\n```');
  assert.match(h, /<pre[\s\S]*<code[\s\S]*func main\(\) \{\n    a := 1 &lt; 2\n\}/);
  assert.doesNotMatch(h, /<p>/);
});

test('md2html：列表、引用、表格', () => {
  const h = md2html('- a\n- b\n\n1. x\n2. y\n\n> 引用\n\n| A | B |\n|---|---|\n| 1 | 2 |');
  assert.match(h, /<ul>[\s\S]*<li>a<\/li>[\s\S]*<li>b<\/li>[\s\S]*<\/ul>/);
  assert.match(h, /<ol>[\s\S]*<li>x<\/li>/);
  assert.match(h, /<blockquote>[\s\S]*引用/);
  assert.match(h, /<table[\s\S]*<th[^>]*>A<\/th>[\s\S]*<td[^>]*>2<\/td>/);
});

test('md2html：不产生空列表项，防止 XSS 标签直通', () => {
  const h = md2html('- a\n-\n- b');
  assert.doesNotMatch(h, /<li>\s*<\/li>/);
  assert.doesNotMatch(md2html('<script>alert(1)</script>'), /<script>/);
});
