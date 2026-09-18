/* 知识点总结三个页面的接线测试:mock Page/wx,把 onLoad/onShow/手势跑一遍,校验 setData 结果。
   utils 侧逻辑由 tests/knowledge.test.js 覆盖,这里只钉页面接线:
   登录门(无功能键,只挡未登录)、书目/单元渲染、两步取数与缓存兜底、空册区分、
   卡片点击跳转(中文键 URL 编码)、整本交接给禅模式、禅模式手势循环换卡、
   配图失败回退。不依赖微信环境。
   运行:node tests/knowledge-pages.test.js */
const assert = require('assert');
const path = require('path');

/* ── Page/wx mock:Page 捕获页面配置,实例化后按微信语义做浅合并 setData ── */
let store = new Map();
let reqs = [];
let routes = {};
let page = null;
let navs = [];
let vibes = 0;

global.getCurrentPages = () => [{ route: 'pages/knowledge/knowledge', options: {} }];
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

const kn = require('../utils/knowledge');

/* 一册最小但完整的教材:单元一 3 块(普通行/配图/形近字)、单元二 1 块 */
const BOOK = {
  title: '一年级上册语文 · 单元必背知识',
  units: [
    {
      name: '第一单元', sections: [
        { title: '重点字词', blocks: [
          { h: '一、易错字音', rows: ['你(nǐ)　三(sān)', '下「棋」(qí)'] },
          { h: '五、常考象形字', rows: ['日　月　水'], imgs: ['images/knowledge/ri.png', 'images/knowledge/yue.png', 'images/knowledge/shui.png'] },
          { h: '六、形近字', rows: ['口(人口) ↔ 田(水田)', '二(二月) ↔ 三(三个)'] },
        ] },
      ],
    },
    { name: '第二单元', sections: [{ title: '背诵积累', blocks: [{ h: '一、课文背诵', rows: ['云对雨，雪对风。'] }] }] },
  ],
};
const BOOKS_PAYLOAD = {
  statusCode: 200,
  data: { ok: true, books: [{ grade: '一年级', subject: '语文', volume: '上册', title: BOOK.title, updatedAt: 100 }] },
};
const BOOK_PAYLOAD = {
  statusCode: 200,
  data: { ok: true, updatedAt: 100, data: BOOK },
};
const KEY = { grade: '一年级', subject: '语文', volume: '上册' };
const QS = 'grade=%E4%B8%80%E5%B9%B4%E7%BA%A7&subject=%E8%AF%AD%E6%96%87&volume=%E4%B8%8A%E5%86%8C';

/* 载入页面文件并实例化(setData 支持浅合并,与微信同款) */
function load(file) {
  page = null;
  delete require.cache[require.resolve(file)];
  require(file);
  const inst = Object.create(page);
  inst.data = JSON.parse(JSON.stringify(page.data));
  inst.setData = function (patch) { Object.assign(this.data, patch); };
  return inst;
}
const PAGE = p => path.join(__dirname, '..', 'pages', 'knowledge', p);

function reset(extraRoutes) {
  store.clear();
  reqs = []; navs = []; vibes = 0;
  routes = extraRoutes || {};
  store.set('mora-auth-token', 'T');
}

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }

/* ── 列表页 ── */
test('列表页:未登录弹登录门且不发起取数(无功能键,只挡未登录)', () => {
  reset({ '/api/knowledge?': BOOKS_PAYLOAD });
  store.delete('mora-auth-token');
  const p = load(PAGE('knowledge.js'));
  p.onShow();
  assert.ok(navs.some(u => u.indexOf('/pages/login/login') >= 0), '应弹登录门');
  assert.ok(!reqs.some(u => u.indexOf('/api/knowledge') >= 0), '未登录不取数');
});

test('列表页:书目渲染(标题/概览/空态区分)与点卡跳转(中文键 URL 编码)', () => {
  reset({ '/api/knowledge?': BOOKS_PAYLOAD });
  const p = load(PAGE('knowledge.js'));
  p.onShow();
  assert.equal(p.data.total, 1);
  assert.equal(p.data.books[0].title, BOOK.title);
  assert.equal(p.data.books[0].meta, '一年级 · 语文 · 上册');
  assert.equal(p.data.empty, false);
  assert.ok(reqs[0].indexOf('/api/knowledge?token=T') > 0);
  p.onTapBook({ currentTarget: { dataset: p.data.books[0] } });
  assert.equal(navs[0], '/pages/knowledge/book?' + QS, '三键编码后跳单元页');
});

test('列表页:失败且有缓存用缓存渲染;无缓存才是失败态', () => {
  reset({ '/api/knowledge?': null });
  store.set(kn.LIST_KEY, [{ grade: '一年级', subject: '语文', volume: '上册', title: BOOK.title, updatedAt: 100 }]);
  const cached = load(PAGE('knowledge.js'));
  cached.onShow();
  assert.equal(cached.data.total, 1);
  assert.equal(cached.data.loadError, false, '离线用缓存,不算失败');

  reset({ '/api/knowledge?': null });
  const offline = load(PAGE('knowledge.js'));
  offline.onShow();
  assert.equal(offline.data.loadError, true, '无缓存失败要给重试');
  assert.equal(offline.data.total, 0);
});

/* ── 单元页 ── */
test('单元页:取整本渲染(标题/单元数/配色),点单元交接整本并跳禅模式', () => {
  reset({ '/api/knowledge/book': BOOK_PAYLOAD });
  const p = load(PAGE('book.js'));
  p.onLoad(QS.split('&').reduce((o, kv) => {
    const [k, v] = kv.split('=');
    o[k] = v;
    return o;
  }, {}));
  assert.equal(p.data.title, BOOK.title);
  assert.equal(p.data.unitCount, 2);
  assert.deepEqual(p.data.units.map(u => u.name), ['第一单元', '第二单元']);
  assert.equal(p.data.units[0].c, '#F76707', '单元配色与网页端同表轮换');
  assert.equal(p.data.units[0].blks, 3);

  p.onTapUnit({ currentTarget: { dataset: { i: '0' } } });
  assert.ok(kn.current(KEY.grade, KEY.subject, KEY.volume), '点单元时整本交接给禅模式');
  assert.equal(navs[0], '/pages/knowledge/zen?' + QS + '&u=0');
});

test('单元页:失败且有缓存用缓存;空册与失败分开文案', () => {
  reset({ '/api/knowledge/book': null });
  store.set(kn.ITEM_KEY, {
    '一年级|语文|上册': { grade: '一年级', subject: '语文', volume: '上册', title: BOOK.title, updatedAt: 100, data: BOOK },
  });
  const cached = load(PAGE('book.js'));
  cached.onLoad({ grade: KEY.grade, subject: KEY.subject, volume: KEY.volume });
  assert.equal(cached.data.unitCount, 2);
  assert.equal(cached.data.loadError, false, '离线用缓存,不算失败');

  reset({ '/api/knowledge/book': { statusCode: 200, data: { ok: true, data: null, updatedAt: 0 } } });
  const empty = load(PAGE('book.js'));
  empty.onLoad(QS.split('&').reduce((o, kv) => {
    const [k, v] = kv.split('=');
    o[k] = v;
    return o;
  }, {}));
  assert.equal(empty.data.empty, true, '服务端确认空册给空态');
  assert.equal(empty.data.loadError, false);

  reset({ '/api/knowledge/book': null });
  const offline = load(PAGE('book.js'));
  offline.onLoad(QS.split('&').reduce((o, kv) => {
    const [k, v] = kv.split('=');
    o[k] = v;
    return o;
  }, {}));
  assert.equal(offline.data.loadError, true);
});

/* ── 禅模式 ── */
function giveBook() {
  const book = kn.normalizeFullBook({ grade: KEY.grade, subject: KEY.subject, volume: KEY.volume, data: BOOK, updatedAt: 100 });
  kn.setCurrent(book);
  return book;
}

test('禅模式:交接直达不拉远端,首张卡=单元一第 1 块,顶胶囊=单元名·序号', () => {
  reset();
  giveBook();
  const p = load(PAGE('zen.js'));
  p.onLoad(QS.split('&').reduce((o, kv) => {
    const [k, v] = kv.split('=');
    o[k] = v;
    return o;
  }, { u: '0' }));
  assert.equal(reqs.length, 0, '有交接不再请求');
  assert.equal(p.data.title, '第一单元 · ' + BOOK.title);
  assert.equal(p.data.total, 3);
  assert.equal(p.data.cur, 0);
  assert.equal(p.data.item.h, '一、易错字音');
  assert.equal(p.data.item.secTitle, '重点字词');
  assert.ok(p.data.hint.indexOf('左滑') > 0, '多卡给滑动提示');
});

test('禅模式:左右滑动顺序循环换卡 + 轻震动;单张不响应', () => {
  reset();
  giveBook();
  const p = load(PAGE('zen.js'));
  p.onLoad({ grade: KEY.grade, subject: KEY.subject, volume: KEY.volume, u: '0' });
  const swipe = (dx) => {
    p.onTouchStart({ touches: [{ clientX: 100, clientY: 100 }] });
    p.onTouchEnd({ changedTouches: [{ clientX: 100 + dx, clientY: 100 }] });
  };
  swipe(-60);
  assert.equal(p.data.cur, 1, '左滑下一项');
  assert.equal(p.data.item.h, '五、常考象形字');
  swipe(-60);
  assert.equal(p.data.cur, 2);
  swipe(-60);
  assert.equal(p.data.cur, 0, '尾首循环');
  swipe(60);
  assert.equal(p.data.cur, 2, '右滑上一项');
  assert.equal(vibes, 4, '每次换卡轻震动');

  reset();
  kn.setCurrent(kn.normalizeFullBook({ grade: KEY.grade, subject: KEY.subject, volume: KEY.volume, data: BOOK, updatedAt: 100 }));
  const single = load(PAGE('zen.js'));
  single.onLoad({ grade: KEY.grade, subject: KEY.subject, volume: KEY.volume, u: '1' });
  single.onTouchStart({ touches: [{ clientX: 100, clientY: 100 }] });
  single.onTouchEnd({ changedTouches: [{ clientX: 40, clientY: 100 }] });
  assert.equal(single.data.cur, 0, '单张滑动不响应');
  assert.equal(vibes, 0, '单张不震动');
});

test('禅模式:配图加载失败就地回退占位(图注保留)', () => {
  reset();
  giveBook();
  const p = load(PAGE('zen.js'));
  p.onLoad({ grade: KEY.grade, subject: KEY.subject, volume: KEY.volume, u: '0' });
  p.onTouchStart({ touches: [{ clientX: 100, clientY: 100 }] });
  p.onTouchEnd({ changedTouches: [{ clientX: 40, clientY: 100 }] });
  assert.equal(p.data.item.h, '五、常考象形字');
  assert.equal(p.data.item.pics[0].failed, false);
  p.onImgError({ currentTarget: { dataset: { i: p.data.item.i, pi: 0 } } });
  assert.equal(p.data.item.pics[0].failed, true);
  assert.equal(p.data.item.pics[0].cap, '日', '图注还在');
});

test('禅模式:深链无交接回落缓存,再没有才拉远端;空册给 gone', () => {
  reset({ '/api/knowledge/book': BOOK_PAYLOAD });
  store.set(kn.ITEM_KEY, {
    '一年级|语文|上册': { grade: '一年级', subject: '语文', volume: '上册', title: BOOK.title, updatedAt: 100, data: BOOK },
  });
  const p = load(PAGE('zen.js'));
  p.onLoad({ grade: KEY.grade, subject: KEY.subject, volume: KEY.volume, u: '0' });
  assert.equal(reqs.length, 0, '缓存能兜就不发请求');
  assert.equal(p.data.total, 3);

  reset({ '/api/knowledge/book': BOOK_PAYLOAD });
  /* 内存里留着的是另一册(键不匹配):等同没交接,必须走远端 */
  kn.setCurrent(kn.normalizeFullBook({ grade: '二年级', subject: '语文', volume: '上册', data: BOOK, updatedAt: 100 }));
  const fetched = load(PAGE('zen.js'));
  fetched.onLoad({ grade: KEY.grade, subject: KEY.subject, volume: KEY.volume, u: '0' });
  assert.equal(reqs.length, 1, '无交接无缓存拉远端');
  assert.equal(fetched.data.total, 3);

  reset({ '/api/knowledge/book': { statusCode: 200, data: { ok: true, data: null, updatedAt: 0 } } });
  const gone = load(PAGE('zen.js'));
  gone.onLoad({ grade: KEY.grade, subject: KEY.subject, volume: KEY.volume, u: '0' });
  assert.equal(gone.data.gone, true, '空册提示后返回');

  p.onClose();
  assert.ok(navs.indexOf('back') >= 0, '✕ 关闭返回');
});

test('wxml 卫生:文本节点不得有裸花括号(字面 { 会被编译器当绑定吞掉,曾崩 zen.wxml)', () => {
  const fs = require('fs');
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : (p.endsWith('.wxml') ? [p] : []);
  });
  const pagesDir = path.join(__dirname, '..', 'pages');
  for (const f of walk(pagesDir)) {
    /* 先摘 {{...}} 绑定(防绑定表达式里的 > 干扰标签识别),再剥标签;
       剩下的纯文本里不应再有花括号——字面 { 会让编译器报 expect end-tag */
    const text = fs.readFileSync(f, 'utf8').replace(/\{\{[\s\S]*?\}\}/g, '').replace(/<[^>]*>/g, '');
    assert.ok(!/[{}]/.test(text), f + ' 文本节点里有裸花括号,会编译报错');
  }
  const zen = fs.readFileSync(path.join(pagesDir, 'knowledge', 'zen.wxml'), 'utf8');
  assert.ok(/zc-brace">\{\{pr\.brace\}\}</.test(zen), '形近字大括号应从数据绑定传入(pr.brace)');
});

console.log('\n全部通过:' + passed + ' 个用例');
