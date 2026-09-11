/* 古诗卡片:mora 网页端 poems.html 同款。内容走服务端诗库 /api/poems(每家一份,
   网页端 poem-edit.html 仅管理员在线维护),与网页端 lib/poems-store.js 同协议:
   打包种子(离线兜底,与 lib/poems-data.js 逐字一致,带 cat 分类)→ 缓存为第一读取点
   → 登录后拉远端,updatedAt 更新且通过校验才整表替换。
   掌握进度多端同步:协议与网页端 lib/progress-sync.js 一致(/api/progress module=poems,
   itemKey = 题目|首句(含标点),与网页端 MoraSync.pushOne("poems", pmKey, …) 同键
   ——两首《绝句》题目相同,靠首句区分;键位不绑当前诗库,库里删掉的诗记录不丢),
   本地存储为第一写入点,进页面拉取合并、点标记异步上报,同键 updatedAt 新者胜。
   zen 模式左右滑动 randomNext 随机换诗(不与当前重复)。 */
const auth = require('./auth');

/* 离线兜底种子,与网页端 lib/poems-data.js 逐字一致(两端变更需同步维护):
   t 题目 / tp 题目拼音 / d 朝代 / p 诗人 / pp 诗人拼音 / cat 分类 /
   c 正文逐句(含标点) / y 拼音逐句(与汉字一一对应,标点不计;一/不变调已标) */
const SEED = [
  {
    t:"咏鹅", tp:"yǒng é", d:"唐", p:"骆宾王", pp:"luò bīn wáng", cat:"一年级上册",
    c:["鹅，鹅，鹅，","曲项向天歌。","白毛浮绿水，","红掌拨清波。"],
    y:["é é é","qū xiàng xiàng tiān gē","bái máo fú lǜ shuǐ","hóng zhǎng bō qīng bō"]
  },
  {
    t:"画", tp:"huà", d:"唐", p:"王维", pp:"wáng wéi", cat:"一年级上册",
    c:["远看山有色，","近听水无声。","春去花还在，","人来鸟不惊。"],
    y:["yuǎn kàn shān yǒu sè","jìn tīng shuǐ wú shēng","chūn qù huā hái zài","rén lái niǎo bù jīng"]
  },
  {
    t:"悯农·其二", tp:"mǐn nóng qí èr", d:"唐", p:"李绅", pp:"lǐ shēn", cat:"一年级上册",
    c:["锄禾日当午，","汗滴禾下土。","谁知盘中餐，","粒粒皆辛苦。"],
    y:["chú hé rì dāng wǔ","hàn dī hé xià tǔ","shuí zhī pán zhōng cān","lì lì jiē xīn kǔ"]
  },
  {
    t:"江南", tp:"jiāng nán", d:"汉", p:"乐府", pp:"yuè fǔ", cat:"一年级上册",
    c:["江南可采莲，","莲叶何田田。","鱼戏莲叶间。","鱼戏莲叶东，","鱼戏莲叶西，","鱼戏莲叶南，","鱼戏莲叶北。"],
    y:["jiāng nán kě cǎi lián","lián yè hé tián tián","yú xì lián yè jiān","yú xì lián yè dōng","yú xì lián yè xī","yú xì lián yè nán","yú xì lián yè běi"]
  },
  {
    t:"古朗月行（节选）", tp:"gǔ lǎng yuè xíng jié xuǎn", d:"唐", p:"李白", pp:"lǐ bái", cat:"一年级上册",
    c:["小时不识月，","呼作白玉盘。","又疑瑶台镜，","飞在青云端。"],
    y:["xiǎo shí bù shí yuè","hū zuò bái yù pán","yòu yí yáo tái jìng","fēi zài qīng yún duān"]
  },
  {
    t:"风", tp:"fēng", d:"唐", p:"李峤", pp:"lǐ qiáo", cat:"一年级上册",
    c:["解落三秋叶，","能开二月花。","过江千尺浪，","入竹万竿斜。"],
    y:["jiě luò sān qiū yè","néng kāi èr yuè huā","guò jiāng qiān chǐ làng","rù zhú wàn gān xié"]
  },
  {
    t:"春晓", tp:"chūn xiǎo", d:"唐", p:"孟浩然", pp:"mèng hào rán", cat:"一年级下册",
    c:["春眠不觉晓，","处处闻啼鸟。","夜来风雨声，","花落知多少。"],
    y:["chūn mián bù jué xiǎo","chù chù wén tí niǎo","yè lái fēng yǔ shēng","huā luò zhī duō shǎo"]
  },
  {
    t:"寻隐者不遇", tp:"xún yǐn zhě bú yù", d:"唐", p:"贾岛", pp:"jiǎ dǎo", cat:"一年级下册",
    c:["松下问童子，","言师采药去。","只在此山中，","云深不知处。"],
    y:["sōng xià wèn tóng zǐ","yán shī cǎi yào qù","zhǐ zài cǐ shān zhōng","yún shēn bù zhī chù"]
  },
  {
    t:"赠汪伦", tp:"zèng wāng lún", d:"唐", p:"李白", pp:"lǐ bái", cat:"一年级下册",
    c:["李白乘舟将欲行，","忽闻岸上踏歌声。","桃花潭水深千尺，","不及汪伦送我情。"],
    y:["lǐ bái chéng zhōu jiāng yù xíng","hū wén àn shàng tà gē shēng","táo huā tán shuǐ shēn qiān chǐ","bù jí wāng lún sòng wǒ qíng"]
  },
  {
    t:"静夜思", tp:"jìng yè sī", d:"唐", p:"李白", pp:"lǐ bái", cat:"一年级下册",
    c:["床前明月光，","疑是地上霜。","举头望明月，","低头思故乡。"],
    y:["chuáng qián míng yuè guāng","yí shì dì shàng shuāng","jǔ tóu wàng míng yuè","dī tóu sī gù xiāng"]
  },
  {
    t:"池上", tp:"chí shàng", d:"唐", p:"白居易", pp:"bái jū yì", cat:"一年级下册",
    c:["小娃撑小艇，","偷采白莲回。","不解藏踪迹，","浮萍一道开。"],
    y:["xiǎo wá chēng xiǎo tǐng","tōu cǎi bái lián huí","bù jiě cáng zōng jì","fú píng yí dào kāi"]
  },
  {
    t:"小池", tp:"xiǎo chí", d:"宋", p:"杨万里", pp:"yáng wàn lǐ", cat:"一年级下册",
    c:["泉眼无声惜细流，","树阴照水爱晴柔。","小荷才露尖尖角，","早有蜻蜓立上头。"],
    y:["quán yǎn wú shēng xī xì liú","shù yīn zhào shuǐ ài qíng róu","xiǎo hé cái lù jiān jiān jiǎo","zǎo yǒu qīng tíng lì shàng tóu"]
  },
  {
    t:"画鸡", tp:"huà jī", d:"明", p:"唐寅", pp:"táng yín", cat:"一年级下册",
    c:["头上红冠不用裁，","满身雪白走将来。","平生不敢轻言语，","一叫千门万户开。"],
    y:["tóu shàng hóng guān bú yòng cái","mǎn shēn xuě bái zǒu jiāng lái","píng shēng bù gǎn qīng yán yǔ","yì jiào qiān mén wàn hù kāi"]
  },
  {
    t:"登鹳雀楼", tp:"dēng guàn què lóu", d:"唐", p:"王之涣", pp:"wáng zhī huàn", cat:"二年级及拓展",
    c:["白日依山尽，","黄河入海流。","欲穷千里目，","更上一层楼。"],
    y:["bái rì yī shān jìn","huáng hé rù hǎi liú","yù qióng qiān lǐ mù","gèng shàng yì céng lóu"]
  },
  {
    t:"悯农·其一", tp:"mǐn nóng qí yī", d:"唐", p:"李绅", pp:"lǐ shēn", cat:"二年级及拓展",
    c:["春种一粒粟，","秋收万颗子。","四海无闲田，","农夫犹饿死。"],
    y:["chūn zhòng yí lì sù","qiū shōu wàn kē zǐ","sì hǎi wú xián tián","nóng fū yóu è sǐ"]
  },
  {
    t:"咏柳", tp:"yǒng liǔ", d:"唐", p:"贺知章", pp:"hè zhī zhāng", cat:"二年级及拓展",
    c:["碧玉妆成一树高，","万条垂下绿丝绦。","不知细叶谁裁出，","二月春风似剪刀。"],
    y:["bì yù zhuāng chéng yí shù gāo","wàn tiáo chuí xià lǜ sī tāo","bù zhī xì yè shuí cái chū","èr yuè chūn fēng sì jiǎn dāo"]
  },
  {
    t:"绝句", tp:"jué jù", d:"唐", p:"杜甫", pp:"dù fǔ", cat:"二年级及拓展",
    c:["迟日江山丽，","春风花草香。","泥融飞燕子，","沙暖睡鸳鸯。"],
    y:["chí rì jiāng shān lì","chūn fēng huā cǎo xiāng","ní róng fēi yàn zi","shā nuǎn shuì yuān yāng"]
  },
  {
    t:"绝句", tp:"jué jù", d:"唐", p:"杜甫", pp:"dù fǔ", cat:"二年级及拓展",
    c:["两个黄鹂鸣翠柳，","一行白鹭上青天。","窗含西岭千秋雪，","门泊东吴万里船。"],
    y:["liǎng gè huáng lí míng cuì liǔ","yì háng bái lù shàng qīng tiān","chuāng hán xī lǐng qiān qiū xuě","mén bó dōng wú wàn lǐ chuán"]
  },
  {
    t:"江雪", tp:"jiāng xuě", d:"唐", p:"柳宗元", pp:"liǔ zōng yuán", cat:"二年级及拓展",
    c:["千山鸟飞绝，","万径人踪灭。","孤舟蓑笠翁，","独钓寒江雪。"],
    y:["qiān shān niǎo fēi jué","wàn jìng rén zōng miè","gū zhōu suō lì wēng","dú diào hán jiāng xuě"]
  },
];

/* 每首古诗的渐变主色 / 辅色:与网页端 poems.html COLORS 一致,按下标循环 */
const COLORS = [
  ['#20C997', '#12B886'], ['#FF6B9D', '#E0306E'], ['#9775FA', '#7048E8'],
  ['#FF922B', '#E07000'], ['#4DABF7', '#1C7ED6'], ['#22B8CF', '#1098AD'],
  ['#FF6B6B', '#E05050'], ['#51CF66', '#2F9E44'], ['#FAB005', '#E67700'],
  ['#E64980', '#C2255C'], ['#748FFC', '#4263EB'],
];

/* 分类节头胶囊色:与网页端 poems.html CATCOLORS 一致,按分类出现序循环 */
const CATCOLORS = ['#FF922B', '#20C997', '#9775FA', '#4DABF7', '#FF6B9D', '#51CF66'];

/* ── 内容库:缓存→种子兜底→登录后拉 /api/poems(与网页端 poems-store 同协议) ── */
const CACHE_KEY = 'mora-poems-dataset';
const API_BASE = 'https://www.tcued.com';

/* 唯一键:题目|首句(含标点),与网页端 pmKey 同算法——两首《绝句》靠首句区分 */
function key(pm) {
  return pm.t + '|' + pm.c[0];
}

/* 整库校验:与服务端 valid_poems 同口径(防坏数据渲染崩页)。
   t/tp/d/p/pp/cat 非空字符串限长,c 正文逐句(1..40 句,每句 ≤120 字)与
   y 拼音逐句等长(每句 ≤400 字符),题目|首句 唯一 */
function validPoems(data) {
  if (!Array.isArray(data) || !data.length || data.length > 500) return false;
  const seen = new Set();
  for (const pm of data) {
    if (!pm || typeof pm !== 'object') return false;
    const limits = { t: 60, tp: 120, d: 10, p: 40, pp: 80, cat: 30 };
    for (const k of Object.keys(limits)) {
      const v = pm[k];
      if (typeof v !== 'string' || !v || v.length > limits[k]) return false;
    }
    const c = pm.c, y = pm.y;
    if (!Array.isArray(c) || c.length < 1 || c.length > 40
        || !c.every(x => typeof x === 'string' && x && x.length <= 120)) return false;
    if (!Array.isArray(y) || y.length !== c.length
        || !y.every(x => typeof x === 'string' && x.length <= 400)) return false;
    const k = pm.t + '|' + c[0];
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}

/* 当前内容库:缓存(校验通过才采用,防脏缓存)→ 种子 */
let cur = null;
function dataset() {
  if (cur) return cur.data;
  try {
    const c = JSON.parse(wx.getStorageSync(CACHE_KEY) || 'null');
    if (c && Array.isArray(c.data) && validPoems(c.data)) { cur = c; return c.data; }
  } catch (e) { /* 缓存不可用走种子 */ }
  cur = { updatedAt: 0, data: SEED };
  return cur.data;
}

/* 拉远端诗库,updatedAt 更新且校验通过才整表替换(离线/失败静默,等价用种子/缓存)。
   done(updated):有更新回 true,否则 false;401/403 弹登录门 */
function refreshContent(done) {
  const token = auth.getToken();
  if (!token) { if (done) done(false); return; }
  wx.request({
    url: API_BASE + '/api/poems?token=' + encodeURIComponent(token),
    method: 'GET',
    success(res) {
      if (res.statusCode === 401 || res.statusCode === 403) { auth.on401(); if (done) done(false); return; }
      const j = res.data;
      if (!j || !j.ok || !Array.isArray(j.data)) { if (done) done(false); return; }
      if (!validPoems(j.data)) { if (done) done(false); return; }
      const ua = j.updatedAt || 0;
      if (ua > (cur && cur.updatedAt || 0)) {
        cur = { updatedAt: ua, data: j.data };
        try { wx.setStorageSync(CACHE_KEY, JSON.stringify(cur)); } catch (e) { /* 存储失败本次内存生效 */ }
        if (done) done(true);
        return;
      }
      if (done) done(false);
    },
    fail() { if (done) done(false); },
  });
}

/* 汉字范围(基本区),区分汉字与标点,与网页端一致 */
const HAN = /[\u4e00-\u9fff]/;

/* 纯函数:一行文本 + 对应拼音 → 逐字注音块(小程序无 ruby,自绘「拼音在上、字在下」列)。
   汉字取对应拼音,标点 punc 标记(拼音位留空占位,保持列对齐) */
function tokenize(text, py) {
  const pys = py ? py.trim().split(/\s+/) : [];
  let i = 0;
  const tokens = [];
  for (const ch of text) {
    if (HAN.test(ch)) {
      tokens.push({ ix: tokens.length, ch: ch, py: pys[i++] || '' });
    } else {
      tokens.push({ ix: tokens.length, ch: ch, py: '', punc: true });
    }
  }
  return tokens;
}

/* ── 已掌握本地存储与进度同步:键位/协议与 utils/letters.js 同款,MODULE 对齐网页端 ── */
const MASTER_KEY = 'mora-poems-mastered-v1';
const TS_KEY = 'mora-poems-mastered-ts-v1';
const DEVICE_KEY = 'mora-device';
const MODULE = 'poems';

/* 掌握键位不绑当前诗库(网页端 sync 只按 module 过滤):只做宽松形状校验 */
function validKey(k) {
  return typeof k === 'string' && k.length > 0 && k.length <= 120;
}

function loadMastered() {
  try {
    const v = wx.getStorageSync(MASTER_KEY);
    if (!Array.isArray(v)) return {};
    const map = {};
    v.forEach(k => { if (validKey(k)) map[k] = true; });
    return map;
  } catch (e) {
    return {};
  }
}

function loadTs() {
  try {
    const v = wx.getStorageSync(TS_KEY);
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch (e) {
    return {};
  }
}

function saveStore(map, ts) {
  try {
    wx.setStorageSync(MASTER_KEY, Object.keys(map));
    wx.setStorageSync(TS_KEY, ts);
  } catch (e) { /* 存储失败静默,不影响浏览 */ }
}

/* 设备名(上报来源标识):与 auth.js/letters.js 共用 mora-device 键 */
function deviceName() {
  let d = '';
  try { d = wx.getStorageSync(DEVICE_KEY); } catch (e) { /* 存储不可用时现场生成 */ }
  if (d) return d;
  let prefix = 'wx';
  try {
    const info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
    prefix = (info && info.platform) || 'wx';
  } catch (e) { /* 取不到平台信息用默认前缀 */ }
  d = prefix + '-' + Math.random().toString(16).slice(2, 6);
  try { wx.setStorageSync(DEVICE_KEY, d); } catch (e) { /* 同上 */ }
  return d;
}

/* 上报条目(离线/未登录/失败静默:本地存储始终是第一写入点,登录后 syncMastered 补传) */
function pushItems(items) {
  const token = auth.getToken();
  if (!token) return;
  wx.request({
    url: API_BASE + '/api/progress',
    method: 'POST',
    header: { 'Content-Type': 'application/json' },
    data: {
      token: token,
      items: items.map(it => ({
        module: MODULE,
        itemKey: it.itemKey,
        mastered: it.mastered ? 1 : 0,
        updatedAt: it.updatedAt,
        device: deviceName(),
      })),
    },
    success(res) {
      if (res.statusCode === 401) auth.on401();
    },
    fail() { /* 静默:下次进入页面 syncMastered 会按时间戳补传 */ },
  });
}

/* 标记/取消掌握(传题目|首句键):先写本地,再 fire-and-forget 上报 */
function markMastered(k, done) {
  if (!validKey(k)) return;
  const map = loadMastered();
  if (done) map[k] = true; else delete map[k];
  const now = Date.now();
  const ts = loadTs();
  ts[k] = now;
  saveStore(map, ts);
  pushItems([{ itemKey: k, mastered: done ? 1 : 0, updatedAt: now }]);
}

/* 本地条目 → 同步协议格式(无时间戳的旧数据按当下补记,与网页端一致) */
function localItems() {
  const map = loadMastered();
  const ts = loadTs();
  const now = Date.now();
  return Object.keys(map).filter(validKey)
    .map(k => ({ itemKey: k, mastered: 1, updatedAt: ts[k] || now }));
}

/* 纯函数:合并本地/远端条目,同 itemKey 取 updatedAt 新者(相等取本地),与网页端一致 */
function mergeItems(localItems_, remoteItems) {
  const byKey = new Map((remoteItems || []).map(r => [r.itemKey, r]));
  const merged = [];
  for (const it of localItems_ || []) {
    const r = byKey.get(it.itemKey);
    merged.push(r && r.updatedAt > it.updatedAt ? r : it);
    if (r) byKey.delete(it.itemKey);
  }
  for (const r of byKey.values()) merged.push(r);
  return merged;
}

/* 纯函数:挑出需要补传的本地条目(比远端新,或远端没有) */
function itemsToPush(localItems_, remoteItems) {
  const remote = new Map((remoteItems || []).map(r => [r.itemKey, r.updatedAt]));
  return (localItems_ || []).filter(l => l.updatedAt > (remote.has(l.itemKey) ? remote.get(l.itemKey) : -1));
}

/* 拉取远端合并到本地(只认 poems 模块与合法键位),成功 done(合并后掌握map)。
   合并后把「本地更新过的条目」补传,保证本机改动不丢。 */
function syncMastered(done) {
  wx.request({
    url: API_BASE + '/api/progress?token=' + encodeURIComponent(auth.getToken()),
    method: 'GET',
    success(res) {
      if (res.statusCode === 401) { auth.on401(); return; }
      const data = res.data;
      const items = data && data.ok && Array.isArray(data.items) ? data.items : [];
      const remote = items.filter(it => it && it.module === MODULE && validKey(it.itemKey));
      const local = localItems();
      const merged = mergeItems(local, remote);
      const map = {};
      const ts = loadTs();
      merged.forEach(m => {
        ts[m.itemKey] = m.updatedAt;
        if (m.mastered === 1) map[m.itemKey] = true;
      });
      saveStore(map, ts);
      const newer = itemsToPush(local, remote);
      if (newer.length) pushItems(newer);
      if (done) done(map);
    },
    fail() { /* 离线:用本地原样 */ },
  });
}

/* 卡片视图(基于当前诗库):i 全库序(zen 导航用)/ key 唯一键 / cat 分类 /
   titleTokens·poetTokens·lines 逐字注音块 / c1·c2 网页端同款渐变色对 / mastered */
function views(masteredMap) {
  const data = dataset();
  return data.map((d, i) => ({
    i,
    key: key(d),
    t: d.t,
    d: d.d,
    p: d.p,
    cat: d.cat,
    titleTokens: tokenize(d.t, d.tp),
    poetTokens: tokenize(d.p, d.pp),
    lines: d.c.map((line, li) => ({ ix: li, tokens: tokenize(line, d.y[li]) })),
    c1: COLORS[i % COLORS.length][0],
    c2: COLORS[i % COLORS.length][1],
    mastered: !!(masteredMap && masteredMap[key(d)]),
  }));
}

/* 分类分节(网页端 renderPoems 同款):按 cat 首次出现序分组,节头胶囊色循环 */
function sections(items) {
  const cats = [];
  (items || []).forEach(it => { if (it.cat && cats.indexOf(it.cat) < 0) cats.push(it.cat); });
  return cats.map((cat, ci) => ({
    key: cat,
    color: CATCOLORS[ci % CATCOLORS.length],
    items: items.filter(it => it.cat === cat),
  }));
}

function countAll() {
  return dataset().length;
}

function countMastered(masteredMap) {
  return dataset().filter(d => masteredMap[key(d)]).length;
}

/* zen 模式左右滑动随机换诗:等概率取「非当前」的一首(不与当前重复) */
function randomNext(curIdx, rand) {
  const rnd = rand || Math.random;
  const n = dataset().length;
  if (n <= 1) return 0;
  let j = Math.floor(rnd() * (n - 1));
  if (j >= curIdx) j += 1;
  return j;
}

module.exports = {
  SEED, COLORS, CATCOLORS,
  key, validPoems, dataset, refreshContent, tokenize,
  loadMastered, loadTs, saveStore, deviceName,
  pushItems, markMastered, localItems, mergeItems, itemsToPush, syncMastered,
  views, sections, countAll, countMastered, randomNext,
};
