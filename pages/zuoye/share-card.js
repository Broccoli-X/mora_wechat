/* 当天作业分享长图(pages/zuoye 专用):把一天的作业(科目 chip、文字、
   图片附件)画进一张不透明白底长图,交给 wx.showShareImageMenu 直接发给微信
   好友——接收方不用装小程序、不用登录,作业内容与照片一次带到。
   不画完成状态:勾选是家长本机的事,分享单只给别人看内容。
   布局不为复刻页面:作业单照片要看得清,附件按原比例放大到接近整行宽
   (等比 contain,单张展示高有上限防竖图无限拉高整图),逐张竖排;
   整幅先铺白底——导出的 PNG 不许带透明(透明在聊天里会被衬成黑底)。
   加载失败的照片画灰底占位不拦整图。图片走 GET /api/image(不带 token),
   经 wx.downloadFile 拉本地再画,上线前需把 API 域名配进 downloadFile 合法域名。
   layout() 是纯函数:换行、坐标、总高只靠注入的 measure 与照片尺寸算出来,
   Node 可直测;build() 才接触 wx(canvas 2d 节点、downloadFile、导出)。 */

const W = 750; /* 长图固定 750px 宽(逻辑宽 375 的 2 倍,清晰度够、文件不大) */
const PAD = 36;
const CONTENT_W = W - PAD * 2;
const TEXT_X = PAD + 44; /* 正文比科目 chip 缩进一级,层次清楚 */

const C = {
  bg: '#ffffff',
  title: '#1f2937',
  sub: '#6b7280',
  line: '#eef1f6',
  text: '#1f2937',
  imgBg: '#eef1f6',
  imgBorder: '#dfe5f0',
  footer: '#9aa1b0',
  bandGrad: ['#c7e0ff', '#e6d9ff', '#ffe9c9'], /* 与作业本页背景渐变同色系 */
};

const F = {
  title: '800 36px sans-serif',
  sub: '600 24px sans-serif',
  chip: '700 24px sans-serif',
  text: '600 28px sans-serif',
  footer: '500 20px sans-serif',
};

const CHIP_H = 36;
const TEXT_LH = 42;
const PHOTO_MAX_H = 820;  /* 单张照片展示高上限:竖图不再按整行宽等比放大 */
const PHOTO_GAP = 16;
const PHOTO_FAIL_H = 240; /* 加载失败占位块高度 */
const PHOTO_R = 14;

/* 导出分辨率:画布后台按 RES 倍渲染(750 宽的逻辑坐标 × RES)。
   只画 750px 后台的话,现代手机(物理宽 1125~1248px)整图被拉伸,文字照片发虚;
   canvasToTempFilePath 的 destWidth 默认只是放大后台位图,不产生细节,必须靠
   后台本身的高分辨率。RES=2 → 导出 1500px 宽,3x 屏上看也够 */
const RES = 2;
/* 后台高度保险丝:逻辑高 × RES 超过它就降回 1x。1500×7000≈10.5M px²,
   留出余量地低于 iOS 画布面积上限(约 16.7M px²),高度也在 Android 常见
   8192 单边上限内——超限的画布会导出坏文件,直接导致发给好友失败 */
const MAX_DEV_H = 7000;

/* 文字按像素宽断行:逐字累加(中文无空格可逐字断,英文长词被硬切,可接受);
   \n 强制换行;超宽的单个字符自成一行不丢字 */
function wrapText(text, maxW, measure, font) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    let line = '';
    for (const ch of Array.from(raw)) {
      if (line && measure(line + ch, font) > maxW) { out.push(line); line = ch; }
      else line += ch;
    }
    out.push(line);
  }
  return out;
}

/* 排版:data={dateText, items:[{icon,color,subject,text,done,imgs:[{i,w,h}]}]},
   measure(text, font) → 像素宽;imgs 是去重后的位图下标 + 位图原始宽高
   (加载失败的 w/h 记 0,画固定高的灰底占位)。产出绘制算子序列与总高 */
function layout(data, measure) {
  const ops = [];
  let y = 0;
  ops.push({ t: 'lgrad', x: 0, y: 0, w: W, h: 10, stops: C.bandGrad });
  y = 10 + 34;
  ops.push({ t: 'text', x: PAD, y: y, text: '今日作业', font: F.title, color: C.title });
  y += 50;
  ops.push({ t: 'text', x: PAD, y: y, text: data.dateText, font: F.sub, color: C.sub });
  y += 40;
  ops.push({ t: 'line', x1: PAD, y1: y + 4, x2: W - PAD, y2: y + 4, color: C.line });
  y += 26;

  (data.items || []).forEach((it, i) => {
    if (i > 0) {
      ops.push({ t: 'line', x1: PAD, y1: y + 20, x2: W - PAD, y2: y + 20, color: C.line });
      y += 44;
    }
    /* 科目 chip(不画完成状态:勾选是家长本机的事,分享单只给别人看内容) */
    const chipText = it.icon + it.subject;
    const chipW = Math.ceil(measure(chipText, F.chip)) + 28;
    ops.push({ t: 'rrect', x: PAD, y: y, w: chipW, h: CHIP_H, r: 9, fill: it.color });
    ops.push({ t: 'text', x: PAD + 14, y: y + 7, text: chipText, font: F.chip, color: '#ffffff' });
    y += CHIP_H + 14;

    for (const ln of wrapText(it.text, CONTENT_W - (TEXT_X - PAD), measure, F.text)) {
      ops.push({ t: 'text', x: TEXT_X, y: y, text: ln, font: F.text, color: C.text });
      y += TEXT_LH;
    }

    /* 附件照片逐张竖排:横图吃满整行宽,竖图放大到展示高上限为止,窄图水平居中 */
    const phs = it.imgs || [];
    phs.forEach(p => {
      let w, h;
      if (p.w > 0 && p.h > 0) {
        const s = Math.min(CONTENT_W / p.w, PHOTO_MAX_H / p.h);
        w = Math.round(p.w * s);
        h = Math.round(p.h * s);
      } else {
        w = CONTENT_W;
        h = PHOTO_FAIL_H;
      }
      ops.push({ t: 'photo', x: PAD + Math.round((CONTENT_W - w) / 2), y: y, w: w, h: h, idx: p.i });
      y += h + PHOTO_GAP;
    });
    if (phs.length) y -= PHOTO_GAP; /* 末张不追加间距 */
  });

  y += 34;
  const footer = 'Mora 学习卡片 · 家长分享的作业单';
  ops.push({
    t: 'text', x: Math.round((W - measure(footer, F.footer)) / 2), y: y,
    text: footer, font: F.footer, color: C.footer,
  });
  y += 28 + 34;

  /* 整图铺不透明白底:必须最后回填成首个算子,高度用定稿总高 */
  ops.unshift({ t: 'rect', x: 0, y: 0, w: W, h: y, fill: C.bg });
  return { ops: ops, height: y };
}

/* 执行排版算子;bitmaps 是 canvas.createImage() 加载好的位图数组(失败为 null) */
function draw(ctx, ops, bitmaps) {
  ctx.textBaseline = 'top';
  for (const op of ops) {
    if (op.t === 'rect') {
      ctx.fillStyle = op.fill;
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.t === 'lgrad') {
      const g = ctx.createLinearGradient(op.x, op.y, op.x + op.w, op.y);
      op.stops.forEach((s, i) => g.addColorStop(i / (op.stops.length - 1), s));
      ctx.fillStyle = g;
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.t === 'rrect') {
      ctx.beginPath();
      roundRectPath(ctx, op.x, op.y, op.w, op.h, op.r);
      if (op.fill) { ctx.fillStyle = op.fill; ctx.fill(); }
      if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.lineWidth = op.lw || 2; ctx.stroke(); }
    } else if (op.t === 'photo') {
      ctx.save();
      ctx.beginPath();
      roundRectPath(ctx, op.x, op.y, op.w, op.h, PHOTO_R);
      ctx.clip();
      const img = bitmaps[op.idx];
      if (img && img.width && img.height) {
        /* 原比例 contain 居中放进格子(格子本身就是按位图比例算的,此处兜底) */
        const s = Math.min(op.w / img.width, op.h / img.height);
        const dw = img.width * s;
        const dh = img.height * s;
        ctx.drawImage(img, op.x + (op.w - dw) / 2, op.y + (op.h - dh) / 2, dw, dh);
      } else {
        ctx.fillStyle = C.imgBg;
        ctx.fillRect(op.x, op.y, op.w, op.h);
        ctx.font = F.chip;
        ctx.fillStyle = C.footer;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('图片加载失败', op.x + op.w / 2, op.y + op.h / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
      }
      ctx.restore();
      /* 白底照片描一圈浅边,和纸面分得开 */
      ctx.beginPath();
      roundRectPath(ctx, op.x, op.y, op.w, op.h, PHOTO_R);
      ctx.strokeStyle = C.imgBorder;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (op.t === 'text') {
      ctx.font = op.font;
      ctx.fillStyle = op.color;
      ctx.fillText(op.text, op.x, op.y);
    } else if (op.t === 'line') {
      ctx.strokeStyle = op.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(op.x1, op.y1);
      ctx.lineTo(op.x2, op.y2);
      ctx.stroke();
    }
  }
}

/* canvas 2d 早期实现没有 roundRect,四段 arcTo 手拼圆角矩形 */
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* 并发下载全部附件(单张超时 10s),失败的位置记 null 由绘制层画占位 */
function downloadAll(urls, done) {
  const out = new Array(urls.length).fill(null);
  let pending = urls.length;
  if (!pending) { done(out); return; }
  urls.forEach((u, i) => {
    wx.downloadFile({
      url: u,
      timeout: 10000,
      success(r) { if (r.statusCode === 200 && r.tempFilePath) out[i] = r.tempFilePath; },
      complete() { if (--pending === 0) done(out); },
    });
  });
}

/* 本地图片 → canvas 位图;任一张失败记 null 不拦整批 */
function loadBitmaps(canvas, paths, done) {
  const out = new Array(paths.length).fill(null);
  let pending = paths.length;
  if (!pending) { done(out); return; }
  paths.forEach((p, i) => {
    if (!p) { if (--pending === 0) done(out); return; }
    const img = canvas.createImage();
    img.onload = () => { out[i] = img; if (--pending === 0) done(out); };
    img.onerror = () => { if (--pending === 0) done(out); };
    img.src = p;
  });
}

/* 主流程:下载附件 → 装载位图(排版要按位图原始宽高算照片格子) → 量文字
   定稿画布 → 绘制 → 导出临时文件。data.items[].imgs 传图片 URL(可重复,
   内部按下标去重只下一次) */
function build(canvas, data, done, fail) {
  const ctx = canvas.getContext('2d');
  canvas.width = W * RES;
  canvas.height = 600; /* 临时后台,只够 measureText 用(定稿尺寸排版后再设) */

  const urls = [];
  const urlIdx = {};
  const items = data.items.map(it => ({
    icon: it.icon, color: it.color, subject: it.subject, text: it.text,
    imgs: (it.imgs || []).map(u => {
      if (!(u in urlIdx)) { urlIdx[u] = urls.length; urls.push(u); }
      return urlIdx[u];
    }),
  }));

  function measure(text, font) { ctx.font = font; return ctx.measureText(text).width; }

  downloadAll(urls, paths => {
    loadBitmaps(canvas, paths, bitmaps => {
      const layoutItems = items.map(it => ({
        icon: it.icon, color: it.color, subject: it.subject, text: it.text,
        imgs: it.imgs.map(idx => {
          const bm = bitmaps[idx];
          return { i: idx, w: bm ? bm.width : 0, h: bm ? bm.height : 0 };
        }),
      }));
      const plan = layout({ dateText: data.dateText, items: layoutItems }, measure);
      /* 超长图降回 1x:RES 倍后台可能超出 iOS 画布面积上限,导出会直接失败 */
      const res = plan.height * RES > MAX_DEV_H ? 1 : RES;
      canvas.width = W * res;
      canvas.height = plan.height * res; /* 定稿画布(重设即清屏) */
      ctx.setTransform(res, 0, 0, res, 0, 0); /* 绘制仍用 750 逻辑坐标 */
      draw(ctx, plan.ops, bitmaps);
      wx.canvasToTempFilePath({
        canvas: canvas,
        destWidth: canvas.width,  /* 显式按后台尺寸导出:默认值(×dpr)只是放大模糊位图 */
        destHeight: canvas.height,
        /* JPEG(q0.9):长图主体是照片,PNG 无损会把体积顶到十几 MB,微信直接拒收
           发不出去;2x 分辨率下 q0.9 文字依然锐利。底色已铺不透明白,JPEG 不会发黑 */
        fileType: 'jpg',
        quality: 0.9,
        success(r) { if (r.tempFilePath) done(r.tempFilePath); else if (fail) fail(); },
        fail() { if (fail) fail(); },
      });
    });
  });
}

module.exports = { layout, wrapText, draw, build, RES };
