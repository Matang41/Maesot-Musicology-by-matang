/* ============================================================
   student.js — แอปนักเรียน (ทำงานเป็นกลุ่ม)
   ล็อกอินด้วย Google ของโรงเรียน → ผูกกับรายชื่อ → เข้ากลุ่มที่ครูจัด → บันทึกร่วมกันแบบเรียลไทม์
   ทุกการบันทึกประทับเวลา/ผู้บันทึก + เก็บประวัติ + ลบแบบกู้คืนได้ + ส่งต่อแม้ออฟไลน์
   ============================================================ */
(function () {
  'use strict';
  const M = window.MC, C = M.C;
  const { $, $$, esc, today, nowTime, thDate, thDateTime, ago, commName, taskById, roleById, nl2, short, FORMS, toast, modal, avatar } = M;

  let USER = null, ME = null, GID = null, CUR = null;
  let D = blankD();
  const MEDIA = {}; let subs = [], gsubs = [];
  const CAL = { y: new Date().getFullYear(), m: new Date().getMonth(), sel: today() };
  let STATUS = { online: true, pending: 0, failed: 0 };
  function blankD() { return { roster: null, group: null, records: {}, docs: {}, history: {}, personal: {}, calendar: {}, config: {}, consents: {}, ct: {}, gGrade: null, sGrade: null, tc: {}, ready: false }; }
  const me = () => ({ sid: ME.sid, name: ME.name });
  const G = () => ({ records: D.records || {}, docs: D.docs || {}, history: D.history || {} });
  const W = p => Promise.resolve(p).catch(e => { toast('บันทึกขึ้นเซิร์ฟเวอร์ไม่สำเร็จ: ' + ((e && (e.code || e.message)) || e) + ' (ข้อมูลยังอยู่ในเครื่อง)', 4500); });
  const maxOf = t => (D.config && D.config.max && D.config.max[t.id] != null) ? +D.config.max[t.id] : t.max;
  const TASK_ROUTE = { t1: 'notes', t2: 'interviews', t3: 'analyses', t4: 'roles', t5: 'conservation', t6: 'report', t7: 'reflection' };

  /* ---------- สมาชิกกลุ่ม ---------- */
  function members() {
    const g = D.group; if (!g || !g.members) return [];
    return Object.keys(g.members).map(sid => ({ sid, name: g.members[sid].name, no: g.members[sid].no, roles: (g.roles && g.roles[sid]) || [] })).sort((a, b) => (+a.no) - (+b.no));
  }
  const memberName = sid => { const m = members().find(x => x.sid === sid); return m ? m.name : sid; };
  function assignees(tid) { const a = D.group && D.group.assign && D.group.assign[tid]; return a ? Object.keys(a).filter(k => a[k]) : []; }
  function myEvents() {
    return Object.keys(D.calendar || {}).map(id => Object.assign({ id }, D.calendar[id])).filter(e => {
      if (!e.date) return false; const gs = e.groups ? Object.keys(e.groups) : [];
      if (gs.length) return GID && gs.includes(GID);
      return !e.room || (ME && e.room === ME.room);
    }).sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
  }
  const eventsMap = () => { const o = {}; myEvents().forEach(e => o[e.id] = e); return o; };

  /* ---------- subscriptions ---------- */
  function first(path, assign, err) {
    return new Promise(res => {
      let done = false; const t = setTimeout(() => { if (!done) { done = true; res(); } }, 8000);
      const off = B.on(path, v => { assign(v); if (!done) { done = true; clearTimeout(t); res(); } else onData(); }, e => { if (err) err(e); if (!done) { done = true; clearTimeout(t); res(); } });
      subs.push(off);
    });
  }
  function clearSubs() { subs.forEach(f => f()); subs = []; gsubs.forEach(f => f()); gsubs = []; }
  function subGroup(gid) {
    gsubs.forEach(f => f()); gsubs = []; GID = gid || null;
    D.group = null; D.records = {}; D.docs = {}; D.history = {}; D.gGrade = null;
    if (!GID) { onData(); return; }
    const S = (p, k, err) => gsubs.push(B.on(p, v => { D[k] = v || (k === 'group' || k === 'gGrade' ? null : {}); onData(); }, err));
    S('groups/' + GID, 'group'); S('records/' + GID, 'records'); S('docs/' + GID, 'docs'); S('history/' + GID, 'history');
    S('grades/groups/' + GID, 'gGrade', () => { }); S('tcomments/' + GID, 'tc', () => { });
  }

  let rT = null;
  function onData() {
    if (!D.ready) return; mirrorFw();
    cancelAnimationFrame(rT); rT = requestAnimationFrame(() => {
      if (CUR && $('[data-form]')) syncForm(); else if (['listen', 'map'].includes(route().a)) setBadge(); else render(true);
    });
    clearTimeout(onData.snap); onData.snap = setTimeout(() => {
      if (GID) B.snapshot('g:' + GID, { group: D.group, records: D.records, docs: D.docs });
      if (ME) B.snapshot('p:' + ME.sid, D.personal || {});
    }, 15000);
  }

  /* ---------- auth flow ---------- */
  async function onAuth(u) {
    clearSubs(); Object.keys(CTW).forEach(k => delete CTW[k]); D = blankD(); USER = u; ME = null; GID = null; CUR = null;
    if (!u) { renderLogin(); return; }
    if (B.isTeacher(u.email)) { teacherEntry(u); return; }
    const sid = B.sidFromEmail(u.email);
    if (!sid) { renderBlocked('ใช้ได้เฉพาะบัญชีนักเรียน @' + C.auth.domain, 'บัญชี ' + u.email + ' ไม่ใช่อีเมลนักเรียนของโรงเรียน (รูปแบบ รหัสนักเรียน@' + C.auth.domain + ')'); return; }
    $('#root').innerHTML = '<div class="empty" style="padding-top:30vh">กำลังโหลดข้อมูล…</div>';
    let rErr = null, rGot = false, rWait = false; await first('roster/' + sid, v => { D.roster = v; rGot = true; if (rWait) { rWait = false; onAuth(u); } }, e => { rErr = e; });
    if (!rGot && !rErr) { rWait = true; renderBlocked('ยังเชื่อมต่อฐานข้อมูลไม่ได้', (navigator.onLine === false ? 'เครื่องนี้ออฟไลน์อยู่' : 'สัญญาณอินเทอร์เน็ตช้าหรือหลุด') + ' — การเข้าใช้ครั้งแรกบนเครื่องนี้ต้องมีอินเทอร์เน็ต ระบบจะเข้าให้เองทันทีเมื่อเชื่อมต่อได้ (บัญชี ' + u.email + ')', '<button class="btn gold block" data-act="reload">↻ ลองใหม่</button>' + diagBtn()); return; }
    if (rErr) { renderBlocked('ล็อกอินสำเร็จ แต่อ่านข้อมูลไม่ได้', 'บัญชี ' + u.email + ' ได้รับการปฏิเสธจากฐานข้อมูล (' + ((rErr && (rErr.code || rErr.message)) || rErr) + ') — ครูตรวจว่าเผยแพร่ Rules แล้ว และนำเข้ารายชื่อรหัส ' + sid + ' แล้ว', diagBtn()); return; }
    if (!D.roster) { renderBlocked('ไม่พบรหัส ' + sid + ' ในรายชื่อ', 'ครูยังไม่ได้นำเข้ารายชื่อของคุณ หรือรหัสไม่ตรง กรุณาแจ้งครู'); return; }
    if (D.roster.left) { renderBlocked('บัญชีนี้ไม่อยู่ในรายชื่อรายวิชาแล้ว', 'ครูได้นำรหัส ' + sid + ' ออกจากรายชื่อ (' + (D.roster.leftNote || 'ย้ายออก') + ') หากไม่ถูกต้องกรุณาแจ้งครู'); return; }
    ME = { sid, name: D.roster.name, room: D.roster.room, no: D.roster.no, email: u.email, photo: u.photo };
    await Promise.all([
      first('memberOf/' + sid, v => { if ((v || null) !== GID) subGroup(v); }),
      first('personal/' + sid, v => { D.personal = v || {}; }),
      first('calendar', v => { D.calendar = v || {}; }),
      first('config', v => { D.config = v || {}; M.applyInfo(D.config); }, () => { }),
      first('consents/' + sid, v => { D.consents = v || {}; watchTokens(); }, () => { }),
      first('grades/students/' + sid, v => { D.sGrade = v; }, () => { })
    ]);
    D.ready = true; render();
  }

  /* ---------- ครู: ศูนย์กลาง (hub) + มุมมองนักเรียน ---------- */
  let HUBG = {};
  async function teacherEntry(u) {
    $('#root').innerHTML = '<div class="empty" style="padding-top:30vh">กำลังโหลด…</div>';
    await first('groups', v => { HUBG = v || {}; if (!ME && route().a === 'hub') renderHub(u); }, () => { });
    const as = sessionStorage.getItem('mcm5_viewas');
    if (as && HUBG[as]) return teacherAsGroup(u, as);
    sessionStorage.removeItem('mcm5_viewas'); if (route().a !== 'hub') location.hash = '#/hub'; renderHub(u);
  }
  function renderHub(u) {
    u = u || USER; const demo = B.mode === 'demo';
    const gs = Object.keys(HUBG).map(id => Object.assign({ id }, HUBG[id])).sort((a, b) => (a.room + a.name).localeCompare(b.room + b.name, 'th', { numeric: true }));
    const byRoom = {}; gs.forEach(g => (byRoom[g.room] = byRoom[g.room] || []).push(g));
    $('#root').innerHTML = '<div class="hero small"><div class="logos"><img class="big" src="icons/logo-full.png" alt=""></div><h1>ศูนย์กลาง · ' + esc(C.appName) + '</h1><p>สวัสดี ' + esc(u.name || u.email) + ' · ' + esc(u.email) + '</p></div>' +
      '<div class="hub">' + (demo ? '<div class="demo-strip">🧪 กำลังใช้ <b>โหมดทดลอง</b> (ข้อมูลสาธิต ไม่กระทบข้อมูลจริง)' + (B.realConfigured() ? ' · <a href="index.html?demo=0">กลับไปข้อมูลจริง</a>' : '') + '</div>' : '') +
      '<div class="hub-grid">' +
      '<a class="hub-btn gold" href="teacher.html' + (demo ? '' : '') + '"><span>🧑‍🏫</span><b>แผงควบคุมครู</b><small>นำเข้ารายชื่อ · จัดกลุ่ม · ปฏิทิน · ตรวจงาน · ส่งออกคะแนน · สำรองข้อมูล</small></a>' +
      '<button class="hub-btn" data-act="hubview"><span>👀</span><b>ดูแอปในมุมมองนักเรียน</b><small>เลือกกลุ่ม แล้วเห็นหน้าจอเหมือนที่นักเรียนเห็น (ข้อมูลจริง อ่านอย่างเดียว)</small></button>' +
      (demo ? '<button class="hub-btn" data-act="demoas"><span>🧪</span><b>ทดลองเป็นนักเรียน</b><small>สลับเป็นบัญชีนักเรียนสาธิต แล้วลองบันทึก แนบรูป ส่งงานได้เต็มรูปแบบ</small></button>'
        : '<a class="hub-btn" href="#" data-act="godemo" data-to="index.html?demo=1"><span>🧪</span><b>ทดลองระบบนักเรียน</b><small>ใช้ข้อมูลสาธิต ลองบันทึก แนบรูป ส่งงานได้เต็มรูปแบบ ไม่กระทบข้อมูลจริง</small></a>') +
      '<a class="hub-btn" href="#" data-act="godemo" data-to="teacher.html?demo=1"><span>🧰</span><b>ทดลองแผงครู (ข้อมูลสาธิต)</b><small>ฝึกจัดกลุ่ม ให้คะแนน ส่งออก โดยไม่แตะข้อมูลจริง</small></a>' +
      '</div><div class="card" id="hubGroups"' + (route().b === 'groups' ? '' : ' hidden') + '><div class="card-title">👀 เลือกกลุ่มที่จะดู</div>' +
      (gs.length ? Object.keys(byRoom).sort((a, b) => a.localeCompare(b, 'th', { numeric: true })).map(r => '<div class="muted" style="margin:8px 0 4px">ม.' + esc(r) + '</div><div class="row wrap">' + byRoom[r].map(g => '<button class="btn sm sec" data-act="viewas" data-id="' + esc(g.id) + '">' + esc(g.name) + ' (' + Object.keys(g.members || {}).length + ')</button>').join('') + '</div>').join('') : '<div class="muted">ยังไม่มีกลุ่ม — ไปที่แผงควบคุมครู → รายชื่อ & จัดกลุ่ม</div>') + '</div>' +
      '<button class="btn sec block" data-act="logout">ออกจากระบบ</button></div>' + M.copyrightHTML();
  }
  async function teacherAsGroup(u, gid) {
    const g = HUBG[gid]; sessionStorage.setItem('mcm5_viewas', gid);
    ME = { sid: 'teacher', name: 'ครู (' + (u.name || u.email) + ')', room: g.room, no: '-', email: u.email, teacher: true };
    D.personal = {};
    await Promise.all([first('calendar', v => { D.calendar = v || {}; }, () => { }), first('config', v => { D.config = v || {}; M.applyInfo(D.config); }, () => { })]);
    subGroup(gid); D.ready = true; if (route().a === 'hub') location.hash = '#/home'; render();
  }
  const WRITE_ACTS = ['done', 'new', 'delrec', 'restore', 'delmedia', 'gps', 'clearsign', 'assign', 'flag', 'roles', 'propose', 'pick', 'rec'];

  /* ---------- คอมเมนต์ครู + การแจ้งเตือน ---------- */
  function tcHTML(rid) { const c = D.tc && D.tc[rid]; return c ? '<div class="tcomment"><b>💬 ครูคอมเมนต์</b> <span class="muted">· ' + esc(thDateTime(c.at)) + '</span><div style="margin-top:4px">' + nl2(c.text) + '</div></div>' : ''; }
  const seenKey = () => 'mcm5_seen_' + (ME ? ME.sid : '');
  function getSeen() { try { return +localStorage.getItem(seenKey()) || 0; } catch (e) { return 0; } }
  function notifs() {
    if (!ME) return []; const seen = getSeen(), out = [];
    myEvents().forEach(e => { if (e.status === 'approved' && e.approvedAt) out.push({ ic: '✅', t: 'ครูอนุมัตินัดลงพื้นที่ “' + e.title + '” ' + thDate(e.date), at: e.approvedAt, go: '#/calendar' });
      else if (e.createdBy && e.createdBy.sid === 'teacher' && e.createdAt) out.push({ ic: '🗓', t: 'ครูเพิ่มนัดลงพื้นที่ “' + e.title + '” ' + thDate(e.date) + (e.teacherJoin ? ' (ครูไปด้วย)' : ''), at: e.updatedAt || e.createdAt, go: '#/calendar' }); });
    Object.keys(D.tc || {}).forEach(rid => { const c = D.tc[rid]; const kind = c.kind; const rec = M.LIST_KINDS.includes(kind) ? getRec(kind, rid) : null; out.push({ ic: '💬', t: 'ครูคอมเมนต์ใน' + ((FORMS[kind] || {}).title || '') + (rec ? ' “' + FORMS[kind].summary(rec).t + '”' : '') + ': ' + String(c.text).slice(0, 60), at: c.at, go: rec ? '#/' + kind + '/' + rid : '#/' + kind }); });
    const gt = (D.gGrade && D.gGrade.released && D.gGrade.tasks) || {}; Object.keys(gt).forEach(tid => { const tk = taskById(tid); if (tk && gt[tid].at) out.push({ ic: '⭐', t: 'ครูให้คะแนนงาน “' + tk.name + '” แล้ว', at: gt[tid].at, go: '#/' + TASK_ROUTE[tid] }); });
    const mine = Object.values(D.history || {}).filter(h => h.at > seen && h.by && h.by.sid !== ME.sid);
    if (mine.length) { const who = Array.from(new Set(mine.map(h => short(h.by.name)))).join(', '); out.push({ ic: '👥', t: who + ' บันทึก/แก้ไขข้อมูลกลุ่ม ' + mine.length + ' ครั้ง', at: Math.max.apply(null, mine.map(h => h.at)), go: '#/home' }); }
    out.forEach(x => x.isNew = (x.at || 0) > seen);
    return out.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 30);
  }
  function bellModal() {
    const list = notifs();
    modal('<h3>🔔 การแจ้งเตือน</h3>' + (list.length ? '<ul class="feed">' + list.map(n => '<li class="' + (n.isNew ? 'new' : '') + '"><span style="font-size:1.3rem">' + n.ic + '</span><div class="grow">' + esc(n.t) + '<div class="muted" style="font-size:.74rem">' + esc(ago(n.at)) + (n.isNew ? ' · ใหม่' : '') + '</div></div><a class="btn xs sec" href="' + n.go + '" data-close>ดู</a></li>').join('') + '</ul>' : '<div class="empty">ยังไม่มีการแจ้งเตือน</div>') + '<button class="btn sec block" style="margin-top:10px" data-close>ปิด</button>', { center: true });
    try { localStorage.setItem(seenKey(), Date.now()); } catch (e) { /* ignore */ }
    setTimeout(() => { const b = $('.bell b'); if (b) b.remove(); }, 50);
  }

  /* ---------- การเขียนข้อมูล ---------- */
  const lastHist = {};
  function log(kind, rid, act, snap) {
    const key = kind + '/' + rid; if (act === 'edit' && lastHist[key] && Date.now() - lastHist[key] < 120000) return; lastHist[key] = Date.now();
    W(B.set('history/' + GID + '/' + B.uid(), { at: Date.now(), by: me(), kind, rid, act, snap: snap ? JSON.stringify(snap) : null }));
  }
  function recPath(kind, rid) { return 'records/' + GID + '/' + kind + '/' + rid; }
  function getRec(kind, rid) { const r = D.records && D.records[kind] && D.records[kind][rid]; return r ? Object.assign({ id: rid }, r) : null; }
  function newRecord(kind) {
    const rid = B.uid(), now = Date.now();
    const ev = myEvents().find(e => e.date === today());
    const lc = (ev && ev.community) || localStorage.getItem('mcm5_lastComm') || '';
    const rec = { community: lc, date: today(), createdAt: now, createdBy: me(), updatedAt: now, updatedBy: me() };
    if (lc === 'other') rec.communityOther = (ev && ev.community === 'other' ? ev.communityOther : localStorage.getItem('mcm5_lastOther')) || '';
    if (kind === 'notes') { rec.time = nowTime(); if (ev) { rec.eventId = ev.id; rec.place = ev.place || ''; } }
    D.records[kind] = D.records[kind] || {}; D.records[kind][rid] = rec;
    W(B.set(recPath(kind, rid), rec)); log(kind, rid, 'create', rec);
    location.hash = '#/' + kind + '/' + rid;
  }
  const PEND = {};
  function queueField(k, v) {
    if (!CUR || (ME && ME.teacher)) return; const key = CUR.path; const p = PEND[key] = PEND[key] || { cur: Object.assign({}, CUR), f: {} }; p.f[k] = v;
    clearTimeout(p.t); p.t = setTimeout(() => flushKey(key), 500);
  }
  function flushKey(key) {
    const p = PEND[key]; if (!p) return; delete PEND[key]; clearTimeout(p.t); const c = p.cur, now = Date.now();
    const upd = Object.assign({}, p.f);
    if (c.kind === 'reflection') { W(B.update(c.path, upd)); return; }
    if (c.single) { Object.keys(p.f).forEach(k => upd['_by/' + k] = { sid: ME.sid, name: ME.name, at: now }); upd._updatedAt = now; W(B.update(c.path, upd)); log(c.kind, c.kind, 'edit', Object.assign({}, D.docs[c.kind] || {}, p.f)); return; }
    upd.updatedAt = now; upd.updatedBy = me(); W(B.update(c.path, upd)); log(c.kind, c.rid, 'edit', Object.assign({}, getRec(c.kind, c.rid) || {}, p.f));
  }
  function flushAll() { Object.keys(PEND).forEach(flushKey); }
  function curData() {
    if (!CUR) return {};
    if (CUR.kind === 'reflection') return (D.personal && D.personal.reflection) || {};
    if (CUR.single) return (D.docs && D.docs[CUR.kind]) || {};
    return getRec(CUR.kind, CUR.rid) || {};
  }

  /* ---------- สื่อ ---------- */
  async function ensureMedia(ids) {
    const miss = ids.filter(id => !MEDIA[id]); if (!miss.length || !GID) return false;
    await Promise.all(miss.map(async id => { const m = await B.getMedia(GID, id); if (m) MEDIA[id] = m; })); return true;
  }
  function hydrate(root) { $$('[data-mid]', root || document).forEach(el => { const m = MEDIA[el.dataset.mid]; if (m && el.getAttribute('src') !== m.d) el.src = m.d; }); }
  async function addMedia(type, d) {
    if (!CUR || CUR.single) return; if (String(d || '').length > 2900000) { toast('ไฟล์ใหญ่เกินไป (เกิน ~2 MB) — ลองอัดเสียงให้สั้นลง หรือถ่ายภาพใหม่', 4500); return; } const rec = curData(); const ids = M.mediaIds(rec);
    const n = ids.filter(id => ((MEDIA[id] || {}).type || 'image') === type).length;
    if (n >= (type === 'image' ? 10 : 3)) { toast(type === 'image' ? 'แนบรูปได้สูงสุด 10 รูปต่อรายการ' : 'แนบเสียงได้สูงสุด 3 ไฟล์ต่อรายการ'); return; }
    const mid = B.uid(), now = Date.now(); const obj = { type, d, by: me(), at: now, kind: CUR.kind, rid: CUR.rid };
    MEDIA[mid] = obj; W(B.putMedia(GID, mid, obj));
    W(B.update(CUR.path, { ['media/' + mid]: { at: now, t: type, by: ME.sid }, updatedAt: now, updatedBy: me() })); log(CUR.kind, CUR.rid, 'media', null);
  }
  async function addImage(file) { try { await addMedia('image', await M.fileToImageData(file, 1280, 0.72)); } catch (e) { toast('เพิ่มรูปไม่สำเร็จ'); } }

  /* ---------- shell ---------- */
  const NAV = [['home', '🏠', 'กลุ่ม'], ['notes', '📓', 'ภาคสนาม'], ['analyses', '🎻', 'วิเคราะห์'], ['calendar', '🗓', 'ปฏิทิน'], ['synth', '🧩', 'สรุป']];
  const NAVMAP = { home: 'home', notes: 'notes', interviews: 'notes', analyses: 'analyses', roles: 'analyses', calendar: 'calendar', synth: 'synth', conservation: 'synth', report: 'synth', reflection: 'synth', map: 'synth', listen: 'synth', trash: 'home', safety: 'home' };
  function route() { const h = (location.hash || '#/home').replace(/^#\/?/, ''); const [a, b] = h.split('/'); return { a: a || 'home', b: b || '' }; }
  function badge() {
    if (B.mode === 'demo' && STATUS.pending === 0) return ['off', '🧪 โหมดสาธิต'];
    if (STATUS.failed) return ['err', '⚠ ส่งไม่สำเร็จ ' + STATUS.failed];
    if (!STATUS.online) return ['pend', '📴 ออฟไลน์' + (STATUS.pending ? ' · รอส่ง ' + STATUS.pending : '')];
    if (STATUS.pending) return ['pend', '⏫ กำลังส่ง ' + STATUS.pending];
    return ['ok', '☁️ บันทึกแล้ว'];
  }
  function setBadge() { const b = $('.sync'); if (!b) return; const [c, t] = badge(); b.className = 'sync ' + c; b.textContent = t; }
  function shell(title, inner, o) {
    o = o || {}; const [bc, bt] = badge(); const cur = NAVMAP[route().a];
    const pendProp = myEvents().filter(e => e.date >= today()).length;
    return '<div class="app"><header class="topbar">' + (o.back ? '<button class="back" data-go="' + o.back + '" aria-label="กลับ">‹</button>' : '<img class="logo" src="icons/logo-mark-512.png" alt="">') +
      '<h1>' + esc(title) + '</h1>' + (ME && !ME.teacher ? (() => { const n = notifs().filter(x => x.isNew).length; return '<button class="bell" data-act="bell" aria-label="การแจ้งเตือน">🔔' + (n ? '<b>' + n + '</b>' : '') + '</button>'; })() : '') + '<button class="sync ' + bc + '" data-act="safety">' + bt + '</button></header>' +
      (ME && ME.teacher ? '<div class="viewas">👀 มุมมองครู · ' + esc((D.group || {}).name || '') + ' (อ่านอย่างเดียว)<button class="btn xs gold" data-act="hubview">เปลี่ยนกลุ่ม</button><button class="btn xs sec" data-act="hub">ศูนย์กลาง</button></div>' : '') +
      (B.mode === 'demo' ? '<div class="demo-strip">🧪 โหมดทดลอง (ข้อมูลสาธิต)' + (B.realConfigured() ? ' · <a href="index.html?demo=0">ออกไปข้อมูลจริง</a>' : '') + ' · <a href="#" data-act="switchacct">สลับบัญชี</a></div>' : '') +
      '<main>' + inner + M.copyrightHTML() + '</main></div>' +
      '<nav class="nav"><div class="nav-in">' + NAV.map(n => '<a href="#/' + n[0] + '" class="' + (cur === n[0] ? 'on' : '') + '"><span>' + n[1] + '</span>' + n[2] + (n[0] === 'calendar' && pendProp ? '<b class="dot">' + pendProp + '</b>' : '') + '</a>').join('') + '</div></nav>' + (o.extra || '');
  }
  const seg = (items, cur) => '<div class="seg">' + items.map(i => '<a href="#/' + i[0] + '" class="' + (i[0] === cur ? 'on' : '') + '">' + i[1] + '</a>').join('') + '</div>';
  const SEG_F = [['notes', '📓 ภาคสนาม'], ['interviews', '🤝 สัมภาษณ์']];
  const SEG_A = [['analyses', '🎻 องค์ประกอบ'], ['roles', '🏮 บทบาทสังคม']];
  const SEG_S = [['synth', '🧩 ประมวลผล'], ['map', '🗺 แผนที่'], ['listen', '🎧 ห้องฟัง'], ['conservation', '🕊️ อนุรักษ์'], ['report', '📄 รายงาน'], ['reflection', '💭 ของฉัน']];

  /* ---------- หน้าจอเข้าสู่ระบบ ---------- */
  const GSVG = '<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>';
  function renderLogin() {
    const d = B.diagnostics(); const iosApp = d.standalone && d.ios && !d.sameOriginAuth && B.mode !== 'demo';
    const err = (B.authError ? '<div class="warn-box"><b>ล็อกอินไม่สำเร็จ</b><br>' + esc(B.authErrorText(B.authError)) + '</div>' : '') +
      (iosApp ? '<div class="tip">📱 คุณเปิดจากไอคอนบนหน้าจอโฮมของ iPhone/iPad — ถ้าล็อกอินไม่ผ่าน ให้เปิดลิงก์เดียวกันใน <b>Safari</b> แทน (ข้อมูลอยู่บนคลาวด์ ไม่หาย)</div>' : '');
    const tmode = route().a === 'teacher'; const demo = B.mode === 'demo';
    const hero = '<div class="hero"><div class="logos"><img class="big" src="icons/logo-full.png" alt="Mae Sot Musicology"></div><h1>' + esc(C.appFull) + '</h1><p>' + esc(C.course.code) + ' ' + esc(C.course.name) + ' · ' + esc(C.course.school) + '</p></div>';
    if (demo) {
      $('#root').innerHTML = hero + '<div class="card login-card"><div class="demo-strip" style="border-radius:12px;margin-bottom:12px">🧪 โหมดทดลองของครู (ข้อมูลสาธิต ไม่กระทบข้อมูลจริง)</div>' +
        '<button class="gbtn" data-act="login">🧪 เลือกบัญชีทดลอง (ครู หรือ นักเรียน)</button>' + (B.realConfigured() ? '<a class="btn sec block" style="margin-top:10px" href="index.html?demo=0">ออกจากโหมดทดลอง</a>' : '') + '</div>' + M.copyrightHTML();
      return;
    }
    if (tmode) {
      $('#root').innerHTML = hero + '<div class="card login-card">' + err + '<div class="card-title">👩‍🏫 เข้าสู่ระบบสำหรับครู</div>' +
        '<button class="gbtn" data-act="tlogin">' + GSVG + 'เข้าสู่ระบบครูด้วย Google</button>' +
        '<div class="muted" style="margin-top:8px">เมื่อเข้าแล้วจะพบ “ศูนย์กลางครู” — แผงควบคุม ดูแอปในมุมมองนักเรียน และโหมดทดลอง</div>' +
        '<a class="btn ghost block" style="margin-top:10px" href="#/home">‹ กลับไปหน้าเข้าสู่ระบบนักเรียน</a></div>' + M.copyrightHTML();
      return;
    }
    $('#root').innerHTML = hero + '<div class="card login-card">' + err +
      '<button class="gbtn big" data-act="login">' + GSVG + '<span>นักเรียนเข้าสู่ระบบ<small>ด้วยอีเมล รหัสนักเรียน@' + esc(C.auth.domain) + '</small></span></button>' +
      '<ol class="steps"><li>กดปุ่มด้านบน แล้วเลือกบัญชีโรงเรียนของตัวเอง</li><li>ระบบพาเข้ากลุ่มที่ครูจัดไว้ให้ทันที</li><li>ลงพื้นที่ บันทึก ถ่ายภาพ อัดเสียง ร่วมกับเพื่อนได้เลย 🎶</li></ol>' +
      '</div><div class="teacher-link"><a href="#/teacher">👩‍🏫 สำหรับครู</a> <a href="#" data-act="diag">🩺 แก้ปัญหาล็อกอิน</a></div>' + M.copyrightHTML();
  }
  const diagBtn = () => '<button class="btn sm ghost block" data-act="diag">🩺 ตรวจระบบ / แก้ปัญหา</button>';
  function diagModal() {
    const d = B.diagnostics(); const ok = v => v ? '✅' : '⚠️';
    const tips = [];
    if (d.lastAuthError) tips.push('ข้อผิดพลาดล่าสุด: ' + d.lastAuthError);
    if (!d.navigatorOnline) tips.push('เครื่องออฟไลน์ — เชื่อมอินเทอร์เน็ตก่อนล็อกอินครั้งแรก');
    if (d.standalone && d.ios && !d.sameOriginAuth) tips.push('iPhone/iPad ที่เปิดจากไอคอนหน้าจอโฮม อาจล็อกอิน Google ไม่ได้เมื่อเว็บอยู่บน github.io → เปิดใน Safari หรือให้ครูย้ายเว็บไป Firebase Hosting');
    tips.push('ใช้บัญชี รหัสนักเรียน@' + C.auth.domain + ' (ถ้ามีหลายบัญชีในเครื่อง ให้เลือกให้ถูก)');
    tips.push('ถ้าขึ้นหน้าต่างแล้วหายไป ให้อนุญาต pop-up ของเว็บนี้');
    modal('<h3>🩺 ตรวจระบบ</h3><table class="mini"><tr><td>เว็บ</td><td>' + esc(d.host) + '</td></tr><tr><td>ระบบล็อกอิน</td><td>' + esc(d.authDomain || '-') + ' ' + ok(d.sameOriginAuth) + (d.sameOriginAuth ? ' โดเมนเดียวกัน' : ' คนละโดเมน (ใช้ pop-up)') + '</td></tr><tr><td>เปิดแบบแอป</td><td>' + (d.standalone ? 'ใช่' : 'ไม่ (เบราว์เซอร์)') + ' · ' + esc(d.browser) + (d.ios ? ' · iOS' : '') + '</td></tr><tr><td>อินเทอร์เน็ต</td><td>' + ok(d.navigatorOnline) + ' ' + (d.online ? 'เชื่อมฐานข้อมูลแล้ว' : 'ยังไม่เชื่อมฐานข้อมูล') + '</td></tr><tr><td>รอส่ง/ส่งไม่สำเร็จ</td><td>' + d.pending + ' / ' + d.failed + '</td></tr></table>' +
      '<div class="card-title" style="margin-top:12px">วิธีแก้</div><ul style="margin:0;padding-left:20px">' + tips.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul><button class="btn sec block" style="margin-top:12px" data-close>ปิด</button>', { center: true });
  }
  function renderBlocked(title, msg, extra) {
    $('#root').innerHTML = '<div class="hero"><div class="logos"><img class="big" src="icons/logo-full.png" alt=""></div></div><div class="card login-card"><h3>⚠ ' + esc(title) + '</h3><p class="muted">' + esc(msg) + '</p>' + (extra || '') + '<button class="btn sec block" style="margin-top:8px" data-act="logout">ออกจากระบบ / เปลี่ยนบัญชี</button></div>' + M.copyrightHTML();
  }

  /* ---------- หน้าหลัก: ศูนย์กลางกลุ่ม ---------- */
  function gradeFor(tid) {
    const s = D.sGrade; if (!s || !s.released) return null;
    const fin = s.final && s.final[tid]; if (fin == null) return null;
    const c = (taskById(tid).scope === 'individual' ? (s.tasks && s.tasks[tid] && s.tasks[tid].c) : (D.gGrade && D.gGrade.tasks && D.gGrade.tasks[tid] && D.gGrade.tasks[tid].c)) || '';
    return { s: fin, c, adj: s.adj && s.adj[tid] };
  }
  function statusOf(t, p) {
    if (gradeFor(t.id)) return ['graded', 'ตรวจแล้ว'];
    const fl = t.scope === 'individual' ? (D.personal && D.personal.flags && D.personal.flags[t.id]) : (D.group && D.group.flags && D.group.flags[t.id]);
    if (fl) return ['done', 'ส่งตรวจแล้ว']; if (p.done) return ['done', 'ครบเกณฑ์']; if (p.n > 0 || p.partial) return ['go', 'กำลังทำ']; return ['', 'ยังไม่เริ่ม'];
  }
  function viewNoGroup() {
    return shell('ดนตรีแม่สอด', '<div class="card purple"><div class="row"><span class="av me">' + esc(M.initials(ME.name)) + '</span><div class="grow"><b>' + esc(ME.name) + '</b><div class="muted">ม.' + esc(ME.room) + ' เลขที่ ' + esc(ME.no) + ' · ' + esc(ME.email) + '</div></div></div></div>' +
      '<div class="card"><div class="empty"><div class="big">👥</div><b>ครูยังไม่ได้จัดกลุ่มให้คุณ</b><br>เมื่อครูจัดกลุ่มแล้ว หน้านี้จะเปลี่ยนเป็นศูนย์กลางกลุ่มทันที<br>ระหว่างนี้ดู <a href="#/calendar">ปฏิทินลงพื้นที่</a> หรือเริ่ม <a href="#/reflection">สะท้อนคิด</a> ได้</div></div>' +
      '<button class="btn sec block" data-act="logout">ออกจากระบบ</button>');
  }
  function viewHome() {
    if (!GID || !D.group) return viewNoGroup();
    const mem = members(), mine = mem.find(m => m.sid === ME.sid) || { roles: [] }, sy = M.synth(G(), mem);
    const next = myEvents().find(e => e.date >= today() && e.status !== 'cancelled');
    const myTasks = C.tasks.filter(t => assignees(t.id).includes(ME.sid) || t.scope === 'individual');
    const groupCard = '<div class="card purple"><div class="row"><div class="grow"><div class="muted">กลุ่มของฉัน · ม.' + esc(D.group.room) + '</div><h2 style="margin:2px 0 6px;color:#fbe7a1">' + esc(D.group.name) + '</h2></div><button class="btn gold sm" data-act="roles">🎭 บทบาท</button></div>' +
      mem.map(m => '<div class="mem" style="border-color:rgba(255,255,255,.18)">' + avatar(m.name, m.sid === ME.sid ? 'me' : '') + '<div class="grow"><div>' + esc(m.name) + (m.sid === ME.sid ? ' <span class="tag gold">ฉัน</span>' : '') + '</div><div class="rolechips">' + (m.roles.length ? m.roles.map(r => { const x = roleById(r); return x ? '<span class="tag" style="background:rgba(255,255,255,.15);color:#fff">' + x.icon + ' ' + esc(x.name) + '</span>' : ''; }).join('') : '<span class="muted">ยังไม่เลือกบทบาท</span>') + '</div></div></div>').join('') + '</div>';
    const nextCard = next ? '<div class="card gold"><div class="card-title">🗓 การลงพื้นที่ครั้งถัดไป</div>' + M.eventCard(next, { [GID]: D.group }) + '<div class="row wrap"><button class="btn sm sec" data-act="ics" data-id="' + esc(next.id) + '">📲 เพิ่มลงปฏิทินในเครื่อง</button><a class="btn sm ghost" href="#/calendar">ดูปฏิทินทั้งหมด ›</a>' + consentBar(next) + '</div></div>'
      : '<div class="card gold"><div class="card-title">🗓 ยังไม่มีนัดลงพื้นที่</div><div class="muted">หัวหน้ากลุ่มเสนอวันลงพื้นที่ให้ครูอนุมัติได้ในหน้าปฏิทิน</div><a class="btn sm sec" style="margin-top:8px" href="#/calendar">ไปปฏิทิน ›</a></div>';
    const tasks = C.tasks.map(t => {
      const p = M.taskProgress(t, G(), D.personal), [sc, st] = statusOf(t, p), g = gradeFor(t.id), as = assignees(t.id);
      return '<a class="card link task" href="#/' + TASK_ROUTE[t.id] + '"><div class="ic">' + t.icon + '</div><div class="grow"><h3>' + esc(t.name) + (t.scope === 'individual' ? ' <span class="tag gold">รายบุคคล</span>' : '') + '</h3><div class="muted">' + esc(t.indicator) + (M.LIST_KINDS.includes(t.kind) ? ' · ' + p.n + '/' + p.min + ' รายการขั้นต่ำ' : '') + '</div>' +
        '<div class="row wrap" style="margin-top:5px;gap:6px"><span class="chip-st ' + sc + '">' + st + '</span>' + (t.scope === 'group' ? (as.length ? as.map(s => avatar(memberName(s), 'sm' + (s === ME.sid ? ' me' : ''))).join('') : '<span class="muted">ยังไม่มีผู้รับผิดชอบ</span>') : '') +
        (g ? '<span class="score-badge">' + esc(g.s) + '/' + maxOf(t) + '</span>' : '<span class="muted" style="margin-left:auto">' + maxOf(t) + ' คะแนน</span>') + '</div></div></a>';
    }).join('');
    const contrib = '<div class="card"><div class="card-title">📊 การมีส่วนร่วมของสมาชิก</div>' + sy.contrib.map(x => '<div class="bar-row" style="grid-template-columns:110px 1fr 70px"><span class="bl">' + esc(short(x.name)) + '</span><span class="bt"><i style="width:' + x.share + '%"></i></span><span class="bn">' + x.share + '%</span></div><div class="muted" style="margin:-2px 0 6px 118px;font-size:.74rem">สร้าง ' + (x.create || 0) + ' · แก้ ' + (x.edit || 0) + ' · สื่อ ' + (x.media || 0) + (x.last ? ' · ล่าสุด ' + esc(ago(x.last)) : '') + '</div>').join('') +
      '<div class="hint">คำนวณจากประวัติการบันทึกจริงของแต่ละคน (สร้าง 3 · แนบสื่อ 2 · แก้ไข 1 คะแนน) ครูใช้ประกอบการให้คะแนนรายบุคคล</div></div>';
    const hist = Object.values(D.history || {}).sort((a, b) => b.at - a.at).slice(0, 8);
    const ACT = { create: 'เพิ่ม', edit: 'แก้ไข', media: 'แนบสื่อใน', delete: 'ลบ', restore: 'กู้คืน' };
    const feed = '<div class="card"><div class="card-title">🔔 ความเคลื่อนไหวล่าสุด</div>' + (hist.length ? '<ul class="feed">' + hist.map(h => '<li>' + avatar((h.by || {}).name, 'sm') + '<div class="grow"><b>' + esc(short((h.by || {}).name)) + '</b> ' + (ACT[h.act] || h.act) + ' ' + esc((FORMS[h.kind] || {}).title || h.kind) + '<div class="muted" style="font-size:.74rem">' + esc(ago(h.at)) + '</div></div></li>').join('') + '</ul>' : '<div class="muted">ยังไม่มีการบันทึก</div>') + '</div>';
    const mineCard = '<div class="card"><div class="card-title">🙋 งานที่ฉันรับผิดชอบ</div>' + (myTasks.length ? myTasks.map(t => '<a class="pill" style="margin:2px 4px 2px 0;text-decoration:none" href="#/' + TASK_ROUTE[t.id] + '">' + t.icon + ' ' + esc(t.name) + '</a>').join('') : '<div class="muted">ยังไม่ได้รับงาน — เปิดงานแต่ละชิ้นแล้วกด “รับงานนี้”</div>') +
      (mine.roles.length ? '' : '<div class="tip" style="margin:10px 0 0">ยังไม่ได้เลือกบทบาทในกลุ่ม <button class="btn xs gold" data-act="roles">เลือกบทบาท</button></div>') + '</div>';
    const bl = EXTRAS.badges(G(), mem, ME.sid, D.personal); const meB = bl.filter(b => b.scope === 'me'), grB = bl.filter(b => b.scope === 'group');
    const bdgCard = '<div class="card"><div class="card-title">🏅 ตราสัญลักษณ์ <span class="muted">ของฉัน ' + meB.filter(b => b.got).length + '/' + meB.length + ' · กลุ่ม ' + grB.filter(b => b.got).length + '/' + grB.length + '</span></div>' + EXTRAS.badgesHTML(meB) + '<div class="muted" style="margin:10px 0 6px">ตราของกลุ่ม</div>' + EXTRAS.badgesHTML(grB) + '</div>';
    return shell(D.group.name, groupCard + nextCard + goalsCard(mem, mine) + mineCard + bdgCard + '<h3 style="margin:16px 4px 8px">งานของกลุ่ม (หน่วยที่ 2)</h3>' + tasks + contrib + feed +
      '<div class="card"><div class="row"><div class="grow"><b>' + esc(ME.name) + '</b><div class="muted">' + esc(ME.email) + '</div></div><button class="btn sm sec" data-act="safety">🛟 ความปลอดภัยข้อมูล</button></div><button class="btn sm bad block" style="margin-top:10px" data-act="logout">ออกจากระบบ</button></div>');
  }

  /* ---------- การ์ดงาน ---------- */
  function rubricHTML(t) {
    return '<details style="margin-top:6px"><summary class="muted" style="cursor:pointer">เกณฑ์การให้คะแนน (' + maxOf(t) + ' คะแนน)</summary><div class="muted" style="margin-top:6px">' + t.criteria.map(c => '<div><b>' + c.k + '</b> ' + esc(c.name) + '</div>').join('') +
      '<div style="margin-top:4px">ระดับ: ' + C.levels.map(l => l.v + ' ' + l.en).join(' · ') + '</div>' + (t.scope === 'group' ? '<div style="margin-top:4px">งานกลุ่ม: ทุกคนได้คะแนนกลุ่ม ครูอาจปรับรายคนตามการมีส่วนร่วม</div>' : '') + '</div></details>';
  }
  function taskCard(t) {
    const g = gradeFor(t.id), as = assignees(t.id), p = M.taskProgress(t, G(), D.personal);
    const flags = t.scope === 'individual' ? (D.personal && D.personal.flags) : (D.group && D.group.flags); const fl = flags && flags[t.id];
    let h = '<div class="card"><div class="task"><div class="ic">' + t.icon + '</div><div class="grow"><h3>' + esc(t.name) + '</h3><div class="muted">' + esc(t.indicator) + '</div><div style="margin:4px 0;font-size:.92rem">' + esc(t.desc) + '</div></div></div>';
    if (M.LIST_KINDS.includes(t.kind)) h += '<div class="bar" style="margin-top:6px"><i style="width:' + Math.min(100, p.n / p.min * 100) + '%"></i></div><div class="muted">กลุ่มทำแล้ว ' + p.n + ' รายการ (ขั้นต่ำ ' + p.min + ')' + (p.drafts ? ' · <span style="color:var(--bad)">ร่าง ' + p.drafts + ' รายการยังไม่นับ</span>' : '') + '</div>';
    if (t.scope === 'group' && GID) h += '<div class="row wrap" style="margin-top:8px;gap:6px"><span class="muted">ผู้รับผิดชอบ:</span>' + (as.length ? as.map(s => avatar(memberName(s), 'sm' + (s === ME.sid ? ' me' : ''))).join('') : '<span class="muted">—</span>') +
      '<button class="btn xs ' + (as.includes(ME.sid) ? 'sec' : 'gold') + '" data-act="assign" data-id="' + t.id + '">' + (as.includes(ME.sid) ? 'ถอนตัว' : '＋ รับงานนี้') + '</button></div>';
    h += rubricHTML(t);
    if (g) h += '<div class="tip" style="margin-top:8px">คะแนน: <b>' + esc(g.s) + '/' + maxOf(t) + '</b>' + (g.adj ? ' (ปรับรายบุคคล ' + (g.adj > 0 ? '+' : '') + esc(g.adj) + ')' : '') + (D.sGrade && D.sGrade.fw && D.sGrade.fw.pct && (C.fieldTasks || []).includes(t.id) ? '<br><span class="muted">คิดตามสัดส่วนการลงพื้นที่: ร่วม ' + (D.sGrade.fw.total - D.sGrade.fw.deny) + '/' + D.sGrade.fw.total + ' ครั้ง (ผู้ปกครองไม่อนุญาต ' + D.sGrade.fw.deny + ' ครั้ง → หัก ' + D.sGrade.fw.pct + '%)</span>' : '') + (g.c ? '<br>ความเห็นครู: ' + nl2(g.c) : '') + '</div>';
    h += '<button class="btn ' + (fl ? 'sec' : 'gold') + ' block" style="margin-top:10px" data-act="flag" data-id="' + t.id + '">' + (fl ? '✓ แจ้งครูแล้วโดย ' + esc(short((fl.by || {}).name)) + ' (กดเพื่อยกเลิก)' : '✋ งานนี้เสร็จแล้ว — แจ้งครูให้ตรวจ') + '</button>';
    return h + '</div>';
  }

  /* ---------- รายการ ---------- */
  function viewList(kind) {
    if (!GID) return viewNoGroup();
    const F = FORMS[kind], t = taskById(F.task); const list = M.listOf(G(), kind).reverse();
    const items = list.length ? list.map(r => {
      const s = F.summary(r), c = M.commObj(r), cb = r.createdBy || {};
      return '<a class="card link" href="#/' + kind + '/' + r.id + '" style="border-left:5px solid ' + (c ? c.color : 'var(--p200)') + '"><div class="row">' + avatar(cb.name, cb.sid === ME.sid ? 'me' : '') + '<div class="grow"><div class="rec-t">' + esc(s.t) + '</div><div class="rec-s">' + esc(s.s) + '</div>' +
        (() => { const k = M.checkRecord(kind, r); return !k.valid ? '<div><span class="chip-st draft">ร่าง · ยังไม่นับ — ขาด ' + esc(k.req.map(x => x.label).join(', ')) + '</span></div>' : k.open.length ? '<div><span class="chip-st warn">⚠ ยังไม่มี: ' + esc(k.open.map(x => x.label.replace(/^[^ก-๙A-Za-z]+/, '')).slice(0, 3).join(', ')) + (k.open.length > 3 ? ' +' + (k.open.length - 3) : '') + '</span></div>' : ''; })() +
        '<div class="rec-s" style="font-size:.74rem">📝 ' + esc(short(cb.name)) + ' · ' + esc(thDateTime(r.createdAt)) + (r.updatedBy && r.updatedAt - r.createdAt > 60000 ? ' · แก้ล่าสุด ' + esc(short(r.updatedBy.name)) + ' ' + esc(ago(r.updatedAt)) : '') + '</div></div><div class="muted">' + (M.mediaIds(r).length ? '📎' + M.mediaIds(r).length + ' ' : '') + (D.tc && D.tc[r.id] ? '<span title="ครูคอมเมนต์">💬</span> ' : '') + '›</div></div></a>';
    }).join('') : '<div class="empty"><div class="big">' + F.icon + '</div>กลุ่มยังไม่มีรายการ<br>กดปุ่ม ＋ เพื่อเริ่มบันทึก</div>';
    return shell(F.title, seg(kind === 'notes' || kind === 'interviews' ? SEG_F : SEG_A, kind) + taskCard(t) + items + '<div style="text-align:center"><a class="btn sm ghost" href="#/trash">🗑 ถังขยะ (กู้คืนรายการที่ลบ)</a></div>' +
      '<button class="fab" data-act="new" data-kind="' + kind + '" aria-label="เพิ่ม">＋</button>');
  }

  /* ---------- ฟอร์ม ---------- */
  function optList(opts, key) {
    if (opts === 'comm' && key === 'posterCommunity') return C.communities.filter(c => c.id !== 'other').map(c => [c.id, c.emoji + ' ' + c.name]).concat(M.otherNames(G()).map(n => ['other:' + n, '🎶 ' + n]));
    if (opts === 'comm') return C.communities.map(c => [c.id, c.emoji + ' ' + c.name]);
    if (opts === 'events') return myEvents().map(e => [e.id, thDate(e.date) + ' · ' + e.title]);
    return opts.map(o => [o, o]);
  }
  function dlHTML(rec) {
    const cs = rec.community ? [M.comm(rec.community)] : C.communities;
    const u = a => Array.from(new Set(cs.filter(Boolean).flatMap(c => c[a]))).map(x => '<option value="' + esc(x) + '">').join('');
    const oth = Array.from(new Set(M.otherNames(G()).concat(C.otherSuggestions || []))).map(x => '<option value="' + esc(x) + '">').join('');
    return '<datalist id="dl-instruments">' + u('instruments') + '</datalist><datalist id="dl-occasions">' + u('occasions') + '</datalist><datalist id="dl-otherComm">' + oth + '</datalist>';
  }
  function mediaBlock(rec) {
    const ids = M.mediaIds(rec); const img = ids.filter(id => (MEDIA[id] || {}).type !== 'audio'), aud = ids.filter(id => (MEDIA[id] || {}).type === 'audio');
    return '<div class="thumbs">' + img.map(id => { const m = MEDIA[id]; return '<div class="thumb"><img data-mid="' + id + '" alt="">' + (m ? '' : '⏳') + '<button class="x" data-act="delmedia" data-id="' + id + '" aria-label="นำออก">×</button><small>' + esc(m && m.by ? short(m.by.name) : '') + '</small></div>'; }).join('') + '</div>' +
      aud.map(id => { const m = MEDIA[id]; return '<div class="row"><audio controls preload="none" data-mid="' + id + '" class="grow"></audio><span class="muted" style="font-size:.72rem">' + esc(m && m.by ? short(m.by.name) : '') + '</span><button class="btn bad xs" data-act="delmedia" data-id="' + id + '">นำออก</button></div>'; }).join('') +
      '<div class="row wrap" style="margin-top:14px"><button class="btn sec sm" data-act="pick" data-t="cam">📷 ถ่ายภาพ</button><button class="btn sec sm" data-act="pick" data-t="gal">🖼 เลือกรูป</button><button class="btn sec sm" data-act="rec">🎙 บันทึกเสียง</button></div>' +
      '<input type="file" accept="image/*" capture="environment" hidden data-pick="cam"><input type="file" accept="image/*" multiple hidden data-pick="gal">';
  }
  function byLine(rec, k) { const b = rec._by && rec._by[k]; return b ? '<div class="field-by" data-by="' + k + '">✎ ' + esc(short(b.name)) + ' · ' + esc(thDateTime(b.at)) + '</div>' : '<div class="field-by" data-by="' + k + '"></div>'; }
  function fieldHTML(f, rec, single) {
    if (f.showIf) { const inner = fieldHTML(Object.assign({}, f, { showIf: null }), rec, single); return '<div data-showif="' + f.showIf + '"' + (rec.community === f.showIf ? '' : ' hidden') + '>' + inner + '</div>'; }
    const v = rec[f.k], req = f.req ? '<span class="req"> *</span>' : '', L = '<label>' + esc(f.label) + req + '</label>', d = ' data-f="' + f.k + '"', by = single && f.k ? byLine(rec, f.k) : '';
    switch (f.t) {
      case 'section': return '<div class="sec">' + esc(f.label) + '</div>' + (f.hint ? '<div class="tip">' + esc(f.hint) + '</div>' : '');
      case 'text': return '<div class="f">' + L + '<input type="text"' + d + ' value="' + esc(v) + '" placeholder="' + esc(f.ph || '') + '"' + (f.list ? ' list="dl-' + f.list + '"' : '') + ' autocomplete="off">' + by + '</div>';
      case 'number': return '<div class="f">' + L + '<input type="number" inputmode="numeric"' + d + ' value="' + esc(v) + '">' + by + '</div>';
      case 'date': return '<div class="f">' + L + '<input type="date"' + d + ' value="' + esc(v) + '"></div>';
      case 'time': return '<div class="f">' + L + '<input type="time"' + d + ' value="' + esc(v) + '"></div>';
      case 'area': return '<div class="f">' + L + '<textarea' + d + ' rows="' + (f.rows || 3) + '" placeholder="' + esc(f.ph || '') + '">' + esc(v) + '</textarea>' + by + '</div>';
      case 'select': { const ol = optList(f.opts, f.k); if (f.opts === 'events' && !ol.length) return ''; if (f.opts === 'comm' && v && !ol.some(o => o[0] === v)) { const hc = M.commById(v); if (hc) ol.push([v, hc.emoji + ' ' + hc.name + ' (ครูนำออกจากตัวเลือกแล้ว)']); } return '<div class="f">' + L + '<select' + d + '><option value="">— เลือก —</option>' + ol.map(o => '<option value="' + esc(o[0]) + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>' + by + '</div>'; }
      case 'chips': return '<div class="f"><div class="lab">' + esc(f.label) + '</div><div class="chips">' + f.opts.map(o => '<button type="button" data-chip="' + f.k + '" data-v="' + esc(o) + '" class="' + ((v || []).includes(o) ? 'on' : '') + '">' + esc(o) + '</button>').join('') + '</div>' + by + '</div>';
      case 'check': return '<div class="f"><label class="chk"><input type="checkbox"' + d + (v ? ' checked' : '') + '><span>' + esc(f.label) + req + '</span></label></div>';
      case 'scale': return '<div class="f"><div class="lab">' + esc(f.label) + '</div><div class="scale">' + Array.from({ length: f.n || 5 }, (_, i) => '<button type="button" data-scale="' + f.k + '" data-v="' + (i + 1) + '" class="' + (v === i + 1 ? 'on' : '') + '">' + (i + 1) + '</button>').join('') + '</div></div>';
      case 'gps': return '<div class="f"><div class="lab">' + esc(f.label) + '</div><div class="gps"><button class="btn sec sm" data-act="gps">📍 ใช้ตำแหน่งปัจจุบัน</button><span id="gpsOut">' + (v ? M.gpsHTML(v) : '<span class="muted">ยังไม่ได้บันทึกพิกัด</span>') + '</span></div></div>';
      case 'media': return '<div class="f"><div class="lab">' + esc(f.label) + '</div><div id="mediaBox">' + mediaBlock(rec) + '</div></div>';
      case 'sign': return '<div class="f"><div class="lab">' + esc(f.label) + '</div><canvas class="sign" id="signCv"></canvas><div class="row" style="margin-top:6px"><button class="btn sec sm" data-act="clearsign">ล้างลายเซ็น</button><span class="hint">เซ็นด้วยนิ้วบนหน้าจอ</span></div></div>';
    }
    return '';
  }
  function formBody(kind, rec, single) { return (ME && ME.teacher ? '<fieldset disabled class="ro">' : '<fieldset class="ro">') + '<div data-form>' + FORMS[kind].fields.map(f => fieldHTML(f, rec, single)).join('') + dlHTML(rec) + '</div>'; }
  function viewForm(kind, rid) {
    if (!GID) return viewNoGroup();
    const F = FORMS[kind]; const rec = getRec(kind, rid);
    CUR = { kind, rid, single: false, path: recPath(kind, rid) };
    if (!rec) return shell(F.title, '<div class="empty">กำลังโหลด…</div>', { back: '#/' + kind });
    if (rec.deleted) { CUR = null; return shell(F.title, '<div class="warn-box">รายการนี้ถูกลบแล้ว</div><a class="btn" href="#/trash">ไปถังขยะเพื่อกู้คืน</a>', { back: '#/' + kind }); }
    return shell(F.title, tcHTML(rid) + '<div id="metaBox">' + M.metaHTML(rec) + '</div><div class="card">' + formBody(kind, rec, false) + '</div>' +
      '<div class="row wrap"><button class="btn grow" style="flex-basis:100%" data-act="done" data-to="#/' + kind + '">✓ เสร็จ — ตรวจความครบถ้วน</button><button class="btn sec" data-act="history">🕘 ประวัติ</button><button class="btn bad" data-act="delrec">🗑 ลบ</button></div><div class="muted" style="text-align:center;margin-top:8px">บันทึกอัตโนมัติทุกครั้งที่พิมพ์ · เพื่อนในกลุ่มเห็นทันที</div>', { back: '#/' + kind });
  }
  function viewSingle(kind) {
    const F = FORMS[kind], t = taskById(F.task);
    if (kind !== 'reflection' && !GID) return viewNoGroup();
    const rec = kind === 'reflection' ? ((D.personal && D.personal.reflection) || {}) : ((D.docs && D.docs[kind]) || {});
    CUR = { kind, single: true, path: kind === 'reflection' ? 'personal/' + ME.sid + '/reflection' : 'docs/' + GID + '/' + kind };
    let extra = '';
    if (kind === 'report') extra = '<div class="card ac-card"><div class="card-title">📑 รายงานวิชาการอัตโนมัติ</div><div class="muted" style="margin-bottom:8px">ระบบเรียบเรียงข้อมูลที่ทุกคนในกลุ่มบันทึก เป็นรายงานการศึกษาค้นคว้า 5 บท ตามรูปแบบวิชาการ (ปก คำนำ สารบัญ บทนำ แนวคิด วิธีการ ผลการศึกษา สรุปอภิปรายผล บรรณานุกรม ภาคผนวก) — ตรวจทานและเรียบเรียงภาษาก่อนส่ง</div>' +
      '<div class="row wrap"><button class="btn gold grow" data-act="acdocx">⬇ Word (.docx)</button><button class="btn grow" data-act="acpdf">⬇ PDF</button><button class="btn sec grow" data-act="acprev">👁 ดูตัวอย่าง</button></div><div id="acMsg" class="muted" style="margin-top:6px"></div></div>' +
      '<div class="card"><div class="card-title">📤 ส่งออกสมุดบันทึกกลุ่ม</div><div class="muted" style="margin-bottom:8px">รวมข้อมูลของทุกคนในกลุ่ม พร้อมชื่อผู้บันทึก ตาราง “ประมวลผลกลาง” และภาคผนวกสะท้อนคิดของคุณ (ผู้ให้ข้อมูลที่ไม่ยินยอมให้ระบุชื่อจะถูกซ่อน)</div>' +
      '<div class="row wrap"><button class="btn grow" data-act="preview">👁 ดูตัวอย่าง</button><button class="btn gold grow" data-act="pdf">⬇ PDF</button></div><div class="row wrap" style="margin-top:8px"><button class="btn sec grow" data-act="png">🖼 ภาพ PNG ทุกหน้า</button><button class="btn sec grow" data-act="print">🖨 พิมพ์/บันทึก PDF</button></div>' +
      '<button class="btn sec block" style="margin-top:8px" data-act="poster">🎨 โปสเตอร์ Padlet (PNG)</button><div id="exportMsg" class="muted" style="margin-top:6px"></div></div>';
    let peer = '';
    if (kind === 'reflection' && GID) {
      const pr = (D.personal && D.personal.peer) || {};
      peer = '<div class="card"><div class="card-title">🤝 ประเมินการมีส่วนร่วมของเพื่อน (ครูเห็นเท่านั้น)</div><div class="muted" style="margin-bottom:8px">1 น้อย – 4 มาก · ประเมินตามความจริงเพื่อให้คะแนนรายบุคคลยุติธรรม</div>' +
        members().filter(m => m.sid !== ME.sid).map(m => '<div class="f"><div class="row">' + avatar(m.name, 'sm') + '<b class="grow">' + esc(m.name) + '</b></div><div class="scale" style="margin-top:6px">' + [1, 2, 3, 4].map(v => '<button type="button" data-peer="' + m.sid + '" data-v="' + v + '" class="' + ((pr[m.sid] || {}).score === v ? 'on' : '') + '">' + v + '</button>').join('') + '</div>' +
        '<input type="text" data-peernote="' + m.sid + '" value="' + esc((pr[m.sid] || {}).note || '') + '" placeholder="เพื่อนทำอะไรให้กลุ่มบ้าง (ไม่บังคับ)" style="margin-top:6px"></div>').join('') + '</div>';
    }
    return shell(F.title, seg(SEG_S, kind) + taskCard(t) + (kind !== 'reflection' ? tcHTML(kind) : '') + '<div class="card">' + formBody(kind, rec, kind !== 'reflection') + '</div>' + peer + extra);
  }

  /* ---------- ประมวลผลกลาง ---------- */
  function viewSynth() {
    if (!GID) return viewNoGroup();
    const mem = members(), sy = M.synth(G(), mem);
    const needs = [];
    C.tasks.forEach(t => { const p = M.taskProgress(t, G(), D.personal); if (!p.done) needs.push(t.icon + ' ' + t.name + (M.LIST_KINDS.includes(t.kind) ? ' — ขาดอีก ' + Math.max(0, p.min - p.n) + ' รายการ' : ' — ยังไม่ครบ')); });
    const covered = sy.coverage.map(x => x.c.id); const notCov = C.communities.filter(c => c.id !== 'other' && !covered.includes(c.id));
    const noRec = sy.contrib.filter(x => !(x.create || 0));
    return shell('ห้องประมวลผลกลาง', seg(SEG_S, 'synth') +
      '<div class="card purple"><div class="card-title" style="color:#fbe7a1">🧩 ห้องประมวลผลกลางของกลุ่ม</div><div class="muted">ระบบรวบรวมข้อมูลจากสมาชิกทุกคนอัตโนมัติ ใช้อภิปรายผลในรายงานและวางแผนว่าใครควรเก็บข้อมูลอะไรเพิ่ม</div></div>' +
      '<div class="card"><div class="card-title">✅ ความพร้อมก่อนส่ง</div>' + (needs.length ? '<ul style="margin:0;padding-left:20px">' + needs.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '<b style="color:var(--ok)">ครบทุกงานแล้ว 🎉</b>') +
      (noRec.length ? '<div class="tip" style="margin:10px 0 0">สมาชิกที่ยังไม่ได้สร้างรายการ: ' + noRec.map(x => esc(short(x.name))).join(', ') + ' — ทุกคนต้องมีชื่อในงานอย่างน้อย 1 ครั้งก่อนกลุ่มจะส่งรายงานได้</div>' : '') + '</div>' +
      '<div class="card"><div class="card-title">🗺 ข้อมูลแต่ละชุมชน</div>' + (sy.coverage.length ? '<div class="scroll-x"><table class="mini"><tr><th>ชุมชน</th><th>ภาคสนาม</th><th>สัมภาษณ์</th><th>วิเคราะห์</th><th>บทบาท</th></tr>' + sy.coverage.map(x => '<tr><td>' + x.c.emoji + ' ' + esc(x.c.name) + '</td><td>' + x.notes + '</td><td>' + x.interviews + '</td><td>' + x.analyses + '</td><td>' + x.roles + '</td></tr>').join('') + '</table></div>' : '<div class="muted">ยังไม่มีข้อมูล</div>') +
      (notCov.length ? '<div class="hint" style="margin-top:6px">ชุมชนที่ยังไม่มีข้อมูล: ' + notCov.map(c => c.emoji + ' ' + esc(c.name)).join(', ') + '</div>' : '') + '</div>' +
      '<div class="card"><div class="card-title">🎼 ตารางเปรียบเทียบเครื่องดนตรี</div>' + (sy.instruments.length ? '<div class="scroll-x"><table class="mini"><tr><th>เครื่องดนตรี</th><th>ชุมชน</th><th>ประเภท</th><th>สีสันเสียง</th><th>ระบบเสียง</th><th>ความเร็ว</th></tr>' + sy.instruments.map(r => '<tr><td>' + esc(r.inst) + '</td><td>' + esc(r.c ? r.c.name : '') + '</td><td>' + esc(r.classify) + '</td><td>' + esc(r.timbre) + '</td><td>' + esc(r.scale) + '</td><td>' + esc(r.tempo) + '</td></tr>').join('') + '</table></div>' : '<div class="muted">เพิ่ม “วิเคราะห์องค์ประกอบดนตรี” เพื่อให้ตารางนี้แสดงผล</div>') + '</div>' +
      '<div class="card"><div class="card-title">🎧 สีสันเสียงที่พบ</div>' + M.barsHTML(sy.freq.timbre) + '</div>' +
      '<div class="card"><div class="card-title">🎭 อารมณ์เพลง</div>' + M.barsHTML(sy.freq.mood) + '</div>' +
      '<div class="card"><div class="card-title">🏮 หน้าที่ของดนตรีในสังคม</div>' + M.barsHTML(sy.freq.funcs) + '</div>' +
      '<div class="card"><div class="card-title">👥 สมาชิก บทบาท และการมีส่วนร่วม</div>' + M.memberTable(mem, sy).replace('class="tb"', 'class="mini"') + '</div>');
  }

  /* ---------- ปฏิทิน ---------- */
  function viewCalendar() {
    const evs = myEvents(); const day = evs.filter(e => e.date === CAL.sel); const up = evs.filter(e => e.date >= today() && e.status !== 'cancelled');
    const act = e => '<button class="btn xs sec" data-act="ics" data-id="' + esc(e.id) + '">📲 ลงปฏิทินเครื่อง</button>' + consentBar(e);
    return shell('ปฏิทินลงพื้นที่', M.monthGrid(CAL.y, CAL.m, evs, CAL.sel) +
      '<h3 style="margin:4px 4px 8px">' + esc(thDate(CAL.sel, true)) + '</h3>' + (day.length ? day.map(e => M.eventCard(e, { [GID]: D.group }, { actions: act })).join('') : '<div class="muted" style="margin:0 4px 12px">ไม่มีนัดในวันนี้</div>') +
      (GID ? '<button class="btn gold block" data-act="propose">＋ เสนอวันลงพื้นที่ของกลุ่ม (รอครูอนุมัติ)</button>' : '') +
      '<h3 style="margin:18px 4px 8px">นัดที่กำลังจะมาถึง</h3>' + (up.length ? up.map(e => M.eventCard(e, { [GID]: D.group }, { actions: act })).join('') : '<div class="empty">ยังไม่มีนัด</div>'));
  }

  /* ---------- ถังขยะ / ความปลอดภัยข้อมูล ---------- */
  function viewTrash() {
    if (!GID) return viewNoGroup();
    const del = []; M.LIST_KINDS.forEach(k => M.listOf(G(), k, true).filter(r => r.deleted).forEach(r => del.push({ k, r })));
    return shell('ถังขยะ', '<div class="tip">รายการที่ลบจะไม่หายจริง สมาชิกคนใดก็กู้คืนได้ ครูเห็นทุกการลบ</div>' + (del.length ? del.sort((a, b) => (b.r.deletedAt || 0) - (a.r.deletedAt || 0)).map(({ k, r }) => { const s = FORMS[k].summary(r); return '<div class="card"><div class="row"><div class="grow"><div class="rec-t">' + FORMS[k].icon + ' ' + esc(s.t) + '</div><div class="rec-s">ลบโดย ' + esc(short((r.deletedBy || {}).name)) + ' · ' + esc(thDateTime(r.deletedAt)) + '</div></div><button class="btn sm gold" data-act="restore" data-kind="' + k + '" data-id="' + r.id + '">↩ กู้คืน</button></div></div>'; }).join('') : '<div class="empty"><div class="big">🗑</div>ถังขยะว่าง</div>'), { back: '#/home' });
  }
  async function viewSafety() {
    const snaps = GID ? await B.snapshots('g:' + GID) : []; const failed = await B.failedOps();
    return shell('ความปลอดภัยของข้อมูล', '<div class="card"><div class="card-title">🛟 ระบบกันข้อมูลสูญหาย</div><ol class="steps"><li>ทุกการพิมพ์บันทึกลงเครื่องก่อน (กล่องขาออก) แล้วส่งขึ้นเซิร์ฟเวอร์ — ไม่มีสัญญาณก็ไม่หาย</li><li>ทุกการแก้ไขเก็บประวัติพร้อมชื่อผู้แก้และเวลา ย้อนกลับได้</li><li>การลบเป็นการย้ายไปถังขยะ กู้คืนได้เสมอ</li><li>เครื่องนี้เก็บสำเนาข้อมูลกลุ่มอัตโนมัติ 15 ชุดล่าสุด</li></ol></div>' +
      '<div class="card"><div class="card-title">สถานะการส่ง</div><div>รอส่ง: <b>' + STATUS.pending + '</b> · ส่งไม่สำเร็จ: <b>' + STATUS.failed + '</b> · ' + (STATUS.online ? 'ออนไลน์' : 'ออฟไลน์') + '</div>' +
      (failed.length ? '<div class="warn-box" style="margin-top:8px">มี ' + failed.length + ' รายการที่เซิร์ฟเวอร์ปฏิเสธ (' + esc(failed[0].error || '') + ')</div><button class="btn sm gold" data-act="retry">ลองส่งใหม่</button>' : '') + '</div>' +
      '<div class="card"><div class="card-title">📱 ข้อมูลอยู่ที่ไหนบ้าง</div><ol class="steps"><li><b>บนคลาวด์ (หลัก)</b> — ทุกอย่างที่ส่งแล้วอยู่ในฐานข้อมูลของโรงเรียน ล็อกอินเครื่องไหนก็เห็น เปลี่ยนมือถือ/ลบแอปก็ไม่หาย</li><li><b>ในเครื่องนี้ (สำรอง)</b> — แอปเก็บงานที่ยังไม่ได้ส่ง และสำเนาอัตโนมัติไว้ในเครื่อง ใช้ตอนไม่มีสัญญาณ หรือกู้คืนเมื่อข้อมูลบนคลาวด์ผิดพลาด</li><li><b>ไฟล์สำรอง (.json)</b> — ดาวน์โหลดเก็บไว้ใน Files/Google Drive ได้ตลอด ใช้กู้คืนได้ทั้งนักเรียนและครู</li></ol><div class="hint" style="margin-top:6px">หมายเหตุ: ถ้าลบแอปหรือล้างข้อมูลเบราว์เซอร์ ข้อมูล “ในเครื่อง” จะหาย แต่ข้อมูลบนคลาวด์ยังอยู่ — ดูให้ “รอส่ง = 0” ก่อนลบแอปเสมอ</div></div>' +
      '<div class="card"><div class="card-title">💾 สำรองเป็นไฟล์</div><button class="btn sec block" data-act="backup">ดาวน์โหลดข้อมูลกลุ่มทั้งหมด (.json)</button>' +
      '<label class="btn sec block" style="margin-top:8px">↩ กู้คืนจากไฟล์สำรอง (.json)<input type="file" accept=".json,application/json" data-restore hidden></label><div class="hint" style="margin-top:6px">การกู้คืนจะ <b>เพิ่มเฉพาะรายการที่หายไป หรือฉบับในไฟล์ที่ใหม่กว่า</b> ไม่เขียนทับงานล่าสุดของเพื่อน</div></div>' +
      '<div class="card"><div class="card-title">🕘 สำเนาในเครื่องนี้</div>' + (snaps.length ? snaps.map(s => '<div class="row" style="padding:4px 0;border-bottom:1px dashed var(--line)"><span class="grow">' + esc(thDateTime(s.at)) + '</span><button class="btn xs gold" data-act="snaprestore" data-id="' + esc(s.id) + '">↩ กู้คืน</button> <button class="btn xs sec" data-act="dlsnap" data-id="' + esc(s.id) + '">ดาวน์โหลด</button></div>').join('') : '<div class="muted">ยังไม่มีสำเนา</div>') + '<div class="hint" style="margin-top:6px">ถ้าข้อมูลบนเซิร์ฟเวอร์เสียหาย ส่งไฟล์สำเนาให้ครูกู้คืนได้</div></div>' +
      '<a class="btn sec block" href="#/trash">🗑 ถังขยะ</a>', { back: '#/home' });
  }

  /* ---------- render ---------- */
  async function render(keep) {
    if (!ME) return; flushAll();
    const { a, b } = route(); CUR = null; let html;
    if (a === 'hub') { if (ME && ME.teacher) { location.hash = '#/home'; return; } html = viewHome(); }
    else if (a === 'home') html = viewHome();
    else if (a === 'synth') html = viewSynth();
    else if (a === 'map') html = viewMap();
    else if (a === 'listen') html = await viewListen();
    else if (a === 'calendar') html = viewCalendar();
    else if (a === 'trash') html = viewTrash();
    else if (a === 'safety') html = await viewSafety();
    else if (FORMS[a] && FORMS[a].single) html = viewSingle(a);
    else if (FORMS[a]) html = b ? viewForm(a, b) : viewList(a);
    else html = viewHome();
    if (keep && html === LASTHTML && $('#root .app')) { setBadge(); return; }   /* ข้อมูลไม่เปลี่ยน → ไม่วาดซ้ำ (กันจอกระพริบ/ดิ้น) */
    LASTHTML = html; const y = window.scrollY; $('#root').innerHTML = html; if (!keep) window.scrollTo(0, 0); else if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
    afterRender();
  }
  let LASTHTML = ''; const LCACHE = {}; let LISTEN = [];
  function viewMap() {
    if (!GID) return viewNoGroup(); const pts = EXTRAS.pointsFrom(G(), D.group.name);
    return shell('แผนที่ลงพื้นที่', seg(SEG_S, 'map') + '<div class="card"><div class="card-title">🗺 แผนที่ดนตรีพหุวัฒนธรรมของกลุ่ม</div><div class="muted">จุดจากบันทึกที่มีพิกัด GPS (' + pts.length + ' จุด) — แตะจุดเพื่อดูรายละเอียด</div>' + EXTRAS.legendHTML(pts) + '<div id="mapEl" class="map-box"></div></div>');
  }
  async function viewListen() {
    if (!GID) return viewNoGroup();
    LISTEN = await EXTRAS.resolveAudio(EXTRAS.audioCandidates(G(), GID, ''), B.getMedia, LCACHE);
    return shell('ห้องฟัง', seg(SEG_S, 'listen') + '<div id="listenRoot">' + EXTRAS.listenHTML(LISTEN) + '</div>');
  }
  async function afterRender() {
    const ra = route().a; if (ra === 'map' && GID) EXTRAS.renderMap($('#mapEl'), EXTRAS.pointsFrom(G(), D.group.name)); if (ra === 'listen') EXTRAS.bindListen($('#listenRoot'), LISTEN);
    setBadge();
    const ids = $$('[data-mid]').map(e => e.dataset.mid);
    hydrate(); if (await ensureMedia(ids)) { const mb = $('#mediaBox'); if (mb && CUR) mb.innerHTML = mediaBlock(curData()); hydrate(); }
    if (CUR) initSign();
  }
  function toggleShowIf(v) { $$('[data-showif]').forEach(d => { d.hidden = d.dataset.showif !== v; }); }
  function syncForm() {
    const rec = curData(); const active = document.activeElement; toggleShowIf(rec.community);
    $$('[data-f]').forEach(el => {
      if (el === active) return; const k = el.dataset.f; const v = rec[k];
      if (el.type === 'checkbox') { if (el.checked !== !!v) el.checked = !!v; return; }
      const sv = v == null ? '' : String(v); if (el.value !== sv && !(PEND[CUR.path] && k in PEND[CUR.path].f)) { el.value = sv; el.classList.add('remote-flash'); setTimeout(() => el.classList.remove('remote-flash'), 1500); }
    });
    $$('[data-chip]').forEach(b => b.classList.toggle('on', (rec[b.dataset.chip] || []).includes(b.dataset.v)));
    $$('[data-scale]').forEach(b => b.classList.toggle('on', rec[b.dataset.scale] === +b.dataset.v));
    $$('[data-by]').forEach(el => { const bb = rec._by && rec._by[el.dataset.by]; el.innerHTML = bb ? '✎ ' + esc(short(bb.name)) + ' · ' + esc(thDateTime(bb.at)) : ''; });
    const mb = $('#metaBox'); if (mb) mb.innerHTML = M.metaHTML(rec);
    const go = $('#gpsOut'); if (go && rec.gps) go.innerHTML = M.gpsHTML(rec.gps);
    const box = $('#mediaBox'); if (box) { const ids = M.mediaIds(rec).join(); if (box.dataset.ids !== ids) { box.dataset.ids = ids; box.innerHTML = mediaBlock(rec); afterRender(); } }
    if (CUR && CUR.kind === 'interviews' && rec.sign !== signDrawn) initSign();
    setBadge();
  }

  /* ---------- ลายเซ็น ---------- */
  let signDrawn = null;
  function initSign() {
    const cv = $('#signCv'); if (!cv) return; const rec = curData(); const dpr = 2, w = cv.clientWidth || 300, h = cv.clientHeight || 140; cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr); g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1e0b3d';
    signDrawn = rec.sign || ''; if (rec.sign) { const im = new Image(); im.onload = () => g.drawImage(im, 0, 0, w, h); im.src = rec.sign; }
    let drawing = false, last = null, dirty = false; const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.onpointerdown = e => { drawing = true; last = pos(e); cv.setPointerCapture(e.pointerId); e.preventDefault(); };
    cv.onpointermove = e => { if (!drawing) return; const p = pos(e); g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(p[0], p[1]); g.stroke(); last = p; dirty = true; };
    const end = () => { if (!drawing) return; drawing = false; if (dirty && CUR) { signDrawn = cv.toDataURL('image/png'); queueField('sign', signDrawn); } };
    cv.onpointerup = end; cv.onpointercancel = end;
  }

  /* ---------- events ---------- */
  function onField(e) {
    const el = e.target.closest && e.target.closest('[data-f]'); if (!el || !CUR) return; const k = el.dataset.f;
    const v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : +el.value) : el.value; queueField(k, v);
    if (k === 'communityOther') { try { localStorage.setItem('mcm5_lastOther', el.value); } catch (er) { /* ignore */ } }
    if (k === 'community') { toggleShowIf(el.value); if (el.value === 'other') { const o = $('[data-f="communityOther"]'); if (o && !o.value) setTimeout(() => o.focus(), 50); } try { localStorage.setItem('mcm5_lastComm', el.value); } catch (er) { /* ignore */ } const t = document.createElement('div'); t.innerHTML = dlHTML({ community: el.value }); const a = $('#dl-instruments'), b = $('#dl-occasions'); if (a) a.replaceWith(t.children[0]); if (b) b.replaceWith(t.children[0]); }
  }
  document.addEventListener('input', onField); document.addEventListener('change', onField);
  document.addEventListener('input', e => { const pn = e.target.closest && e.target.closest('[data-peernote]'); if (pn) { clearTimeout(pn._t); pn._t = setTimeout(() => W(B.update('personal/' + ME.sid + '/peer/' + pn.dataset.peernote, { note: pn.value, at: Date.now() })), 600); } });
  document.addEventListener('change', async e => {
    if (e.target.matches('[data-pick]') && CUR) { const files = Array.from(e.target.files || []); e.target.value = ''; for (const f of files) await addImage(f); }
  });
  document.addEventListener('click', async e => {
    const go = e.target.closest('[data-go]'); if (go) { if (go.classList.contains('back') && CUR && !CUR.single && $('[data-form]')) { leaveCheck(go.dataset.go); return; } flushAll(); location.hash = go.dataset.go; return; }
    const wa = e.target.closest('[data-act]'); if (ME && ME.teacher && (e.target.closest('[data-peer]') || (wa && WRITE_ACTS.includes(wa.dataset.act)))) { toast('มุมมองครูเป็นแบบอ่านอย่างเดียว — ลองแก้ไขได้ใน “ทดลองระบบนักเรียน”', 3500); return; }
    const ch = e.target.closest('[data-chip]'); if (ch && CUR) { const k = ch.dataset.chip, v = ch.dataset.v; const arr = (curData()[k] || []).slice(); const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); ch.classList.toggle('on', i < 0); queueField(k, arr); return; }
    const sc = e.target.closest('[data-scale]'); if (sc && CUR) { const k = sc.dataset.scale, v = +sc.dataset.v; const nv = curData()[k] === v ? '' : v; $$('[data-scale="' + k + '"]').forEach(b => b.classList.toggle('on', +b.dataset.v === nv)); queueField(k, nv); return; }
    const pr = e.target.closest('[data-peer]'); if (pr) { const v = +pr.dataset.v; $$('[data-peer="' + pr.dataset.peer + '"]').forEach(b => b.classList.toggle('on', b === pr)); W(B.update('personal/' + ME.sid + '/peer/' + pr.dataset.peer, { score: v, at: Date.now() })); return; }
    const dy = e.target.closest('[data-day]'); if (dy) { CAL.sel = dy.dataset.day; render(true); return; }
    const cn = e.target.closest('[data-cal]'); if (cn) { CAL.m += +cn.dataset.cal; if (CAL.m < 0) { CAL.m = 11; CAL.y--; } if (CAL.m > 11) { CAL.m = 0; CAL.y++; } render(true); return; }
    const bt = e.target.closest('[data-act]'); if (!bt) return; const A = ACTIONS[bt.dataset.act]; if (A) { e.preventDefault(); await A(bt); }
  });

  function recorderModal() {
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast('เครื่องนี้ไม่รองรับการบันทึกเสียงในเบราว์เซอร์'); return; }
    const w = modal('<h3>🎙 บันทึกเสียง</h3><div class="muted">ขออนุญาตผู้ให้ข้อมูลก่อนบันทึก · สูงสุด 60 วินาที</div><div style="font-size:2.2rem;text-align:center;margin:14px 0;font-family:var(--head);color:var(--p600)" id="rtime">0:00</div><div id="rprev"></div><div class="row wrap"><button class="btn gold grow" id="rbtn">● เริ่มบันทึก</button><button class="btn sec" id="rcancel">ยกเลิก</button></div>');
    let stream, mr, chunks = [], t0, tick, blob, state = 'idle';
    const stop = () => { try { if (mr && mr.state !== 'inactive') mr.stop(); } catch (er) { /* ignore */ } };
    const close = () => { clearInterval(tick); if (stream) stream.getTracks().forEach(t => t.stop()); w.remove(); };
    $('#rcancel', w).onclick = () => { stop(); close(); };
    $('#rbtn', w).onclick = async () => {
      if (state === 'idle') {
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (er) { toast('ไม่ได้รับอนุญาตใช้ไมโครโฟน'); return; }
        const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
        mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 });
        mr.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
        mr.onstop = () => { clearInterval(tick); blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' }); state = 'done'; $('#rprev', w).innerHTML = '<audio controls src="' + URL.createObjectURL(blob) + '"></audio>'; const b = $('#rbtn', w); b.textContent = '✓ ใช้ไฟล์เสียงนี้'; b.className = 'btn grow'; };
        mr.start(); t0 = Date.now(); state = 'rec'; $('#rbtn', w).innerHTML = '<span class="rec-dot"></span>หยุด';
        tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); $('#rtime', w).textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); if (s >= 60) stop(); }, 250);
      } else if (state === 'rec') stop();
      else if (state === 'done') { const d = await M.blobToDataURL(blob); close(); await addMedia('audio', d); }
    };
  }

  async function groupMediaMap() {
    const ids = []; M.LIST_KINDS.forEach(k => M.listOf(G(), k).forEach(r => M.mediaIds(r).forEach(id => ids.push(id))));
    await ensureMedia(ids); const o = {}; ids.forEach(id => { if (MEDIA[id]) o[id] = MEDIA[id]; }); return o;
  }
  async function acRun(bt, fn) {
    const old = bt.textContent, msg = $('#acMsg'); bt.disabled = true; bt.textContent = 'กำลังเรียบเรียง…';
    try { await fn(await reportCtx()); if (msg) msg.textContent = 'สร้างรายงานเรียบร้อย ✓ (ตรวจทานภาษาและข้อมูลก่อนส่งครู)'; }
    catch (er) { console.warn(er); if (msg) msg.textContent = 'สร้างไม่สำเร็จ: ' + (er.message || er) + (/load fail/.test(er.message || '') ? ' — ไฟล์ PDF ต้องมีอินเทอร์เน็ตครั้งแรก (ใช้ Word ได้แม้ออฟไลน์)' : ''); }
    bt.disabled = false; bt.textContent = old;
  }
  async function reportCtx() { return { gid: GID, group: D.group, members: members(), media: await groupMediaMap(), events: eventsMap(), exporter: ME, personal: D.personal }; }
  const fileBase = () => ('รายงานดนตรีแม่สอด-' + D.group.room.replace('/', '-') + '-' + D.group.name).replace(/[\\/:*?"<>|\s]+/g, '_');
  async function exportWith(bt, fn) {
    const old = bt.textContent; bt.disabled = true; const msg = $('#exportMsg');
    try { const ctx = await reportCtx(); await fn(M.buildPages(G(), ctx), (i, n) => { bt.textContent = 'กำลังสร้างหน้า ' + i + '/' + n + '…'; }); if (msg) msg.textContent = 'สร้างไฟล์เรียบร้อย ✓'; }
    catch (er) { console.warn(er); if (msg) msg.textContent = 'สร้างไฟล์ไม่สำเร็จ — ต้องมีอินเทอร์เน็ตครั้งแรกเพื่อโหลดตัวช่วยส่งออก หรือใช้ “พิมพ์/บันทึก PDF” แทน'; }
    bt.disabled = false; bt.textContent = old;
  }

  const ACTIONS = {
    tlogin: async () => { try { B.authError = null; await B.signIn({}); } catch (er) { B.authError = er; renderLogin(); } },
    godemo: bt => { try { sessionStorage.setItem('mcm5_demo_ok', '1'); } catch (er) { /* ignore */ } location.href = bt.dataset.to; },
    login: async () => { try { B.authError = null; await B.signIn(B.mode === 'demo' ? {} : { hd: C.auth.domain }); } catch (er) { B.authError = er; renderLogin(); } },
    logout: async () => { flushAll(); sessionStorage.removeItem('mcm5_viewas'); await B.signOut(); location.hash = '#/home'; },
    hub: () => { sessionStorage.removeItem('mcm5_viewas'); location.hash = '#/hub'; onAuth(USER); },
    hubview: () => { sessionStorage.removeItem('mcm5_viewas'); location.hash = '#/hub/groups'; onAuth(USER); },
    viewas: bt => { clearSubs(); D = blankD(); ME = null; teacherAsGroup(USER, bt.dataset.id).then(() => { subs.push(B.on('groups', v => { HUBG = v || {}; }, () => { })); }); },
    demoas: async () => { await B.signOut(); sessionStorage.removeItem('mcm5_viewas'); setTimeout(() => B.signIn({}), 100); },
    switchacct: async () => { sessionStorage.removeItem('mcm5_viewas'); await B.signOut(); setTimeout(() => B.signIn({}), 100); },
    new: bt => { const mine = (members().find(m => m.sid === ME.sid) || {}).roles || []; if (!mine.length) { toast('เลือกบทบาทของคุณในกลุ่มก่อน แล้วระบบจะเปิดแบบบันทึกให้ทันที', 3200); rolesModal(() => newRecord(bt.dataset.kind)); return; } newRecord(bt.dataset.kind); },
    done: bt => leaveCheck(bt.dataset.to),
    reload: () => location.reload(),
    clcopy: bt => CONSENT.copyLink(bt.dataset.t),
    clshare: bt => CONSENT.shareLink(bt.dataset.t, D.ct[bt.dataset.t]),
    cletter: bt => {
      const t = bt.dataset.t, ct = D.ct[t]; if (!ct) { toast('ยังโหลดข้อมูลใบอนุญาตไม่เสร็จ ลองใหม่อีกครั้ง'); return; } const signed = !!ct.sign;
      const w = modal('<h3>🖨 หนังสือขออนุญาตผู้ปกครอง</h3><div class="muted" style="margin-bottom:10px">' + esc(ct.title) + ' · ' + esc(thDate(ct.date, true)) + '<br>' + (signed ? 'ผู้ปกครองตอบแล้ว — พิมพ์ฉบับที่มีลายเซ็นเก็บเป็นหลักฐานได้' : 'ถ้าผู้ปกครองไม่สะดวกเปิดลิงก์ พิมพ์ฉบับเปล่าให้เซ็นบนกระดาษแล้วส่งครูได้') + '</div>' +
        (signed ? '<div class="row wrap" style="margin-bottom:8px"><button class="btn gold grow" data-k="sp">🖨 พิมพ์ฉบับที่ลงนามแล้ว</button><button class="btn grow" data-k="sd">⬇ PDF ฉบับที่ลงนามแล้ว</button></div>' : '') +
        '<div class="row wrap"><button class="btn sec grow" data-k="bp">🖨 พิมพ์ฉบับเปล่า</button><button class="btn sec grow" data-k="bd">⬇ PDF ฉบับเปล่า</button></div><div class="muted" id="cl_msg" style="margin-top:8px"></div><button class="btn ghost block" style="margin-top:8px" data-close>ปิด</button>', { center: true });
      w.addEventListener('click', async ev => { const b = ev.target.closest('[data-k]'); if (!b) return; const k = b.dataset.k; const it = [CONSENT.fromToken(ct, k[0] !== 's')];
        if (k[1] === 'p') { w.remove(); CONSENT.printLetters(it); return; }
        b.disabled = true; try { await CONSENT.pdfLetters(it, 'ใบขออนุญาตผู้ปกครอง-' + ME.sid + '-' + ct.date); w.remove(); } catch (er) { b.disabled = false; $('#cl_msg', w).textContent = 'สร้าง PDF ไม่สำเร็จ (ต้องมีอินเทอร์เน็ตครั้งแรก) — ใช้ปุ่ม “พิมพ์” แล้วเลือกบันทึกเป็น PDF แทนได้'; } });
    },
    delrec: () => {
      if (!CUR || !confirm('ย้ายรายการนี้ไปถังขยะ? (สมาชิกกู้คืนได้)')) return; const { kind, rid, path } = CUR; const now = Date.now();
      W(B.update(path, { deleted: true, deletedAt: now, deletedBy: me(), updatedAt: now, updatedBy: me() })); log(kind, rid, 'delete', getRec(kind, rid)); CUR = null; location.hash = '#/' + kind;
    },
    restore: bt => { const now = Date.now(); W(B.update(recPath(bt.dataset.kind, bt.dataset.id), { deleted: false, restoredAt: now, updatedAt: now, updatedBy: me() })); log(bt.dataset.kind, bt.dataset.id, 'restore', null); toast('กู้คืนแล้ว'); },
    history: () => {
      if (!CUR) return; const { kind, rid } = CUR; const hs = Object.keys(D.history || {}).map(k => Object.assign({ hid: k }, D.history[k])).filter(h => h.kind === kind && h.rid === rid).sort((a, b) => b.at - a.at);
      const ACT = { create: 'สร้าง', edit: 'แก้ไข', media: 'แนบสื่อ', delete: 'ลบ', restore: 'กู้คืน' };
      const w = modal('<h3>🕘 ประวัติการบันทึก</h3><ul class="hist">' + hs.map(h => '<li><b>' + esc(h.by && h.by.name) + '</b> ' + (ACT[h.act] || h.act) + '<div class="muted">' + esc(thDateTime(h.at)) + '</div>' + (h.snap && h.act !== 'delete' ? '<button class="btn xs sec" data-hrestore="' + h.hid + '">↩ ย้อนกลับเป็นฉบับนี้</button>' : '') + '</li>').join('') + '</ul><button class="btn sec block" data-close>ปิด</button>');
      w.addEventListener('click', ev => {
        const r = ev.target.closest('[data-hrestore]'); if (!r) return; const h = D.history[r.dataset.hrestore]; if (!h || !confirm('ย้อนรายการนี้กลับเป็นฉบับ ' + thDateTime(h.at) + '?')) return;
        const snap = JSON.parse(h.snap); const now = Date.now(); snap.updatedAt = now; snap.updatedBy = me(); snap.deleted = false; delete snap.id;
        W(B.set(recPath(kind, rid), snap)); log(kind, rid, 'restore', snap); w.remove(); toast('ย้อนกลับแล้ว'); setTimeout(() => render(true), 300);
      });
    },
    pick: bt => { const i = $('[data-pick="' + bt.dataset.t + '"]'); if (i) i.click(); },
    rec: () => recorderModal(),
    delmedia: bt => { if (!CUR) return; const now = Date.now(); W(B.update(CUR.path, { ['media/' + bt.dataset.id]: null, updatedAt: now, updatedBy: me() })); log(CUR.kind, CUR.rid, 'edit', null); },
    gps: bt => {
      if (!navigator.geolocation) { toast('เครื่องนี้ไม่รองรับ GPS'); return; } bt.disabled = true; bt.textContent = 'กำลังหาตำแหน่ง…'; const path = CUR.path;
      navigator.geolocation.getCurrentPosition(p => { const g = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }; const o = $('#gpsOut'); if (o) o.innerHTML = M.gpsHTML(g); bt.disabled = false; bt.textContent = '📍 ใช้ตำแหน่งปัจจุบัน'; if (CUR && CUR.path === path) queueField('gps', g); },
        () => { bt.disabled = false; bt.textContent = '📍 ใช้ตำแหน่งปัจจุบัน'; toast('ไม่ได้รับตำแหน่ง (ตรวจการอนุญาต/สัญญาณ GPS)'); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
    },
    clearsign: () => { if (!CUR) return; const cv = $('#signCv'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); signDrawn = ''; queueField('sign', ''); },
    assign: bt => { const tid = bt.dataset.id; const on = assignees(tid).includes(ME.sid); W(B.set('groups/' + GID + '/assign/' + tid + '/' + ME.sid, on ? null : true)); },
    flag: bt => {
      const t = taskById(bt.dataset.id); const base = t.scope === 'individual' ? 'personal/' + ME.sid + '/flags/' : 'groups/' + GID + '/flags/';
      const cur = t.scope === 'individual' ? ((D.personal || {}).flags || {})[t.id] : ((D.group && D.group.flags) || {})[t.id];
      if (cur) { W(B.set(base + t.id, null)); return; }
      flushAll(); const send = () => { W(B.set(base + t.id, { by: me(), at: Date.now() })); toast('แจ้งครูแล้ว ✓'); };
      const sc = submitCheck(t); const open = sc.chk ? sc.chk.open : [];
      if (!sc.blocks.length && !sc.warns.length && !open.length) { send(); return; }
      gateModal({ title: sc.blocks.length ? '✋ ยังส่งงานนี้ไม่ได้' : '🔎 ตรวจก่อนส่งให้ครู', blocks: sc.blocks, warns: sc.warns, open, okLabel: 'ยืนยันและแจ้งครูให้ตรวจ', onOk: skips => { if (sc.chk && Object.keys(skips).length) writeSkips(sc.path, skips); send(); } });
    },
    roles: () => rolesModal(),
    _roles_unused: () => {
      const mine = (members().find(m => m.sid === ME.sid) || {}).roles || []; const taken = {}; members().forEach(m => (m.roles || []).forEach(r => (taken[r] = taken[r] || []).push(short(m.name))));
      const w = modal('<h3>🎭 เลือกบทบาทของฉัน (1–2 บทบาท)</h3><div class="muted" style="margin-bottom:8px">กลุ่มละ ' + C.group.min + '–' + C.group.max + ' คน ทุกบทบาทควรมีผู้รับผิดชอบ</div>' +
        C.roles.map(r => '<label class="chk" style="margin-bottom:6px"><input type="checkbox" value="' + r.id + '"' + (mine.includes(r.id) ? ' checked' : '') + '><span><b>' + r.icon + ' ' + esc(r.name) + '</b><br><span class="muted">' + esc(r.duty) + '</span>' + (taken[r.id] ? '<br><span class="tag gold">' + esc(taken[r.id].join(', ')) + '</span>' : '') + '</span></label>').join('') +
        '<button class="btn block" id="rsave">บันทึกบทบาท</button>');
      $('#rsave', w).onclick = () => { const sel = $$('input:checked', w).map(i => i.value); if (sel.length > 2) { toast('เลือกได้ไม่เกิน 2 บทบาท'); return; } W(B.set('groups/' + GID + '/roles/' + ME.sid, sel.length ? sel : null)); w.remove(); toast('บันทึกบทบาทแล้ว'); };
    },
    propose: () => {
      const w = modal('<h3>🗓 เสนอวันลงพื้นที่</h3><div class="f"><label>หัวข้อ</label><input type="text" id="p_t" value="ลงพื้นที่ ' + esc(D.group.name) + '"></div><div class="row"><div class="f grow"><label>วันที่</label><input type="date" id="p_d" value="' + esc(CAL.sel >= today() ? CAL.sel : today()) + '"></div><div class="f grow"><label>เริ่ม</label><input type="time" id="p_s" value="08:30"></div><div class="f grow"><label>ถึง</label><input type="time" id="p_e" value="12:00"></div></div>' +
        '<div class="f"><label>ชุมชน</label><select id="p_c" onchange="this.parentNode.nextElementSibling.hidden=this.value!==\'other\'">' + C.communities.map(c => '<option value="' + c.id + '">' + c.emoji + ' ' + esc(c.name) + '</option>').join('') + '</select></div><div class="f" hidden><label>➕ ระบุชื่อกลุ่มดนตรี/ชุมชน</label><input type="text" id="p_co" list="dl-otherComm2"><datalist id="dl-otherComm2">' + Array.from(new Set(M.otherNames(G()).concat(C.otherSuggestions || []))).map(x => '<option value="' + esc(x) + '">').join('') + '</datalist></div><div class="f"><label>สถานที่</label><input type="text" id="p_p"></div><div class="f"><label>รายละเอียด/การเดินทาง/ผู้ปกครองรับทราบหรือไม่</label><textarea id="p_n" rows="3"></textarea></div><button class="btn gold block" id="p_ok">ส่งให้ครูอนุมัติ</button>');
      $('#p_ok', w).onclick = () => { const ev = { title: $('#p_t', w).value.trim() || 'ลงพื้นที่', date: $('#p_d', w).value, start: $('#p_s', w).value, end: $('#p_e', w).value, community: $('#p_c', w).value, communityOther: $('#p_c', w).value === 'other' ? $('#p_co', w).value.trim() : null, place: $('#p_p', w).value, note: $('#p_n', w).value, groups: { [GID]: true }, room: ME.room, teacherJoin: false, status: 'proposed', createdAt: Date.now(), createdBy: me() }; if (!ev.date) { toast('เลือกวันที่'); return; } W(B.set('calendar/' + B.uid(), ev)); w.remove(); toast('ส่งคำขอแล้ว รอครูอนุมัติ'); };
    },
    ics: bt => { const e = Object.assign({ id: bt.dataset.id }, D.calendar[bt.dataset.id]); M.saveBlob(new Blob([M.icsFor(e)], { type: 'text/calendar' }), 'ลงพื้นที่-' + e.date + '.ics'); },
    safety: () => { location.hash = '#/safety'; },
    retry: async () => { await B.retryFailed(); render(true); },
    backup: async () => { const media = await groupMediaMap(); M.saveJSON({ app: 'mcm5g', v: 2, exportedAt: Date.now(), by: me(), gid: GID, group: D.group, records: D.records, docs: D.docs, history: D.history, personal: { [ME.sid]: D.personal }, media }, 'สำรอง-กลุ่ม-' + (D.group ? D.group.name : 'x') + '-' + M.today() + '.json'); },
    diag: () => diagModal(),
    bell: () => bellModal(),
    snaprestore: async bt => { const s = (await B.snapshots('g:' + GID)).find(x => x.id === bt.dataset.id); if (s && confirm('กู้คืนรายการที่หายไปจากสำเนาวันที่ ' + thDateTime(s.at) + '?')) restoreGroupData(s.data); },
    dlsnap: async bt => { const s = (await B.snapshots('g:' + GID)).find(x => x.id === bt.dataset.id); if (s) M.saveJSON({ app: 'mcm5g-snap', v: 2, gid: GID, at: s.at, data: s.data }, 'สำเนา-' + GID + '-' + s.at + '.json'); },
    acdocx: async bt => exportGate() && acRun(bt, ctx => REPORT.exportDocx(G(), ctx)),
    acpdf: async bt => exportGate() && acRun(bt, ctx => REPORT.exportPdf(G(), ctx, (i, n) => { bt.textContent = 'หน้า ' + i + '/' + n + '…'; })),
    acprev: async bt => acRun(bt, async ctx => REPORT.preview(G(), ctx)),
    preview: async () => M.previewPages(M.buildPages(G(), await reportCtx())),
    pdf: bt => exportGate() && exportWith(bt, (root, prog) => M.exportPDF(root, fileBase() + '.pdf', prog)),
    png: bt => exportGate() && exportWith(bt, (root, prog) => M.exportPNGs(root, fileBase(), prog)),
    print: async () => exportGate() && M.printPages(M.buildPages(G(), await reportCtx())),
    poster: async bt => {
      const R = (D.docs && D.docs.report) || {}; const n0 = M.listOf(G(), 'notes')[0]; const cid = R.posterCommunity || (n0 ? (M.commObj(n0) || {}).id : '') || C.communities[0].id; const old = bt.textContent; bt.disabled = true; bt.textContent = 'กำลังสร้าง…';
      try { await M.exportPoster(M.buildPoster(G(), await reportCtx(), cid), 'โปสเตอร์-' + (M.commById(cid) || {}).name + '-' + D.group.name + '.png'); } catch (er) { toast('สร้างโปสเตอร์ไม่สำเร็จ (ต้องมีอินเทอร์เน็ตครั้งแรก)', 4000); }
      bt.disabled = false; bt.textContent = old;
    }
  };

  /* ---------- ใบอนุญาตผู้ปกครอง ---------- */
  const evById = id => D.calendar && D.calendar[id] ? Object.assign({ id }, D.calendar[id]) : null;
  /* ลิงก์ใบอนุญาต: consents/{sid}/{eid} = token → ctoken/{token} (ครูออกลิงก์ ผู้ปกครองตอบบนเครื่องของตนเอง) */
  const CTW = {};
  const myTok = eid => { const t = (D.consents || {})[eid]; return typeof t === 'string' ? t : ''; };
  const myCons = eid => { const t = myTok(eid); return t ? CONSENT.rec(D.ct[t]) : null; };
  function watchTokens() {
    Object.keys(D.consents || {}).forEach(eid => { const t = myTok(eid); if (!t || CTW[t]) return; CTW[t] = 1;
      subs.push(B.on('ctoken/' + t, v => { D.ct[t] = v || false; onData(); }, () => { D.ct[t] = false; })); });
  }
  /* แจ้งผลของตัวเองให้เพื่อนในกลุ่มเห็น (สรุป ✅/❌ ใต้การ์ดนัด) */
  function mirrorFw() {
    if (!ME || ME.teacher || !GID || !D.group) return;
    Object.keys(D.consents || {}).forEach(eid => { const c = myCons(eid); if (!c) return; const cur = ((D.group.fieldwork || {})[eid] || {})[ME.sid]; if (cur === c.decision || mirrorFw.sent[eid] === c.decision) return; mirrorFw.sent[eid] = c.decision; W(B.set('groups/' + GID + '/fieldwork/' + eid + '/' + ME.sid, c.decision)); });
  }
  mirrorFw.sent = {};
  const stuObj = () => ({ sid: ME.sid, name: ME.name, room: ME.room, no: ME.no, gid: GID, group: (D.group || {}).name || '' });
  function consentBar(e) {
    if (!ME || !CONSENT.needsConsent(e)) return '';
    const fw = (D.group && D.group.fieldwork && D.group.fieldwork[e.id]) || {};
    const row = GID ? '<div class="fw-row" style="width:100%">' + members().map(m => { const d = fw[m.sid]; return '<span class="' + (d === 'allow' ? 'a' : d === 'deny' ? 'd' : 'p') + '">' + (d === 'allow' ? '✅' : d === 'deny' ? '❌' : '⏳') + ' ' + esc(short(m.name)) + '</span>'; }).join('') + '</div>' : '';
    if (ME.teacher) return row;
    const t = myTok(e.id), ct = t ? D.ct[t] : null, c = myCons(e.id);
    if (!t) return '<div style="width:100%">' + CONSENT.statusChip('', null) + ' <span class="muted" style="font-size:.78rem">เมื่อครูออกลิงก์ใบอนุญาตแล้ว ปุ่มคัดลอกลิงก์จะขึ้นตรงนี้</span></div>' + row;
    return (c ? '' : '<button class="btn xs gold" data-act="clshare" data-t="' + esc(t) + '">📤 ส่งลิงก์ให้ผู้ปกครอง</button><button class="btn xs sec" data-act="clcopy" data-t="' + esc(t) + '">📋 คัดลอกลิงก์</button>') + '<button class="btn xs sec" data-act="cletter" data-t="' + esc(t) + '">🖨 ใบขออนุญาต</button>' +
      '<div style="width:100%">' + CONSENT.statusChip(t, ct) + (c ? ' <span class="muted" style="font-size:.76rem">' + esc(c.parentName || '') + ' · ' + esc(thDateTime(c.at)) + (c.method === 'paper' ? ' · ครูบันทึกจากใบกระดาษ' : '') + '</span>' : ' <span class="muted" style="font-size:.78rem">ส่งลิงก์ให้ผู้ปกครองเปิดบนโทรศัพท์ของผู้ปกครอง อ่านรายละเอียด แล้วเซ็นชื่อ (ไม่ต้องล็อกอิน)</span>') +
      (c && c.decision === 'deny' ? '<div class="skipnote" style="margin-top:4px">ระบบบันทึกว่าคุณ <b>ไม่ได้ร่วมลงพื้นที่ครั้งนี้เพราะผู้ปกครองไม่อนุญาต</b>' + (c.reason ? ' (' + esc(c.reason) + ')' : '') + ' — คะแนนงานภาคสนามจะคิดตามสัดส่วน ช่วยกลุ่มในงานวิเคราะห์ สรุป และรายงานได้เต็มที่ และทำงานทดแทนตามที่ครูมอบหมาย</div>' : '') +
      (c ? '<div class="muted" style="font-size:.74rem;margin-top:2px">คำตอบแก้ไขเองไม่ได้ ถ้าผู้ปกครองเปลี่ยนใจให้แจ้งครูเพื่อออกลิงก์ใหม่</div>' : '') + '</div>' + row;
  }

  /* ---------- การมีส่วนร่วม (นับจากประวัติการบันทึกจริง) ---------- */
  const CONTRIB_ACTS = ['create', 'edit', 'media'];
  function contribMap() { const o = {}; Object.values(D.history || {}).forEach(h => { const s = h.by && h.by.sid; if (s && CONTRIB_ACTS.includes(h.act) && FORMS[h.kind]) (o[s] = o[s] || new Set()).add(h.kind); }); return o; }
  function goalsCard(mem, mine) {
    if (ME.teacher) return '';
    const cm = contribMap(), myK = cm[ME.sid] || new Set();
    const up = myEvents().filter(e => e.date >= today() && CONSENT.needsConsent(e)), pend = up.filter(e => !(myCons(e.id) && myCons(e.id).decision));
    const rfOk = M.checkRecord('reflection', (D.personal || {}).reflection).valid, claimed = C.tasks.some(t => t.scope === 'group' && assignees(t.id).includes(ME.sid));
    const dots = '<span class="dots">' + C.tasks.filter(t => t.scope === 'group').map(t => '<i class="' + (myK.has(t.kind) ? 'on' : '') + '" title="' + esc(t.name) + '">' + t.icon + '</i>').join('') + '</span>';
    const it = [[mine.roles.length > 0, 'เลือกบทบาทของฉันในกลุ่ม', '<button class="btn xs gold" data-act="roles">เลือก</button>'],
      [claimed, 'รับผิดชอบงานอย่างน้อย 1 ชิ้น (กด “＋ รับงานนี้” ในหน้างาน)', '<a class="btn xs sec" href="#/notes">ไปที่งาน</a>'],
      [myK.size > 0, 'มีชื่อในงานกลุ่ม: เพิ่ม แก้ไข หรือแนบภาพ/เสียงอย่างน้อย 1 ครั้ง<br>' + dots, '']];
    if (up.length) it.push([!pend.length, 'ผู้ปกครองตอบใบอนุญาตลงพื้นที่แล้ว (อนุญาตหรือไม่อนุญาตก็ได้)', '<a class="btn xs gold" href="#/calendar">ส่งลิงก์</a>']);
    it.push([rfOk, 'เขียนสะท้อนคิดของฉัน', '<a class="btn xs sec" href="#/reflection">เขียน</a>']);
    const n = it.filter(x => x[0]).length; const idle = mem.filter(m => !cm[m.sid]);
    return '<div class="card"><div class="card-title">🎯 ภารกิจของฉัน <span class="muted">' + n + '/' + it.length + '</span></div><div class="bar" style="margin-bottom:8px"><i style="width:' + Math.round(n / it.length * 100) + '%"></i></div><ul class="goal">' +
      it.map(x => '<li class="' + (x[0] ? 'ok' : '') + '"><span class="ck">' + (x[0] ? '✓' : '•') + '</span><div class="grow">' + x[1] + '</div>' + (x[0] ? '' : x[2]) + '</li>').join('') + '</ul>' +
      (idle.length ? '<div class="tip" style="margin:10px 0 0">เพื่อนที่ยังไม่มีชื่อในงานกลุ่ม: <b>' + idle.map(m => esc(short(m.name))).join(', ') + '</b> — กลุ่มจะแจ้งส่งรายงานได้เมื่อทุกคนมีส่วนร่วมอย่างน้อยคนละ 1 ครั้ง</div>' : '<div class="hint" style="margin-top:8px">ทุกคนในกลุ่มมีส่วนร่วมแล้ว 👏</div>') + '</div>';
  }
  function rolesModal(after) {
    const mine = (members().find(m => m.sid === ME.sid) || {}).roles || []; const taken = {}; members().forEach(m => (m.roles || []).forEach(r => (taken[r] = taken[r] || []).push(short(m.name))));
    const w = modal('<h3>🎭 เลือกบทบาทของฉัน (1–2 บทบาท)</h3><div class="muted" style="margin-bottom:8px">กลุ่มละ ' + C.group.min + '–' + C.group.max + ' คน ทุกบทบาทควรมีผู้รับผิดชอบ</div>' +
      C.roles.map(r => '<label class="chk" style="margin-bottom:6px"><input type="checkbox" value="' + r.id + '"' + (mine.includes(r.id) ? ' checked' : '') + '><span><b>' + r.icon + ' ' + esc(r.name) + '</b><br><span class="muted">' + esc(r.duty) + '</span>' + (taken[r.id] ? '<br><span class="tag gold">' + esc(taken[r.id].join(', ')) + '</span>' : '') + '</span></label>').join('') +
      '<button class="btn block" id="rsave">บันทึกบทบาท</button>');
    $('#rsave', w).onclick = () => { const sel = $$('input:checked', w).map(i => i.value); if (sel.length > 2) { toast('เลือกได้ไม่เกิน 2 บทบาท'); return; } if (after && !sel.length) { toast('เลือกอย่างน้อย 1 บทบาท'); return; } if (D.group) { D.group.roles = D.group.roles || {}; D.group.roles[ME.sid] = sel; } W(B.set('groups/' + GID + '/roles/' + ME.sid, sel.length ? sel : null)); w.remove(); toast('บันทึกบทบาทแล้ว'); if (after) after(); };
  }

  /* ---------- ตรวจความครบถ้วนก่อนออกจากแบบบันทึก / ก่อนแจ้งส่งงาน ---------- */
  function domRec(base) {
    const r = Object.assign({}, base); const P = (CUR && PEND[CUR.path] && PEND[CUR.path].f) || {}; Object.assign(r, P);
    $$('[data-form] [data-f]').forEach(el => { r[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; });
    const ch = {}; $$('[data-form] [data-chip]').forEach(b => { ch[b.dataset.chip] = ch[b.dataset.chip] || []; if (b.classList.contains('on')) ch[b.dataset.chip].push(b.dataset.v); }); Object.assign(r, ch);
    const sc = {}; $$('[data-form] [data-scale]').forEach(b => { if (!(b.dataset.scale in sc)) sc[b.dataset.scale] = ''; if (b.classList.contains('on')) sc[b.dataset.scale] = +b.dataset.v; }); Object.assign(r, sc);
    if ($('#gpsOut a') && !(r.gps && r.gps.lat != null)) r.gps = { lat: 0, lng: 0 };
    if ($('#signCv')) r.sign = signDrawn || '';
    if ($('#mediaBox [data-mid]') && !M.mediaIds(r).length) r.media = { _dom: { at: 1 } };
    return r;
  }
  function writeSkips(path, skips, stale) {
    const upd = {}; Object.keys(skips).forEach(k => upd['_skip/' + k] = { label: skips[k].label, why: skips[k].why || '', by: me(), at: Date.now() }); (stale || []).forEach(k => upd['_skip/' + k] = null);
    if (Object.keys(upd).length) W(B.update(path, upd));
  }
  function gateModal(o) {
    const WHY = M.SKIP_WHY; const blocks = o.blocks || [], warns = o.warns || [], open = o.open || [];
    const w = modal('<h3>' + esc(o.title) + '</h3>' +
      (blocks.length ? '<div class="muted" style="margin-bottom:6px">🔴 ต้องทำก่อน' + (o.draftLabel ? 'จึงจะนับเป็นชิ้นงาน' : '') + '</div><ul class="chk-list">' + blocks.map(b => '<li class="blk"><span>✋</span><div class="grow">' + esc(b) + '</div></li>').join('') + '</ul>' : '') +
      (warns.length ? '<ul class="chk-list">' + warns.map(b => '<li class="wrn"><span>⚠️</span><div class="grow">' + esc(b) + '</div></li>').join('') + '</ul>' : '') +
      (open.length ? '<div class="muted" style="margin-bottom:6px">🟡 รายละเอียดสำคัญที่ยังไม่มี — กลับไปกรอก หรือ <b>ติ๊กยืนยันทีละข้อ</b> ว่ายังไม่มีข้อมูลส่วนนี้ (ครูจะเห็นการยืนยันและเหตุผล)</div><ul class="chk-list">' + open.map(x => '<li class="wrn"><input type="checkbox" data-skip="' + esc(x.k) + '" id="sk_' + esc(x.k) + '"><div class="grow"><label for="sk_' + esc(x.k) + '"><b>' + esc(x.label) + '</b><br><span class="muted">ยืนยันว่ายังไม่มีข้อมูลส่วนนี้</span></label><select data-why="' + esc(x.k) + '">' + (WHY[x.k] || WHY._).map(y => '<option>' + esc(y) + '</option>').join('') + '</select></div></li>').join('') + '</ul>' : '') +
      '<button class="btn gold block" data-close>✏️ กลับไปกรอกต่อ</button>' +
      (blocks.length ? (o.draftLabel ? '<button class="btn sec block" style="margin-top:8px" id="gm_draft">' + esc(o.draftLabel) + '</button>' : '') : '<button class="btn block" style="margin-top:8px" id="gm_ok"' + (open.length ? ' disabled' : '') + '>' + esc(o.okLabel || 'ยืนยัน') + '</button>'), { center: true });
    const ok = $('#gm_ok', w), dr = $('#gm_draft', w);
    w.addEventListener('change', () => { if (ok) ok.disabled = $$('[data-skip]', w).some(c => !c.checked); });
    if (ok) ok.onclick = () => { const skips = {}; open.forEach(x => { skips[x.k] = { label: x.label, why: ($('[data-why="' + x.k + '"]', w) || {}).value || '' }; }); w.remove(); o.onOk(skips); };
    if (dr) dr.onclick = () => { w.remove(); o.onDraft(); };
    return w;
  }
  function leaveCheck(target) {
    if (!CUR || CUR.single || (ME && ME.teacher) || !$('[data-form]')) { flushAll(); location.hash = target; return; }
    const kind = CUR.kind, path = CUR.path; const rec = domRec(getRec(kind, CUR.rid) || {}); const chk = M.checkRecord(kind, rec);
    const stale = Object.keys(rec._skip || {}).filter(k => rec._skip[k] && !chk.key.some(x => x.k === k));
    flushAll(); const go = () => { location.hash = target; };
    if (chk.valid && !chk.open.length) { if (stale.length) writeSkips(path, {}, stale); go(); return; }
    gateModal({ title: chk.valid ? '🔎 ข้อมูลยังไม่ครบบางส่วน' : '✋ ข้อมูลขั้นต่ำยังไม่ครบ', blocks: chk.req.map(x => 'ยังไม่ได้กรอก “' + x.label + '”'), open: chk.valid ? chk.open : [], okLabel: 'ยืนยันและกลับไปรายการ', draftLabel: 'ออกโดยเก็บเป็น “ร่าง” (ยังไม่นับเป็นชิ้นงาน)',
      onOk: skips => { writeSkips(path, skips, stale); go(); }, onDraft: go });
  }
  function submitCheck(t) {
    const blocks = [], warns = [], mem = members(), kind = t.kind, nm = l => l.map(m => short(m.name)).join(', '); let chk = null, path = null;
    if (t.scope === 'individual') {
      path = 'personal/' + ME.sid + '/reflection'; chk = M.checkRecord('reflection', $('[data-form]') && CUR && CUR.kind === 'reflection' ? domRec((D.personal || {}).reflection || {}) : (D.personal || {}).reflection);
      chk.req.forEach(x => blocks.push('ยังไม่ได้กรอก “' + x.label + '”'));
      if (GID) { const pr = (D.personal || {}).peer || {}; const miss = mem.filter(m => m.sid !== ME.sid && !(pr[m.sid] && pr[m.sid].score)); if (miss.length) blocks.push('ยังไม่ได้ประเมินการมีส่วนร่วมของเพื่อน: ' + nm(miss));
        if (!contribMap()[ME.sid]) blocks.push('คุณยังไม่มีชื่อในงานของกลุ่มเลย — เพิ่ม แก้ไข หรือแนบภาพ/เสียงในงานกลุ่มอย่างน้อย 1 ครั้งก่อนส่งสะท้อนคิด'); }
      return { blocks, warns, chk, path };
    }
    if (M.LIST_KINDS.includes(kind)) {
      const p = M.taskProgress(t, G()); const list = M.listOf(G(), kind);
      if (p.n < 1) blocks.push('ยังไม่มีรายการที่กรอกข้อมูลขั้นต่ำครบ (ช่องที่มี *) แม้แต่รายการเดียว'); else if (p.n < p.min) warns.push('ทำได้ ' + p.n + ' รายการ จากขั้นต่ำ ' + p.min + ' รายการ — ส่งได้ แต่คะแนนด้านความครบถ้วนอาจลดลง');
      if (p.drafts) warns.push('มี ' + p.drafts + ' รายการที่ยังเป็น “ร่าง” (ไม่นับเป็นชิ้นงาน)');
      const nOpen = list.reduce((a, r) => { const k = M.checkRecord(kind, r); return a + (k.valid ? k.open.length : 0); }, 0);
      if (nOpen) warns.push('ยังมีรายละเอียดสำคัญที่ไม่ได้กรอกและยังไม่ได้ยืนยัน ' + nOpen + ' จุด (เปิดรายการที่มีป้าย ⚠ แล้วกด “เสร็จ” เพื่อกรอกหรือยืนยัน)');
    } else {
      path = 'docs/' + GID + '/' + kind; chk = M.checkRecord(kind, $('[data-form]') && CUR && CUR.kind === kind ? domRec((D.docs || {})[kind] || {}) : (D.docs || {})[kind]);
      chk.req.forEach(x => blocks.push('ยังไม่ได้กรอก “' + x.label + '”'));
    }
    const need = Math.min(2, mem.length), cs = new Set(); Object.values(D.history || {}).forEach(h => { if (h.kind === kind && h.by && CONTRIB_ACTS.includes(h.act) && mem.some(m => m.sid === h.by.sid)) cs.add(h.by.sid); });
    if (cs.size < need) blocks.push('งานกลุ่มต้องมีสมาชิกร่วมบันทึกหรือแก้ไขอย่างน้อย ' + need + ' คน (ตอนนี้ ' + cs.size + ' คน) — ชวนเพื่อนเปิดงานนี้แล้วเพิ่มหรือปรับสักหนึ่งจุด');
    if (t.id === 't6') {
      C.tasks.filter(x => x.scope === 'group' && x.id !== 't6').forEach(x => { if (!(M.taskProgress(x, G()).n > 0)) blocks.push('งาน “' + x.name + '” ยังไม่มีข้อมูลขั้นต่ำ — ทุกชิ้นงานต้องมีข้อมูลอย่างน้อยเล็กน้อย'); });
      const cm = contribMap(), idle = mem.filter(m => !cm[m.sid]); if (idle.length) blocks.push('สมาชิกที่ยังไม่มีชื่อในงานใดเลย: ' + nm(idle) + ' — ทุกคนต้องมีส่วนร่วมอย่างน้อย 1 ครั้งก่อนส่งรายงาน');
    }
    return { blocks, warns, chk, path };
  }
  function exportGate() {
    if (!ME || ME.teacher) return true;
    const miss = C.tasks.filter(x => x.scope === 'group' && x.id !== 't6').filter(x => !(M.taskProgress(x, G()).n > 0)); if (!miss.length) return true;
    gateModal({ title: '✋ ยังส่งออกรายงานฉบับจริงไม่ได้', blocks: miss.map(x => x.icon + ' ' + x.name + ' — ยังไม่มีข้อมูลขั้นต่ำ (ทุกชิ้นงานต้องมีข้อมูลอย่างน้อยเล็กน้อย)'), warns: ['ระหว่างนี้ใช้ “👁 ดูตัวอย่าง” เพื่อดูหน้าตารายงานได้'] }); return false;
  }

  /* ---------- กู้คืนข้อมูลกลุ่ม (เพิ่มเฉพาะที่หาย/ใหม่กว่า) ---------- */
  async function restoreGroupData(data, media) {
    if (!GID || ME.teacher) return; const upd = {}; let n = 0;
    Object.keys(data.records || {}).forEach(kind => Object.keys(data.records[kind] || {}).forEach(rid => { const r = data.records[kind][rid], c = (D.records[kind] || {})[rid]; if (r && (!c || (r.updatedAt || 0) > (c.updatedAt || 0))) { upd['records/' + GID + '/' + kind + '/' + rid] = r; n++; } }));
    Object.keys(data.docs || {}).forEach(k => { const d = data.docs[k], c = (D.docs || {})[k]; if (d && (!c || (d._updatedAt || 0) > (c._updatedAt || 0))) { upd['docs/' + GID + '/' + k] = d; n++; } });
    for (const id of Object.keys(media || {})) { const m = Object.assign({}, media[id]); delete m.id; if (!(await B.getMedia(GID, id))) W(B.putMedia(GID, id, m)); }
    if (n) { await W(B.update('', upd)); log('restore', '-', 'restore', null); }
    toast(n ? 'กู้คืนแล้ว ' + n + ' รายการ ✓' : 'ไม่มีรายการที่ต้องกู้คืน — ข้อมูลบนคลาวด์ครบ/ใหม่กว่าแล้ว', 3500);
  }
  document.addEventListener('change', async e => {
    if (!e.target.matches('[data-restore]')) return; const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const o = JSON.parse(await f.text()); if (o.app === 'mcm5g' && o.gid === GID) restoreGroupData({ records: o.records, docs: o.docs }, o.media); else if (o.app === 'mcm5g-snap' && o.gid === GID) restoreGroupData(o.data); else toast('ไฟล์นี้ไม่ใช่ข้อมูลของกลุ่มคุณ', 3500); }
    catch (er) { toast('อ่านไฟล์ไม่ได้: ' + er.message, 3500); }
  });

  /* ---------- start ---------- */
  window.addEventListener('hashchange', () => { flushAll(); if (!USER) renderLogin(); else render(); });
  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushAll(); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
  (function () { try { const q = new URLSearchParams(location.search); if (q.get('as')) { sessionStorage.setItem('mcm5_viewas', q.get('as')); history.replaceState(null, '', location.pathname + '#/home'); } } catch (e) { /* ignore */ } })();
  (async function boot() {
    if (await CONSENT.publicPage()) return;   /* ลิงก์ใบอนุญาตผู้ปกครอง (?c=…) ไม่ต้องล็อกอิน */
    try { await B.init(); } catch (er) { $('#root').innerHTML = '<div class="card" style="margin:20px">เชื่อมต่อระบบไม่สำเร็จ: ' + esc(er.message) + '<br>ตรวจอินเทอร์เน็ต แล้วลองเปิดใหม่</div>'; return; }
    B.onStatus(s => { STATUS = s; setBadge(); });
    B.onAuth(u => { onAuth(u); });
  })();
  window.__D = () => D; window.__ME = () => ME;
})();
