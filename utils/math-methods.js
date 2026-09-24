/* 数学方法动画课 core 算法:与网页端 mora/math-methods-core.js 同口径移植
   (9 课清单/出题约束/分步演示数据/判答/书写方向),两端变更需同步维护。
   纯函数零依赖,Node 直测(tests/math-methods.test.js)。 */
'use strict';

const METHODS = [
  {id:'line-add', title:'10以内加法', short:'线段加', operator:'+', summary:'沿数线往前跳，落在几就得几', tip:'往前跳几步，落在几，答案就是几', color:'#22b8cf', example:'3 + 4'},
  {id:'line-sub', title:'10以内减法', short:'线段减', operator:'-', summary:'沿数线往回跳，剩几就得几', tip:'往回跳几步，剩下几，答案就是几', color:'#fa5252', example:'9 - 2'},
  {id:'make-ten', title:'凑十法', short:'凑十', operator:'+', summary:'拆一个数，先凑成 10', color:'#f59e0b', example:'8 + 5'},
  {id:'break-ten', title:'破十法', short:'破十', operator:'-', summary:'把十几拆成 10 和几', color:'#ef4444', example:'15 - 9'},
  {id:'level-ten', title:'平十法', short:'平十', operator:'-', summary:'先减到 10，再接着减', color:'#8b5cf6', example:'15 - 9'},
  {id:'two-digit-add', title:'两位数 + 两位数', short:'两位加', operator:'+', summary:'个位满十，向十位进 1', color:'#0ea5e9', example:'38 + 27'},
  {id:'two-digit-sub', title:'两位数 - 两位数', short:'两位减', operator:'-', summary:'个位不够，向十位借 1', color:'#14b8a6', example:'52 - 38'},
  {id:'three-two-add', title:'三位数 + 两位数', short:'三位加', operator:'+', summary:'数位对齐，逐位相加', color:'#2563eb', example:'168 + 47'},
  {id:'three-two-sub', title:'三位数 - 两位数', short:'三位减', operator:'-', summary:'数位对齐，逐位借位', color:'#ec4899', example:'302 - 47'}
];

const METHOD_MAP = Object.fromEntries(METHODS.map(method => [method.id, method]));
const integer = (min, max, random) => min + Math.floor(random() * (max - min + 1));

function findQuestion(methodId, random, predicate, leftRange, rightRange) {
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const left = integer(leftRange[0], leftRange[1], random);
    const right = integer(rightRange[0], rightRange[1], random);
    if (!predicate(left, right)) continue;
    const operator = METHOD_MAP[methodId].operator;
    return {methodId, left, right, operator, answer: operator === '+' ? left + right : left - right};
  }
  throw new Error('无法生成符合条件的题目: ' + methodId);
}

function makeQuestion(methodId, random) {
  const rng = typeof random === 'function' ? random : Math.random;
  if (!METHOD_MAP[methodId]) throw new Error('未知教学方法: ' + methodId);
  if (methodId === 'line-add') {
    return findQuestion(methodId, rng, (a,b) => a + b <= 10, [1,9], [1,9]);
  }
  if (methodId === 'line-sub') {
    return findQuestion(methodId, rng, (a,b) => a >= b, [2,10], [1,9]);
  }
  if (methodId === 'make-ten') {
    return findQuestion(methodId, rng, (a,b) => a + b > 10, [5,9], [2,9]);
  }
  if (methodId === 'break-ten' || methodId === 'level-ten') {
    return findQuestion(methodId, rng, (a,b) => b > a % 10, [11,18], [2,9]);
  }
  if (methodId === 'two-digit-add') {
    return findQuestion(methodId, rng, (a,b) => a + b <= 99 && a % 10 + b % 10 >= 10, [12,87], [11,76]);
  }
  if (methodId === 'two-digit-sub') {
    return findQuestion(methodId, rng, (a,b) => a > b && a % 10 < b % 10, [21,98], [12,89]);
  }
  if (methodId === 'three-two-add') {
    return findQuestion(methodId, rng, (a,b) => a + b <= 999 && a % 10 + b % 10 >= 10, [101,948], [11,89]);
  }
  return findQuestion(methodId, rng, (a,b) => a > b && a % 10 < b % 10, [101,999], [12,99]);
}

function oralSteps(question) {
  const {methodId, left:a, right:b, answer} = question;
  if (methodId === 'make-ten') {
    const toTen = 10 - a, rest = b - toTen;
    return [
      {expression:`${a} + ${b}`, caption:'先看看谁离 10 更近'},
      {expression:`${a} + ${toTen} + ${rest}`, caption:`把 ${b} 分成 ${toTen} 和 ${rest}`, split:[toTen,rest]},
      {expression:`10 + ${rest}`, caption:`${a} 和 ${toTen} 凑成 10`, focus:'ten'},
      {expression:String(answer), caption:'算出答案'}
    ];
  }
  if (methodId === 'break-ten') {
    const ones = a - 10, rest = 10 - b;
    return [
      {expression:`${a} - ${b}`, caption:`把 ${a} 破成 10 和 ${ones}`},
      {expression:`10 - ${b} + ${ones}`, caption:`先算 10 - ${b}`, split:[10,ones]},
      {expression:`${rest} + ${ones}`, caption:`再把 ${ones} 加回来`, focus:'ten'},
      {expression:String(answer), caption:'算出答案'}
    ];
  }
  const first = a % 10, rest = b - first;
  return [
    {expression:`${a} - ${b}`, caption:`把 ${b} 分成 ${first} 和 ${rest}`},
    {expression:`${a} - ${first} - ${rest}`, caption:`先减 ${first}，把 ${a} 平到 10`, split:[first,rest]},
    {expression:`10 - ${rest}`, caption:`再减剩下的 ${rest}`, focus:'ten'},
    {expression:String(answer), caption:'算出答案'}
  ];
}

function makeLineQuestion(methodId, left, right) {
  if (!['line-add','line-sub'].includes(methodId)) return null;
  const a = Number(left), b = Number(right);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
  if (methodId === 'line-add') {
    if (a < 1 || a > 9 || b < 1 || b > 9 || a + b > 10) return null;
  } else {
    if (a < 1 || a > 10 || b < 1 || b > 9 || b > a) return null;
  }
  const operator = METHOD_MAP[methodId].operator;
  return {methodId, left:a, right:b, operator, answer: operator === '+' ? a + b : a - b};
}

function lineSteps(question) {
  const {left:a, right:b, operator, answer} = question;
  const forward = operator === '+';
  const steps = [{expression:`${a} ${operator} ${b}`, caption:`小青蛙从 ${a} 出发`, at:a}];
  for (let hop = 1; hop <= b; hop += 1) {
    const from = forward ? a + hop - 1 : a - (hop - 1);
    const at = forward ? a + hop : a - hop;
    steps.push({expression:`${from} → ${at}`, caption:`${forward ? '往前' : '往回'}跳 1 步，到 ${at}`, at, hop});
  }
  steps.push({
    expression:String(answer),
    caption: forward ? `一共往前跳 ${b} 步，落在 ${answer}，所以 ${a} + ${b} = ${answer}` : `一共往回跳 ${b} 步，剩下 ${answer}，所以 ${a} - ${b} = ${answer}`,
    at:answer,
    focus:'result'
  });
  return steps;
}

function additionSteps(question) {
  const {left:a, right:b, answer} = question;
  const names = ['个位','十位','百位'];
  const focuses = ['ones','tens','hundreds'];
  const columns = a >= 100 ? 3 : 2;
  const steps = [{expression:`${a} + ${b}`, caption:'相同数位要对齐', focus:'align'}];
  let carryIn = 0;
  for (let column = 0; column < columns; column += 1) {
    const power = 10 ** column;
    const leftDigit = Math.floor(a / power) % 10;
    const rightDigit = Math.floor(b / power) % 10;
    const total = leftDigit + rightDigit + carryIn;
    const carryOut = Math.floor(total / 10);
    const parts = [leftDigit];
    if (rightDigit || column < 2) parts.push(rightDigit);
    if (carryIn) parts.push(carryIn);
    let caption = `${names[column]}相加，写 ${total % 10}`;
    if (carryOut && column < columns - 1) caption += `，向${names[column + 1]}进 1`;
    else if (carryIn) caption += `，已经加上进来的 ${carryIn}`;
    steps.push({expression:`${parts.join(' + ')} = ${total}`, caption, focus:focuses[column], carry:carryOut});
    carryIn = carryOut;
  }
  steps.push({expression:String(answer), caption:'从高位到低位读出答案', focus:'result'});
  return steps;
}

function subtractionSteps(question) {
  const {left:a, right:b, answer} = question;
  const names = ['个位','十位','百位'];
  const focuses = ['ones','tens','hundreds'];
  const columns = a >= 100 ? 3 : 2;
  const steps = [{expression:`${a} - ${b}`, caption:'相同数位要对齐', focus:'align'}];
  let borrowIn = 0;
  for (let column = 0; column < columns; column += 1) {
    const power = 10 ** column;
    const leftDigit = Math.floor(a / power) % 10;
    const rightDigit = Math.floor(b / power) % 10;
    const available = leftDigit - borrowIn;
    const borrowOut = available < rightDigit ? 1 : 0;
    const working = available + borrowOut * 10;
    const result = working - rightDigit;
    let caption;
    if (borrowOut) {
      caption = `${names[column]} ${Math.max(available,0)} 不够减 ${rightDigit}，向${names[column + 1]}借 1`;
      if (column === 0 && columns === 3 && Math.floor(a / 10) % 10 === 0) {
        caption = '十位是 0，先向百位借 1；十位变 10，再借 1 给个位';
      }
    } else {
      caption = borrowIn ? `${names[column]}借出 1 后变成 ${available}，再做减法` : `${names[column]}直接相减`;
    }
    steps.push({expression:`${working} - ${rightDigit} = ${result}`, caption, focus:focuses[column], borrow:borrowOut});
    borrowIn = borrowOut;
  }
  steps.push({expression:String(answer), caption:'从高位到低位读出答案', focus:'result'});
  return steps;
}

function buildDemoSteps(question) {
  if (!question || !METHOD_MAP[question.methodId]) throw new Error('题目缺少有效的方法标识');
  if (['line-add','line-sub'].includes(question.methodId)) return lineSteps(question);
  if (['make-ten','break-ten','level-ten'].includes(question.methodId)) return oralSteps(question);
  return question.operator === '+' ? additionSteps(question) : subtractionSteps(question);
}

function checkAnswer(question, value) {
  const text = String(value == null ? '' : value);
  return /^\d+$/.test(text) && Number(text) === question.answer;
}

function writeAnswerDigit(value, digit, direction, maxLength) {
  const text = String(value == null ? '' : value);
  const nextDigit = String(digit == null ? '' : digit);
  const limit = Number.isInteger(maxLength) && maxLength > 0 ? maxLength : 3;
  if (!/^\d$/.test(nextDigit) || text.length >= limit) return text;
  return direction === 'ones-first' ? nextDigit + text : text + nextDigit;
}

function eraseAnswerDigit(value, direction) {
  const text = String(value == null ? '' : value);
  return direction === 'ones-first' ? text.slice(1) : text.slice(0, -1);
}

module.exports = { METHODS, makeQuestion, makeLineQuestion, buildDemoSteps, checkAnswer, writeAnswerDigit, eraseAnswerDigit };
