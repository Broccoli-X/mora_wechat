const pt = require('../../utils/points');
const auth = require('../../utils/auth');

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
    family: '',         // 已登录的家庭ID(登录时服务端下发)
    ptAllowed: false,   // 功能权限:未开通「积分」整块不呈现
    hwAllowed: false,   // 家长维护入口按各自权限呈现
    tdAllowed: false,
    mtAllowed: false,   // 三个维护入口一个都没有时整块隐藏
  },

  onShow() {
    /* 家长登录门:未登录跳登录页,登录后回来再取数 */
    if (!auth.ensure()) return;
    this.setData({ family: auth.getFamily() });
    this.applyPerms();
    auth.refreshPerms(ok => { if (ok) this.applyPermsIfChanged(); });
  },

  onPullDownRefresh() {
    if (!auth.ensure()) { wx.stopPullDownRefresh(); return; }
    auth.refreshPerms(() => this.applyPerms(() => wx.stopPullDownRefresh()));
  },

  /* 功能权限:积分卡片看「积分」,维护入口各自看「作业/积分/代办」 */
  applyPerms(done) {
    const ptAllowed = auth.hasPerm('points');
    const hwAllowed = auth.hasPerm('homework');
    const tdAllowed = auth.hasPerm('todo');
    this.setData({
      ptAllowed: ptAllowed,
      hwAllowed: hwAllowed,
      tdAllowed: tdAllowed,
      mtAllowed: ptAllowed || hwAllowed || tdAllowed,
    });
    if (!ptAllowed) { if (done) done(); return; }
    this.loadPoints(done);
  },

  /* 权限没变化就不重取数据 */
  applyPermsIfChanged() {
    if (this.data.ptAllowed === auth.hasPerm('points') &&
        this.data.hwAllowed === auth.hasPerm('homework') &&
        this.data.tdAllowed === auth.hasPerm('todo')) return;
    this.applyPerms();
  },

  /* ── 家长维护入口 ── */
  goHwEdit() {
    wx.navigateTo({ url: '/pages/hw-edit/hw-edit' });
  },

  goPointsEdit() {
    wx.navigateTo({ url: '/pages/points-edit/points-edit' });
  },

  goTodoEdit() {
    wx.navigateTo({ url: '/pages/todo-edit/todo-edit' });
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

  /* 退出登录:清本机会话(服务端会话尽力而为删掉),跳登录页重新进 */
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后要重新输入家长密码才能看到同步数据,确定退出吗?',
      confirmText: '退出',
      confirmColor: '#c92a2a',
      success: res => {
        if (!res.confirm) return;
        auth.logout();
        auth.gate();
      },
    });
  },
});
