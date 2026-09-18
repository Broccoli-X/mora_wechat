/* 识记学习三个页面的接线测试:mock Page/wx,把 onLoad/onShow/手势跑一遍,校验 setData 结果。
   utils 侧逻辑由 tests/recognition.test.js 覆盖,这里只钉页面接线:
   权限拦截(未开通不呈现/不取数)、分节渲染、两步取数、缓存兜底、404、卡片点击、
   禅模式手势与循环换卡、识图图片失败回退。不依赖微信环境。
   运行:node tests/recognition-pages.test.js */
const assert = require('assert');
const path = require('path');

/* ── Page/wx mock:Page 捕获页面配置,实例化后按微信语义做浅合并 setData ── */
let store = new Map();
let reqs = [];
let routes = {};
let page = null;
let navs = [];
let toasts = [];
let titles = [];
let vibes = 0;

global.getCurrentPages = () => [{ route: 'pages/recognition/recognition', options: {} }];
global.Page = o => { page = o; };
global.wx = {
  getStorageSync: k => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: k => { store.delete(k); },
  getStorageInfoSync: () => ({ keys: [...store.keys()] }),
  getDeviceInfo: () => ({ platform: 'devtools' }),
  getWindowInfo: () => ({ statusBarHeight: 47 }),
  navigateTo: o => navs.push(o.url),
  navigateBack: () => navs.push('back'),
  reLaunch: o => navs.push('reLaunch:' + o.url),
  setNavigationBarTitle: o => titles.push(o.title),
  showToast: o => toasts.push(o.title),
  stopPullDownRefresh: () => {},
  vibrateShort: () => { vibes++; },
  request(o) {
    reqs.push(o.url);
    for (const key of Object.keys(routes)) {
      if (o.url.indexOf(key) >= 0) {
        const r = routes[key];
        if (r === null) { if (o.fail) o.fail(); return; }   // null = 网络失败
        if (o.success) o.success(r);
        return;
      }
    }
    if (o.fail) o.fail();
  },
};

const rc = require('../utils/recognition');

const LIST = {
  statusCode: 200,
  data: { ok: true, batches: [
    { id: 'rbhanzi01', subject: 'hanzi', title: '第5课生字', day: '2026-09-11', note: '每天读两遍', count: 3, updatedAt: 100 },
    { id: 'rbwords01', subject: 'words', title: 'Unit 1 单词', day: '2026-09-12', note: '', count: 2, updatedAt: 200 },
    { id: 'rbimage01', subject: 'image', title: '动物图卡', day: '2026-09-12', note: '', count: 2, updatedAt: 300 },
  ] },
};
const BATCHES = {
  rbhanzi01: { id: 'rbhanzi01', subject: 'hanzi', title: '第5课生字', day: '2026-09-11', note: '每天读两遍', count: 3,
    updatedAt: 100, items: [{ face: '口', answer: 'kǒu', extra: '人口' }, { face: '耳', answer: 'ěr', extra: '' }, { face: '目', answer: 'mù', extra: '' }] },
  rbwords01: { id: 'rbwords01', subject: 'words', title: 'Unit 1 单词', day: '2026-09-12', note: '', count: 2,
    updatedAt: 200, items: [{ face: 'apple', answer: '苹果', extra: '/ˈæpl/' }, { face: 'cat', answer: '小猫', extra: '/kæt/' }] },
  rbimage01: { id: 'rbimage01', subject: 'image', title: '动物图卡', day: '2026-09-12', note: '', count: 2,
    updatedAt: 300, items: [{ face: '🐶', answer: '小狗', extra: 'dog', img: 'imgabc123' }, { face: '🐱', answer: '小猫', extra: 'cat', img: 'imgdef456' }] },
  rbart0001: { id: 'rbart0001', subject: 'article', title: '', day: '2026-09-15', note: '', count: 2, lang: 'zh',
    updatedAt: 400,
    items: [{ text: '池塘里有一群小蝌蚪,大大的脑袋,黑灰色的身子。' }, { text: '小蝌蚪游哇游,过了几天,长出了两条后腿。' }] },
};

/* 载入页面文件并实例化(setData 支持 'batch.items' 这类路径,与微信同款) */
function load(file) {
  page = null;
  delete require.cache[require.resolve(file)];
  require(file);
  const inst = Object.create(page);
  inst.data = JSON.parse(JSON.stringify(page.data));
  inst.setData = function (patch) {
    Object.keys(patch).forEach(k => {
      if (k.indexOf('.') > 0) {
        const parts = k.split('.');
        this.data[parts[0]] = Object.assign({}, this.data[parts[0]]);
        this.data[parts[0]][parts[1]] = patch[k];
      } else this.data[k] = patch[k];
    });
  };
  return inst;
}
const PAGE = p => path.join(__dirname, '..', 'pages', 'recognition', p);

function reset(extraRoutes) {
  store.clear();
  reqs = []; navs = []; toasts = []; titles = []; vibes = 0;
  routes = Object.assign(
    { '/api/perms': { statusCode: 200, data: { ok: true, perms: ['recognition'] } } },
    extraRoutes || {});
  store.set('mora-auth-token', 'T');
}

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }

/* ── 列表页 ── */
test('列表页:未开通 recognition 整页拦截且不发起取数', () => {
  reset({ '/api/perms': { statusCode: 200, data: { ok: true, perms: ['poems'] } }, '/api/recognition/batches': LIST });
  const p = load(PAGE('recognition.js'));
  p.onShow();
  assert.equal(p.data.blocked, true);
  assert.ok(!reqs.some(u => u.indexOf('/api/recognition') >= 0), '未开通不取数');
});

test('列表页:三科分节(顺序/日期文案/条数)与概览胶囊', () => {
  reset({ '/api/recognition/batches': LIST });
  const p = load(PAGE('recognition.js'));
  p.onShow();
  assert.equal(p.data.blocked, false);
  assert.equal(p.data.total, 3);
  assert.equal(p.data.itemCount, 7);
  assert.deepEqual(p.data.sections.map(s => s.key), ['hanzi', 'words', 'image']);
  assert.deepEqual(p.data.sections[0].batches.map(b => b.title), ['第5课生字']);
  assert.equal(p.data.sections[0].batches[0].dayCN, '9月11日 星期五');
  assert.equal(p.data.sections[2].batches[0].count, 2);
  assert.equal(p.data.empty, false);
});

test('列表页:取数失败且无缓存 → 报错可重试;有缓存 → 离线用缓存渲染', () => {
  reset({ '/api/recognition/batches': null });
  const p = load(PAGE('recognition.js'));
  p.onShow();
  assert.equal(p.data.loadError, true);

  reset({ '/api/recognition/batches': LIST });
  load(PAGE('recognition.js')).onShow();          // 先成功一次写进缓存
  routes = { '/api/perms': { statusCode: 200, data: { ok: true, perms: ['recognition'] } }, '/api/recognition/batches': null };
  store.set('mora-auth-token', 'T');
  const p3 = load(PAGE('recognition.js'));
  p3.onShow();
  assert.equal(p3.data.loadError, false, '离线用缓存渲染,不报错');
  assert.equal(p3.data.sections.length, 3);
});

test('列表页:空列表给引导文案;点批次卡跳详情页', () => {
  reset({ '/api/recognition/batches': { statusCode: 200, data: { ok: true, batches: [] } } });
  const p = load(PAGE('recognition.js'));
  p.onShow();
  assert.equal(p.data.empty, true);

  reset({ '/api/recognition/batches': LIST });
  const p2 = load(PAGE('recognition.js'));
  p2.onShow();
  p2.onTapBatch({ currentTarget: { dataset: { id: 'rbhanzi01' } } });
  assert.deepEqual(navs, ['/pages/recognition/batch?id=rbhanzi01']);
});

test('列表页:学文章分节(节头/无标题显示名兜底/条段单位);副标题含学文章', () => {
  const preview = '池塘里有一群小蝌蚪,大大的脑袋';   // 14 字,服务端预览口径 ≤20
  const list = { statusCode: 200, data: { ok: true, batches: [
    { id: 'rbart0001', subject: 'article', title: '', day: '2026-09-15', note: '', count: 2, updatedAt: 400, preview: preview, lang: 'zh' },
    { id: 'rbhanzi01', subject: 'hanzi', title: '第5课生字', day: '2026-09-11', note: '', count: 3, updatedAt: 100 },
  ] } };
  reset({ '/api/recognition/batches': list });
  const p = load(PAGE('recognition.js'));
  p.onShow();
  assert.deepEqual(p.data.sections.map(s => s.key), ['hanzi', 'article'], '文章节固定在最后');
  assert.equal(p.data.sections[1].name, '学文章');
  assert.equal(p.data.sections[1].subject, '语文/英语');
  const b = p.data.sections[1].batches[0];
  assert.equal(b.dispTitle, preview.slice(0, 12) + '…', '无标题批次卡用首条原文开头当名字');
  assert.equal(b.unit, '段', '学文章计数按段');
  assert.equal(p.data.sections[0].batches[0].unit, '条', '其余学科计数按条');
  const fs = require('fs');
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages', 'recognition', 'recognition.wxml'), 'utf8');
  assert.ok(wxml.indexOf('学文章') >= 0, '副标题应列出学文章');
});

/* ── 批次页 ── */
test('批次页:按 id 取整批 → 卡片数组/头部/导航标题;点卡片或开始按钮进禅模式', () => {
  reset({ '/api/recognition/batch': { statusCode: 200, data: { ok: true, batch: BATCHES.rbwords01 } } });
  const p = load(PAGE('batch.js'));
  p.onLoad({ id: 'rbwords01' });
  p.onShow();
  assert.equal(p.data.batch.title, 'Unit 1 单词');
  assert.equal(p.data.batch.count, 2);
  assert.equal(p.data.batch.dayCN, '9月12日 星期六');
  assert.deepEqual(p.data.batch.items.map(i => [i.face, i.answer, i.extra, i.labelA, i.labelB]),
    [['apple', '苹果', '/ˈæpl/', '中文', '音标'], ['cat', '小猫', '/kæt/', '中文', '音标']]);
  assert.deepEqual(titles, ['Unit 1 单词'], '导航标题用批次名');
  p.onTapCard({ currentTarget: { dataset: { i: 1 } } });
  assert.deepEqual(navs, ['/pages/recognition/zen?id=rbwords01&i=1']);
  p.onStart();
  assert.equal(navs[1], '/pages/recognition/zen?id=rbwords01&i=0');
});

test('批次页:识图图片地址与加载失败就地回退;404 提示批次已不在', () => {
  reset({ '/api/recognition/batch': { statusCode: 200, data: { ok: true, batch: BATCHES.rbimage01 } } });
  const p = load(PAGE('batch.js'));
  p.onLoad({ id: 'rbimage01' });
  p.onShow();
  assert.equal(p.data.batch.items[0].imgUrl, 'https://www.tcued.com/api/image?id=imgabc123');
  p.onImgError({ currentTarget: { dataset: { i: 0 } } });
  assert.equal(p.data.batch.items[0].failed, true);
  assert.equal(p.data.batch.items[1].failed, undefined, '只影响该张');

  reset({ '/api/recognition/batch': { statusCode: 404 } });
  const p2 = load(PAGE('batch.js'));
  p2.onLoad({ id: 'rbgone001' });
  p2.onShow();
  assert.equal(p2.data.gone, true);
  assert.equal(p2.data.loadError, false);
  assert.equal(p2.data.batch, null);
  p2.onBack();
  assert.ok(navs.indexOf('back') >= 0, '返回上一页');
});

test('批次页:含空格/大写的条文全量呈现,头部条数与卡片数一致(曾 11 条只显示 6 条)', () => {
  const live = {
    id: 'rbmtwr4gglfu404u', subject: 'words', title: 'Unit 1 I’m Liu Tao', day: '2026-09-11',
    note: '', count: 6, updatedAt: 1789118822600,
    items: [
      { face: 'Hi', answer: '你好', extra: '/haɪ/' },
      { face: 'Yang Ling', answer: '杨玲', extra: '' },
      { face: 'Liu Tao', answer: '刘涛', extra: '' },
      { face: 'I am', answer: '我是', extra: '' },
      { face: 'Good morning, Miss Li.', answer: '早上好,李老师', extra: '' },
    ],
  };
  reset({ '/api/recognition/batch': { statusCode: 200, data: { ok: true, batch: live } } });
  const p = load(PAGE('batch.js'));
  p.onLoad({ id: live.id });
  p.onShow();
  assert.equal(p.data.batch.items.length, 5, '人名/整句一条都不能少');
  assert.equal(p.data.batch.count, 5, '头部条数与实际卡片数一致(不再出现 6/11 对不上)');
  assert.deepEqual(p.data.batch.items.map(i => i.face),
    ['Hi', 'Yang Ling', 'Liu Tao', 'I am', 'Good morning, Miss Li.'], '大小写照原样');
  assert.deepEqual(p.data.batch.items.map(i => i.fs), ['lg', 'lg', 'lg', 'lg', 'md'], '长句用小档字号');
  p.onStart();
  assert.deepEqual(navs, ['/pages/recognition/zen?id=' + live.id + '&i=0']);
});

test('批次页:学文章头部(语种胶囊/单位/开始文案)与单列卡片字段(段号+预览+全文)', () => {
  reset({ '/api/recognition/batch': { statusCode: 200, data: { ok: true, batch: BATCHES.rbart0001 } } });
  const p = load(PAGE('batch.js'));
  p.onLoad({ id: 'rbart0001' });
  p.onShow();
  assert.equal(p.data.batch.langText, '语文', '文章批次头部带语种');
  assert.equal(p.data.batch.unit, '段');
  assert.ok(p.data.batch.goText.indexOf('开始学习') >= 0 && p.data.batch.goText.indexOf('2 段') >= 0,
    '学文章开始按钮换文案并带段数');
  assert.deepEqual(p.data.batch.items.map(i => i.paraNo), [1, 2], '段号从 1 起');
  assert.equal(p.data.batch.items[0].flip, false, '文章卡不翻面');
  assert.ok(p.data.batch.items[0].text.indexOf('池塘') >= 0, '全文在卡数据里(禅模式用)');
  assert.ok(p.data.batch.items[0].preview.length <= rc.PREVIEW_MAX + 1, '预览不超上限(含省略号)');
  assert.deepEqual(titles, [p.data.batch.title], '导航标题用批次显示名');
  assert.ok(p.data.batch.title.indexOf('…') >= 0, '无标题批次导航标题用兜底显示名');
});

test('批次页(静态契约):学文章分支独立成块,单列网格类与段号标都在', () => {
  const fs = require('fs');
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages', 'recognition', 'batch.wxml'), 'utf8');
  const iArt = wxml.indexOf("item.kind === 'article'");
  assert.ok(iArt > 0, '网格卡应有学文章分支');
  const artBlock = wxml.slice(iArt, wxml.indexOf('</block>', iArt));
  assert.ok(artBlock.indexOf('paraNo') >= 0, '段号标(第 N 段)');
  assert.ok(artBlock.indexOf('preview') >= 0, '预览文本');
  ['answer', 'extra', 'labelA'].forEach(k => {
    assert.ok(artBlock.indexOf(k) < 0, '文章卡不该出现答案栏字段 ' + k);
  });
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages', 'recognition', 'batch.wxss'), 'utf8');
  assert.ok(wxss.indexOf('.grid-article') >= 0, '学文章单列网格样式');
});

/* ── 禅模式 ── */
test('禅模式:深链按 id+i 进入,避让状态栏,首张无旧卡', () => {  reset({ '/api/recognition/batch': { statusCode: 200, data: { ok: true, batch: BATCHES.rbhanzi01 } } });
  const p = load(PAGE('zen.js'));
  p.onLoad({ id: 'rbhanzi01', i: '1' });
  assert.equal(p.data.title, '第5课生字');
  assert.equal(p.data.total, 3);
  assert.equal(p.data.cur, 1);
  assert.equal(p.data.item.face, '耳');
  assert.equal(p.data.item.labelA, '拼音');
  assert.equal(p.data.statusBarH, 47);
  assert.equal(p.data.prev, null);
});

test('禅模式:左滑下一张(旧卡飞左/新卡自右入),右滑上一张,首尾循环,带轻震动', () => {
  reset({ '/api/recognition/batch': { statusCode: 200, data: { ok: true, batch: BATCHES.rbhanzi01 } } });
  const p = load(PAGE('zen.js'));
  p.onLoad({ id: 'rbhanzi01', i: '0' });
  const seq0 = p.data.seq;
  p.onTouchStart({ touches: [{ clientX: 300, clientY: 400 }] });
  p.onTouchEnd({ changedTouches: [{ clientX: 200, clientY: 402 }] });     // 左滑
  assert.equal(p.data.cur, 1);
  assert.equal(p.data.item.face, '耳');
  assert.equal(p.data.prev.face, '口', '旧卡留下做飞出动画');
  assert.equal(p.data.dir, 'l');
  assert.equal(p.data.seq, seq0 + 1, 'seq 递增 → 奇偶类名交替强制重放');
  assert.equal(vibes, 1);

  p.onTouchStart({ touches: [{ clientX: 200, clientY: 400 }] });
  p.onTouchEnd({ changedTouches: [{ clientX: 300, clientY: 400 }] });     // 右滑
  assert.equal(p.data.cur, 0);
  assert.equal(p.data.dir, 'r');

  p.onTouchStart({ touches: [{ clientX: 200, clientY: 400 }] });
  p.onTouchEnd({ changedTouches: [{ clientX: 300, clientY: 400 }] });     // 第一张右滑
  assert.equal(p.data.cur, 2, '循环到上一张=最后一张');
  p.onTouchStart({ touches: [{ clientX: 300, clientY: 400 }] });
  p.onTouchEnd({ changedTouches: [{ clientX: 200, clientY: 400 }] });     // 最后一张左滑
  assert.equal(p.data.cur, 0, '循环回第一张');
});

test('禅模式:竖向滑动/轻扫不换卡;单张批次滑动不响应(不重放动画)', () => {
  reset({ '/api/recognition/batch': { statusCode: 200, data: { ok: true, batch: BATCHES.rbhanzi01 } } });
  const p = load(PAGE('zen.js'));
  p.onLoad({ id: 'rbhanzi01', i: '0' });
  p.onTouchStart({ touches: [{ clientX: 300, clientY: 300 }] });
  p.onTouchEnd({ changedTouches: [{ clientX: 300, clientY: 460 }] });
  assert.equal(p.data.cur, 0, '竖向滑动不换卡');
  p.onTouchStart({ touches: [{ clientX: 300, clientY: 300 }] });
  p.onTouchEnd({ changedTouches: [{ clientX: 280, clientY: 300 }] });
  assert.equal(p.data.cur, 0, '位移不足不换卡');

  reset({ '/api/recognition/batch': { statusCode: 200, data: { ok: true, batch: {
    id: 'rbone0001', subject: 'hanzi', title: '单张', day: '2026-09-11', count: 1, updatedAt: 1,
    items: [{ face: '一', answer: 'yī' }] } } } });
  const p2 = load(PAGE('zen.js'));
  p2.onLoad({ id: 'rbone0001', i: '0' });
  p2.onTouchStart({ touches: [{ clientX: 300, clientY: 400 }] });
  p2.onTouchEnd({ changedTouches: [{ clientX: 200, clientY: 400 }] });
  assert.equal(p2.data.cur, 0);
  assert.equal(p2.data.seq, 1, '单张不重放动画');
});

test('禅模式:点卡片翻面看意思(学英语/识图),再点翻回;滑动换卡不带翻面', () => {
  reset({ '/api/recognition/batch': { statusCode: 200, data: { ok: true, batch: BATCHES.rbwords01 } } });
  const p = load(PAGE('zen.js'));
  p.onLoad({ id: 'rbwords01', i: '0' });
  const tap = () => {
    p.onTouchStart({ touches: [{ clientX: 300, clientY: 400 }] });
    p.onTouchEnd({ changedTouches: [{ clientX: 302, clientY: 401 }] });   // 原地轻点
  };
  assert.equal(p.data.item.flip, true, '学英语正面只给主体,可翻面');
  assert.equal(p.data.item.flipped, false, '起手是正面');
  tap();
  assert.equal(p.data.item.flipped, true, '翻到背面看意思');
  assert.equal(p.data.item.face, 'apple', '主体信息还在卡里(背面靠 CSS 转过去)');
  assert.equal(p.data.item.answer, '苹果');
  tap();
  assert.equal(p.data.item.flipped, false, '再点翻回正面');
  assert.equal(p.data.cur, 0, '轻点不换卡');

  /* 翻面状态下滑动换卡:新卡一定正面,旧卡保留当时的面(飞出去时不突然翻回来) */
  tap();
  assert.equal(p.data.item.flipped, true);
  p.onTouchStart({ touches: [{ clientX: 300, clientY: 400 }] });
  p.onTouchEnd({ changedTouches: [{ clientX: 200, clientY: 402 }] });
  assert.equal(p.data.cur, 1, '换到下一张');
  assert.equal(p.data.item.flipped, false, '新卡从正面起,不泄露下一条答案');
  assert.equal(p.data.prev.flipped, true, '旧卡保持当时的背面');
});

test('禅模式:识汉字不翻面(点卡片保持正面全给),提示语随学科分档', () => {
  reset({ '/api/recognition/batch': { statusCode: 200, data: { ok: true, batch: BATCHES.rbhanzi01 } } });
  const p = load(PAGE('zen.js'));
  p.onLoad({ id: 'rbhanzi01', i: '0' });
  assert.equal(p.data.item.flip, false, '识汉字不翻转');
  assert.ok(p.data.hint.indexOf('点卡片看意思') < 0, '识汉字提示语不提翻面');
  assert.ok(p.data.hint.indexOf('左滑下一张') >= 0);
  p.onTouchStart({ touches: [{ clientX: 300, clientY: 400 }] });
  p.onTouchEnd({ changedTouches: [{ clientX: 300, clientY: 400 }] });
  assert.equal(p.data.item.flipped, false, '点了也不翻');

  reset({ '/api/recognition/batch': { statusCode: 200, data: { ok: true, batch: BATCHES.rbwords01 } } });
  const p2 = load(PAGE('zen.js'));
  p2.onLoad({ id: 'rbwords01', i: '0' });
  assert.ok(p2.data.hint.indexOf('点卡片看意思') === 0, '学英语提示语先说点卡片看意思');
});

test('禅模式:学文章不翻面、全文上卡,提示语按段口径,左右滑动换段循环', () => {
  reset({ '/api/recognition/batch': { statusCode: 200, data: { ok: true, batch: BATCHES.rbart0001 } } });
  const p = load(PAGE('zen.js'));
  p.onLoad({ id: 'rbart0001', i: '0' });
  assert.equal(p.data.item.flip, false);
  assert.equal(p.data.item.artFs, 'lg', '短段大字档');
  assert.ok(p.data.item.text.indexOf('池塘') >= 0, '全文在卡里');
  assert.ok(p.data.hint.indexOf('下一段') >= 0, '文章提示语按段');
  assert.ok(p.data.hint.indexOf('点卡片看意思') < 0, '无答案栏,不提示翻面');
  const tap = () => {
    p.onTouchStart({ touches: [{ clientX: 300, clientY: 400 }] });
    p.onTouchEnd({ changedTouches: [{ clientX: 302, clientY: 401 }] });
  };
  tap();
  assert.equal(p.data.item.flipped, false, '点了也不翻');
  assert.equal(p.data.cur, 0, '轻点不换段');
  p.onTouchStart({ touches: [{ clientX: 300, clientY: 400 }] });
  p.onTouchEnd({ changedTouches: [{ clientX: 200, clientY: 400 }] });
  assert.equal(p.data.cur, 1, '左滑下一段');
  p.onTouchStart({ touches: [{ clientX: 300, clientY: 400 }] });
  p.onTouchEnd({ changedTouches: [{ clientX: 200, clientY: 400 }] });
  assert.equal(p.data.cur, 0, '末段左滑循环回第一段');
});

test('禅模式:学文章单段批次提示「这篇只有一段」;整篇长文走可滚动档', () => {
  reset({ '/api/recognition/batch': { statusCode: 200, data: { ok: true, batch: {
    id: 'rbart0002', subject: 'article', title: '春晓', day: '2026-09-16', count: 1, lang: 'en', updatedAt: 1,
    items: [{ text: '春眠不觉晓,处处闻啼鸟。' }] } } } });
  const p = load(PAGE('zen.js'));
  p.onLoad({ id: 'rbart0002', i: '0' });
  assert.ok(p.data.hint.indexOf('这篇只有一段') >= 0, '单段提示语按文章口径');

  reset({ '/api/recognition/batch': { statusCode: 200, data: { ok: true, batch: {
    id: 'rbart0003', subject: 'article', title: '', day: '2026-09-16', count: 1, lang: 'zh', updatedAt: 1,
    items: [{ text: '春'.repeat(400) }] } } } });
  const p2 = load(PAGE('zen.js'));
  p2.onLoad({ id: 'rbart0003', i: '0' });
  assert.equal(p2.data.item.artFs, 'sm', '整篇长文走小字可滚动档');
});

test('禅模式学文章卡(静态契约):全文分支独立于翻面/汉字分支,长文可滚动,无答案字段', () => {
  const fs = require('fs');
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages', 'recognition', 'zen.wxml'), 'utf8');
  const iArt = wxml.indexOf("kind === 'article'");
  assert.ok(iArt > 0, '卡面模板应有学文章分支');
  const artBlock = wxml.slice(iArt, wxml.indexOf('</block>', iArt));
  assert.ok(artBlock.indexOf('{{text}}') >= 0, '全文直接上卡');
  assert.ok(artBlock.indexOf('scroll-y') >= 0, '长文卡内可上下滚动');
  assert.ok(artBlock.indexOf('artFs') >= 0, '字号档跟长度走');
  ['answer', 'extra', 'labelA', 'labelB'].forEach(k => {
    assert.ok(artBlock.indexOf(k) < 0, '文章卡不该出现答案栏字段 ' + k);
  });
  assert.ok(wxml.indexOf('<block wx:else>') > iArt, '识汉字仍是不翻面的兜底分支');
});

test('禅模式正面不泄露答案(静态卡面契约):正面只有主体,意思全在背面', () => {
  const fs = require('fs');
  const path = require('path');
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages', 'recognition', 'zen.wxml'), 'utf8');
  const iFront = wxml.indexOf('class="face front"');
  const iBack = wxml.indexOf('class="face back"');
  assert.ok(iFront > 0 && iBack > iFront, '卡面应分正面/背面两块');
  const front = wxml.slice(iFront, iBack);
  const back = wxml.slice(iBack, wxml.indexOf('</template>', iBack));
  ['answer', 'extra', 'labelA', 'labelB', 'ansFs'].forEach(k => {
    assert.ok(front.indexOf(k) < 0, '正面不许出现 ' + k + '(小朋友会看到提示)');
  });
  assert.ok(front.indexOf('{{face}}') >= 0, '正面只给主体(词句/图片/emoji)');
  assert.ok(back.indexOf('{{answer}}') >= 0, '意思在背面');
  assert.ok(back.indexOf('ansFs') >= 0, '背面意思带字号档');
  assert.ok(wxml.indexOf('wx:if="{{flip}}"') >= 0, '学英语/识图才翻面');
  /* 识汉字走不翻面的分支:汉字 + 拼音 + 组词 */
  const elseBlock = wxml.slice(wxml.indexOf('<block wx:else>'));
  assert.ok(elseBlock.indexOf('zen-hanzi') >= 0 && elseBlock.indexOf('{{answer}}') >= 0,
    '识汉字不翻面,拼音与组词直接给');
});

test('禅模式:用批次页交接的内容(不再拉一次);识图失败回退 emoji', () => {
  reset({});
  rc.setCurrent(rc.normalizeBatch(BATCHES.rbimage01));
  reqs = [];
  const p = load(PAGE('zen.js'));
  p.onLoad({ id: 'rbimage01', i: '0' });
  assert.ok(!reqs.some(u => u.indexOf('/api/recognition/batch') >= 0), '交接后不再请求');
  assert.equal(p.data.item.imgUrl, 'https://www.tcued.com/api/image?id=imgabc123');
  p.onImgError({ currentTarget: { dataset: { i: 0 } } });
  assert.equal(p.data.item.failed, true);
  assert.equal(p.data.item.face, '🐶', '回退 emoji 兜底');
});

test('禅模式:未开通权限提示后退出且不呈现内容;关闭返回上一页', () => {
  reset({ '/api/perms': { statusCode: 200, data: { ok: true, perms: [] } } });
  const p = load(PAGE('zen.js'));
  p.onLoad({ id: 'rbhanzi01', i: '0' });
  assert.deepEqual(toasts, ['本家庭未开通此功能']);
  assert.equal(p.data.item, null, '未开通不呈现内容');

  reset({ '/api/recognition/batch': { statusCode: 200, data: { ok: true, batch: BATCHES.rbhanzi01 } } });
  const p2 = load(PAGE('zen.js'));
  p2.onLoad({ id: 'rbhanzi01', i: '0' });
  p2.onClose();
  assert.ok(navs.indexOf('back') >= 0);
});

console.log('\n全部通过:' + passed + ' 个用例');
