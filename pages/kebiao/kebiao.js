const kb = require('../../utils/kebiao');

/* 页签用短名:星期一 → 周一 */
const TABS = kb.KEBIAO.days.map(d => d.replace('星期', '周'));

Page({
  data: {
    school: kb.KEBIAO.school,
    cls: kb.KEBIAO.cls,
    term: kb.KEBIAO.term,
    tabs: TABS,
    selected: 0,
    isRest: false,
    rows: [],
  },

  onLoad() {
    const todayIdx = kb.todayIdxOf(new Date());
    this.setData({
      isRest: todayIdx < 0,
      selected: todayIdx >= 0 ? todayIdx : 0,
    });
    this.renderRows(this.data.selected);
  },

  selectDay(e) {
    const selected = Number(e.currentTarget.dataset.index);
    if (selected === this.data.selected) return;
    this.setData({ selected });
    this.renderRows(selected);
  },

  renderRows(dayIdx) {
    const now = new Date();
    const nowPeriod = kb.periodAtNow(now);
    const todayIdx = kb.todayIdxOf(now);
    const rows = kb.KEBIAO.periods.map((p, i) => {
      const cell = kb.KEBIAO.grid[i][dayIdx];
      const meta = kb.metaOf(cell[0]);
      return {
        label: p.label,
        time: p.time,
        subject: cell[0],
        icon: meta.icon,
        color: meta.main,
        teacher: cell[1],
        note: cell[2],
        isNow: dayIdx === todayIdx && i === nowPeriod,
      };
    });
    this.setData({ rows });
  },
});
