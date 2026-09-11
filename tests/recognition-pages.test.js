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
