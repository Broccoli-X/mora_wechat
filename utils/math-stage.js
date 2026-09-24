/* 数学动画舞台布局纯函数:三类舞台(数轴跳蛙 line / 口诀分块 oral / 竖式进退位 place)
   的元素布局,坐标系照抄网页端 mora/math-methods.html 的 lineStructure/oralStructure/
   placeStructure 三函数(340×310 逻辑舞台,x/y 均左上角)。只产数据不渲染,
   canvas 渲染见 utils/math-canvas.js。改坐标先改网页端再同步搬。 */
'use strict';
const core = require('./math-methods');

const LINE = ['line-add', 'line-sub'];
const ORAL = ['make-ten', 'break-ten', 'level-ten'];

function kindOf(methodId) {
  if (LINE.indexOf(methodId) >= 0) return 'line';
  if (ORAL.indexOf(methodId) >= 0) return 'oral';
  return 'place';
}

/* 数轴刻度 v(0~10) 的 x 坐标(网页端 X(v)=30+v*28) */
function lineX(v) { return 30 + v * 28; }

function lineStage(q, themeColor) {
  const steps = core.buildDemoSteps(q);
  const forward = q.operator === '+';
  const color = themeColor || '#22B8CF';
  const els = [];
  els.push({ type: 'line', x1: 18, y1: 150, x2: 322, y2: 150, stroke: '#CED4DA', width: 3, step: 0, cap: 'round' });
  for (let v = 0; v <= 10; v += 1) {
    els.push({ type: 'line', x1: lineX(v), y1: 144, x2: lineX(v), y2: 156, stroke: '#CED4DA', width: 2.5, step: 0 });
    els.push({ type: 'text', x: lineX(v), y: 176, text: String(v), size: 13, color: '#ADB5BD', align: 'center', step: 0 });
  }
  steps.forEach(s => {
    if (!s.hop) return;
    const x1 = lineX(s.at - (forward ? 1 : -1));
    const x2 = lineX(s.at);
    els.push({ type: 'quad', p0: [x1, 140], cp: [(x1 + x2) / 2, 100], p1: [x2, 140],
      stroke: color, width: 2.6, dash: [6, 4], marker: true, markerColor: color,
      step: s.hop + 1, markerTo: x2 - 20 });
  });
  els.push({ type: 'circle', cx: lineX(steps[0].at), cy: 170, r: 11, stroke: color, width: 2.4, step: 1 });
  steps.forEach(s => {
    if (s.hop) els.push({ type: 'circle', cx: lineX(s.at), cy: 170, r: 11, stroke: color, width: 2.4, step: s.hop + 1 });
  });
  els.push({ type: 'block', x: 68, y: 8, text: String(q.left), cls: 'sc1', step: 0 });
  els.push({ type: 'op', x: 120, y: 8, text: q.operator, step: 0 });
  els.push({ type: 'block', x: 148, y: 8, text: String(q.right), cls: 'sc2', step: 0 });
  els.push({ type: 'op', x: 200, y: 8, text: '=', step: 0 });
  els.push({ type: 'block', x: 228, y: 8, text: '?', cls: 'sans', step: 0 });
  els.push({ type: 'block', x: 228, y: 8, text: String(q.answer), cls: 'sten', step: steps.length });
  els.push({ type: 'marker', x: lineX(q.left) - 20, y: 72, text: '🐸', step: 1 });
  steps.forEach((s, i) => els.push({ type: 'caption', text: s.caption, step: i + 1 }));
  return { kind: 'line', steps: steps, maxStep: steps.length, elements: els, markerX: lineX(q.left) - 20 };
}

function oralStage(q) {
  const steps = core.buildDemoSteps(q);
  const a = q.left, b = q.right, ans = q.answer;
  let X, Y, Z, l4op, l3label, splitLabel, fromA, xLeft;
  if (q.methodId === 'make-ten') {
    X = 10 - a; Y = b - X; Z = 10; l4op = '+'; l3label = a + '+' + X;
    splitLabel = b + '=' + X + '+' + Y; fromA = false; xLeft = true;
  } else if (q.methodId === 'break-ten') {
    X = 10; Y = a - 10; Z = 10 - b; l4op = '+'; l3label = '10−' + b;
    splitLabel = a + '=10+' + Y; fromA = true; xLeft = false;
  } else {
    X = a % 10; Y = b - X; Z = 10; l4op = '−'; l3label = a + '−' + X;
    splitLabel = b + '=' + X + '+' + Y; fromA = false; xLeft = true;
  }
  const cls = v => (v === 10 ? 'sten' : 'sp1');
  const L2y = 96, L3y = 186, L4y = 262;
  const leftX = fromA ? 8 : 88, rightX = fromA ? 128 : 208;
  const els = [];
  const blk = (text, c, x, y, step) => els.push({ type: 'block', x: x, y: y, text: String(text), cls: c, step: step });
  const op = (text, x, y, step) => els.push({ type: 'op', x: x, y: y, text: text, step: step });
  blk(a, 'sc1', 68, 8, 0); op(q.operator, 120, 8, 0); blk(b, 'sc2', 148, 8, 0); op('=', 200, 8, 0); blk(ans, 'sans', 228, 8, 0);
  if (xLeft) { blk(X, cls(X), leftX, L2y, 2); blk(Y, 'sp2', rightX, L2y, 2); }
  else { blk(Y, 'sp2', leftX, L2y, 2); blk(X, cls(X), rightX, L2y, 2); }
  const zx = xLeft ? leftX : rightX;
  blk(Z, cls(Z), zx, L3y, 4);
  if (xLeft) { blk(Z, cls(Z), leftX, L4y, 6); op(l4op, 160, L4y, 6); blk(Y, 'sp2', rightX, L4y, 6); op('=', 260, L4y, 6); blk(ans, 'sans', 288, L4y, 6); }
  else { blk(Y, 'sp2', leftX, L4y, 6); op(l4op, 80, L4y, 6); blk(Z, cls(Z), rightX, L4y, 6); op('=', 180, L4y, 6); blk(ans, 'sans', 208, L4y, 6); }
  const sx = fromA ? 90 : 170, ccx = zx + 22, yc = (xLeft ? rightX : leftX) + 22;
  const arr = (x1, y1, x2, y2, s) => els.push({ type: 'line', x1: x1, y1: y1, x2: x2, y2: y2,
    stroke: '#999', width: 2.5, dash: [5, 4], marker: true, markerColor: '#999', step: s });
  arr(sx, 54, leftX + 22, 92, 1);
  arr(sx, 54, rightX + 22, 92, 1);
  arr(ccx, 142, ccx, 182, 3);
  els.push({ type: 'path', step: 3, stroke: '#999', width: 2.5, dash: [5, 4], marker: true, markerColor: '#999',
    segs: fromA
      ? [{ c: 'M', pts: [176, 53] }, { c: 'C', pts: [192, 74, 198, 100, 192, 126] }, { c: 'C', pts: [187, 152, 178, 172, 164, 181] }]
      : [{ c: 'M', pts: [82, 53] }, { c: 'C', pts: [64, 76, 57, 104, 61, 132] }, { c: 'C', pts: [65, 164, 72, 177, 92, 181] }] });
  arr(ccx, 232, ccx, 258, 5);
  arr(yc, 142, yc, 258, 5);
  els.push({ type: 'text', x: sx, y: 78, text: splitLabel, size: 12, color: '#666', align: 'center', bold: true, step: 1 });
  els.push({ type: 'text', x: ccx + 10, y: 166, text: l3label, size: 12, color: '#666', align: 'start', bold: true, step: 3 });
  return { kind: 'oral', steps: steps, maxStep: 6, elements: els };
}

function placeStage(q) {
  const steps = core.buildDemoSteps(q).filter(s => ['ones', 'tens', 'hundreds'].indexOf(s.focus) >= 0);
  const digits = String(q.left).length;
  const start = digits === 3 ? 118 : 178;
  const names = ['百位', '十位', '个位'].slice(3 - digits);
  const els = [];
  names.forEach((n, i) => els.push({ type: 'text', x: start + i * 60, y: 16, text: n.replace('位', ''), size: 11, color: '#aaa', align: 'center', bold: true, step: 0 }));
  const col = (value, c, y, stepFor) => {
    String(value).padStart(digits, ' ').split('').forEach((d, i) => {
      if (d === ' ') return;
      els.push({ type: 'block', x: start + i * 60 - 22, y: y, text: d, cls: c, step: stepFor(i) });
    });
  };
  col(q.left, 'sc1', 62, () => 0);
  col(q.right, 'sc2', 118, () => 0);
  col(q.answer, 'sans', 198, i => digits - i);
  els.push({ type: 'op', x: 66, y: 120, text: q.operator, step: 0, size: 28 });
  els.push({ type: 'line', x1: 82, y1: 174, x2: 278, y2: 174, stroke: '#777', width: 4, step: 0, cap: 'round' });
  let carryIn = 0, borrowIn = 0;
  for (let c = 0; c < digits; c += 1) {
    const step = c + 1, curIdx = digits - 1 - c, currentX = start + curIdx * 60, power = 10 ** c;
    const ld = Math.floor(q.left / power) % 10, rd = Math.floor(q.right / power) % 10;
    let transfer = false, label = '';
    if (q.operator === '+') {
      const total = ld + rd + carryIn, out = Math.floor(total / 10);
      transfer = out === 1; label = '进1'; carryIn = out;
    } else {
      const available = ld - borrowIn, out = available < rd ? 1 : 0;
      transfer = out === 1; label = '借1'; borrowIn = out;
    }
    if (c < digits - 1) {
      const nextX = currentX - 60;
      if (transfer) {
        els.push(q.operator === '+'
          ? { type: 'quad', p0: [currentX, 158], cp: [currentX - 30, 28], p1: [nextX, 54], stroke: '#E0306E', width: 2.8, dash: [5, 3], marker: true, markerColor: '#E0306E', step: step }
          : { type: 'quad', p0: [nextX, 56], cp: [currentX - 30, 16], p1: [currentX, 54], stroke: '#E0306E', width: 2.8, dash: [5, 3], marker: true, markerColor: '#E0306E', step: step });
        els.push({ type: 'note', x: nextX - 17, y: 28, text: label, step: step });
      } else {
        els.push({ type: 'line', x1: currentX, y1: 238, x2: nextX, y2: 238, stroke: '#4DABF7', width: 2.5, dash: [5, 4], marker: true, markerColor: '#E0306E', step: step });
      }
    }
  }
  steps.slice(0, digits).forEach((s, i) => els.push({ type: 'caption', text: s.caption, step: i + 1 }));
  return { kind: 'place', steps: steps, maxStep: digits, elements: els };
}

function buildStage(q, themeColor) {
  const kind = kindOf(q.methodId);
  if (kind === 'line') return lineStage(q, themeColor);
  if (kind === 'oral') return oralStage(q);
  return placeStage(q);
}

/* 弹窗标题彩色段(网页端 updateAnimTitle 的 innerHTML 拆段),color 空 = 普通文字 */
const TT = { c1: '#4DABF7', c2: '#FF9500', p1: '#FF5C8D', p2: '#9775FA', ten: '#34C759' };
const seg = (text, c) => ({ text: text, color: c ? TT[c] : '' });

function titleSegments(q) {
  const id = q.methodId;
  if (id === 'line-add') {
    return [seg('💡 线段加法：小青蛙从 '), seg(String(q.left), 'c1'), seg(' 出发，往前跳 '),
      seg(String(q.right), 'c2'), seg(' 步，落在 '), seg(String(q.answer), 'ten')];
  }
  if (id === 'line-sub') {
    return [seg('💡 线段减法：小青蛙从 '), seg(String(q.left), 'c1'), seg(' 出发，往回跳 '),
      seg(String(q.right), 'c2'), seg(' 步，剩下 '), seg(String(q.answer), 'ten')];
  }
  if (id === 'make-ten') {
    const p = 10 - q.left;
    return [seg('💡 凑十法：把 '), seg(String(q.right), 'c2'), seg(' 分成 '), seg(String(p), 'p1'),
      seg(' 和 '), seg(String(q.right - p), 'p2'), seg('，和 '), seg(String(q.left), 'c1'), seg(' 先凑成 10')];
  }
  if (id === 'break-ten') {
    return [seg('💡 破十法：把 '), seg(String(q.left), 'c1'), seg(' 分成 '), seg('10', 'ten'),
      seg(' 和 '), seg(String(q.left - 10), 'p2'), seg('，先算 10 − '), seg(String(q.right), 'c2')];
  }
  if (id === 'level-ten') {
    const p = q.left % 10;
    return [seg('💡 平十法：把 '), seg(String(q.right), 'c2'), seg(' 分成 '), seg(String(p), 'p1'),
      seg(' 和 '), seg(String(q.right - p), 'p2'), seg('，先减 '), seg(String(p), 'p1'), seg(' 得到 10')];
  }
  const m = core.METHODS.filter(x => x.id === id)[0] || { title: '', summary: '' };
  return [seg('💡 ' + m.title + '：' + m.summary)];
}

module.exports = { kindOf, buildStage, titleSegments };
