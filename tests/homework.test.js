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

/* ── 维护页写入层:saveEntry / uploadImage / newId ── */
test('saveEntry:整条上报与网页端 zuoye-edit 同协议,payload 带全 g,成功回调 onOk', () => {
  store.set('mora-auth-token', TOKEN);
  const entry = {
    id: 'hwnew01', date: '2026-09-10', subject: '语文', text: '读课文第5课3遍',
    done: 0, imgs: ['img1234abcd', 'img5678efgh'], updatedAt: 0,
  };
  let okCb = false;
  const ok = hw.saveEntry(entry, () => { throw new Error('不该失败'); }, () => { okCb = true; });
  assert.ok(ok);
  assert.ok(entry.updatedAt > 0, '顶新时间戳');
  const item = requests[0].data.items[0];
  assert.strictEqual(item.module, 'homework');
  assert.strictEqual(item.itemKey, 'hwnew01');
  assert.strictEqual(item.mastered, 0);
  assert.strictEqual(item.updatedAt, entry.updatedAt);
  const p = JSON.parse(item.payload);
  assert.strictEqual(p.t, '读课文第5课3遍');
  assert.strictEqual('c' in p, false); // 新登记未完成,与老版本字节级兼容
  assert.deepStrictEqual(p.g, ['img1234abcd', 'img5678efgh']); // g 必须带全
  requests[0].success({ statusCode: 200, data: { ok: true } });
  assert.ok(okCb);
});

test('saveEntry:失败回调 onFail 不清数据(页面保留表单);未登录返回 false', () => {
  store.set('mora-auth-token', TOKEN);
  const entry = { id: 'hwnew02', date: '2026-09-10', subject: '数学', text: '口算一页', done: 0, imgs: [], updatedAt: 0 };
  let failed = false;
  assert.ok(hw.saveEntry(entry, () => { failed = true; }));
  requests[0].fail(new Error('offline'));
  assert.ok(failed);
  // 未登录
  store.clear();
  requests.length = 0;
  assert.strictEqual(hw.saveEntry(entry, () => { throw new Error('不该回调'); }), false);
  assert.strictEqual(requests.length, 0);
});

test('uploadImage:POST /api/image 换服务端 id,id 形如 img+36 进制随机段', () => {
  store.set('mora-auth-token', TOKEN);
  const dataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(100);
  let gotId = '';
  hw.uploadImage(dataUrl, id => { gotId = id; }, () => { throw new Error('不该失败'); });
  const req = requests[0];
  assert.strictEqual(req.url, 'https://www.tcued.com/api/image');
  assert.strictEqual(req.method, 'POST');
  assert.strictEqual(req.data.token, TOKEN);
  assert.strictEqual(req.data.data, dataUrl);
  assert.ok(/^img[0-9a-z]{4,30}$/.test(req.data.id), 'id 满足服务端 IMG_ID 规则: ' + req.data.id);
  req.success({ statusCode: 200, data: { ok: true } });
  assert.strictEqual(gotId, req.data.id);
});

test('uploadImage:服务端拒绝/网络失败走 onFail,401 清 token 弹登录门', () => {
  store.set('mora-auth-token', TOKEN);
  const dataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(10);
  let fails = 0;
  hw.uploadImage(dataUrl, () => { throw new Error('不该成功'); }, () => { fails++; });
  requests[0].success({ statusCode: 400, data: { ok: false, error: 'bad data' } });
  hw.uploadImage(dataUrl, () => { throw new Error('不该成功'); }, () => { fails++; });
  requests[1].fail(new Error('offline'));
  assert.strictEqual(fails, 2);
  // 401
  hw.uploadImage(dataUrl, () => {}, () => {});
  requests[2].success({ statusCode: 401, data: { ok: false } });
  assert.strictEqual(auth.getToken(), '');
  assert.strictEqual(launches.length, 1);
});

test('newId:hw 前缀 + 6 位随机段,同毫秒批量生成不撞 id', () => {
  const ids = new Set();
  for (let i = 0; i < 200; i++) {
    const id = hw.newId();
    assert.ok(/^hw[0-9a-z]+$/.test(id), 'id 形如 hw+36 进制: ' + id);
    ids.add(id);
  }
  assert.strictEqual(ids.size, 200);
});

test('buildEntry:编辑同 id 覆盖,保留完成标记;内容去首尾空格;图片旧引用+新 id,过滤非法', () => {
  const existing = { id: 'hw1', done: 1, date: '2026-09-10', subject: '语文', text: '旧内容', imgs: ['imgaaa1', 'imgbbb2'] };
  const e = hw.buildEntry(existing, {
    date: '2026-09-11', subject: '数学', text: '  口算第3页  ',
    imgs: ['imgaaa1', 'imgccc3', 'not-valid', 123],
  });
  assert.strictEqual(e.id, 'hw1', '同 id 覆盖即编辑');
  assert.strictEqual(e.done, 1, '完成标记保留原状');
  assert.strictEqual(e.date, '2026-09-11');
  assert.strictEqual(e.subject, '数学');
  assert.strictEqual(e.text, '口算第3页');
  assert.deepEqual(e.imgs, ['imgaaa1', 'imgccc3'], '非法引用应被丢弃');
});

test('buildEntry:日期/科目/内容非法返回 null;图片封顶 9 张;未完成 done=0', () => {
  const existing = { id: 'hw2', done: 0 };
  assert.strictEqual(hw.buildEntry(existing, { date: 'bad', subject: '语文', text: 'x', imgs: [] }), null);
  assert.strictEqual(hw.buildEntry(existing, { date: '2026-09-11', subject: '钢琴', text: 'x', imgs: [] }), null);
  assert.strictEqual(hw.buildEntry(existing, { date: '2026-09-11', subject: '语文', text: '   ', imgs: [] }), null);
  assert.strictEqual(hw.buildEntry(null, { date: '2026-09-11', subject: '语文', text: 'x', imgs: [] }), null);
  const many = [];
  for (let i = 0; i < 12; i++) many.push('img0' + i + 'ab');
  const e = hw.buildEntry(existing, { date: '2026-09-11', subject: '语文', text: 'x', imgs: many });
  assert.strictEqual(e.done, 0);
  assert.strictEqual(e.imgs.length, 9);
});

console.log('\n全部通过:' + passed + ' 个用例');
