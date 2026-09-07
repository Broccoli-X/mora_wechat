const hw = require('../../utils/homework');

Page({
  data: {
    weekLabel: '',
    isThisWeek: true,
    days: [],
    loading: true,
    loadError: false,
  },

  today: '',
  anchor: '',
  entries: [],

  onLoad() {
    this.today = hw.todayStr();
    this.anchor = this.today;
    this.fetch();
  },

  onPullDownRefresh() {
    this.fetch(() => wx.stopPullDownRefresh());
  },

  retry() {
    this.fetch();
  },

  fetch(done) {
    this.setData({ loading: true, loadError: false });
    hw.fetchHomework(entries => {
      this.entries = entries;
      this.setData({ loading: false });
      this.render();
      if (done) done();
    }, () => {
      this.setData({ loading: false, loadError: true });
      if (done) done();
    });
  },

  shiftWeek(e) {
    const n = Number(e.currentTarget.dataset.n);
    const d = hw.parseDate(this.anchor);
    d.setDate(d.getDate() + n * 7);
    this.anchor = hw.toDateStr(d);
    this.render();
  },

  backToThis() {
    this.anchor = this.today;
    this.render();
  },

  /* 点缩略图:微信原生大图预览,可在同条目图片间左右滑动 */
  previewImage(e) {
    const urls = e.currentTarget.dataset.urls || [];
    const current = urls[Number(e.currentTarget.dataset.pi)] || urls[0];
    if (urls.length) wx.previewImage({ current, urls });
  },

  render() {
    const days = hw.weekOf(this.anchor);
    const isThisWeek = days.indexOf(this.today) >= 0;
    this.setData({
      weekLabel: hw.fmtCN(days[0]) + ' ~ ' + hw.fmtCN(days[6]),
      isThisWeek: isThisWeek,
      days: days.map(day => {
        const list = this.entries.filter(e => e.date === day);
        return {
          date: day,
          wd: hw.weekdayCN(day),
          dt: hw.fmtCN(day),
          isToday: day === this.today,
          items: list.map(e => {
            const m = hw.metaOf(e.subject);
            return {
              id: e.id,
              icon: m.icon,
              color: m.main,
              subject: e.subject,
              text: e.text,
              imgs: e.imgs.map(hw.imgUrl),
            };
          }),
        };
      }),
    }, () => {
      /* 本周视图保证今天的作业在第一屏:进页/下拉刷新/回到本周都对齐到今天 */
      if (isThisWeek) this.scrollToToday();
    });
  },

  /* 把「今天」卡片滚到页面顶部(留一点空隙);缩略图有固定占位,测量一次即准 */
  scrollToToday() {
    const q = wx.createSelectorQuery();
    q.select('.day-today').boundingClientRect();
    q.selectViewport().scrollOffset();
    q.exec(res => {
      const rect = res && res[0];
      const vp = res && res[1];
      if (!rect || !vp) return;
      wx.pageScrollTo({ scrollTop: Math.max(0, vp.scrollTop + rect.top - 12), duration: 0 });
    });
  },
});
