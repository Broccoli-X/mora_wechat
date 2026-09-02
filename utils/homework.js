/* 作业数据只读同步:数据源与网页端相同的服务(/api/progress,module=homework)。
   录入/删除在网页端维护(zuoye-edit.html),小程序端只做查看。
   payload 为短键 JSON:{d:日期, s:科目, t:内容, g:[图片id]};空 payload 是删除墓碑,直接跳过。
   图片本体走 GET /api/image?id=<id>(不带 token,与服务端设计一致,见 imgRefOf)。
   token 与 mora 网页端 lib/sync-config.js 同源;上线前需在小程序后台把
   API_BASE 配置为 request 合法域名。 */
const API_BASE = 'https://www.tcued.com';
const TOKEN = '2ed49dbd4eddd9acdda3ae224bd2c23c';

/* 科目与配色跟课表同色系:main 深色做色块(白字高对比) */
const SUBJECTS = [
  { name: '语文', icon: '📖', main: '#c9392b' },
  { name: '数学', icon: '🔢', main: '#1d5fbf' },
  { name: '英语', icon: '🔤', main: '#177a3e' },
  { name: '其他', icon: '📌', main: '#8a5a2b' },
];
const SUBJECT_NAMES = SUBJECTS.map(s => s.name);
const META = {};
SUBJECTS.forEach(s => { META[s.name] = s; });

const WEEKDAY_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/* 图片引用规则与 mora 网页端 lib/homework-core.js 同源:仅收服务端 id(dataURL 不同步) */
const IMG_ID_RE = /^img[0-9a-z]{4,30}$/;
const IMGS_MAX = 9;

function metaOf(subject) {
  return META[subject] || { name: subject, icon: '📌', main: '#5f6b7d' };
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
  return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2] ? d : null;
}

function weekdayCN(dateStr) {
  const d = parseDate(dateStr);
  return d ? WEEKDAY_CN[d.getDay()] : '';
}

function fmtCN(dateStr) {
  const d = parseDate(dateStr);
  return d ? (d.getMonth() + 1) + '月' + d.getDate() + '日' : '';
}

/* 某天所在一周:周一到周日共 7 个日期串(周日属于本周,不滚到下周) */
function weekOf(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return [];
  const mon = new Date(d);
  mon.setDate(d.getDate() - (d.getDay() + 6) % 7);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const t = new Date(mon);
    t.setDate(mon.getDate() + i);
    days.push(toDateStr(t));
  }
  return days;
}

/* 按日期升序,同日按科目固定次序,再按录入先后 */
function sortByDay(entries) {
  return (entries || []).slice().sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 :
    SUBJECT_NAMES.indexOf(a.subject) - SUBJECT_NAMES.indexOf(b.subject) ||
    a.updatedAt - b.updatedAt);
}

/* 图片引用 → 可加载地址:GET /api/image 不需要 token(<img>/wx.previewImage 直连) */
function imgUrl(ref) {
  return API_BASE + '/api/image?id=' + encodeURIComponent(ref);
}

/* payload 图片字段 g → 合法引用数组:非数组/坏 id 丢弃,最多 IMGS_MAX 张 */
function imgsOf(g) {
  if (!Array.isArray(g)) return [];
  return g.filter(x => typeof x === 'string' && IMG_ID_RE.test(x)).slice(0, IMGS_MAX);
}

/* 服务端进度条目 → 作业数组:只认 module=homework,
   跳过墓碑(空 payload)和坏 payload,解码后按日排序 */
function decodeItems(items) {
  const entries = [];
  for (const it of items || []) {
    if (!it || it.module !== 'homework') continue;
    if (typeof it.payload !== 'string' || !it.payload) continue;
    try {
      const o = JSON.parse(it.payload);
      const text = typeof o.t === 'string' ? o.t.trim() : '';
      if (parseDate(o.d) && SUBJECT_NAMES.indexOf(o.s) >= 0 && text) {
        entries.push({
          id: String(it.itemKey || ''),
          date: o.d,
          subject: o.s,
          text: text,
          imgs: imgsOf(o.g),
          updatedAt: it.updatedAt || 0,
        });
      }
    } catch (e) { /* 坏 payload 丢弃 */ }
  }
  return sortByDay(entries);
}

/* 拉取全部作业(服务端按 module 过滤需自行做),成功 done(entries),失败 fail(err) */
function fetchHomework(done, fail) {
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
  SUBJECTS, SUBJECT_NAMES, WEEKDAY_CN,
  metaOf, toDateStr, todayStr, parseDate, weekdayCN, fmtCN, weekOf,
  sortByDay, decodeItems, fetchHomework, imgUrl,
};
