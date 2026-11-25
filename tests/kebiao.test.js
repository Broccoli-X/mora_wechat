/* utils/kebiao.js 的 Node 测试:默认课表数据 + 在线课表(缓存 / 拉取 / 工具函数,mock wx),
   不依赖微信环境。运行:node tests/kebiao.test.js */
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

/* ── 在线课表:mock wx(内存 storage + request 捕获,按 URL 关键字注入回包)── */
let store = new Map();
let reqs = [];
let routes = {};
let gated = false;
global.getCurrentPages = () => [{ route: 'pages/kebiao/kebiao', options: {} }];
global.wx = {
  getStorageSync: k => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: k => { store.delete(k); },
  getDeviceInfo: () => ({ platform: 'devtools' }),
  reLaunch: () => { gated = true; },
  request(o) {
    reqs.push(o.url);
    for (const key of Object.keys(routes)) {
      if (o.url.indexOf(key) >= 0) {
        const r = routes[key];
        if (r === null) { if (o.fail) o.fail(); return; }   // null = 网络失败
        if (o.success) o.success(r);
        return;
      }
    }
    if (o.fail) o.fail();
  },
};

/* 模块级 cur 状态在加载时读缓存:每个用例重新加载 utils */
function freshUtil() {
  delete require.cache[require.resolve('../utils/kebiao')];
  return require('../utils/kebiao');
}
function reset(extraRoutes, signedIn = true) {
  store.clear();
  reqs = [];
  routes = extraRoutes || {};
  gated = false;
  if (signedIn) {
    store.set('mora-auth-token', 'T');
    store.set('mora-auth-family', 'mora');
  }
}
const ok = data => ({ statusCode: 200, data: { ok: true, data: data, updatedAt: data ? 200 : 0 } });

/* 一份 2 节 × 2 天的在线课表:周一第1节语文、周一第2节空堂、周二第1节空堂、周二第2节数学 */
const ONLINE = {
  school: '在线小学', cls: '二(1)班', term: '下学期',
  days: ['星期一', '星期二'],
  periods: [{ label: '第1节', half: '上午', time: '8:35~9:15' },
    { label: '第2节', half: '下午', time: '14:00~14:40' }],
  routine: [],
  grid: [[['语文', '张老师', ''], ['', '', '']],
    [['', '', ''], ['数学', '', '带尺子']]],
  meta: { '语文': { icon: '📖', main: '#c9392b' }, '数学': { icon: '🔢', main: '#1d5fbf' } },
};

test('在线课表:没缓存也没保存过 → 内置默认课表;data:null 不动它', () => {
  reset({ '/api/kebiao?': { statusCode: 200, data: { ok: true, data: null, updatedAt: 0 } } });
  const kb = freshUtil();
  assert.strictEqual(kb.CACHE_KEY, 'mora-kebiao-doc');
  assert.strictEqual(kb.current().school, KEBIAO.school);
  assert.strictEqual(kb.current().periods.length, 7);
  let got = null;
  kb.refresh((changed, err) => { got = [changed, err]; });
  assert.deepStrictEqual(got, [false, null]);
  assert.strictEqual(kb.current().school, KEBIAO.school);
});

test('在线课表:updatedAt 更新 → 替换并写缓存;重开后缓存优先', () => {
  reset({ '/api/kebiao?': ok(ONLINE) });
  let kb = freshUtil();
  let got = null;
  kb.refresh((changed, err) => { got = [changed, err]; });
  assert.deepStrictEqual(got, [true, null]);
  assert.strictEqual(kb.current().school, '在线小学');
  assert.strictEqual(store.get('mora-kebiao-doc').updatedAt, 200, '应写入本机缓存');
  assert.ok(reqs[0].indexOf('https://www.tcued.com/api/kebiao?token=T') === 0, '应带 token 拉课表');
  kb = freshUtil();                                   // 重开小程序:缓存先于接口
  assert.strictEqual(kb.current().school, '在线小学');
  assert.strictEqual(kb.current().periods.length, 2);
});

test('在线课表:相等时间戳但内容不同也替换;相同版本不替换', () => {
  reset({ '/api/kebiao?': { statusCode: 200, data: { ok: true, updatedAt: 50,
    data: Object.assign({}, ONLINE, { cls: '三(1)班' }) } } });
  store.set('mora-kebiao-doc', { updatedAt: 50, data: ONLINE });
  let kb = freshUtil();
  assert.strictEqual(kb.current().cls, '二(1)班');
  let got = null;
  kb.refresh((changed, err) => { got = [changed, err]; });
  assert.deepStrictEqual(got, [true, null]);
  assert.strictEqual(kb.current().cls, '三(1)班');
  got = null;
  kb.refresh((changed, err) => { got = [changed, err]; });
  assert.deepStrictEqual(got, [false, null], '内容没变就不再替换');
});

test('在线课表:坏数据 / 网络失败 / 非 200 不动当前课表;无 token 不发请求;401 弹登录门', () => {
  reset({ '/api/kebiao?': { statusCode: 200, data: { ok: true, data: '坏的', updatedAt: 300 } } });
  store.set('mora-kebiao-doc', { updatedAt: 50, data: ONLINE });
  let kb = freshUtil();
  let got = null;
  kb.refresh((changed, err) => { got = [changed, err]; });
  assert.deepStrictEqual(got, [false, 'bad']);
  assert.strictEqual(kb.current().cls, '二(1)班', '坏数据不覆盖缓存');

  reset({ '/api/kebiao?': { statusCode: 200, data: { ok: true, data: { days: [] }, updatedAt: 300 } } });
  kb = freshUtil();
  got = null;
  kb.refresh((changed, err) => { got = [changed, err]; });
  assert.deepStrictEqual(got, [false, 'bad'], '清洗后没有星期 / 节次的文档不采用');
  assert.strictEqual(kb.current().school, KEBIAO.school);

  reset({ '/api/kebiao?': null });                    // null = 网络失败
  kb = freshUtil();
  got = null;
  kb.refresh((changed, err) => { got = [changed, err]; });
  assert.deepStrictEqual(got, [false, 'net']);

  reset({ '/api/kebiao?': { statusCode: 500, data: { ok: false } } });
  kb = freshUtil();
  got = null;
  kb.refresh((changed, err) => { got = [changed, err]; });
  assert.deepStrictEqual(got, [false, 'bad']);

  reset({}, false);                                    // 没登录
  kb = freshUtil();
  got = null;
  kb.refresh((changed, err) => { got = [changed, err]; });
  assert.deepStrictEqual(got, [false, 'auth']);
  assert.strictEqual(reqs.length, 0, '无 token 不发请求');

  reset({ '/api/kebiao?': { statusCode: 401, data: { ok: false } } });
  kb = freshUtil();
  got = null;
  kb.refresh((changed, err) => { got = [changed, err]; });
  assert.deepStrictEqual(got, [false, 'auth']);
  assert.strictEqual(gated, true, '401 应弹登录门');
  assert.strictEqual(store.has('mora-auth-token'), false, '401 应清 token');
});

test('normalizeDoc:渲染保护——网格整形成长方形、空堂清老师备注、坏配色回落、修不了的返回 null', () => {
  reset();
  const kb = freshUtil();
  const doc = kb.normalizeDoc(Object.assign({}, ONLINE, {
    days: ['星期一', ' 星期二 ', '星期一'],
    grid: [[['语文', '张老师', ''], ['数学', '', ''], ['体育', '', '多出来的列']],
      [['', '不该留的老师', ''], ['英语', '李老师', '带课本']],
      [['音乐', '', '多出来的字段']]],
    meta: { '语文': { icon: '📖', main: '#c9392b' }, '数学': { icon: '🔢', main: 'red' }, '坏条目': 'x' },
  }));
  assert.deepStrictEqual(doc.days, ['星期一', '星期二']);
  assert.strictEqual(doc.grid.length, 2);
  assert.deepStrictEqual(doc.grid[0], [['语文', '张老师', ''], ['数学', '', '']]);
  assert.deepStrictEqual(doc.grid[1], [['', '', ''], ['英语', '李老师', '带课本']],
    '空堂清掉老师,多出来的行 / 列丢弃');
  assert.deepStrictEqual(doc.meta['数学'], { icon: '🔢', main: '#5f6b7d' }, '不合法的颜色回落灰色');
  assert.deepStrictEqual(doc.meta['坏条目'], { icon: '', main: '#5f6b7d' }, '坏条目整形为空图标 + 灰色');
  assert.strictEqual(kb.normalizeDoc(null), null);
  assert.strictEqual(kb.normalizeDoc('课表'), null);
  assert.strictEqual(kb.normalizeDoc({ days: [] }), null);
  assert.strictEqual(kb.normalizeDoc(Object.assign({}, ONLINE, { periods: [] })), null);
});

test('工具函数读当前课表:periodAtNow / homeLesson 跳过空堂、次日课程、周末隐藏', () => {
  reset({ '/api/kebiao?': ok(ONLINE) });
  const kb = freshUtil();
  kb.refresh();
  assert.strictEqual(kb.periodAtNow(new Date(2026, 10, 23, 8, 50)), 0);      // 周一 08:50 在第 1 节
  assert.strictEqual(kb.periodAtNow(new Date(2026, 10, 23, 9, 20)), -1, '课间');
  assert.strictEqual(kb.periodAtNow(new Date(2026, 10, 28, 9, 0)), -1, '周六不在课表里');
  let c = kb.homeLesson(new Date(2026, 10, 23, 8, 50));
  assert.deepStrictEqual([c.title, c.badge, c.subject, c.teacher, c.isNow],
    ['今日课程', '现在', '语文', '张老师', true]);
  c = kb.homeLesson(new Date(2026, 10, 23, 8, 0));
  assert.deepStrictEqual([c.title, c.badge, c.subject], ['今日课程', '下一节', '语文'], '课前显示今天下一节');
  c = kb.homeLesson(new Date(2026, 10, 24, 8, 50));
  assert.deepStrictEqual([c.title, c.badge, c.label, c.subject], ['今日课程', '下一节', '第2节', '数学'],
    '当前节是空堂 → 跳到今天下一节有课的');
  c = kb.homeLesson(new Date(2026, 10, 23, 12, 0));
  assert.deepStrictEqual([c.title, c.badge, c.subject], ['次日课程', '星期二', '数学'],
    '周一第1节上完、当天没课了 → 次日第一节有课的');
  assert.deepStrictEqual(kb.homeLesson(new Date(2026, 10, 27, 15, 0)), { show: false }, '周五 → 次日周六不在课表');
  assert.deepStrictEqual(kb.homeLesson(new Date(2026, 10, 28, 9, 0)), { show: false }, '周末整块隐藏');
  assert.deepStrictEqual(kb.metaOf('语文'), { icon: '📖', main: '#c9392b' });
  assert.deepStrictEqual(kb.metaOf('没配色的科目'), { icon: '📌', main: '#5f6b7d' }, '没配色回落 📌 + 灰色');
});

console.log('\n全部通过:' + passed + ' 个用例');
