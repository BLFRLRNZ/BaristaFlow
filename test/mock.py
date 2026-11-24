MOCK_TEMPLATE = r"""
(() => {
  const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
  const store = JSON.parse(JSON.stringify(__SEEDS__));
  for (const c of ['fornitori','articoli','documenti','ricette','produzioni','movimenti','impostazioni']) store[c] ||= {};
  const subs = {};
  const snap = c => { const docs = Object.entries(store[c] || {}).map(([id, v]) => { const d = deepFreeze(JSON.parse(JSON.stringify(v))); return {id, exists: true, data: () => d, metadata: {fromCache: false, hasPendingWrites: false}}; }); return {docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {fromCache: false, hasPendingWrites: false}}; };
  const emit = c => setTimeout(() => (subs[c] || []).forEach(f => f(snap(c))), 25);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const db = {collection(c) { return {
    onSnapshot(next) { (subs[c] ||= []).push(next); emit(c); return () => {}; },
    doc(id) { return {
      async set(v) { await wait(15); (store[c] ||= {})[id] = JSON.parse(JSON.stringify(v)); window.__writes.push(['set', c, id]); emit(c); },
      async delete() { await wait(15); if (store[c]) delete store[c][id]; window.__writes.push(['del', c, id]); emit(c); },
      async get() { const v = store[c]?.[id]; return {id, exists: !!v, data: () => v}; }
    }; }
  }; }};
  window.__store = store; window.__writes = []; window.__downloads = [];
  const caps = {
    db: __DBNULL__ ? null : db,
    user: {can: async () => __CAN__, isOwner: async () => __CAN__, canEdit: async () => __CAN__, id: async () => 'u1'},
    downloads: {save: async ({filename, data}) => { window.__downloads.push({filename}); return {status: 'saved'}; }},
    assets: null
  };
  window.claude = {use: name => new Promise(r => setTimeout(() => r(caps[name] ?? null), 40))};
})();
"""
