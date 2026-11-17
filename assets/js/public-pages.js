// Fixed public page labels; arbitrary paths and query strings never enter analytics.
export const CONTENT_PAGES = Object.freeze({
  '/templates/':'简历模板',
  '/guides/':'使用指南',
  '/guides/graduate-resume/':'无实习经历简历示例',
  '/guides/developer-projects/':'计算机项目经历示例',
  '/guides/free-resume-pdf/':'免费简历模板与 PDF 导出',
  '/guides/one-page-resume/':'一页简历与 PDF 指南',
  '/guides/project-experience/':'项目经历写作指南',
  '/guides/id-photo-background/':'证件照换底指南',
});
export const ANALYTICS_PAGES = Object.freeze({'/':'介绍页','/resume/':'简历编辑','/portrait/':'证件照','/plans/':'自愿支持','/plans/thanks/':'心意感谢页',...CONTENT_PAGES});
