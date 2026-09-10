/* utils/points.js 的 Node 测试:mock wx,不依赖微信环境。
   运行:node tests/points.test.js */
const assert = require('assert');

/* ── wx mock:内存 storage(纯函数路径用不到 request) ── */
const store = new Map();
global.getCurrentPages = () => [{ route: 'pages/mine/mine', options: {} }];
global.wx = {
  getStorageSync: k => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: k => { store.delete(k); },
  getStorageInfoSync: () => ({ keys: [...store.keys()] }),
  getDeviceInfo: () => ({ platform: 'devtools' }),
  reLaunch: () => {},
  request() {},
};

const pt = require('../utils/points');

let passed = 0;
function test(name, fn) {
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

console.log(passed + ' 个用例全过');
