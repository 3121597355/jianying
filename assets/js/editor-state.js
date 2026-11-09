/** Fresh visits and drafts without a saved sidebar choice start in edit mode. */
export function normalizeEditorUi(value) {
  const ui=value && typeof value==='object' && !Array.isArray(value)?value:{};
  return {tab:'basic',...ui,editOpen:ui.editOpen!==false};
}
