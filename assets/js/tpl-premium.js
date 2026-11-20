import {renderPremium} from './premium-renderer.js';

// 双栏版式：结构与单栏模板不同，但共用同一份数据契约与导出链路。
export const PREMIUM_TEMPLATES = [
  {id:1051,code:'JY11',name:'双栏墨蓝',desc:'深色侧栏 · 信息集中 · 正文清爽',variant:'sidebar',style:{skin:'#22405c',font:1,fontSize:13.5,mm:22,pp:44,lineHeight:1.65}},
  {id:1052,code:'JY12',name:'双栏素白',desc:'浅灰侧栏 · 细线分隔 · 打印友好',variant:'sidebar-light',style:{skin:'#3d5a6c',font:1,fontSize:13.5,mm:22,pp:44,lineHeight:1.65}},
  {id:1053,code:'JY13',name:'瑞士网格',desc:'大字号姓名 · 发丝线 · 左右分栏',variant:'swiss',style:{skin:'#1f2933',font:1,fontSize:13.5,mm:26,pp:52,lineHeight:1.68}},
  {id:1054,code:'JY14',name:'横幅双栏',desc:'整幅色带页眉 · 左窄右宽',variant:'banner',style:{skin:'#2b4f6c',font:1,fontSize:13.5,mm:24,pp:46,lineHeight:1.65}},
].map(template=>({...template,scope:'data-v-standard',thumbnail:`/assets/img/templates/${template.id}.png`,render:resume=>renderPremium(resume,{layout:template.variant})}));
