async function req(path, opts) {
  const r = await fetch(path, opts);
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) throw new Error((data && data.error) || `Request failed (${r.status})`);
  return data;
}

export const api = {
  getState: () => req("/api/state"),
  setupPool: (poolName, adminPassword) =>
    req("/api/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ poolName, adminPassword }) }),
  submitEntry: (name, pin, predictions) =>
    req("/api/entry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, pin, predictions }) }),
  adminVerify: (adminPassword) =>
    req("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ adminPassword, action: "verify" }) }),
  adminSave: (adminPassword, groups) =>
    req("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ adminPassword, groups }) }),
  adminDeleteEntry: (adminPassword, name) =>
    req("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ adminPassword, action: "deleteEntry", name }) }),
};
