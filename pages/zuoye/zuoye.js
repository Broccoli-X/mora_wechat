const hw = require('../../utils/homework');
const auth = require('../../utils/auth');
const shareCard = require('./share-card');

Page({
  data: {
    weekLabel: '',
    isThisWeek: true,
    days: [],
    loading: true,
    loadError: false,
    blocked: false, // 本家庭未开通「作业」:整页不呈现内容
  },

  today: '',
  anchor: '',
  entries: [],

  onLoad() {
    this.today = hw.todayStr();
    this.anchor = this.today;
    /* 家长登录门 + 功能权限:未开通整页不呈现;未登录跳登录页,登录后 reLaunch 回来 onLoad 重跑 */
    auth.ensurePerm('homework', allowed => {
      if (!allowed) { this.setData({ blocked: true }); return; }
      this.fetch();
    });
  },

  onPullDownRefresh() {
    this.fetch(() => wx.stopPullDownRefresh());
  },

  /* 本页刻意不定义 onShareAppMessage/onShareTimeline:作业不发小程序卡片,
     分享只走页内「分享今天」按钮把当天作业长图发给微信好友。不定义则胶囊
     菜单的「转发/分享到朋友圈」置灰(提示"当前页面不可转发"),防误发一张
     只带缩略图的卡片 */

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

  /* 「分享今天」:当天作业(含图片附件)拼一张不透明白底长图发给微信好友。
     接收方不用装小程序、不用登录就能看到作业与照片(本页不发小程序卡片,
     见页面顶部注释)。只认今天:按钮长在今天卡片上,翻到别的周自然不出现 */
  shareToday() {
    if (this._sharing) return;
    const day = this.data.days.find(d => d.isToday);
    const items = day ? day.items : [];
    if (!items.length) { wx.showToast({ title: '今天没有作业', icon: 'none' }); return; }
    this._sharing = true;
    wx.showLoading({ title: '正在生成分享图…', mask: true });
    const q = wx.createSelectorQuery().in(this);
    q.select('#share-canvas').fields({ node: true });
    q.exec(res => {
      const canvas = res && res[0] && res[0].node;
      if (!canvas) { this.shareFail(); return; }
      shareCard.build(canvas, {
        dateText: hw.fmtCN(this.today) + ' · ' + hw.weekdayCN(this.today),
        items: items.map(it => ({
          icon: it.icon, color: it.color, subject: it.subject,
          text: it.text, imgs: it.imgs,
        })),
      }, path => {
        wx.hideLoading();
        this._sharing = false;
        this.sendShareImage(path);
      }, () => this.shareFail());
    });
  },

  shareFail() {
    wx.hideLoading();
    this._sharing = false;
    wx.showToast({ title: '生成失败，请重试', icon: 'none' });
  },

  /* 发长图:首选微信原生「发送给朋友」菜单(用户可在菜单里选发送/保存/收藏)。
     用户取消不算失败;真发失败(常见是图过大被微信拒收)给提示,可重试或存相册
     再发。旧版微信没有该菜单,存相册兜底 */
  sendShareImage(path) {
    if (wx.showShareImageMenu) {
      wx.showShareImageMenu({
        path: path,
        fail(r) {
          if (r && r.errMsg && r.errMsg.indexOf('cancel') >= 0) return;
          wx.showToast({ title: '没发出去，可重试或存相册再发', icon: 'none' });
        },
      });
      return;
    }
    wx.saveImageToPhotosAlbum({
      success() { wx.showToast({ title: '已存相册，发给好友吧', icon: 'none' }); },
      fail(r) {
        const denied = r && r.errMsg && r.errMsg.indexOf('auth') >= 0;
        wx.showToast({ title: denied ? '请在设置里允许保存相册' : '没保存上，请重试', icon: 'none' });
      },
    });
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
