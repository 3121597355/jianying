import {createDefault} from './resume-defaults.js';
import {normalizeEditorUi} from './editor-state.js';
import {chooseTemplate} from './template-choice.js';
import {hasResumeContent} from './template-samples.js';

/** Seed fresh/legacy empty drafts; an intentional blank or written draft is preserved. */
export function initializeEditorDraft(saved,{example}={}){
  const resumeData=saved?.resumeData?structuredClone(saved.resumeData):createDefault();
  const ui=normalizeEditorUi(saved?.ui);
  const seeded=ui.startBlank!==true&&!hasResumeContent(resumeData);
  if(seeded){chooseTemplate(resumeData,resumeData.setData.tplId,{sampleKind:example});ui.tplChosen=true;ui.tab='basic';}
  return {resumeData,ui,seeded};
}
