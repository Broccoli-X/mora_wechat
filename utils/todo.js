/* 今日代办只读同步:数据源与网页端相同的服务(/api/progress,module=todo)。
   条目在网页端家长页(todo-edit.html)维护,小程序端首页只看当天清单,无完成状态。
   payload 为短键 JSON:{t:内容, m:时间, r:重复, d:日期(仅单次), w:每周几(0=周日)};
   空 payload 是删除墓碑,直接跳过。校验与「某天有哪些代办」的挑选口径
   和网页端 lib/todo-core.js 一致:每天恒真/单次比日期/每周几看星期几勾选。 */
const API_BASE = 'https://www.tcued.com';
const TOKEN = '2ed49dbd4eddd9acdda3ae224bd2c23c';

/* 重复类型与配色(与网页端一致:main 深色做色块白字) */
const REPEATS = [
  { key: 'daily', label: '每天', icon: '📆', main: '#2b8a3e' },
  { key: 'once', label: '单次', icon: '📍', main: '#e8590c' },
  { key: 'weekly', label: '每周几', icon: '🗓️', main: '#1d5fbf' },
];
const REPEAT_KEYS = REPEATS.map(r => r.key);
const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'];
const TEXT_MAX = 60;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function repeatOf(key) {
  return REPEATS.filter(r => r.key === key)[0] || null;
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function toDateStr(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function todayStr() { return toDateStr(new Date()); }

/* YYYY-MM-DD → 本地 Date(不走 Date(s) 解析,避免按 UTC 解释的时区偏移) */
function parseDate(s) {
  if (!DATE_RE.test(s || '')) return null;
  const p = s.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  return (d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2]) ? d : null;
}

/* 每周几:只收 0~6 整数,去重升序 */
function cleanWeekdays(ws) {
  if (!Array.isArray(ws)) return [];
  const seen = {};
  for (const w of ws) {
    const n = Number(w);
    if (Number.isInteger(n) && n >= 0 && n <= 6) seen[n] = true;
  }
  return Object.keys(seen).map(Number).sort((a, b) => a - b);
}

/* 校验清洗一条代办:内容/时间必填;单次必须合法日期,每周几至少勾一天。坏数据返回 null */
function normalize(e) {
  if (!e || REPEAT_KEYS.indexOf(e.repeat) < 0) return null;
  const text = typeof e.text === 'string' ? e.text.trim().slice(0, TEXT_MAX) : '';
  if (!text) return null;
  if (!TIME_RE.test(e.time || '')) return null;
  let date = '', weekdays = [];
  if (e.repeat === 'once') {
    if (!parseDate(e.date)) return null;
    date = e.date;
  } else if (e.repeat === 'weekly') {
    weekdays = cleanWeekdays(e.weekdays);
    if (!weekdays.length) return null;
  }
  return {
    id: String(e.id || ''),
    text: text,
    time: e.time,
    repeat: e.repeat,
    date: date,
    weekdays: weekdays,
    updatedAt: Number.isInteger(e.updatedAt) ? e.updatedAt : 0,
  };
}

/* 服务端进度条目 → 代办数组:只认 module=todo,跳过墓碑(空 payload)和坏 payload */
function decodeItems(items) {
  const entries = [];
  for (const it of items || []) {
    if (!it || it.module !== 'todo') continue;
    if (typeof it.payload !== 'string' || !it.payload) continue;
    try {
      const o = JSON.parse(it.payload);
      const e = normalize({
        id: it.itemKey,
        text: o.t,
        time: o.m,
        repeat: o.r,
        date: o.d,
        weekdays: o.w,
        updatedAt: it.updatedAt || 0,
      });
      if (e) entries.push(e);
    } catch (err) { /* 坏 payload 丢弃 */ }
  }
  return entries;
}

/* 某条代办是否落在某天:每天恒真;单次看日期;每周几看星期几勾选 */
function occursOn(e, dateStr) {
  if (!e) return false;
  if (e.repeat === 'daily') return true;
  if (e.repeat === 'once') return e.date === dateStr;
  if (e.repeat === 'weekly') {
    const d = parseDate(dateStr);
    return !!d && e.weekdays.indexOf(d.getDay()) >= 0;
  }
  return false;
}

/* 某天的代办,按时间先后(同时刻按录入先后) */
function todosOn(entries, dateStr) {
  return (entries || []).filter(e => occursOn(e, dateStr))
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.updatedAt - b.updatedAt));
}

/* 拉取全部进度,客户端过滤出代办(module=todo):成功 done(entries),失败 fail(err) */
function fetchTodos(done, fail) {
  wx.request({
    url: API_BASE + '/api/progress?token=' + encodeURIComponent(TOKEN),
    method: 'GET',
    success(res) {
      const data = res.data;
      const items = data && data.ok && Array.isArray(data.items) ? data.items : [];
      done(decodeItems(items));
    },
    fail(err) { fail(err); },
  });
}

module.exports = {
  REPEATS, WEEKDAY_CN,
  repeatOf, todayStr, toDateStr, parseDate,
  normalize, decodeItems, occursOn, todosOn,
  fetchTodos,
};
