/** Apply a single undoable Quill format change without replacing text or inline emphasis. */
export function bulletProjectContributions(editor){
  if(!editor?.getText().trim())return false;
  editor.history.cutoff();
  editor.formatLine(0,editor.getLength(),'list','bullet','user');
  editor.history.cutoff();
  return true;
}

export function setupProjectEditor(editor){
  if(!editor)return;
  const shell=editor.container.closest('.qm-quill-shell');
  const toolbar=shell?.querySelector('.ql-toolbar');
  if(!toolbar)return;
  editor.root.setAttribute('aria-label','个人贡献');
  shell.classList.add('project-quill');
  for(const group of toolbar.querySelectorAll('.ql-formats')){
    const advanced=[...group.children].filter(node=>node.matches('.ql-size,.ql-color,.ql-align,.ql-link,.ql-image,.ql-clean'));
    for(const node of advanced)node.classList.add('project-format-advanced');
    if(advanced.length===group.children.length)group.classList.add('project-format-advanced');
  }
  for(const button of toolbar.querySelectorAll('.ql-list')){
    button.setAttribute('aria-label',button.value==='bullet'?'项目符号':'编号列表');
    button.title=button.getAttribute('aria-label');
  }
  const toggle=document.createElement('button');
  toggle.type='button';
  toggle.className='project-format-toggle';
  toggle.textContent='更多格式';
  toggle.setAttribute('aria-expanded','false');
  toggle.addEventListener('click',()=>{
    const expanded=shell.classList.toggle('formats-expanded');
    toggle.setAttribute('aria-expanded',String(expanded));
    toggle.textContent=expanded?'收起格式':'更多格式';
  });
  toolbar.append(toggle);
}
