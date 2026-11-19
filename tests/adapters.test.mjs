// 适配器行为测试：不依赖真实浏览器/网络的分支（chrome API 用桩替代）：node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import douyin from '../adapters/douyin.js';

function mockChrome() {
  const created = [];
  let tabUrl = 'https://probe.example/';
  let calls = 0;
  globalThis.chrome = {
    tabs: {
      create: async ({ url }) => { created.push(url); return { id: 999, url }; },
      get: async () => ({ id: 999, url: tabUrl, status: 'complete' }),
      remove: async () => {},
      onUpdated: { addListener() {}, removeListener() {} },
    },
    scripting: {
      executeScript: async () => {
        if (calls++ === 0) {
          tabUrl = 'https://creator.douyin.com/creator-micro/content/upload?default-tab=5';
          return [{ result: { filled: true, steps: ['已填正文'] } }];
        }
        tabUrl = 'https://creator.douyin.com/creator-micro/content/post/article?creation_id=123';
        return [{ result: true }];
      },
    },
  };
  return created;
}

test('抖音：有 2 张以上图片走「图文」，没有配图自动改走「文章」形式', async () => {
  let created = mockChrome();
  const withImages = await douyin.publish({
    title: '每日一Go-MySQL-17', html: '<p>正文</p>', images: ['https://mmbiz.qpic.cn/a.jpg', 'https://mmbiz.qpic.cn/b.jpg'],
  });
  assert.match(created[0], /default-tab=3/, '有图时应打开发布图文');
  assert.match(withImages.note, /抖音图文/);

  created = mockChrome();
  const noImages = await douyin.publish({ title: '每日一Go-MySQL-17', html: '<p>正文</p>', images: [] });
  assert.match(created[0], /content\/post\/article/, '无图时应直接打开发布文章编辑器');
  assert.doesNotMatch(created[0], /content\/upload/, '不能停在发布页的视频/图文 tab');
  assert.match(noImages.note, /文章/);
  assert.equal(noImages.filledOnly, true, '没有封面时不应点存草稿');
  assert.match(noImages.note, /没有可用封面/);

  created = mockChrome();
  const withCover = await douyin.publish({
    title: '每日一Go-MySQL-17',
    html: '<p>正文</p>',
    images: [],
    cover: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  });
  assert.match(withCover.url, /creation_id=123/, '保存后应打开带 creation_id 的草稿编辑器');
  assert.match(withCover.note, /保存草稿/);
  assert.match(withCover.note, /打开草稿/);
});

test('抖音：文章标题按 30 字截断，图文标题按 55 字截断', async () => {
  const long = '标'.repeat(80);

  mockChrome();
  const article = await douyin.publish({ title: long, html: '<p>正文</p>', images: [] });
  assert.match(article.note, /标题超过 30 字，已截断/);

  mockChrome();
  const imageText = await douyin.publish({
    title: long, html: '<p>正文</p>', images: ['https://mmbiz.qpic.cn/a.jpg', 'https://mmbiz.qpic.cn/b.jpg'],
  });
  assert.match(imageText.note, /标题超过 55 字，已截断/);
});
