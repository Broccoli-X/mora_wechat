/* 与 mora 网页端同一文章目录、按篇缓存与 reading 进度。 */
const auth = require('./auth');
const API_BASE = 'https://www.tcued.com';
const CACHE_KEY = 'mora-reading-library-v1';
const READ_KEY = 'mora-reading-progress-v1';
const GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'];
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u{20000}-\u{323af}]/u;

function splitText(text, pinyin) {
  const syllables = pinyin ? pinyin.trim().split(/\s+/) : [];
  let i = 0;
  return Array.from(text, (char, index) => HAN.test(char)
    ? { index, char, isHan: true, pinyin: syllables[i++] || '' }
    : { index, char, isHan: false, pinyin: '', lineBreak: char === '\n' });
}

function caption(item) {
  return GRADES[item.grade - 1] + item.volume + (item.source ? ' · ' + item.source : '');
}

function load(key, fallback) {
  try {
    const data = wx.getStorageSync(key);
    if (data && data.family === auth.getFamily() && data.family) return data.value;
  } catch (err) { /* 缓存不可读时使用兜底 */ }
  return fallback;
}

function save(key, value) {
  const family = auth.getFamily();
  if (!family) return;
  try { wx.setStorageSync(key, { family, value }); }
  catch (err) { /* 缓存被禁用时仍可联网读取 */ }
}

function error(status) { return Object.assign(new Error('request failed'), { status }); }

function request(path, method = 'GET', data = {}) {
  const token = auth.getToken();
  const family = auth.getFamily();
  if (!token) return Promise.reject(error(401));
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE + path + (method === 'GET'
        ? (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token) : ''),
      method,
      header: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
      data: method === 'GET' ? undefined : { ...data, token },
      success(res) {
        if (token !== auth.getToken() || family !== auth.getFamily()) { reject(error(401)); return; }
        const j = res.data;
        if (res.statusCode === 401 || (j && j.error === 'password change required')) auth.on401();
        if (res.statusCode === 200 && j && j.ok) resolve(j);
        else reject(error(res.statusCode));
      },
      fail: reject,
    });
  });
}

function cache() { return load(CACHE_KEY, { list: null, articles: [] }); }
function list() { return cache().list; }

async function refreshList() {
  const { data } = await request('/api/reading');
  const known = new Map(data.map(a => [a.id, a.revision]));
  save(CACHE_KEY, { list: data, articles: cache().articles.filter(a => known.get(a.id) === a.revision) });
  return data;
}

async function article(id, revision) {
  const existing = cache().articles.find(a => a.id === id && a.revision === revision);
  if (existing) return existing;
  const { data } = await request('/api/reading/article?id=' + encodeURIComponent(id));
  const stored = cache();
  save(CACHE_KEY, { list: stored.list,
    articles: [data, ...stored.articles.filter(a => a.id !== id)].slice(0, 12) });
  return data;
}

let progressInMemory = null;
function progress() {
  const family = auth.getFamily();
  if (!progressInMemory || progressInMemory.family !== family) {
    progressInMemory = { family, values: load(READ_KEY, {}) };
  }
  return progressInMemory.values;
}

function saveProgress(values) {
  progressInMemory = { family: auth.getFamily(), values };
  save(READ_KEY, values);
}

function isRead(key) { return progress()[key]?.mastered === 1; }

function push(rows) {
  return request('/api/progress', 'POST', { items: rows.map(row => ({
    ...row, module: 'reading', device: auth.deviceTag(),
  })) });
}

function toggle(key) {
  const current = progress();
  const row = { itemKey: key, mastered: isRead(key) ? 0 : 1,
    updatedAt: Math.max(Date.now(), (current[key]?.updatedAt || 0) + 1) };
  saveProgress({ ...current, [key]: row });
  push([row]).catch(() => { /* 进页面时按时间戳补传 */ });
  return row.mastered === 1;
}

async function syncProgress() {
  const { items } = await request('/api/progress');
  const online = new Map(items.filter(row => row.module === 'reading').map(row => [row.itemKey, row]));
  // 请求回来后再读本地值，保证等待期间的点击也参与合并。
  const current = progress();
  const merged = Object.fromEntries([...online].map(([key, row]) => [key, {
    itemKey: key, mastered: row.mastered, updatedAt: row.updatedAt,
  }]));
  const pending = [];
  for (const [key, row] of Object.entries(current)) {
    const remote = online.get(key);
    if (!remote || row.updatedAt >= remote.updatedAt) merged[key] = row;
    if (!remote || row.updatedAt > remote.updatedAt) pending.push(row);
  }
  saveProgress(merged);
  for (let i = 0; i < pending.length; i += 500) await push(pending.slice(i, i + 500));
}

function group(items, grade, volume) {
  return items.filter(a => (!grade || a.grade === grade) && (!volume || a.volume === volume));
}

module.exports = { GRADES, splitText, caption, list, refreshList, article, isRead, toggle, syncProgress, group };
