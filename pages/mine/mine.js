const pt = require('../../utils/points');

/* 明细默认条数,更早的折叠(与网页端 points-edit 一致) */
const SHOW_N = 10;

Page({
  data: {
    ptState: 'loading', // loading | ok | error
    ptOpen: false,      // 点积分卡片展开明细与规则
    emoji: '',
    empty: true,
    earned: 0,
    remaining: 0,
    yuan: '0',
    entries: [],
    shown: [],
    folded: 0,
    allOpen: false,
    rules: pt.RULES,
  },

  onShow() {
    this.loadPoints();
  },

  onPullDownRefresh() {
    this.loadPoints(() => wx.stopPullDownRefresh());
  },

  loadPoints(done) {
    if (!this.data.entries.length) this.setData({ ptState: 'loading' });
    pt.fetchPoints(entries => {
      const t = pt.totalsOf(entries);
      const emoji = pt.emojiFor(t.earned);
      this.setData({
        ptState: 'ok',
        entries: this.decorate(entries),
        emoji: emoji,
        empty: !emoji,
        earned: t.earned,
        remaining: t.remaining,
        yuan: pt.yuanText(t.remaining),
      });
      this.renderShown();
      if (done) done();
    }, () => {
      this.setData({ ptState: 'error' });
      if (done) done();
    });
  },

  /* 明细行展示字段:文案与 ±分数(wxml 不能调函数,先算好) */
  decorate(entries) {
    return entries.map(e => ({
      id: e.id,
      date: e.date,
      desc: pt.describe(e),
      score: e.score,
      scoreText: pt.fmtScore(e),
    }));
  },

  renderShown() {
    const total = this.data.entries.length;
    const shown = this.data.allOpen ? this.data.entries : this.data.entries.slice(0, SHOW_N);
    this.setData({ shown: shown, folded: Math.max(0, total - SHOW_N) });
  },

  toggleOpen() {
    if (this.data.ptState !== 'ok') return;
    this.setData({ ptOpen: !this.data.ptOpen });
  },

  toggleAll() {
    this.setData({ allOpen: !this.data.allOpen });
    this.renderShown();
  },

  retryPoints() {
    this.loadPoints();
  },
});
