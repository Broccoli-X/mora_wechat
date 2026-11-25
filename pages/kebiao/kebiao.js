const kb = require('../../utils/kebiao');
const auth = require('../../utils/auth');

Page({
  data: {
    subLine: '',       // 「学校 · 班级」,空段不显示
    term: '',
    tabs: [],          // 星期页签,来自当前课表(星期一 → 周一)
    selected: 0,
    isRest: false,
    rows: [],
    blocked: false, // 本家庭未开通「课表」:整页不呈现内容
  },

  onShow() {
    /* 家长登录门 + 功能权限:未开通整页不呈现,登录/权限就绪后才初始化。
       课表来自网页端维护的在线课表:先按本机缓存 / 默认课表渲染,再拉服务端,有更新就重绘 */
    auth.ensurePerm('kebiao', allowed => {
      if (!allowed) { this.setData({ blocked: true }); return; }
      this.setData({ blocked: false });
      this.render(kb.current(), false);
      kb.refresh(() => this.render(kb.current(), true));
    });
  },

  onPullDownRefresh() {
    kb.refresh(() => {
      if (!this.data.blocked) this.render(kb.current(), true);
      wx.stopPullDownRefresh();
    });
  },

  selectDay(e) {
    const selected = Number(e.currentTarget.dataset.index);
    if (selected === this.data.selected) return;
    this.setData({ selected });
    this.renderRows(selected, kb.current());
  },

  /* 整页按课表文档渲染。keep = true 尽量保持已选中的星期(刷新重绘时用);
     false 回到今天(每次进页面时用) */
  render(doc, keep) {
    const todayIdx = kb.todayIdxOf(new Date());
    const prev = this.data.selected;
    const selected = keep && prev < doc.days.length ? prev : (todayIdx >= 0 ? todayIdx : 0);
    this.setData({
      subLine: [doc.school, doc.cls].filter(Boolean).join(' · '),
      term: doc.term,
      tabs: doc.days.map(d => d.replace('星期', '周')),
      isRest: todayIdx < 0,
      selected: selected,
    });
    this.renderRows(selected, doc);
  },

  renderRows(dayIdx, doc) {
    const now = new Date();
    const nowPeriod = kb.periodAtNow(now);
    const todayIdx = kb.todayIdxOf(now);
    const rows = doc.periods.map((p, i) => {
      const cell = doc.grid[i][dayIdx];
      const meta = kb.metaOf(cell[0]);
      return {
        idx: i,                   // 列表 key:节次名称可能重复,不能当 key
        label: p.label || ('第' + (i + 1) + '节'),
        time: p.time,
        empty: !cell[0],          // 空堂
        subject: cell[0],
        icon: meta.icon,
        color: meta.main,
        teacher: cell[1],
        note: cell[2],
        isNow: dayIdx === todayIdx && i === nowPeriod,
      };
    });
    this.setData({ rows: rows });
  },
});
