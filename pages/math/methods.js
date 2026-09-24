/* 数学方法动画课:对齐网页端 mora/math-methods.html——选课 → 随机出题 → 数字键盘
   答题 → ▶ 动画演示(canvas 分步讲解)。纯前端自闭环:零接口、零存储、零上报。
   core 算法 utils/math-methods.js(与网页端 math-methods-core.js 同口径);
   舞台布局 utils/math-stage.js(照抄网页端 340×310 坐标);渲染 utils/math-canvas.js。
   权限键 math_methods(与网页端同一功能键),未开通整页拦截。 */
const auth = require('../../utils/auth');
const core = require('../../utils/math-methods');
const stageLib = require('../../utils/math-stage');
const canvasLib = require('../../utils/math-canvas');

/* 每课渐变主色(与网页端 THEMES 同表,顺序即 METHODS 顺序) */
const THEMES = [
  ['#22B8CF', '#0C8599'], ['#FA5252', '#E03131'], ['#FF9500', '#E07000'],
  ['#FF5C8D', '#D6336C'], ['#9775FA', '#7048E8'], ['#4DABF7', '#1C7ED6'],
  ['#20C997', '#0CA678'], ['#748FFC', '#4C6EF5'], ['#F06595', '#D6336C'],
];
const PACE_LINE = 560;   // 线段课每步 ms(网页端同值)
const PACE = 800;        // 其余课每步 ms
const DROP_MS = 400;     // 入场下落时长
const MOVE_MS = 400;     // 青蛙跳跃时长

/* core 题目 → 视图:横式(线段/口诀)或竖式(两位/三位)逐位格 */
function questionView(q) {
  const vertical = stageLib.kindOf(q.methodId) === 'place';
  const digits = vertical ? String(Math.max(q.left, q.right)).length : 0;
  const cells = v => String(v).padStart(digits, ' ').split('')
    .map((d, i) => ({ i: i, d: d === ' ' ? '' : d }));
  return {
    left: q.left, right: q.right, operator: q.operator,
    vertical: vertical, digits: digits,
    topCells: vertical ? cells(q.left) : [],
    bottomCells: vertical ? cells(q.right) : [],
    placeTags: vertical ? ['百', '十', '个'].slice(3 - digits) : [],
  };
}

Page({
  data: {
    blocked: true,        // 权限门:未登录/未开通整页不呈现
    methods: [],          // 选课胶囊视图
    methodIndex: 0,
    lesson: {},           // {title, summary, kicker, c, cd, tip}
    question: null,       // questionView 结果
    input: '',
    inputState: '',       // '' | 'correct' | 'wrong'
    inputLocked: false,   // 答对 or 弹窗打开
    streak: 0,
    writeDirection: 'high-first',
    feedback: { text: '用数字键盘输入答案', cls: '' },
    demoVisible: false,
    animTitle: [],        // 弹窗标题彩色段
    demoTip: '',
    demoSteps: [],        // 文字兜底步骤列表(canvas 初始化失败时)
    lineCustom: null,     // 线段课自定算式 {a, b, op, hint, bad}
    canvasReady: false,
    step: 0,              // 动画当前步
  },

  /* —— 非渲染内部态 —— */
  question: null,         // core 原始题
  stage: null,            // buildStage 结果
  solved: false,
  animTimers: [],
  rafId: 0,
  ctx: null,
  canvasNode: null,
  dropMap: {},            // {元素索引: 入场动画起点 ms}
  markerMove: null,       // 青蛙移动 {from, to, t0}
  markerX: 0,

  onLoad() {
    auth.ensurePerm('math_methods', allowed => {
      if (!allowed) { this.setData({ blocked: true }); return; }
      this.setData({ blocked: false });
      this.selectMethod(0);
    });
  },

  onUnload() { this.clearAnim(); },
  onHide() { this.clearAnim(); },

  /* ── 选课/出题 ── */
  selectMethod(i) {
    const m = core.METHODS[i];
    this.setData({
      methodIndex: i,
      methods: core.METHODS.map((it, j) => ({ i: j, title: it.title, c: THEMES[j][0], cd: THEMES[j][1], active: j === i })),
      lesson: {
        title: m.title, summary: m.summary, kicker: '第 ' + (i + 1) + ' 课',
        c: THEMES[i][0], cd: THEMES[i][1],
        tip: '小口诀：' + (m.tip || m.summary + '。看清数位，从低位开始算'),
      },
    });
    this.newQuestion();
  },

  onSelectMethod(e) {
    const i = Number(e.currentTarget.dataset.i);
    if (i === this.data.methodIndex || !(i >= 0)) return;
    this.selectMethod(i);
  },

  newQuestion() {
    try {
      this.question = core.makeQuestion(core.METHODS[this.data.methodIndex].id);
    } catch (e) {
      wx.showToast({ title: '出题失败，请重试', icon: 'none' });   // 理论不可达(约束均有解)
      return;
    }
    this.setData({ question: questionView(this.question) });
    this.solved = false;
    this.setData({
      input: '', inputState: '', inputLocked: false,
      feedback: { text: '用数字键盘输入答案', cls: '' },
    });
    this.clearAnim();
    this.setData({ step: 0 });
  },

  onNewQuestion() { this.newQuestion(); },

  /* ── 答题 ── */
  onKeyDigit(e) {
    if (this.data.inputLocked) return;
    const k = e.currentTarget.dataset.k;
    const input = core.writeAnswerDigit(this.data.input, k, this.data.writeDirection, 3);
    this.setData({ input: input, inputState: '', feedback: { text: '用数字键盘输入答案', cls: '' } });
  },

  onBackspace() {
    if (this.data.inputLocked) return;
    this.setData({ input: core.eraseAnswerDigit(this.data.input, this.data.writeDirection), inputState: '' });
  },

  onSubmit() {
    if (this.data.inputLocked) return;
    if (!this.data.input) {
      this.setData({ feedback: { text: '请先输入答案', cls: 'bad' } });
      return;
    }
    if (core.checkAnswer(this.question, this.data.input)) {
      this.solved = true;
      this.setData({
        inputState: 'correct', inputLocked: true, streak: this.data.streak + 1,
        feedback: { text: '✅ 答对啦！可以看动画，也可以换一道题', cls: 'ok' },
      });
    } else {
      this.setData({
        inputState: 'wrong', streak: 0,
        feedback: { text: '再想一想，也可以点动画演示', cls: 'bad' },
      });
      this.animTimers.push(setTimeout(() => this.setData({ inputState: '' }), 320));
    }
  },

  onWriteDirection(e) {
    const d = e.currentTarget.dataset.d;
    if (this.data.inputLocked || !d || d === this.data.writeDirection) return;
    this.setData({
      writeDirection: d, input: '', inputState: '',
      feedback: { text: d === 'ones-first' ? '已切换：先写个位' : '已切换：先写高位', cls: '' },
    });
  },

  /* ── 动画演示弹窗 ── */
  openDemo() {
    this.setData({
      demoVisible: true, inputLocked: true, canvasReady: false, step: 0,
      animTitle: stageLib.titleSegments(this.question).map((s, i) => ({ i: i, text: s.text, color: s.color })),
      demoTip: this.data.lesson.tip,
      demoSteps: core.buildDemoSteps(this.question).map((s, i) => ({ i: i, expression: s.expression, caption: s.caption })),
      lineCustom: this.buildLineCustom(),
    });
    wx.nextTick(() => this.initCanvas(() => this.playAnim()));
  },

  buildLineCustom() {
    const m = core.METHODS[this.data.methodIndex];
    if (m.id !== 'line-add' && m.id !== 'line-sub') return null;
    return {
      a: String(this.question.left), b: String(this.question.right), op: m.operator,
      hint: m.id === 'line-add' ? '两个数都填 1~9，加起来不超过 10' : '起点填 1~10，往回跳 1~9 步，不能跳过 0',
      bad: false,
    };
  },

  onLineInput(e) {
    const f = e.currentTarget.dataset.f;
    if (!f) return;
    const patch = {};
    patch['lineCustom.' + f] = e.detail.value;
    patch['lineCustom.bad'] = false;
    this.setData(patch);
  },

  onLinePlay() {
    const lc = this.data.lineCustom;
    if (!lc) return;
    const q = core.makeLineQuestion(core.METHODS[this.data.methodIndex].id, lc.a, lc.b);
    if (!q) { this.setData({ 'lineCustom.bad': true }); return; }
    this.question = q;
    this.solved = false;
    this.setData({
      question: questionView(q), input: '', inputState: '', inputLocked: true,
      feedback: { text: '用数字键盘输入答案', cls: '' },
      animTitle: stageLib.titleSegments(q).map((s, i) => ({ i: i, text: s.text, color: s.color })),
      demoSteps: core.buildDemoSteps(q).map((s, i) => ({ i: i, expression: s.expression, caption: s.caption })),
    });
    this.playAnim();
  },

  closeDemo() {
    this.clearAnim();
    this.setData({ demoVisible: false, inputLocked: this.solved, step: 0 });
  },
  onCloseDemo() { this.closeDemo(); },
  onBackdrop() { this.closeDemo(); },
  onReplay() { this.playAnim(); },

  /* ── canvas 与动画编排 ── */
  initCanvas(done) {
    wx.createSelectorQuery().in(this).select('#demo-canvas').fields({ node: true, size: true }, res => {
      const node = res && res.node;
      if (!node || !node.getContext) {
        this.setData({ canvasReady: false });   // 文字兜底(wxml demo-fallback)
        return;
      }
      const info = wx.getWindowInfo ? wx.getWindowInfo() : {};
      const dpr = info.pixelRatio || 2;
      node.width = 340 * dpr;
      node.height = 310 * dpr;
      const ctx = node.getContext('2d');
      ctx.scale(dpr, dpr);
      this.canvasNode = node;
      this.ctx = ctx;
      this.setData({ canvasReady: true });
      if (done) done();
    }).exec();
  },

  clearAnim() {
    this.animTimers.forEach(t => clearTimeout(t));
    this.animTimers = [];
    if (this.rafId && this.canvasNode) {
      this.canvasNode.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.dropMap = {};
    this.markerMove = null;
  },

  playAnim() {
    this.clearAnim();
    if (!this.data.canvasReady) return;     // canvas 不可用:文字兜底已列出全部步骤
    this.stage = stageLib.buildStage(this.question, THEMES[this.data.methodIndex][0]);
    const isLine = this.stage.kind === 'line';
    const pace = isLine ? PACE_LINE : PACE;
    const total = this.stage.maxStep;
    this.markerX = isLine ? this.stage.markerX : 0;
    this.reveal(0, true);
    /* 下落口径照抄网页端 playAnim:线段课仅首尾步、口诀课偶数步、竖式课每步 */
    for (let s = 1; s <= total; s += 1) {
      const drop = isLine ? (s === 1 || s === total) : (this.stage.kind !== 'oral' || s % 2 === 0);
      this.animTimers.push(setTimeout(() => this.reveal(s, drop), s * pace));
    }
    this.animTimers.push(setTimeout(() => {
      if (this.rafId && this.canvasNode) { this.canvasNode.cancelAnimationFrame(this.rafId); this.rafId = 0; }
    }, total * pace + DROP_MS + 60));
  },

  reveal(s, drop) {
    if (!this.stage) return;
    this.setData({ step: s });
    if (drop) {
      this.stage.elements.forEach((el, i) => {
        if (el.step === s && el.type !== 'caption') this.dropMap[i] = Date.now();
      });
    }
    if (this.stage.kind === 'line' && s > 1) {
      const hop = this.stage.elements.filter(el => el.type === 'quad' && el.step === s)[0];
      if (hop) this.markerMove = { from: this.markerX, to: hop.markerTo, t0: Date.now() };
    }
    this.startLoop();
  },

  startLoop() {
    if (!this.data.canvasReady || !this.canvasNode || this.rafId) return;
    const loop = () => {
      if (!this.ctx || !this.stage) return;
      canvasLib.drawStage(this.ctx, this.stage, this.frame());
      this.rafId = this.canvasNode.requestAnimationFrame(loop);
    };
    this.rafId = this.canvasNode.requestAnimationFrame(loop);
  },

  /* 当前帧:入场插值 + 青蛙位置(供 math-canvas 只读) */
  frame() {
    const now = Date.now();
    const drops = {};
    Object.keys(this.dropMap).forEach(i => {
      const p = Math.min(1, (now - this.dropMap[i]) / DROP_MS);
      if (p < 1) drops[i] = { alpha: p, dy: -16 * (1 - p) };
    });
    let markerX = this.markerX;
    if (this.markerMove) {
      const p = Math.min(1, (now - this.markerMove.t0) / MOVE_MS);
      markerX = this.markerMove.from + (this.markerMove.to - this.markerMove.from) * p;
      if (p >= 1) { this.markerX = this.markerMove.to; this.markerMove = null; }
    }
    const step = this.data.step;
    return { step: step, captionStep: this.stage.kind === 'oral' ? null : step, drops: drops, markerX: markerX };
  },
});
