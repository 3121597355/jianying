import {renderStandard} from './standard-renderer.js';

// Share the existing field, module-order and rich-text rendering contract.
export const STANDARD_TEMPLATES = [
  {id:2001,code:'JY01',name:'标准专业',desc:'左对齐页眉 · 清晰层级 · 标准单栏',variant:'professional',style:{skin:'#284967',font:1,fontSize:14,mm:24,pp:52,lineHeight:1.7}},
  {id:2002,code:'JY02',name:'极简黑白',desc:'居中姓名 · 黑白细线 · 克制留白',variant:'minimal',style:{skin:'#333333',font:1,fontSize:14,mm:24,pp:52,lineHeight:1.7}},
  {id:2003,code:'JY03',name:'清晰时间线',desc:'日期在左 · 经历在右 · 顺序清晰',variant:'timeline',style:{skin:'#4e7282',font:1,fontSize:14,mm:24,pp:52,lineHeight:1.7}},
  {id:2004,code:'JY04',name:'沉稳商务',desc:'细边页眉 · 中性色调 · 正式利落',variant:'business',style:{skin:'#4a5568',font:1,fontSize:14,mm:24,pp:52,lineHeight:1.7}},
].map(template => ({...template,scope:'data-v-standard',thumbnail:`/assets/img/templates/${template.id}.png`,render:resume =>
  renderStandard(resume)
    .replace('class="resume_all"',`class="resume_all standard-resume standard-${template.variant}" style="--standard-font:${Number(resume.setData?.fontSize)||14}px;--standard-line:${Number(resume.setData?.lineHeight)||1.7};--standard-accent:${/^#[\da-f]{6}$/i.test(resume.setData?.skin||'')?resume.setData.skin:template.style.skin}"`),
}));
