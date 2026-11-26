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
  delete require.cache[require.resolve('../utils/hanzi')];
  return { reading: require(readingPath), requests, storage };
}

test('逐字拆分保留语境拼音、标点与增补区汉字', () => {
  const { reading } = setup();
  const tokens = reading.splitText('睡着，𠮷！', 'shuì zháo jí');
  assert.deepEqual(tokens.filter(t => t.isHan).map(t => [t.char, t.pinyin]),
    [['睡', 'shuì'], ['着', 'zháo'], ['𠮷', 'jí']]);
  assert.deepEqual(tokens.filter(t => !t.isHan).map(t => t.char), ['，', '！']);
});

test('共用目录按年级和册别筛选，按版本缓存文章与注解，并隔离家庭', async () => {
  const { reading, requests, storage } = setup();
  const a = { id: 'seed-1', revision: 0, grade: 1, volume: '上册' };
  const b = { id: 'r-cafe', revision: 1, grade: 2, volume: '下册', author: '测试作者', titleNote: '标题注解',
    paragraphs: [{ text: '水边', pinyin: 'shuǐ biān', note: '蝴蝶' }] };
  const list = reading.refreshList();
  requests.shift().success({ statusCode: 200, data: { ok: true, data: [a, b] } });
  assert.deepEqual(reading.group(await list, 2, '下册'), [b]);
  const pending = reading.article(b.id, b.revision);
  assert.match(requests[0].url, /\/api\/reading\/article\?id=r-cafe&token=/);
  requests.shift().success({ statusCode: 200, data: { ok: true, data: b } });
  const article = await pending;
  assert.equal(article.author, '测试作者');
  assert.equal(article.titleNote, '标题注解');
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

test('入口、正文、注解和独立笔顺组件完成接线', () => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const app = JSON.parse(read('app.json'));
  assert.ok(app.pages.includes('pages/reading/reading'));
  assert.ok(app.pages.includes('pages/reading/detail'));
  assert.match(read('pages/category/category.js'), /pages\/reading\/reading', perm: 'reading'/);
  const detail = read('pages/reading/detail.wxml');
  assert.match(detail, /catchtap="tapChar"/);
  assert.match(detail, /tokens: item\.noteTokens/);
  assert.match(detail, /tokens: titleNoteTokens/);
  assert.ok(detail.includes('<text>标题注解</text>') && detail.includes('<text>注解</text>'));
  assert.match(detail, /wx:if="{{article.author}}"/);
  assert.match(detail, /<stroke-sheet[^>]+article-id="{{article.id}}"[^>]+bind:close="closeStroke"/);
  assert.match(detail, /<page-meta page-style="{{strokeChar \? 'overflow: hidden;/);
  const sheet = read('pages/reading/stroke-sheet/stroke-sheet.wxml');
  const sheetJs = read('pages/reading/stroke-sheet/stroke-sheet.js');
  const scrollArea = sheet.match(/<scroll-view[\s\S]*?<\/scroll-view>/)[0];
  assert.match(scrollArea, /<image.+src="{{imagePath}}"/);
  assert.doesNotMatch(scrollArea, /<canvas/);
  assert.match(sheet, /wx:if="{{canSupplement}}".+bindtap="supplement"/);
  assert.match(sheetJs, /hanzi\.supplementStrokes\(this\.data\.char/);
  assert.match(sheetJs, /draw\.drawStep\(ctx, frames, .+, i \+ 1\)/);
  assert.match(sheetJs, /wx\.canvasToTempFilePath/);
  assert.doesNotMatch(sheet + sheetJs, /bindtap="play"|setTimeout|再看一遍/);
});


test('小程序补到的笔顺写入识字卡片与文章共用缓存', () => {
  const { requests } = setup();
  const hanzi = require('../utils/hanzi');
  const char = '穗';
  assert.equal(hanzi.strokeDataSync(char), null);
  let value;
  hanzi.supplementStrokes(char, (data) => { value = data; });
  const request = requests.shift();
  assert.match(request.url, /\/api\/hanzi-stroke\/supplement$/);
  assert.equal(request.method, 'POST');
  assert.deepEqual(request.data, { token: 'test-token', c: char });
  const strokes = ['M 0 0 Z'];
  request.success({ statusCode: 200, data: { ok: true, data: { strokes, medians: [[[0, 0]]] } } });
  assert.deepEqual(value, { strokes });
  assert.deepEqual(hanzi.strokeDataSync(char), { strokes });
});

test('从文章补笔顺使用课文 ID 和语境拼音，无笔顺时也刷新已写入的卡片', () => {
  const { requests, storage } = setup();
  const componentPath = require.resolve('../pages/reading/stroke-sheet/stroke-sheet');
  let component;
  global.Component = def => { component = def; };
  delete require.cache[componentPath];
  require(componentPath);
  const state = {
    ...component.methods,
    active: true,
    data: { ...component.data, char: '着', pinyin: 'zháo', hidePinyin: true, articleId: 'seed-1', canSupplement: true },
    setData(value) { Object.assign(this.data, value); },
  };

  state.supplement();
  const request = requests.shift();
  assert.match(request.url, /\/api\/hanzi-stroke\/supplement$/);
  assert.deepEqual(request.data, {
    token: 'test-token', c: '着', articleId: 'seed-1', pinyinParts: ['zháo', 'zh', '', 'áo'],
  });
  request.success({ statusCode: 200, data: { ok: true, data: null, cardSaved: true, strokeError: 'stroke not found' } });
  assert.match(state.data.status, /未收录/);
  assert.match(state.data.cardStatus, /已写入识字卡片/);
  assert.equal(state.data.supplementing, false);

  const refresh = requests.shift();
  assert.match(refresh.url, /\/api\/hanzi\?token=/);
  const data = {
    groups: [['reading-lesson', '课文 标题', ['着']]],
    chars: [['着', ['zháo', 'zh', '', 'áo'], '', 'reading-lesson']],
  };
  refresh.success({ statusCode: 200, data: { ok: true, data, updatedAt: 8 } });
  const hanzi = require('../utils/hanzi');
  assert.equal(hanzi.findCard('着').groupName, '课文 标题');
  assert.equal(storage.get('mora-hanzi-dataset-v1').family, 'reader');
  hanzi.fetchDataset();
  const staleRefresh = requests.shift();
  storage.set('mora-auth-family', 'other');
  staleRefresh.success({ statusCode: 200, data: { ok: true, data, updatedAt: 9 } });
  assert.equal(hanzi.findCard('着'), undefined);
  assert.equal(storage.get('mora-hanzi-dataset-v1').updatedAt, 8);
});

test('重复字卡保留分组注音，搜索命中首组，全库浏览定位所点分组', () => {
  const { requests, storage } = setup();
  storage.set('mora-hanzi-dataset-v1', {
    family: 'reader', updatedAt: 8,
    data: {
      groups: [['feeling', '😊 感受形容', ['乐']], ['reading-lesson', '音乐 课文', ['乐', '知']]],
      chars: [
        ['乐', ['yuè', 'y', 'ü', 'è'], '音乐', 'reading-lesson'],
        ['乐', ['lè', 'l', '', 'è'], '快乐', 'feeling'],
        ['知', ['zhī', 'zh', '', 'ī'], '', 'reading-lesson'],
      ],
    },
  });
  const hanzi = require('../utils/hanzi');
  storage.set('mora-hanzi-mastered-v1', ['乐']);
  assert.equal(hanzi.countAll(), 2);
  assert.equal(hanzi.countMastered(hanzi.loadMastered()), 1);
  const groups = hanzi.studyGroups(hanzi.ALL_KEY, hanzi.loadMastered());
  assert.deepEqual(groups.map(g => g.items[0].py), ['lè', 'yuè']);
  assert.ok(groups.every(g => g.items[0].mastered));

  const loadPage = name => {
    let def;
    global.Page = value => { def = value; };
    require('../pages/hanzi/' + name);
    return { ...def, data: { ...def.data }, setData(value) { Object.assign(this.data, value); } };
  };
  let navigation;
  wx.navigateTo = ({ url }) => { navigation = url; };
  const home = loadPage('hanzi');
  home.onSearchInput({ detail: { value: ' 乐 ' } });
  home.onTapSearchResult();
  assert.equal(navigation, '/pages/hanzi/detail?g=feeling&c=%E4%B9%90');

  const study = loadPage('study');
  study.render(hanzi.ALL_KEY);
  study.onTapCard({ currentTarget: { dataset: { gi: 1, ii: 0 } } });
  const options = Object.fromEntries(new URLSearchParams(navigation.split('?')[1]));
  const detail = loadPage('detail');
  detail.applyStrokes = () => {};
  wx.setNavigationBarTitle = () => {};
  detail.onLoad(options);
  requests.shift().success({ statusCode: 200, data: { ok: true, perms: ['chars'] } });
  assert.equal(detail.data.item.py, 'yuè');
  assert.equal(detail.data.item.groupName, '音乐 课文');
  assert.equal(detail.data.pos, 2);
  detail.onPrev();
  assert.equal(detail.data.item.py, 'lè');
  assert.equal(detail.data.pos, 1);
});


test('17 笔分解导出为一张可滚动的静态图，每格只标红当前笔画', () => {
  const { storage } = setup();
  const strokes = Array.from({ length: 17 }, (_, i) => 'M ' + (10 + i * 10) + ' 10 L 180 80 Z');
  storage.set('mora-hanzi-stroke-data-v1', { 穗: { strokes } });
  let component;
  global.Component = def => { component = def; };
  const componentPath = require.resolve('../pages/reading/stroke-sheet/stroke-sheet');
  delete require.cache[componentPath];
  require(componentPath);

  const cells = [];
  const noop = () => {};
  let paths, start;
  const ctx = {
    scale: noop, translate: noop, fillRect: noop, strokeRect: noop, stroke: noop, lineTo: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, closePath: noop, beginPath() { start = null; },
    moveTo(x) { if (start === null) start = x; },
    save() { paths = []; }, restore() {},
    fill() { paths.push({ color: this.fillStyle, start }); },
    fillText(label) { cells.push({ label, paths }); },
  };
  const canvas = { getContext: () => ctx };
  wx.getWindowInfo = () => ({ windowWidth: 390, windowHeight: 680, pixelRatio: 3 });
  wx.canvasToTempFilePath = options => {
    assert.equal(options.canvas, canvas);
    assert.equal(options.fileType, 'png');
    assert.ok(canvas.height <= 3000);
    options.success({ tempFilePath: 'wxfile://steps.png' });
  };
  const state = {
    ...component.methods, data: { ...component.data, char: '穗' },
    setData(value, callback) { Object.assign(this.data, value); if (callback) callback(); },
    createSelectorQuery() {
      return { select: () => ({ fields: noop }), exec: fn => fn([{ node: canvas }]) };
    },
  };
  component.lifetimes.ready.call(state);
  assert.equal(state.data.imagePath, 'wxfile://steps.png');
  assert.equal(state.data.count, 17);
  assert.ok(state.data.imageHeight > state.data.scrollHeight);
  assert.equal(cells.length, 17);
  const redStarts = cells.map(({ label, paths }, i) => {
    assert.equal(label, '第 ' + (i + 1) + ' 笔');
    const red = paths.filter(path => path.color === '#c62e2e');
    assert.equal(red.length, 1);
    assert.equal(paths.at(-1), red[0]);
    return red[0].start;
  });
  assert.ok(redStarts.every((x, i) => i === 0 || x > redStarts[i - 1]));
});
