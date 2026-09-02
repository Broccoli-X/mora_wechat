const kb = require('../../utils/kebiao');
const hw = require('../../utils/homework');

Page({
  data: {
    title: 'Mora 学习卡片',
    subtitle: '碎片时间 · 高效记忆',
    dateLine: '',
    course: { show: false },
    hwState: 'loading', // loading | ok | error
    hwItems: [],
  },

  onShow() {
    this.renderDate();
    this.renderCourse();
    this.loadHomework();
  },

  onPullDownRefresh() {
    this.renderDate();
    this.renderCourse();
    this.loadHomework(() => wx.stopPullDownRefresh());
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

  goKebiao() {
    wx.navigateTo({ url: '/pages/kebiao/kebiao' });
  },

  goZuoye() {
    wx.navigateTo({ url: '/pages/zuoye/zuoye' });
  },
});
