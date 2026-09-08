/* utils/homework.js 的 Node 测试:mock wx 存储与请求,不依赖微信环境。
   运行:node tests/homework.test.js */
const assert = require('assert');

/* ── wx mock:内存 storage + 可编程 request ── */
const store = new Map();
const requests = []; // 每次 wx.request 的入参
let responders = []; // 每项 (opts) => [statusCode, data];先进先出
const launches = [];

global.getCurrentPages = () => [{ route: 'pages/zuoye/zuoye', options: {} }];
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
const hw = require('../utils/homework');

function reset() {
  store.clear();
  requests.length = 0;
  responders = [];
  launches.length = 0;
  auth.gateShown();
}

let passed = 0;
function test(name, fn) {
  reset();
  fn();
  passed++;
  console.log('✓ ' + name);
}

const TOKEN = 'a'.repeat(64);

/* 服务端进度条目便捷构造 */
function it(itemKey, payloadObj, updatedAt) {
  return { module: 'homework', itemKey, updatedAt, payload: JSON.stringify(payloadObj) };
}

/* ── 解码:c 键 → done ── */
test('decodeItems:payload 带 c:1 → done=1,无 c / c:0 → done=0', () => {
  const entries = hw.decodeItems([
    it('hw1', { d: '2026-09-08', s: '数学', t: '口算一页', c: 1 }, 100),
    it('hw2', { d: '2026-09-08', s: '语文', t: '生字抄写' }, 101),
    it('hw3', { d: '2026-09-08', s: '英语', t: '跟读十分钟', c: 0 }, 102),
  ]);
  assert.strictEqual(entries.length, 3);
  const byId = {};
  entries.forEach(e => { byId[e.id] = e; });
  assert.strictEqual(byId.hw1.done, 1);
  assert.strictEqual(byId.hw2.done, 0);
  assert.strictEqual(byId.hw3.done, 0);
});

test('decodeItems:老格式条目(无 c 键、带 g 图片)解码正常,imgs 保留', () => {
  const entries = hw.decodeItems([
    it('hw1', { d: '2026-09-08', s: '整体要求', t: '八点前完成', g: ['img1234abcd'] }, 100),
  ]);
  assert.strictEqual(entries[0].done, 0);
  assert.deepStrictEqual(entries[0].imgs, ['img1234abcd']);
});

/* ── 编码:与网页端 encodeEntry 字节级一致 ── */
test('encodeEntry:未完成不带 c 键,与老版本 payload 字节级一致(键序 d,s,t,g)', () => {
  const legacy = '{"d":"2026-09-08","s":"数学","t":"口算一页","g":["img1234abcd"]}';
  const entries = hw.decodeItems([it('hw1', JSON.parse(legacy), 100)]);
  assert.strictEqual(hw.encodeEntry(entries[0]), legacy);
});

test('encodeEntry:完成时 c:1,g 图片引用带全(服务端按 g 清理孤儿图片)', () => {
  const entries = hw.decodeItems([it('hw1', { d: '2026-09-08', s: '数学', t: '口算一页', g: ['img1234abcd'] }, 100)]);
  entries[0].done = 1;
  const p = JSON.parse(hw.encodeEntry(entries[0]));
  assert.strictEqual(p.c, 1);
  assert.strictEqual(p.d, '2026-09-08');
  assert.strictEqual(p.s, '数学');
  assert.strictEqual(p.t, '口算一页');
  assert.deepStrictEqual(p.g, ['img1234abcd']);
});

/* ── toggleDone:翻转 + 单条上报 ── */
test('toggleDone:翻转 done、顶新时间戳,POST 形状与网页端 pushOne 同协议', () => {
  store.set('mora-auth-token', TOKEN);
  const entries = hw.decodeItems([it('hw1', { d: '2026-09-08', s: '数学', t: '口算一页', g: ['img1234abcd'] }, 100)]);
  const before = Date.now();
  const done = hw.toggleDone(entries[0]);
  assert.strictEqual(done, 1);
  assert.ok(entries[0].updatedAt >= before);
  const req = requests[0];
  assert.strictEqual(req.url, 'https://www.tcued.com/api/progress');
  assert.strictEqual(req.method, 'POST');
  assert.strictEqual(req.data.token, TOKEN);
  const item = req.data.items[0];
  assert.strictEqual(item.module, 'homework');
  assert.strictEqual(item.itemKey, 'hw1');
  assert.strictEqual(item.mastered, 0);
  assert.strictEqual(item.updatedAt, entries[0].updatedAt);
  assert.ok(item.device);
  const p = JSON.parse(item.payload);
  assert.strictEqual(p.c, 1);
  assert.deepStrictEqual(p.g, ['img1234abcd']); // payload 必须带全 g,否则服务端会清掉图片
});

test('toggleDone:再点一次取消完成,上报 payload 回到无 c 键的老格式', () => {
  store.set('mora-auth-token', TOKEN);
  const entries = hw.decodeItems([it('hw1', { d: '2026-09-08', s: '数学', t: '口算一页', c: 1 }, 100)]);
  const done = hw.toggleDone(entries[0]);
  assert.strictEqual(done, 0);
  const p = JSON.parse(requests[0].data.items[0].payload);
  assert.strictEqual('c' in p, false);
  assert.strictEqual(p.t, '口算一页');
});

test('toggleDone:上报失败触发 onFail(由页面回滚)', () => {
  store.set('mora-auth-token', TOKEN);
  const entries = hw.decodeItems([it('hw1', { d: '2026-09-08', s: '数学', t: '口算一页' }, 100)]);
  let failed = false;
  const done = hw.toggleDone(entries[0], () => { failed = true; });
  assert.strictEqual(done, 1); // 乐观更新已生效
  requests[0].fail(new Error('offline'));
  assert.ok(failed);
});

test('toggleDone:401 清 token 弹回登录门', () => {
  store.set('mora-auth-token', TOKEN);
  const entries = hw.decodeItems([it('hw1', { d: '2026-09-08', s: '数学', t: '口算一页' }, 100)]);
  hw.toggleDone(entries[0]);
  responders.push(() => [401, { ok: false }]);
  const done2 = hw.toggleDone(entries[0]);
  assert.strictEqual(done2, 0);
  assert.strictEqual(auth.getToken(), '');
  assert.strictEqual(launches.length, 1);
  assert.ok(launches[0].url.startsWith('/pages/login/login?from='));
});

test('toggleDone:未登录返回 null,条目不动', () => {
  const entries = hw.decodeItems([it('hw1', { d: '2026-09-08', s: '数学', t: '口算一页' }, 100)]);
  const done = hw.toggleDone(entries[0], () => { throw new Error('不该回调'); });
  assert.strictEqual(done, null);
  assert.strictEqual(entries[0].done, 0);
  assert.strictEqual(requests.length, 0);
});

console.log('\n全部通过:' + passed + ' 个用例');
