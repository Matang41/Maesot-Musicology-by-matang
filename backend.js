/* ============================================================
   backend.js — ชั้นข้อมูล (ใช้ร่วมกันทั้งหน้านักเรียนและหน้าครู)
   • Firebase Realtime Database + Google Sign-in (จำกัดโดเมนโรงเรียน)
   • โหมดสาธิต (ไม่ต้องมีเซิร์ฟเวอร์) — ข้อมูลอยู่ในเบราว์เซอร์นี้ ใช้ทดลองระบบ/หลายแท็บจำลองหลายผู้ใช้
   • กันข้อมูลหาย: ทุกการเขียนเข้า "กล่องขาออก" (Outbox) ใน IndexedDB ก่อน → ส่งขึ้นเซิร์ฟเวอร์
     แม้ปิดแอป/ไม่มีสัญญาณ ก็จะส่งต่อเมื่อเปิดใหม่ + แคชข้อมูลไว้ดูออฟไลน์ + สำเนาสำรองในเครื่อง
   ============================================================ */
(function () {
  'use strict';
  const C = window.APP_CONFIG;
  const clone = v => v == null ? null : JSON.parse(JSON.stringify(v));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const parts = p => String(p).split('/').filter(Boolean);
  function getAt(t, p) { let n = t; for (const k of parts(p)) { if (n == null || typeof n !== 'object') return null; n = n[k]; } return n === undefined ? null : n; }
  function setAt(t, p, v) {
    const ks = parts(p); let n = t;
    for (let i = 0; i < ks.length - 1; i++) { if (n[ks[i]] == null || typeof n[ks[i]] !== 'object') n[ks[i]] = {}; n = n[ks[i]]; }
    const last = ks[ks.length - 1];
    if (v == null) delete n[last]; else n[last] = clone(v);
  }
  function applyOp(t, op) {
    if (op.t === 'set') setAt(t, op.p, op.v);
    else if (op.t === 'update') Object.keys(op.v).forEach(k => setAt(t, op.p + '/' + k, op.v[k]));
    else if (op.t === 'remove') setAt(t, op.p, null);
  }
  const norm = p => parts(p).join('/');
  const under = (p, base) => { p = norm(p); base = norm(base); return p === base || !p || p.startsWith(base + '/') || base.startsWith(p + '/'); };
  const opTouches = (op, base) => op.t === 'update' ? Object.keys(op.v || {}).some(k => under(norm(op.p) + '/' + k, base)) : under(op.p, base);

  /* ---------- IndexedDB ---------- */
  const STORES = ['media', 'outbox', 'cache', 'snaps', 'demomedia', 'failed'];
  let dbp = null;
  function idbOpen() {
    if (!dbp) dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no idb'));
      const r = indexedDB.open('mcm5-v2', 1);
      r.onupgradeneeded = () => STORES.forEach(s => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const mem = {}; STORES.forEach(s => mem[s] = new Map());
  async function idb(store, mode, fn) {
    try {
      const db = await idbOpen();
      return await new Promise((res, rej) => { const t = db.transaction(store, mode); const rq = fn(t.objectStore(store)); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
    } catch (e) { return undefined; }
  }
  const IDB = {
    async put(s, o) { mem[s].set(o.id, o); await idb(s, 'readwrite', st => st.put(o)); },
    async get(s, id) { const r = await idb(s, 'readonly', st => st.get(id)); return r || mem[s].get(id) || null; },
    async del(s, id) { mem[s].delete(id); await idb(s, 'readwrite', st => st.delete(id)); },
    async all(s) { const r = await idb(s, 'readonly', st => st.getAll()); return r || Array.from(mem[s].values()); },
    async clear(s) { mem[s].clear(); await idb(s, 'readwrite', st => st.clear()); }
  };

  /* ---------- สถานะ ---------- */
  const status = { online: navigator.onLine, pending: 0, failed: 0, lastSync: 0 };
  const statusCbs = new Set();
  function emitStatus() { statusCbs.forEach(cb => { try { cb(Object.assign({}, status)); } catch (e) { /* ignore */ } }); }

  /* ---------- Firebase implementation ---------- */
  const FBImpl = {
    name: 'firebase',
    async init() {
      await window.MC.loadLibs('fb');
      /* ถ้าเว็บอยู่บน Firebase Hosting ให้ใช้โดเมนเดียวกันเป็น authDomain → ล็อกอินได้ทุกเบราว์เซอร์ (รวม iPhone ที่ติดตั้งเป็นแอป) */
      const cfg = Object.assign({}, C.firebase); const h = location.hostname;
      if (/\.(web\.app|firebaseapp\.com)$/.test(h)) cfg.authDomain = h;
      this.sameOriginAuth = cfg.authDomain === h; this.authDomain = cfg.authDomain;
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      this.db = firebase.database(); this.auth = firebase.auth();
      try { await this.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (e) { /* ignore */ }
      try { await this.auth.getRedirectResult(); } catch (e) { B.authError = e; }
      this.db.ref('.info/connected').on('value', s => { status.online = !!s.val(); emitStatus(); });
    },
    onAuth(cb) { return this.auth.onAuthStateChanged(u => cb(u ? { uid: u.uid, email: (u.email || '').toLowerCase(), name: u.displayName || '', photo: u.photoURL || '', verified: u.emailVerified } : null)); },
    async signIn(opts) {
      const p = new firebase.auth.GoogleAuthProvider();
      const params = { prompt: 'select_account' }; if (opts && opts.hd) params.hd = opts.hd; p.setCustomParameters(params);
      /* ใช้ popup ก่อนเสมอ (ทำงานข้ามโดเมนได้) — redirect ใช้เฉพาะเมื่อเว็บอยู่โดเมนเดียวกับ authDomain เท่านั้น
         เพราะ redirect ข้ามโดเมน (github.io ↔ firebaseapp.com) ถูก Safari/Chrome บล็อกคุกกี้ ทำให้ล็อกอินค้าง */
      try { await this.auth.signInWithPopup(p); }
      catch (e) {
        if (this.sameOriginAuth && ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) return this.auth.signInWithRedirect(p);
        throw e;
      }
    },
    signOut() { return this.auth.signOut(); },
    raw(op) { const r = op.p ? this.db.ref(op.p) : this.db.ref(); return op.t === 'set' ? r.set(op.v) : op.t === 'update' ? r.update(op.v) : r.remove(); },
    get(p) { return this.db.ref(p).once('value').then(s => s.val()); },
    on(p, cb, err) { const r = this.db.ref(p); const h = s => cb(s.val()); r.on('value', h, e => err && err(e)); return () => r.off('value', h); },
    query(p, child, eq) { return this.db.ref(p).orderByChild(child).equalTo(eq).once('value').then(s => s.val()); }
  };

  /* ---------- Demo implementation (localStorage + IndexedDB) ---------- */
  const DKEY = 'mcm5_demo_db', DUSER = 'mcm5_demo_user';
  const DemoImpl = {
    name: 'demo', ls: [], authCb: null,
    tree() { try { return JSON.parse(localStorage.getItem(DKEY)) || {}; } catch (e) { return {}; } },
    save(t) {
      try { localStorage.setItem(DKEY, JSON.stringify(t)); }
      catch (e) { /* พื้นที่โหมดสาธิตเต็ม (~5MB) → ตัดสำเนาประวัติเก่าออกแล้วลองใหม่ ข้อมูลหลักไม่หาย */
        try { Object.values(t.history || {}).forEach(g => { const ks = Object.keys(g || {}).sort((a, b) => (g[a].at || 0) - (g[b].at || 0)); ks.slice(0, Math.max(0, ks.length - 40)).forEach(k => delete g[k]); ks.forEach(k => { if (g[k]) g[k].snap = null; }); }); localStorage.setItem(DKEY, JSON.stringify(t)); }
        catch (e2) { console.warn('demo storage full', e2); if (window.MC) window.MC.toast('พื้นที่โหมดทดลองเต็ม — ไปที่แผงครู → ตั้งค่า → ล้างข้อมูลสาธิต', 5000); }
      }
      this.emit(t);
    },
    async init() {
      if (!localStorage.getItem(DKEY)) this.save(seedDemo());
      window.addEventListener('storage', e => { if (e.key === DKEY) this.emit(); });
      status.online = true;
    },
    onAuth(cb) { this.authCb = cb; let u = null; try { u = JSON.parse(sessionStorage.getItem(DUSER)); } catch (e) { /* ignore */ } setTimeout(() => cb(u), 0); return () => { }; },
    async signIn(opts) { const u = await demoChooser(opts && opts.teacher); if (!u) return; sessionStorage.setItem(DUSER, JSON.stringify(u)); this.authCb && this.authCb(u); },
    async signOut() { sessionStorage.removeItem(DUSER); this.authCb && this.authCb(null); },
    async raw(op) {
      if (op.p && op.p.startsWith('media/') && op.t === 'set') { await IDB.put('demomedia', { id: op.p, v: op.v }); return; }
      const t = this.tree(); applyOp(t, op); this.save(t);
    },
    async get(p) { if (p.startsWith('media/') && parts(p).length === 3) { const r = await IDB.get('demomedia', p); return r ? clone(r.v) : null; } return clone(getAt(this.tree(), p)); },
    on(p, cb) { const l = { p, cb, last: undefined }; this.ls.push(l); this.fire(l); return () => { this.ls = this.ls.filter(x => x !== l); }; },
    emit(t) { t = t || this.tree(); this.ls.forEach(l => this.fire(l, t)); },
    fire(l, t) { t = t || this.tree(); const v = getAt(t, l.p); const s = JSON.stringify(v); if (s !== l.last) { l.last = s; setTimeout(() => l.cb(v == null ? null : JSON.parse(s)), 0); } },
    async query(p, child, eq) { const v = getAt(this.tree(), p) || {}; const o = {}; Object.keys(v).forEach(k => { if (v[k] && v[k][child] === eq) o[k] = v[k]; }); return Object.keys(o).length ? o : null; }
  };

  function seedDemo() {
    const d = C.auth.domain; const t = { roster: {}, groups: {}, memberOf: {}, calendar: {}, config: {} };
    const names1 = ['นายกิตติ พรมมา', 'นางสาวขวัญใจ ศรีสุข', 'นายจิรายุ แก้วมูล', 'นางสาวชนิดา ปัญญา', 'นายณัฐพล ใจดี', 'นางสาวดวงใจ วงศ์ไทย', 'นายต้นกล้า สายน้ำ', 'นางสาวทิพวรรณ คำมา'];
    const names2 = ['นายธนากร มีสุข', 'นางสาวนภัสสร แสงทอง', 'นายปกรณ์ บุญมา', 'นางสาวพิมพ์ชนก ทองดี'];
    names1.forEach((n, i) => t.roster['3010' + (i + 1)] = { name: n, room: '5/1', no: i + 1 });
    names2.forEach((n, i) => t.roster['3020' + (i + 1)] = { name: n, room: '5/2', no: i + 1 });
    const gid = 'g51-demo';
    t.groups[gid] = { name: 'กลุ่มเสียงเตหน่ากู', room: '5/1', createdAt: Date.now(), members: {} };
    ['30101', '30102', '30103', '30104'].forEach(s => { t.groups[gid].members[s] = { name: t.roster[s].name, no: t.roster[s].no }; t.memberOf[s] = gid; });
    const dt = new Date(Date.now() + 5 * 864e5); const ds = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    t.calendar.e1 = { title: 'ลงพื้นที่ชุมชนกะเหรี่ยง บ้านห้วยมะขาม', date: ds, start: '08:30', end: '12:00', community: 'karen', place: 'ศูนย์การเรียนรู้บ้านห้วยมะขาม', meet: 'หน้าเสาธงโรงเรียน 08:00', groups: { [gid]: true }, teacherJoin: true, status: 'approved', createdAt: Date.now(), createdBy: { sid: 'teacher', name: 'ครู' } };
    t._demo = { seededAt: Date.now(), domain: d };
    return t;
  }
  function demoChooser(teacher) {
    return new Promise(res => {
      const t = DemoImpl.tree(); const ro = t.roster || {};
      const w = document.createElement('div'); w.className = 'modal'; w.style.alignItems = 'center';
      const tch = [{ email: C.teacherEmails[0] || 'teacher@' + C.auth.domain, name: '👩‍🏫 ' + (C.course.teacher || 'ครู') + ' (สาธิต)' }];
      const list = teacher ? tch : tch.concat(Object.keys(ro).sort().map(s => ({ email: s + '@' + C.auth.domain, name: ro[s].name, room: ro[s].room })));
      w.innerHTML = '<div class="modal-in" style="border-radius:20px;max-width:440px"><h3>เลือกบัญชีสาธิต</h3><div class="muted" style="margin-bottom:10px">โหมดสาธิต: จำลองการล็อกอินด้วย Google ของโรงเรียน (เปิดหลายแท็บเพื่อจำลองสมาชิกหลายคน)</div>' +
        list.map((u, i) => '<button class="acct" data-i="' + i + '"><b>' + u.name + '</b><span>' + u.email + (u.room ? ' · ม.' + u.room : '') + '</span></button>').join('') +
        (teacher ? '' : '<button class="acct" data-i="x"><b>บัญชีนอกโรงเรียน (ทดสอบการปฏิเสธ)</b><span>someone@gmail.com</span></button>') +
        '<button class="btn sec block" data-i="c" style="margin-top:10px">ยกเลิก</button></div>';
      document.body.appendChild(w);
      w.onclick = e => {
        const b = e.target.closest('[data-i]'); if (!b) return; const i = b.dataset.i; w.remove();
        if (i === 'c') return res(null);
        if (i === 'x') return res({ uid: 'x', email: 'someone@gmail.com', name: 'ผู้ใช้ภายนอก', verified: true });
        const u = list[+i]; res({ uid: 'demo-' + u.email, email: u.email, name: u.name, verified: true });
      };
    });
  }

  /* ---------- Outbox: ทุกการเขียนเก็บไว้ในเครื่องก่อน แล้วค่อยส่ง ---------- */
  let impl = null; const pendingOps = new Map();
  async function refreshCounts() { status.pending = pendingOps.size; status.failed = (await IDB.all('failed')).length; emitStatus(); }
  function send(op) {
    pendingOps.set(op.id, op); refreshCounts();
    return Promise.resolve(impl.raw(op)).then(async () => {
      pendingOps.delete(op.id); await IDB.del('outbox', op.id); status.lastSync = Date.now(); refreshCounts();
    }).catch(async e => {
      pendingOps.delete(op.id); await IDB.del('outbox', op.id);
      if (op.replayed && /^history\//.test(op.p || '')) { refreshCounts(); return; } // ประวัติที่ส่งสำเร็จไปแล้วก่อนปิดแอป
      op.error = (e && (e.code || e.message)) || String(e); op.failedAt = Date.now(); await IDB.put('failed', op);
      refreshCounts(); console.warn('write failed', op.p, e); throw e;
    });
  }
  async function write(t, p, v) {
    const op = { id: uid(), seq: Date.now() + Math.random(), t, p, v: clone(v), at: Date.now() };
    await IDB.put('outbox', op);
    overlayNotify(op);
    return send(op);
  }
  async function replayOutbox() {
    const ops = (await IDB.all('outbox')).sort((a, b) => a.seq - b.seq);
    ops.forEach(op => { op.replayed = true; send(op).catch(() => { }); });
    refreshCounts();
  }

  /* ---------- on(): แคช + ซ้อนการแก้ที่ยังไม่ได้ส่ง ---------- */
  const subs = new Set();
  function overlay(path, val) {
    const ops = Array.from(pendingOps.values()).filter(op => opTouches(op, path)).sort((a, b) => a.seq - b.seq);
    if (!ops.length) return val;
    const w = {}; setAt(w, path, val); ops.forEach(op => applyOp(w, op)); return clone(getAt(w, path));
  }
  function overlayNotify(op) { subs.forEach(s => { if (opTouches(op, s.p)) { pendingOps.set(op.id, op); s.cb(overlay(s.p, s.last)); } }); }
  const cacheT = {};
  function on(path, cb, err) {
    const s = { p: path, cb, last: null, got: false }; subs.add(s);
    IDB.get('cache', path).then(c => { if (c && !s.got) { s.last = c.v; cb(overlay(path, c.v)); } });
    const off = impl.on(path, v => {
      s.got = true; s.last = v; cb(overlay(path, v));
      clearTimeout(cacheT[path]); cacheT[path] = setTimeout(() => IDB.put('cache', { id: path, v, at: Date.now() }), 800);
    }, e => { if (err) err(e); });
    return () => { subs.delete(s); off(); };
  }

  /* ---------- สื่อ (ภาพ/เสียง) ---------- */
  async function getMedia(gid, mid) {
    const id = gid + '/' + mid; const c = await IDB.get('media', id); if (c) return c;
    try { const v = await impl.get('media/' + gid + '/' + mid); if (v) { const o = Object.assign({ id }, v); await IDB.put('media', o); return o; } } catch (e) { /* ignore */ }
    const pend = Array.from(pendingOps.values()).find(op => op.p === 'media/' + gid + '/' + mid); return pend ? Object.assign({ id }, pend.v) : null;
  }
  async function putMedia(gid, mid, obj) { await IDB.put('media', Object.assign({ id: gid + '/' + mid }, obj)); return write('set', 'media/' + gid + '/' + mid, obj); }

  /* ---------- สำเนาสำรองในเครื่อง (เก็บ 15 ชุดล่าสุด) ---------- */
  async function snapshot(key, data) {
    const all = (await IDB.all('snaps')).filter(s => s.key === key).sort((a, b) => b.at - a.at);
    if (all[0] && JSON.stringify(all[0].data) === JSON.stringify(data)) return;
    await IDB.put('snaps', { id: key + '@' + Date.now(), key, at: Date.now(), data: clone(data) });
    for (const old of all.slice(14)) await IDB.del('snaps', old.id);
  }
  async function snapshots(key) { return (await IDB.all('snaps')).filter(s => s.key === key).sort((a, b) => b.at - a.at); }

  /* ---------- public ---------- */
  const B = window.B = {
    mode: 'demo', status, IDB, uid, clone, getAt, setAt,
    configured() {
      try { const q = new URLSearchParams(location.search).get('demo'); const real = this.realConfigured();
        if (q === '1' && (!real || sessionStorage.getItem('mcm5_demo_ok'))) sessionStorage.setItem('mcm5_force_demo', '1'); /* โหมดทดลองเปิดได้จากศูนย์กลางครูเท่านั้น */ if (q === '0') sessionStorage.removeItem('mcm5_force_demo'); if (sessionStorage.getItem('mcm5_force_demo')) return false; } catch (e) { /* ignore */ }
      const f = C.firebase || {}; return !!(f.apiKey && f.databaseURL && f.projectId); },
    async init() {
      impl = this.configured() ? FBImpl : DemoImpl; this.mode = impl.name;
      await impl.init();
      window.addEventListener('online', () => { if (impl === DemoImpl) { status.online = true; emitStatus(); } });
      window.addEventListener('offline', () => { if (impl === DemoImpl) { status.online = false; emitStatus(); } });
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
      await replayOutbox();
    },
    onAuth: cb => impl.onAuth(cb),
    signIn: opts => impl.signIn(opts),
    signOut: () => impl.signOut(),
    set: (p, v) => write('set', p, v),
    update: (p, v) => write('update', p, v),
    remove: p => write('remove', p, null),
    get: p => impl.get(p),
    on, query: (p, c, e) => impl.query(p, c, e),
    getMedia, putMedia, snapshot, snapshots,
    failedOps: () => IDB.all('failed'),
    async retryFailed() { for (const op of await IDB.all('failed')) { await IDB.del('failed', op.id); delete op.error; await IDB.put('outbox', op); send(op).catch(() => { }); } refreshCounts(); },
    onStatus(cb) { statusCbs.add(cb); cb(Object.assign({}, status)); return () => statusCbs.delete(cb); },
    authErrorText(e) {
      const code = (e && e.code) || ''; const host = location.hostname;
      const T = {
        'auth/unauthorized-domain': 'โดเมน ' + host + ' ยังไม่ได้รับอนุญาต → Firebase › Authentication › Settings › Authorized domains › เพิ่ม ' + host,
        'auth/operation-not-allowed': 'ยังไม่ได้เปิดการล็อกอินด้วย Google → Firebase › Authentication › Sign-in method › Google › Enable',
        'auth/popup-blocked': 'เบราว์เซอร์บล็อกหน้าต่างล็อกอิน → อนุญาต pop-up สำหรับเว็บนี้ แล้วกดใหม่',
        'auth/popup-closed-by-user': 'หน้าต่างล็อกอินถูกปิดก่อนเสร็จ — ถ้าหน้าต่าง Google ขึ้นว่า “Access blocked / ถูกบล็อก / ผู้ดูแลระบบจำกัดการเข้าถึง” แปลว่าผู้ดูแลอีเมลโรงเรียน (@sappha.ac.th) ต้องอนุญาตแอปนี้ก่อน ให้แจ้งครู; ถ้าไม่ใช่ ให้กดเข้าสู่ระบบใหม่',
        'auth/cancelled-popup-request': 'มีหน้าต่างล็อกอินเปิดอยู่แล้ว — ปิดแล้วกดใหม่',
        'auth/network-request-failed': 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ — ตรวจสัญญาณแล้วลองใหม่',
        'auth/web-storage-unsupported': 'เบราว์เซอร์นี้ปิดการเก็บข้อมูล (โหมดส่วนตัว/บล็อกคุกกี้) — เปิดด้วย Safari/Chrome ปกติ',
        'auth/operation-not-supported-in-this-environment': 'แอปที่ติดตั้งบนหน้าจอโฮมล็อกอินด้วยวิธีนี้ไม่ได้ — เปิดผ่านเบราว์เซอร์ หรือย้ายเว็บไป Firebase Hosting (ดูคู่มือ)',
        'auth/internal-error': 'ระบบล็อกอินขัดข้อง — ถ้าเปิดจากแอปบนหน้าจอโฮม ให้ลองเปิดผ่านเบราว์เซอร์',
        'auth/too-many-requests': 'ลองหลายครั้งเกินไป — รอสักครู่แล้วลองใหม่'
      };
      return (T[code] || ((e && e.message) || String(e))) + (code ? ' [' + code + ']' : '');
    },
    diagnostics() {
      const ua = navigator.userAgent; const sa = window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone;
      return { mode: this.mode, host: location.hostname, authDomain: impl && impl.authDomain, sameOriginAuth: !!(impl && impl.sameOriginAuth), online: status.online, navigatorOnline: navigator.onLine,
        standalone: sa, ios: /iPhone|iPad|iPod/.test(ua), browser: (/CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : 'อื่น ๆ'), pending: status.pending, failed: status.failed, lastAuthError: this.authError ? this.authErrorText(this.authError) : '' };
    },
    sidFromEmail(email) {
      email = String(email || '').toLowerCase(); const dom = '@' + C.auth.domain.toLowerCase();
      if (!email.endsWith(dom)) return null; const sid = email.slice(0, -dom.length);
      return new RegExp(C.auth.sidPattern).test(sid) ? sid : null;
    },
    isTeacher: email => (C.teacherEmails || []).map(e => e.toLowerCase()).includes(String(email || '').toLowerCase()),
    realConfigured() { const f = C.firebase || {}; return !!(f.apiKey && f.databaseURL); },
    resetDemo() { localStorage.removeItem(DKEY); sessionStorage.removeItem(DUSER); return IDB.clear('demomedia'); }
  };
})();
