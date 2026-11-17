import {DEFAULT_TPL} from './templates.js';
import {createProjectDetails} from './project-fields.js';

/** Pure factories: every new resume owns its own fields and module arrays. */
export const moduleTpl = () => ([
  { moduleName: 'yixiang', moduleValue: '求职意向', visible: true, data: { job: '', city: '', money: '', joinTime: '' } },
  { moduleName: 'baokao', moduleValue: '报考信息', visible: false, title: '', name: '', major: '', data: [] },
  { moduleName: 'jiaoyu', moduleValue: '教育背景', visible: true, data: [blankTimeline('school')] },
  { moduleName: 'work', moduleValue: '工作经历', visible: true, data: [blankTimeline('company')] },
  { moduleName: 'project', moduleValue: '项目经验', visible: false, data: [blankTimeline('project')] },
  { moduleName: 'shixi', moduleValue: '实习经历', visible: false, data: [blankTimeline('company')] },
  { moduleName: 'xiaoyuan', moduleValue: '校园经历', visible: false, data: [blankTimeline('org')] },
  { moduleName: 'jineng', moduleValue: '技能特长', visible: true, content: '', data: [] },
  { moduleName: 'zhengshu', moduleValue: '荣誉证书', visible: false, content: '', data: [] },
  { moduleName: 'pingjia', moduleValue: '自我评价', visible: true, content: '' },
  { moduleName: 'aihao', moduleValue: '兴趣爱好', visible: false, content: '', data: [] },
  { moduleName: 'make', moduleValue: '自定义模块', visible: false, content: '' },
]);

export function blankTimeline(kind) {
  const base = { timeStart: '', timeEnd: '', today: false, content: '' };
  switch (kind) {
    case 'school': return { ...base, name: '', major: '', xueli: '' };
    case 'company': return { ...base, name: '', job: '' };
    case 'project': return { ...base, name: '', job: '', projectDetails:createProjectDetails() };
    case 'org': return { ...base, name: '', job: '' };
    default: return base;
  }
}

export function createDefault() {
  return {
    setData: {
      skin: '#284967', tplId: DEFAULT_TPL, coverId: '', coverShow: 0,
      mm: 24, pp: 52, font: 1, fontSize: 14, lineHeight: 1.7,
      title: '个人简历', slogan: 'PERSONAL PROFILE', visitType: 1, visitPass: '',
      language: 'cn', zpType: 0, moduleSort: [],
    },
    coverData: { name: '', job: '', school: '', mobile: '', email: '' },
    zijianData: { visible: 0, content: '' },
    basicInfo: {
      name: '', sex: 0, birthday: '', isAge: true, email: '', mobile: '',
      workYears: -1, photo: '', photoShow: true, minzu: '', zhengzhi: '',
      jiguan: '', hunyin: 0, height: '', weight: '', inShort: '', make: [],
    },
    moduleData: moduleTpl(),
  };
}

