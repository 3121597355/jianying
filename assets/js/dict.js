/** 常用简历字段、城市和职业建议，可按需扩展。 */

export const SKINS = [
  '#333333', '#4a5568', '#596aa6', '#284967', '#4e7282', '#3978a3',
  '#1575bf', '#5468ff', '#0e88ad', '#5695c3', '#609ef3', '#168f83',
  '#67a886', '#76ba31', '#f36c6c', '#ef82ae', '#ed7d31', '#ff8b6a',
  '#8d6e63', '#a08f75', '#c19f67', '#e9c46a', '#a05fca',
];

/** setData.font 1..9 —— 以字体族 class 切换；使用设备已安装字体 */
export const FONTS = [
  { value: 1, label: '微软雅黑', cls: 'weiruanyahei' },
  { value: 2, label: '宋体', cls: 'songti' },
  { value: 3, label: '黑体', cls: 'heiti' },
  { value: 4, label: '楷体', cls: 'kaiti' },
  { value: 5, label: '微软雅黑（加粗）', cls: 'weiruanyahei bold' },
  { value: 6, label: '宋体（加粗）', cls: 'songti bold' },
  { value: 7, label: '黑体（加粗）', cls: 'heiti bold' },
  { value: 8, label: '楷体（加粗）', cls: 'kaiti bold' },
  { value: 9, label: '思源黑体', cls: 'noto-sans' },
];

export const SEX = ['不填', '男', '女'];
export const MARRIAGE = ['不填', '已婚', '未婚', '离婚', '已婚已育'];
export const POLITICS = ['不填', '中共党员', '中共预备党员', '共青团员', '普通公民', '群众'];
/** 可选个人资料：兼容旧草稿的数字、字符串索引和文字值，隐藏“不填”。 */
export function optionalLabel(options, value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const index = /^\d+$/.test(raw) ? Number(raw) : options.indexOf(raw);
  return index > 0 ? options[index] || '' : '';
}
export const DEGREE = ['不填', '高中', '中专', '大专', '本科', '硕士', '博士', 'MBA', '其他'];

export const WORK_YEARS = [
  '不填', '应届生', '半年经验', '1年经验', '2年经验', '3年经验', '4年经验', '5年经验',
  '6年经验', '7年经验', '8年经验', '9年经验', '10年经验', '11年经验', '12年经验',
  '13年经验', '14年经验', '15年以上经验', '20年以上经验', '30年以上经验',
];

/** 模块定义：id 与真实 DOM 的 id/moduleName 一致 */
export const MODULES = [
  { name: 'basic', label: '基本信息', kind: 'basic', always: true },
  { name: 'yixiang', label: '求职意向', kind: 'yixiang' },
  { name: 'baokao', label: '报考信息', kind: 'baokao' },
  { name: 'jiaoyu', label: '教育背景', kind: 'timeline', itemLabel: '教育经历', fields: ['school', 'major', 'degree'] },
  { name: 'work', label: '工作经历', kind: 'timeline', itemLabel: '工作经历', fields: ['company', 'job'] },
  { name: 'project', label: '项目经验', kind: 'timeline', itemLabel: '项目经验', fields: ['name', 'role'] },
  { name: 'shixi', label: '实习经历', kind: 'timeline', itemLabel: '实习经历', fields: ['company', 'job'] },
  { name: 'xiaoyuan', label: '校园经历', kind: 'timeline', itemLabel: '校园经历', fields: ['org', 'role'] },
  { name: 'jineng', label: '技能特长', kind: 'jineng' },
  { name: 'zhengshu', label: '荣誉证书', kind: 'rich' },
  { name: 'pingjia', label: '自我评价', kind: 'rich' },
  { name: 'aihao', label: '兴趣爱好', kind: 'tags' },
  { name: 'make', label: '自定义模块', kind: 'rich', customTitle: true },
];

export const HOT_CITIES = [
  '北京', '上海', '广州', '深圳', '杭州', '成都', '南京', '武汉', '西安', '苏州',
  '天津', '重庆', '长沙', '郑州', '青岛', '合肥', '厦门', '福州', '济南', '大连',
  '宁波', '无锡', '东莞', '佛山', '沈阳', '昆明', '哈尔滨', '长春', '石家庄', '南昌',
];

/** 职业族（常用分类及示例职业） */
export const JOB_GROUPS = {
  '互联网/通信及硬件': ['Java', 'PHP', 'Python', '前端开发', 'Android', 'iOS', '算法工程师', '测试工程师', '运维工程师', '产品经理', 'UI设计师', '数据分析'],
  '金融/银行/证券': ['银行柜员', '信贷管理', '风险控制', '投资顾问', '证券分析', '财务分析'],
  '教育/培训': ['教师', '讲师', '教务管理', '课程顾问', '培训师'],
  '医疗/护理': ['护士', '医师', '药师', '医学检验', '医疗器械销售'],
  '销售/客服': ['销售代表', '大客户经理', '电话销售', '客服专员', '渠道经理'],
  '市场/公关': ['市场专员', '品牌经理', '活动策划', '新媒体运营', '文案编辑'],
  '人事/行政': ['人事专员', '招聘专员', '行政助理', 'HRBP', '薪酬绩效'],
  '财务/审计': ['会计', '出纳', '审计专员', '税务专员', '成本会计'],
  '设计/创意': ['平面设计', 'UI设计', '室内设计', '服装设计', '插画师'],
  '工程/制造': ['机械工程师', '电气工程师', '工艺工程师', '质量管理', '项目经理'],
  '房地产/建筑': ['置业顾问', '土建工程师', '造价员', '室内设计师', '物业经理'],
  '法律/咨询': ['律师', '法务专员', '管理咨询', '专利代理'],
};

export const JOB_LIST = Object.values(JOB_GROUPS).flat();

export const MONTH_OPTIONS = (() => {
  const out = [];
  const now = new Date();
  for (let y = now.getFullYear(); y >= 1970; y--) {
    for (let m = 12; m >= 1; m--) {
      out.push(`${y}-${String(m).padStart(2, '0')}`);
    }
  }
  return out;
})();

export const cloneDict = () => JSON.parse(JSON.stringify({ SKINS, FONTS, SEX, MARRIAGE, POLITICS, DEGREE, WORK_YEARS, MODULES }));
