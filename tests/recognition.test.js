/* utils/recognition.js 的 Node 测试:mock wx,不依赖微信环境。
   覆盖:三科口径、条目/批次清洗(坏数据丢弃)、列表排序与学科分节、卡面视图、
   本机缓存(列表 / 按 id 整批)、两步接口(批次列表 → 按批次取内容)、禅模式顺序换卡。
   运行:node tests/recognition.test.js */
const assert = require('assert');

/* ── wx mock:内存 storage + request 捕获(按 URL 关键字注入回包) ── */
let store = new Map();
let reqs = [];
let routes = {};
let gated = false;
global.getCurrentPages = () => [{ route: 'pages/recognition/recognition', options: {} }];
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
};

const rc = require('../utils/recognition');
const auth = require('../utils/auth');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('✓ ' + name);
}

function signIn() { store.set('mora-auth-token', 'T'); }
function signOut() { store.delete('mora-auth-token'); }

/* 列表接口回包:与网页端 server batch_row_out(带概要)同形状,混入坏批次验证丢弃 */
function listPayload() {
  return {
    statusCode: 200,
    data: {
      ok: true, subject: '', batches: [
        { id: 'rbhanzi01', subject: 'hanzi', title: '第5课生字', day: '2026-09-11', note: '每天读两遍', count: 3, updatedAt: 100 },
        { id: 'rbwords01', subject: 'words', title: 'Unit 1 单词', day: '2026-09-12', note: '', count: 2, updatedAt: 200 },
        { id: 'rbimage01', subject: 'image', title: '动物图卡', day: '2026-09-12', note: '', count: 1, updatedAt: 300 },
        { id: 'rbmusic01', subject: 'music', title: '坏学科', day: '2026-09-12', count: 1, updatedAt: 400 },
        { id: 'rbbadday1', subject: 'hanzi', title: '坏日期', day: '2026-13-40', count: 1, updatedAt: 500 },
        { id: 'rbbadttl1', subject: 'hanzi', title: '   ', day: '2026-09-12', count: 1, updatedAt: 600 },
      ],
    },
  };
}

const HANZI_BATCH = {
  id: 'rbhanzi01', subject: 'hanzi', title: '第5课生字', day: '2026-09-11', note: '每天读两遍',
  count: 3, updatedAt: 100,
  items: [
    { face: '口', answer: 'kǒu', extra: '人口' },
    { face: '耳', answer: 'ěr', extra: '' },
    { face: '目', answer: 'mù', extra: '' },
  ],
};

test('三科口径与网页端 lib/recognition-core.js KINDS 一致(id/名称/学科/图标/主色)', () => {
  assert.deepEqual(rc.KIND_IDS, ['hanzi', 'words', 'image']);
  assert.deepEqual(rc.KINDS.map(k => [k.id, k.name, k.subject, k.icon, k.main]), [
    ['hanzi', '识汉字', '语文', '📖', '#c9392b'],
    ['words', '认单词', '英语', '🔤', '#177a3e'],
    ['image', '识图', '其他', '🖼️', '#8a5a2b'],
  ]);
  assert.equal(rc.kindOf('words').name, '认单词');
  assert.equal(rc.kindOf('music').name, 'music', '未知名按原样回,不崩');
  assert.equal(rc.kindOf('').icon, '📌');
});

test('日期:YYYY-MM-DD 按本地解释;非法日期(含不存在的日子)一律 null', () => {
  assert.ok(rc.parseDate('2026-09-11'));
  assert.equal(rc.parseDate('2026-2-3'), null, '必须补零');
  assert.equal(rc.parseDate('2026-13-01'), null);
  assert.equal(rc.parseDate('2026-02-30'), null, '2月没有30号');
  assert.equal(rc.parseDate(''), null);
  assert.equal(rc.fmtCN('2026-09-11'), '9月11日');
  assert.equal(rc.weekdayCN('2026-09-11'), '星期五');
  assert.equal(rc.fmtCN('bad'), '', '取不到返回空串,不显示半个日期');
  assert.equal(rc.weekdayCN('bad'), '');
});

test('条目清洗-识汉字:拼音/组词照收,长文本按显示上限截断(不复刻服务端字面校验)', () => {
  assert.deepEqual(rc.normalizeItem('hanzi', { face: '口', answer: 'kǒu', extra: '人口' }),
    { face: '口', answer: 'kǒu', extra: '人口' });
  const long = rc.normalizeItem('hanzi', { face: '口', answer: 'kǒu', extra: 'x'.repeat(80) });
  assert.equal(long.extra.length, rc.EXTRA_MAX, '附注按上限截断');
  assert.equal(rc.normalizeItem('hanzi', { face: '口' }).answer, '', '答案缺失不丢条目');
  assert.deepEqual(rc.normalizeItem('hanzi', { face: '口耳', answer: 'x' }).face, '口耳',
    'face 形状以服务端为准,客户端只保证能渲染(服务端仍会拒收非单字)');
  assert.equal(rc.normalizeItem('hanzi', { face: '', answer: 'x' }), null, '没字可认才丢');
  assert.equal(rc.normalizeItem('hanzi', null), null);
  assert.equal(rc.normalizeItem('music', { face: 'x', answer: 'y' }), null, '未知学科不猜渲染方式');
});

test('条目清洗-认单词:单词或整句都收,大小写照原样(网页端 1efd1b2 后不再强制小写)', () => {
  assert.deepEqual(rc.normalizeItem('words', { face: 'APPLE', answer: '苹果', extra: '/ˈæpl/' }),
    { face: 'APPLE', answer: '苹果', extra: '/ˈæpl/' }, '大小写照原样,不再转小写');
  assert.deepEqual(rc.normalizeItem('words', { face: 'Yang Ling', answer: '杨玲' }),
    { face: 'Yang Ling', answer: '杨玲', extra: '' }, '课本人名(含空格)必须留下');
  assert.deepEqual(rc.normalizeItem('words', { face: 'Good morning, Miss Li.', answer: '早上好,李老师' }).face,
    'Good morning, Miss Li.', '整句照原样');
  assert.equal(rc.normalizeItem('words', { face: "I'm", answer: '我是' }).face, "I'm", '撇号照原样');
  assert.equal(rc.normalizeItem('words', { face: '  Hi  ', answer: '你好' }).face, 'Hi', '去首尾空白');
  assert.equal(rc.normalizeItem('words', { face: '  ', answer: 'x' }), null, '没内容可认的条目丢弃');
  assert.equal(rc.normalizeItem('words', { face: 'apple' }).answer, '', '答案缺失不丢条目(照原样呈现)');
});

test('回归:服务端存了什么就呈现什么——字面规则变更不再静默丢条目', () => {
  /* 真机数据(2026-09-11「Unit 1 I'm Liu Tao」11 条):旧版客户端按「小写单词」规则
     丢掉了含空格的 5 条(Yang Ling / Wang Bing / Liu Tao / Su Hai / I am)并转小写。
     客户端只做渲染保护(长度截断),不再复刻服务端字面校验,防规则再漂移时又悄悄吃条目 */
  const live = {
    id: 'rbmtwr4gglfu404u', subject: 'words', title: 'Unit 1 I’m Liu Tao', day: '2026-09-11',
    note: '', count: 11, updatedAt: 1789118822600,
    items: [
      { face: 'Hi', answer: '你好', extra: '/haɪ/' },
      { face: 'Yang Ling', answer: '杨玲', extra: '' },
      { face: 'Lily', answer: '莉莉', extra: '' },
      { face: 'Hello', answer: '你好', extra: '/həˈloʊ/' },
      { face: 'Wang Bing', answer: '王兵', extra: '' },
      { face: 'Amy', answer: '艾米', extra: '' },
      { face: 'Liu Tao', answer: '刘涛', extra: '' },
      { face: 'Su Hai', answer: '苏海', extra: '' },
      { face: 'Tommy', answer: '汤米', extra: '' },
      { face: "I'm", answer: '我是', extra: '' },
      { face: 'I am', answer: '我是', extra: '' },
    ],
  };
  const b = rc.normalizeBatch(live);
  assert.equal(b.items.length, 11, '11 条一条都不能少(曾丢 5 条)');
  assert.equal(b.count, 11, '批次数与条目数一致(曾显示 6)');
  assert.deepEqual(b.items.map(i => i.face),
    ['Hi', 'Yang Ling', 'Lily', 'Hello', 'Wang Bing', 'Amy', 'Liu Tao', 'Su Hai', 'Tommy', "I'm", 'I am'],
    '顺序与原样大小写都保持不变');
  assert.equal(rc.batchView(b).count, 11);
  assert.deepEqual(rc.batchView(b).items.map(it => it.answer),
    ['你好', '杨玲', '莉莉', '你好', '王兵', '艾米', '刘涛', '苏海', '汤米', '我是', '我是']);
});

test('条目清洗-识图:emoji 与图片 id 至少一个,坏图片 id 只丢图不丢条目', () => {
  assert.deepEqual(rc.normalizeItem('image', { face: '🍎', answer: '苹果' }),
    { face: '🍎', answer: '苹果', extra: '' });
  const withImg = rc.normalizeItem('image', { face: '', answer: '苹果', img: 'imgabc123' });
  assert.equal(withImg.img, 'imgabc123');
  assert.equal(rc.normalizeItem('image', { face: '', answer: '苹果' }), null, '无图无 emoji 丢弃');
  assert.equal(rc.normalizeItem('image', { face: '🍎', answer: '苹果', img: 'http://evil/x.png' }).img,
    undefined, '非法图片 id 不当图片用,条目仍在');
});

test('概要清洗:学科/名称/日期缺一不可,count 只认正整数', () => {
  const ok = rc.normalizeBrief({ id: 'rbx12345', subject: 'hanzi', title: ' 第5课 ', day: '2026-09-11', note: 'x'.repeat(80), count: 5, updatedAt: 9 });
  assert.equal(ok.title, '第5课', '名称去空白');
  assert.equal(ok.note.length, rc.NOTE_MAX, '备注截断');
  assert.equal(ok.count, 5);
  assert.equal(rc.normalizeBrief({ subject: 'music', title: 'a', day: '2026-09-11' }), null);
  assert.equal(rc.normalizeBrief({ subject: 'hanzi', title: 'a', day: '2026-9-1' }), null);
  assert.equal(rc.normalizeBrief({ subject: 'hanzi', title: '  ', day: '2026-09-11' }), null);
  assert.equal(rc.normalizeBrief(null), null);
  assert.equal(rc.normalizeBrief({ subject: 'hanzi', title: 'a', day: '2026-09-11' }).count, 0, '缺 count 记 0');
});

test('整批清洗:概要 + 条目逐条清洗;一条内容都没有 = 坏批次', () => {
  const b = rc.normalizeBatch({
    id: 'rbhanzi01', subject: 'hanzi', title: '第5课生字', day: '2026-09-11', note: '',
    items: [{ face: '口', answer: 'kǒu' }, { face: '', answer: 'x' }, { face: '耳', answer: '' }],
  });
  assert.equal(b.items.length, 2, '只有「没字可认」的空条目被丢');
  assert.equal(b.count, 2, 'count 以清洗后的条目数为准');
  assert.equal(rc.normalizeBatch({
    id: 'rbhanzi01', subject: 'hanzi', title: 'x', day: '2026-09-11',
    items: [{ face: '', answer: '' }],
  }), null, '一条有效条目都没有 = 坏批次');
  assert.equal(rc.normalizeBatch({
    id: 'not-an-id', subject: 'hanzi', title: 'x', day: '2026-09-11',
    items: [{ face: '口', answer: 'kǒu' }],
  }), null, 'id 不合规(要当路由参数用)');
});

test('整批清洗:条目数按 60 条上限截断(与服务端同口径)', () => {
  const items = [];
  for (let i = 0; i < 80; i++) items.push({ face: '口', answer: 'k' + i });
  const b = rc.normalizeBatch({ id: 'rbhanzi01', subject: 'hanzi', title: 'x', day: '2026-09-11', items: items });
  assert.equal(b.items.length, rc.ITEMS_MAX);
});

test('列表排序:日期倒序,同日按录入时间倒序;不改入参', () => {
  const list = [
    { id: 'a', subject: 'hanzi', title: 'a', day: '2026-09-11', updatedAt: 100, count: 1, note: '' },
    { id: 'b', subject: 'hanzi', title: 'b', day: '2026-09-12', updatedAt: 100, count: 1, note: '' },
    { id: 'c', subject: 'hanzi', title: 'c', day: '2026-09-12', updatedAt: 500, count: 1, note: '' },
  ];
  const sorted = rc.sortBatches(list);
  assert.deepEqual(sorted.map(b => b.id), ['c', 'b', 'a']);
  assert.deepEqual(list.map(b => b.id), ['a', 'b', 'c'], '不改入参');
});

test('概览统计:批次数 / 条目总数 / 最近日期', () => {
  const list = [
    { day: '2026-09-11', count: 3 }, { day: '2026-09-12', count: 2 },
  ];
  assert.deepEqual(rc.statsOf(list), { batches: 2, items: 5, lastDay: '2026-09-12' });
  assert.deepEqual(rc.statsOf([]), { batches: 0, items: 0, lastDay: '' });
  assert.deepEqual(rc.statsOf(null), { batches: 0, items: 0, lastDay: '' });
});

test('学科分节:固定顺序(识汉字→认单词→识图)、空科不呈现、节内日期文案拼好', () => {
  const list = rc.sortBatches([
    { id: 'rbw', subject: 'words', title: 'w', day: '2026-09-12', count: 2, note: '', updatedAt: 1 },
    { id: 'rbh', subject: 'hanzi', title: 'h', day: '2026-09-11', count: 3, note: '', updatedAt: 1 },
  ]);
  const secs = rc.sections(list);
  assert.deepEqual(secs.map(s => s.key), ['hanzi', 'words'], '无识图内容则无该节');
  assert.equal(secs[0].name, '识汉字');
  assert.equal(secs[0].subject, '语文');
  assert.deepEqual(secs[0].batches.map(b => b.id), ['rbh']);
  assert.equal(secs[0].batches[0].dayCN, '9月11日 星期五');
  assert.equal(secs[0].batches[0].kindName, '识汉字');
  assert.deepEqual(rc.sections([]), []);
});

test('卡面视图:三科标签与主面/副行字段(批次网格与禅模式共用)', () => {
  const h = rc.itemView('hanzi', { face: '口', answer: 'kǒu', extra: '人口' }, 0);
  assert.deepEqual([h.i, h.kind, h.color, h.face, h.answer, h.extra, h.labelA, h.labelB, h.imgUrl],
    [0, 'hanzi', '#c9392b', '口', 'kǒu', '人口', '拼音', '组词', '']);
  const w = rc.itemView('words', { face: 'apple', answer: '苹果', extra: '/ˈæpl/' }, 1);
  assert.deepEqual([w.labelA, w.labelB, w.color], ['中文', '音标', '#177a3e']);
  const im = rc.itemView('image', { face: '🍎', answer: '苹果', extra: 'apple', img: 'imgabc123' }, 2);
  assert.deepEqual([im.labelA, im.labelB, im.color, im.face], ['名称', '英文', '#8a5a2b', '🍎']);
  assert.equal(im.imgUrl, 'https://www.tcued.com/api/image?id=imgabc123',
    '识图图片走 /api/image?id=(不带 token,直接当图片地址)');
  const vs = rc.itemViews('hanzi', [{ face: '口', answer: 'kǒu' }, { face: '耳', answer: 'ěr' }]);
  assert.deepEqual(vs.map(v => v.i), [0, 1], 'i 为批次内序号(禅模式导航用)');
});

test('批次视图:头部字段(学科口径/日期文案/条数)与卡片数组一次给全', () => {
  const v = rc.batchView(rc.normalizeBatch(HANZI_BATCH));
  assert.equal(v.title, '第5课生字');
  assert.deepEqual([v.kind, v.kindName, v.kindIcon, v.subjectText, v.main],
    ['hanzi', '识汉字', '📖', '语文', '#c9392b']);
  assert.equal(v.dayCN, '9月11日 星期五');
  assert.equal(v.note, '每天读两遍');
  assert.equal(v.count, 3);
  assert.deepEqual(v.items.map(it => it.face), ['口', '耳', '目']);
  assert.equal(rc.batchView(null), null);
});

test('本机缓存-列表:写入可读回,脏缓存(坏批次)读出即丢', () => {
  store.clear();
  rc.saveBatches([{ id: 'rbhanzi01', subject: 'hanzi', title: '第5课生字', day: '2026-09-11', count: 3, note: '', updatedAt: 1 }]);
  assert.deepEqual(rc.loadBatches().map(b => b.id), ['rbhanzi01']);
  store.set('mora-recognition-batches-v1', [{ subject: 'music', title: 'x', day: '2026-09-11' }, { subject: 'hanzi', title: 'y', day: '2026-13-01' }]);
  assert.deepEqual(rc.loadBatches(), [], '脏缓存当没有');
  store.set('mora-recognition-batches-v1', 'not-an-array');
  assert.deepEqual(rc.loadBatches(), []);
});

test('本机缓存-整批:按 id 存取;超出上限按 updatedAt 淘汰最旧', () => {
  store.clear();
  rc.saveBatch(rc.normalizeBatch(HANZI_BATCH));
  assert.deepEqual(rc.loadBatch('rbhanzi01').items.map(i => i.face), ['口', '耳', '目']);
  assert.equal(rc.loadBatch('rbother'), null);
  assert.equal(rc.saveBatch({ id: 'bad' }), undefined, '坏 id 不写(不抛错)');
  store.set(rc.ITEM_KEY, { rbhanzi01: { id: 'rbhanzi01', subject: 'hanzi', title: 'x', day: '2026-09-11', items: [] } });
  assert.equal(rc.loadBatch('rbhanzi01'), null, '脏缓存(无有效条目)当没有');

  store.clear();
  for (let i = 0; i < 61; i++) {
    rc.saveBatch(rc.normalizeBatch({
      id: 'rbcache' + (i < 10 ? '0' + i : i), subject: 'hanzi', title: 'x', day: '2026-09-11',
      updatedAt: i, items: [{ face: '口', answer: 'kǒu' }],
    }));
  }
  assert.equal(rc.loadBatch('rbcache00'), null, '最旧的被淘汰');
  assert.ok(rc.loadBatch('rbcache60'), '最新的还在');
});

test('旧版缓存(v1)一律作废:小写/缺条的卡面不许再渲染出来', () => {
  store.clear();
  /* 复现修复前写下的缓存:face 被转成小写、含空格的条目已丢(真机 11 条只剩 6 条) */
  store.set(rc.LEGACY_ITEM_KEY, {
    rbmtwr4gglfu404u: {
      id: 'rbmtwr4gglfu404u', subject: 'words', title: "Unit 1 I'm Liu Tao", day: '2026-09-11',
      note: '', count: 6, updatedAt: 1789118822600,
      items: [{ face: 'hi', answer: '你好' }, { face: "i'm", answer: '我是' }],
    },
  });
  assert.equal(rc.loadBatch('rbmtwr4gglfu404u'), null, '旧缓存不当内容用');
  assert.equal(store.has(rc.LEGACY_ITEM_KEY), false, '读到即清掉,不留在设备上');

  /* 取到远端后写进新版缓存,原样大小写 */
  signIn();
  routes = { '/api/recognition/batch': { statusCode: 200, data: { ok: true, batch: {
    id: 'rbmtwr4gglfu404u', subject: 'words', title: "Unit 1 I'm Liu Tao", day: '2026-09-11',
    note: '', updatedAt: 1789118822600,
    items: [{ face: 'Hi', answer: '你好' }, { face: 'Yang Ling', answer: '杨玲' }, { face: "I'm", answer: '我是' }],
  } } } };
  let got = null;
  rc.fetchBatch('rbmtwr4gglfu404u', b => { got = b; });
  assert.deepEqual(got.items.map(i => i.face), ['Hi', 'Yang Ling', "I'm"], '原样大小写在,含空格的在');
  assert.deepEqual(rc.loadBatch('rbmtwr4gglfu404u').items.map(i => i.face), ['Hi', 'Yang Ling', "I'm"],
    '新版缓存存的是原样文本');
});

test('禅模式取数交接:批次页 setCurrent 后 zen 直接用;换批次 id 不符则作废', () => {
  store.clear();
  rc.setCurrent(rc.normalizeBatch(HANZI_BATCH));
  assert.equal(rc.current('rbhanzi01').title, '第5课生字');
  assert.equal(rc.current(), rc.current('rbhanzi01'), '不传 id 取交接的批次');
  assert.equal(rc.current('rbother'), null, 'id 不符当没有(深链换了批次)');
  rc.setCurrent({ id: 'bad' });
  assert.equal(rc.current(), null, '坏批次不入交接');
});

test('禅模式取数交接:换家庭后作废(本机缓存清了,内存交接也不能串上一家)', () => {
  store.clear();
  store.set('mora-auth-family', 'jia');
  rc.setCurrent(rc.normalizeBatch(HANZI_BATCH));
  assert.ok(rc.current('rbhanzi01'), '同家庭仍可用');
  store.set('mora-auth-family', 'wang');
  assert.equal(rc.current('rbhanzi01'), null, '换家庭后交接作废,走缓存/重新拉取');
});

test('第一步接口:批次列表解析 + 写本机缓存(坏批次丢弃,day 倒序)', () => {
  store.clear(); reqs = []; routes = { '/api/recognition/batches': listPayload() };
  signIn();
  let got = null;
  rc.fetchBatches(list => { got = list; });
  assert.deepEqual(got.map(b => b.id), ['rbimage01', 'rbwords01', 'rbhanzi01'], '同日 updatedAt 新者在前');
  assert.ok(reqs[0].url.indexOf('/api/recognition/batches?token=T') > 0,
    '带 token 与查询串(与网页端外部系统对接同款)');
  assert.deepEqual(rc.loadBatches().map(b => b.id), got.map(b => b.id), '成功即写缓存');
});

test('第一步接口:未登录不发请求;401 弹登录门且不落缓存;离线 done(null) 用缓存', () => {
  store.clear(); reqs = []; routes = {}; gated = false;
  signOut();
  rc.fetchBatches(() => {});
  assert.equal(reqs.length, 0, '未登录不发注定 401 的裸请求');

  signIn();
  auth.gateShown();                    /* 复位弹门防重入标记 */
  routes = { '/api/recognition/batches': { statusCode: 401 } };
  let got = 'unset';
  rc.fetchBatches(list => { got = list; });
  assert.equal(got, null, '401 回调 done(null)');
  assert.ok(gated, '401 清 token 弹回登录页');
  assert.deepEqual(rc.loadBatches(), [], '会话失效不落缓存');
  assert.equal(auth.getToken(), '', 'token 已清');

  signIn(); routes = { '/api/recognition/batches': null };   /* null = 网络失败 */
  got = 'unset';
  rc.fetchBatches(list => { got = list; });
  assert.equal(got, null, '离线 done(null),页面用本机缓存渲染');
});

test('第二步接口:按 id 取整批内容 + 写缓存;请求带 token 与 id', () => {
  store.clear(); reqs = []; routes = { '/api/recognition/batch': {
    statusCode: 200, data: { ok: true, batch: HANZI_BATCH },
  } };
  signIn();
  let got = null, err = 'unset';
  rc.fetchBatch('rbhanzi01', (b, e) => { got = b; err = e; });
  assert.equal(err, null);
  assert.deepEqual(got.items.map(i => i.face), ['口', '耳', '目']);
  assert.ok(reqs[0].url.indexOf('/api/recognition/batch?token=T&id=rbhanzi01') > 0);
  assert.deepEqual(rc.loadBatch('rbhanzi01').items.map(i => i.face), ['口', '耳', '目'], '取到即进本机缓存');
});

test('第二步接口:404=批次已被删(notfound),离线=net,坏 id 不发请求,坏数据=bad', () => {
  store.clear(); reqs = []; signIn();
  const call = (id) => { let r = 'unset'; rc.fetchBatch(id, (b, e) => { r = e; }); return r; };

  routes = { '/api/recognition/batch': { statusCode: 404 } };
  assert.equal(call('rbhanzi01'), 'notfound');
  routes = { '/api/recognition/batch': null };
  assert.equal(call('rbhanzi01'), 'net');
  const n = reqs.length;
  assert.equal(call('not-an-id'), 'notfound');
  assert.equal(reqs.length, n, '坏 id 不发起请求');
  routes = { '/api/recognition/batch': { statusCode: 200, data: { ok: true, batch: { id: 'rbhanzi01' } } } };
  assert.equal(call('rbhanzi01'), 'bad', '整批坏数据不当内容用');

  signOut();
  assert.equal(call('rbhanzi01'), 'auth');
});

test('禅模式换卡:批次内顺序走一张,首尾循环;单张批次原地不动', () => {
  assert.equal(rc.stepIndex(0, 1, 12), 1);
  assert.equal(rc.stepIndex(11, 1, 12), 0, '最后一张左滑回到第一张');
  assert.equal(rc.stepIndex(0, -1, 12), 11, '第一张右滑到上一张=最后一张');
  assert.equal(rc.stepIndex(5, -1, 12), 4);
  assert.equal(rc.stepIndex(0, 1, 1), 0);
  assert.equal(rc.stepIndex(3, 1, 0), 0, '空批次不崩');
});

test('页面注册与入口:app.json 注册三页,分类页综合组「识记」入口挂 recognition 权限键', () => {
  const fs = require('fs');
  const path = require('path');
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
  ['pages/recognition/recognition', 'pages/recognition/batch', 'pages/recognition/zen']
    .forEach(p => assert.ok(app.pages.indexOf(p) >= 0, p + ' 应注册进 app.json'));
  const cat = fs.readFileSync(path.join(__dirname, '..', 'pages', 'category', 'category.js'), 'utf8');
  assert.ok(/name: '识记学习'[\s\S]{0,200}?url: '\/pages\/recognition\/recognition'/.test(cat),
    '分类页应有识记学习入口');
  assert.ok(/\/pages\/recognition\/recognition', perm: 'recognition'/.test(cat),
    '入口应挂 recognition 功能键(与网页端 FEATURES 同名)');
  /* 三页文件齐全(缺 .js/.wxml/.wxss/.json 任一都会在开发者工具报错) */
  ['recognition', 'batch', 'zen'].forEach(p => {
    ['.js', '.wxml', '.wxss', '.json'].forEach(ext => {
      const f = path.join(__dirname, '..', 'pages', 'recognition', p + ext);
      assert.ok(fs.existsSync(f), '缺文件 ' + p + ext);
    });
  });
});

console.log('\n全部通过:' + passed + ' 个用例');
