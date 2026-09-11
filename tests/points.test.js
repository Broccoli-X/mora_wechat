/* utils/points.js 的 Node 测试:mock wx,不依赖微信环境。
   运行:node tests/points.test.js */
const assert = require('assert');

/* ── wx mock:内存 storage + 可编程 request ── */
const store = new Map();
const requests = []; // 每次 wx.request 的入参

global.getCurrentPages = () => [{ route: 'pages/mine/mine', options: {} }];
global.wx = {
  getStorageSync: k => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: k => { store.delete(k); },
  getStorageInfoSync: () => ({ keys: [...store.keys()] }),
  getDeviceInfo: () => ({ platform: 'devtools' }),
  reLaunch: () => {},
  request(opts) { requests.push(opts); },
};

const auth = require('../utils/auth');
const pt = require('../utils/points');

function reset() {
  store.clear();
  requests.length = 0;
  auth.gateShown();
}

let passed = 0;
function test(name, fn) {
  reset();
  fn();
  passed++;
  console.log('✓ ' + name);
}

/* 服务端进度条目便捷构造 */
function it(itemKey, payloadObj, updatedAt) {
  return { module: 'points', itemKey, updatedAt, payload: JSON.stringify(payloadObj) };
}

test('规则表与网页端同步:不赖床(up,+1)入理由表,科目含钢琴,RULES 7 条', () => {
  const up = pt.reasonOf('up');
  assert.ok(up && up.label === '不赖床' && up.score === 1 && !up.subject, '不赖床固定 +1,不选科目');
  assert.deepEqual(pt.SUBJECTS, ['语文', '数学', '英语', '钢琴', '其他']);
  assert.equal(pt.RULES.length, 7);
  assert.ok(pt.RULES.indexOf('不赖床 +1 分') >= 0);
});

test('decodeItems:不赖床记录正常入库,描述「不赖床」', () => {
  const entries = pt.decodeItems([it('k1', { d: '2026-09-09', r: 'up', s: 1 }, 5)]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].score, 1);
  assert.equal(pt.describe(entries[0]), '不赖床');
});

test('decodeItems:完成作业·钢琴 科目保留并出现在描述里', () => {
  const entries = pt.decodeItems([it('k2', { d: '2026-09-09', r: 'hw', s: 1, j: '钢琴' }, 5)]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].subject, '钢琴');
  assert.equal(pt.describe(entries[0]), '完成作业·钢琴');
});

test('decodeItems:未知理由仍拒收(坏 payload 防线不放松)', () => {
  assert.equal(pt.decodeItems([it('k3', { d: '2026-09-09', r: 'nope', s: 1 }, 5)]).length, 0);
});

test('totalsOf:不赖床计入累计(3+1+2+1 = 7 分)', () => {
  const entries = pt.decodeItems([
    it('k4', { d: '2026-09-08', r: 'hw_pro', s: 3, j: '语文' }, 1),
    it('k5', { d: '2026-09-08', r: 'hw', s: 1, j: '数学' }, 2),
    it('k6', { d: '2026-09-08', r: 'cus', s: 2, n: '读写良好' }, 3),
    it('k7', { d: '2026-09-09', r: 'up', s: 1 }, 4),
  ]);
  const t = pt.totalsOf(entries);
  assert.equal(t.earned, 7);
  assert.equal(t.remaining, 7);
});

/* ── 写入层:发放/兑换单条上报(与网页端 points-edit 同协议) ── */
test('encodeEntry:短键 JSON 与网页端同序,消耗为负分,j/n 仅在有值时出现', () => {
  const earn = pt.normalize({ id: 'pt1', date: '2026-09-10', reason: 'hw', subject: '钢琴', score: 1, updatedAt: 1 });
  assert.strictEqual(pt.encodeEntry(earn), '{"d":"2026-09-10","r":"hw","s":1,"j":"钢琴"}');
  const buy = pt.normalize({ id: 'pt2', date: '2026-09-10', reason: 'buy', score: 2, note: '乐高小人', updatedAt: 2 });
  assert.strictEqual(pt.encodeEntry(buy), '{"d":"2026-09-10","r":"buy","s":-2,"n":"乐高小人"}');
});

test('newId:pt 前缀 + 小写字母数字,同毫秒批量生成不撞 id', () => {
  const ids = new Set();
  for (let i = 0; i < 200; i++) {
    const id = pt.newId();
    assert.ok(/^pt[0-9a-z]+$/.test(id), 'id 形如 pt+36 进制: ' + id);
    ids.add(id);
  }
  assert.strictEqual(ids.size, 200);
});

test('pushEntry:POST 形状与网页端 pushOne 同协议,payload 带全字段(压平防线)', () => {
  const TOKEN = 'a'.repeat(64);
  store.set('mora-auth-token', TOKEN);
  const entry = pt.normalize({ id: 'ptX', date: '2026-09-10', reason: 'hw_pro', subject: '语文', score: 3, note: '主动', updatedAt: 12345 });
  let failed = false;
  const ok = pt.pushEntry(entry, () => { failed = true; });
  assert.ok(ok);
  const req = requests[0];
  assert.strictEqual(req.url, 'https://www.tcued.com/api/progress');
  assert.strictEqual(req.method, 'POST');
  assert.strictEqual(req.data.token, TOKEN);
  const item = req.data.items[0];
  assert.strictEqual(item.module, 'points');
  assert.strictEqual(item.itemKey, 'ptX');
  assert.strictEqual(item.mastered, 0);
  assert.strictEqual(item.updatedAt, 12345);
  assert.ok(item.device);
  assert.strictEqual(item.payload, '{"d":"2026-09-10","r":"hw_pro","s":3,"j":"语文","n":"主动"}');
  assert.ok(!failed);
  req.fail(new Error('offline'));
  assert.ok(failed);
});

test('pushEntry:401 清 token 弹回登录门;未登录直接返回 false 不发请求', () => {
  const TOKEN = 'a'.repeat(64);
  store.set('mora-auth-token', TOKEN);
  const mk = () => pt.normalize({ id: 'ptX', date: '2026-09-10', reason: 'up', score: 1, updatedAt: 1 });
  // 未登录
  store.clear();
  assert.strictEqual(pt.pushEntry(mk(), () => { throw new Error('不该回调'); }), false);
  assert.strictEqual(requests.length, 0);
  // 401
  store.set('mora-auth-token', TOKEN);
  pt.pushEntry(mk());
  const req = requests[0];
  req.success({ statusCode: 401, data: { ok: false } });
  assert.strictEqual(auth.getToken(), '');
});

/* ── 家长算术门:与网页端同源 ── */
test('mathChallenge:三位数加减两位数,减法保证不出现负数,checkAnswer 严进严出', () => {
  for (let i = 0; i < 300; i++) {
    const ch = pt.mathChallenge();
    assert.ok(ch.a >= 100 && ch.a <= 999, 'a 是三位数');
    assert.ok(ch.b >= 10 && ch.b <= 99, 'b 是两位数');
    if (ch.op === '+') assert.strictEqual(ch.answer, ch.a + ch.b);
    else {
      assert.strictEqual(ch.answer, ch.a - ch.b);
      assert.ok(ch.b <= ch.a - 1, '减数小于被减数');
    }
    assert.ok(pt.checkAnswer(ch, String(ch.answer)));
    assert.ok(!pt.checkAnswer(ch, String(ch.answer + 1)));
    assert.ok(!pt.checkAnswer(ch, 'abc'));
    assert.ok(!pt.checkAnswer(ch, ''));
    assert.ok(pt.checkAnswer(ch, ' ' + ch.answer + ' ')); // 首尾空白容忍,与网页端一致
  }
  assert.strictEqual(pt.challengeText({ a: 345, op: '+', b: 67 }), '345 + 67 = ?');
  assert.strictEqual(pt.challengeText({ a: 345, op: '-', b: 67 }), '345 - 67 = ?');
});

console.log(passed + ' 个用例全过');
