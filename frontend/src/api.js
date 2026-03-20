// Global HTTP helpers — loaded before all JSX components
// No ES module syntax: everything is window-scoped for Babel standalone

const api = (path, options = {}) =>
  fetch(path, options).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });

const jsonPost = (path, body) =>
  api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const jsonPut = (path, body) =>
  api(path, { method: "PUT",  headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const jsonPatch = (path, body = {}) =>
  api(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const httpDel = (path) =>
  api(path, { method: "DELETE" });
