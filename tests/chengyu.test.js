/* utils/chengyu.js 的 Node 测试:mock wx,不依赖微信环境。
   覆盖:条目清洗与截断、整库归一、本机缓存(脏缓存当没有)、
   拉取更新(updatedAt 变/相等但内容变/data:null 清空/坏 payload/401)、
   订阅通知、搜索与定位。
   运行:node tests/chengyu.test.js */
const assert = require('assert');

/* ── wx mock:内存 storage + request 捕获(按 URL 关键字注入回包) ── */
let store = new Map();
let reqs = [];
let routes = {};
let gated = false;
global.getCurrentPages = () => [{ route: 'pages/chengyu/chengyu', options: {} }];
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

const auth = require('../utils/auth');
const CACHE_KEY = 'mora-chengyu-v1';
const CACHE = { updatedAt: 100, data: [
  { w: '画蛇添足', p: 'huà shé tiān zú', m: '比喻做了多余的事', d: '《战国策》' },
  { w: '守株待兔', p: '', m: '比喻不劳而获', d: '' },
] };

function freshUtil() {
  delete require.cache[require.resolve('../utils/chengyu')];
  return require('../utils/chengyu');
}
function signIn() {
  store.set('mora-auth-token', 'T');
  store.set('mora-auth-family', 'mora');
}
function signOut() {
  store.delete('mora-auth-token');
  store.delete('mora-auth-family');
}
function reset(extraRoutes) {
  store.clear();
  reqs = [];
  routes = extraRoutes || {};
  gated = false;
}

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }

test('常量:与服务端 valid_chengyu 同口径', () => {
  const cg = freshUtil();
  assert.equal(cg.W_MAX, 16);
  assert.equal(cg.P_MAX, 80);
  assert.equal(cg.M_MAX, 500);
  assert.equal(cg.D_MAX, 800);
  assert.equal(cg.LIB_MAX, 2000);
  assert.equal(cg.CACHE_KEY, CACHE_KEY);
});

test('normalizeEntry:四字段 trim/截断;没成语或没意思丢弃', () => {
  const cg = freshUtil();
  assert.deepEqual(cg.normalizeEntry({ w: ' 画蛇添足 ', p: ' huà ', m: ' 意思 ', d: ' 典故 ' }),
    { w: '画蛇添足', p: 'huà', m: '意思', d: '典故' });
  assert.deepEqual(cg.normalizeEntry({ w: '守株待兔', m: '比喻' }),
    { w: '守株待兔', p: '', m: '比喻', d: '' });
  assert.equal(cg.normalizeEntry({ w: '', m: '意思' }), null);
  assert.equal(cg.normalizeEntry({ w: '画蛇添足', m: '  ' }), null);
  assert.equal(cg.normalizeEntry(null), null);
  const long = cg.normalizeEntry({
    w: '画'.repeat(20), p: 'a'.repeat(100), m: '意'.repeat(600), d: '典'.repeat(900),
  });
  assert.equal(long.w.length, 16);
  assert.equal(long.p.length, 80);
  assert.equal(long.m.length, 500);
  assert.equal(long.d.length, 800);
  // 截断而不是丢整条(规则以后再变也不会悄悄吃内容)
  assert.ok(long.w);
});

test('loadCache:无缓存/脏缓存当空库;好缓存归一后返回', () => {
  reset();
  let cg = freshUtil();
  assert.deepEqual(cg.loadCache(), { updatedAt: 0, data: [] });
  assert.deepEqual(cg.current(), []);

  store.set(CACHE_KEY, { updatedAt: 5, data: [{ w: '画蛇添足', m: '意思' }, { w: '坏' }] });
  cg = freshUtil();
  assert.deepEqual(cg.current().map(e => e.w), ['画蛇添足']);
  assert.equal(cg.loadCache().updatedAt, 5);

  store.set(CACHE_KEY, { updatedAt: 5, data: 'nope' });
  cg = freshUtil();
  assert.deepEqual(cg.current(), [], 'data 非数组当没有');
});

test('load:先同步回调缓存立即渲染,再拉远端;无 token 不发请求', () => {
  reset();
  store.set(CACHE_KEY, CACHE);
  let cg = freshUtil();
  let seen = [];
  cg.load(list => seen.push(list.map(e => e.w)));
  assert.deepEqual(seen, [['画蛇添足', '守株待兔']], '先回调缓存');
  assert.equal(reqs.length, 0, '无 token 不发请求');

  reset({ '/api/chengyu?': { statusCode: 200, data: { ok: true, data: [CACHE.data[0]], updatedAt: 200 } } });
  signIn();
  store.set(CACHE_KEY, CACHE);
  cg = freshUtil();
  seen = [];
  cg.load(list => seen.push(list.map(e => e.w)));
  assert.deepEqual(seen[0], ['画蛇添足', '守株待兔'], '同步回调缓存');
  assert.equal(reqs[0].url.indexOf('/api/chengyu?token=T'), cg.API_BASE.length, '应带 token 拉整库');
  assert.deepEqual(seen[seen.length - 1], ['画蛇添足'], '远端更新后再回调');
});

test('refresh:updatedAt 更新才替换缓存并通知订阅者', () => {
  reset({ '/api/chengyu?': { statusCode: 200, data: { ok: true, data: [CACHE.data[0]], updatedAt: 200 } } });
  signIn();
  store.set(CACHE_KEY, CACHE);
  const cg = freshUtil();
  const seen = [];
  cg.subscribe(list => seen.push(list.length));
  let result = null;
  cg.refresh((changed, err) => { result = { changed, err }; });
  assert.deepEqual(result, { changed: true, err: null });
  assert.deepEqual(seen, [1], '更新后通知订阅者');
  assert.equal(cg.current().length, 1);
  assert.equal(cg.loadCache().updatedAt, 200, '缓存已持久化');
});

test('refresh:相等时间戳但内容不同也替换(服务端允许相等覆盖)', () => {
  reset({ '/api/chengyu?': { statusCode: 200, data: { ok: true, data: [CACHE.data[1]], updatedAt: 100 } } });
  signIn();
  store.set(CACHE_KEY, CACHE);
  const cg = freshUtil();
  let changed = false;
  cg.refresh((c) => { changed = c; });
  assert.equal(changed, true);
  assert.deepEqual(cg.current().map(e => e.w), ['守株待兔']);
});

test('refresh:data:null 视为空库并清掉本地缓存', () => {
  reset({ '/api/chengyu?': { statusCode: 200, data: { ok: true, data: null, updatedAt: 0 } } });
  signIn();
  store.set(CACHE_KEY, CACHE);
  const cg = freshUtil();
  const seen = [];
  cg.subscribe(list => seen.push(list.length));
  let changed = false;
  cg.refresh((c) => { changed = c; });
  assert.equal(changed, true);
  assert.deepEqual(cg.current(), []);
  assert.deepEqual(seen, [0]);
  assert.equal(cg.loadCache().updatedAt, 0);
});

test('refresh:坏 payload / 网络失败保留本地;401 弹登录门', () => {
  // 坏 payload:data 既不是数组也不是 null
  reset({ '/api/chengyu?': { statusCode: 200, data: { ok: true, data: { bad: 1 }, updatedAt: 999 } } });
  signIn();
  store.set(CACHE_KEY, CACHE);
  let cg = freshUtil();
  let out = null;
  cg.refresh((changed, err) => { out = { changed, err }; });
  assert.deepEqual(out, { changed: false, err: 'bad' });
  assert.equal(cg.current().length, 2, '坏数据不清本地');

  // 网络失败
  reset({ '/api/chengyu?': null });
  signIn();
  store.set(CACHE_KEY, CACHE);
  cg = freshUtil();
  cg.refresh((changed, err) => { out = { changed, err }; });
  assert.deepEqual(out, { changed: false, err: 'net' });
  assert.equal(cg.current().length, 2);

  // 401:清 token + 跳登录
  reset({ '/api/chengyu?': { statusCode: 401, data: { ok: false } } });
  signIn();
  store.set(CACHE_KEY, CACHE);
  cg = freshUtil();
  cg.refresh((changed, err) => { out = { changed, err }; });
  assert.deepEqual(out, { changed: false, err: 'auth' });
  assert.equal(auth.getToken(), '', '401 应清会话');
  assert.equal(gated, true, '401 应跳登录页');
});

test('search/find:按 w/p/m/d 子串过滤(不分大小写),按成语精确定位', () => {
  reset();
  const cg = freshUtil();
  const list = CACHE.data;
  assert.deepEqual(cg.search(list, '').map(e => e.w), ['画蛇添足', '守株待兔']);
  assert.deepEqual(cg.search(list, '画蛇').map(e => e.w), ['画蛇添足']);
  assert.deepEqual(cg.search(list, 'TIĀN').map(e => e.w), ['画蛇添足']);
  assert.deepEqual(cg.search(list, '不劳').map(e => e.w), ['守株待兔']);
  assert.deepEqual(cg.search(list, '战国').map(e => e.w), ['画蛇添足']);
  assert.deepEqual(cg.search(list, '没有'), []);
  assert.equal(cg.find(list, '守株待兔').m, '比喻不劳而获');
  assert.equal(cg.find(list, '没有这条'), null);
  assert.equal(cg.find(list, ''), null);
});

console.log(`\nchengyu utils: ${passed} passed`);
