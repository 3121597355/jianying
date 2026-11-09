import {RESUME_ENTRY_TARGETS} from '../../assets/js/workspace-nav.js';
/** Keep the first return destination while the photo draft is being saved. */
export function createReturnNavigation({ save, navigate, isBusy, onBusy, onPending = () => {} }) {
  let pending = false;
  return async destination => {
    if (!['/', ...RESUME_ENTRY_TARGETS].includes(destination) || pending) return false;
    if (isBusy()) { onBusy(); return false; }
    pending = true;
    onPending(true);
    let navigated = false;
    try {
      if (!await save()) return false;
      navigate(destination);
      navigated = true;
      // Remain locked until the document leaves; a second click cannot redirect it.
      return true;
    } catch {
      return false;
    } finally {
      // Failed saves stay on this page and permit a later retry.
      // Successful navigation keeps the lock while the browser changes documents.
      if (!navigated) { pending = false; onPending(false); }
    }
  };
}
