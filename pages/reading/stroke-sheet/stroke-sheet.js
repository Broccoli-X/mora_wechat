const hanzi = require('../../../utils/hanzi');
const draw = require('../../../utils/hanzi-draw');

const COLUMNS = 4;
const CELL = 144;
const GAP = 10;
const PADDING = 4;
const ROW = CELL + 36;
const WIDTH = COLUMNS * CELL + (COLUMNS - 1) * GAP + 2 * PADDING;
// 弹层最大宽 680rpx，左右内边距各 24rpx。
const CONTENT_WIDTH_RPX = 632;

Component({
  properties: { char: String, pinyin: String, articleId: String, hidePinyin: Boolean },
  data: {
    imagePath: '', count: 0, imageHeight: 0, scrollHeight: 0,
    status: '正在加载笔顺…', cardStatus: '', canSupplement: false, supplementing: false,
  },
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
      const { articleId, pinyin } = this.data;
      hanzi.supplementStrokes(this.data.char, (data, reason, cardSaved) => {
        if (!this.active) return;
        if (cardSaved) this.setData({ cardStatus: '已写入识字卡片。' });
        else if (data && articleId) this.setData({ cardStatus: '当前服务端暂不支持写入识字卡片。' });
        if (data) { this.showStrokes(data); return; }
        const messages = {
          'stroke not found': '字库暂未收录这个字的笔顺。',
          'article not found': '这篇文章已移除，请返回文章列表。',
          'char not in article': '文章内容已更新，请重新打开文章。',
          unsupported: '当前服务端版本暂不支持补笔顺。',
          'permission denied': '当前账号没有补笔顺权限。',
        };
        this.setData({ supplementing: false, status: messages[reason] || '暂时补不到笔顺，请检查网络后重试。' });
      }, { articleId, pinyin });
    },
    showStrokes(data) {
      const frames = data.strokes.map(path => ({ segs: draw.parsePath(path) }));
      const bounds = draw.charBBox(data.strokes, 0.12);
      this.setData({
        count: frames.length,
        status: '正在准备笔顺图…',
        canSupplement: false,
        supplementing: false,
      }, () => this.drawSteps(frames, bounds));
    },
    drawSteps(frames, bounds) {
      const failed = () => {
        if (this.active) this.setData({ count: 0, status: '暂时无法绘制笔顺。' });
      };
      const query = this.createSelectorQuery();
      query.select('#stroke-renderer').fields({ node: true });
      query.exec(res => {
        if (!this.active) return;
        const canvas = res && res[0] && res[0].node;
        if (!canvas) { failed(); return; }
        const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const height = Math.ceil(frames.length / COLUMNS) * ROW + 2 * PADDING;
        // 限制位图最高边，笔画多的字也能在常见机型上导出。
        const scale = Math.max(1, Math.min(win.pixelRatio || 1, 2, 3000 / height));
        canvas.width = Math.ceil(WIDTH * scale);
        canvas.height = Math.ceil(height * scale);
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        const transform = draw.makeTransform(bounds, CELL, CELL);
        frames.forEach((_, i) => {
          const x = PADDING + i % COLUMNS * (CELL + GAP);
          const y = PADDING + Math.floor(i / COLUMNS) * ROW;
          ctx.save();
          ctx.translate(x, y);
          ctx.fillStyle = '#fff9ed';
          ctx.fillRect(0, 0, CELL, CELL);
          ctx.strokeStyle = '#ead9bc';
          ctx.beginPath();
          ctx.moveTo(CELL / 2, 1);
          ctx.lineTo(CELL / 2, CELL - 1);
          ctx.moveTo(1, CELL / 2);
          ctx.lineTo(CELL - 1, CELL / 2);
          ctx.stroke();
          ctx.strokeStyle = '#d8c09e';
          ctx.strokeRect(0.5, 0.5, CELL - 1, CELL - 1);
          draw.drawStep(ctx, frames, transform, i + 1);
          ctx.fillStyle = '#655641';
          ctx.font = '18px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('第 ' + (i + 1) + ' 笔', CELL / 2, CELL + 25);
          ctx.restore();
        });
        const imageHeight = Math.ceil(win.windowWidth * CONTENT_WIDTH_RPX / 750 * height / WIDTH);
        const scrollHeight = Math.min(imageHeight, Math.floor(win.windowHeight * 0.54));
        wx.canvasToTempFilePath({
          canvas,
          fileType: 'png',
          destWidth: canvas.width,
          destHeight: canvas.height,
          success: ({ tempFilePath }) => {
            if (!tempFilePath) { failed(); return; }
            if (this.active) this.setData({
              imagePath: tempFilePath, imageHeight, scrollHeight,
              status: '共 ' + frames.length + ' 笔',
            });
          },
          fail: failed,
        });
      });
    },
    close() { this.triggerEvent('close'); },
    stop() {},
  },
});
