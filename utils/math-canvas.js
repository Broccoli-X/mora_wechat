/* 数学动画舞台 canvas 2d 渲染器:把 math-stage 的元素列表画到 340×310 逻辑舞台
   (调用前 ctx 已按 dpr scale)。纯绘制不持状态,入场插值(alpha/dy)由页面算好
   经 frame.drops 传入。配色与网页端 math-methods.html CSS 同值。 */
'use strict';

const BLOCK_COLORS = { sc1: '#2F80ED', sc2: '#F77F00', sp1: '#E0306E', sp2: '#7048E8', sten: '#27AE60', sans: '#343A40' };

/* 圆角矩形路径(canvas 2d 的 roundRect 兼容性不一,自绘) */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* 终点箭头小三角:angle 为来向角度(由调用方按切线算) */
function arrow(ctx, x, y, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-7, -3.5);
  ctx.lineTo(-7, 3.5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function endTangent(el) {
  if (el.type === 'line') return Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
  if (el.type === 'quad') return Math.atan2(el.p1[1] - el.cp[1], el.p1[0] - el.cp[0]);
  const last = el.segs[el.segs.length - 1].pts;
  return Math.atan2(last[last.length - 1] - last[last.length - 3], last[last.length - 2] - last[last.length - 4]);
}

function strokeStyled(ctx, el, trace) {
  ctx.beginPath();
  trace();
  ctx.strokeStyle = el.stroke;
  ctx.lineWidth = el.width;
  if (el.dash) ctx.setLineDash(el.dash);
  ctx.lineCap = el.cap || 'butt';
  ctx.stroke();
  ctx.setLineDash([]);
  if (el.marker) {
    const p = el.type === 'line' ? [el.x2, el.y2] : el.type === 'quad' ? el.p1 : el.segs[el.segs.length - 1].pts.slice(-2);
    arrow(ctx, p[0], p[1], endTangent(el), el.markerColor || el.stroke);
  }
}

/* caption 文字折行(底框宽 300,内文宽 280;measureText 缺失时按 12px/字兜底) */
function captionLines(ctx, text) {
  const limit = 280;
  const rows = [];
  let line = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const m = ctx.measureText ? ctx.measureText(line + ch) : null;
    const w = m && typeof m.width === 'number' ? m.width : (line.length + 1) * 12;
    if (w > limit && line) { rows.push(line); line = ch; } else { line += ch; }
    if (rows.length === 3) break;   // 最多 3 行
  }
  if (rows.length < 3 && line) rows.push(line);
  return rows;
}

function drawCaption(ctx, el) {
  ctx.font = 'bold 12px sans-serif';
  const rows = captionLines(ctx, el.text);
  const h = rows.length * 17 + 16;
  rr(ctx, 20, 258, 300, h, 12);
  ctx.fillStyle = '#F2F8FF';
  ctx.fill();
  ctx.strokeStyle = '#C8D9F2';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#555';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  rows.forEach((r, i) => ctx.fillText(r, 170, 258 + 8 + 8.5 + i * 17));
}

function drawEl(ctx, el, frame) {
  switch (el.type) {
    case 'block': {
      rr(ctx, el.x, el.y, 44, 44, 11);
      ctx.fillStyle = BLOCK_COLORS[el.cls] || BLOCK_COLORS.sans;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.text, el.x + 22, el.y + 23);
      return;
    }
    case 'op': {
      ctx.fillStyle = '#666';
      ctx.font = 'bold ' + (el.size || 20) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.text, el.x + 10, el.y + 22);
      return;
    }
    case 'note': {
      rr(ctx, el.x, el.y, 34, 26, 8);
      ctx.fillStyle = '#E0306E';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.text, el.x + 17, el.y + 14);
      return;
    }
    case 'line':
      strokeStyled(ctx, el, () => { ctx.moveTo(el.x1, el.y1); ctx.lineTo(el.x2, el.y2); });
      return;
    case 'quad':
      strokeStyled(ctx, el, () => { ctx.moveTo(el.p0[0], el.p0[1]); ctx.quadraticCurveTo(el.cp[0], el.cp[1], el.p1[0], el.p1[1]); });
      return;
    case 'path':
      strokeStyled(ctx, el, () => {
        el.segs.forEach(s => {
          if (s.c === 'M') ctx.moveTo(s.pts[0], s.pts[1]);
          else ctx.bezierCurveTo(s.pts[0], s.pts[1], s.pts[2], s.pts[3], s.pts[4], s.pts[5]);
        });
      });
      return;
    case 'circle': {
      ctx.beginPath();
      ctx.arc(el.cx, el.cy, el.r, 0, Math.PI * 2);
      ctx.strokeStyle = el.stroke;
      ctx.lineWidth = el.width;
      ctx.stroke();
      return;
    }
    case 'text': {
      ctx.fillStyle = el.color;
      ctx.font = (el.bold ? 'bold ' : '') + el.size + 'px sans-serif';
      ctx.textAlign = el.align || 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(el.text, el.x, el.y);
      return;
    }
    case 'marker': {
      const x = frame.markerX != null ? frame.markerX : el.x;
      ctx.font = '27px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.text, x + 20, el.y + 20);
      return;
    }
    case 'caption':
      if (frame.captionStep == null || el.step === frame.captionStep) drawCaption(ctx, el);
      return;
    default:
  }
}

function drawStage(ctx, stage, frame) {
  ctx.save();
  stage.elements.forEach((el, i) => {
    if (el.step > frame.step) return;
    const drop = frame.drops ? frame.drops[i] : null;
    if (drop) {
      ctx.save();
      ctx.globalAlpha = drop.alpha;
      ctx.translate(0, drop.dy);
    }
    drawEl(ctx, el, frame);
    if (drop) ctx.restore();
  });
  ctx.restore();
}

module.exports = { drawStage };
