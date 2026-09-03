/* 拼音学习卡数据与工具:mora 网页端 lib/pinyin-data.js 的同步副本(内容与键位格式一致,
   便于将来接入 /api/progress module=pinyin 多端同步)。
   每项 [拼音, emoji, 例字/口诀, 例字拼音, 分类];分类键 sm声母/dy单韵母/fy复韵母/qb前鼻/hb后鼻/zt整体认读/sd四声调 */
const PINYIN_DATA = [
  // 声母 23
  ["b","👨","爸爸","bà ba","sm"],["p","🎈","皮球","pí qiú","sm"],
  ["m","👩","妈妈","mā ma","sm"],["f","✈️","飞机","fēi jī","sm"],
  ["d","🥁","打鼓","dǎ gǔ","sm"],["t","🐰","兔子","tù zi","sm"],
  ["n","👵","奶奶","nǎi nai","sm"],["l","🐯","老虎","lǎo hǔ","sm"],
  ["g","🕊️","鸽子","gē zi","sm"],["k","🐨","考拉","kǎo lā","sm"],
  ["h","🦛","河马","hé mǎ","sm"],["j","🐔","小鸡","xiǎo jī","sm"],
  ["q","🐧","企鹅","qǐ é","sm"],["x","🍉","西瓜","xī guā","sm"],
  ["zh","🕷️","蜘蛛","zhī zhū","sm"],["ch","🚗","汽车","qì chē","sm"],
  ["sh","🌳","大树","dà shù","sm"],["r","🔥","热火","rè huǒ","sm"],
  ["z","🌅","早晨","zǎo chen","sm"],["c","🌿","青草","qīng cǎo","sm"],
  ["s","☂️","雨伞","yǔ sǎn","sm"],["y","🦆","鸭子","yā zi","sm"],
  ["w","🐌","蜗牛","wō niú","sm"],
  // 单韵母 6 (口诀)
  ["a","😮","张大嘴 a a a","","dy"],["o","⭕","嘴圆圆 o o o","","dy"],
  ["e","🦢","白鹅 e e e","","dy"],["i","👕","衣服 i i i","","dy"],
  ["u","🐢","乌龟 u u u","","dy"],["ü","🐟","小鱼 ü ü ü","","dy"],
  // 复韵母 9
  ["ai","🥬","白菜","bái cài","fy"],["ei","✈️","飞机","fēi jī","fy"],
  ["ui","🐢","乌龟","wū guī","fy"],["ao","🧥","棉袄","mián ǎo","fy"],
  ["ou","🕊️","海鸥","hǎi ōu","fy"],["iu","🌳","柳树","liǔ shù","fy"],
  ["ie","🦋","蝴蝶","hú dié","fy"],["üe","🌙","月亮","yuè liang","fy"],
  ["er","👂","耳朵","ěr duo","fy"],
  // 前鼻韵母 5
  ["an","🏔️","高山","gāo shān","qb"],["en","🚪","房门","fáng mén","qb"],
  ["in","❤️","爱心","ài xīn","qb"],["un","🌸","春天","chūn tiān","qb"],
  ["ün","👗","花裙","huā qún","qb"],
  // 后鼻韵母 4
  ["ang","🐑","小羊","xiǎo yáng","hb"],["eng","🌬️","吹风","chuī fēng","hb"],
  ["ing","⭐","星星","xīng xing","hb"],["ong","🐉","飞龙","fēi lóng","hb"],
  // 整体认读音节 16
  ["zhi","🕷️","蜘蛛","zhī zhū","zt"],["chi","🍚","吃饭","chī fàn","zt"],
  ["shi","🦁","狮子","shī zi","zt"],["ri","☀️","日出","rì chū","zt"],
  ["zi","📝","写字","xiě zì","zt"],["ci","🦔","刺猬","cì wei","zt"],
  ["si","4️⃣","数字四","sì","zt"],["yi","1️⃣","数字一","yī","zt"],
  ["wu","5️⃣","数字五","wǔ","zt"],["yu","☔","下雨","xià yǔ","zt"],
  ["ye","🍃","树叶","shù yè","zt"],["yue","🌙","月亮","yuè liang","zt"],
  ["yuan","🪙","一元钱","yī yuán","zt"],["yin","🎵","音乐","yīn yuè","zt"],
  ["yun","☁️","白云","bái yún","zt"],["ying","🦅","老鹰","lǎo yīng","zt"],
  // 四声调 4
  ["ā ē ī ō ū ǖ","🚂","一声","平平走","sd"],["á é í ó ú ǘ","📈","二声","往上扬","sd"],
  ["ǎ ě ǐ ǒ ǔ ǚ","🎢","三声","拐个弯","sd"],["à è ì ò ù ǜ","🏀","四声","往下掉","sd"],
];

/* 分组元信息:name 显示名,color 主色(与网页端一致) */
const GROUP_META = {
  sm: { name: '声母', color: '#4A90E2' },
  dy: { name: '单韵母', color: '#FF5C8D' },
  fy: { name: '复韵母', color: '#EF476F' },
  qb: { name: '前鼻韵母', color: '#34C759' },
  hb: { name: '后鼻韵母', color: '#FF9500' },
  zt: { name: '整体认读', color: '#AF52DE' },
  sd: { name: '四声调', color: '#00B894' },
};

/* 学习表:拼音基础四张入口大卡。ym 聚合韵母四组(dy+fy+qb+hb 共 24)。
   cards 为双列卡,wide 为通栏卡,渲染顺序 = cards/wave 依 data 顺序拼接 */
const TABLES = {
  sm: { key: 'sm', title: '声母表', color: '#4A90E2', color2: '#357ABD', sub: '发音短促轻快', layout: 'wide' },
  ym: { key: 'ym', title: '韵母表', color: '#EF476F', color2: '#D9365E', sub: '单韵母 · 复韵母 · 鼻韵母', layout: 'half' },
  zt: { key: 'zt', title: '整体认读', color: '#AF52DE', color2: '#8A2BE2', sub: '整个读 不用拼', layout: 'half' },
  sd: { key: 'sd', title: '声调表', color: '#00B894', color2: '#00A89A', sub: '一声平 二声扬 三声拐弯 四声降', layout: 'wide' },
};
const TABLE_ORDER = ['sm', 'ym', 'zt', 'sd'];

/* 每张学习表内的分组次序(韵母表拆小组展示) */
const TABLE_GROUPS = {
  sm: ['sm'],
  ym: ['dy', 'fy', 'qb', 'hb'],
  zt: ['zt'],
  sd: ['sd'],
};

/* 四声调示例行(调值示范:妈麻马骂) */
const TONE_EXAMPLES = { '一声': '妈 mā', '二声': '麻 má', '三声': '马 mǎ', '四声': '骂 mà' };

/* 已掌握本地存储:键位 分类:拼音 与网页端一致 */
const MASTER_KEY = 'mora-pinyin-mastered-v1';

function itemKey(it) {
  return it[4] + ':' + it[0];
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

function saveMastered(map) {
  try {
    wx.setStorageSync(MASTER_KEY, Object.keys(map));
  } catch (e) { /* 存储失败静默,不影响浏览 */ }
}

/* 单张卡 → 视图模型 */
function cardView(it, masteredMap) {
  return {
    key: itemKey(it),
    py: it[0],
    emoji: it[1],
    word: it[2],
    note: it[3],
    sec: it[4],
    name: GROUP_META[it[4]].name,
    color: GROUP_META[it[4]].color,
    example: it[4] === 'sd' ? TONE_EXAMPLES[it[2]] : '',
    mastered: !!(masteredMap && masteredMap[itemKey(it)]),
  };
}

/* 某学习表的分组视图:[{name,color,items:[卡]}] */
function studyGroups(type, masteredMap) {
  const keys = TABLE_GROUPS[type] || [];
  return keys.map(g => ({
    key: g,
    name: GROUP_META[g].name,
    color: GROUP_META[g].color,
    items: PINYIN_DATA.filter(it => it[4] === g).map(it => cardView(it, masteredMap)),
  }));
}

function countAll() {
  return PINYIN_DATA.length;
}

function countMastered(masteredMap) {
  return PINYIN_DATA.filter(it => masteredMap[itemKey(it)]).length;
}

function countMasteredIn(type, masteredMap) {
  const keys = TABLE_GROUPS[type] || [];
  return PINYIN_DATA.filter(it => keys.indexOf(it[4]) >= 0 && masteredMap[itemKey(it)]).length;
}

function countOf(type) {
  const keys = TABLE_GROUPS[type] || [];
  return PINYIN_DATA.filter(it => keys.indexOf(it[4]) >= 0).length;
}

module.exports = {
  PINYIN_DATA, GROUP_META, TABLES, TABLE_ORDER, TABLE_GROUPS,
  itemKey, loadMastered, saveMastered,
  cardView, studyGroups, countAll, countMastered, countMasteredIn, countOf,
};
