// 封面转存测试：用 mock fetch 验证各平台的上传链路和保存字段
import { test } from 'node:test';
import assert from 'node:assert/strict';
import csdn from '../adapters/csdn.js';
import cto51 from '../adapters/cto51.js';
import bilibili from '../adapters/bilibili.js';
import sohu from '../adapters/sohu.js';
import xueqiu from '../adapters/xueqiu.js';
import toutiao from '../adapters/toutiao.js';

const COVER = 'https://mmbiz.qpic.cn/cover.png';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const json = (o) => new Response(JSON.stringify(o), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
const image = () => new Response(new Blob([PNG], { type: 'image/png' }), {
  status: 200,
  headers: { 'Content-Type': 'image/png' },
});
const urlOf = (input) => typeof input === 'string' ? input : input.url;

test('CSDN：封面走 cover 通道上传，并写入 cover_images / cover_type', async () => {
  const calls = [];
  globalThis.chrome = { cookies: { get: async () => ({ value: 'simpleiseasy' }) } };
  globalThis.fetch = async (input, init = {}) => {
    const url = urlOf(input);
    calls.push({ url, init });
    if (url === COVER) return image();
    if (url.includes('/resource-api/v1/image/direct/upload/signature')) {
      assert.equal(init.headers['Content-Type'], 'application/json;charset=UTF-8');
      const body = JSON.parse(init.body);
      assert.equal(body.appName, 'direct_blog_coverimage');
      assert.equal(body.imageTemplate, '');
      assert.equal(body.imageSuffix, 'png');
      return json({
        code: 200,
        data: {
          provider: 'obs',
          host: 'https://storage.example',
          accessId: 'ak',
          policy: 'policy',
          signature: 'sig',
          callbackUrl: 'https://callback.example',
          callbackBody: 'cb-body',
          callbackBodyType: 'application/x-www-form-urlencoded',
          filePath: 'cover/abc.png',
          customParam: { foo: 'bar' },
        },
      });
    }
    if (url === 'https://storage.example') {
      assert.ok(init.body instanceof FormData);
      const fields = [...init.body.entries()];
      const get = (name) => fields.find(([k]) => k === name)?.[1];
      assert.equal(get('key'), 'cover/abc.png');
      assert.equal(get('policy'), 'policy');
      assert.equal(get('signature'), 'sig');
      assert.equal(get('AccessKeyId'), 'ak');
      assert.equal(get('callbackUrl'), 'https://callback.example');
      assert.equal(get('x:foo'), 'bar');
      assert.ok(get('file') instanceof Blob);
      return json({ data: { imageUrl: 'https://img.example/cover.png' } });
    }
    if (url.includes('/blog-console-api/v3/mdeditor/saveArticle')) {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.cover_images, ['https://img.example/cover.png']);
      assert.equal(body.cover_type, 1);
      return json({ code: 200, data: { id: 123 } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const r = await csdn.publish({ title: 't', markdown: 'm', html: '<p>m</p>', summary: 's', cover: COVER, images: [] });
  assert.equal(r.id, 123);
  assert.match(r.note, /已上传封面/);
  assert.ok(calls.some((c) => c.url === 'https://storage.example'));
});

test('51CTO：封面走 upload-sign + getoss + COS，并写入 banner_type / img_urls', async () => {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = urlOf(input);
    calls.push({ url, init });
    if (url === 'https://blog.51cto.com/blogger/publish') {
      return new Response('<html><meta name="csrf-token" content="csrf123"><body>写文章</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    if (url === COVER) return image();
    if (url === 'https://blog.51cto.com/blogger/upload-sign') {
      return json({
        status: 1,
        data: { url: 'https://s2.51cto.com/', sign: 'sign123', sizeLimit: 10485760, sizeLimitMessage: '10M' },
      });
    }
    if (url === 'https://blog.51cto.com/blogger/getoss') {
      const form = new URLSearchParams(init.body);
      assert.equal(form.get('uploadSign'), 'sign123');
      assert.equal(form.get('ext'), 'image/png');
      assert.equal(form.get('name'), 'image.png');
      assert.equal(form.get('uploadType'), 'image');
      return json({
        status: 1,
        data: {
          url: 'https://cos.example/',
          fields: { key: 'images/blog/cover.png', policy: 'policy', 'x-amz-signature': 'sig' },
        },
      });
    }
    if (url === 'https://cos.example/') {
      assert.ok(init.body instanceof FormData);
      const fields = [...init.body.entries()];
      assert.equal(fields.find(([k]) => k === 'key')?.[1], 'images/blog/cover.png');
      assert.equal(fields.find(([k]) => k === 'content-type')?.[1], 'image/png');
      assert.ok(fields.find(([k]) => k === 'file')?.[1] instanceof Blob);
      return new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    if (url === 'https://blog.51cto.com/blogger/draft') {
      assert.equal(init.headers['X-CSRF-Token'], 'csrf123');
      const form = new URLSearchParams(init.body);
      assert.equal(form.get('banner_type'), '1');
      assert.equal(form.get('img_urls[]'), 'https://s2.51cto.com/images/blog/cover.png');
      assert.equal(form.get('title'), 't');
      return json({ status: 1, data: { did: 456 } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const r = await cto51.publish({ title: 't', markdown: 'm', summary: 's', cover: COVER, images: [] });
  assert.equal(r.id, 456);
  assert.match(r.note, /已上传封面/);
  assert.ok(calls.some((c) => c.url === 'https://blog.51cto.com/blogger/getoss'));
});

test('B站：封面走 upcover 上传，并写入草稿 image_urls', async () => {
  globalThis.chrome = { cookies: { get: async () => ({ value: 'csrf123' }) } };
  globalThis.fetch = async (input, init = {}) => {
    const url = urlOf(input);
    if (url.includes('/x/web-interface/nav')) {
      return json({ code: 0, data: { isLogin: true, uname: 'tester' } });
    }
    if (url === COVER) return image();
    if (url.includes('/x/article/creative/article/upcover')) {
      assert.ok(init.body instanceof FormData);
      assert.equal(init.body.get('csrf'), 'csrf123');
      return json({ code: 0, data: { url: 'https://i0.hdslb.com/bfs/article/cover.png' } });
    }
    if (url.includes('/x/article/creative/draft/addupdate')) {
      const form = new URLSearchParams(init.body);
      assert.equal(form.get('image_urls'), 'https://i0.hdslb.com/bfs/article/cover.png');
      assert.match(form.get('content'), /i0\.hdslb\.com\/bfs\/article\/cover\.png/);
      return json({ code: 0, data: { aid: 789 } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const r = await bilibili.publish({
    title: 't',
    markdown: `![x](${COVER})`,
    html: `<p>m</p><img src="${COVER}">`,
    cover: COVER,
    images: [COVER],
  });
  assert.equal(r.id, 789);
  assert.match(r.note, /已上传封面/);
});

test('搜狐号：封面上传到搜狐图床，并写入草稿 cover', async () => {
  globalThis.chrome = { cookies: { get: async () => ({ value: 'cv123' }) } };
  globalThis.fetch = async (input, init = {}) => {
    const url = urlOf(input);
    if (url.includes('/mpbp/bp/account/list')) {
      return json({ data: { data: [{ accounts: [{ id: 123, nickName: 'tester' }] }] } });
    }
    if (url === COVER) return image();
    if (url.includes('/commons/front/outerUpload/image/file')) {
      return json({ url: 'https://mp.sohu.com/uploaded/cover.png' });
    }
    if (url.includes('/mpbp/bp/news/v4/news/draft/v2')) {
      const body = JSON.parse(init.body);
      assert.equal(body.cover, 'https://mp.sohu.com/uploaded/cover.png');
      return json({ success: true, data: 12 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const r = await sohu.publish({ title: 't', markdown: 'm', html: '<p>m</p>', images: [COVER] });
  assert.equal(r.id, 12);
  assert.match(r.note, /已转存 1 张图片/);
});

test('雪球：封面上传到雪球图床，并写入草稿 cover_pic', async () => {
  globalThis.fetch = async (input, init = {}) => {
    const url = urlOf(input);
    if (url === 'https://mp.xueqiu.com/writeV2') {
      return new Response(
        '<script>window.UOM_CURRENTUSER = {"currentUser":{"id":123,"screen_name":"tester"}};</script>',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    if (url === COVER) return image();
    if (url.includes('/xq/photo/upload.json')) {
      return json({ url: '//xqimg.example', filename: 'cover.png' });
    }
    if (url.includes('/xq/statuses/draft/save.json')) {
      const form = new URLSearchParams(init.body);
      assert.equal(form.get('cover_pic'), 'https://xqimg.example/cover.png');
      return json({ id: 9 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const r = await xueqiu.publish({
    title: 't',
    markdown: `![x](${COVER})`,
    html: `<p>m</p><img src="${COVER}">`,
    cover: COVER,
    images: [COVER],
  });
  assert.equal(r.id, 9);
  assert.match(r.note, /已转存 1 张图片/);
});

test('今日头条：配置独立封面上传入口', async () => {
  let payload;
  let saved = false;
  globalThis.fetch = async (input) => {
    if (String(input).startsWith('data:image/png;base64,')) return image();
    throw new Error(`unexpected fetch ${input}`);
  };
  globalThis.chrome = {
    tabs: {
      create: async ({ url }) => ({ id: 1, url }),
      get: async () => ({
        id: 1,
        url: saved
          ? 'https://mp.toutiao.com/profile_v4/graphic/draft/1'
          : 'https://mp.toutiao.com/profile_v4/graphic/publish',
        status: 'complete',
      }),
      onUpdated: { addListener() {}, removeListener() {} },
    },
    scripting: {
      executeScript: async ({ args }) => {
        payload = args[0];
        saved = true;
        return [{ result: { filled: true, steps: ['已填正文'] } }];
      },
    },
  };

  const cover = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await toutiao.publish({ title: 't', html: '<p>m</p>', images: [], cover });
  assert.deepEqual(payload.coverClickSrc, ['^单图$', '^预览$']);
  assert.match(payload.cover.dataUrl, /^data:image\/png;base64,/);
});
