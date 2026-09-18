/* utils/knowledge.js 的 Node 测试:mock wx,不依赖微信环境。
   覆盖:书目/整本清洗(坏数据丢弃、imgs 路径校验)、着重号拆段(「」与单字拼音、
   边界规则)、形近字拆对、象形字图注一一对应、单元拍平与配色轮换、
   本机缓存、两步接口(书目 → 整本)、页面交接与家庭隔离、禅模式顺序换卡。
   运行:node tests/knowledge.test.js */
const assert = require('assert');

/* ── wx mock:内存 storage + request 捕获(按 URL 关键字注入回包) ── */
let store = new Map();
let reqs = [];
let routes = {};
let gated = false;
global.getCurrentPages = () => [{ route: 'pages/knowledge/knowledge', options: {} }];
global.wx = {
  getStorageSync: k => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: k => { store.delete(k); },
  getStorageInfoSync: () => ({ keys: [...store.keys()] }),
  getDeviceInfo: () => ({ platform: 'devtools' }),
  reLaunch: () => { gated = true; },
  request(opts) {
    reqs.push({ url: opts.url, method: opts.method || 'GET' });
    for (const key of Object.keys(routes)) {
      if (opts.url.indexOf(key) >= 0) {
        const r = routes[key];
        if (r === null) { if (opts.fail) opts.fail(); return; }   // null = 网络失败
        if (opts.success) opts.success(r);
        return;
      }
    }
    if (opts.fail) opts.fail();
  },
  vibrateShort: () => {},
  getWindowInfo: () => ({ statusBarHeight: 20 }),
};

const kn = require('../utils/knowledge');
const auth = require('../utils/auth');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('✓ ' + name);
}

function signIn(family) {
  store.set('mora-auth-token', 'T');
  if (family) store.set('mora-auth-family', family);
}
function signOut() {
  store.delete('mora-auth-token');
  store.delete('mora-auth-family');
}

/* 书目接口回包:混入坏书目验证丢弃 */
function booksPayload() {
  return {
    statusCode: 200,
    data: {
      ok: true, books: [
        { grade: '一年级', subject: '语文', volume: '上册', title: '一年级上册语文 · 单元必背知识', updatedAt: 100 },
        { grade: '一年级', subject: '', volume: '上册', title: '缺科目', updatedAt: 200 },
        { grade: '  ', subject: '数学', volume: '上册', title: '缺年级', updatedAt: 300 },
      ],
    },
  };
}

/* 一册最小但完整的教材:覆盖三种块形态(普通行/形近字/配图) */
function bookPayload() {
  return {
    statusCode: 200,
    data: {
      ok: true, updatedAt: 100,
      data: {
        title: '一年级上册语文 · 单元必背知识',
        units: [
          {
            name: '第一单元',
            sections: [
              {
                title: '重点字词', blocks: [
                  { h: '一、易错字音', rows: ['你(nǐ)　三(sān)', '下「棋」(qí)'] },
                  { h: '五、常考象形字', rows: ['日　月　水'], imgs: ['images/knowledge/ri.png', 'images/knowledge/yue.png', 'images/knowledge/shui.png'] },
                  { h: '六、形近字', rows: ['口(人口) ↔ 田(水田)', '二(二月) ↔ 三(三个)'] },
                  { h: '八、反义词', rows: ['天↔地　　今↔古'] },
                  { h: '', rows: ['例：小猫吃鱼', '仿写：小鸟唱歌'] },
                ],
              },
            ],
          },
          { name: '第二单元', sections: [{ title: '背诵积累', blocks: [{ h: '一、课文背诵', rows: ['云对雨，雪对风。'] }] }] },
        ],
      },
    },
  };
}

test('清洗:书目三键(年级/科目/册)齐才收;整本 units 空丢弃', () => {
  const bad = kn.normalizeBrief({ grade: '一年级', subject: '', volume: '上册' });
  assert.equal(bad, null, '缺科目不收');
  const ok = kn.normalizeBrief({ grade: '一年级', subject: '语文', volume: '上册', title: '一年级上册语文 · 单元必背知识', updatedAt: 100 });
  assert.equal(ok.title, '一年级上册语文 · 单元必背知识');
  assert.equal(kn.normalizeFullBook({ grade: '一年级', subject: '语文', volume: '上册', data: { units: [] } }), null);
  assert.equal(kn.normalizeFullBook({ grade: '一年级', subject: '语文', volume: '上册', data: { title: 'x', units: [{ name: 'u', sections: [] }] } }), null, '空节不收');
});

test('清洗:imgs 只收站内相对路径(拒 .. 与怪字符),块没内容不收', () => {
  const b = kn.normalizeBlock({
    h: 'h',
    rows: ['日'],
    imgs: ['images/knowledge/ri.png', '../secret.png', 'images/a b.png', 123, 'images/knowledge/9.png'],
  });
  assert.deepEqual(b.imgs, ['images/knowledge/ri.png', 'images/knowledge/9.png']);
  assert.equal(kn.normalizeBlock({ h: '', rows: [], imgs: [] }), null, '没行没图不收');
  assert.equal(kn.normalizeBlock({ h: '', rows: ['   '], imgs: [] }), null);
});

test('着重号拆段:「X」显式标注;整词单字+括号拼音自动加点(边界与网页 pyDot 一致)', () => {
  assert.deepEqual(kn.parseRow('下「棋」(qí)'), [
    { t: '下', zd: false }, { t: '棋', zd: true }, { t: '(qí)', zd: false },
  ]);
  assert.deepEqual(kn.parseRow('你(nǐ)　三(sān)'), [
    { t: '你', zd: true }, { t: '(nǐ)', zd: false },
    { t: '　', zd: false },
    { t: '三', zd: true }, { t: '(sān)', zd: false },
  ], '全角空格是边界,三 前面不是汉字,加点');
  assert.deepEqual(kn.parseRow('三人(sān)'), [{ t: '三人(sān)', zd: false }],
    '三 前面紧挨汉字,不加点(网页同边界)');
  assert.deepEqual(kn.parseRow('口(人口) ↔ 田(水田)'), [{ t: '口(人口) ↔ 田(水田)', zd: false }],
    '括号里不是拼音,不拆');
  assert.deepEqual(kn.parseRow('「棋子」(qí)'), [{ t: '「棋子」(qí)', zd: false }],
    '「」只收单字,两字不点');
  assert.deepEqual(kn.parseRow('山：丨㇗丨　山'), [{ t: '山：丨㇗丨　山', zd: false }],
    '无括号笔顺行原样');
});

test('形近字拆对:小标题含「形近字」且行含 ↔ 才拆;反义词行不拆', () => {
  const pairs = kn.blockView(
    { h: '六、形近字', rows: ['口(人口) ↔ 田(水田)', '二(二月) ↔ 三(三个)'] }, '重点字词', '#F76707', '#C9420A');
  assert.equal(pairs.pairs.length, 2);
  assert.equal(pairs.pairs[0].top, '口(人口)');
  assert.equal(pairs.pairs[0].bot, '田(水田)');
  assert.equal(pairs.hasPairs, true);
  assert.equal(pairs.hasRows, false);

  const fan = kn.blockView({ h: '八、反义词', rows: ['天↔地　　今↔古'] }, '重点字词', '#F76707', '#C9420A');
  assert.equal(fan.hasPairs, false, '小标题不含「形近字」不拆对');
  assert.equal(fan.hasRows, true);

  const mixed = kn.blockView({ h: '六、形近字', rows: ['A ↔ B', '单独行'] }, 's', '#F76707', '#C9420A');
  assert.equal(mixed.pairs.length, 1, '块内无 ↔ 的行仍作普通行');
  assert.equal(mixed.rows.length, 1);
});

test('象形字图注:单行按空白拆个数=图数 → 汉字嵌图卡、原行不单出;配不上则文字行保留', () => {
  const ok = kn.blockView({
    h: '五、常考象形字', rows: ['日　月　水'],
    imgs: ['images/knowledge/ri.png', 'images/knowledge/yue.png', 'images/knowledge/shui.png'],
  }, 's', '#F76707', '#C9420A');
  assert.equal(ok.hasPics, true);
  assert.deepEqual(ok.pics.map(p => p.cap), ['日', '月', '水']);
  assert.equal(ok.pics[0].url, kn.API_BASE + '/images/knowledge/ri.png');
  assert.equal(ok.hasRows, false, '图注行不再单出');

  const perRow = kn.blockView({
    h: 'h', rows: ['日', '月', '水'],
    imgs: ['images/a.png', 'images/b.png', 'images/c.png'],
  }, 's', '#F76707', '#C9420A');
  assert.deepEqual(perRow.pics.map(p => p.cap), ['日', '月', '水'], '逐字一行=行数与图数相等,全部行作图注');
  assert.equal(perRow.hasRows, false);

  const miss = kn.blockView({
    h: 'h', rows: ['日　月　水　火'], imgs: ['images/a.png', 'images/b.png'],
  }, 's', '#F76707', '#C9420A');
  assert.equal(miss.pics[0].cap, '', '配不上不加图注');
  assert.equal(miss.hasRows, true, '文字行保留');

  const degenerate = kn.blockView({
    h: 'h', rows: ['日　月　水　火'], imgs: ['images/a.png'],
  }, 's', '#F76707', '#C9420A');
  assert.equal(degenerate.pics[0].cap, '日　月　水　火',
    '1 行 1 图与网页字面行为一致:整行作图注(行数=图数优先)');
});

test('例：/仿写：行淡化展示', () => {
  const v = kn.blockView({ h: '', rows: ['例：小猫吃鱼', '小猫吃鱼'] }, 's', '#F76707', '#C9420A');
  assert.equal(v.rows[0].ex, true);
  assert.equal(v.rows[1].ex, false);
});

test('单元拍平:节内块顺序成卡、节名作小签、配色随单元轮换(网页端同表)', () => {
  const book = kn.normalizeFullBook({ grade: '一年级', subject: '语文', volume: '上册', data: bookPayload().data.data });
  const items0 = kn.unitItems(book, 0);
  assert.equal(items0.length, 5);
  assert.deepEqual(items0.map(it => it.h), ['一、易错字音', '五、常考象形字', '六、形近字', '八、反义词', '']);
  assert.equal(items0[0].secTitle, '重点字词');
  assert.deepEqual([items0[0].c, items0[0].cd], ['#F76707', '#C9420A'], '第一单元用表首色');
  const items1 = kn.unitItems(book, 1);
  assert.deepEqual([items1[0].c, items1[0].cd], ['#1098AD', '#0B7285'], '第二单元轮换到表第二色');
  assert.equal(kn.unitItems(book, 9).length, 0, '单元不在了给空');

  const units = kn.unitList(book);
  assert.deepEqual(units.map(u => [u.name, u.secs, u.blks]), [['第一单元', 1, 5], ['第二单元', 1, 1]]);
});

test('换卡:单元内顺序首尾循环', () => {
  assert.equal(kn.stepIndex(0, 1, 5), 1);
  assert.equal(kn.stepIndex(4, 1, 5), 0, '尾首循环');
  assert.equal(kn.stepIndex(0, -1, 5), 4);
  assert.equal(kn.stepIndex(2, 1, 1), 0);
  assert.equal(kn.stepIndex(3, 1, 0), 0, '空单元不崩');
});

test('两步接口①:书目列表(坏书目丢弃)+ 写缓存', () => {
  store.clear(); reqs = []; routes = { '/api/knowledge?': booksPayload() };
  signIn('mora');
  let got = 'no';
  kn.fetchBooks(list => { got = list; });
  assert.equal(got.length, 1, '两条坏书目被丢');
  assert.equal(got[0].volume, '上册');
  assert.ok(reqs[0].url.indexOf('token=T') > 0);
  assert.deepEqual(kn.loadBooks().map(b => b.grade), ['一年级'], '拉取成功即入缓存');
});

test('两步接口②:整本(中文键 URL 编码、坏回包/空册/离线分开报),401 弹登录门', () => {
  store.clear(); reqs = []; routes = { '/api/knowledge/book': bookPayload() };
  signIn();
  let book = 'no';
  kn.fetchBook('一年级', '语文', '上册', (b, err) => { book = [b, err]; });
  assert.equal(book[1], null);
  assert.equal(book[0].data.title, '一年级上册语文 · 单元必背知识');
  assert.equal(book[0].data.units.length, 2);
  assert.ok(reqs[0].url.indexOf(encodeURIComponent('一年级')) > 0, '中文键要 URL 编码');
  assert.ok(kn.loadBook('一年级', '语文', '上册'), '整本入缓存');

  routes['/api/knowledge/book'] = { statusCode: 200, data: { ok: true, data: null, updatedAt: 0 } };
  store.delete(kn.ITEM_KEY);
  let emptyErr = 'no';
  kn.fetchBook('一年级', '语文', '上册', (b, err) => { emptyErr = err; });
  assert.equal(emptyErr, 'empty', '这一册还没有内容');

  routes['/api/knowledge/book'] = { statusCode: 200, data: { ok: true, data: { title: 'x', units: [{ name: 'u', sections: [{ title: 's', blocks: [{ h: '', rows: [] }] }] }] } } };
  let badErr = 'no';
  kn.fetchBook('一年级', '语文', '上册', (b, err) => { badErr = err; });
  assert.equal(badErr, 'bad', '空块整本渲染不出来,按坏回包处理');

  routes['/api/knowledge/book'] = null;
  let netErr = 'no';
  kn.fetchBook('一年级', '语文', '上册', (b, err) => { netErr = err; });
  assert.equal(netErr, 'net');

  routes['/api/knowledge/book'] = { statusCode: 401, data: {} };
  gated = false;
  kn.fetchBook('一年级', '语文', '上册', () => {});
  assert.equal(gated, true, '401 清会话弹登录门');
});

test('缓存:脏数据当没有;超上限按 updatedAt 淘汰最旧', () => {
  store.clear();
  store.set(kn.ITEM_KEY, { '一年级|语文|上册': { grade: '一年级', subject: '语文', volume: '上册', data: null } });
  assert.equal(kn.loadBook('一年级', '语文', '上册'), null, '整本清洗不过的缓存当没有');

  for (let i = 0; i < kn.CACHE_MAX + 1; i++) {
    kn.saveBook({
      grade: 'g' + i, subject: 's', volume: 'v',
      updatedAt: i,
      data: { title: 'x', units: [{ name: 'u', sections: [{ title: 's', blocks: [{ h: '', rows: ['r'] }] }] }] },
    });
  }
  const m = store.get(kn.ITEM_KEY);
  assert.equal(Object.keys(m).length, kn.CACHE_MAX);
  assert.equal(m['g0|s|v'], undefined, '最旧的被淘汰');
  assert.ok(m['g1|s|v']);
});

test('页面交接与家庭隔离:同键才给,换家庭登录后内存交接作废', () => {
  store.clear();
  const book = kn.normalizeFullBook({ grade: '一年级', subject: '语文', volume: '上册', data: bookPayload().data.data, updatedAt: 100 });
  signIn('mora');
  kn.setCurrent(book);
  assert.ok(kn.current('一年级', '语文', '上册'));
  assert.equal(kn.current('一年级', '数学', '上册'), null, '换了教材不给');
  store.set('mora-auth-family', 'other');
  assert.equal(kn.current('一年级', '语文', '上册'), null, '换家庭防串');
});

test('页面注册与入口:app.json 注册三页,分类页「语文」栏目挂知识点总结入口(无功能键)', () => {
  const fs = require('fs');
  const path = require('path');
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
  ['pages/knowledge/knowledge', 'pages/knowledge/book', 'pages/knowledge/zen']
    .forEach(p => assert.ok(app.pages.indexOf(p) >= 0, p + ' 应注册进 app.json'));
  const cat = fs.readFileSync(path.join(__dirname, '..', 'pages', 'category', 'category.js'), 'utf8');
  assert.ok(/name: '知识点总结'[\s\S]{0,200}?url: '\/pages\/knowledge\/knowledge'/.test(cat),
    '分类页应有知识点总结入口');
  const m = cat.match(/\{ name: '知识点总结'[^\n]*\}/);
  assert.ok(m && m[0].indexOf('perm') < 0, '服务端读取只验 token,入口不挂功能键');
  /* 三页文件齐全(缺 .js/.wxml/.wxss/.json 任一都会在开发者工具报错) */
  ['knowledge', 'book', 'zen'].forEach(p => {
    ['.js', '.wxml', '.wxss', '.json'].forEach(ext => {
      const f = path.join(__dirname, '..', 'pages', 'knowledge', p + ext);
      assert.ok(fs.existsSync(f), '缺文件 ' + p + ext);
    });
  });
});

console.log('\n全部通过:' + passed + ' 个用例');
