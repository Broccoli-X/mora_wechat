/* 积分只读同步:数据源与网页端相同的服务(/api/progress,module=points)。
   发放/兑换在网页端家长页(points-edit.html)维护(带家长算术门),小程序端只做查看。
   payload 为短键 JSON:{d:日期, r:理由, s:分数, j:科目, n:备注};空 payload 是删除墓碑,直接跳过。
   统计口径与网页端 lib/points-core.js 一致:累计 = 发放合计(兑换不动,emoji 只看它),
   剩余 = 累计 - 已兑换;10 积分 = 1 元。token 与 utils/homework.js 同源。 */
const API_BASE = 'https://www.tcued.com';
const TOKEN = '2ed49dbd4eddd9acdda3ae224bd2c23c';

/* 星级进位:1 星 = 1 分,每 10 个进一级 */
const LEVELS = [
  { emoji: '⭐', name: '星星', per: 1 },
  { emoji: '🌙', name: '月亮', per: 10 },
  { emoji: '☀️', name: '太阳', per: 100 },
  { emoji: '💎', name: '钻石', per: 1000 },
  { emoji: '👑', name: '皇冠', per: 10000 },
];
const POINTS_PER_YUAN = 10;

/* 发放理由(分数固定);subject:true 的按学科各发一次;custom:true 的分值手动填 */
const REASONS = [
  { key: 'hw_pro', label: '主动完成作业', score: 3, subject: true },
  { key: 'hw', label: '完成作业', score: 1, subject: true },
  { key: 'exam_e', label: '学科检测-优秀', score: 5 },
  { key: 'exam_g', label: '学科检测-良好', score: 3 },
  { key: 'exam_p', label: '学科检测-及格', score: 1 },
  { key: 'out', label: '户外运动2小时以上', score: 2 },
  { key: 'cus', label: '自定义奖励', custom: true },
];
/* 消耗理由:奖励兑换;自定义扣分必须手填理由 */
const CONSUMES = [
  { key: 'buy', label: '奖励兑换', consume: true },
  { key: 'buy_cus', label: '自定义', custom: true, consume: true },
];
const CUSTOM_MAX = 5;      // 自定义奖励上限
const CONSUME_MAX = 999;   // 单次兑换上限
const NOTE_MAX = 30;       // 备注长度上限
const SUBJECTS = ['语文', '数学', '英语', '其他'];

/* 积分规则(与网页端首页同文案) */
const RULES = [
  '1 个星星 = 1 分;10 ⭐ 换 1 🌙,10 🌙 换 1 ☀️,10 ☀️ 换 1 💎,10 💎 换 1 👑',
  '积极主动完成一门学科作业 +3 分,完成一门学科作业 +1 分',
  '学科检测:优秀 +5 分,良好 +3 分,及格 +1 分',
  '坚持户外运动 2 小时以上 +2 分',
  '其他自定义奖励不超过 5 分',
  '10 积分 = 1 元,可以用来买自己喜欢的东西',
];

function reasonOf(key) {
  return REASONS.filter(r => r.key === key)[0] ||
         CONSUMES.filter(c => c.key === key)[0] || null;
}

function cleanNote(n) {
  return typeof n === 'string' ? n.trim().slice(0, NOTE_MAX) : '';
}

/* 校验清洗一条积分记录:理由必须在规则表里,分数由规则决定,消耗恒为负分;
   自定义消耗必须手填理由。坏数据返回 null。 */
function normalize(e) {
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!e || !DATE_RE.test(e.date || '')) return null;
  const r = reasonOf(e.reason);
  if (!r) return null;
  let score;
  if (r.consume) {
    const n = Math.abs(Number(e.score));
    if (!Number.isInteger(n) || n < 1 || n > CONSUME_MAX) return null;
    if (r.custom && !cleanNote(e.note)) return null;
    score = -n;
  } else if (r.custom) {
    const n = Number(e.score);
    if (!Number.isInteger(n) || n < 1 || n > CUSTOM_MAX) return null;
    score = n;
  } else {
    score = r.score;
  }
  const subject = r.subject && SUBJECTS.indexOf(e.subject) >= 0 ? e.subject : '';
  return {
    id: String(e.id || ''),
    date: e.date,
    reason: r.key,
    subject: subject,
    note: cleanNote(e.note),
    score: score,
    updatedAt: Number.isInteger(e.updatedAt) ? e.updatedAt : 0,
  };
}

/* 服务端进度条目 → 积分记录数组:只认 module=points,
   跳过墓碑(空 payload)和坏 payload,解码后最新在前 */
function decodeItems(items) {
  const entries = [];
  for (const it of items || []) {
    if (!it || it.module !== 'points') continue;
    if (typeof it.payload !== 'string' || !it.payload) continue;
    try {
      const o = JSON.parse(it.payload);
      const e = normalize({
        id: String(it.itemKey || ''),
        date: o.d,
        reason: o.r,
        score: o.s,
        subject: o.j,
        note: o.n,
        updatedAt: it.updatedAt || 0,
      });
      if (e) entries.push(e);
    } catch (err) { /* 坏 payload 丢弃 */ }
  }
  return sortByNew(entries);
}

/* 明细展示顺序:日期新在前,同日按录入先后倒排 */
function sortByNew(entries) {
  return (entries || []).slice().sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : b.updatedAt - a.updatedAt);
}

/* 累计 = 发放合计(兑换不动它,emoji 因此只涨不掉);
   剩余 = 累计 - 已兑换 */
function totalsOf(entries) {
  let earned = 0, spent = 0;
  for (const e of entries || []) {
    if (e.score > 0) earned += e.score; else spent -= e.score;
  }
  return { earned: earned, spent: spent, remaining: earned - spent };
}

/* 累计积分 → emoji 串(大到小进位展示);一级超过 9 个(只可能是皇冠)用 ×N。
   0 分返回空串,由页面自己给空态文案 */
function emojiFor(cumulative) {
  let n = Math.max(0, Math.round(Number(cumulative) || 0));
  const parts = [];
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    const cnt = Math.floor(n / LEVELS[i].per);
    n -= cnt * LEVELS[i].per;
    if (!cnt) continue;
    parts.push(cnt > 9 ? LEVELS[i].emoji + '×' + cnt : LEVELS[i].emoji.repeat(cnt));
  }
  return parts.join('');
}

/* 剩余积分 → 零钱文本:10 分 = 1 元,整数省小数(23 → "2.3",10 → "1") */
function yuanText(remaining) {
  return (Math.round(remaining) / POINTS_PER_YUAN).toFixed(1).replace(/\.0$/, '');
}

/* 明细行文案:理由 + 科目/备注后缀("主动完成作业·数学"、"奖励兑换·乐高") */
function describe(e) {
  const r = reasonOf(e.reason);
  let s = r ? r.label : e.reason;
  if (e.subject) s += '·' + e.subject;
  if (e.note) s += '·' + e.note;
  return s;
}

function fmtScore(e) {
  return (e.score > 0 ? '+' : '') + e.score;
}

/* 拉取全部进度,客户端过滤出积分(module=points):成功 done(entries),失败 fail(err) */
function fetchPoints(done, fail) {
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
  LEVELS, REASONS, CONSUMES, RULES, SUBJECTS,
  CUSTOM_MAX, CONSUME_MAX, POINTS_PER_YUAN,
  reasonOf, normalize, decodeItems, sortByNew,
  totalsOf, emojiFor, yuanText, describe, fmtScore,
  fetchPoints,
};
