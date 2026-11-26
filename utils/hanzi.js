/* 识字卡片数据与工具:种子为 mora 网页端 lib/hanzi-seed.js 的同步副本(14 主题组 190 字)。
   字库与网页端 lib/hanzi-store.js 同协议在线维护:本地缓存优先渲染,进页面拉 /api/hanzi,
   updatedAt 更新才替换缓存(网页端维护的新字新组自动跟进),失败静默用本地。
   掌握进度多端同步:协议与网页端 lib/progress-sync.js 一致(/api/progress module=chars,
   itemKey=汉字本身),本地存储为第一写入点,进页面拉取合并、点标记异步上报,同键新者胜。
   chars 行格式 [字, [全拼,声母,介母,韵母], 多音字组词(可空), 组键];groups 行 [组键, 组名, [字…]] */
const HANZI_SEED = /*__HANZI_SEED__*/{"groups":[["num","🔢 数字",["一","二","三","四","五","六","七","八","九","十","两"]],["nature","🌿 天地自然",["日","月","水","火","土","田","木","山","洞","石","天","地","风","雨","白","云","太","阳","亮","星","河","江","海","雪","明","尘"]],["plant","🌷 花草树木",["花","草","禾","树","叶","莲","竹","林","森"]],["animal","🐣 动物",["鸟","马","牛","羊","鸡","兔","虫","鱼","狼","猫","狗","蝴","蝶","蜜","蜂"]],["body","👀 身体五官",["口","耳","目","手","头","牙","心"]],["people","👨‍👩‍👧 人物称呼",["人","子","爸","奶","妈","你","我","他","她","它","儿","爷"]],["object","🏠 事物建筑",["开","关","门","桥","台","灯","金","床","车","家","厂","本"]],["place","🏫 场所职业",["学","校","老","师","工","医","院","生","传","达","室","卫"]],["position","📍 大小方位",["大","小","上","下","中","里","东","西","南","左","右"]],["season","📅 时间季节",["春","夏","秋","冬","年","午"]],["color","🎨 颜色",["红","蓝","绿"]],["feeling","😊 感受形容",["多","少","高","兴","快","乐","好","美","丽","正","尖","圆","弯"]],["action","🏃 动作感知",["远","近","去","来","听","说","无","声","色","吃","看","见","走","步","笑","飞","爱","是","跑","跳","回","出","找","坐","玩","哭","起","喝","到","睡","立","采","戏","用","参","加","在"]],["common","✏️ 常用字",["只","又","了","不","的","几","个","什","么","为","可","有","饭","谢","公","就"]]],"chars":[["日",["rì","r","","ì"],"","nature"],["月",["yuè","y","ü","è"],"","nature"],["水",["shuǐ","sh","u","ěi"],"","nature"],["火",["huǒ","h","u","ǒ"],"","nature"],["土",["tǔ","t","","ǔ"],"","nature"],["木",["mù","m","","ù"],"","nature"],["山",["shān","sh","","ān"],"","nature"],["天",["tiān","t","i","ān"],"","nature"],["地",["dì","d","","ì"],"地上","nature"],["风",["fēng","f","","ēng"],"","nature"],["雨",["yǔ","y","","ǚ"],"","nature"],["口",["kǒu","k","","ǒu"],"","body"],["耳",["ěr","","","ěr"],"","body"],["目",["mù","m","","ù"],"","body"],["手",["shǒu","sh","","ǒu"],"","body"],["人",["rén","r","","én"],"","people"],["子",["zǐ","z","","ǐ"],"子女","people"],["爸",["bà","b","","à"],"","people"],["奶",["nǎi","n","","ǎi"],"","people"],["你",["nǐ","n","","ǐ"],"","people"],["我",["wǒ","w","","ǒ"],"","people"],["他",["tā","t","","ā"],"","people"],["她",["tā","t","","ā"],"","people"],["它",["tā","t","","ā"],"","people"],["开",["kāi","k","","āi"],"","object"],["关",["guān","g","u","ān"],"","object"],["门",["mén","m","","én"],"","object"],["桥",["qiáo","q","i","áo"],"","object"],["台",["tái","t","","ái"],"台子","object"],["金",["jīn","j","","īn"],"","object"],["中",["zhōng","zh","","ōng"],"中间","position"],["小",["xiǎo","x","i","ǎo"],"","position"],["远",["yuǎn","y","ü","ǎn"],"","action"],["近",["jìn","j","","ìn"],"","action"],["色",["sè","s","","è"],"","action"],["听",["tīng","t","","īng"],"","action"],["无",["wú","w","","ú"],"","action"],["声",["shēng","sh","","ēng"],"","action"],["去",["qù","q","","ǜ"],"","action"],["来",["lái","l","","ái"],"","action"],["鸟",["niǎo","n","i","ǎo"],"","animal"],["马",["mǎ","m","","ǎ"],"","animal"],["一",["yī","y","","ī"],"","num"],["二",["èr","","","èr"],"","num"],["三",["sān","s","","ān"],"","num"],["四",["sì","s","","ì"],"","num"],["五",["wǔ","w","","ǔ"],"","num"],["六",["liù","l","i","òu"],"","num"],["七",["qī","q","","ī"],"","num"],["八",["bā","b","","ā"],"","num"],["九",["jiǔ","j","i","ǒu"],"","num"],["十",["shí","sh","","í"],"","num"],["两",["liǎng","l","i","ǎng"],"","num"],["白",["bái","b","","ái"],"","nature"],["云",["yún","y","","ǘn"],"","nature"],["太",["tài","t","","ài"],"","nature"],["阳",["yáng","y","i","áng"],"","nature"],["亮",["liàng","l","i","àng"],"","nature"],["星",["xīng","x","","īng"],"","nature"],["花",["huā","h","u","ā"],"","plant"],["草",["cǎo","c","","ǎo"],"","plant"],["树",["shù","sh","","ù"],"","plant"],["牛",["niú","n","i","óu"],"","animal"],["羊",["yáng","y","i","áng"],"","animal"],["兔",["tù","t","","ù"],"","animal"],["虫",["chóng","ch","","óng"],"","animal"],["头",["tóu","t","","óu"],"","body"],["妈",["mā","m","","ā"],"","people"],["大",["dà","d","","à"],"","position"],["上",["shàng","sh","","àng"],"","position"],["下",["xià","x","i","à"],"","position"],["多",["duō","d","u","ō"],"","feeling"],["少",["shǎo","sh","","ǎo"],"多少","feeling"],["高",["gāo","g","","āo"],"","feeling"],["兴",["xìng","x","","ìng"],"高兴","feeling"],["快",["kuài","k","u","ài"],"","feeling"],["乐",["lè","l","","è"],"快乐","feeling"],["好",["hǎo","h","","ǎo"],"好人","feeling"],["吃",["chī","ch","","ī"],"","action"],["看",["kàn","k","","àn"],"看书","action"],["走",["zǒu","z","","ǒu"],"","action"],["笑",["xiào","x","i","ào"],"","action"],["飞",["fēi","f","","ēi"],"","action"],["爱",["ài","","","ài"],"","action"],["是",["shì","sh","","ì"],"","action"],["跑",["pǎo","p","","ǎo"],"","action"],["跳",["tiào","t","i","ào"],"","action"],["只",["zhī","zh","","ī"],"一只","common"],["又",["yòu","y","i","òu"],"","common"],["了",["le","l","","e"],"来了","common"],["不",["bù","b","","ù"],"","common"],["的",["de","d","","e"],"好的","common"],["儿",["ér","","","ér"],"","people"],["几",["jǐ","j","","ǐ"],"几个","common"],["个",["gè","g","","è"],"","common"],["牙",["yá","y","i","á"],"","body"],["心",["xīn","x","","īn"],"","body"],["什",["shén","sh","","én"],"什么","common"],["么",["me","m","","e"],"","common"],["可",["kě","k","","ě"],"","common"],["回",["huí","h","u","éi"],"","action"],["出",["chū","ch","","ū"],"","action"],["里",["lǐ","l","","ǐ"],"","position"],["床",["chuáng","ch","u","áng"],"","object"],["车",["chē","ch","","ē"],"","object"],["家",["jiā","j","i","ā"],"","object"],["爷",["yé","y","i","é"],"","people"],["饭",["fàn","f","","àn"],"","common"],["有",["yǒu","y","i","ǒu"],"","common"],["找",["zhǎo","zh","","ǎo"],"","action"],["坐",["zuò","z","u","ò"],"","action"],["玩",["wán","w","u","án"],"","action"],["哭",["kū","k","","ū"],"","action"],["起",["qǐ","q","","ǐ"],"","action"],["喝",["hē","h","","ē"],"","action"],["到",["dào","d","","ào"],"","action"],["河",["hé","h","","é"],"","nature"],["海",["hǎi","h","","ǎi"],"","nature"],["雪",["xuě","x","ü","ě"],"","nature"],["春",["chūn","ch","","ūn"],"","season"],["夏",["xià","x","i","à"],"","season"],["秋",["qiū","q","i","ōu"],"","season"],["冬",["dōng","d","","ōng"],"","season"],["鱼",["yú","y","","ǘ"],"","animal"],["狼",["láng","l","","áng"],"","animal"],["猫",["māo","m","","āo"],"","animal"],["狗",["gǒu","g","","ǒu"],"","animal"],["蝴",["hú","h","","ú"],"","animal"],["蝶",["dié","d","i","é"],"","animal"],["蜜",["mì","m","","ì"],"","animal"],["蜂",["fēng","f","","ēng"],"","animal"],["谢",["xiè","x","i","è"],"","common"],["睡",["shuì","sh","u","èi"],"","action"],["红",["hóng","h","","óng"],"","color"],["蓝",["lán","l","","án"],"","color"],["绿",["lǜ","l","","ǜ"],"绿色","color"],["美",["měi","m","","ěi"],"","feeling"],["丽",["lì","l","","ì"],"","feeling"],["明",["míng","m","","íng"],"","nature"],["尘",["chén","ch","","én"],"","nature"],["林",["lín","l","","ín"],"","plant"],["森",["sēn","s","","ēn"],"","plant"],["厂",["chǎng","ch","","ǎng"],"","object"],["石",["shí","sh","","í"],"","nature"],["立",["lì","l","","ì"],"","action"],["正",["zhèng","zh","","èng"],"","feeling"],["叶",["yè","y","","è"],"","plant"],["学",["xué","x","ü","é"],"","place"],["校",["xiào","x","i","ào"],"学校","place"],["老",["lǎo","l","","ǎo"],"","place"],["师",["shī","sh","","ī"],"","place"],["工",["gōng","g","","ōng"],"","place"],["医",["yī","y","","ī"],"","place"],["院",["yuàn","y","ü","àn"],"","place"],["生",["shēng","sh","","ēng"],"","place"],["传",["chuán","ch","u","án"],"传达","place"],["达",["dá","d","","á"],"","place"],["室",["shì","sh","","ì"],"","place"],["卫",["wèi","w","","èi"],"","place"],["年",["nián","n","i","án"],"","season"],["田",["tián","t","i","án"],"","nature"],["灯",["dēng","d","","ēng"],"","object"],["公",["gōng","g","","ōng"],"","common"],["鸡",["jī","j","","ī"],"","animal"],["禾",["hé","h","","é"],"","plant"],["午",["wǔ","w","","ǔ"],"","season"],["东",["dōng","d","","ōng"],"","position"],["西",["xī","x","","ī"],"","position"],["江",["jiāng","j","i","āng"],"","nature"],["南",["nán","n","","án"],"","position"],["采",["cǎi","c","","ǎi"],"","action"],["莲",["lián","l","i","án"],"","plant"],["戏",["xì","x","","ì"],"","action"],["竹",["zhú","zh","","ú"],"","plant"],["用",["yòng","y","","òng"],"","action"],["步",["bù","b","","ù"],"","action"],["为",["wèi","w","","èi"],"为什么","common"],["参",["cān","c","","ān"],"参加","action"],["加",["jiā","j","i","ā"],"","action"],["洞",["dòng","d","","òng"],"","nature"],["尖",["jiān","j","i","ān"],"","feeling"],["说",["shuō","sh","u","ō"],"","action"],["就",["jiù","j","i","òu"],"","common"],["圆",["yuán","y","ü","án"],"","feeling"],["弯",["wān","w","","ān"],"","feeling"],["见",["jiàn","j","i","àn"],"","action"],["本",["běn","b","","ěn"],"","object"],["在",["zài","z","","ài"],"","action"],["左",["zuǒ","z","","uǒ"],"","position"],["右",["yòu","y","i","òu"],"","position"]]};

/* 分组配色:种子组键沿用网页端固定配色(hanzi-core FIXED);在线新建的组键按哈希
   从同一调色盘确定性取色(不存进数据集,删除重建也不漂移),与网页端 gc() 同款 */
const FIXED_COLORS = {
  num: ['#5C7CFA', '#3B5BDB'], nature: ['#20C997', '#12B886'], plant: ['#51CF66', '#2F9E44'],
  animal: ['#FF6B6B', '#E03131'], body: ['#FF6B9D', '#E64980'], people: ['#9775FA', '#7048E8'],
  object: ['#FF922B', '#E8590C'], place: ['#94D82D', '#66A80F'], position: ['#4DABF7', '#1C7ED6'],
  season: ['#8D6E63', '#5D4037'], color: ['#D81B60', '#AD1457'], feeling: ['#FAB005', '#F08C00'],
  action: ['#22B8CF', '#0CA678'], common: ['#845EF7', '#6741D9'],
};
const COLOR_POOL = Object.keys(FIXED_COLORS).map(k => FIXED_COLORS[k]);

function groupColors(key) {
  if (FIXED_COLORS[key]) return FIXED_COLORS[key];
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return COLOR_POOL[h % COLOR_POOL.length];
}

/* 组名「🔢 数字」→ 展示用纯文字「数字」 */
function groupShortName(name) {
  const s = String(name || '').trim();
  const i = s.indexOf(' ');
  return i >= 0 ? s.slice(i + 1).trim() : s;
}

/* 本地存储键:数据集/笔画数/掌握进度/设备名(设备名与拼音模块共用同一键) */
const DATASET_KEY = 'mora-hanzi-dataset-v1';
const STROKE_DATA_KEY = 'mora-hanzi-stroke-data-v1';
const MASTER_KEY = 'mora-hanzi-mastered-v1';
const TS_KEY = 'mora-hanzi-mastered-ts-v1';
const DEVICE_KEY = 'mora-device';

/* 进度同步服务:与 utils/pinyin.js、网页端 lib/sync-config.js 同源。
   module=chars、itemKey=汉字,与网页端识字页(character-recognition.html)一致。
   鉴权走 utils/auth.js 家长登录会话:未登录时上报静默跳过(本地已落盘,
   登录后 syncMastered 会按时间戳补传),401 交 auth.on401 弹回登录门。 */
const API_BASE = 'https://www.tcued.com';
const auth = require('./auth');
const MODULE = 'chars';

/* 学习页「全部汉字」范围键(导航与分享参数里用,不会与在线组键冲突) */
const ALL_KEY = '__all';

/* ===== 字库数据集:缓存优先(第一读取点)→ 打包种子兜底;远端 updatedAt 更新才替换 ===== */
let dataset = null;

function loadDatasetStore(family) {
  try {
    const v = wx.getStorageSync(DATASET_KEY);
    if (family && v && v.family === family && v.data && Array.isArray(v.data.chars)) return v;
  } catch (e) { /* 存储不可用走种子 */ }
  return null;
}

function saveDatasetStore(store) {
  try { wx.setStorageSync(DATASET_KEY, store); } catch (e) { /* 存储失败静默,不影响浏览 */ }
}

function currentDataset() {
  const family = auth.getFamily();
  if (!dataset || dataset.family !== family) {
    dataset = loadDatasetStore(family) || { family, updatedAt: 0, data: HANZI_SEED };
  }
  return dataset;
}

/* 拉 /api/hanzi:updatedAt 比本地新才替换并落盘。done(有更新传新 data,无更新/失败传 null) */
function fetchDataset(done) {
  const token = auth.getToken();
  const family = auth.getFamily();
  if (!token) { if (done) done(null); return; } /* 未登录:用种子 */
  wx.request({
    url: API_BASE + '/api/hanzi?token=' + encodeURIComponent(token),
    method: 'GET',
    success(res) {
      if (token !== auth.getToken() || family !== auth.getFamily()) { if (done) done(null); return; }
      if (res.statusCode === 401) { auth.on401(); return; }
      const j = res.data;
      if (!(j && j.ok && j.data && Array.isArray(j.data.chars))) { if (done) done(null); return; }
      const ua = j.updatedAt || 0;
      const cur = currentDataset();
      if (ua > (cur.updatedAt || 0)) {
        dataset = { family, updatedAt: ua, data: j.data };
        saveDatasetStore(dataset);
        if (done) done(j.data);
      } else if (done) done(null);
    },
    fail() { if (done) done(null); },
  });
}

/* ===== 当前字库视图索引：卡片按分组和字定位，掌握进度按字共享 ===== */
let index = null;

function viewIndex() {
  const data = currentDataset().data;
  if (index && index.data === data) return index;
  const rowsByGroup = new Map();
  for (const row of data.chars || []) {
    const [char, pinyin, word, groupKey] = row;
    if (!rowsByGroup.has(groupKey)) rowsByGroup.set(groupKey, new Map());
    rowsByGroup.get(groupKey).set(char, { char, pinyin, word, groupKey });
  }
  const GROUPS = (data.groups || []).map(([key, name, chars]) => {
    const rows = rowsByGroup.get(key);
    const groupName = FIXED_COLORS[key] ? groupShortName(name) : name;
    const cards = rows ? chars.map(c => rows.get(c)).filter(Boolean).map(card => ({ ...card, groupName })) : [];
    return { key, name, cards };
  });
  const groupsByKey = new Map(GROUPS.map(group => [group.key, group]));
  const firstByChar = new Map();
  const ALL = [];
  for (const group of GROUPS) {
    for (const card of group.cards) {
      ALL.push(card);
      if (!firstByChar.has(card.char)) firstByChar.set(card.char, card);
    }
  }
  index = { data, GROUPS, ALL, groupsByKey, firstByChar };
  return index;
}

function findCard(c) {
  return viewIndex().firstByChar.get(c);
}

function isValidScope(g) {
  return g === ALL_KEY || viewIndex().groupsByKey.has(g);
}

/* 某范围的卡片列表(详情上一个/下一个的导航顺序) */
function scopeCards(g) {
  const idx = viewIndex();
  if (g === ALL_KEY) return idx.ALL.slice();
  const grp = idx.groupsByKey.get(g);
  return grp ? grp.cards.slice() : [];
}

/* ===== 笔画数据:打包种子(mora 网页端 char-data.js 精简,仅逐笔轮廓,见 utils/hanzi-strokes.js)
   → 在线新增字懒取 /api/hanzi-stroke(内容不可变,取到即永久缓存,只留 strokes),失败静默返回 null。
   服务端 hanzi_strokes 只存在线新增字的笔画,种子字的笔画在打包里 ===== */
const BUNDLED_STROKES = require('./hanzi-strokes');

function strokeDataSync(c) {
  if (BUNDLED_STROKES[c]) return BUNDLED_STROKES[c];
  try {
    const m = wx.getStorageSync(STROKE_DATA_KEY);
    if (m && typeof m === 'object' && !Array.isArray(m) && m[c]) return m[c];
  } catch (e) { /* 存储不可用按无数据 */ }
  return null;
}

function cacheStrokeResponse(c, body) {
  const data = body && body.ok && body.data;
  if (!data || !Array.isArray(data.strokes) || !data.strokes.length) return null;
  const d = { strokes: data.strokes };
  try {
    let m = wx.getStorageSync(STROKE_DATA_KEY) || {};
    if (typeof m !== 'object' || Array.isArray(m)) m = {};
    m[c] = d;
    wx.setStorageSync(STROKE_DATA_KEY, m);
  } catch (e) { /* 存储失败本次不缓存 */ }
  return d;
}

function fetchStrokes(c, done) {
  const hit = strokeDataSync(c);
  if (hit) { if (done) done(hit); return; }
  if (!auth.getToken()) { if (done) done(null); return; } /* 未登录:回退楷体大字 */
  wx.request({
    url: API_BASE + '/api/hanzi-stroke?token=' + encodeURIComponent(auth.getToken()) +
         '&c=' + encodeURIComponent(c),
    method: 'GET',
    success(res) {
      if (res.statusCode === 401) { auth.on401(); return; }
      const data = cacheStrokeResponse(c, res.data);
      if (done) done(data);
    },
    fail() { if (done) done(null); },
  });
}

/* 按网页端 HanziCore.splitPinyin 的声介韵规则处理课文注音。 */
const INITIALS = /^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])/;
const U_TO_UML = { u: 'ü', ū: 'ǖ', ú: 'ǘ', ǔ: 'ǚ', ù: 'ǜ' };
const UI_TONE = { ī: 'ē', í: 'é', ǐ: 'ě', ì: 'è' };
const IU_TONE = { ū: 'ō', ú: 'ó', ǔ: 'ǒ', ù: 'ò' };

function splitPinyin(value) {
  const full = value.trim().toLowerCase();
  const match = full.match(INITIALS);
  const initial = match ? match[0] : '';
  let rest = full.slice(initial.length);
  if (!rest) return [full, initial, '', ''];
  if (initial === 'w' && /^[aāáǎà]/.test(rest)) return [full, initial, 'u', rest];
  if (initial === 'y' && /^(?:[aāáǎà]|[oōóǒò]u)/.test(rest)) return [full, initial, 'i', rest];
  if (/^[jqxy]$/.test(initial) && U_TO_UML[rest[0]]) rest = U_TO_UML[rest[0]] + rest.slice(1);
  const medial = rest[0];
  if (medial === 'i' && IU_TONE[rest[1]]) return [full, initial, 'i', IU_TONE[rest[1]] + 'u'];
  if (medial === 'u' && UI_TONE[rest[1]]) return [full, initial, 'u', UI_TONE[rest[1]] + 'i'];
  if (/^[iuü]$/.test(medial)) return [full, initial, medial, rest.slice(1)];
  return [full, initial, '', rest];
}

function supplementStrokes(c, done, context) {
  const token = auth.getToken();
  const family = auth.getFamily();
  if (!token) { done(null, 'unauthorized'); return; }
  const payload = { token, c };
  if (context && context.articleId) {
    payload.articleId = context.articleId;
    if (context.pinyin && context.pinyin.trim()) payload.pinyinParts = splitPinyin(context.pinyin);
  }
  wx.request({
    url: API_BASE + '/api/hanzi-stroke/supplement',
    method: 'POST',
    timeout: 12000,
    header: { 'Content-Type': 'application/json' },
    data: payload,
    success(res) {
      if (token !== auth.getToken() || family !== auth.getFamily()) { done(null, 'unauthorized'); return; }
      const j = res.data || {};
      if (res.statusCode === 401 || j.error === 'password change required') auth.on401();
      if (res.statusCode === 200) {
        const data = cacheStrokeResponse(c, j);
        const cardSaved = j.ok && j.cardSaved === true;
        if (cardSaved) fetchDataset();
        if (data || cardSaved) { done(data, j.strokeError, cardSaved); return; }
      }
      const known404 = j.error === 'stroke not found' || j.error === 'article not found';
      const reason = res.statusCode === 404 && !known404 ? 'unsupported' : j.error;
      done(null, reason || 'supplement failed');
    },
    fail() { done(null, 'network error'); },
  });
}

function strokesCountSync(c) {
  const d = strokeDataSync(c);
  return d ? d.strokes.length : 0;
}

/* ===== 掌握进度:本地存储为第一写入点,键位按当前字库过滤(防脏数据落盘) ===== */
function validKeys() {
  return new Set(viewIndex().firstByChar.keys());
}

function loadMastered() {
  try {
    const v = wx.getStorageSync(MASTER_KEY);
    if (!Array.isArray(v)) return {};
    const map = {};
    v.forEach(k => { if (typeof k === 'string') map[k] = true; });
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

/* 设备名(上报来源标识):首次生成后固定,平台前缀 + 随机尾 */
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

/* 上报条目(离线/未登录/失败静默:本地存储始终是第一写入点) */
function pushItems(items) {
  const token = auth.getToken();
  if (!token) return; /* 未登录:下次进入页面 syncMastered 会按时间戳补传 */
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

/* 标记/取消掌握:先写本地,再 fire-and-forget 上报 */
function markMastered(key, done) {
  const map = loadMastered();
  if (done) map[key] = true; else delete map[key];
  const now = Date.now();
  const ts = loadTs();
  ts[key] = now;
  saveStore(map, ts);
  pushItems([{ itemKey: key, mastered: done ? 1 : 0, updatedAt: now }]);
}

/* 本地条目 → 同步协议格式(无时间戳的旧数据按当下补记) */
function localItems() {
  const map = loadMastered();
  const ts = loadTs();
  const now = Date.now();
  const valid = validKeys();
  return Object.keys(map).filter(k => valid.has(k))
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

/* 拉取远端合并到本地(只认本模块与当前字库内的键位),成功 done(合并后掌握map),失败 fail(本地原样)。
   合并后把「本地更新过的条目」补传,保证本机改动不丢。 */
function syncMastered(done, fail) {
  const token = auth.getToken();
  const family = auth.getFamily();
  wx.request({
    url: API_BASE + '/api/progress?token=' + encodeURIComponent(token),
    method: 'GET',
    success(res) {
      if (token !== auth.getToken() || family !== auth.getFamily()) return;
      if (res.statusCode === 401) { auth.on401(); return; }
      const valid = validKeys();
      const data = res.data;
      const items = data && data.ok && Array.isArray(data.items) ? data.items : [];
      const remote = items.filter(it => it && it.module === MODULE && valid.has(it.itemKey));
      const local = localItems();
      const merged = mergeItems(local, remote);
      const map = loadMastered();
      const ts = loadTs();
      merged.forEach(m => {
        ts[m.itemKey] = m.updatedAt;
        if (m.mastered === 1) map[m.itemKey] = true;
        else delete map[m.itemKey];
      });
      saveStore(map, ts);
      const newer = itemsToPush(local, remote);
      if (newer.length) pushItems(newer);
      if (done) done(map);
    },
    fail(err) { if (fail) fail(err); },
  });
}

/* ===== 页面视图 ===== */

/* 单字 → 卡片/详情视图模型 */
function charView(card, masteredMap) {
  const { char, pinyin, word, groupKey, groupName } = card;
  const gc = groupColors(groupKey);
  return {
    char,
    py: pinyin[0],
    sm: pinyin[1],
    md: pinyin[2],
    fn: pinyin[3],
    word,
    groupKey,
    groupName,
    color: gc[0],
    color2: gc[1],
    mastered: !!masteredMap[char],
  };
}

/* 某范围(组键或 __all)的分段视图:[{key,name,color,color2,items:[字卡]}],范围非法返回 [] */
function studyGroups(g, masteredMap) {
  const idx = viewIndex();
  const groups = g === ALL_KEY ? idx.GROUPS : idx.GROUPS.filter(x => x.key === g);
  return groups.map(x => {
    const gc = groupColors(x.key);
    return {
      key: x.key,
      name: x.name,
      color: gc[0],
      color2: gc[1],
      items: x.cards.map(card => charView(card, masteredMap)),
    };
  });
}

/* 主页分组大卡(含计数) */
function groupCardViews(masteredMap) {
  return viewIndex().GROUPS.map(x => {
    const gc = groupColors(x.key);
    return {
      key: x.key,
      name: x.name,
      color: gc[0],
      color2: gc[1],
      count: x.cards.length,
      mastered: x.cards.filter(card => masteredMap[card.char]).length,
    };
  });
}

function countAll() {
  return viewIndex().firstByChar.size;
}

function countMastered(masteredMap) {
  return Array.from(viewIndex().firstByChar.keys()).filter(c => masteredMap[c]).length;
}

function countOf(g) {
  return g === ALL_KEY ? countAll() : scopeCards(g).length;
}

function countMasteredIn(g, masteredMap) {
  return g === ALL_KEY ? countMastered(masteredMap) : scopeCards(g).filter(card => masteredMap[card.char]).length;
}

module.exports = {
  HANZI_SEED, ALL_KEY,
  currentDataset, fetchDataset, viewIndex, findCard, isValidScope, scopeCards,
  strokeDataSync, fetchStrokes, supplementStrokes, strokesCountSync,
  loadMastered, loadTs, saveStore, markMastered, syncMastered,
  mergeItems, itemsToPush, localItems, deviceName,
  charView, studyGroups, groupCardViews,
  countAll, countMastered, countOf, countMasteredIn, groupColors, groupShortName,
};
