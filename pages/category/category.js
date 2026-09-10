/* 分类页:功能入口按「学科 / 综合」两组组织。
   学科组按科目再分组,对应 mora 网页端的学习模块(小程序端陆续开发);
   status: 'ok' = 可用,跳转 url;'dev' = 开发中,点击提示。
   perm = 服务端功能键(FEATURES),登录后按家庭权限过滤,未开通的入口不呈现。 */
const auth = require('../../utils/auth');

const GROUPS = [
  {
    key: 'subject',
    icon: '📚',
    title: '学科',
    subjects: [
      {
        name: '语文', color: '#c9392b', icon: '📖',
        items: [
          { name: '古诗卡片', desc: '必背古诗跟读与背诵', status: 'dev' },
          { name: '识字卡片', desc: '主题识字 · 笔顺动画 · 多端同步', status: 'ok', url: '/pages/hanzi/hanzi', perm: 'chars' },
          { name: '拼音学习卡', desc: '声母韵母 · 整体认读 · 声调', status: 'ok', url: '/pages/pinyin/pinyin', perm: 'pinyin' },
        ],
      },
      {
        name: '数学', color: '#1d5fbf', icon: '🔢',
        items: [
          { name: '口算练习', desc: '10/20 以内加减法', status: 'dev' },
        ],
      },
      {
        name: '英语', color: '#177a3e', icon: '🔤',
        items: [
          { name: '自然拼读', desc: 'Phonics 字母组合卡片', status: 'dev' },
          { name: '单词卡片', desc: '常用词看图认读', status: 'dev' },
        ],
      },
    ],
  },
  {
    key: 'general',
    icon: '🧩',
    title: '综合',
    subjects: [
      {
        name: '日常', color: '#4353b8', icon: '🗓️',
        items: [
          { name: '课程表', desc: '按天查看本周课程', status: 'ok', url: '/pages/kebiao/kebiao', perm: 'kebiao' },
          { name: '作业本', desc: '按周查看作业安排', status: 'ok', url: '/pages/zuoye/zuoye', perm: 'homework' },
        ],
      },
    ],
  },
];

/* 未开发的条目先隐藏:只展示 status='ok' 的条目,空科目/空组整体隐藏。
   已登录再按家庭权限过滤:perm 未填写(或未登录)不过滤,未开通的入口不呈现。
   功能开发完成后把条目的 status 改为 'ok' 并补 url 即可自动出现。 */
function visibleGroups(groups, checkPerm) {
  return groups
    .map(g => ({
      ...g,
      subjects: g.subjects
        .map(s => ({
          ...s,
          items: s.items.filter(it => it.status === 'ok' && (!checkPerm || !it.perm || auth.hasPerm(it.perm))),
        }))
        .filter(s => s.items.length),
    }))
    .filter(g => g.subjects.length);
}

Page({
  data: {
    groups: visibleGroups(GROUPS, false),
  },

  onShow() {
    this.applyFilters();
    /* 已登录才拉最新权限纠正入口;未登录点条目时由各功能页的登录门接管 */
    if (auth.getToken()) auth.refreshPerms(() => this.applyFilters());
  },

  applyFilters() {
    this.setData({ groups: visibleGroups(GROUPS, !!auth.getToken()) });
  },

  onTapItem(e) {
    const { url, status, name } = e.currentTarget.dataset;
    if (status === 'ok' && url) {
      wx.navigateTo({ url });
    } else {
      wx.showToast({ title: name + ' 开发中，敬请期待', icon: 'none' });
    }
  },
});
