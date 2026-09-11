const pl = require('../../utils/people');
const auth = require('../../utils/auth');

Page({
  data: {
    total: 0,
    masteredCount: 0,
    items: [],
    learnedOnly: false, // 点「已掌握」胶囊只看已掌握的人物,再点恢复全部(与字母卡一致)
    blocked: false,     // 本家庭未开通「英语单词」:整页不呈现内容
    /* 弹出大卡:点人物卡片弹出,点卡片翻面(只显示英文和中文),左右滑动换人物 */
    popup: false,
    cur: 0,             // 当前人物在全列表的下标
    item: null,         // 当前人物视图 {n, zh, emoji, color, mastered}
    flipped: false,     // true = 已翻面(英文+中文面)
    dir: 'r',           // 换人方向:'l'=往左滑(新卡右侧入) / 'r'=镜像
    seq: 0,             // 换人序号:奇偶交替类名强制重放入场动画
  },

  onShow() {
    /* 家长登录门 + words 功能权限(与网页端单词卡同一功能键) */
    auth.ensurePerm('words', allowed => {
      if (!allowed) { this.setData({ blocked: true }); return; }
      this.setData({ blocked: false });
      this.render();
      /* 拉取远端掌握进度合并(与网页端单词模块共享键空间,离线时用本地原样) */
      pl.syncMastered(() => this.render());
    });
  },

  render() {
    const map = pl.loadMastered();
    const items = pl.views(map);
    const patch = {
      total: pl.countAll(),
      masteredCount: pl.countMastered(map),
      items: this.data.learnedOnly ? items.filter(it => it.mastered) : items,
    };
    /* 弹出中的大卡同步刷新,掌握标记实时反映 */
    if (this.data.popup && items[this.data.cur]) patch.item = items[this.data.cur];
    this.setData(patch);
  },

  onToggleLearnedOnly() {
    this.setData({ learnedOnly: !this.data.learnedOnly });
    this.render();
  },

  /* 点 ☆/⭐ 标记掌握:本地先落盘,再异步上报服务端(多端共享) */
  onToggleStar(e) {
    const n = e.currentTarget.dataset.n;
    if (!n) return;
    pl.markMastered(n, !pl.loadMastered()[n]);
    this.render();
  },

  /* 点卡片弹出大卡,从该人物开始(正面人物头像,猜名字) */
  onTapCard(e) {
    const i = e.currentTarget.dataset.i;
    if (i == null) return;
    this.setData({
      popup: true,
      cur: i,
      item: pl.views(pl.loadMastered())[i],
      flipped: false,
    });
  },

  /* 弹层手势:点图片翻面;左右横滑(≥40px 且横向为主)切换上一个/下一个小朋友。
     手势绑在整个弹层上,滑动起点不限于卡片,更好触发;翻面只对图片生效,
     ✕/⭐ 按钮仍走各自 catchtap,互不干扰 */
  onTouchStart(e) {
    const t = e.touches && e.touches[0];
    if (!t) return;
    this._sx = t.clientX;
    this._sy = t.clientY;
    const ds = e.target && e.target.dataset ? e.target.dataset : {};
    this._onCard = !!ds.flip; // 按下起点是否在人物图片卡上
  },

  onTouchEnd(e) {
    const t = e.changedTouches && e.changedTouches[0];
    if (!t || !this.data.popup || this._sx == null) return;
    const dx = t.clientX - this._sx;
    const dy = t.clientY - this._sy;
    const onCard = this._onCard;
    this._sx = null;
    this._onCard = false;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) {
      this.step(dx < 0 ? 1 : -1); // 左滑下一个,右滑上一个
    } else if (onCard && Math.abs(dx) < 40 && Math.abs(dy) < 40) {
      this.setData({ flipped: !this.data.flipped }); // 点图片:翻面
    }
  },

  onTouchCancel() {
    this._sx = null;
    this._onCard = false;
  },

  /* 换人物(循环),回到正面并带方向感的入场动画 + 轻触感 */
  step(d) {
    const n = pl.countAll();
    const cur = (this.data.cur + d + n) % n;
    try { wx.vibrateShort({ type: 'light', fail: () => {} }); } catch (e) { /* 老机型无此 API */ }
    this.setData({
      dir: d > 0 ? 'l' : 'r',
      cur,
      item: pl.views(pl.loadMastered())[cur],
      flipped: false,
      seq: this.data.seq + 1,
    });
  },

  /* 弹出层里的掌握钮 */
  onToggleStarPopup() {
    const it = this.data.item;
    if (!it) return;
    pl.markMastered(it.n, !pl.loadMastered()[it.n]);
    this.render();
  },

  /* 头像图加载失败(未部署/离线):该人物就地换成 emoji 兜底,不白屏 */
  onImgError(e) {
    const i = e.currentTarget.dataset.i;
    if (i == null) return;
    const patch = { items: this.data.items.map(it => (it.i === i ? { ...it, failed: true } : it)) };
    if (this.data.popup && this.data.item && this.data.item.i === i) {
      patch.item = { ...this.data.item, failed: true };
    }
    this.setData(patch);
  },

  onClosePopup() {
    this.setData({ popup: false });
  },

  /* 挡住点按冒泡(点卡片不关弹层)与背景滚动穿透 */
  noop() {},
});
