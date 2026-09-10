/* 英语字母卡:mora 网页端 phonics-cards.html(lib/letters-data.js)的同步副本。
   卡面内容与网页端一致(字母名/字母音音标 + 例词图标),但不带读音——小程序端纯认读。
   掌握进度多端同步:协议与网页端 lib/progress-sync.js 一致(/api/progress module=phonics,
   itemKey = 单个字母 A-Z,与网页端 MoraSync.pushOne("phonics", L, …) 同键),本地存储为
   第一写入点,进页面拉取合并、点标记异步上报,同键 updatedAt 新者胜。
   zen 模式左右滑动 randomNext 随机换卡(不与当前重复)。 */
const auth = require('./auth');

/* 数据与网页端 lib/letters-data.js 逐字一致(两端变更需同步维护):
   nameIPA 字母名音标 / sIPA 自然拼读音 / word+emoji 例词 */
const DATA = [
  { l: 'A', nameIPA: '/eɪ/', sIPA: '/æ/', word: 'apple', emoji: '🍎' },
  { l: 'B', nameIPA: '/biː/', sIPA: '/b/', word: 'ball', emoji: '⚽' },
  { l: 'C', nameIPA: '/siː/', sIPA: '/k/', word: 'cat', emoji: '🐱' },
  { l: 'D', nameIPA: '/diː/', sIPA: '/d/', word: 'dog', emoji: '🐶' },
  { l: 'E', nameIPA: '/iː/', sIPA: '/ɛ/', word: 'egg', emoji: '🥚' },
  { l: 'F', nameIPA: '/ɛf/', sIPA: '/f/', word: 'fish', emoji: '🐟' },
  { l: 'G', nameIPA: '/dʒiː/', sIPA: '/ɡ/', word: 'goat', emoji: '🐐' },
  { l: 'H', nameIPA: '/eɪtʃ/', sIPA: '/h/', word: 'hat', emoji: '🎩' },
  { l: 'I', nameIPA: '/aɪ/', sIPA: '/ɪ/', word: 'igloo', emoji: '🛖' },
  { l: 'J', nameIPA: '/dʒeɪ/', sIPA: '/dʒ/', word: 'juice', emoji: '🧃' },
  { l: 'K', nameIPA: '/keɪ/', sIPA: '/k/', word: 'kite', emoji: '🪁' },
  { l: 'L', nameIPA: '/ɛl/', sIPA: '/l/', word: 'lion', emoji: '🦁' },
  { l: 'M', nameIPA: '/ɛm/', sIPA: '/m/', word: 'monkey', emoji: '🐵' },
  { l: 'N', nameIPA: '/ɛn/', sIPA: '/n/', word: 'nose', emoji: '👃' },
  { l: 'O', nameIPA: '/oʊ/', sIPA: '/ɑ/', word: 'orange', emoji: '🍊' },
  { l: 'P', nameIPA: '/piː/', sIPA: '/p/', word: 'pig', emoji: '🐷' },
  { l: 'Q', nameIPA: '/kjuː/', sIPA: '/kw/', word: 'queen', emoji: '👑' },
  { l: 'R', nameIPA: '/ɑːr/', sIPA: '/r/', word: 'rabbit', emoji: '🐰' },
  { l: 'S', nameIPA: '/ɛs/', sIPA: '/s/', word: 'sun', emoji: '☀️' },
  { l: 'T', nameIPA: '/tiː/', sIPA: '/t/', word: 'tiger', emoji: '🐯' },
  { l: 'U', nameIPA: '/juː/', sIPA: '/ʌ/', word: 'umbrella', emoji: '☂️' },
  { l: 'V', nameIPA: '/viː/', sIPA: '/v/', word: 'violin', emoji: '🎻' },
  { l: 'W', nameIPA: '/ˈdʌbəl.juː/', sIPA: '/w/', word: 'watermelon', emoji: '🍉' },
  { l: 'X', nameIPA: '/ɛks/', sIPA: '/ks/', word: 'fox', emoji: '🦊' },
  { l: 'Y', nameIPA: '/waɪ/', sIPA: '/j/', word: 'yellow', emoji: '💛' },
  { l: 'Z', nameIPA: '/ziː/', sIPA: '/z/', word: 'zebra', emoji: '🦓' },
];

/* 卡片点缀色:与网页端 phonics-cards.html PALETTE 一致,按 A-Z 下标循环 */
const PALETTE = ['#FF6B6B', '#FF9F43', '#FECA57', '#1DD1A1', '#48DBFB', '#5f27cd', '#FF6B9D', '#54A0FF', '#00D2D3', '#EE5A6F'];

const LETTERS = DATA.map(d => d.l);
const VALID_KEYS = new Set(LETTERS);

/* 已掌握本地存储与进度同步:键位/协议与 utils/pinyin.js 同款,MODULE 对齐网页端 */
const MASTER_KEY = 'mora-phonics-mastered-v1';
const TS_KEY = 'mora-phonics-mastered-ts-v1';
const DEVICE_KEY = 'mora-device';
const API_BASE = 'https://www.tcued.com';
const MODULE = 'phonics';

function loadMastered() {
  try {
    const v = wx.getStorageSync(MASTER_KEY);
    if (!Array.isArray(v)) return {};
    const map = {};
    v.forEach(k => { if (typeof k === 'string' && VALID_KEYS.has(k)) map[k] = true; });
    return map;
  } catch (e) {
    return {};
  }
}

function loadTs() {
  try {
    const v = wx.getStorageSync(TS_KEY);
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch (e) {
    return {};
  }
}

function saveStore(map, ts) {
  try {
    wx.setStorageSync(MASTER_KEY, Object.keys(map));
    wx.setStorageSync(TS_KEY, ts);
  } catch (e) { /* 存储失败静默,不影响浏览 */ }
}

/* 设备名(上报来源标识):与 auth.js/pinyin.js 共用 mora-device 键 */
function deviceName() {
  let d = '';
  try { d = wx.getStorageSync(DEVICE_KEY); } catch (e) { /* 存储不可用时现场生成 */ }
  if (d) return d;
  let prefix = 'wx';
  try {
    const info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
    prefix = (info && info.platform) || 'wx';
  } catch (e) { /* 取不到平台信息用默认前缀 */ }
  d = prefix + '-' + Math.random().toString(16).slice(2, 6);
  try { wx.setStorageSync(DEVICE_KEY, d); } catch (e) { /* 同上 */ }
  return d;
}

/* 上报条目(离线/未登录/失败静默:本地存储始终是第一写入点,登录后 syncMastered 补传) */
function pushItems(items) {
  const token = auth.getToken();
  if (!token) return;
  wx.request({
    url: API_BASE + '/api/progress',
    method: 'POST',
    header: { 'Content-Type': 'application/json' },
    data: {
      token: token,
      items: items.map(it => ({
        module: MODULE,
        itemKey: it.itemKey,
        mastered: it.mastered ? 1 : 0,
        updatedAt: it.updatedAt,
        device: deviceName(),
      })),
    },
    success(res) {
      if (res.statusCode === 401) auth.on401();
    },
    fail() { /* 静默:下次进入页面 syncMastered 会按时间戳补传 */ },
  });
}

/* 标记/取消掌握(传字母 A-Z):先写本地,再 fire-and-forget 上报 */
function markMastered(letter, done) {
  const map = loadMastered();
  if (done) map[letter] = true; else delete map[letter];
  const now = Date.now();
  const ts = loadTs();
  ts[letter] = now;
  saveStore(map, ts);
  pushItems([{ itemKey: letter, mastered: done ? 1 : 0, updatedAt: now }]);
}

/* 本地条目 → 同步协议格式(无时间戳的旧数据按当下补记,与网页端一致) */
function localItems() {
  const map = loadMastered();
  const ts = loadTs();
  const now = Date.now();
  return Object.keys(map).filter(k => VALID_KEYS.has(k))
    .map(k => ({ itemKey: k, mastered: 1, updatedAt: ts[k] || now }));
}

/* 纯函数:合并本地/远端条目,同 itemKey 取 updatedAt 新者(相等取本地),与网页端一致 */
function mergeItems(localItems_, remoteItems) {
  const byKey = new Map((remoteItems || []).map(r => [r.itemKey, r]));
  const merged = [];
  for (const it of localItems_ || []) {
    const r = byKey.get(it.itemKey);
    merged.push(r && r.updatedAt > it.updatedAt ? r : it);
    if (r) byKey.delete(it.itemKey);
  }
  for (const r of byKey.values()) merged.push(r);
  return merged;
}

/* 纯函数:挑出需要补传的本地条目(比远端新,或远端没有) */
function itemsToPush(localItems_, remoteItems) {
  const remote = new Map((remoteItems || []).map(r => [r.itemKey, r.updatedAt]));
  return (localItems_ || []).filter(l => l.updatedAt > (remote.has(l.itemKey) ? remote.get(l.itemKey) : -1));
}

/* 拉取远端合并到本地(只认 phonics 模块与 A-Z 键位),成功 done(合并后掌握map)。
   合并后把「本地更新过的条目」补传,保证本机改动不丢。 */
function syncMastered(done) {
  wx.request({
    url: API_BASE + '/api/progress?token=' + encodeURIComponent(auth.getToken()),
    method: 'GET',
    success(res) {
      if (res.statusCode === 401) { auth.on401(); return; }
      const data = res.data;
      const items = data && data.ok && Array.isArray(data.items) ? data.items : [];
      const remote = items.filter(it => it && it.module === MODULE && VALID_KEYS.has(it.itemKey));
      const local = localItems();
      const merged = mergeItems(local, remote);
      const map = {};
      const ts = loadTs();
      merged.forEach(m => {
        ts[m.itemKey] = m.updatedAt;
        if (m.mastered === 1) map[m.itemKey] = true;
      });
      saveStore(map, ts);
      const newer = itemsToPush(local, remote);
      if (newer.length) pushItems(newer);
      if (done) done(map);
    },
    fail() { /* 离线:用本地原样 */ },
  });
}

/* 卡片视图:i 列表序 / l 大写 / low 小写 / pair 同卡展示 / color 网页端同款点缀色 */
function views(masteredMap) {
  return DATA.map((d, i) => ({
    i,
    l: d.l,
    low: d.l.toLowerCase(),
    pair: d.l + d.l.toLowerCase(),
    nameIPA: d.nameIPA,
    sIPA: d.sIPA,
    word: d.word,
    emoji: d.emoji,
    color: PALETTE[i % PALETTE.length],
    mastered: !!(masteredMap && masteredMap[d.l]),
  }));
}

function countAll() {
  return DATA.length;
}

function countMastered(masteredMap) {
  return DATA.filter(d => masteredMap[d.l]).length;
}

/* zen 模式左右滑动随机换卡:等概率取「非当前」的一张(不与当前重复) */
function randomNext(cur, rand) {
  const rnd = rand || Math.random;
  const n = DATA.length;
  if (n <= 1) return 0;
  let j = Math.floor(rnd() * (n - 1));
  if (j >= cur) j += 1;
  return j;
}

module.exports = {
  DATA, LETTERS, PALETTE,
  loadMastered, loadTs, saveStore, deviceName,
  pushItems, markMastered, localItems, mergeItems, itemsToPush, syncMastered,
  views, countAll, countMastered, randomNext,
};
