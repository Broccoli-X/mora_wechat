const hw = require('../../utils/homework');
const auth = require('../../utils/auth');

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
    /* 家长登录门:未登录跳登录页,登录后 reLaunch 回来 onLoad 重跑 */
    if (!auth.ensure()) return;
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

  /* 勾选/取消完成:先乐观更新本地条目与视图,上报失败回滚并提示(下次刷新以服务端为准);
     定向 setData 只改该条,不整页重渲染(避免把滚动位置拉回今天) */
  toggleHw(e) {
    const di = Number(e.currentTarget.dataset.di);
    const ii = Number(e.currentTarget.dataset.ii);
    const day = this.data.days[di];
    const item = day && day.items ? day.items[ii] : null;
    if (!item) return;
    const entry = this.entries.find(x => x.id === item.id);
    if (!entry) return;
    const prevDone = entry.done;
    const prevUpdatedAt = entry.updatedAt;
    const done = hw.toggleDone(entry, () => {
      entry.done = prevDone;
      entry.updatedAt = prevUpdatedAt;
      this.setData({ ['days[' + di + '].items[' + ii + '].done']: !!prevDone });
      wx.showToast({ title: '没同步上，检查下网络', icon: 'none' });
    });
    if (done === null) return;
    this.setData({ ['days[' + di + '].items[' + ii + '].done']: !!done });
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
              done: !!e.done,
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
