# 课表在线读取(小程序端) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 小程序的课表从写死的静态副本改成只读的在线课表——缓存优先、后台拉 `GET /api/kebiao`、内置默认课表兜底;课表页和首页「今日课程」卡按在线课表渲染,不做任何维护入口。

**Architecture:** 照 `utils/chengyu.js` 的「单接口取用 + 本机缓存」套路改 `utils/kebiao.js`(保留静态默认课表当兜底,新增 `normalizeDoc` 渲染保护、`current()`、`refresh()`,工具函数改读当前课表文档);`pages/kebiao` 改 `onShow` 并加下拉刷新,`pages/index` 的课程模块多排一个拉取任务。总设计与网页端/服务端在 mora 仓库:`docs/superpowers/specs/2026-11-24-kebiao-editable-design.md`、`docs/superpowers/plans/2026-11-24-kebiao-editable.md`。小程序侧设计见本仓库 `docs/superpowers/specs/2026-11-24-kebiao-editable-design.md`。

**Tech Stack:** 微信小程序原生(Page / WXML / WXSS);测试为 Node 内置 `assert` + 自写 `test()` 计数器,`node tests/xxx.test.js` 直跑,mock `global.wx` / `global.Page`。全量回归:`for f in tests/*.test.js; do node "$f" >/dev/null 2>&1 || echo "FAIL: $f"; done`。

**落盘约定:** 带 `<!-- write-file: 路径 -->` 标记的代码块是**整个文件的内容**;其余代码块是插入/替换片段,按步骤里的锚点操作。

## Global Constraints

- **只读**:小程序不写课表(不发 `PUT /api/kebiao`),不新增页面,分类页入口与权限键 `kebiao` 不变。
- 接口:`GET /api/kebiao?token=…` → `{ok, data: 课表文档|null, updatedAt}`;`data:null` = 这个家庭没保存过,继续用缓存或内置默认课表。
- 缓存键 `mora-kebiao-doc`,形状 `{updatedAt, data}`(`mora-` 前缀,换家庭登录时照旧被清掉);脏缓存当没有。
- 读取顺序:本机缓存 → 内置默认课表;拉取成功且 `updatedAt` 更新(或相等但内容不同)才替换。
- 只做渲染保护(`normalizeDoc`:按字符截断、网格整形成「节次 × 星期」长方形、空堂清老师 / 备注、`meta` 整形为 `{icon, main}`),**不复刻服务端校验**;不是对象、清洗后没有星期 / 节次的文档视为坏数据,不采用。
- 静态 `KEBIAO` / `KEBIAO_META`(内置默认课表)原样保留、仍导出;现有 7 个默认数据用例不动。
- 工具函数签名不变(`metaOf` / `todayIdxOf` / `periodAtNow` / `currentOrNextLesson` / `homeLesson`),改为读当前课表文档。
- 注释用中文,风格与现有代码一致;只提交到本地,不推送。

---

### Task 1: 取数工具 utils/kebiao.js(TDD)

**Files:**
- Modify: `utils/kebiao.js`(静态默认课表不动;文件头注释、取数与工具函数重写)
- Test: `tests/kebiao.test.js`(保留前 7 个用例,追加在线课表用例)

**Interfaces:**
- Consumes: `utils/auth.js` 的 `getToken()` / `on401()`;全局 `wx.getStorageSync` / `wx.setStorageSync` / `wx.request`。
- Produces(`module.exports`):
  - `API_BASE`、`CACHE_KEY = 'mora-kebiao-doc'`、`KEBIAO`、`KEBIAO_META`(不变)
  - `normalizeDoc(raw) -> doc|null`
  - `current() -> doc`(当前课表文档;形状 `{school, cls, term, days[], periods[{label,half,time}], routine[[名称,时间]], grid[[[科目,老师,备注]]], meta:{科目:{icon,main}}}`)
  - `refresh(done)`:无返回值;`done(changed, err)`,`changed` 布尔,失败时 `err` 为 `'auth'` / `'bad'` / `'net'`
  - `metaOf(subject) -> {icon, main}`;`todayIdxOf(date) -> number`;`periodAtNow(date) -> number`;`currentOrNextLesson(date) -> {index, state}|null`;`homeLesson(now) -> 课程卡对象`

- [ ] **Step 1: 写失败的测试(追加到 tests/kebiao.test.js)**

打开 `tests/kebiao.test.js`,把文件头的这段注释:

```js
/* utils/kebiao.js 的 Node 测试:纯数据 + 纯函数,不依赖微信环境。
   运行:node tests/kebiao.test.js */
```

改成:

```js
/* utils/kebiao.js 的 Node 测试:默认课表数据 + 在线课表(缓存 / 拉取 / 工具函数,mock wx),
   不依赖微信环境。运行:node tests/kebiao.test.js */
```

再把文件**末尾**这一行:

```js
console.log('\n全部通过:' + passed + ' 个用例');
```

替换为下面整段(新增 6 个用例 + 收尾):

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/kebiao.test.js`
Expected: 前 7 个 ✓ 通过,第 8 个起失败——`AssertionError [ERR_ASSERTION]: Values are not strict equal`(还没有 `CACHE_KEY` / `current` / `refresh`,或当前课表仍是静态数据)。

- [ ] **Step 3: 改 utils/kebiao.js**

把 `utils/kebiao.js` 文件开头的注释(到 `const KEBIAO = {` 之前)替换为新文件头 + 引入:

```js
/* 课表(小程序端只读,不维护):内容来自 mora 网页端「课表维护」kebiao-edit.html——
   每个家庭在网页端维护自家的一张课表,小程序只负责取来给孩子看。
   接口(与 mora server/README.md「九」同协议):
     GET /api/kebiao?token=… → {ok, data:课表文档|null, updatedAt}
   登录即可读,按家庭隔离;data:null = 这个家庭还没保存过,用下面的内置默认课表。
   读取顺序:本机缓存 mora-kebiao-doc(离线可看已拉过的课表)→ 内置默认课表;
   拉取成功且 updatedAt 更新才以服务端为真源替换。
   客户端只做渲染保护(normalizeDoc),不复刻服务端校验(照 chengyu.js / knowledge.js 口径)。
   课表文档:{school, cls, term, days[], periods[{label, half, time}], routine[[名称, 时间]],
             grid[[[科目, 老师, 备注]]](行 = 节次,列 = 星期), meta:{科目:{icon, main}}};
   格子里科目为空 = 空堂。 */
const auth = require('./auth');

const API_BASE = 'https://www.tcued.com';
const CACHE_KEY = 'mora-kebiao-doc';

/* ── 内置默认课表(与 mora 网页端 lib/kebiao-data.js 的冻结副本一致):没保存过时兜底 ── */
```

`const KEBIAO = {…};` 与 `const KEBIAO_META = {…};` 两块**原样不动**。然后把这两个静态块之后、到文件末尾 `module.exports = {…};` 为止的**全部内容**,替换为下面这段:

<!-- write-file: .plan-blocks/kebiao-util-tail.js -->
```js
/* 数量 / 长度上限:只用于渲染保护(截断),与服务端同口径 */
const DAYS_MAX = 7;
const PERIODS_MAX = 14;
const ROUTINE_MAX = 30;
const LIMITS = { school: 40, cls: 40, term: 40, day: 6, label: 10, half: 4,
  subject: 12, teacher: 20, note: 20, routineName: 20, routineTime: 30, icon: 8 };
const DAY_NAMES = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const COLOR_RE = /^#[0-9a-f]{6}$/;
const DEFAULT_META = { icon: '📌', main: '#5f6b7d' };

/* 按字符(码点)截断,不切断 emoji */
function clean(s, max) {
  const cps = Array.from(typeof s === 'string' ? s.trim() : '');
  return cps.length > max ? cps.slice(0, max).join('') : cps.join('');
}
function emptyCell() { return ['', '', '']; }

/* 渲染保护:整形成规范形状;不是对象、清洗后没有星期 / 节次 → null(不采用) */
function normalizeDoc(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const days = [];
  (Array.isArray(raw.days) ? raw.days : []).forEach(d => {
    const n = clean(d, LIMITS.day);
    if (n && days.indexOf(n) < 0 && days.length < DAYS_MAX) days.push(n);
  });
  const periods = (Array.isArray(raw.periods) ? raw.periods : [])
    .filter(p => p && typeof p === 'object' && !Array.isArray(p))
    .slice(0, PERIODS_MAX)
    .map(p => ({ label: clean(p.label, LIMITS.label), half: clean(p.half, LIMITS.half),
      time: clean(p.time, LIMITS.routineTime) }));
  if (!days.length || !periods.length) return null;
  const rows = Array.isArray(raw.grid) ? raw.grid : [];
  const grid = periods.map((_, i) => days.map((__, j) => {
    const c = rows[i] && rows[i][j];
    if (!Array.isArray(c)) return emptyCell();
    const subject = clean(c[0], LIMITS.subject);
    // 空堂:老师、备注一并清空
    return subject ? [subject, clean(c[1], LIMITS.teacher), clean(c[2], LIMITS.note)] : emptyCell();
  }));
  const src = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
  const meta = {};
  Object.keys(src).forEach(k => {
    const m = src[k] && typeof src[k] === 'object' ? src[k] : {};
    meta[clean(k, LIMITS.subject)] = {
      icon: clean(m.icon, LIMITS.icon),
      main: typeof m.main === 'string' && COLOR_RE.test(m.main) ? m.main : DEFAULT_META.main,
    };
  });
  const routine = (Array.isArray(raw.routine) ? raw.routine : []).slice(0, ROUTINE_MAX)
    .map(r => [clean(Array.isArray(r) ? r[0] : r, LIMITS.routineName),
      clean(Array.isArray(r) ? r[1] : '', LIMITS.routineTime)])
    .filter(r => r[0] || r[1]);
  return {
    school: clean(raw.school, LIMITS.school), cls: clean(raw.cls, LIMITS.cls),
    term: clean(raw.term, LIMITS.term), days: days, periods: periods,
    routine: routine, grid: grid, meta: meta,
  };
}

/* 内置默认课表:上面的静态 KEBIAO + KEBIAO_META 拼成课表文档(与网页端默认课表一致) */
function defaultDoc() {
  const meta = {};
  Object.keys(KEBIAO_META).forEach(k => {
    meta[k] = { icon: KEBIAO_META[k].icon, main: KEBIAO_META[k].main };
  });
  return normalizeDoc(Object.assign({}, KEBIAO, { meta: meta }));
}

/* ── 本机缓存 {updatedAt, data}:脏缓存当没有 ── */
function loadCache() {
  try {
    const c = wx.getStorageSync(CACHE_KEY);
    if (c && typeof c === 'object' && c.data && typeof c.data === 'object') {
      const data = normalizeDoc(c.data);
      if (data) return { updatedAt: Number.isInteger(c.updatedAt) ? c.updatedAt : 0, data: data };
    }
  } catch (e) { /* 存储不可用 */ }
  return { updatedAt: 0, data: defaultDoc() };
}

let cur = loadCache();

function saveCache() {
  try { wx.setStorageSync(CACHE_KEY, cur); }
  catch (e) { /* 存储失败本次内存生效 */ }
}

/* 当前课表文档 */
function current() {
  return cur.data;
}

/* 拉远端:成功 done(changed, err);err 为 'auth'/'bad'/'net'(失败时)。
   updatedAt 更新(或相等但内容不同)才替换并返回 changed=true;
   data:null(还没保存过)、坏数据、网络失败都不动当前课表 */
function refresh(done) {
  const token = auth.getToken();
  if (!token) { if (done) done(false, 'auth'); return; }
  wx.request({
    url: API_BASE + '/api/kebiao?token=' + encodeURIComponent(token),
    method: 'GET',
    success(res) {
      if (res.statusCode === 401 || res.statusCode === 403) {
        auth.on401();
        if (done) done(false, 'auth');
        return;
      }
      const j = res.data;
      if (res.statusCode !== 200 || !j || !j.ok) { if (done) done(false, 'bad'); return; }
      if (j.data === null) { if (done) done(false, null); return; }   // 没保存过:继续用缓存 / 默认
      const data = normalizeDoc(j.data);
      if (!data) { if (done) done(false, 'bad'); return; }
      const ua = Number(j.updatedAt) || 0;
      const same = JSON.stringify(data) === JSON.stringify(cur.data);
      if (ua > cur.updatedAt || (ua === cur.updatedAt && !same)) {
        cur = { updatedAt: ua, data: data };
        saveCache();
        if (done) done(true, null);
        return;
      }
      if (done) done(false, null);
    },
    fail() { if (done) done(false, 'net'); },
  });
}

function metaOf(subject) {
  const m = cur.data.meta[subject];
  return m ? { icon: m.icon || DEFAULT_META.icon, main: m.main } : DEFAULT_META;
}

/* 今天是课表里的第几列(按标准星期名定位);没排这一天返回 -1 */
function todayIdxOf(d) {
  const w = d.getDay();
  return cur.data.days.indexOf(DAY_NAMES[w === 0 ? 6 : w - 1]);
}

function toMin(s) {
  const p = String(s).split(':');
  return Number(p[0]) * 60 + Number(p[1]);
}

/* 当前时刻落在哪节课;没课的日子、课间返回 -1(非法 / 缺失的时间匹配不到,不抛错) */
function periodAtNow(d) {
  if (todayIdxOf(d) < 0) return -1;
  const m = d.getHours() * 60 + d.getMinutes();
  return cur.data.periods.findIndex(p => {
    const t = p.time.split('~');
    return m >= toMin(t[0]) && m < toMin(t[1]);
  });
}

/* dayIdx 这一列从第 from 节起(含)第一节有课、且在 d 时刻还没结束的节;没有返回 -1 */
function nextLessonIdx(dayIdx, from, d) {
  const m = d.getHours() * 60 + d.getMinutes();
  for (let i = from; i < cur.data.periods.length; i++) {
    if (cur.data.grid[i][dayIdx][0] && m < toMin(cur.data.periods[i].time.split('~')[1])) return i;
  }
  return -1;
}

/* 当前(正在上)或下一节有课的课(空堂跳过),返回 {index, state:'now'|'next'};
   今天没有可显示的课返回 null */
function currentOrNextLesson(d) {
  const dayIdx = todayIdxOf(d);
  if (dayIdx < 0) return null;
  const now = periodAtNow(d);
  if (now >= 0 && cur.data.grid[now][dayIdx][0]) return { index: now, state: 'now' };
  const i = nextLessonIdx(dayIdx, now >= 0 ? now + 1 : 0, d);
  return i < 0 ? null : { index: i, state: 'next' };
}

/* 一节课的展示数据(首页课程卡 / 课表页共用字段口径) */
function lessonCard(dayIdx, i, head) {
  const p = cur.data.periods[i];
  const cell = cur.data.grid[i][dayIdx];
  const meta = metaOf(cell[0]);
  return {
    show: true,
    title: head.title,
    badge: head.badge,
    isNow: head.isNow,
    label: p.label,
    time: p.time,
    subject: cell[0],
    icon: meta.icon,
    color: meta.main,
    teacher: cell[1],
  };
}

/* 首页课程模块:只展示一条(空堂跳过)。
   优先当前节;没有当前节(课前 / 课间 / 当前节是空堂)显示今天接下来有课的节;
   今天没有可显示的了显示次日第一节有课的课;次日无课(周末)则整块隐藏。 */
function homeLesson(now) {
  const pos = currentOrNextLesson(now);
  if (pos) {
    return lessonCard(todayIdxOf(now), pos.index, {
      title: '今日课程',
      badge: pos.state === 'now' ? '现在' : '下一节',
      isNow: pos.state === 'now',
    });
  }
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tIdx = todayIdxOf(tomorrow);
  const i = tIdx < 0 ? -1 : nextLessonIdx(tIdx, 0, tomorrow);
  if (i < 0) return { show: false };
  return lessonCard(tIdx, i, { title: '次日课程', badge: cur.data.days[tIdx], isNow: false });
}

module.exports = {
  API_BASE, CACHE_KEY, KEBIAO, KEBIAO_META,
  normalizeDoc, current, refresh,
  metaOf, todayIdxOf, periodAtNow, currentOrNextLesson, homeLesson,
};
```

用下面的命令把临时块拼进去(替换 `KEBIAO_META` 块之后到文件末尾的全部内容),再删临时目录:

```bash
node -e '
const fs = require("fs");
const src = fs.readFileSync("utils/kebiao.js", "utf8");
const end = src.indexOf("};", src.indexOf("const KEBIAO_META = {")) + 2;   // KEBIAO_META 块的收尾 "};"
if (end < 2) { console.error("没找到 KEBIAO_META 块"); process.exit(1); }
const tail = fs.readFileSync(".plan-blocks/kebiao-util-tail.js", "utf8");
fs.writeFileSync("utils/kebiao.js", src.slice(0, end) + "\n\n" + tail);
'
rm -rf .plan-blocks
node -e 'require("./utils/kebiao")' 2>&1 | head -3
```

Expected: 最后一条命令没有任何输出(模块能正常加载;`wx` 未定义时读缓存失败会被吞掉、回落默认课表)。

- [ ] **Step 4: 跑测试确认通过**

Run: `node tests/kebiao.test.js`
Expected: 13 个 ✓,末行 `全部通过:13 个用例`。

- [ ] **Step 5: 全量回归**

Run: `for f in tests/*.test.js; do node "$f" >/dev/null 2>&1 || echo "FAIL: $f"; done`
Expected: 没有任何 `FAIL:` 输出(20 个测试文件)。

- [ ] **Step 6: Commit**

```bash
git add utils/kebiao.js tests/kebiao.test.js
git commit -m "课表改为只读在线课表:utils/kebiao.js 拉网页端维护的 GET /api/kebiao,本机缓存 mora-kebiao-doc 优先、updatedAt 更新才替换,data:null/坏数据/网络失败不动当前课表,内置默认课表(静态副本)冻结为兜底;normalizeDoc 只做渲染保护不复刻服务端校验;工具函数改读当前课表,首页课程卡跳过空堂(当前节 → 今天下一节有课的 → 次日第一节有课的 → 周末隐藏);kebiao 测试 7 → 13 用例"
```

### Task 2: 课表页与首页课程卡接线 + 文档

**Files:**
- Modify: `pages/kebiao/kebiao.js`(整文件替换)
- Modify: `pages/kebiao/kebiao.wxml`(副标题 / 空行 / 列表 key)
- Modify: `pages/kebiao/kebiao.wxss`(空堂样式)
- Modify: `pages/kebiao/kebiao.json`(开下拉刷新)
- Modify: `pages/index/index.js`(课程模块多排一个拉取任务)
- Create: `tests/kebiao-pages.test.js`
- Modify: `README.md`、`docs/superpowers/specs/2026-11-24-kebiao-editable-design.md`(状态)

**Interfaces:**
- Consumes: Task 1 的 `kb.current()` / `kb.refresh(done)` / `kb.todayIdxOf()` / `kb.periodAtNow()` / `kb.metaOf()` / `kb.homeLesson()`;`utils/auth.js` 的 `ensurePerm` / `hasPerm`。
- Produces:
  - `pages/kebiao` 的 `data`:`subLine`(「学校 · 班级」)、`term`、`tabs`(`['周一', …]`)、`selected`、`isRest`、`rows`(`{idx, label, time, empty, subject, icon, color, teacher, note, isNow}`)、`blocked`;方法 `onShow` / `onPullDownRefresh` / `selectDay` / `render(doc, keep)` / `renderRows(dayIdx, doc)`。
  - `pages/index` 新方法 `loadCourse(done)`;`applyPerms` 在 `courseAllowed` 时把它排进任务列表。

- [ ] **Step 1: 写失败的页面接线测试**

<!-- write-file: tests/kebiao-pages.test.js -->
```js
/* 课表页与首页课程卡的接线测试:mock Page/wx,把 pages/kebiao 的 onShow / 选天 / 下拉刷新和
   pages/index 的课程模块跑一遍,校验 setData。utils 侧逻辑由 tests/kebiao.test.js 覆盖,
   这里只钉页面接线:登录门与 kebiao 功能权限、页签与标题来自在线课表、空堂行、
   下拉刷新保持选中、首页课程卡随刷新更新、未开通不发课表请求。
   不依赖微信环境。运行:node tests/kebiao-pages.test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

/* ── Page/wx mock:Page 捕获页面配置,实例化后按微信语义做浅合并 setData ── */
let store = new Map();
let reqs = [];
let routes = {};
let page = null;
let stopped = 0;

global.getCurrentPages = () => [{ route: 'pages/kebiao/kebiao', options: {} }];
global.Page = o => { page = o; };
global.wx = {
  getStorageSync: k => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => { store.set(k, v); },
  removeStorageSync: k => { store.delete(k); },
  getStorageInfoSync: () => ({ keys: [...store.keys()] }),
  getDeviceInfo: () => ({ platform: 'devtools' }),
  reLaunch: () => {},
  stopPullDownRefresh: () => { stopped++; },
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

const auth = require('../utils/auth');

/* 在线课表:7 天 × 2 节全部有课——任意日期 / 时刻首页课程卡都有内容可显示,
   断言不依赖跑测试时的时间(只断言科目名前缀) */
function onlineDoc(prefix) {
  const names = ['一', '二', '三', '四', '五', '六', '日'];
  return {
    school: '在线小学', cls: '二(1)班', term: '下学期',
    days: names.map(n => '星期' + n),
    periods: [{ label: '早读', half: '上午', time: '7:50~8:20' },
      { label: '第1节', half: '上午', time: '8:35~9:15' }],
    routine: [],
    grid: [names.map(() => [prefix + '课A', '张老师', '']),
      names.map(() => [prefix + '课B', '李老师', '带课本'])],     // 行 = 节次,列 = 星期
    meta: {},
  };
}
const KB_OK = { statusCode: 200, data: { ok: true, data: onlineDoc('新'), updatedAt: 200 } };
const PERMS_ALL = { statusCode: 200, data: { ok: true, perms: ['*'], family: 'mora', mustChange: false } };
const PERMS_NONE = { statusCode: 200, data: { ok: true, perms: ['poems'], family: 'quan', mustChange: false } };

function reset(extraRoutes, perms) {
  store.clear();
  reqs = [];
  stopped = 0;
  routes = Object.assign({ '/api/perms': PERMS_ALL, '/api/kebiao?': KB_OK }, extraRoutes || {});
  store.set('mora-auth-token', 'T');
  store.set('mora-auth-family', 'mora');
  if (perms) store.set('mora-auth-perms', JSON.stringify(perms));
  auth.gateShown();
}

/* 载入页面文件并实例化(setData 浅合并);同时重置 utils/kebiao 的内存状态,
   页面 require 到的就是这份刚重置的实例 */
function load(rel) {
  page = null;
  delete require.cache[require.resolve('../utils/kebiao')];
  require('../utils/kebiao');
  const file = path.join(__dirname, '..', rel);
  delete require.cache[require.resolve(file)];
  require(file);
  const inst = Object.create(page);
  inst.data = JSON.parse(JSON.stringify(page.data));
  inst.setData = function (patch) { Object.assign(this.data, patch); };
  return inst;
}

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }

test('课表页:未开通 kebiao 整页拦截,不拉课表', () => {
  reset({ '/api/perms': PERMS_NONE });
  const p = load('pages/kebiao/kebiao.js');
  p.onShow();
  assert.strictEqual(p.data.blocked, true);
  assert.ok(!reqs.some(u => u.indexOf('/api/kebiao') >= 0), '未开通不应拉课表');
});

test('课表页:页签 / 学校班级 / 学期 / 节次都来自在线课表,选中今天所在的列', () => {
  reset();
  const p = load('pages/kebiao/kebiao.js');
  p.onShow();
  assert.strictEqual(p.data.blocked, false);
  assert.strictEqual(p.data.tabs.length, 7, '星期页签来自在线课表');
  assert.strictEqual(p.data.tabs[0], '周一');
  assert.strictEqual(p.data.subLine, '在线小学 · 二(1)班');
  assert.strictEqual(p.data.term, '下学期');
  assert.deepStrictEqual(p.data.rows.map(r => r.label), ['早读', '第1节']);
  assert.ok(p.data.rows.every(r => r.subject.indexOf('新课') === 0), '课程来自在线课表');
  assert.ok(reqs.some(u => u.indexOf('/api/kebiao?token=T') >= 0), '应带 token 拉课表');
  const w = new Date().getDay();
  assert.strictEqual(p.data.selected, w === 0 ? 6 : w - 1, '选中今天所在的列');
  assert.strictEqual(p.data.isRest, false, '在线课表排了周末,不再是休息日');
  const today = p.data.rows.filter(r => r.isNow).length;
  assert.ok(today === 0 || today === 1, '最多一节高亮为「现在」');
});

test('课表页:空堂一行显示「空」;选中星期后下拉刷新保持选中', () => {
  const doc = onlineDoc('新');
  doc.grid[1][2] = ['', '', ''];                      // 周三(第 3 列)第 1 节(第 2 行)是空堂
  reset({ '/api/kebiao?': { statusCode: 200, data: { ok: true, data: doc, updatedAt: 200 } } });
  const p = load('pages/kebiao/kebiao.js');
  p.onShow();
  p.selectDay({ currentTarget: { dataset: { index: 2 } } });
  assert.strictEqual(p.data.selected, 2);
  assert.strictEqual(p.data.rows[0].subject, '新课A');
  assert.strictEqual(p.data.rows[1].empty, true);
  assert.strictEqual(p.data.rows[1].subject, '');
  assert.strictEqual(p.data.rows[1].idx, 1, '列表 key 用序号(节次名称可能重复)');
  p.onPullDownRefresh();
  assert.strictEqual(stopped, 1, '下拉刷新完成后收起');
  assert.strictEqual(p.data.selected, 2, '刷新重绘保持选中的星期');
  assert.strictEqual(p.data.rows[1].empty, true);
});

test('首页课程卡:开通课表时拉在线课表,课程卡来自在线课表;拉完才收起下拉刷新', () => {
  reset({}, ['kebiao']);
  const p = load('pages/index/index.js');
  p.applyPerms();
  assert.strictEqual(p.data.courseAllowed, true);
  assert.strictEqual(p.data.course.show, true);
  assert.ok(reqs.some(u => u.indexOf('/api/kebiao?token=T') >= 0), '应拉在线课表');
  assert.ok(p.data.course.subject.indexOf('新课') === 0, '课程卡来自在线课表:' + p.data.course.subject);
  assert.ok(p.data.course.title === '今日课程' || p.data.course.title === '次日课程');
  let done = false;
  p.applyPerms(() => { done = true; });
  assert.strictEqual(done, true, '课表拉取完成后才收起下拉刷新');
});

test('首页课程卡:未开通课表 → 整块不显示,也不发课表请求', () => {
  reset({}, ['poems']);
  const p = load('pages/index/index.js');
  p.applyPerms();
  assert.strictEqual(p.data.courseAllowed, false);
  assert.deepStrictEqual(p.data.course, { show: false });
  assert.ok(!reqs.some(u => u.indexOf('/api/kebiao') >= 0), '未开通不应拉课表');
});

test('接线契约:课表页开了下拉刷新、空堂样式、序号 key;小程序端只读、没有维护页', () => {
  const root = path.join(__dirname, '..');
  const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
  assert.strictEqual(JSON.parse(read('pages/kebiao/kebiao.json')).enablePullDownRefresh, true,
    '课表页应开下拉刷新');
  const wxml = read('pages/kebiao/kebiao.wxml');
  assert.ok(wxml.indexOf('wx:key="idx"') >= 0, '列表 key 用序号');
  assert.ok(wxml.indexOf('chip-empty') >= 0 && wxml.indexOf('>空</view>') >= 0, '空堂行');
  assert.ok(wxml.indexOf('{{subLine}}') >= 0, '学校 / 班级拼成一行,空段不显示');
  assert.ok(read('pages/kebiao/kebiao.wxss').indexOf('.chip-empty') >= 0, '空堂样式');
  assert.ok(read('pages/category/category.js').indexOf("url: '/pages/kebiao/kebiao', perm: 'kebiao'") >= 0,
    '分类页入口与权限不变');
  const util = read('utils/kebiao.js');
  assert.ok(util.indexOf("'/api/kebiao?token='") >= 0, '读在线课表接口');
  assert.ok(util.indexOf("method: 'PUT'") < 0, '小程序端只读,不写课表');
  assert.strictEqual(fs.existsSync(path.join(root, 'pages', 'kebiao-edit')), false, '小程序不做维护页');
});

console.log('\n全部通过:' + passed + ' 个用例');
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node tests/kebiao-pages.test.js`
Expected: FAIL——`pages/kebiao/kebiao.js` 旧实现的 `data.tabs` 是 5 个工作日、没有 `subLine`,`assert.strictEqual(p.data.tabs.length, 7)` 失败。

- [ ] **Step 3: 改课表页 JS(整文件替换)**

<!-- write-file: pages/kebiao/kebiao.js -->
```js
const kb = require('../../utils/kebiao');
const auth = require('../../utils/auth');

Page({
  data: {
    subLine: '',       // 「学校 · 班级」,空段不显示
    term: '',
    tabs: [],          // 星期页签,来自当前课表(星期一 → 周一)
    selected: 0,
    isRest: false,
    rows: [],
    blocked: false, // 本家庭未开通「课表」:整页不呈现内容
  },

  onShow() {
    /* 家长登录门 + 功能权限:未开通整页不呈现,登录/权限就绪后才初始化。
       课表来自网页端维护的在线课表:先按本机缓存 / 默认课表渲染,再拉服务端,有更新就重绘 */
    auth.ensurePerm('kebiao', allowed => {
      if (!allowed) { this.setData({ blocked: true }); return; }
      this.setData({ blocked: false });
      this.render(kb.current(), false);
      kb.refresh(() => this.render(kb.current(), true));
    });
  },

  onPullDownRefresh() {
    kb.refresh(() => {
      if (!this.data.blocked) this.render(kb.current(), true);
      wx.stopPullDownRefresh();
    });
  },

  selectDay(e) {
    const selected = Number(e.currentTarget.dataset.index);
    if (selected === this.data.selected) return;
    this.setData({ selected });
    this.renderRows(selected, kb.current());
  },

  /* 整页按课表文档渲染。keep = true 尽量保持已选中的星期(刷新重绘时用);
     false 回到今天(每次进页面时用) */
  render(doc, keep) {
    const todayIdx = kb.todayIdxOf(new Date());
    const prev = this.data.selected;
    const selected = keep && prev < doc.days.length ? prev : (todayIdx >= 0 ? todayIdx : 0);
    this.setData({
      subLine: [doc.school, doc.cls].filter(Boolean).join(' · '),
      term: doc.term,
      tabs: doc.days.map(d => d.replace('星期', '周')),
      isRest: todayIdx < 0,
      selected: selected,
    });
    this.renderRows(selected, doc);
  },

  renderRows(dayIdx, doc) {
    const now = new Date();
    const nowPeriod = kb.periodAtNow(now);
    const todayIdx = kb.todayIdxOf(now);
    const rows = doc.periods.map((p, i) => {
      const cell = doc.grid[i][dayIdx];
      const meta = kb.metaOf(cell[0]);
      return {
        idx: i,                   // 列表 key:节次名称可能重复,不能当 key
        label: p.label || ('第' + (i + 1) + '节'),
        time: p.time,
        empty: !cell[0],          // 空堂
        subject: cell[0],
        icon: meta.icon,
        color: meta.main,
        teacher: cell[1],
        note: cell[2],
        isNow: dayIdx === todayIdx && i === nowPeriod,
      };
    });
    this.setData({ rows: rows });
  },
});
```

- [ ] **Step 4: 改课表页 WXML**

`pages/kebiao/kebiao.wxml` 里这两行:

```xml
    <view class="sub">{{school}} · {{cls}}</view>
    <view class="term">{{term}}</view>
```

替换为:

```xml
    <view class="sub" wx:if="{{subLine}}">{{subLine}}</view>
    <view class="term" wx:if="{{term}}">{{term}}</view>
```

列表的 `wx:key="label"` 改成序号:

```xml
        wx:key="idx"
```

色块那一段:

```xml
        <view class="chip" style="background:{{item.color}}">
          <text>{{item.icon}}{{item.subject}}</text>
          <text wx:if="{{item.isNow}}" class="now-badge">现在</text>
        </view>
```

替换为(空堂一行显示灰底「空」):

```xml
        <view class="chip chip-empty" wx:if="{{item.empty}}">空</view>
        <view class="chip" wx:else style="background:{{item.color}}">
          <text>{{item.icon}}{{item.subject}}</text>
          <text wx:if="{{item.isNow}}" class="now-badge">现在</text>
        </view>
```

- [ ] **Step 5: 改课表页样式与配置**

`pages/kebiao/kebiao.wxss` 里 `.now-badge {` 之前加空堂样式:

```css
.chip-empty {
  background: #f3f5f8;
  color: #9aa1b0;
  border: 2rpx dashed #d4d9e2;
}
```

`pages/kebiao/kebiao.json` 整个替换为:

```json
{
  "navigationBarTitleText": "课程表",
  "enablePullDownRefresh": true,
  "usingComponents": {}
}
```

- [ ] **Step 6: 改首页课程模块**

`pages/index/index.js` 的 `applyPerms` 里,把

```js
    this.renderCourse();
    const jobs = [];
    if (flags.tdAllowed) jobs.push(d => this.loadTodos(d));
```

改成(开通课表时多排一个拉取任务):

```js
    this.renderCourse();
    const jobs = [];
    if (flags.courseAllowed) jobs.push(d => this.loadCourse(d));
    if (flags.tdAllowed) jobs.push(d => this.loadTodos(d));
```

`renderCourse()` 方法之后加一个方法:

```js
  /* 课程模块取数:拉一次在线课表,有更新就重画(缓存 / 默认课表已由 renderCourse 同步画出) */
  loadCourse(done) {
    kb.refresh(() => { this.renderCourse(); if (done) done(); });
  },
```

- [ ] **Step 7: 跑页面测试确认通过**

Run: `node tests/kebiao-pages.test.js`
Expected: 6 个 ✓,末行 `全部通过:6 个用例`。

- [ ] **Step 8: 全量回归**

Run: `for f in tests/*.test.js; do node "$f" >/dev/null 2>&1 || echo "FAIL: $f"; done`
Expected: 没有任何 `FAIL:` 输出(21 个测试文件)。

- [ ] **Step 9: 更新 README 与设计文档状态**

`README.md` 目录结构里这一行:

```
│   ├── kebiao.js           # 课表静态数据 + 工具（与 mora 网页端 lib/kebiao-data.js 同步维护）
```

改成:

```
│   ├── kebiao.js           # 课表（网页端维护的在线课表，单接口取用 + 本机缓存 + 内置默认课表兜底；小程序只读）
```

「注意事项」最后一条(成语卡片那条)之后追加一条:

```markdown
- 课表（首页「今日课程」卡 + 分类页「课程表」）读的是 mora 网页端「课表维护」（`kebiao-edit.html`，每个家庭维护自家的一张课表，写入按 `kebiao` 功能权限收口）：一个接口 `GET /api/kebiao` 取整份课表文档（与网页端 `server/README.md`「九」同协议），本机缓存 `mora-kebiao-doc` 为第一读取点，离线可看已拉过的课表；`data:null` = 这个家庭还没保存过，用内置默认课表（`utils/kebiao.js` 里的静态副本，与网页端默认课表一致）。课表页按在线课表渲染（星期页签、学校 / 班级 / 学期、每节课程；空堂显示「空」；下拉刷新），首页课程卡跳过空堂，显示当前节或下一节有课的课。小程序端**只读、不做维护**；客户端只做渲染保护，不复刻服务端校验。
```

`docs/superpowers/specs/2026-11-24-kebiao-editable-design.md` 的状态行 `状态:已评审,待实现` 改成 `状态:已实现`。

- [ ] **Step 10: Commit**

```bash
git add pages/kebiao pages/index/index.js tests/kebiao-pages.test.js README.md docs/superpowers/specs/2026-11-24-kebiao-editable-design.md
git commit -m "课表页与首页课程卡改为按在线课表渲染:课表页 onLoad 改 onShow(缓存/默认先渲染 → 拉服务端有更新重绘,保持选中的星期),页签/学校班级/学期/节次都来自在线课表,空堂显示灰底「空」,列表 key 改序号,新增下拉刷新;首页 applyPerms 开通课表时多排一个 kb.refresh 任务,课程卡随在线课表更新;分类页入口与 kebiao 权限不变,不加维护入口;新增 kebiao-pages 接线测试 6 用例;README 与设计文档状态同步"
```

## 自审记录(writing-plans Self-Review)

- **设计覆盖**(对照本仓库 spec):接口与数据(缓存优先 / 默认兜底 / 渲染保护 / `refresh` 规则 / 401·403)→ Task 1;工具函数读当前课表、`homeLesson` 跳过空堂 → Task 1;课表页 `onShow` / 下拉刷新 / `wx:key` / 空堂 / 空段不显示 → Task 2;首页课程卡 → Task 2;入口与权限不变 → Task 2 契约测试;测试清单 → 两个任务;README → Task 2;上线顺序 → 写在两份文档里。
- **占位符**:无。
- **命名一致性**:`current` / `refresh` / `normalizeDoc` / `metaOf` / `todayIdxOf` / `periodAtNow` / `currentOrNextLesson` / `homeLesson` 在 Task 1 定义,Task 2 页面按同名调用(`kb.current()`、`kb.refresh(done)`);页面 `data` 字段 `subLine` / `term` / `tabs` / `selected` / `isRest` / `rows` / `blocked` 与 WXML、测试一致;`rows[i].idx` 对应 `wx:key="idx"`;`pages/index` 新方法名 `loadCourse` 在 Step 6 定义并接入 `applyPerms`。
