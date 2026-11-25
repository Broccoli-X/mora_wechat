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
const KEBIAO = {
  school: '苏州市吴中区尹山湖实验小学',
  cls: '一（7）班',
  term: '2026至2027学年度第一学期',
  days: ['星期一', '星期二', '星期三', '星期四', '星期五'],
  periods: [
    { label: '第1节', half: '上午', time: '8:35~9:15' },
    { label: '第2节', half: '上午', time: '9:45~10:25' },
    { label: '第3节', half: '上午', time: '10:40~11:20' },
    { label: '第4节', half: '下午', time: '13:00~13:40' },
    { label: '第5节', half: '下午', time: '13:55~14:35' },
    { label: '第6节', half: '下午', time: '15:05~15:45' },
    { label: '延时', half: '下午', time: '15:55~16:55' },
  ],
  grid: [
    [['英语', '李微兰', ''], ['语文', '顾晓芳', ''], ['语文', '顾晓芳', ''], ['数学', '罗晓宇', ''], ['语文', '顾晓芳', '']],
    [['语文', '顾晓芳', ''], ['数学', '罗晓宇', ''], ['数学', '罗晓宇', ''], ['英语', '李微兰', ''], ['音乐', '顾晓芳', '']],
    [['语文', '顾晓芳', ''], ['科学', '李微兰', ''], ['体育与健康', '王雪芳', ''], ['语文', '顾晓芳', ''], ['数学', '罗晓宇', '']],
    [['音乐', '张钰杰', ''], ['美术', '黄小兰', ''], ['道德与法治', '顾晓芳', ''], ['体育与健康', '王雪芳', ''], ['体育1', '罗晓宇', '']],
    [['体育1', '罗晓宇', ''], ['道德与法治', '顾晓芳', ''], ['劳动', '顾晓芳', ''], ['美术', '黄小兰', ''], ['书法', '顾晓芳', '']],
    [['综合', '李微兰', ''], ['延时1', '', '体活'], ['延时1', '', ''], ['延时1', '', ''], ['延时1', '', '']],
    [['延时', '', ''], ['延时2', '', ''], ['延时2', '', ''], ['延时2', '', ''], ['延时2', '', '']],
  ],
};

/* 科目 → 图标 + 配色(main 深色用于色块,与网页端一致) */
const KEBIAO_META = {
  '语文': { icon: '📖', main: '#c9392b', soft: '#fdecea' },
  '数学': { icon: '🔢', main: '#1d5fbf', soft: '#e7f0fb' },
  '英语': { icon: '🔤', main: '#177a3e', soft: '#e7f6ec' },
  '音乐': { icon: '🎵', main: '#7b2d8b', soft: '#f5eaf8' },
  '美术': { icon: '🎨', main: '#c2185b', soft: '#fce7f1' },
  '体育1': { icon: '⚽', main: '#c05621', soft: '#fdf0e5' },
  '体育与健康': { icon: '⚽', main: '#c05621', soft: '#fdf0e5' },
  '科学': { icon: '🔬', main: '#0c7d84', soft: '#e4f4f5' },
  '综合': { icon: '🧩', main: '#4353b8', soft: '#eaedf9' },
  '道德与法治': { icon: '🌍', main: '#8a5a2b', soft: '#f7efe3' },
  '劳动': { icon: '🧺', main: '#5c7f29', soft: '#f0f5e3' },
  '书法': { icon: '🖌️', main: '#3f4756', soft: '#ededf2' },
  '延时1': { icon: '🌙', main: '#5f6b7d', soft: '#eef1f4' },
  '延时2': { icon: '🌙', main: '#5f6b7d', soft: '#eef1f4' },
  '延时': { icon: '🌙', main: '#5f6b7d', soft: '#eef1f4' },
};

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
