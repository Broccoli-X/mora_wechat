/* hanzi-writer 笔画轮廓数据 → Canvas 2D 绘制工具(纯函数,Node 可 require 测试)。
   数据坐标为 1024×1024 且 Y 轴朝上,绘制时翻成屏幕朝下并等比适配画布;
   path 只含 M/L/Q/C/Z(绝对坐标)。用途:田字格整字与逐笔分解图(第 k 格前 k 笔深色)。 */

/* 解析 path d 属性 → 段数组。字母后可跟多组隐式重复坐标(SVG 规范:M 后续组按 L 处理) */
function parsePath(d) {
  const segs = [];
  const re = /([MLQCZ])([^MLQCZmlqcz]*)/g;
  let m;
  while ((m = re.exec(String(d || '')))) {
    const cmd = m[1];
    const nums = (m[2].match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) || []).map(Number);
    if (cmd === 'Z') { segs.push({ c: 'Z', p: [] }); continue; }
    const n = cmd === 'Q' ? 4 : cmd === 'C' ? 6 : 2;
    for (let i = 0; i + n <= nums.length; i += n) {
      segs.push({ c: cmd === 'M' && i > 0 ? 'L' : cmd, p: nums.slice(i, i + n) });
    }
  }
  return segs;
}

/* 全部坐标点(控制点也算,Bézier 曲线必在其控制点凸包内,故包围盒不会漏) */
function pathPoints(segs) {
  const pts = [];
  for (const s of segs || []) for (let i = 0; i < s.p.length; i += 2) pts.push([s.p[i], s.p[i + 1]]);
  return pts;
}

/* 整字包围盒(数据坐标):由各笔轮廓的控制点求得,含留白比例 padRatio */
function charBBox(strokes, padRatio) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const d of strokes || []) {
    for (const pt of pathPoints(parsePath(d))) {
      if (pt[0] < minX) minX = pt[0];
      if (pt[1] < minY) minY = pt[1];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] > maxY) maxY = pt[1];
    }
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, w: 1024, h: 1024 };
  const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
  const pad = Math.max(w, h) * (padRatio == null ? 0.08 : padRatio);
  return { minX: minX - pad, minY: minY - pad, w: w + pad * 2, h: h + pad * 2 };
}

/* 数据坐标 → 画布坐标:等比缩放居中 + Y 翻转。返回 { t, s },t(x,y)→[sx,sy],s 为缩放比 */
function makeTransform(bbox, width, height) {
  const s = Math.min(width / bbox.w, height / bbox.h);
  const ox = (width - bbox.w * s) / 2;
  const oy = (height - bbox.h * s) / 2;
  return {
    s,
    t(x, y) {
      return [ox + (x - bbox.minX) * s, oy + (bbox.minY + bbox.h - y) * s];
    },
  };
}

/* 把一段轮廓按变换画进 ctx 并填充(Z 闭合) */
function fillStroke(ctx, frame, T, color) {
  ctx.beginPath();
  for (const seg of frame.segs) {
    const p = seg.p;
    if (seg.c === 'M') { const q = T.t(p[0], p[1]); ctx.moveTo(q[0], q[1]); }
    else if (seg.c === 'L') { const q = T.t(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
    else if (seg.c === 'Q') {
      const c = T.t(p[0], p[1]), e = T.t(p[2], p[3]);
      ctx.quadraticCurveTo(c[0], c[1], e[0], e[1]);
    } else if (seg.c === 'C') {
      const c1 = T.t(p[0], p[1]), c2 = T.t(p[2], p[3]), e = T.t(p[4], p[5]);
      ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], e[0], e[1]);
    } else if (seg.c === 'Z') ctx.closePath();
  }
  ctx.fillStyle = color;
  ctx.fill();
}

/* 整字:按颜色逐笔填充 */
function drawChar(ctx, frames, T, color) {
  for (const f of frames) fillStroke(ctx, f, T, color);
}

/* 逐笔分解第 k 格(0 基):前 k 笔深色,其余浅灰(与网页端一致) */
function drawStep(ctx, frames, T, k) {
  for (let i = 0; i < frames.length; i++) {
    fillStroke(ctx, frames[i], T, i < k ? '#333333' : '#eef2f7');
  }
}

module.exports = {
  parsePath, pathPoints, charBBox, makeTransform, fillStroke, drawChar, drawStep,
};
