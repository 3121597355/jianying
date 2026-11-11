// Prepare real renderer output for browser screenshot capture, without loading a draft.
import fs from 'node:fs/promises';
import path from 'node:path';
import {STANDARD_TEMPLATES} from '../assets/js/tpl-standard.js';
import {EXTENDED_TEMPLATES} from '../assets/js/tpl-extended.js';
import {createTemplateSample} from '../assets/js/template-samples.js';

const root=path.resolve(import.meta.dirname,'..');
const previews=[...STANDARD_TEMPLATES,...EXTENDED_TEMPLATES].map(template=>{
  const resume=createTemplateSample(template.id);
  resume.setData={...resume.setData,...template.style,tplId:template.id};
  return {id:template.id,name:template.name,html:`<section id="sample-${template.id}" data-resume-export>${template.render(resume)}</section>`};
});
const pages=previews.map(item=>item.html).join('');
for(const item of previews)await fs.writeFile(path.join(root,`assets/qa-template-${item.id}.html`),`<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8"><title>${item.name}模板预览</title><link rel="stylesheet" href="/assets/css/editor-base.css"><link rel="stylesheet" href="/assets/css/tpl-standard.css"><style>body{margin:0;width:820px;background:white}body>section{width:820px}</style><body>${item.html}</body></html>`);
await fs.writeFile(path.join(root,'assets/qa-standard-templates.html'),`<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8"><title>标准模板预览校验</title><link rel="stylesheet" href="/assets/css/editor-base.css"><link rel="stylesheet" href="/assets/css/tpl-standard.css"><style>*{box-sizing:border-box}body{margin:0;background:#e8ebef}body>section{width:820px;margin:0 0 30px;background:#fff}</style><body>${pages}</body></html>`);
console.log('Prepared /assets/qa-standard-templates.html; capture each 820 × 1160 resume, then remove the temporary page.');
