/* utils/todo.js 的 Node 测试:mock wx 存储与请求,不依赖微信环境。
   运行:node tests/todo.test.js */
const assert = require('assert');

/* ── wx mock:内存 storage + 可编程 request ── */
const store = new Map();
const requests = [];
const launches = [];

global.getCurrentPages = () => [{ route: 'pages/todo-edit/todo-edit', options: {} }];
global.wx = {
  getStorageSync: k => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: k => { store.delete(k); },
  getStorageInfoSync: () => ({ keys: [...store.keys()] }),
  getDeviceInfo: () => ({ platform: 'devtools' }),
  reLaunch: opts => { launches.push(opts); },
  request(opts) { requests.push(opts); },
};

const auth = require('../utils/auth');
const td = require('../utils/todo');

function reset() {
  store.clear();
  requests.length = 0;
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
  return { module: 'todo', itemKey, updatedAt, payload: JSON.stringify(payloadObj) };
}

/* ── 编码:与网页端 lib/todo-core.js encodeEntry 同构 ── */
test('encodeEntry:每天 t/m/r 三键;单次带 d;每周几带 w(升序去重)', () => {
  const daily = td.normalize({ id: 'td1', text: '睡前刷牙', time: '21:30', repeat: 'daily', updatedAt: 1 });
  assert.strictEqual(td.encodeEntry(daily), '{"t":"睡前刷牙","m":"21:30","r":"daily"}');
  const once = td.normalize({ id: 'td2', text: '交手工', time: '08:00', repeat: 'once', date: '2026-09-12', updatedAt: 2 });
  assert.strictEqual(td.encodeEntry(once), '{"t":"交手工","m":"08:00","r":"once","d":"2026-09-12"}');
  const weekly = td.normalize({ id: 'td3', text: '上钢琴课', time: '09:00', repeat: 'weekly', weekdays: [6, 3], updatedAt: 3 });
  assert.strictEqual(td.encodeEntry(weekly), '{"t":"上钢琴课","m":"09:00","r":"weekly","w":[3,6]}');
});

test('describe:每天 / 单次·9月5日 / 每周一、三、五(与网页端同文案)', () => {
  const daily = td.normalize({ id: 'a', text: 'x', time: '08:00', repeat: 'daily', updatedAt: 1 });
  const once = td.normalize({ id: 'b', text: 'x', time: '08:00', repeat: 'once', date: '2026-09-05', updatedAt: 1 });
  const weekly = td.normalize({ id: 'c', text: 'x', time: '08:00', repeat: 'weekly', weekdays: [1, 3, 5], updatedAt: 1 });
  assert.strictEqual(td.describe(daily), '每天');
  assert.strictEqual(td.describe(once), '单次·9月5日');
  assert.strictEqual(td.describe(weekly), '每周一、三、五');
});

test('sortByNew:最近编辑的在前(维护页列表口径)', () => {
  const rows = td.sortByNew([
    td.normalize({ id: 'old', text: 'x', time: '08:00', repeat: 'daily', updatedAt: 10 }),
    td.normalize({ id: 'new', text: 'y', time: '09:00', repeat: 'daily', updatedAt: 20 }),
  ]);
  assert.deepStrictEqual(rows.map(e => e.id), ['new', 'old']);
});

/* ── 写入层:添加/修改与删除墓碑(与网页端 todo-edit 同协议) ── */
test('pushEntry:POST 形状与网页端 pushOne 同协议,payload 为短键 JSON', () => {
  store.set('mora-auth-token', TOKEN);
  const entry = td.normalize({ id: 'tdX', text: '交手工', time: '08:00', repeat: 'once', date: '2026-09-12', updatedAt: 777 });
  let failed = false;
  assert.ok(td.pushEntry(entry, () => { failed = true; }));
  const req = requests[0];
  assert.strictEqual(req.url, 'https://www.tcued.com/api/progress');
  assert.strictEqual(req.method, 'POST');
  assert.strictEqual(req.data.token, TOKEN);
  const item = req.data.items[0];
  assert.strictEqual(item.module, 'todo');
  assert.strictEqual(item.itemKey, 'tdX');
  assert.strictEqual(item.mastered, 0);
  assert.strictEqual(item.updatedAt, 777);
  assert.ok(item.device);
  assert.strictEqual(item.payload, '{"t":"交手工","m":"08:00","r":"once","d":"2026-09-12"}');
  assert.ok(!failed);
  req.fail(new Error('offline'));
  assert.ok(failed);
});

test('pushTombstone:空 payload 墓碑,其他设备拉到后同样删除(decodeItems 跳过墓碑)', () => {
  store.set('mora-auth-token', TOKEN);
  let failed = false;
  assert.ok(td.pushTombstone('tdX', () => { failed = true; }));
  const item = requests[0].data.items[0];
  assert.strictEqual(item.module, 'todo');
  assert.strictEqual(item.itemKey, 'tdX');
  assert.strictEqual(item.payload, '');
  assert.ok(item.updatedAt > 0);
  assert.ok(!failed);
  // 拉取侧:墓碑与坏 payload 一律跳过
  const entries = td.decodeItems([
    it('td1', { t: '留着的', m: '08:00', r: 'daily' }, 5),
    { module: 'todo', itemKey: 'tdX', updatedAt: 9, payload: '' },
  ]);
  assert.deepStrictEqual(entries.map(e => e.id), ['td1']);
});

test('pushEntry:401 清 token 弹回登录门;未登录 pushEntry/pushTombstone 返回 false', () => {
  store.set('mora-auth-token', TOKEN);
  const mk = () => td.normalize({ id: 'tdY', text: 'x', time: '08:00', repeat: 'daily', updatedAt: 1 });
  td.pushEntry(mk());
  requests[0].success({ statusCode: 401, data: { ok: false } });
  assert.strictEqual(auth.getToken(), '');
  assert.strictEqual(launches.length, 1);
  // 未登录
  assert.strictEqual(td.pushEntry(mk(), () => { throw new Error('不该回调'); }), false);
  assert.strictEqual(td.pushTombstone('tdZ', () => { throw new Error('不该回调'); }), false);
  assert.strictEqual(requests.length, 1);
});

test('newId:td 前缀 + 小写字母数字,同毫秒批量生成不撞 id', () => {
  const ids = new Set();
  for (let i = 0; i < 200; i++) {
    const id = td.newId();
    assert.ok(/^td[0-9a-z]+$/.test(id), 'id 形如 td+36 进制: ' + id);
    ids.add(id);
  }
  assert.strictEqual(ids.size, 200);
});

console.log(passed + ' 个用例全过');
