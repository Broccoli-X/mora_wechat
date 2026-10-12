/* 今日代办同步:数据源与网页端相同的服务(/api/progress,module=todo)。
   小程序端维护页可添加/修改/删除(单条上报与网页端 todo-edit.html 同协议),
   首页只看当天清单,无完成状态。
   payload 为短键 JSON:{t:内容, m:时间, r:重复, d:日期(仅单次),
   e:结束日期(仅单次选填,严格晚于 d 才保留,范围内每天算),
   w:每周几(0=周日), g:[图片引用](可选)};
   空 payload 是删除墓碑。校验与「某天有哪些代办」的挑选口径
   和网页端 lib/todo-core.js 一致:每天恒真/单次比日期区间/每周几看星期几勾选。
   配图与网页端 todo-core 同协议(同作业模块):payload 只存服务端图片 id
   (/api/image 存取,dataURL 不同步),图片本体走 GET /api/image?id=<id>
   (不带 token,直连展示/预览),上传走 POST /api/image(dataURL ≤ 80 万字符)。
   条目小,封顶 IMGS_MAX 张也远不触服务端 500 字符 payload 上限;
   服务端对 todo 与 homework 一样做孤儿图片级联清理,上报必须带全 g。
   鉴权走 utils/auth.js 家长登录会话(与网页端 lib/auth.js 同协议)。 */
const API_BASE = 'https://www.tcued.com';
const auth = require('./auth');

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
/* 图片引用规则与 mora 网页端 lib/todo-core.js 同源:仅收服务端 id(dataURL 不同步;
   网页端有本机 dataURL 离线兜底,小程序端无本地存储不上这类条目) */
const IMG_ID_RE = /^img[0-9a-z]{4,30}$/;
const IMGS_MAX = 3;

function repeatOf(key) {
  return REPEATS.filter(r => r.key === key)[0] || null;
}

/* 图片引用 → 可加载地址:GET /api/image 不需要 token(<image>/wx.previewImage 直连) */
function imgUrl(ref) {
  return API_BASE + '/api/image?id=' + encodeURIComponent(ref);
}

/* payload 图片字段 p → 合法引用数组:非数组/坏 id 丢弃,最多 IMGS_MAX 张 */
function imgsOf(p) {
  if (!Array.isArray(p)) return [];
  return p.filter(x => typeof x === 'string' && IMG_ID_RE.test(x)).slice(0, IMGS_MAX);
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

/* 校验清洗一条代办:内容/时间必填;单次必须合法日期(结束日期仅当合法且严格
   晚于开始才保留,等于/早于/非法一律退回单日,与网页端同口径的静默清洗),
   每周几至少勾一天。坏数据返回 null */
function normalize(e) {
  if (!e || REPEAT_KEYS.indexOf(e.repeat) < 0) return null;
  const text = typeof e.text === 'string' ? e.text.trim().slice(0, TEXT_MAX) : '';
  if (!text) return null;
  if (!TIME_RE.test(e.time || '')) return null;
  let date = '', dateEnd = '', weekdays = [];
  if (e.repeat === 'once') {
    if (!parseDate(e.date)) return null;
    date = e.date;
    if (parseDate(e.dateEnd) && e.dateEnd > e.date) dateEnd = e.dateEnd;
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
    dateEnd: dateEnd,
    weekdays: weekdays,
    imgs: imgsOf(e.imgs),
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
        dateEnd: o.e,
        weekdays: o.w,
        imgs: o.g,
        updatedAt: it.updatedAt || 0,
      });
      if (e) entries.push(e);
    } catch (err) { /* 坏 payload 丢弃 */ }
  }
  return entries;
}

/* 某条代办是否落在某天:每天恒真;单次看日期区间(YYYY-MM-DD 字典序即时间序,
   含首尾两天,与网页端同口径);每周几看星期几勾选 */
function occursOn(e, dateStr) {
  if (!e) return false;
  if (e.repeat === 'daily') return true;
  if (e.repeat === 'once') {
    if (!parseDate(dateStr)) return false;
    if (e.dateEnd) return dateStr >= e.date && dateStr <= e.dateEnd;
    return e.date === dateStr;
  }
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

/* ── 写入层:添加/修改单条上报 + 删除墓碑(与网页端 todo-edit.html 同协议) ── */

function newId() {
  return 'td' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function fmtCN(dateStr) {
  const d = parseDate(dateStr);
  return d ? (d.getMonth() + 1) + '月' + d.getDate() + '日' : '';
}

/* 重复说明文案(与网页端 describe 同源):每天 / 单次·9月5日 或 单次·10月1日~10月7日 / 每周一、三、五 */
function describe(e) {
  const r = repeatOf(e.repeat);
  if (!r) return e.repeat || '';
  if (e.repeat === 'once') {
    return r.label + '·' + fmtCN(e.date) + (e.dateEnd ? '~' + fmtCN(e.dateEnd) : '');
  }
  if (e.repeat === 'weekly') return '每周' + e.weekdays.map(w => WEEKDAY_CN[w]).join('、');
  return r.label;
}

/* 维护页列表顺序:最近编辑的在前 */
function sortByNew(entries) {
  return (entries || []).slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

/* 条目 → 同步载荷短键 JSON(与网页端 lib/todo-core.js encodeEntry 同源):
   单次才有 d,结束日期才有 e,每周几才有 w,有图才有 g(与老版本 payload 字节级一致) */
function encodeEntry(e) {
  const o = { t: e.text, m: e.time, r: e.repeat };
  if (e.repeat === 'once') {
    o.d = e.date;
    if (e.dateEnd) o.e = e.dateEnd;
  }
  if (e.repeat === 'weekly') o.w = e.weekdays;
  const ids = imgsOf(e.imgs);
  if (ids.length) o.g = ids;
  return JSON.stringify(o);
}

/* 单条上报公共通道:服务端同键新时间戳(含相等)者胜;401 交 auth.on401 弹登录门,
   失败回调 onFail 由页面提示。payload 传空串即删除墓碑,其他设备拉到后同样删除 */
function pushItem(itemKey, payload, updatedAt, onFail) {
  const token = auth.getToken();
  if (!token) return false;
  wx.request({
    url: API_BASE + '/api/progress',
    method: 'POST',
    header: { 'Content-Type': 'application/json' },
    data: {
      token: token,
      items: [{
        module: 'todo',
        itemKey: itemKey,
        mastered: 0,
        updatedAt: updatedAt,
        device: auth.deviceTag(),
        payload: payload,
      }],
    },
    success(res) {
      if (res.statusCode === 401) auth.on401();
    },
    fail() { if (onFail) onFail(); },
  });
  return true;
}

function pushEntry(entry, onFail) {
  return pushItem(entry.id, encodeEntry(entry), entry.updatedAt, onFail);
}

function pushTombstone(id, onFail) {
  return pushItem(id, '', Date.now(), onFail);
}

/* 配图上传:POST /api/image 换服务端 id(id 即内容,可永久缓存,与作业模块同协议);
   dataUrl 为 data:image/…;base64 格式(≤ 80 万字符)。401 交 auth.on401 */
function uploadImage(dataUrl, onOk, onFail) {
  const token = auth.getToken();
  if (!token) { if (onFail) onFail(); return; }
  const id = 'img' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  wx.request({
    url: API_BASE + '/api/image',
    method: 'POST',
    header: { 'Content-Type': 'application/json' },
    data: { token: token, id: id, data: dataUrl },
    success(res) {
      if (res.statusCode === 401) { auth.on401(); return; }
      if (res.statusCode === 200 && res.data && res.data.ok) { onOk(id); return; }
      if (onFail) onFail();
    },
    fail() { if (onFail) onFail(); },
  });
}

/* 拉取全部进度,客户端过滤出代办(module=todo):成功 done(entries),失败 fail(err);
   401(会话过期/被注销)交 auth.on401 弹回登录门 */
function fetchTodos(done, fail) {
  wx.request({
    url: API_BASE + '/api/progress?token=' + encodeURIComponent(auth.getToken()),
    method: 'GET',
    success(res) {
      if (res.statusCode === 401) { auth.on401(); return; }
      const data = res.data;
      const items = data && data.ok && Array.isArray(data.items) ? data.items : [];
      done(decodeItems(items));
    },
    fail(err) { fail(err); },
  });
}

module.exports = {
  REPEATS, WEEKDAY_CN, IMGS_MAX,
  repeatOf, todayStr, toDateStr, parseDate, fmtCN,
  normalize, decodeItems, occursOn, todosOn, imgUrl, imgsOf,
  describe, sortByNew, newId, encodeEntry, pushEntry, pushTombstone,
  uploadImage, fetchTodos,
};
