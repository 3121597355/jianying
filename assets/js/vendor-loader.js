const pending = new Map();

/** Share dependency requests; a failed download can be retried. */
export function loadVendor(src, available) {
  if (available()) return Promise.resolve();
  if (pending.has(src)) return pending.get(src);
  const request = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      if (available()) resolve();
      else { script.remove(); reject(new Error('组件初始化失败')); }
    };
    script.onerror = () => { script.remove(); reject(new Error('组件下载失败，请重试')); };
    document.head.appendChild(script);
  });
  pending.set(src, request);
  request.catch(() => { if (pending.get(src) === request) pending.delete(src); });
  return request;
}
