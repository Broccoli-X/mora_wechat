/* 知识点总结(小程序端只读,不录入):内容来自 mora 网页端「知识点录入」
   knowledge-edit.html——仅管理员按教材(年级+科目+册)维护单元必背知识,
   小程序端只负责取来给孩子背。两步接口取用(与网页端 server/README.md「七」同协议):
     ① GET /api/knowledge                        书目列表(有哪些年级/科目/册)
     ② GET /api/knowledge/book?grade&subject&volume   按教材取整本(units 全文)
   数据形状:data.units[].sections[].blocks[] = {h 小标题(可空), rows 一行一条,
   imgs 可选配图(站内相对路径,拼在 API_BASE 下当图片地址)}。
   展示规则与网页端 knowledge.html 同款(README「小程序可按同样规则自行渲染」):
     · 着重号:注音标在哪个字上就用「」把那个字括起来(如 下「棋」(qí));
       整词只有一个字 + 括号里是拼音时自动加点(见 parseRow,边界与网页 pyDot 一致);
     · 形近字:块小标题含「形近字」且行含 ↔ 的一行一组,渲染成上下两员 + 左侧大括号;
     · 象形字配图:「字符数=图片数」(逐字一行,或单行按空白拆)时汉字作图注嵌进
       对应图片卡片、原文字行不再单出;配不上时图片与文字行各排各的(网页 51720c5 同款)。
   服务端读取只验 token(写入才限管理员、FEATURES 亦无 knowledge 键),故本模块
   不做功能键过滤,家长登录即可看。本地缓存为第一读取点(离线可看已拉过的教材),
   拉取成功再以服务端为真源覆盖。客户端只做渲染保护,不复刻服务端字面校验
   (教训与 recognition 同:规则以后再变也不会悄悄吃内容)。 */
const auth = require('./auth');

const API_BASE = 'https://www.tcued.com';
const LIST_KEY = 'mora-knowledge-books-v1';       // 书目列表缓存
const ITEM_KEY = 'mora-knowledge-book-v1';        // 按教材(年级|科目|册)的整本缓存
const CACHE_MAX = 10;                             // 缓存的教材数上限,超出按 updatedAt 淘汰最旧

/* 数量上限:与服务端 valid_knowledge 同口径(只用于截断保护,不逐条复刻校验) */
const TITLE_MAX = 80;
const KEY_MAX = 16;        // 年级/科目/册(valid_book_key:非空短字符串)
const UNIT_MAX = 30;       // 单元数
const SEC_MAX = 20;        // 每单元节数
const BLOCK_MAX = 40;      // 每节块数
const ROW_MAX = 80;        // 每块行数
const IMGS_MAX = 20;       // 每块配图数
const NAME_MAX = 40;       // 单元名/节名
const H_MAX = 60;          // 块小标题(可空)
const ROW_LEN_MAX = 200;   // 单行长度
/* 与服务端 KNOWLEDGE_IMG 同款(另挡 ..:只收站内相对路径) */
const IMG_RE = /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/;

function clean(s, max) {
  return typeof s === 'string' ? s.trim().slice(0, max) : '';
}

/* ── 清洗:书目概要 / 整本数据 ── */
function normalizeBrief(b) {
  if (!b || typeof b !== 'object') return null;
  const grade = clean(b.grade, KEY_MAX);
  const subject = clean(b.subject, KEY_MAX);
  const volume = clean(b.volume, KEY_MAX);
  if (!grade || !subject || !volume) return null;
  return {
    grade: grade, subject: subject, volume: volume,
    title: clean(b.title, TITLE_MAX),
    updatedAt: Number.isInteger(b.updatedAt) ? b.updatedAt : 0,
  };
}

function normalizeBlock(b) {
  if (!b || typeof b !== 'object') return null;
  const rows = (Array.isArray(b.rows) ? b.rows : [])
    .map(r => (typeof r === 'string' ? r.trim().slice(0, ROW_LEN_MAX) : ''))
    .filter(Boolean).slice(0, ROW_MAX);
  const imgs = (Array.isArray(b.imgs) ? b.imgs : [])
    .filter(x => typeof x === 'string' && x && x.length <= 120
      && IMG_RE.test(x) && x.indexOf('..') < 0)
    .slice(0, IMGS_MAX);
  if (!rows.length && !imgs.length) return null;   // 没东西可展示
  return { h: clean(b.h, H_MAX), rows: rows, imgs: imgs };
}

function normalizeSection(s) {
  if (!s || typeof s !== 'object') return null;
  const title = clean(s.title, NAME_MAX);
  const blocks = (Array.isArray(s.blocks) ? s.blocks : [])
    .map(normalizeBlock).filter(Boolean).slice(0, BLOCK_MAX);
  if (!title || !blocks.length) return null;
  return { title: title, blocks: blocks };
}

function normalizeUnit(u) {
  if (!u || typeof u !== 'object') return null;
  const name = clean(u.name, NAME_MAX);
  const sections = (Array.isArray(u.sections) ? u.sections : [])
    .map(normalizeSection).filter(Boolean).slice(0, SEC_MAX);
  if (!name || !sections.length) return null;
  return { name: name, sections: sections };
}

function normalizeBookData(data) {
  if (!data || typeof data !== 'object') return null;
  const units = (Array.isArray(data.units) ? data.units : [])
    .map(normalizeUnit).filter(Boolean).slice(0, UNIT_MAX);
  if (!units.length) return null;
  return { title: clean(data.title, TITLE_MAX), units: units };
}

/* 整本清洗:三键齐 + data 能渲染才收 */
function normalizeFullBook(b) {
  if (!b || typeof b !== 'object') return null;
  const brief = normalizeBrief(b);
  if (!brief) return null;
  const data = normalizeBookData(b.data);
  if (!data) return null;
  return {
    grade: brief.grade, subject: brief.subject, volume: brief.volume,
    title: data.title || brief.title,
    updatedAt: brief.updatedAt, data: data,
  };
}

/* ── 本机缓存:书目列表 / 按键(年级|科目|册)的整本(都过一遍清洗,脏缓存当没有) ── */
function loadBooks() {
  try {
    const a = wx.getStorageSync(LIST_KEY);
    return (Array.isArray(a) ? a : []).map(normalizeBrief).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function saveBooks(list) {
  try { wx.setStorageSync(LIST_KEY, (list || []).slice(0, CACHE_MAX)); }
  catch (e) { /* 存储不可用:本次内存生效 */ }
}

function bookKey(g, s, v) { return g + '|' + s + '|' + v; }

function loadBooksMap() {
  try {
    const m = wx.getStorageSync(ITEM_KEY);
    return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
  } catch (e) {
    return {};
  }
}

function saveBook(book) {
  if (!book) return;
  const m = loadBooksMap();
  m[bookKey(book.grade, book.subject, book.volume)] = book;
  const keys = Object.keys(m);
  if (keys.length > CACHE_MAX) {
    keys.sort((a, b) => (m[a].updatedAt || 0) - (m[b].updatedAt || 0));
    keys.slice(0, keys.length - CACHE_MAX).forEach(k => { delete m[k]; });
  }
  try { wx.setStorageSync(ITEM_KEY, m); }
  catch (e) { /* 同上 */ }
}

function loadBook(g, s, v) {
  if (!g || !s || !v) return null;
  const m = loadBooksMap();
  return m[bookKey(g, s, v)] ? normalizeFullBook(m[bookKey(g, s, v)]) : null;
}

/* ── 页面交接:单元页点单元时 setCurrent(免一次请求);禅模式深链/重启回落到
   本机缓存,都拿不到再由页面拉远端。交接记下所属家庭,换家庭登录后本机缓存会被
   purgeLocalFamilyData 清掉,内存交接若不带家庭判定会串上一家的内容(同一条红线) ── */
let cur = null;
let curFamily = '';

function setCurrent(book) {
  cur = normalizeFullBook(book);
  curFamily = auth.getFamily();
}

function current(g, s, v) {
  if (!cur || auth.getFamily() !== curFamily) return null;
  return (cur.grade === g && cur.subject === s && cur.volume === v) ? cur : null;
}

/* ── 两步接口:成功 done(结果);失败 done(null)。401 清会话弹登录门(与其它模块一致)。
   书目失败不区分原因(页面有缓存就用缓存);整本 err:'empty'=这一册还没有内容,
   'net'/'bad'/'auth' 都按拉取失败展示 ── */
function fetchBooks(done) {
  const token = auth.getToken();
  if (!token) { if (done) done(null); return; }
  wx.request({
    url: API_BASE + '/api/knowledge?token=' + encodeURIComponent(token),
    method: 'GET',
    success(res) {
      if (res.statusCode === 401) { auth.on401(); if (done) done(null); return; }
      const j = res.data;
      if (res.statusCode !== 200 || !j || !j.ok || !Array.isArray(j.books)) {
        if (done) done(null);
        return;
      }
      const list = j.books.map(normalizeBrief).filter(Boolean);
      saveBooks(list);
      if (done) done(list);
    },
    fail() { if (done) done(null); },
  });
}

function fetchBook(g, s, v, done) {
  const token = auth.getToken();
  if (!token) { if (done) done(null, 'auth'); return; }
  wx.request({
    url: API_BASE + '/api/knowledge/book?token=' + encodeURIComponent(token) +
         '&grade=' + encodeURIComponent(g) +
         '&subject=' + encodeURIComponent(s) +
         '&volume=' + encodeURIComponent(v),
    method: 'GET',
    success(res) {
      if (res.statusCode === 401) { auth.on401(); if (done) done(null, 'auth'); return; }
      const j = res.data;
      if (res.statusCode !== 200 || !j || !j.ok) { if (done) done(null, 'bad'); return; }
      if (!j.data) { if (done) done(null, 'empty'); return; }
      const b = normalizeFullBook({
        grade: g, subject: s, volume: v,
        data: j.data, updatedAt: j.updatedAt,
      });
      if (!b) { if (done) done(null, 'bad'); return; }
      saveBook(b);
      if (done) done(b, null);
    },
    fail() { if (done) done(null, 'net'); },
  });
}

/* ── 展示视图(与网页端 knowledge.html 渲染同规则) ── */

/* 单元主色/深色(节名条与块标题用,与网页端 UCOLORS 同表) */
const UCOLORS = [
  ['#F76707', '#C9420A'], ['#1098AD', '#0B7285'], ['#7048E8', '#5F3DC4'], ['#2F9E44', '#2B8A3E'],
  ['#E8590C', '#D9480F'], ['#1C7ED6', '#1864AB'], ['#D6336C', '#A61E4D'], ['#5F3DC4', '#3B5BDB'],
];

function unitColor(i) {
  return UCOLORS[((i % UCOLORS.length) + UCOLORS.length) % UCOLORS.length];
}

/* 着重号:把一行拆成段,zd=true 的段下加红点。
   ① 「X」(单字)显式标注所标的字;② 整词单字 + 括号里是拼音(含拉丁字母)自动加点
   ——但该字前面紧挨汉字时不加(与网页 pyDot 的边界规则一致,如「三人(sān)」中
   三 前面是 人,不加点;「你(nǐ)　三(sān)」中 三 前面是全角空格,加点)。
   已被 ① 消费过的字不重复参与 ②(「棋」(qí) 只点一次)。 */
function parseRow(raw) {
  const s = typeof raw === 'string' ? raw : '';
  const CJK = /[\u4e00-\u9fff]/;
  const segs = [];
  let buf = '';
  let i = 0;
  const flush = () => { if (buf) { segs.push({ t: buf, zd: false }); buf = ''; } };
  while (i < s.length) {
    if (s[i] === '「' && s[i + 2] === '」') {
      flush();
      segs.push({ t: s[i + 1], zd: true });
      i += 3;
      continue;
    }
    if (CJK.test(s[i]) && s[i + 1] === '(') {
      const close = s.indexOf(')', i + 2);
      const inner = close > i + 1 ? s.slice(i + 2, close) : '';
      if (inner && /[a-z]/i.test(inner) && !(i > 0 && CJK.test(s[i - 1]))) {
        flush();
        segs.push({ t: s[i], zd: true });
        segs.push({ t: '(' + inner + ')', zd: false });
        i = close + 1;
        continue;
      }
    }
    buf += s[i];
    i++;
  }
  flush();
  return segs;
}

/* 配图与图注:「字符数=图片数」时汉字作图注嵌进图片卡片,该文字行不再单出
   (逐字一行=行数与图数相等;或单行按空白/全角空格拆开后个数相等)。
   注:网页端 knowledge.html 的「逐字一行」分支用 capRowIdx=-2 让过滤器永不命中,
   文字行实际没被去掉(潜伏 bug,现有数据只用单行形式故未显形);这里按其注释与
   提交说明的意图实现——两个分支都把被用作图注的行去掉。 */
function splitImgs(b) {
  const imgs = b.imgs || [];
  const rows = b.rows || [];
  if (!imgs.length) return { pics: [], rows: rows };
  if (rows.length === imgs.length) {
    return {
      pics: imgs.map((p, k) => ({ url: API_BASE + '/' + p, cap: rows[k].trim() })),
      rows: [],
    };
  }
  let caps = null;
  let capRowIdx = -1;
  for (let ri = 0; ri < rows.length; ri++) {
    const toks = rows[ri].trim().split(/[\s　]+/).filter(Boolean);
    if (toks.length === imgs.length) { caps = toks; capRowIdx = ri; break; }
  }
  return {
    pics: imgs.map((p, k) => ({ url: API_BASE + '/' + p, cap: caps ? (caps[k] || '') : '' })),
    rows: rows.filter((r, ri) => ri !== capRowIdx),
  };
}

/* 块视图:禅模式一张卡渲染一个块。
   形近字(小标题含「形近字」)的 ↔ 行拆上下两员配大括号;其余行走着重号解析,
   「例：/仿写：」打头的行淡化展示(与网页 .row.example 同款)。 */
function blockView(b, secTitle, c, cd) {
  const isPair = !!b.h && b.h.indexOf('形近字') >= 0;
  const rows = b.rows || [];
  const pairRows = isPair ? rows.filter(r => r.indexOf('↔') >= 0) : [];
  const pairs = pairRows.map(r => {
    const k = r.indexOf('↔');
    return { top: r.slice(0, k).trim(), bot: r.slice(k + 1).trim() };
  });
  const sp = splitImgs(b);
  const view = {
    secTitle: secTitle || '', c: c, cd: cd, h: b.h || '',
    rows: sp.rows
      .filter(r => pairRows.indexOf(r) < 0)
      .map((r, k) => ({
        k: k,
        segs: parseRow(r).map((seg, j) => ({ k: j, t: seg.t, zd: seg.zd })),
        ex: /^(例|仿写)[：:]/.test(r.trim()),
      })),
    pairs: pairs.map((pr, k) => ({ k: k, top: pr.top, bot: pr.bot })),
    pics: sp.pics.map((p, k) => ({ k: k, url: p.url, cap: p.cap, failed: false })),
  };
  view.hasRows = view.rows.length > 0;
  view.hasPairs = view.pairs.length > 0;
  view.hasPics = view.pics.length > 0;
  return view;
}

/* 单元页视图:单元名 + 板块/块计数 + 该单元的轮换配色(与网页端同表) */
function unitList(book) {
  if (!book || !book.data) return [];
  return (book.data.units || []).map((u, i) => {
    const col = unitColor(i);
    const secs = u.sections || [];
    const blks = secs.reduce((n, s) => n + ((s.blocks || []).length), 0);
    return { i: i, name: u.name, c: col[0], cd: col[1], secs: secs.length, blks: blks };
  });
}

/* 禅模式取数:单元内所有块拍平成一叠卡(节名作卡顶小签),顺序走一张 */
function unitItems(book, uIdx) {
  if (!book || !book.data) return [];
  const u = (book.data.units || [])[uIdx];
  if (!u) return [];
  const col = unitColor(uIdx);
  const items = [];
  (u.sections || []).forEach(s => {
    (s.blocks || []).forEach(b => {
      const v = blockView(b, s.title, col[0], col[1]);
      if (v.hasRows || v.hasPairs || v.hasPics) {
        v.i = items.length;
        items.push(v);
      }
    });
  });
  return items;
}

/* 禅模式换卡:单元内顺序走一张(首尾循环),d=+1 下一项 / d=-1 上一项 */
function stepIndex(curIdx, d, total) {
  const n = total || 0;
  if (n <= 0) return 0;
  return ((curIdx + d) % n + n) % n;
}

module.exports = {
  API_BASE, LIST_KEY, ITEM_KEY, CACHE_MAX,
  TITLE_MAX, KEY_MAX, UNIT_MAX, SEC_MAX, BLOCK_MAX, ROW_MAX, IMGS_MAX, IMG_RE,
  UCOLORS,
  normalizeBrief, normalizeBlock, normalizeSection, normalizeUnit, normalizeBookData,
  normalizeFullBook, loadBooks, saveBooks, bookKey, loadBook, saveBook,
  setCurrent, current, fetchBooks, fetchBook,
  unitColor, parseRow, splitImgs, blockView, unitList, unitItems, stepIndex,
};
