/* 课表数据与工具:mora 网页端 lib/kebiao-data.js 的同步副本。
   换学期时两处一起改:grid 七行五列,每格 = [科目, 老师, 备注](老师和备注可空);
   新科目没有匹配色时走灰色兜底,不会报错。 */
const KEBIAO = {
  school: '苏州市吴中区尹山湖实验小学',
  cls: '一（7）班',
  term: '2026至2027学年度第一学期',
  days: ['星期一', '星期二', '星期三', '星期四', '星期五'],
  periods: [
    { label: '第1节', half: '上午', time: '8:35~9:15' },
    { label: '第2节', half: '上午', time: '9:45~10:25' },
    { label: '第3节', half: '上午', time: '10:40~11:20' },
    { label: '第4节', half: '下午', time: '13:00~13:40' },
    { label: '第5节', half: '下午', time: '13:55~14:35' },
    { label: '第6节', half: '下午', time: '15:05~15:45' },
    { label: '延时', half: '下午', time: '15:55~16:55' },
  ],
  grid: [
    [['英语', '李微兰', ''], ['语文', '顾晓芳', ''], ['语文', '顾晓芳', ''], ['数学', '罗晓宇', ''], ['语文', '顾晓芳', '']],
    [['语文', '顾晓芳', ''], ['数学', '罗晓宇', ''], ['数学', '罗晓宇', ''], ['英语', '李微兰', ''], ['音乐', '顾晓芳', '']],
    [['语文', '顾晓芳', ''], ['科学', '李微兰', ''], ['体育与健康', '王雪芳', ''], ['语文', '顾晓芳', ''], ['数学', '罗晓宇', '']],
    [['音乐', '张钰杰', ''], ['综合', '李微兰', ''], ['道德与法治', '顾晓芳', ''], ['体育与健康', '王雪芳', ''], ['体育1', '罗晓宇', '']],
    [['美术', '黄小兰', ''], ['道德与法治', '顾晓芳', ''], ['劳动', '顾晓芳', ''], ['美术', '黄小兰', ''], ['书法', '顾晓芳', '']],
    [['体育1', '罗晓宇', ''], ['延时1', '', '体活'], ['延时1', '', ''], ['延时1', '', ''], ['延时1', '', '']],
    [['延时', '', ''], ['延时2', '', ''], ['延时2', '', ''], ['延时2', '', ''], ['延时2', '', '']],
  ],
};

/* 科目 → 图标 + 配色(main 深色用于色块,与网页端一致) */
const KEBIAO_META = {
  '语文': { icon: '📖', main: '#c9392b', soft: '#fdecea' },
  '数学': { icon: '🔢', main: '#1d5fbf', soft: '#e7f0fb' },
  '英语': { icon: '🔤', main: '#177a3e', soft: '#e7f6ec' },
  '音乐': { icon: '🎵', main: '#7b2d8b', soft: '#f5eaf8' },
  '美术': { icon: '🎨', main: '#c2185b', soft: '#fce7f1' },
  '体育1': { icon: '⚽', main: '#c05621', soft: '#fdf0e5' },
  '体育与健康': { icon: '⚽', main: '#c05621', soft: '#fdf0e5' },
  '科学': { icon: '🔬', main: '#0c7d84', soft: '#e4f4f5' },
  '综合': { icon: '🧩', main: '#4353b8', soft: '#eaedf9' },
  '道德与法治': { icon: '🌍', main: '#8a5a2b', soft: '#f7efe3' },
  '劳动': { icon: '🧺', main: '#5c7f29', soft: '#f0f5e3' },
  '书法': { icon: '🖌️', main: '#3f4756', soft: '#ededf2' },
  '延时1': { icon: '🌙', main: '#5f6b7d', soft: '#eef1f4' },
  '延时2': { icon: '🌙', main: '#5f6b7d', soft: '#eef1f4' },
  '延时': { icon: '🌙', main: '#5f6b7d', soft: '#eef1f4' },
};

function metaOf(subject) {
  return KEBIAO_META[subject] || { icon: '📌', main: '#5f6b7d', soft: '#eef1f4' };
}

/* 周一~周五为 0~4,周末返回 -1(与网页端一致) */
function todayIdxOf(d) {
  const w = d.getDay();
  return w >= 1 && w <= 5 ? w - 1 : -1;
}

function toMin(s) {
  const p = s.split(':');
  return Number(p[0]) * 60 + Number(p[1]);
}

/* 当前时刻落在哪节课;周末和课间返回 -1 */
function periodAtNow(d) {
  if (todayIdxOf(d) < 0) return -1;
  const m = d.getHours() * 60 + d.getMinutes();
  return KEBIAO.periods.findIndex(p => {
    const t = p.time.split('~');
    return m >= toMin(t[0]) && m < toMin(t[1]);
  });
}

/* 当前(正在上)或下一节还没结束的课,返回 {index, state: 'now'|'next'};周末/放学后为 null */
function currentOrNextLesson(d) {
  if (todayIdxOf(d) < 0) return null;
  const now = periodAtNow(d);
  if (now >= 0) return { index: now, state: 'now' };
  const m = d.getHours() * 60 + d.getMinutes();
  const next = KEBIAO.periods.findIndex(p => m < toMin(p.time.split('~')[1]));
  return next >= 0 ? { index: next, state: 'next' } : null;
}

module.exports = { KEBIAO, KEBIAO_META, metaOf, todayIdxOf, periodAtNow, currentOrNextLesson };
