/* 代办详情:按日期筛选查看某天的代办(每天恒真/单次比日期/每周几看勾选,挑选口径
   与首页同走 utils/todo.todosOn)。只读——增删改在网页端家长页与小程序「待办事项维护」。
   鉴权走 utils/auth.js 家长登录会话,未开通 todo 功能整页不呈现。 */
const td = require('../../utils/todo');
const auth = require('../../utils/auth');

Page({
  data: {
    state: 'loading',  // loading | ok | error
    blocked: false,    // 本家庭未开通「代办」:整页不呈现
    date: '',          // 当前查看日 YYYY-MM-DD
    dateLine: '',      // 「9月11日 · 星期五」
    isToday: false,
    rows: [],          // 当日代办展示视图
  },

  entries: [],

  onLoad() {
    this.setDate(td.todayStr());
    /* 家长登录门 + 功能权限:未开通整页不呈现;未登录跳登录页,登录后 reLaunch 回来重跑 */
    auth.ensurePerm('todo', allowed => {
      if (!allowed) { this.setData({ blocked: true }); return; }
      this.fetch();
    });
  },

  onPullDownRefresh() {
    this.fetch(() => wx.stopPullDownRefresh());
  },

  retry() {
    this.fetch();
  },

  fetch(done) {
    if (!this.entries.length) this.setData({ state: 'loading' });
    td.fetchTodos(entries => {
      this.entries = entries;
      this.setData({ state: 'ok' });
      this.render();
      if (done) done();
    }, () => {
      this.setData({ state: 'error' });
      if (done) done();
    });
  },

  setDate(date) {
    const d = td.parseDate(date);
    this.setData({
      date: date,
      dateLine: td.fmtCN(date) + ' · 星期' + td.WEEKDAY_CN[d.getDay()],
      isToday: date === td.todayStr(),
    });
  },

  /* 选日期(picker)与前后翻一天共用:换日只重筛本地数据,不重拉 */
  onDate(e) {
    if (!td.parseDate(e.detail.value)) return;
    this.setDate(e.detail.value);
    this.render();
  },

  shiftDay(n) {
    const d = td.parseDate(this.data.date);
    d.setDate(d.getDate() + n);
    this.setDate(td.toDateStr(d));
    this.render();
  },

  prevDay() { this.shiftDay(-1); },

  nextDay() { this.shiftDay(1); },

  render() {
    const rows = td.todosOn(this.entries, this.data.date).map(e => {
      const r = td.repeatOf(e.repeat) || { icon: '📌', main: '#5f6b7d' };
      return {
        id: e.id,
        icon: r.icon,
        color: r.main,
        time: e.time,
        text: e.text,
        tag: td.describe(e), // 每天 / 单次·9月5日 / 每周一、三、五(与网页端 describe 同源)
      };
    });
    this.setData({ rows: rows });
  },
});
