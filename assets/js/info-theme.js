try { document.documentElement.dataset.theme=JSON.parse(localStorage.getItem('qmj-clone:ui')||'{}').theme==='dark'?'dark':'light'; } catch {}
