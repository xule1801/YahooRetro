// Preload (sandbox): chỉ mở đúng 3 hàm cho renderer, không lộ Node/Electron.
const { contextBridge, ipcRenderer } = require("electron");

async function unwrap(p) {
  const r = await p;
  if (r.ok) return r.value;
  const e = new Error(r.error.message);
  e.code = r.error.code; e.retryAfterSec = r.error.retryAfterSec;
  throw e;
}

contextBridge.exposeInMainWorld("yc", {
  call: (method, ...args) => unwrap(ipcRenderer.invoke("core", method, args)),
  app: (action, ...args) => unwrap(ipcRenderer.invoke("app", action, args)),
  on: (fn) => {
    const h = (_e, name, payload) => fn(name, payload);
    ipcRenderer.on("core-event", h);
    return () => ipcRenderer.removeListener("core-event", h);
  },
});
