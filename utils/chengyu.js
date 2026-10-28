/* 成语卡片(小程序端只读,不录入):内容来自 mora 网页端「成语录入」
   chengyu-edit.html——仅管理员批量粘贴维护,小程序端只负责取来给孩子看。
   接口(与 server/README.md「八」同协议):
     GET /api/chengyu?token=… → {ok, data:[{w,p,m,d}]|null, updatedAt}
   整库一个接口(不需要知识点那种两步拉取);登录即可读,按家庭隔离。
   本机缓存 mora-chengyu-v1 为第一读取点(离线可看已拉过的内容),拉取成功再以
   服务端为真源覆盖(data:null 视为空库),updatedAt 变了才通知订阅者。
   客户端只做截断保护,不复刻服务端校验(规则以后再变也不悄悄吃内容)。
   展示:列表(可搜索)+ 详情(拼音/意思/典故),禅模式本期不做。 */
const auth = require('./auth');

const API_BASE = 'https://www.tcued.com';
const CACHE_KEY = 'mora-chengyu-v1';

/* 数量/长度上限:与服务端 valid_chengyu 同口径(只用于截断保护) */
const W_MAX = 16;
const P_MAX = 80;
const M_MAX = 500;
const D_MAX = 800;
const LIB_MAX = 2000;

function clean(s, max) {
  return typeof s === 'string' ? s.trim().slice(0, max) : '';
}

/* 一条成语:四字段短键。只截断不清洗内容(服务端已按汉字/长度收口);
   没有成语或没有意思的条目无法展示,丢弃。 */
function normalizeEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const w = clean(e.w, W_MAX);
  const m = clean(e.m, M_MAX);
  if (!w || !m) return null;
  return { w: w, p: clean(e.p, P_MAX), m: m, d: clean(e.d, D_MAX) };
}

function normalizeList(list) {
  return (Array.isArray(list) ? list : [])
    .map(normalizeEntry).filter(Boolean).slice(0, LIB_MAX);
}

/* ── 本机缓存 {updatedAt, data}:脏缓存当没有 ── */
function loadCache() {
  try {
    const c = wx.getStorageSync(CACHE_KEY);
    if (c && typeof c === 'object' && Array.isArray(c.data)) {
      return {
        updatedAt: Number.isInteger(c.updatedAt) ? c.updatedAt : 0,
        data: normalizeList(c.data),
      };
    }
  } catch (e) { /* 存储不可用 */ }
  return { updatedAt: 0, data: [] };
}

let cur = loadCache();
const subs = [];

function saveCache() {
  try { wx.setStorageSync(CACHE_KEY, cur); }
  catch (e) { /* 存储失败本次内存生效 */ }
}
function notify() {
  subs.forEach(fn => { try { fn(cur.data); } catch (e) { /* 单个订阅者出错不影响其它 */ } });
}

function current() { return cur.data; }
function subscribe(fn) { if (typeof fn === 'function') subs.push(fn); }

/* ── 拉远端:成功 done(changed, err);err 为 'auth'/'bad'/'net'(失败时) ── */
function refresh(done) {
  const token = auth.getToken();
  if (!token) { if (done) done(false, 'auth'); return; }
  wx.request({
    url: API_BASE + '/api/chengyu?token=' + encodeURIComponent(token),
    method: 'GET',
    success(res) {
      if (res.statusCode === 401 || res.statusCode === 403) {
        auth.on401();
        if (done) done(false, 'auth');
        return;
      }
      const j = res.data;
      if (res.statusCode !== 200 || !j || !j.ok) { if (done) done(false, 'bad'); return; }
      const empty = j.data === null;
      if (!empty && !Array.isArray(j.data)) { if (done) done(false, 'bad'); return; }
      const list = empty ? [] : normalizeList(j.data);
      const ua = empty ? 0 : (Number(j.updatedAt) || 0);
      const same = JSON.stringify(list) === JSON.stringify(cur.data);
      /* 服务端为真源:时间戳更新、相等但内容不同、或服务端已清空(data:null)都替换 */
      if (ua > cur.updatedAt || (ua === cur.updatedAt && !same) ||
          (empty && cur.data.length)) {
        cur = { updatedAt: ua, data: list };
        saveCache();
        notify();
        if (done) done(true, null);
        return;
      }
      if (done) done(false, null);
    },
    fail() { if (done) done(false, 'net'); },
  });
}

/* 页面接入:先同步回调缓存立即渲染,再后台拉远端,有更新再回调 */
function load(cb) {
  if (typeof cb === 'function') {
    subs.push(cb);
    cb(cur.data);
  }
  refresh();
}

/* ── 搜索/定位:按 w/p/m/d 子串,不分大小写(与网页端 CHENGYU.matches 同口径) ── */
function matches(entry, keyword) {
  const f = String(keyword == null ? '' : keyword).trim().toLowerCase();
  if (!f) return true;
  return [entry && entry.w, entry && entry.p, entry && entry.m, entry && entry.d]
    .some(x => String(x || '').toLowerCase().indexOf(f) >= 0);
}

function search(list, keyword) {
  return (Array.isArray(list) ? list : []).filter(e => matches(e, keyword));
}

function find(list, w) {
  const key = String(w == null ? '' : w).trim();
  if (!key) return null;
  return (Array.isArray(list) ? list : []).filter(e => e.w === key)[0] || null;
}

/* ── 逐字注音:每个汉字上方放对应拼音(与古诗卡片同款)。
   p 以空格分音节、与汉字一一对应;音节多/少时按位取,缺的留空,不串位。 ── */
function tokensOf(entry) {
  const chars = Array.from(String((entry && entry.w) || ''));
  const pys = String((entry && entry.p) || '').trim().split(/\s+/).filter(Boolean);
  return chars.map((ch, i) => ({ i: i, ch: ch, py: pys[i] || '' }));
}

/* 拼音排序:去声调、空格与隔音符号后按字母序;没拼音的排最后(按汉字兜底) */
const TONE_MAP = {
  'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
  'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
  'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
  'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
  'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
  'ǖ': 'u', 'ǘ': 'u', 'ǚ': 'u', 'ǜ': 'u', 'ü': 'u',
  'ń': 'n', 'ň': 'n', 'ǹ': 'n', 'ḿ': 'm',
};
function pinyinKey(entry) {
  const p = String((entry && entry.p) || '').trim();
  if (!p) return '\uffff' + String((entry && entry.w) || '');
  return p.toLowerCase()
    .replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüńňǹḿ]/g, ch => TONE_MAP[ch] || ch)
    .replace(/[^a-z]/g, '');   // 去空格/撇号/连字符/数字
}
function sortByPinyin(list) {
  return (Array.isArray(list) ? list : []).slice().sort((a, b) => {
    const ka = pinyinKey(a), kb = pinyinKey(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    const wa = String((a && a.w) || ''), wb = String((b && b.w) || '');
    return wa < wb ? -1 : wa > wb ? 1 : 0;
  });
}

module.exports = {
  API_BASE, CACHE_KEY, W_MAX, P_MAX, M_MAX, D_MAX, LIB_MAX,
  normalizeEntry, normalizeList, loadCache,
  load, subscribe, current, refresh, matches, search, find,
  tokensOf, pinyinKey, sortByPinyin,
};
