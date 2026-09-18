const kn = require('../../utils/knowledge');
const auth = require('../../utils/auth');

Page({
  data: {
    loading: true,
    loadError: false,   // 拉取失败且本机没有缓存
    empty: false,       // 服务端确认这一册还没有内容(与「失败」分开文案)
    title: '',
    unitCount: 0,
    units: [],          // kn.unitList:单元名 + 板块/块计数 + 轮换配色
  },

  g: '',
  s: '',
  v: '',
  book: null,         // 整本数据,点单元时交接给禅模式

  onLoad(options) {
    if (!auth.ensure()) return;
    this.g = decodeURIComponent(options.grade || '');
    this.s = decodeURIComponent(options.subject || '');
    this.v = decodeURIComponent(options.volume || '');
    this.fetch();
  },

  onPullDownRefresh() {
    this.fetch(() => wx.stopPullDownRefresh());
  },

  retry() {
    this.fetch();
  },

  /* 本机缓存先渲染(离线也能看已拉过的教材),再拉服务端刷新 */
  fetch(done) {
    const cached = kn.loadBook(this.g, this.s, this.v);
    if (cached) {
      this.render(cached);
      this.setData({ loading: false, loadError: false, empty: false });
    } else {
      this.setData({ loading: true, loadError: false, empty: false });
    }
    kn.fetchBook(this.g, this.s, this.v, (book, err) => {
      if (book) this.render(book);
      else if (!cached) this.setData({ loadError: err !== 'empty', empty: err === 'empty' });
      this.setData({ loading: false });
      if (done) done();
    });
  },

  render(book) {
    this.book = book;
    this.setData({
      title: book.data.title || (book.grade + book.volume + book.subject),
      unitCount: book.data.units.length,
      units: kn.unitList(book),
    });
  },

  /* 点单元卡:交接整本给禅模式(免一次拉取),深链/重启回落本机缓存/远端 */
  onTapUnit(e) {
    if (!this.book) return;
    const i = Number(e.currentTarget.dataset.i) || 0;
    kn.setCurrent(this.book);
    wx.navigateTo({
      url: '/pages/knowledge/zen?grade=' + encodeURIComponent(this.g) +
        '&subject=' + encodeURIComponent(this.s) +
        '&volume=' + encodeURIComponent(this.v) +
        '&u=' + i,
    });
  },
});
