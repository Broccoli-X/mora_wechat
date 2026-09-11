const pm = require('../../utils/poems');
const auth = require('../../utils/auth');

Page({
  data: {
    total: 0,
    masteredCount: 0,
    sections: [],       // 分类分节(一年级上/下册、拓展,与网页端节头一致)
    learnedOnly: false, // 点「已掌握」胶囊只看已掌握的古诗,再点恢复全部(与网页端一致)
    pyHidden: false,    // 「隐藏拼音」自测:只隐拼音文字,保留占位(与网页端 body.no-py 一致)
    blocked: false,     // 本家庭未开通「古诗卡片」:整页不呈现内容
  },

  onShow() {
    /* 家长登录门 + poems 功能权限(与网页端 poems.html 同一功能键) */
    auth.ensurePerm('poems', allowed => {
      if (!allowed) { this.setData({ blocked: true }); return; }
      this.setData({ blocked: false });
      this.render();
      /* 内容库:缓存/种子先渲染,服务端诗库(网页端古诗录入维护)有更新再重渲染;
         掌握进度拉远端合并(与网页端共享,离线时用本地原样) */
      pm.refreshContent(() => this.render());
      pm.syncMastered(() => this.render());
    });
  },

  render() {
    const map = pm.loadMastered();
    const items = pm.views(map);
    let sections = pm.sections(items);
    if (this.data.learnedOnly) {
      sections = sections
        .map(s => ({ ...s, items: s.items.filter(it => it.mastered) }))
        .filter(s => s.items.length);
    }
    this.setData({
      total: pm.countAll(),
      masteredCount: pm.countMastered(map),
      sections,
    });
  },

  onToggleLearnedOnly() {
    this.setData({ learnedOnly: !this.data.learnedOnly });
    this.render();
  },

  /* 遮住拼音自测:只隐拼音文字,保留占位不影响排版 */
  onTogglePy() {
    this.setData({ pyHidden: !this.data.pyHidden });
  },

  /* 点 ☆/⭐ 标记掌握:本地先落盘,再异步上报服务端(多端共享) */
  onToggleStar(e) {
    const k = e.currentTarget.dataset.key;
    if (!k) return;
    pm.markMastered(k, !pm.loadMastered()[k]);
    this.render();
  },

  /* 点卡片进 zen 专注模式,从该首开始(i 为全库序,与 zen 共用一套下标) */
  onTapCard(e) {
    const i = e.currentTarget.dataset.i;
    if (i == null) return;
    wx.navigateTo({ url: '/pages/poems/zen?i=' + i });
  },
});
