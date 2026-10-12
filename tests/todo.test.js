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

/* ── 配图:payload g 键存服务端图片 id,与网页端 todo-core(同作业模块)协议一致 ── */
test('配图 encode:有图才带 g 键(坏 id 丢弃),无图与老版本 payload 字节级一致', () => {
  const withImg = td.normalize({ id: 'td1', text: '交手工', time: '08:00', repeat: 'once', date: '2026-09-12', imgs: ['imgabc123', '不合法id', 42], updatedAt: 1 });
  assert.strictEqual(td.encodeEntry(withImg), '{"t":"交手工","m":"08:00","r":"once","d":"2026-09-12","g":["imgabc123"]}');
  const noImg = td.normalize({ id: 'td2', text: '睡前刷牙', time: '21:30', repeat: 'daily', updatedAt: 2 });
  assert.strictEqual(td.encodeEntry(noImg), '{"t":"睡前刷牙","m":"21:30","r":"daily"}');
});

test('配图 normalize/decodeItems:g 数组只收合法 img id,封顶 3 张,非数组丢弃', () => {
  const good = Array.from({ length: 12 }, (_, i) => 'imgx' + i + 'abcdefgh');
  const e = td.normalize({ id: 'td1', text: 'x', time: '08:00', repeat: 'daily', imgs: good, updatedAt: 1 });
  assert.strictEqual(e.imgs.length, td.IMGS_MAX, '超过 3 张截断(与网页端 IMGS_MAX=3 一致)');
  assert.ok(e.imgs.every(x => /^img[0-9a-z]{4,30}$/.test(x)));
  const entries = td.decodeItems([
    it('td2', { t: '带图', m: '08:00', r: 'daily', g: ['imgok1234', 'bad id!'] }, 5),
    it('td3', { t: '无图', m: '09:00', r: 'daily' }, 6),
    it('td4', { t: '坏型', m: '10:00', r: 'daily', g: 'imgnotarray' }, 7),
  ]);
  const byId = {};
  entries.forEach(e => { byId[e.id] = e; });
  assert.deepStrictEqual(byId.td2.imgs, ['imgok1234'], '坏 id 丢弃');
  assert.deepStrictEqual(byId.td3.imgs, [], '无 g 键等同无图');
  assert.deepStrictEqual(byId.td4.imgs, [], '非数组丢弃');
});

/* ── 单次日期范围:可选 dateEnd(严格晚于开始才保留),payload e 短键 ── */
test('dateEnd normalize:严格晚于保留;等于/早于/非法/非 once 一律退回单日', () => {
  const mk = (repeat, dateEnd, date) => td.normalize({ id: 'td1', text: 'x', time: '08:00', repeat, date, dateEnd, updatedAt: 1 });
  assert.strictEqual(mk('once', '2026-10-07', '2026-10-01').dateEnd, '2026-10-07', '范围保留');
  assert.strictEqual(mk('once', '2026-10-01', '2026-10-01').dateEnd, '', '等于退单日');
  assert.strictEqual(mk('once', '2026-09-30', '2026-10-01').dateEnd, '', '早于退单日');
  assert.strictEqual(mk('once', '2026-02-30', '2026-10-01').dateEnd, '', '非法退单日');
  const wk = td.normalize({ id: 'tdw', text: 'x', time: '08:00', repeat: 'weekly', weekdays: [1], dateEnd: '2026-10-07', updatedAt: 1 });
  assert.strictEqual(wk.dateEnd, '', '非 once 无 dateEnd');
  assert.strictEqual(td.normalize({ id: 'td2', text: 'x', time: '08:00', repeat: 'once', date: '2026-10-01', updatedAt: 1 }).dateEnd, '', '老数据无结束日期');
});

test('dateEnd encode/decode:e 短键往返,无范围不带 e 键(字节级兼容)', () => {
  const range = td.normalize({ id: 'td1', text: '夏令营', time: '08:00', repeat: 'once', date: '2026-10-01', dateEnd: '2026-10-07', updatedAt: 1 });
  assert.strictEqual(td.encodeEntry(range), '{"t":"夏令营","m":"08:00","r":"once","d":"2026-10-01","e":"2026-10-07"}');
  const single = td.normalize({ id: 'td2', text: '交手工', time: '08:00', repeat: 'once', date: '2026-09-12', dateEnd: '', updatedAt: 2 });
  assert.strictEqual(td.encodeEntry(single), '{"t":"交手工","m":"08:00","r":"once","d":"2026-09-12"}');
  const back = td.decodeItems([it('td3', { t: '夏令营', m: '08:00', r: 'once', d: '2026-10-01', e: '2026-10-07' }, 5)])[0];
  assert.strictEqual(back.dateEnd, '2026-10-07', 'e 键往返');
});

test('dateEnd occursOn:范围内每天都在(含首尾),界外/坏日期串不算;单日口径不变', () => {
  const range = td.normalize({ id: 'td1', text: 'x', time: '08:00', repeat: 'once', date: '2026-10-01', dateEnd: '2026-10-07', updatedAt: 1 });
  assert.ok(td.occursOn(range, '2026-10-01'), '首日');
  assert.ok(td.occursOn(range, '2026-10-04'), '中间');
  assert.ok(td.occursOn(range, '2026-10-07'), '尾日');
  assert.ok(!td.occursOn(range, '2026-09-30'), '开始前一天');
  assert.ok(!td.occursOn(range, '2026-10-08'), '结束次日开始不算');
  assert.ok(!td.occursOn(range, '不是日期'), '坏日期串不算');
  const single = td.normalize({ id: 'td2', text: 'x', time: '08:00', repeat: 'once', date: '2026-10-01', updatedAt: 1 });
  assert.ok(td.occursOn(single, '2026-10-01') && !td.occursOn(single, '2026-10-02'), '无范围等同单日');
});

test('dateEnd describe:单日「单次·9月5日」不变,范围「单次·10月1日~10月7日」', () => {
  const single = td.normalize({ id: 'td1', text: 'x', time: '08:00', repeat: 'once', date: '2026-09-05', updatedAt: 1 });
  const range = td.normalize({ id: 'td2', text: 'x', time: '08:00', repeat: 'once', date: '2026-10-01', dateEnd: '2026-10-07', updatedAt: 1 });
  assert.strictEqual(td.describe(single), '单次·9月5日');
  assert.strictEqual(td.describe(range), '单次·10月1日~10月7日');
});

test('imgUrl:GET /api/image?id= 直连地址(不带 token)', () => {
  assert.strictEqual(td.imgUrl('imgabc123'), 'https://www.tcued.com/api/image?id=imgabc123');
});

test('配图条目上报:pushEntry payload 带 g 键;最满条目 payload 仍在服务端 500 字符上限内', () => {
  store.set('mora-auth-token', TOKEN);
  /* 最坏情况:内容顶满 60 字(汉字)+ 每周几全勾 + 图片顶满 3 张(上线即最长的 id) */
  const longIds = Array.from({ length: td.IMGS_MAX }, () => 'img' + Date.now().toString(36) + 'abcd');
  const entry = td.normalize({
    id: 'tdfull', text: '字'.repeat(60), time: '08:00',
    repeat: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6], imgs: longIds, updatedAt: 1,
  });
  const payload = td.encodeEntry(entry);
  assert.ok(payload.indexOf('"g":[') > 0, 'payload 带 g 键');
  assert.ok(payload.length <= 500, 'payload ' + payload.length + ' 字符,服务端 MAX_PAYLOAD=500 内才不被整条丢弃');
  td.pushEntry(entry, () => {});
  assert.strictEqual(requests[0].data.items[0].payload, payload);
});

test('uploadImage:POST /api/image 换服务端 id;非 200/失败回调 onFail,401 弹登录门', () => {
  store.set('mora-auth-token', TOKEN);
  let okId = '', failed = 0;
  td.uploadImage('data:image/jpeg;base64,AAAA', id => { okId = id; }, () => { failed++; });
  const req = requests[0];
  assert.strictEqual(req.url, 'https://www.tcued.com/api/image');
  assert.strictEqual(req.method, 'POST');
  assert.strictEqual(req.data.data, 'data:image/jpeg;base64,AAAA');
  assert.ok(/^img[0-9a-z]{4,30}$/.test(req.data.id), 'id 形如 img+36 进制');
  req.success({ statusCode: 200, data: { ok: true } });
  assert.strictEqual(okId, req.data.id);
  assert.strictEqual(failed, 0);
  // 服务端拒收 → onFail
  td.uploadImage('data:image/jpeg;base64,BBBB', () => { throw new Error('不该回调'); }, () => { failed++; });
  requests[1].success({ statusCode: 200, data: { ok: false } });
  td.uploadImage('data:image/jpeg;base64,CCCC', () => { throw new Error('不该回调'); }, () => { failed++; });
  requests[2].fail(new Error('offline'));
  assert.strictEqual(failed, 2);
  // 401 清 token 弹登录门
  td.uploadImage('data:image/jpeg;base64,DDDD', () => { throw new Error('不该回调'); }, () => { failed++; });
  requests[3].success({ statusCode: 401, data: {} });
  assert.strictEqual(auth.getToken(), '');
  assert.strictEqual(launches.length, 1);
  // 未登录直接 onFail,不发请求
  const before = requests.length;
  td.uploadImage('data:image/jpeg;base64,EEEE', () => { throw new Error('不该回调'); }, () => { failed++; });
  assert.strictEqual(requests.length, before);
  assert.strictEqual(failed, 3);
});

console.log(passed + ' 个用例全过');
