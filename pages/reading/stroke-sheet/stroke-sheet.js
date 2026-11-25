const hanzi = require('../../../utils/hanzi');
const draw = require('../../../utils/hanzi-draw');

Component({
  properties: { char: String, pinyin: String },
  data: { steps: [], status: '正在加载笔顺…', canSupplement: false, supplementing: false },
  lifetimes: {
    ready() {
      this.active = true;
      hanzi.fetchStrokes(this.data.char, data => {
        if (!this.active) return;
        if (data) this.showStrokes(data);
        else this.setData({ status: '暂时没有这个字的笔顺，联网后可再试。', canSupplement: true });
      });
    },
    detached() { this.active = false; },
  },
  methods: {
    supplement() {
      if (!this.active || !this.data.canSupplement || this.data.supplementing) return;
      this.setData({ supplementing: true, status: '正在查询笔顺字库…' });
      hanzi.supplementStrokes(this.data.char, (data, reason) => {
        if (!this.active) return;
        if (data) { this.showStrokes(data); return; }
        const messages = {
          'stroke not found': '字库暂未收录这个字的笔顺。',
          unsupported: '当前服务端版本暂不支持补笔顺。',
          'permission denied': '当前账号没有补笔顺权限。',
        };
        this.setData({ supplementing: false, status: messages[reason] || '暂时补不到笔顺，请检查网络后重试。' });
      });
    },
    showStrokes(data) {
      const frames = data.strokes.map(path => ({ segs: draw.parsePath(path) }));
      const bounds = draw.charBBox(data.strokes, 0.12);
      this.setData({
        steps: frames.map((_, i) => i + 1),
        stepsHeight: Math.ceil(frames.length / 4) * 192,
        status: '共 ' + frames.length + ' 笔',
        canSupplement: false,
        supplementing: false,
      }, () => this.drawSteps(frames, bounds));
    },
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
