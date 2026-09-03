const kb = require('../../utils/kebiao');
const hw = require('../../utils/homework');
const pt = require('../../utils/points');

Page({
  data: {
    title: 'Mora 学习卡片',
    subtitle: '碎片时间 · 高效记忆',
    dateLine: '',
    course: { show: false },
    hwState: 'loading', // loading | ok | error
    hwItems: [],
    ptState: 'loading', // loading | ok | error
    ptEmoji: '',
    ptEmpty: true,
    ptEarned: 0,
    ptRemaining: 0,
    ptYuan: '0',
  },

  onShow() {
    this.renderDate();
    this.renderCourse();
    this.loadHomework();
    this.loadPoints();
  },

  onPullDownRefresh() {
    this.renderDate();
    this.renderCourse();
    let pending = 2;
    const done = () => { if (--pending === 0) wx.stopPullDownRefresh(); };
    this.loadHomework(done);
    this.loadPoints(done);
  },

  renderDate() {
    const d = new Date();
    this.setData({
      dateLine: (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + hw.WEEKDAY_CN[d.getDay()],
    });
  },

  /* 课程模块:单条展示,判定逻辑在 utils(当前节 → 下一节 → 次日 → 隐藏) */
  renderCourse() {
    this.setData({ course: kb.homeLesson(new Date()) });
  },

  loadHomework(done) {
    this.setData({ hwState: 'loading' });
    hw.fetchHomework(entries => {
      const today = hw.todayStr();
      const items = entries.filter(e => e.date === today).map(e => {
        const m = hw.metaOf(e.subject);
        return {
          id: e.id,
          icon: m.icon,
          color: m.main,
          subject: e.subject,
          text: e.text,
          pics: e.imgs.length,
        };
      });
      this.setData({ hwState: 'ok', hwItems: items });
      if (done) done();
    }, () => {
      this.setData({ hwState: 'error' });
      if (done) done();
    });
  },

  retryHw() {
    this.loadHomework();
  },

  /* 积分总览:emoji 只看累计(兑换不掉),剩余积分折算零钱;明细与规则在「我的」tab */
  loadPoints(done) {
    this.setData({ ptState: 'loading' });
    pt.fetchPoints(entries => {
      const t = pt.totalsOf(entries);
      const emoji = pt.emojiFor(t.earned);
      this.setData({
        ptState: 'ok',
        ptEmoji: emoji,
        ptEmpty: !emoji,
        ptEarned: t.earned,
        ptRemaining: t.remaining,
        ptYuan: pt.yuanText(t.remaining),
      });
      if (done) done();
    }, () => {
      this.setData({ ptState: 'error' });
      if (done) done();
    });
  },

  retryPoints() {
    this.loadPoints();
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  goKebiao() {
    wx.navigateTo({ url: '/pages/kebiao/kebiao' });
  },

  goZuoye() {
    wx.navigateTo({ url: '/pages/zuoye/zuoye' });
  },
});
