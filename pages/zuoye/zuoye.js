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

  render() {
    const days = hw.weekOf(this.anchor);
    this.setData({
      weekLabel: hw.fmtCN(days[0]) + ' ~ ' + hw.fmtCN(days[6]),
      isThisWeek: days.indexOf(this.today) >= 0,
      days: days.map(day => {
        const list = this.entries.filter(e => e.date === day);
        return {
          date: day,
          wd: hw.weekdayCN(day),
          dt: hw.fmtCN(day),
          isToday: day === this.today,
          items: list.map(e => {
            const m = hw.metaOf(e.subject);
            return { id: e.id, icon: m.icon, color: m.main, subject: e.subject, text: e.text };
          }),
        };
      }),
    });
  },
});
