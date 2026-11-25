const hanzi = require('../../../utils/hanzi');
const draw = require('../../../utils/hanzi-draw');

Component({
  properties: { char: String, pinyin: String },
  data: { steps: [], status: '正在加载笔顺…' },
  lifetimes: {
    ready() {
      this.active = true;
      hanzi.fetchStrokes(this.data.char, data => {
        if (!this.active) return;
        if (!data) { this.setData({ status: '暂时没有这个字的笔顺，联网后可再试。' }); return; }
        const frames = data.strokes.map(path => ({ segs: draw.parsePath(path) }));
        const bounds = draw.charBBox(data.strokes, 0.12);
        this.setData({
          steps: frames.map((_, i) => i + 1),
          stepsHeight: Math.ceil(frames.length / 4) * 192,
          status: '共 ' + frames.length + ' 笔',
        }, () => this.drawSteps(frames, bounds));
      });
    },
    detached() { this.active = false; },
  },
  methods: {
    drawSteps(frames, bounds) {
      const query = this.createSelectorQuery();
      query.selectAll('.stroke-step').fields({ node: true, size: true });
      query.exec(res => {
        if (!this.active) return;
        const cells = (res && res[0]) || [];
        if (cells.length !== frames.length || cells.some(cell => !(cell.node && cell.width && cell.height))) {
          this.setData({ steps: [], status: '暂时无法绘制笔顺。' });
          return;
        }
        const pixelRatio = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 1;
        cells.forEach(({ node, width, height }, i) => {
          node.width = Math.round(width * pixelRatio);
          node.height = Math.round(height * pixelRatio);
          const ctx = node.getContext('2d');
          ctx.scale(pixelRatio, pixelRatio);
          draw.drawStep(ctx, frames, draw.makeTransform(bounds, width, height), i + 1);
        });
      });
    },
    close() { this.triggerEvent('close'); },
    stop() {},
  },
});
