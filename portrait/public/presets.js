export const identityPrompt = '只编辑上传照片的背景。必须保留原人物的身份、五官形状、脸型、表情、发型、真实肤色、皮肤纹理、服装和配饰，不瘦脸、不美颜、不改变年龄、不重绘人物。不添加人物、文字、水印、边框或标志。保持原有姿势和相机视角；保留发丝、耳廓、眼镜和肩部轮廓，去除旧背景残留与边缘色溢，边缘自然干净，不出现白边、锯齿或过度虚化。';
export const presets = [
  {id:'white',category:'证件底色',name:'纯净白',tag:'通用证件',color:'#ffffff',desc:'干净均匀 · 自然肤色',prompt:'将背景替换为均匀的纯白色 #FFFFFF，无纹理、无渐变、无投影、无杂物。人物轮廓清晰，白色服装仍应与背景自然区分。'},
  {id:'blue',category:'证件底色',name:'经典蓝',tag:'常用蓝底',color:'#438edb',desc:'清晰明快 · 经典证照',prompt:'将背景替换为均匀的证件照蓝色 #438EDB，平整纯色，无渐变、无纹理、无阴影，皮肤与衣服不受蓝色污染。'},
  {id:'red',category:'证件底色',name:'标准红',tag:'喜庆红底',color:'#d94343',desc:'饱满纯色 · 轮廓分明',prompt:'将背景替换为均匀的红色 #D94343，纯色平整，无纹理、无渐变、无阴影，避免红色溢出到头发、皮肤或白色衣领上。'},
  {id:'light-blue',category:'证件底色',name:'浅海蓝',tag:'清爽明亮',color:'#a9d5f1',desc:'柔和浅蓝 · 轻盈自然',prompt:'背景替换为均匀明亮的浅蓝色 #A9D5F1，无纹理和投影，保留真实肤色，呈现清爽自然的证件照。'},
  {id:'gray',category:'证件底色',name:'雾感灰',tag:'简历推荐',color:'#d9dde2',desc:'中性灰调 · 利落专业',prompt:'背景替换为均匀的浅灰色 #D9DDE2，无纹理、无杂物、无渐变。营造干净专业的简历证照效果，人物完全保持原貌。'},
  {id:'custom',category:'证件底色',name:'自选颜色',tag:'自由配色',color:'conic-gradient(#ed798a,#eebd79,#99c5a0,#92b9eb,#c19adc,#ed798a)',desc:'选择你需要的底色',prompt:''},
  {id:'gradient-blue',category:'渐变背景',name:'晴空渐蓝',tag:'人气渐变',color:'linear-gradient(145deg,#7fb5e9,#e3f2ff)',desc:'上深下浅 · 清透柔和',prompt:'背景替换为柔和的竖向蓝色渐变，上方 #7FB5E9 平滑过渡到下方 #E3F2FF。渐变细腻无色带，无场景、无纹理、无地平线。'},
  {id:'gradient-gray',category:'渐变背景',name:'银灰柔光',tag:'商务肖像',color:'radial-gradient(circle at 50% 38%,#f2f3f5,#a6b0be)',desc:'中心提亮 · 沉稳质感',prompt:'背景为摄影棚银灰色径向渐变，人物头部后方柔和浅灰，四周逐渐过渡到中灰 #A6B0BE。没有聚光灯形状、纹理或可见灯具。'},
  {id:'gradient-warm',category:'渐变背景',name:'暖杏微光',tag:'温柔质感',color:'linear-gradient(145deg,#e5c5ad,#fff3e6)',desc:'浅杏米色 · 温暖亲和',prompt:'背景替换为从浅杏色 #E5C5AD 到奶油色 #FFF3E6 的平滑渐变，柔和温暖，避免偏黄影响人物肤色，不添加道具。'},
  {id:'gradient-navy',category:'渐变背景',name:'深海蓝调',tag:'沉静高级',color:'radial-gradient(circle at 50% 30%,#42688b,#1b2b42)',desc:'深蓝层次 · 聚焦人物',prompt:'背景为高级影棚的深海蓝径向渐变，中心 #42688B，边缘 #1B2B42，层次细腻、无纹理，保证头发边缘与背景清楚分离。'},
  {id:'studio',category:'职业形象',name:'极简影棚',tag:'职业头像',color:'linear-gradient(135deg,#bcb5ae,#e6e2de)',desc:'柔光棚拍 · 专业克制',prompt:'仅将背景替换为极简米灰摄影棚背景，平滑纸质背景，无明显纹理和折痕，柔和自然的背景明暗，避免出现灯具、道具及地平线。'},
  {id:'office',category:'职业形象',name:'明亮办公',tag:'商务场景',color:'linear-gradient(90deg,#d2dfdf 25%,#f5f0e5 25%,#f5f0e5 65%,#b2c6c5 65%)',desc:'现代空间 · 适度虚化',prompt:'背景替换为明亮现代办公室，远处简洁玻璃隔断、浅色墙面和少量绿植，背景适度景深虚化，没有其他人物、商标或可读文字。透视与原照片相符，主体清晰不变。'},
  {id:'library',category:'职业形象',name:'书房一角',tag:'知性氛围',color:'linear-gradient(90deg,#b2977c 15%,#d8c7b3 15%,#d8c7b3 50%,#8e9c97 50%,#8e9c97 70%,#c8b6a0 70%)',desc:'温润书架 · 简约知性',prompt:'背景替换为整洁简约的现代书房，远景木色书架与少量书籍，背景自然虚化，暖中性色调，不出现可读文字或其他人物，保留原人物清晰度和面部光线。'},
  {id:'outdoor',category:'生活氛围',name:'绿意公园',tag:'自然头像',color:'linear-gradient(145deg,#719983,#d9e5bb)',desc:'清新绿意 · 柔和散景',prompt:'背景替换为明亮公园中的远景绿树和自然散景，浅景深、柔和日光，无其他人物、建筑招牌或杂物。绿意只存在于背景，主体保持原图清晰真实。'},
  {id:'city',category:'生活氛围',name:'城市留白',tag:'轻松通勤',color:'linear-gradient(135deg,#d4dbe2,#a5b2bf)',desc:'简洁建筑 · 都市感',prompt:'背景替换为简洁现代城市建筑外墙和宽敞步道的远景，浅灰蓝色调，适度虚化，无行人、车辆、广告牌及可读文字，透视自然。'},
  {id:'cafe',category:'生活氛围',name:'午后咖啡',tag:'温暖日常',color:'linear-gradient(140deg,#b78e6c,#efddc7)',desc:'暖木色调 · 日常松弛',prompt:'背景替换为安静简约的咖啡馆远景，浅木色室内，窗边温柔自然光和少量背景散景，不出现其他人物、店名或文字，主体保持原图样貌。'},
  {id:'transparent',category:'透明抠图',name:'透明背景',tag:'PNG 素材',color:'transparent',desc:'保留发丝 · 自由合成',prompt:'移除人物之外的所有背景，输出具有真实 alpha 透明通道的 PNG 人像抠图。保留完整发丝、眼镜、耳廓和肩线；不要用白色、黑色或棋盘格图案代替透明背景。'},
];
export const sizes = [
  {id:'original',name:'原图比例',note:'保持原始构图',width:0,height:0},
  {id:'one',name:'一寸',note:'25 × 35 mm',width:295,height:413},
  {id:'small-two',name:'小二寸',note:'33 × 48 mm',width:390,height:567},
  {id:'two',name:'二寸',note:'35 × 49 mm',width:413,height:579},
  {id:'passport',name:'35 × 45 mm',note:'常见证照规格',width:413,height:531},
  {id:'square',name:'方形头像',note:'800 × 800 px',width:800,height:800},
];
export function buildPrompt({presetId, customColor='#438edb', customPrompt=''}) {
  const preset = presets.find(p=>p.id===presetId);
  if (!preset) throw new Error('请选择有效的背景预设。');
  if (!/^#[0-9a-f]{6}$/i.test(customColor)) throw new Error('颜色格式应为 #RRGGBB。');
  if (typeof customPrompt!=='string' || customPrompt.length>4000) throw new Error('自定义描述最多 4000 字。');
  const background = preset.id==='custom' ? `将背景替换为均匀的纯色 ${customColor.toUpperCase()}，无纹理、无渐变、无阴影。` : preset.prompt;
  return [identityPrompt, `背景要求：${background}`, customPrompt.trim() ? `用户补充的背景描述（仅作用于背景）：${customPrompt.trim()}` : '', '再次确认：仅修改背景，人物身份特征与衣着保持不变。'].filter(Boolean).join('\n\n');
}
