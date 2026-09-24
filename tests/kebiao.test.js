/* utils/kebiao.js 的 Node 测试:纯数据 + 纯函数,不依赖微信环境。
   运行:node tests/kebiao.test.js */
const assert = require('assert');
const { KEBIAO, KEBIAO_META } = require('../utils/kebiao');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('✓ ' + name);
}

test('课表数据:学校 / 班级 / 学期与纸质课程表一致', () => {
  assert.strictEqual(KEBIAO.school, '苏州市吴中区尹山湖实验小学');
  assert.strictEqual(KEBIAO.cls, '一（7）班');
  assert.strictEqual(KEBIAO.term, '2026至2027学年度第一学期');
  assert.strictEqual(JSON.stringify(KEBIAO.days),
    JSON.stringify(['星期一', '星期二', '星期三', '星期四', '星期五']));
});

test('课表数据:7 个节次,上午 3 节 + 下午 4 节(含延时)', () => {
  assert.strictEqual(KEBIAO.periods.length, 7);
  assert.strictEqual(JSON.stringify(KEBIAO.periods.map(p => p.label)),
    JSON.stringify(['第1节', '第2节', '第3节', '第4节', '第5节', '第6节', '延时']));
  assert.strictEqual(KEBIAO.periods.filter(p => p.half === '上午').length, 3);
  assert.strictEqual(KEBIAO.periods.filter(p => p.half === '下午').length, 4);
});

test('课表数据:七行五列全满,无空格子', () => {
  assert.strictEqual(KEBIAO.grid.length, 7);
  KEBIAO.grid.forEach(row => {
    assert.strictEqual(row.length, 5);
    row.forEach(cell => {
      assert.strictEqual(cell.length, 3);
      assert.ok(cell[0], '科目不能为空');
    });
  });
});

test('课表数据:2026年9月调课三格(美术/体育1/综合轮换,总节数不变)', () => {
  assert.deepStrictEqual([...KEBIAO.grid[3][1]], ['美术', '黄小兰', '']);   // 周二第4节:综合→美术
  assert.deepStrictEqual([...KEBIAO.grid[4][0]], ['体育1', '罗晓宇', '']);  // 周一第5节:美术→体育1
  assert.deepStrictEqual([...KEBIAO.grid[5][0]], ['综合', '李微兰', '']);   // 周一第6节:体育1→综合
});

test('课表数据:每周各科目节数与纸质课程表一致', () => {
  const counts = {};
  KEBIAO.grid.forEach(row => row.forEach(([s]) => { counts[s] = (counts[s] || 0) + 1; }));
  const sorted = c => JSON.stringify(c, Object.keys(c).sort()); // 键序无关比较
  assert.strictEqual(sorted(counts), sorted({
    '语文': 6, '数学': 4, '英语': 2, '音乐': 2, '美术': 2,
    '体育1': 2, '体育与健康': 2, '科学': 1, '综合': 1,
    '道德与法治': 2, '劳动': 1, '书法': 1,
    '延时1': 4, '延时2': 4, '延时': 1,
  }));
});

test('课表数据:每周各老师课数与纸质课程表一致(顾晓芳 11 节最多)', () => {
  const counts = {};
  KEBIAO.grid.forEach(row => row.forEach(([, t]) => { if (t) counts[t] = (counts[t] || 0) + 1; }));
  const sorted = c => JSON.stringify(c, Object.keys(c).sort());
  assert.strictEqual(sorted(counts), sorted({
    '顾晓芳': 11, '罗晓宇': 6, '李微兰': 4, '王雪芳': 2, '黄小兰': 2, '张钰杰': 1,
  }));
});

test('课表数据:出现的每个科目都有配色,同族同色', () => {
  const subjects = new Set();
  KEBIAO.grid.forEach(row => row.forEach(([s]) => subjects.add(s)));
  subjects.forEach(s => {
    assert.ok(KEBIAO_META[s], `科目「${s}」应在 KEBIAO_META 里配色`);
    assert.match(KEBIAO_META[s].main, /^#[0-9a-f]{6}$/);
  });
  assert.strictEqual(KEBIAO_META['体育1'].main, KEBIAO_META['体育与健康'].main);
  assert.strictEqual(KEBIAO_META['延时'].main, KEBIAO_META['延时1'].main);
  assert.strictEqual(KEBIAO_META['延时1'].main, KEBIAO_META['延时2'].main);
  assert.strictEqual(new Set(Object.values(KEBIAO_META).map(m => m.main)).size, 12,
    '同族之外的颜色不应重复(色块靠它区分科目)');
});

console.log('\n全部通过:' + passed + ' 个用例');
