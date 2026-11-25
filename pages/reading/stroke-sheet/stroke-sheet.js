const hanzi = require('../../../utils/hanzi');
const draw = require('../../../utils/hanzi-draw');

Component({
  properties: { char: String, pinyin: String },
  data: { count: 0, ready: false, status: '正在加载笔顺…' },
  lifetimes: {
    ready() {
      this.active = true;
      hanzi.fetchStrokes(this.data.char, data => {
        if (!this.active) return;
        if (!data) { this.setData({ status: '暂时没有这个字的笔顺，联网后可再试。' }); return; }
        this.frames = data.strokes.map(path => ({ segs: draw.parsePath(path) }));
        this.bounds = draw.charBBox(data.strokes, 0.12);
        this.setData({ count: this.frames.length, status: '共 ' + this.frames.length + ' 笔' },
          () => this.initCanvas());
      });
    },
    detached() { this.active = false; clearTimeout(this.timer); },
  },
  methods: {
    initCanvas() {
      this.createSelectorQuery().select('#stroke-canvas').fields({ node: true, size: true }).exec(res => {
        if (!this.active) return;
        const info = res && res[0];
        if (!(info && info.node && info.width && info.height)) {
          this.setData({ count: 0, status: '暂时无法绘制笔顺。' });
          return;
        }
        const { node, width, height } = info;
        const pixelRatio = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 1;
        node.width = Math.round(width * pixelRatio);
        node.height = Math.round(height * pixelRatio);
        const ctx = node.getContext('2d');
        ctx.scale(pixelRatio, pixelRatio);
        this.canvas = { ctx, width, height, transform: draw.makeTransform(this.bounds, width, height) };
        this.setData({ ready: true });
        this.play();
      });
    },
    play() {
      if (!this.active || !this.canvas) return;
      clearTimeout(this.timer);
      let step = 0;
      const { ctx, width, height, transform } = this.canvas;
      const tick = () => {
        if (!this.active) return;
        ctx.clearRect(0, 0, width, height);
        draw.drawStep(ctx, this.frames, transform, step);
        if (step++ < this.frames.length) this.timer = setTimeout(tick, 340);
      };
      tick();
    },
    close() { this.triggerEvent('close'); },
    stop() {},
  },
});
