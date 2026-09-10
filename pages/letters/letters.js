const lt = require('../../utils/letters');
const auth = require('../../utils/auth');

Page({
  data: {
    total: 0,
    masteredCount: 0,
    items: [],
    learnedOnly: false, // 点「已掌握」胶囊只看已掌握的字母,再点恢复全部(与网页端一致)
    blocked: false,     // 本家庭未开通「自然拼读/字母卡」:整页不呈现内容
  },

  onShow() {
    /* 家长登录门 + phonics 功能权限(与网页端 phonics-cards.html 同一功能键) */
    auth.ensurePerm('phonics', allowed => {
      if (!allowed) { this.setData({ blocked: true }); return; }
      this.setData({ blocked: false });
      this.render();
      /* 拉取远端掌握进度合并(与网页端共享,离线时用本地原样) */
      lt.syncMastered(() => this.render());
    });
  },

  render() {
    const map = lt.loadMastered();
    const items = lt.views(map);
    this.setData({
      total: lt.countAll(),
      masteredCount: lt.countMastered(map),
      items: this.data.learnedOnly ? items.filter(it => it.mastered) : items,
    });
  },

  onToggleLearnedOnly() {
    this.setData({ learnedOnly: !this.data.learnedOnly });
    this.render();
  },

  /* 点 ☆/⭐ 标记掌握:本地先落盘,再异步上报服务端(多端共享) */
  onToggleStar(e) {
    const l = e.currentTarget.dataset.l;
    if (!l) return;
    lt.markMastered(l, !lt.loadMastered()[l]);
    this.render();
  },

  /* 点卡片进 zen 专注模式,从该字母开始 */
  onTapCard(e) {
    const i = e.currentTarget.dataset.i;
    if (i == null) return;
    wx.navigateTo({ url: '/pages/letters/zen?i=' + i });
  },
});
