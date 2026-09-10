/* utils/auth.js 的 Node 测试:mock wx 存储与请求,不依赖微信环境。
   运行:node tests/auth.test.js */
const assert = require('assert');

/* ── wx mock:内存 storage + 可编程 request ── */
const store = new Map();
const requests = []; // 每次 wx.request 的入参
let responders = []; // 每项 (opts) => [statusCode, data];先进先出
const launches = [];

global.getCurrentPages = () => [{ route: 'pages/index/index', options: { a: '1' } }];
global.wx = {
  getStorageSync: k => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: k => { store.delete(k); },
  getStorageInfoSync: () => ({ keys: [...store.keys()] }),
  getDeviceInfo: () => ({ platform: 'devtools' }),
  reLaunch: opts => { launches.push(opts); },
  request(opts) {
    requests.push(opts);
    const r = responders.shift();
    if (r && opts.success) { const out = r(opts); opts.success({ statusCode: out[0], data: out[1] }); }
  },
};

const auth = require('../utils/auth');

function reset() {
  store.clear();
  requests.length = 0;
  responders = [];
  launches.length = 0;
  auth.gateShown(); // 复位防重入标志(等价登录页 onLoad 的回调)
}

let passed = 0;
function test(name, fn) {
  reset();
  fn();
  passed++;
  console.log('✓ ' + name);
}

const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);

/* ── 登录门 ── */
test('未登录 ensure() 返回 false 并跳登录页(带来源路由)', () => {
  assert.strictEqual(auth.ensure(), false);
  assert.strictEqual(launches.length, 1);
  assert.ok(launches[0].url.startsWith('/pages/login/login?from='));
  assert.ok(decodeURIComponent(launches[0].url).includes('/pages/index/index?a=1'));
});

test('gate() 防重入:gateShown() 放行前只跳一次', () => {
  auth.gate();
  auth.gate();
  assert.strictEqual(launches.length, 1);
  auth.gateShown();
  auth.gate();
  assert.strictEqual(launches.length, 2);
});

/* ── 登录 ── */
test('登录成功:token/家庭ID 入库,ensure() 变 true', () => {
  responders.push(() => [200, { ok: true, token: TOKEN_A, family: 'famA', owner: true }]);
  let ok = false;
  auth.login('pw', '', () => { ok = true; }, () => { throw new Error('不该失败'); });
  assert.ok(ok);
  assert.strictEqual(auth.getToken(), TOKEN_A);
  assert.strictEqual(auth.getFamily(), 'famA');
  const req = requests[0];
  assert.strictEqual(req.url, 'https://www.tcued.com/api/login');
  assert.strictEqual(req.data.password, 'pw');
  assert.ok(req.data.device); // 设备名已生成上报
  assert.strictEqual(auth.ensure(), true);
});

test('登录失败(401):中文错误文案,不入库', () => {
  responders.push(() => [401, { ok: false, error: 'wrong password' }]);
  let msg = '';
  auth.login('bad', '', null, m => { msg = m; });
  assert.strictEqual(msg, '家庭ID或密码不对,请再试一次');
  assert.strictEqual(auth.getToken(), '');
});

test('登录限速(429)返回专属文案', () => {
  responders.push(() => [429, { ok: false, error: 'too many attempts' }]);
  let msg = '';
  auth.login('pw', '', null, m => { msg = m; });
  assert.strictEqual(msg, '尝试次数太多,请过几分钟再试');
});

/* ── 换家庭清本地缓存(与网页端同判定) ── */
test('换家庭登录:清上一家 mora-* 缓存,保留登录态与设备名', () => {
  store.set('mora-auth-token', TOKEN_A);
  store.set('mora-auth-family', 'famA');
  store.set('mora-device', 'devtools-abcd');
  store.set('mora-hanzi-mastered-v1', ['一']);
  store.set('mora-pinyin-mastered-v1', ['sm:b']);
  responders.push(() => [200, { ok: true, token: TOKEN_B, family: 'famB', owner: false }]);
  auth.login('pw', 'famB', null, null);
  assert.strictEqual(auth.getToken(), TOKEN_B);
  assert.strictEqual(auth.getFamily(), 'famB');
  assert.strictEqual(store.has('mora-hanzi-mastered-v1'), false);
  assert.strictEqual(store.has('mora-pinyin-mastered-v1'), false);
  assert.strictEqual(store.get('mora-device'), 'devtools-abcd');
});

test('自家首次登录(owner):保住既有本地数据', () => {
  store.set('mora-hanzi-mastered-v1', ['一']);
  responders.push(() => [200, { ok: true, token: TOKEN_A, family: 'famA', owner: true }]);
  auth.login('pw', '', null, null);
  assert.deepStrictEqual(store.get('mora-hanzi-mastered-v1'), ['一']);
  assert.strictEqual(auth.getFamily(), 'famA');
});

/* ── 401 门 ── */
test('on401:清 token 并弹回登录门', () => {
  store.set('mora-auth-token', TOKEN_A);
  store.set('mora-auth-family', 'famA');
  auth.on401();
  assert.strictEqual(auth.getToken(), '');
  assert.strictEqual(launches.length, 1);
  assert.ok(launches[0].url.startsWith('/pages/login/login?from='));
});

/* ── 注销 ── */
test('logout:清本地并尽力通知服务端删会话', () => {
  store.set('mora-auth-token', TOKEN_A);
  responders.push(opts => {
    assert.strictEqual(opts.url, 'https://www.tcued.com/api/logout');
    assert.strictEqual(opts.data.token, TOKEN_A);
    return [200, { ok: true }];
  });
  auth.logout();
  assert.strictEqual(auth.getToken(), '');
});

/* ── 功能权限 ── */
test('登录响应带 perms:入库后 hasPerm 生效,管理员 * 全开', () => {
  responders.push(() => [200, { ok: true, token: TOKEN_A, family: 'famA', owner: false, perms: ['*'] }]);
  auth.login('pw', '', null, null);
  assert.strictEqual(auth.hasPerm('kebiao'), true);
  assert.strictEqual(auth.hasPerm('points'), true);
});

test('hasPerm:普通家庭按清单判定,未列出 = false', () => {
  store.set('mora-auth-perms', JSON.stringify(['points', 'homework']));
  assert.strictEqual(auth.hasPerm('points'), true);
  assert.strictEqual(auth.hasPerm('homework'), true);
  assert.strictEqual(auth.hasPerm('kebiao'), false);
  assert.strictEqual(auth.hasPerm('todo'), false);
});

test('refreshPerms:拉最新权限入库覆盖缓存', () => {
  store.set('mora-auth-token', TOKEN_A);
  store.set('mora-auth-perms', JSON.stringify(['points']));
  responders.push(opts => {
    assert.ok(opts.url.indexOf('/api/perms?token=' + TOKEN_A) >= 0);
    return [200, { ok: true, family: 'famA', perms: ['kebiao'] }];
  });
  let ok = false;
  auth.refreshPerms(r => { ok = r; });
  assert.ok(ok);
  assert.strictEqual(auth.hasPerm('kebiao'), true);
  assert.strictEqual(auth.hasPerm('points'), false);
});

test('refreshPerms:401 清 token 弹登录门', () => {
  store.set('mora-auth-token', TOKEN_A);
  store.set('mora-auth-family', 'famA');
  responders.push(() => [401, { ok: false, error: 'unauthorized' }]);
  let ok = true;
  auth.refreshPerms(r => { ok = r; });
  assert.strictEqual(ok, false);
  assert.strictEqual(auth.getToken(), '');
  assert.strictEqual(launches.length, 1);
});

test('ensurePerm:未登录不回调只弹门;登录后回调 allowed', () => {
  let called = false;
  auth.ensurePerm('kebiao', () => { called = true; });
  assert.strictEqual(called, false);
  assert.strictEqual(launches.length, 1);
  auth.gateShown();

  store.set('mora-auth-token', TOKEN_A);
  responders.push(() => [200, { ok: true, perms: ['kebiao'] }]);
  let allowed = null;
  auth.ensurePerm('kebiao', a => { allowed = a; });
  assert.strictEqual(allowed, true);

  responders.push(() => [200, { ok: true, perms: ['points'] }]);
  allowed = null;
  auth.ensurePerm('kebiao', a => { allowed = a; });
  assert.strictEqual(allowed, false);
});

test('换家庭登录:旧权限清单一并清掉,新 perms 来自登录响应', () => {
  store.set('mora-auth-token', TOKEN_A);
  store.set('mora-auth-family', 'famA');
  store.set('mora-auth-perms', JSON.stringify(['points']));
  responders.push(() => [200, { ok: true, token: TOKEN_B, family: 'famB', owner: false, perms: ['kebiao'] }]);
  auth.login('pw', 'famB', null, null);
  assert.strictEqual(auth.hasPerm('points'), false, '上一家的 points 权限不串家');
  assert.strictEqual(auth.hasPerm('kebiao'), true);
});

console.log('\n全部通过:' + passed + ' 个用例');
