/* utils/poems.js 的 Node 测试:mock wx,不依赖微信环境。
   运行:node tests/poems.test.js */
const assert = require('assert');

/* ── wx mock:内存 storage + request 捕获(GET 回包可注入) ── */
let store = new Map();
let posts = [];
let getResponse = null;
global.getCurrentPages = () => [{ route: 'pages/poems/poems', options: {} }];
global.wx = {
  getStorageSync: k => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: k => { store.delete(k); },
  getStorageInfoSync: () => ({ keys: [...store.keys()] }),
  getDeviceInfo: () => ({ platform: 'devtools' }),
  request(opts) {
    if (opts.method === 'POST') { posts.push(opts); opts.success && opts.success({ statusCode: 200 }); return; }
    if (getResponse) opts.success(getResponse);
    else opts.fail && opts.fail(); // 无回包 = 网络失败
  },
};

const pm = require('../utils/poems');
const auth = require('../utils/auth');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('✓ ' + name);
}

/* 重新加载模块(内容库 cur 状态复位,供内容存储用例隔离) */
function reload() {
  delete require.cache[require.resolve('../utils/poems')];
  return require('../utils/poems');
}

test('种子 19 首字段齐全(含 cat 分类),逐句拼音与汉字一一对应,唯一键无重复', () => {
  assert.equal(pm.SEED.length, 19);
  const cats = [];
  pm.SEED.forEach(d => {
    assert.ok(d.t && d.tp && d.d && d.p && d.pp && d.cat, d.t + ' 字段应齐全');
    assert.ok(Array.isArray(d.c) && d.c.length && d.c.length === d.y.length, d.t + ' 正文/拼音逐句应等长');
    d.c.forEach((line, i) => {
      const han = (line.match(/[\u4e00-\u9fff]/g) || []).length;
      const pys = d.y[i].trim().split(/\s+/);
      assert.equal(pys.length, han, d.t + ' 第' + (i + 1) + '句拼音字数应与汉字一致');
    });
    if (cats.indexOf(d.cat) < 0) cats.push(d.cat);
  });
  /* 年级分类:一年级上册 6 首 → 一年级下册 7 首 → 二年级及拓展 6 首(与网页端种子同序) */
  assert.deepEqual(cats, ['一年级上册', '一年级下册', '二年级及拓展']);
  assert.equal(pm.SEED.filter(d => d.cat === '一年级上册').length, 6);
  assert.equal(pm.SEED.filter(d => d.cat === '一年级下册').length, 7);
  assert.equal(pm.SEED.filter(d => d.cat === '二年级及拓展').length, 6);
});

test('tokenize:逐字注音块,汉字带拼音、标点 punc 标记且拼音占位', () => {
  const toks = pm.tokenize('鹅，鹅，鹅，', 'é é é');
  assert.equal(toks.length, 6);
  assert.deepEqual(toks.filter(t => !t.punc).map(t => t.py), ['é', 'é', 'é']);
  assert.ok(toks[1].punc && toks[1].ch === '，' && toks[1].py === '');
  assert.deepEqual(toks.map(t => t.ix), [0, 1, 2, 3, 4, 5]);
});

test('views/sections:按 cat 首次出现序分节,节头色循环,注音块与渐变色齐备', () => {
  const vs = pm.views({});
  assert.equal(vs.length, 19);
  assert.equal(vs[0].key, '咏鹅|鹅，鹅，鹅，');
  assert.equal(vs[0].cat, '一年级上册');
  assert.equal(vs[0].lines.length, 4);
  assert.equal(vs[3].lines.length, 7); // 江南七句
  vs.forEach((v, i) => {
    assert.equal(v.c1, pm.COLORS[i % pm.COLORS.length][0]);
    assert.equal(v.lines.length, pm.SEED[i].c.length);
  });
  const secs = pm.sections(vs);
  assert.deepEqual(secs.map(s => s.key), ['一年级上册', '一年级下册', '二年级及拓展']);
  assert.deepEqual(secs.map(s => s.items.length), [6, 7, 6]);
  assert.equal(secs[0].color, pm.CATCOLORS[0]);
  assert.equal(secs[2].color, pm.CATCOLORS[2]);
  /* 节内保留全库下标(zen 导航用) */
  assert.equal(secs[1].items[0].key, '春晓|春眠不觉晓，');
  assert.equal(secs[1].items[0].i, 6);
});

test('validPoems:坏库拒收——缺字段/c 与 y 不等长/唯一键重复/超量', () => {
  const ok = JSON.parse(JSON.stringify(pm.SEED));
  assert.ok(pm.validPoems(ok));
  const noCat = JSON.parse(JSON.stringify(pm.SEED)); delete noCat[0].cat;
  assert.ok(!pm.validPoems(noCat), '缺 cat 应拒收');
  const badY = JSON.parse(JSON.stringify(pm.SEED)); badY[0].y = badY[0].y.slice(1);
  assert.ok(!pm.validPoems(badY), 'c/y 不等长应拒收');
  const dup = JSON.parse(JSON.stringify(pm.SEED)); dup[17].c[0] = dup[16].c[0];
  assert.ok(!pm.validPoems(dup), '题目|首句 重复应拒收');
  const empty = JSON.parse(JSON.stringify(pm.SEED)); empty.length = 0;
  assert.ok(!pm.validPoems(empty));
});

test('randomNext:永不与当前重复,足够多次覆盖其余全部古诗,可注入随机源', () => {
  for (let k = 0; k < 500; k++) {
    const j = pm.randomNext(5);
    assert.ok(j >= 0 && j < 19 && j !== 5, '越界或重复: ' + j);
  }
  const seen = new Set();
  for (let k = 0; k < 500; k++) seen.add(pm.randomNext(5));
  for (let j = 0; j < 19; j++) {
    if (j !== 5) assert.ok(seen.has(j), '漏出古诗下标 ' + j);
  }
  assert.equal(pm.randomNext(0, () => 0.999), 18);
  assert.equal(pm.randomNext(18, () => 0), 0);
});

test('markMastered:已登录先落盘再上报 poems 模块,itemKey 为题目|首句;非法键拒收', () => {
  store = new Map();
  posts = [];
  store.set('mora-auth-token', 'tok1');
  const k = pm.key(pm.SEED[0]);
  pm.markMastered(k, true);
  const map = pm.loadMastered();
  assert.ok(map[k], '本地应已落盘');
  assert.equal(posts.length, 1);
  const body = posts[0].data;
  assert.equal(body.token, 'tok1');
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].module, 'poems');
  assert.equal(body.items[0].itemKey, '咏鹅|鹅，鹅，鹅，');
  assert.equal(body.items[0].mastered, 1);
  assert.equal(typeof body.items[0].updatedAt, 'number');
  assert.ok(body.items[0].device, '应带设备名');
  /* 取消掌握上报 mastered=0 */
  posts = [];
  pm.markMastered(k, false);
  assert.equal(posts[0].data.items[0].mastered, 0);
  assert.ok(!pm.loadMastered()[k]);
  /* 非法键位(空/超长/非字符串)不落盘不上报 */
  posts = [];
  pm.markMastered('', true);
  pm.markMastered('x'.repeat(121), true);
  assert.equal(posts.length, 0);
});

test('markMastered:未登录只落盘不上报(登录后 syncMastered 按时间戳补传)', () => {
  store = new Map();
  posts = [];
  pm.markMastered(pm.key(pm.SEED[1]), true);
  assert.ok(pm.loadMastered()[pm.key(pm.SEED[1])]);
  assert.equal(posts.length, 0);
});

test('mergeItems/itemsToPush:同键 updatedAt 新者胜(相等取本地),本地新于远端的补传', () => {
  const local = [{ itemKey: 'A|甲', mastered: 1, updatedAt: 100 }, { itemKey: 'B|乙', mastered: 1, updatedAt: 300 }];
  const remote = [{ itemKey: 'A|甲', mastered: 1, updatedAt: 200 }, { itemKey: 'B|乙', mastered: 0, updatedAt: 100 }, { itemKey: 'C|丙', mastered: 1, updatedAt: 50 }];
  const merged = pm.mergeItems(local, remote);
  const byKey = {};
  merged.forEach(m => { byKey[m.itemKey] = m; });
  assert.equal(byKey['A|甲'].updatedAt, 200); // 远端新,胜
  assert.equal(byKey['B|乙'].updatedAt, 300); // 本地新,胜
  assert.ok(byKey['C|丙'].mastered === 1);    // 远端独有,并入
  const toPush = pm.itemsToPush(local, remote);
  assert.deepEqual(toPush.map(t => t.itemKey), ['B|乙']); // 只有 B 比远端新
});

test('syncMastered:远端合并入库(新者胜),键位不绑当前诗库(删掉的诗记录不丢),401 弹登录门', () => {
  store = new Map();
  posts = [];
  store.set('mora-auth-token', 'tok2');
  const now = Date.now();
  pm.markMastered(pm.key(pm.SEED[2]), true); // 本地 悯农·其二 @ now
  posts = [];
  getResponse = {
    statusCode: 200,
    data: { ok: true, items: [
      { module: 'poems', itemKey: pm.key(pm.SEED[0]), mastered: 1, updatedAt: now + 500 },  // 远端新,应胜出
      { module: 'poems', itemKey: pm.key(pm.SEED[2]), mastered: 0, updatedAt: now - 5000 }, // 本地新,保住并补传
      { module: 'poems', itemKey: '已下架|旧诗第一句', mastered: 1, updatedAt: now },        // 诗库里没有,照收(多端一致)
      { module: 'phonics', itemKey: 'A', mastered: 1, updatedAt: now },                      // 他模块,拒收
    ] },
  };
  let doneMap = null;
  pm.syncMastered(map => { doneMap = map; });
  assert.ok(doneMap, 'done 必达');
  assert.ok(doneMap[pm.key(pm.SEED[0])] && doneMap[pm.key(pm.SEED[2])], '远端新胜出,本地新保住');
  assert.ok(doneMap['已下架|旧诗第一句'], '诗库外键位照收,与网页端 sync 只按 module 过滤一致');
  assert.equal(doneMap.A, undefined, '他模块不落盘');
  const pushed = posts.filter(p => p.url.indexOf('/api/progress') >= 0 && p.method === 'POST');
  assert.equal(pushed.length, 1, '本地新条目补传一次');
  assert.deepEqual(pushed[0].data.items.map(i => i.itemKey), [pm.key(pm.SEED[2])]);
  /* 计数只看当前诗库:诗库外键位存着但不计入 */
  assert.ok(pm.loadMastered()['已下架|旧诗第一句']);
  assert.equal(pm.countMastered(pm.loadMastered()), 2);
  assert.equal(pm.countAll(), 19);

  /* 401:清 token 弹登录门 */
  posts = [];
  getResponse = { statusCode: 401 };
  let gated = false;
  global.wx.reLaunch = () => { gated = true; };
  pm.syncMastered(() => { doneMap = 'should-not-run'; });
  assert.ok(gated, '401 应弹登录门');
  assert.notEqual(doneMap, 'should-not-run', '401 不回调 done');
});

/* ── 内容库:缓存→种子兜底→GET /api/poems(模块状态隔离) ── */
const pm2 = reload();

test('内容库:默认种子;登录后拉远端,更新且合法才整表替换并落缓存', () => {
  store = new Map();
  posts = [];
  assert.equal(pm2.countAll(), 19, '无缓存默认种子');
  assert.equal(pm2.dataset(), pm2.SEED);

  /* 未登录不拉远端 */
  let updated = 'none';
  pm2.refreshContent(u => { updated = u; });
  assert.equal(updated, false);
  assert.equal(posts.length, 0);

  /* 服务端暂无诗库(data:null)→ 保持种子 */
  store.set('mora-auth-token', 'tok3');
  getResponse = { statusCode: 200, data: { ok: true, data: null, updatedAt: 0 } };
  updated = 'none';
  pm2.refreshContent(u => { updated = u; });
  assert.equal(updated, false);
  assert.equal(pm2.countAll(), 19);

  /* 远端有更新的合法诗库(3 首两分类)→ 整表替换 + 落缓存 */
  const lib = [
    { t:'咏鹅', tp:'yǒng é', d:'唐', p:'骆宾王', pp:'luò bīn wáng', cat:'一年级上册',
      c:['鹅，鹅，鹅，'], y:['é é é'] },
    { t:'春晓', tp:'chūn xiǎo', d:'唐', p:'孟浩然', pp:'mèng hào rán', cat:'一年级下册',
      c:['春眠不觉晓，'], y:['chūn mián bù jué xiǎo'] },
    { t:'静夜思', tp:'jìng yè sī', d:'唐', p:'李白', pp:'lǐ bái', cat:'一年级下册',
      c:['床前明月光，'], y:['chuáng qián míng yuè guāng'] },
  ];
  getResponse = { statusCode: 200, data: { ok: true, data: lib, updatedAt: 12345 } };
  updated = 'none';
  pm2.refreshContent(u => { updated = u; });
  assert.equal(updated, true, '有更新应回调 true');
  assert.equal(pm2.countAll(), 3);
  assert.deepEqual(pm2.sections(pm2.views({})).map(s => s.key), ['一年级上册', '一年级下册']);
  const cached = JSON.parse(store.get('mora-poems-dataset'));
  assert.equal(cached.updatedAt, 12345);
  assert.equal(cached.data.length, 3);

  /* 第二次进页:缓存先于请求生效(cur 已是远端库,回到页面立即 3 首) */
  assert.equal(pm2.dataset().length, 3);
});

test('内容库:坏数据拒收(缺 cat/键重复)、旧时间戳不覆盖、离线静默,401 弹登录门', () => {
  const pm3 = reload();
  store = new Map();
  posts = [];
  store.set('mora-auth-token', 'tok4');
  store.set('mora-poems-dataset', JSON.stringify({ updatedAt: 500, data: [
    { t:'画', tp:'huà', d:'唐', p:'王维', pp:'wáng wéi', cat:'一年级上册', c:['远看山有色，'], y:['yuǎn kàn shān yǒu sè'] },
  ] }));
  assert.equal(pm3.countAll(), 1, '合法缓存为第一读取点');

  /* 远端坏库(缺 cat)→ 拒收,缓存不动 */
  const bad = JSON.parse(JSON.stringify(pm3.SEED)); delete bad[0].cat;
  getResponse = { statusCode: 200, data: { ok: true, data: bad, updatedAt: 900 } };
  let updated = 'none';
  pm3.refreshContent(u => { updated = u; });
  assert.equal(updated, false);
  assert.equal(pm3.countAll(), 1);

  /* 远端更旧 → 不覆盖 */
  getResponse = { statusCode: 200, data: { ok: true, data: pm3.SEED, updatedAt: 100 } };
  updated = 'none';
  pm3.refreshContent(u => { updated = u; });
  assert.equal(updated, false);
  assert.equal(pm3.countAll(), 1);

  /* 网络失败 → 静默用缓存 */
  getResponse = null;
  updated = 'none';
  pm3.refreshContent(u => { updated = u; });
  assert.equal(updated, false);
  assert.equal(pm3.countAll(), 1);

  /* 401 → 弹登录门(前一用例已触发过一次门,gateShown 放行防重入) */
  getResponse = { statusCode: 401 };
  auth.gateShown();
  let gated = false;
  global.wx.reLaunch = () => { gated = true; };
  pm3.refreshContent(u => { updated = u; });
  assert.ok(gated);
  assert.equal(updated, false, '401 不算更新');

  /* 脏缓存(校验不过)→ 回退种子 */
  const pm4 = reload();
  store = new Map();
  store.set('mora-poems-dataset', JSON.stringify({ updatedAt: 9, data: [{ t: '坏' }] }));
  assert.equal(pm4.countAll(), 19, '脏缓存应回退种子');
});

console.log(passed + ' 个用例全过');
