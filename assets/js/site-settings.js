// Site-owned presentation settings are independent from the visitor's saved resume.
export let siteSettings = null;
if(typeof window!=='undefined'&&typeof window.document!=='undefined'){
  try{const response=await fetch('/api/site-config',{cache:'no-store',signal:AbortSignal.timeout(2500)});if(response.ok)siteSettings=await response.json();}catch{/* Offline/default presentation remains usable. */}
}
export function availableTemplates(templates){return templates.filter(t=>t.enabled!==false);}
export function configureTemplates(templates){
  const configured=siteSettings?.templates;if(!Array.isArray(configured))return templates;
  return [...templates].map(template=>{const item=configured.find(t=>t.id===template.id);return item?{...template,name:item.name,desc:item.desc,enabled:item.enabled,featured:item.featured}:template;}).sort((a,b)=>configured.findIndex(t=>t.id===a.id)-configured.findIndex(t=>t.id===b.id));
}
