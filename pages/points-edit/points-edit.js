const pt = require('../../utils/points');
const auth = require('../../utils/auth');

/* 发放/消耗理由的 picker 文案:固定分值的带上分数,自定义的提示手填(与网页端下拉同款) */
function reasonLabel(r) {
  return r.label + (r.custom ? '(手填 1~' + pt.CUSTOM_MAX + ' 分)' : '(+' + r.score + ' 分)');
}

Page({
  data: {
    state: 'loading',   // loading | ok | error
    blocked: false,     // 本家庭未开通「积分」:整页不呈现
    verified: false,    // 家长算术门:进页验证一次,过后发放/兑换不再重复验
    gateText: '',
    gateInput: '',
    /* 总览(与网页端 sum 卡同口径) */
    emoji: '',
    empty: true,
    earned: 0,
    remaining: 0,
    yuan: '0',
    /* 发放表单 */
    today: '',
    awardDate: '',
    awardReasons: pt.REASONS,
    awardLabels: pt.REASONS.map(reasonLabel),
    awardReasonIndex: 0,
    subjects: pt.SUBJECTS,
    subject: pt.SUBJECTS[0],
    showSubject: !!pt.REASONS[0].subject,
    showCustom: !!pt.REASONS[0].custom,
    customScore: '',
    note: '',
    /* 消耗表单 */
    consumeDate: '',
    consumeReasons: pt.CONSUMES,
    consumeLabels: pt.CONSUMES.map(c => c.label),
    consumeReasonIndex: 0,
    consumeScore: '',
    consumeNote: '',
    consumeHint: '',
    rules: pt.RULES,
    submitting: false,
  },

  /* 服务端拉回的积分记录缓存:发放/兑换后本地重算总览,下次进页以服务端为准 */
  entries: [],
  gate: null,

  onLoad() {
    const today = pt.todayStr();
    this.newGate();
    this.setData({ today: today, awardDate: today, consumeDate: today });
    /* 家长登录门 + 功能权限:未开通整页不呈现;未登录跳登录页,登录后 reLaunch 回来重跑 */
    auth.ensurePerm('points', allowed => {
      if (!allowed) { this.setData({ blocked: true }); return; }
      this.fetch();
    });
  },

  onPullDownRefresh() {
    this.fetch(() => wx.stopPullDownRefresh());
  },

  retry() {
    this.fetch();
  },

  fetch(done) {
    if (!this.entries.length) this.setData({ state: 'loading' });
    pt.fetchPoints(entries => {
      this.entries = entries;
      this.setData({ state: 'ok' });
      this.renderSummary();
      if (done) done();
    }, () => {
      this.setData({ state: 'error' });
      if (done) done();
    });
  },

  renderSummary() {
    const t = pt.totalsOf(this.entries);
    const emoji = pt.emojiFor(t.earned);
    this.setData({
      emoji: emoji,
      empty: !emoji,
      earned: t.earned,
      remaining: t.remaining,
      yuan: pt.yuanText(t.remaining),
      consumeHint: '剩余 ' + t.remaining + ' 分,10 积分 = 1 元',
    });
  },

  /* ── 家长算术门(与网页端同源:三位数加减两位数) ── */
  newGate() {
    this.gate = pt.mathChallenge();
    this.setData({ gateText: pt.challengeText(this.gate), gateInput: '' });
  },

  onGateInput(e) {
    this.setData({ gateInput: e.detail.value });
  },

  refreshGate() {
    this.newGate();
  },

  submitGate() {
    if (pt.checkAnswer(this.gate, this.data.gateInput)) {
      this.setData({ verified: true });
      return;
    }
    wx.showToast({ title: '没算对,再算一次哦', icon: 'none' });
    this.newGate();
  },

  cancelGate() {
    wx.navigateBack({ fail() { wx.reLaunch({ url: '/pages/mine/mine' }); } });
  },

  /* ── 发放表单 ── */
  onAwardDate(e) {
    this.setData({ awardDate: e.detail.value });
  },

  onAwardReason(e) {
    const r = this.data.awardReasons[Number(e.detail.value)] || {};
    this.setData({
      awardReasonIndex: Number(e.detail.value),
      showSubject: !!r.subject,
      showCustom: !!r.custom,
    });
  },

  pickSubject(e) {
    this.setData({ subject: e.currentTarget.dataset.s });
  },

  onCustomScore(e) {
    this.setData({ customScore: e.detail.value });
  },

  onNote(e) {
    this.setData({ note: e.detail.value });
  },

  /* 防连点:提交后短暂锁定(上报本身是异步单条,无需等待结果) */
  lockBriefly() {
    this.setData({ submitting: true });
    setTimeout(() => this.setData({ submitting: false }), 600);
  },

  submitAward() {
    if (this.data.submitting) return;
    const r = this.data.awardReasons[this.data.awardReasonIndex] || {};
    let score = r.score;
    if (r.custom) {
      score = Math.round(Number(this.data.customScore));
      if (!(score >= 1) || score > pt.CUSTOM_MAX) {
        wx.showToast({ title: '自定义奖励要填 1~' + pt.CUSTOM_MAX + ' 的整数哦', icon: 'none' });
        return;
      }
    }
    const entry = pt.normalize({
      id: pt.newId(),
      date: this.data.awardDate,
      reason: r.key,
      subject: r.subject ? this.data.subject : '',
      score: score,
      note: r.custom ? this.data.note : '',
      updatedAt: Date.now(),
    });
    if (!entry) {
      wx.showToast({ title: '日期没选好,检查一下哦', icon: 'none' });
      return;
    }
    /* 乐观更新总览再上报,失败提示(下次进页以服务端为准);明细不在本页呈现 */
    this.entries = pt.sortByNew([entry, ...this.entries]);
    this.renderSummary();
    pt.pushEntry(entry, () => wx.showToast({ title: '没同步上,检查下网络', icon: 'none' }));
    this.setData({ customScore: '', note: '' });
    this.lockBriefly();
    wx.showToast({ title: '已发放 +' + entry.score + ' 分', icon: 'success' });
  },

  /* ── 消耗表单 ── */
  onConsumeDate(e) {
    this.setData({ consumeDate: e.detail.value });
  },

  onConsumeReason(e) {
    this.setData({ consumeReasonIndex: Number(e.detail.value) });
  },

  onConsumeScore(e) {
    this.setData({ consumeScore: e.detail.value });
  },

  onConsumeNote(e) {
    this.setData({ consumeNote: e.detail.value });
  },

  submitConsume() {
    if (this.data.submitting) return;
    const cr = this.data.consumeReasons[this.data.consumeReasonIndex] || {};
    const note = this.data.consumeNote;
    if (cr.custom && !note.trim()) {
      wx.showToast({ title: '自定义消耗要填一下理由哦', icon: 'none' });
      return;
    }
    const n = Math.round(Number(this.data.consumeScore));
    if (!(n >= 1)) {
      wx.showToast({ title: '消耗分值要填 1 以上的整数哦', icon: 'none' });
      return;
    }
    const t = pt.totalsOf(this.entries);
    if (n > t.remaining) {
      wx.showToast({ title: '剩余积分只有 ' + t.remaining + ' 分,兑换不了 ' + n + ' 分哦', icon: 'none' });
      return;
    }
    const entry = pt.normalize({
      id: pt.newId(),
      date: this.data.consumeDate,
      reason: cr.key,
      score: n,
      note: note,
      updatedAt: Date.now(),
    });
    if (!entry) {
      wx.showToast({ title: '日期没选好,检查一下哦', icon: 'none' });
      return;
    }
    this.entries = pt.sortByNew([entry, ...this.entries]);
    this.renderSummary();
    pt.pushEntry(entry, () => wx.showToast({ title: '没同步上,检查下网络', icon: 'none' }));
    this.setData({ consumeScore: '', consumeNote: '' });
    this.lockBriefly();
    wx.showToast({ title: '已兑换 ' + n + ' 分', icon: 'success' });
  },
});
