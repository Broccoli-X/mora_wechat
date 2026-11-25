const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const readingPath = require.resolve('../utils/reading');
const authPath = require.resolve('../utils/auth');
const root = path.join(__dirname, '..');

function setup() {
  const requests = [];
  const storage = new Map([['mora-auth-token', 'test-token'], ['mora-auth-family', 'reader']]);
  global.wx = {
    getStorageSync: k => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    request: opts => requests.push(opts),
  };
  delete require.cache[readingPath];
  delete require.cache[authPath];
  return { reading: require(readingPath), requests, storage };
}

test('逐字拆分保留语境拼音、标点与增补区汉字', () => {
  const { reading } = setup();
  const tokens = reading.splitText('睡着，𠮷！', 'shuì zháo jí');
  assert.deepEqual(tokens.filter(t => t.isHan).map(t => [t.char, t.pinyin]),
    [['睡', 'shuì'], ['着', 'zháo'], ['𠮷', 'jí']]);
  assert.deepEqual(tokens.filter(t => !t.isHan).map(t => t.char), ['，', '！']);
});

test('共用目录按年级和册别筛选，按版本缓存文章与老师笔记，并隔离家庭', async () => {
  const { reading, requests, storage } = setup();
  const a = { id: 'seed-1', revision: 0, grade: 1, volume: '上册' };
  const b = { id: 'r-cafe', revision: 1, grade: 2, volume: '下册', author: '测试作者', titleNote: '标题笔记',
    paragraphs: [{ text: '水边', pinyin: 'shuǐ biān', note: '蝴蝶' }] };
  const list = reading.refreshList();
  requests.shift().success({ statusCode: 200, data: { ok: true, data: [a, b] } });
  assert.deepEqual(reading.group(await list, 2, '下册'), [b]);
  const pending = reading.article(b.id, b.revision);
  assert.match(requests[0].url, /\/api\/reading\/article\?id=r-cafe&token=/);
  requests.shift().success({ statusCode: 200, data: { ok: true, data: b } });
  const article = await pending;
  assert.equal(article.author, '测试作者');
  assert.equal(article.titleNote, '标题笔记');
  assert.equal(article.paragraphs[0].note, '蝴蝶');
  assert.deepEqual(await reading.article(b.id, b.revision), b);
  assert.equal(requests.length, 0);
  storage.set('mora-auth-family', 'other');
  assert.equal(reading.list(), null);
});

test('继承 Web 已读键，离线取消标记后按时间戳补传', async () => {
  const { reading, requests } = setup();
  const key = '江南|江南可采莲，';
  const remote = [{ module: 'reading', itemKey: key, mastered: 1, updatedAt: 1 }];
  const response = { statusCode: 200, data: { ok: true, items: remote } };
  const first = reading.syncProgress();
  requests.shift().success(response);
  await first;
  assert.equal(reading.isRead(key), true);
  assert.equal(reading.toggle(key), false);
  requests.shift().fail(new Error('offline'));
  const again = reading.syncProgress();
  requests.shift().success(response);
  await new Promise(resolve => setImmediate(resolve));
  const push = requests.shift();
  assert.equal(push.data.items[0].module, 'reading');
  assert.equal(push.data.items[0].itemKey, key);
  assert.equal(push.data.items[0].mastered, 0);
  push.success({ statusCode: 200, data: { ok: true } });
  await again;
  assert.equal(reading.isRead(key), false);
});

test('入口、正文、笔记和独立笔顺组件完成接线', () => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const app = JSON.parse(read('app.json'));
  assert.ok(app.pages.includes('pages/reading/reading'));
  assert.ok(app.pages.includes('pages/reading/detail'));
  assert.match(read('pages/category/category.js'), /pages\/reading\/reading', perm: 'reading'/);
  const detail = read('pages/reading/detail.wxml');
  assert.match(detail, /catchtap="tapChar"/);
  assert.match(detail, /tokens: item\.noteTokens/);
  assert.match(detail, /tokens: titleNoteTokens/);
  assert.match(detail, /wx:if="{{article.author}}"/);
  assert.match(detail, /<stroke-sheet.+bind:close="closeStroke"/);
  const sheet = read('pages/reading/stroke-sheet/stroke-sheet.wxml');
  const sheetJs = read('pages/reading/stroke-sheet/stroke-sheet.js');
  assert.match(sheet, /第 {{item}} 笔/);
  assert.match(sheetJs, /draw\.drawStep\(ctx, frames, .+, i \+ 1\)/);
  assert.doesNotMatch(sheet + sheetJs, /bindtap="play"|setTimeout|再看一遍/);
});
