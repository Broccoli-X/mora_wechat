/* 识记学习(小程序端只读,不录入):内容来自 mora 网页端「识记练习录入」
   recognition-edit.html——家长按次(批次)把要给孩子练的内容录进来、按学科分类,
   小程序端只负责取来给孩子认读。两步接口取用(与网页端 server/README.md「六」同协议):
     ① GET /api/recognition/batches[?subject=]  批次列表(**只有概要,没有条目**)
     ② GET /api/recognition/batch?id=rb…        按批次取整批(含 items)
   条目形状:识汉字 face 单字 + answer 拼音;认单词 face 是单词**或整句**(大小写照原样,
   如 "Good morning, Miss Li.")+ answer 中文;识图 face(emoji)/img + answer 名称。
   客户端只做渲染保护、不重复服务端的字面校验(见 normalizeItem 注释)。
   网页端口径「本站不出题、不记成绩」,服务端进度同步的 MODULES 白名单也不含
   recognition(/api/progress 不收该 module),故本模块不带 ⭐ 掌握标记与进度上报,
   禅模式只显示当前序号。本地缓存为第一读取点(离线可看已拉过的批次),拉取成功
   再以服务端为真源覆盖。
   识图图片本体:GET /api/image?id=<img>(不带 token,直接当图片地址用)。
   权限:功能键 recognition(与网页端 FEATURES 同名),未开通整页不呈现。 */
const auth = require('./auth');

const API_BASE = 'https://www.tcued.com';
const IMG_API = API_BASE + '/api/image?id=';
const LIST_KEY = 'mora-recognition-batches-v1';   // 批次列表缓存
const ITEM_KEY = 'mora-recognition-batch-v2';     // 按 id 的整批内容缓存(秒开禅模式/离线兜底)
/* v1 是「认单词按小写单词校验」那版写的缓存:face 被转成了小写、含空格的条目那时已丢,
   命中它会先渲染出一版不是家长原样的卡面(小写/缺条)。读到即作废并清掉,一律回服务端取 */
const LEGACY_ITEM_KEY = 'mora-recognition-batch-v1';
const CACHE_MAX = 60;                             // 缓存的批次数上限,超出按 updatedAt 淘汰最旧

/* 三科学科:与网页端 lib/recognition-core.js KINDS 同口径(id/名称/学科/图标/主色一致,
   两端变更需同步维护) */
const KINDS = [
  { id: 'hanzi', name: '识汉字', subject: '语文', icon: '📖', main: '#c9392b' },
  { id: 'words', name: '认单词', subject: '英语', icon: '🔤', main: '#177a3e' },
  { id: 'image', name: '识图',   subject: '其他', icon: '🖼️', main: '#8a5a2b' },
];
const KIND_IDS = KINDS.map(k => k.id);
const META = {};
KINDS.forEach(k => { META[k.id] = k; });

function kindOf(id) {
  return META[id] || { id: id, name: id || '未分类', subject: '', icon: '📌', main: '#5f6b7d' };
}

/* ── 日期:YYYY-MM-DD 一律按本地解释(不走 Date(s),避免按 UTC 解析的时区偏移) ── */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

function parseDate(s) {
  if (!DATE_RE.test(s || '')) return null;
  const p = String(s).split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  return (d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2]) ? d : null;
}

/* 2026-09-11 → 9月11日(取不到返回空串,卡片不显示半个日期) */
function fmtCN(s) {
  const d = parseDate(s);
  return d ? (d.getMonth() + 1) + '月' + d.getDate() + '日' : '';
}

function weekdayCN(s) {
  const d = parseDate(s);
  return d ? WEEKDAY_CN[d.getDay()] : '';
}

/* ── 条目清洗:只判「能不能渲染」与长度保护,不复刻服务端的字面校验 ──
   内容以服务端为真源(写入时已按网页端规则校验过),客户端再判一次曾闯祸:
   网页端「认单词支持整句、保留大写」(2026-09-11)后,小程序仍按旧的小写单词规则
   静默丢掉含空格的课本人名(Yang Ling / Liu Tao …),11 条只显示 6 条。
   故这里只挡「没东西可认」的条目,并把过长文本截到显示上限;规则以后再变也不会悄悄吃内容。 */
const TITLE_MAX = 30;
const NOTE_MAX = 60;
const ANSWER_MAX = 30;     // 拼音/中文/名称(句子释义长一点也放得下,与网页端同款)
const EXTRA_MAX = 40;      // 组词 / 音标 / 英文
const ITEMS_MAX = 60;      // 一个批次最多多少条
const FACE_MAX = 60;       // 认单词:单词或整句(与网页端 FACE_MAX 同款)
const EMOJI_MAX = 8;       // 识汉字单字 / 识图 emoji 的显示长度
const IMG_ID_RE = /^img[0-9a-z]{4,30}$/;
const BATCH_ID_RE = /^rb[0-9a-z]{4,30}$/;   // 与服务端 BATCH_ID 同款

function clean(s, max) {
  return typeof s === 'string' ? s.trim().slice(0, max) : '';
}

function normalizeItem(subject, it) {
  if (!it || typeof it !== 'object') return null;
  const answer = clean(it.answer, ANSWER_MAX);
  const extra = clean(it.extra, EXTRA_MAX);
  const img = typeof it.img === 'string' && IMG_ID_RE.test(it.img) ? it.img : '';
  if (subject === 'words') {
    const face = clean(it.face, FACE_MAX);      // 单词或整句,大小写照原样
    if (!face) return null;                     // 没字可认
    return { face: face, answer: answer, extra: extra };
  }
  const face = clean(it.face, EMOJI_MAX);
  if (subject === 'image') {
    if (!face && !img) return null;             // 没图也没 emoji,没东西可认
    const o = { face: face, answer: answer, extra: extra };
    if (img) o.img = img;
    return o;
  }
  if (subject === 'hanzi') {
    if (!face) return null;
    return { face: face, answer: answer, extra: extra };
  }
  return null;                                  // 未知学科:不猜怎么渲染
}

/* 列表概要清洗:学科合法 + 名称非空 + 日期合法才收;count 只认非负整数(接口给的是条目数) */
function normalizeBrief(b) {
  if (!b || typeof b !== 'object' || KIND_IDS.indexOf(b.subject) < 0) return null;
  const title = clean(b.title, TITLE_MAX);
  if (!title || !parseDate(b.day)) return null;
  const n = Number.isInteger(b.count) && b.count > 0 ? Math.min(b.count, ITEMS_MAX) : 0;
  return {
    id: String(b.id || ''),
    subject: b.subject,
    title: title,
    day: b.day,
    note: clean(b.note, NOTE_MAX),
    count: n,
    updatedAt: Number.isInteger(b.updatedAt) ? b.updatedAt : 0,
  };
}

/* 整批清洗:概要 + items(逐条清洗、1~60 条,一条都不剩视为坏批次返回 null) */
function normalizeBatch(b) {
  const brief = normalizeBrief(b);
  if (!brief || !BATCH_ID_RE.test(brief.id)) return null;
  const items = (Array.isArray(b.items) ? b.items : [])
    .map(it => normalizeItem(b.subject, it)).filter(Boolean).slice(0, ITEMS_MAX);
  if (!items.length) return null;
  return {
    id: brief.id, subject: brief.subject, title: brief.title, day: brief.day,
    note: brief.note, count: items.length, items: items, updatedAt: brief.updatedAt,
  };
}

/* 列表顺序:日期倒序,同日按录入时间倒序(与服务端 ORDER BY day DESC, updated_at DESC 一致) */
function sortBatches(list) {
  return (list || []).slice().sort((a, b) =>
    a.day < b.day ? 1 : a.day > b.day ? -1 : (b.updatedAt || 0) - (a.updatedAt || 0));
}

/* 概览(列表页顶部胶囊):批次数 / 条目总数 / 最近日期 */
function statsOf(list) {
  const arr = (list || []).filter(Boolean);
  return {
    batches: arr.length,
    items: arr.reduce((s, b) => s + (b.count || 0), 0),
    lastDay: arr.reduce((d, b) => (b.day > d ? b.day : d), ''),
  };
}

/* 学科分节(列表页):按 KINDS 固定顺序(识汉字→认单词→识图),空科不呈现;
   节内沿用 day 倒序。批次卡要显示的日期文案/学科名在这里补好,页面不拼字符串 */
function sections(list) {
  const all = sortBatches((list || []).filter(Boolean));
  return KINDS.map(k => ({
    key: k.id, name: k.name, subject: k.subject, icon: k.icon, main: k.main,
    batches: all.filter(b => b.subject === k.id).map(b => Object.assign({}, b, {
      kindName: k.name,
      dayCN: fmtCN(b.day) + (weekdayCN(b.day) ? ' ' + weekdayCN(b.day) : ''),
    })),
  })).filter(s => s.batches.length);
}

/* ── 卡面视图:批次网格与禅模式共用(三科同一套字段,页面一套 markup 渲染) ──
   face 主面(汉字/单词或整句/无图条目的 emoji)、answer/extra 副行、imgUrl 识图图片地址;
   labelA/labelB 是两行副行的标签(拼音·组词 / 中文·音标 / 名称·英文);
   fs 是认单词的字号档(单词或整句长度差很大:短词大字、长句缩小才排得下) */
function faceSize(subject, face) {
  if (subject !== 'words') return '';
  const n = (face || '').length;
  return n <= 10 ? 'lg' : n <= 24 ? 'md' : 'sm';
}

function itemView(subject, it, i) {
  const k = kindOf(subject);
  const img = (it && it.img) || '';
  const face = (it && it.face) || '';
  return {
    i: i == null ? 0 : i,
    kind: subject,
    color: k.main,
    face: face,
    fs: faceSize(subject, face),
    answer: (it && it.answer) || '',
    extra: (it && it.extra) || '',
    img: img,
    imgUrl: img ? IMG_API + encodeURIComponent(img) : '',
    labelA: subject === 'hanzi' ? '拼音' : subject === 'words' ? '中文' : '名称',
    labelB: subject === 'hanzi' ? '组词' : subject === 'words' ? '音标' : '英文',
  };
}

function itemViews(subject, items) {
  return (items || []).map((it, i) => itemView(subject, it, i));
}

/* 批次视图(详情页头部 + 禅模式):学科口径、日期文案、卡片数组一次给全 */
function batchView(b) {
  if (!b) return null;
  const k = kindOf(b.subject);
  return {
    id: b.id,
    title: b.title,
    note: b.note || '',
    kind: k.id, kindName: k.name, kindIcon: k.icon, main: k.main, subjectText: k.subject,
    day: b.day,
    dayCN: fmtCN(b.day) + (weekdayCN(b.day) ? ' ' + weekdayCN(b.day) : ''),
    count: (b.items || []).length,
    items: itemViews(b.subject, b.items),
  };
}

/* ── 本机缓存:列表 / 按 id 的整批内容(都过一遍清洗,脏缓存当没有) ── */
function loadBatches() {
  try {
    const a = wx.getStorageSync(LIST_KEY);
    return sortBatches((Array.isArray(a) ? a : []).map(normalizeBrief).filter(Boolean));
  } catch (e) {
    return [];
  }
}

function saveBatches(list) {
  try { wx.setStorageSync(LIST_KEY, sortBatches(list).slice(0, CACHE_MAX)); }
  catch (e) { /* 存储不可用:本次内存生效 */ }
}

function loadCache() {
  try { wx.removeStorageSync(LEGACY_ITEM_KEY); }   // 旧版缓存一律作废(键已不存在时是无操作)
  catch (e) { /* 存储不可用忽略 */ }
  try {
    const m = wx.getStorageSync(ITEM_KEY);
    return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
  } catch (e) {
    return {};
  }
}

function saveBatch(batch) {
  if (!batch || !BATCH_ID_RE.test(batch.id || '')) return;
  const m = loadCache();
  m[batch.id] = batch;
  const ids = Object.keys(m);
  if (ids.length > CACHE_MAX) {
    ids.sort((a, b) => (m[a].updatedAt || 0) - (m[b].updatedAt || 0));
    ids.slice(0, ids.length - CACHE_MAX).forEach(k => { delete m[k]; });
  }
  try { wx.setStorageSync(ITEM_KEY, m); }
  catch (e) { /* 同上 */ }
}

function loadBatch(id) {
  const m = loadCache();
  return (id && m[id]) ? normalizeBatch(m[id]) : null;
}

/* 禅模式取数交接:批次页点卡片时 setCurrent(免一次请求);深链/重启回落到本机缓存,
   都拿不到再由页面拉远端。id 不符(换了批次)时视为没有。
   交接还记下所属家庭:换家庭登录后本机缓存会被 purgeLocalFamilyData 清掉,
   内存里的交接若不带家庭判定会串上一家的内容(与本地缓存同一条隔离红线)。 */
let cur = null;
let curFamily = '';

function setCurrent(batch) {
  cur = (batch && BATCH_ID_RE.test(batch.id || '')) ? batch : null;
  curFamily = auth.getFamily();
}

function current(id) {
  if (!cur || auth.getFamily() !== curFamily) return null;
  return (!id || cur.id === id) ? cur : null;
}

/* 拉批次列表:成功 done(列表);失败(未登录/离线/未开通)done(null) 由页面用缓存渲染。
   401 清会话弹登录门(与其它模块一致) */
function fetchBatches(done) {
  const token = auth.getToken();
  if (!token) { if (done) done(null); return; }
  wx.request({
    url: API_BASE + '/api/recognition/batches?token=' + encodeURIComponent(token),
    method: 'GET',
    success(res) {
      if (res.statusCode === 401) { auth.on401(); if (done) done(null); return; }
      const j = res.data;
      if (res.statusCode !== 200 || !j || !j.ok || !Array.isArray(j.batches)) {
        if (done) done(null);
        return;
      }
      const list = sortBatches(j.batches.map(normalizeBrief).filter(Boolean));
      saveBatches(list);
      if (done) done(list);
    },
    fail() { if (done) done(null); },
  });
}

/* 拉某批整批内容:成功 done(批次, null);404 done(null, 'notfound')(批次被家长删了);
   离线 done(null, 'net');未登录 done(null, 'auth') */
function fetchBatch(id, done) {
  if (!BATCH_ID_RE.test(id || '')) { if (done) done(null, 'notfound'); return; }
  const token = auth.getToken();
  if (!token) { if (done) done(null, 'auth'); return; }
  wx.request({
    url: API_BASE + '/api/recognition/batch?token=' + encodeURIComponent(token) +
         '&id=' + encodeURIComponent(id),
    method: 'GET',
    success(res) {
      if (res.statusCode === 401) { auth.on401(); if (done) done(null, 'auth'); return; }
      if (res.statusCode === 404) { if (done) done(null, 'notfound'); return; }
      const j = res.data;
      const b = (res.statusCode === 200 && j && j.ok) ? normalizeBatch(j.batch) : null;
      if (!b) { if (done) done(null, 'bad'); return; }
      saveBatch(b);
      if (done) done(b, null);
    },
    fail() { if (done) done(null, 'net'); },
  });
}

/* 禅模式换卡:批次内顺序走一张(首尾循环),d=+1 下一张 / d=-1 上一张 */
function stepIndex(curIdx, d, total) {
  const n = total || 0;
  if (n <= 0) return 0;
  return ((curIdx + d) % n + n) % n;
}

module.exports = {
  API_BASE, IMG_API, KINDS, KIND_IDS, kindOf,
  TITLE_MAX, NOTE_MAX, ANSWER_MAX, EXTRA_MAX, ITEMS_MAX, FACE_MAX, EMOJI_MAX,
  DATE_RE, IMG_ID_RE, BATCH_ID_RE, LIST_KEY, ITEM_KEY, LEGACY_ITEM_KEY,
  parseDate, fmtCN, weekdayCN,
  normalizeItem, normalizeBrief, normalizeBatch, sortBatches, statsOf, sections,
  faceSize, itemView, itemViews, batchView,
  loadBatches, saveBatches, loadBatch, saveBatch, setCurrent, current,
  fetchBatches, fetchBatch, stepIndex,
};
