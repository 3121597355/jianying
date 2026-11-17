import {applyTemplate,DEFAULT_TPL} from './templates.js';
import {createDefault} from './resume-defaults.js';
import {createTemplateSample,hasResumeContent,templateSampleKind} from './template-samples.js';

export function chooseTemplate(resume,id,{useSample=false,sampleKind}={}){
  const seeded=useSample||!hasResumeContent(resume);
  if(seeded){
    const sample=createTemplateSample(id,sampleKind||templateSampleKind(resume)||'professional');
    resume.setData={...resume.setData,...sample.setData};
    resume.basicInfo=sample.basicInfo;resume.moduleData=sample.moduleData;
  }
  applyTemplate(resume,id);
  return seeded;
}

export function createStarterResume(id=DEFAULT_TPL){
  const resume=createDefault();
  chooseTemplate(resume,id,{useSample:true});
  return resume;
}
