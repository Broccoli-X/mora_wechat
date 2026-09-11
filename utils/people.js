/* 英语人物单词卡:江苏译林版一年级教材人物(网页端暂无此页,小程序端首发)。
   名单与头像来自课本 U1 人物页(2024 新版一上,家长提供的教材人物条带裁图,
   放 mora 网页端仓库 images/people/ 由服务器托管,与老师口诀一一对应:Su Hai 蝴蝶结 / Yang Ling 圆眼镜 /
   Liu Tao 竖头发 / Wang Bing 平头发 / Tommy 波浪头 / Amy 卷卷的发尾 / Lily 小鸟尾巴)。
   列表卡面为人物头像 + 英文名 + 中文名;点卡片弹出大卡,翻面只显示英文和中文
   (看人物猜名字的自测玩法)。掌握进度多端同步:协议与 utils/letters.js 一致
   (/api/progress,服务端模块白名单取 words=英语单词,itemKey = 人物英文名,
   与网页端 MoraSync.pushOne("words", …) 同模块同键空间——人物名不在网页端
   单词表内,互不干扰)。本地存储为第一写入点,进页面拉取合并、点标记异步
   上报,同键 updatedAt 新者胜。 */
const auth = require('./auth');

/* 人物头像走服务器托管:mora 网页端仓库 images/people/(部署后即
   https://www.tcued.com/images/people/),不进小程序代码包(包体积限制)。
   emoji 是加载失败/离线的兜底显示(onImgError 时换成 emoji,不白屏)。 */
const IMG_BASE = 'https://www.tcued.com/images/people/';

/* 人物与课本人物页一致(顺序同条带,下册新增人物在此追加):
   n 英文名(同步 itemKey,定稿后不改名) / zh 中文名 / img 课本头像 URL / emoji 兜底 */
const DATA = [
  { n: 'Liu Tao',   zh: '刘涛', emoji: '👦', img: IMG_BASE + 'liu-tao.png' },
  { n: 'Wang Bing', zh: '王兵', emoji: '👦', img: IMG_BASE + 'wang-bing.png' },
  { n: 'Su Hai',    zh: '苏海', emoji: '👧', img: IMG_BASE + 'su-hai.png' },
  { n: 'Yang Ling', zh: '杨玲', emoji: '👧', img: IMG_BASE + 'yang-ling.png' },
  { n: 'Tommy',     zh: '汤米', emoji: '👦', img: IMG_BASE + 'tommy.png' },
  { n: 'Amy',       zh: '艾米', emoji: '👧', img: IMG_BASE + 'amy.png' },
  { n: 'Lily',      zh: '莉莉', emoji: '👧', img: IMG_BASE + 'lily.png' },
];

/* 卡片点缀色:与字母卡/网页端单词卡 PALETTE 一致,按下标循环 */
const PALETTE = ['#FF6B6B', '#FF9F43', '#FECA57', '#1DD1A1', '#48DBFB', '#5f27cd', '#FF6B9D', '#54A0FF', '#00D2D3', '#EE5A6F'];

const NAMES = DATA.map(d => d.n);
const VALID_KEYS = new Set(NAMES);

/* 已掌握本地存储与进度同步:键位/协议与 utils/letters.js 同款,MODULE 对齐服务端白名单 */
const MASTER_KEY = 'mora-people-mastered-v1';
const TS_KEY = 'mora-people-mastered-ts-v1';
const DEVICE_KEY = 'mora-device';
const API_BASE = 'https://www.tcued.com';
const MODULE = 'words';

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

/* 设备名(上报来源标识):与 auth.js/letters.js 共用 mora-device 键 */
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

/* 标记/取消掌握(传人物英文名):先写本地,再 fire-and-forget 上报 */
function markMastered(name, done) {
  const map = loadMastered();
  if (done) map[name] = true; else delete map[name];
  const now = Date.now();
  const ts = loadTs();
  ts[name] = now;
  saveStore(map, ts);
  pushItems([{ itemKey: name, mastered: done ? 1 : 0, updatedAt: now }]);
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

/* 拉取远端合并到本地(只认 words 模块与人物英文名键位,网页端普通单词同模块不同键不串),
   成功 done(合并后掌握map)。合并后把「本地更新过的条目」补传,保证本机改动不丢。 */
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

/* 卡片视图:i 列表序 / n 英文名 / zh 中文名 / img 头像URL / emoji 兜底 / color 点缀色 / mastered 掌握标记 */
function views(masteredMap) {
  return DATA.map((d, i) => ({
    i,
    n: d.n,
    zh: d.zh,
    img: d.img,
    emoji: d.emoji,
    color: PALETTE[i % PALETTE.length],
    mastered: !!(masteredMap && masteredMap[d.n]),
  }));
}

function countAll() {
  return DATA.length;
}

function countMastered(masteredMap) {
  return DATA.filter(d => masteredMap[d.n]).length;
}

module.exports = {
  DATA, NAMES, PALETTE,
  loadMastered, loadTs, saveStore, deviceName,
  pushItems, markMastered, localItems, mergeItems, itemsToPush, syncMastered,
  views, countAll, countMastered,
};
