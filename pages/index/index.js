const kb = require('../../utils/kebiao');
const hw = require('../../utils/homework');

Page({
  data: {
    title: 'Mora 学习卡片',
    subtitle: '碎片时间 · 高效记忆',
    kbSub: '',
    kbLine: '',
    hwSub: '',
    hwLine: '作业加载中…',
  },

  onShow() {
    this.renderKebiaCard();
    this.renderHwDate();
    this.loadHomework();
  },

  /* 课程表卡片:今天星期几 + 当前/下一节课 */
  renderKebiaCard() {
    const now = new Date();
    const todayIdx = kb.todayIdxOf(now);
    if (todayIdx < 0) {
      this.setData({ kbSub: '周末', kbLine: '今天不上课，周一见 🎉' });
      return;
    }
    const pos = kb.currentOrNextLesson(now);
    let line;
    if (pos) {
      const p = kb.KEBIAO.periods[pos.index];
      const subject = kb.KEBIAO.grid[pos.index][todayIdx][0];
      line = (pos.state === 'now' ? '正在进行：' : '下一节：') + p.label + ' ' + subject;
    } else {
      line = '今日课程已结束';
    }
    this.setData({
      kbSub: kb.KEBIAO.days[todayIdx] + ' · 共 ' + kb.KEBIAO.periods.length + ' 节课',
      kbLine: line,
    });
  },

  renderHwDate() {
    const d = new Date();
    this.setData({
      hwSub: (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + hw.WEEKDAY_CN[d.getDay()],
    });
  },

  loadHomework() {
    this.setData({ hwLine: '作业加载中…' });
    hw.fetchHomework(entries => {
      const today = hw.todayStr();
      const n = entries.filter(e => e.date === today).length;
      this.setData({ hwLine: n ? '今日作业 ' + n + ' 项' : '今日暂无作业 🎈' });
    }, () => {
      this.setData({ hwLine: '同步失败，进入查看详情' });
    });
  },

  goKebiao() {
    wx.navigateTo({ url: '/pages/kebiao/kebiao' });
  },

  goZuoye() {
    wx.navigateTo({ url: '/pages/zuoye/zuoye' });
  },
});
