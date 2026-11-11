import {applyTemplate} from './templates.js';
import {createTemplateSample,hasResumeContent} from './template-samples.js';

export function chooseTemplate(resume,id,{useSample=false}={}){
  const seeded=useSample||!hasResumeContent(resume);
  if(seeded){
    const sample=createTemplateSample(id);
    resume.setData={...resume.setData,...sample.setData};
    resume.basicInfo=sample.basicInfo;resume.moduleData=sample.moduleData;
  }
  applyTemplate(resume,id);
  return seeded;
}
