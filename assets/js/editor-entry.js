import { loadVendor } from './vendor-loader.js';

async function startEditor() {
  try {
    const [{ bootEditor }] = await Promise.all([
      import('./app.js?v=20261112-touch'),
      loadVendor('/assets/vendor/quill.js', () => Boolean(window.Quill)),
    ]);
    bootEditor();
    const workspace = document.getElementById('editorWorkspace');
    workspace.inert = false;
    workspace.setAttribute('aria-busy', 'false');
    document.documentElement.dataset.editorState = 'ready';
    document.getElementById('editorStartup')?.remove();
  } catch (error) {
    document.documentElement.dataset.editorState = 'error';
    console.error('简历编辑器加载失败', error);
  }
}

startEditor();
