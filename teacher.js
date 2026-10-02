/* ============================================================
   teacher.js — หน้าครู
   นำเข้ารายชื่อ · จัดกลุ่มด้วยการคลิก · ปฏิทินลงพื้นที่ · ตรวจงานกลุ่ม (rubric + ปรับรายคน)
   ส่งออกคะแนนไป Teacher OS · สำรอง/กู้คืนข้อมูล
   ============================================================ */
(function () {
  'use strict';
  const M = window.MC, C = M.C;
  const { $, $$, esc, today, thDate, thDateTime, ago, taskById, roleById, short, FORMS, toast, modal, avatar } = M;
  const round1 = x => Math.round(x * 10) / 10;
  const W = p => Promise.resolve(p).catch(e => toast('บันทึกไม่สำเร็จ: ' + ((e && (e.code || e.message)) || e), 4500));

  let loginMsg = '';
  let USER = null, STATUS = { online: true, pending: 0, failed: 0 };
  const D = { consents: {}, ct: {}, roster: {}, groups: {}, memberOf: {}, calendar: {}, grades: { groups: {}, students: {} }, config: {}, records: null, personal: {}, gdata: {} };
  const V = { tab: 'dash', room: '5/1', sel: new Set(), gid: null, tid: 't1', sid: null, cal: { y: new Date().getFullYear(), m: new Date().getMonth(), sel: today() } };
  let subs = [], gsubs = [];
  const MEDIA = {}; const TRIED = new Set();
  const maxOf = t => (D.config.max && D.config.max[t.id] != null) ? +D.config.max[t.id] : t.max;
  const totalMax = () => C.tasks.reduce((a, t) => a + maxOf(t), 0);
  const rooms = () => Array.from({ length: C.course.rooms || 14 }, (_, i) => '5/' + (i + 1));
  const rosterAll = room => Object.keys(D.roster || {}).map(sid => Object.assign({ sid }, D.roster[sid])).filter(s => !room || s.room === room).sort((a, b) => ((+a.no) || 999) - ((+b.no) || 999) || String(a.sid).localeCompare(String(b.sid)));
  const rosterOf = room => rosterAll(room).filter(s => !s.left);
  const groupsOf = room => Object.keys(D.groups || {}).map(gid => Object.assign({ gid }, D.groups[gid])).filter(g => !room || g.room === room).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const memList = g => Object.keys((g && g.members) || {}).map(sid => ({ sid, name: g.members[sid].name, no: g.members[sid].no, roles: (g.roles && g.roles[sid]) || [] })).sort((a, b) => (+a.no) - (+b.no));
  const tMe = () => ({ sid: 'teacher', name: (USER && USER.name) || 'ครู' });

  /* ---------- คะแนน ---------- */
  /* นัดลงพื้นที่ของนักเรียนแต่ละคน + สัดส่วนที่ผู้ปกครองไม่อนุญาต → ตัวคูณคะแนนงานภาคสนาม */
  const FIELD = C.fieldTasks || ['t1', 't2'];
  function eventsFor(sid) { const gid = D.memberOf[sid], room = (D.roster[sid] || {}).room; return Object.keys(D.calendar || {}).map(id => Object.assign({ id }, D.calendar[id])).filter(e => { if (!e.date) return false; const gs = e.groups ? Object.keys(e.groups) : []; return gs.length ? !!(gid && gs.includes(gid)) : (!e.room || e.room === room); }); }
  const tokOf = (sid, eid) => { const t = ((D.consents || {})[sid] || {})[eid]; return typeof t === 'string' ? t : ''; };
  const cRec = (sid, eid) => { const t = tokOf(sid, eid); return t ? CONSENT.rec(D.ct[t]) : null; };
  const consMap = sid => { const o = {}; Object.keys((D.consents || {})[sid] || {}).forEach(eid => { const c = cRec(sid, eid); if (c) o[eid] = c; }); return o; };
  function fwOf(sid) { const p = CONSENT.participation(eventsFor(sid), consMap(sid)); const ex = !!((D.grades.students || {})[sid] || {}).noPenalty; p.exempt = ex; p.pct = (ex || !p.total) ? 0 : round1((C.consentPenalty || 0) * p.deny / p.total); return p; }
  function evStudents(e) { const gs = e.groups ? Object.keys(e.groups).filter(g => D.groups[g]) : []; const gl = gs.length ? gs : groupsOf(e.room).map(g => g.gid); const out = []; gl.forEach(gid => memList(D.groups[gid]).forEach(m => { const r = D.roster[m.sid] || {}; out.push({ sid: m.sid, name: m.name, no: r.no || m.no, room: r.room || D.groups[gid].room, gid, group: D.groups[gid].name }); })); return out; }
  function finalOf(sid) {
    const sg = (D.grades.students || {})[sid] || {}, gid = D.memberOf[sid], gg = ((D.grades.groups || {})[gid] || {}).tasks || {}; const out = {}; let tot = 0, any = false; const fw = fwOf(sid);
    C.tasks.forEach(t => {
      let s = null;
      if (t.scope === 'individual') { const e = sg.tasks && sg.tasks[t.id]; s = e && e.s != null && e.s !== '' ? +e.s : null; }
      else { const e = gg[t.id]; if (e && e.s != null && e.s !== '') { s = Math.max(0, Math.min(maxOf(t), round1(+e.s + (+((sg.adj || {})[t.id]) || 0)))); if (fw.pct && FIELD.includes(t.id)) s = round1(s * (1 - fw.pct / 100)); } }
      out[t.id] = s; if (s != null) { tot += s; any = true; }
    });
    return { tasks: out, total: any ? round1(tot) : null, fw };
  }
  function pushFinal(sids) {
    const upd = {}; sids.forEach(sid => { const f = finalOf(sid); const fin = {}; Object.keys(f.tasks).forEach(k => { if (f.tasks[k] != null) fin[k] = f.tasks[k]; }); upd['grades/students/' + sid + '/final'] = Object.keys(fin).length ? fin : null; upd['grades/students/' + sid + '/total'] = f.total; upd['grades/students/' + sid + '/room'] = (D.roster[sid] || {}).room || ''; upd['grades/students/' + sid + '/gid'] = D.memberOf[sid] || null; upd['grades/students/' + sid + '/fw'] = f.fw.total ? { deny: f.fw.deny, total: f.fw.total, pct: f.fw.pct, exempt: f.fw.exempt } : null; });
    if (Object.keys(upd).length) W(B.update('', upd));
  }
  /* เมื่อใบอนุญาต/ปฏิทิน/ค่าหักเปลี่ยน → คำนวณคะแนนที่เผยแพร่ไว้ใหม่ให้ตรงเสมอ */
  const LD = {}, SYNCED = {}; let syncT = null;
  function queueSync() { clearTimeout(syncT); syncT = setTimeout(() => {
    if (!USER || !['roster', 'groups', 'memberOf', 'calendar', 'grades', 'consents', 'ctoken', 'config'].every(k => LD[k])) return;
    const diff = Object.keys(D.grades.students || {}).filter(sid => { const sg = D.grades.students[sid] || {}; if (!sg.final) return false; const f = finalOf(sid); return Object.keys(f.tasks).some(k => f.tasks[k] != null && sg.final[k] !== f.tasks[k]); });
    if (diff.length) pushFinal(diff);
    Object.keys(D.calendar || {}).forEach(eid => { const e = D.calendar[eid]; if (e && e.date >= today() && !SYNCED[eid + (e.updatedAt || '')]) { SYNCED[eid + (e.updatedAt || '')] = 1; syncTokens(eid, null, true); } });
  }, 1500); }
  function rubricScore(t, r) { if (!t.criteria.every(c => r && r[c.k])) return null; return round1(maxOf(t) * t.criteria.reduce((a, c) => a + r[c.k], 0) / (4 * t.criteria.length)); }

  /* ---------- subscriptions ---------- */
  function sub(path, fn) { subs.push(B.on(path, v => { fn(v); LD[path] = 1; schedule(); if (['consents', 'ctoken', 'calendar', 'config', 'memberOf'].includes(path)) queueSync(); }, e => toast('อ่านข้อมูลไม่ได้ (' + path + '): ' + (e.code || e.message), 4000))); }
  function startData() {
    sub('roster', v => D.roster = v || {}); sub('groups', v => D.groups = v || {}); sub('memberOf', v => D.memberOf = v || {});
    sub('calendar', v => D.calendar = v || {}); needRecords(); sub('grades', v => D.grades = Object.assign({ groups: {}, students: {} }, v || {})); sub('config', v => { D.config = v || {}; M.applyInfo(D.config); }); sub('tcomments', v => D.tc = v || {}); sub('consents', v => D.consents = v || {}); sub('ctoken', v => D.ct = v || {});
  }
  function needRecords() { if (D.records !== null) return; D.records = {}; sub('records', v => D.records = v || {}); }
  function openGroup(gid) {
    gsubs.forEach(f => f()); gsubs = []; V.gid = gid; if (!gid) return;
    D.gdata[gid] = D.gdata[gid] || { records: {}, docs: {}, history: {} };
    ['records', 'docs', 'history'].forEach(k => gsubs.push(B.on(k + '/' + gid, v => { D.gdata[gid][k] = v || {}; schedule(); })));
    memList(D.groups[gid]).forEach(m => gsubs.push(B.on('personal/' + m.sid, v => { D.personal[m.sid] = v || {}; schedule(); })));
  }
  let rT = null, DRAGGING = false; let PENDR = false; function typing() { const a = document.activeElement; return !!(a && a.closest && a.closest('#root') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'file'); }
  /* ครูกำลังพิมพ์/เลือกอยู่ → เลื่อนการวาดหน้าจอไปจนพิมพ์เสร็จ (กันค่าที่พิมพ์หายเมื่อนักเรียนบันทึกเข้ามาพร้อมกัน) */
  document.addEventListener('focusout', () => { if (PENDR) setTimeout(() => { if (PENDR && !typing()) { PENDR = false; schedule(); } }, 120); });
  function schedule() { if (DRAGGING || V.tab === 'listen' || V.tab === 'map') return; if (typing()) { PENDR = true; return; } cancelAnimationFrame(rT); rT = requestAnimationFrame(() => render(true)); }

  /* ---------- shell ---------- */
  const TABS = [['dash', '📋 ภาพรวม'], ['roster', '🧾 จัดการรายชื่อ'], ['groups', '👥 จัดกลุ่ม'], ['cal', '🗓 ปฏิทิน'], ['grade', '✅ ตรวจงาน'], ['map', '🗺 แผนที่'], ['listen', '🎧 ห้องฟัง'], ['scores', '📤 คะแนน/ส่งออก'], ['backup', '⚙ ตั้งค่า/สำรอง']];
  function badge() { if (B.mode === 'demo') return ['off', '🧪 โหมดสาธิต']; if (STATUS.failed) return ['err', '⚠ ส่งไม่สำเร็จ ' + STATUS.failed]; if (!STATUS.online) return ['pend', '📴 ออฟไลน์']; if (STATUS.pending) return ['pend', '⏫ ' + STATUS.pending]; return ['ok', '☁️ ซิงก์แล้ว']; }
  function shell(inner) {
    const [bc, bt] = badge(); const prop = Object.values(D.calendar || {}).filter(e => e.status === 'proposed').length;
    return '<header class="topbar"><img class="logo" src="icons/logo-mark-512.png" alt=""><h1>แผงควบคุมครู · ' + esc(C.appName) + '</h1>' + (USER ? (() => { const n = tNotifs().length; return '<button class="sync' + (n ? ' pend' : '') + '" data-tbell>🔔 ' + n + '</button>'; })() : '') + '<a class="sync" href="index.html#/hub">🏠 ศูนย์กลาง</a><a class="sync" href="index.html#/hub/groups">👀 มุมมองนักเรียน</a><span class="sync ' + bc + '">' + bt + '</span>' + (USER ? '<span class="muted" style="color:#ddd6fe">' + esc(USER.email) + '</span><button class="sync" data-act="logout">ออก</button>' : '') + '</header>' +
      (B.mode === 'demo' ? '<div class="demo-strip">🧪 โหมดทดลอง (ข้อมูลสาธิต ไม่กระทบข้อมูลจริง)' + (B.realConfigured() ? ' · <a href="teacher.html?demo=0">กลับไปข้อมูลจริง</a>' : '') + '</div>' : '') +
      '<div class="t-wrap"><div class="seg ttabs">' + TABS.map(t => '<button data-tab="' + t[0] + '" class="' + (V.tab === t[0] ? 'on' : '') + '">' + t[1] + (t[0] === 'cal' && prop ? ' <b class="tag gold">' + prop + '</b>' : '') + '</button>').join('') + '</div>' + inner + M.copyrightHTML() + '</div>';
  }
  const roomSel = (id, withAll) => '<select id="' + id + '">' + (withAll ? '<option value="">ทุกห้อง</option>' : '') + rooms().map(r => '<option value="' + r + '"' + (V.room === r ? ' selected' : '') + '>ม.' + r + ' (' + rosterOf(r).length + ' คน)</option>').join('') + '</select>';

  /* ---------- ภาพรวม ---------- */
  function viewDash() {
    needRecords();
    const gs = groupsOf(V.room); const prop = Object.keys(D.calendar).map(id => Object.assign({ id }, D.calendar[id])).filter(e => e.status === 'proposed');
    const nStu = rosterOf(V.room).length, nIn = rosterOf(V.room).filter(s => D.memberOf[s.sid]).length;
    const rows = gs.map(g => {
      const G = { records: (D.records || {})[g.gid] || {}, docs: {} }; const ms = memList(g); const gg = ((D.grades.groups || {})[g.gid] || {}).tasks || {};
      let last = 0; Object.values(G.records).forEach(k => Object.values(k || {}).forEach(r => last = Math.max(last, r.updatedAt || 0)));
      return '<tr><td class="l"><a href="#" data-opengroup="' + g.gid + '">' + esc(g.name) + '</a></td><td>' + ms.length + (ms.length < C.group.min || ms.length > C.group.max ? ' ⚠' : '') + '</td>' +
        C.tasks.filter(t => t.scope === 'group').map(t => { const p = M.LIST_KINDS.includes(t.kind) ? M.listOf(G, t.kind).length : null; const fl = g.flags && g.flags[t.id]; const sc = gg[t.id] && gg[t.id].s != null; return '<td>' + (p != null ? p + '/' + t.min : '') + (fl ? ' <span class="flagdot" title="นักเรียนแจ้งว่าเสร็จ">●</span>' : '') + (sc ? ' <b style="color:var(--g700)">' + gg[t.id].s + '</b>' : '') + '</td>'; }).join('') +
        '<td class="muted">' + (last ? esc(ago(last)) : '-') + '</td></tr>';
    }).join('');
    return shell('<div class="toolbar"><div class="f"><label>ห้อง</label>' + roomSel('v_room') + '</div><div class="grow"></div></div>' +
      '<div class="stats"><div class="stat"><b>' + nStu + '</b><span>นักเรียนในรายชื่อ</span></div><div class="stat"><b>' + gs.length + '</b><span>กลุ่ม</span></div><div class="stat"><b>' + nIn + '/' + nStu + '</b><span>อยู่ในกลุ่มแล้ว</span></div><div class="stat gold"><b>' + prop.length + '</b><span>คำขอลงพื้นที่รออนุมัติ</span></div></div>' +
      (prop.length ? '<div class="card gold"><div class="card-title">🗓 คำขอลงพื้นที่รออนุมัติ</div>' + prop.map(e => M.eventCard(e, D.groups, { actions: evActions })).join('') + '</div>' : '') +
      '<div class="card"><div class="card-title">ความคืบหน้าของกลุ่ม ม.' + esc(V.room) + '</div>' + (gs.length ? '<div class="tbl-box"><table class="t"><tr><th class="l">กลุ่ม</th><th>คน</th>' + C.tasks.filter(t => t.scope === 'group').map(t => '<th>' + t.icon + ' ' + esc(t.name.split(' ')[0]) + '</th>').join('') + '<th>อัปเดต</th></tr>' + rows + '</table></div><div class="hint" style="margin-top:6px">ตัวเลข = รายการที่ทำ/ขั้นต่ำ · ● = นักเรียนแจ้งว่าเสร็จ · ตัวเลขสีทอง = คะแนนกลุ่มที่ให้แล้ว · คลิกชื่อกลุ่มเพื่อตรวจ</div>' : '<div class="empty">ยังไม่มีกลุ่มในห้องนี้ — ไปที่แท็บ “รายชื่อ & จัดกลุ่ม”</div>') + '</div>');
  }

  /* ---------- รายชื่อ & จัดกลุ่ม ---------- */
  function viewGroups() {
    const stu = rosterOf(V.room), gs = groupsOf(V.room); const free = stu.filter(s => !D.memberOf[s.sid] || !D.groups[D.memberOf[s.sid]]);
    const selN = V.sel.size;
    const chips = free.map(s => '<button class="schip' + (V.sel.has(s.sid) ? ' on' : '') + '" data-pick="' + s.sid + '"><b>' + esc(s.no) + '</b> ' + esc(s.name) + '</button>').join('');
    const cards = gs.map(g => { const ms = memList(g); const warn = ms.length < C.group.min ? 'สมาชิกน้อยกว่า ' + C.group.min + ' คน' : ms.length > C.group.max ? 'สมาชิกเกิน ' + C.group.max + ' คน' : '';
      return '<div class="gcard"><div class="row"><b class="grow">' + esc(g.name) + '</b><button class="btn xs ghost" data-act="rename" data-id="' + g.gid + '">✎</button><button class="btn xs bad" data-act="delgroup" data-id="' + g.gid + '">ลบกลุ่ม</button></div>' +
        (warn ? '<div class="hint" style="color:var(--warn)">⚠ ' + warn + '</div>' : '') +
        ms.map(m => '<div class="mem">' + avatar(m.name, 'sm') + '<div class="grow">' + esc(m.no) + '. ' + esc(m.name) + '<div class="rolechips">' + m.roles.map(r => { const x = roleById(r); return x ? '<span class="tag">' + x.icon + ' ' + esc(x.name) + '</span>' : ''; }).join('') + '</div></div><button class="btn xs ghost" data-act="unmember" data-gid="' + g.gid + '" data-sid="' + m.sid + '" title="นำออกจากกลุ่ม">✕</button></div>').join('') +
        (selN ? '<button class="btn sm gold block" style="margin-top:8px" data-act="addto" data-id="' + g.gid + '">＋ เพิ่มที่เลือก ' + selN + ' คนเข้ากลุ่มนี้</button>' : '') + '</div>'; }).join('');
    return shell('<div class="toolbar"><div class="f"><label>ห้อง</label>' + roomSel('v_room') + '</div><button class="btn" data-act="import">📥 นำเข้ารายชื่อนักเรียน</button><div class="grow"></div><span class="muted">อีเมลนักเรียน = รหัส@' + esc(C.auth.domain) + '</span></div>' +
      '<div class="gl"><div class="card"><div class="card-title">ยังไม่มีกลุ่ม (' + free.length + ' คน) <span class="muted">— คลิกเลือกนักเรียน</span></div><div class="schips">' + (chips || '<span class="muted">' + (stu.length ? 'ทุกคนมีกลุ่มแล้ว ✓' : 'ยังไม่มีรายชื่อห้องนี้ กด “นำเข้ารายชื่อนักเรียน”') + '</span>') + '</div>' +
      '<div class="row wrap" style="margin-top:10px"><button class="btn gold" data-act="newgroup"' + (selN ? '' : ' disabled') + '>＋ สร้างกลุ่มใหม่จากที่เลือก (' + selN + ')</button>' + (selN ? '<button class="btn sm ghost" data-act="clearsel">ล้างที่เลือก</button>' : '') + '<button class="btn sm sec" data-act="autogroup"' + (free.length ? '' : ' disabled') + '>🎲 จัดกลุ่มอัตโนมัติ (คนที่เหลือ)</button></div>' +
      '<div class="hint" style="margin-top:6px">กลุ่มละ ' + C.group.min + '–' + C.group.max + ' คน · นำนักเรียนออกจากกลุ่มได้ด้วย ✕ (ข้อมูลที่บันทึกแล้วยังอยู่กับกลุ่ม)</div></div>' +
      '<div><div class="card-title" style="margin:4px">กลุ่มของ ม.' + esc(V.room) + ' (' + gs.length + ')</div><div class="gcards">' + (cards || '<div class="empty">ยังไม่มีกลุ่ม</div>') + '</div></div></div>');
  }
  function mkGid(room) { return 'g' + room.replace('/', '-') + '-' + B.uid().slice(-6); }
  function createGroup(name, sids) {
    const gid = mkGid(V.room); const members = {}; sids.forEach(s => { const r = D.roster[s]; members[s] = { name: r.name, no: r.no }; });
    const upd = { ['groups/' + gid]: { name, room: V.room, createdAt: Date.now(), members } }; sids.forEach(s => { upd['memberOf/' + s] = gid; const old = D.memberOf[s]; if (old && old !== gid && D.groups[old]) { upd['groups/' + old + '/members/' + s] = null; upd['groups/' + old + '/roles/' + s] = null; } });
    W(B.update('', upd)); return gid;
  }
  function addToGroup(gid, sids) {
    const upd = {}; sids.forEach(s => { const r = D.roster[s]; upd['groups/' + gid + '/members/' + s] = { name: r.name, no: r.no }; upd['memberOf/' + s] = gid; const old = D.memberOf[s]; if (old && old !== gid && D.groups[old]) { upd['groups/' + old + '/members/' + s] = null; upd['groups/' + old + '/roles/' + s] = null; } });
    W(B.update('', upd));
  }

  /* ---------- จัดการรายชื่อ (เพิ่ม/แก้/ย้ายห้อง/ออก/ลากเรียงเลขที่) — ครูเท่านั้น ---------- */
  function viewRoster() {
    const all = rosterAll(V.room), act = all.filter(s => !s.left), left = all.filter(s => s.left);
    const grpName = sid => { const g = D.groups[D.memberOf[sid]]; return g ? g.name : ''; };
    const row = (s, i) => '<div class="rrow" data-sid="' + esc(s.sid) + '"><span class="dh" title="ลากเพื่อจัดลำดับ" aria-label="ลาก">⠿</span><b class="rno">' + (i + 1) + '</b><div class="grow"><div class="rec-t">' + esc(s.name) + '</div><div class="rec-s">' + esc(s.sid) + '@' + esc(C.auth.domain) + (grpName(s.sid) ? ' · 👥 ' + esc(grpName(s.sid)) : ' · <span style="color:var(--warn)">ยังไม่มีกลุ่ม</span>') + ((+s.no) !== i + 1 ? ' · <span style="color:var(--warn)">เลขที่เดิม ' + esc(s.no || '-') + '</span>' : '') + '</div></div>' +
      '<button class="btn xs ghost" data-act="rmove" data-d="-1" title="เลื่อนขึ้น">▲</button><button class="btn xs ghost" data-act="rmove" data-d="1" title="เลื่อนลง">▼</button><button class="btn xs sec" data-act="redit">✎ แก้ไข</button><button class="btn xs bad" data-act="rleave">🚪 ออก</button></div>';
    const unsynced = act.some((s, i) => (+s.no) !== i + 1);
    return shell('<div class="toolbar"><div class="f"><label>ห้อง</label>' + roomSel('v_room') + '</div><button class="btn gold" data-act="radd">＋ เพิ่มนักเรียน</button><button class="btn sec" data-act="import">📥 นำเข้าจากไฟล์/วาง</button><div class="grow"></div>' +
      '<div class="row wrap"><span class="muted">เรียงใหม่ทั้งห้อง:</span><button class="btn xs sec" data-act="rsort" data-by="sid">ตามรหัส</button><button class="btn xs sec" data-act="rsort" data-by="name">ตามชื่อ</button></div></div>' +
      '<div class="card"><div class="row"><div class="card-title grow">🧾 รายชื่อ ม.' + esc(V.room) + ' · ' + act.length + ' คน</div>' + (unsynced ? '<button class="btn sm gold" data-act="rrenum">บันทึกเลขที่ 1–' + act.length + ' ตามลำดับนี้</button>' : '') + '</div>' +
      '<div class="hint" style="margin-bottom:8px">ลาก ⠿ (หรือกด ▲▼) เพื่อจัดลำดับ ระบบบันทึกเลขที่ใหม่ให้ทันที · การเปลี่ยนเลขที่ไม่กระทบงานที่นักเรียนบันทึกไว้ · เฉพาะครูเท่านั้นที่แก้รายชื่อได้</div>' +
      (act.length ? '<div id="rlist">' + act.map(row).join('') + '</div>' : '<div class="empty">ยังไม่มีรายชื่อห้องนี้ — กด “เพิ่มนักเรียน” หรือ “นำเข้า”</div>') + '</div>' +
      (left.length ? '<details class="card"><summary>🚪 นักเรียนที่ออก/ย้ายไปแล้ว (' + left.length + ')</summary>' + left.map(s => '<div class="row" style="padding:6px 0;border-bottom:1px dashed var(--line)"><span class="grow">' + esc(s.sid) + ' · ' + esc(s.name) + ' <span class="muted">ออกเมื่อ ' + esc(thDateTime(s.leftAt)) + (s.leftNote ? ' · ' + esc(s.leftNote) : '') + '</span></span><button class="btn xs gold" data-act="rback" data-sid="' + esc(s.sid) + '">↩ คืนสถานะ</button></div>').join('') + '<div class="hint" style="margin-top:6px">นักเรียนที่ออกแล้วล็อกอินไม่ได้ และไม่อยู่ในไฟล์ส่งออกคะแนน แต่งานที่เคยบันทึกยังเก็บอยู่กับกลุ่ม</div></details>' : ''));
  }
  function saveOrder(sids) {
    const upd = {}; sids.forEach((sid, i) => { const r = D.roster[sid]; if (!r || +r.no === i + 1) return; upd['roster/' + sid + '/no'] = i + 1; r.no = i + 1; const gid = D.memberOf[sid]; if (gid && D.groups[gid] && D.groups[gid].members && D.groups[gid].members[sid]) upd['groups/' + gid + '/members/' + sid + '/no'] = i + 1; });
    if (Object.keys(upd).length) { W(B.update('', upd)); toast('บันทึกเลขที่ใหม่แล้ว'); }
  }
  const listOrder = () => $$('#rlist .rrow').map(r => r.dataset.sid);
  function initDrag() {
    const list = $('#rlist'); if (!list) return; let drag = null, sy = 0;
    list.addEventListener('pointerdown', e => { const h = e.target.closest('.dh'); if (!h) return; e.preventDefault(); drag = h.closest('.rrow'); drag.classList.add('dragging'); DRAGGING = true; h.setPointerCapture(e.pointerId); });
    list.addEventListener('pointermove', e => {
      if (!drag) return; const y = e.clientY; let before = null;
      for (const r of $$('.rrow', list)) { if (r === drag) continue; const b = r.getBoundingClientRect(); if (y < b.top + b.height / 2) { before = r; break; } }
      if (before !== drag.nextSibling) list.insertBefore(drag, before);
      if (y < 90) window.scrollBy(0, -12); else if (y > window.innerHeight - 60) window.scrollBy(0, 12);
      $$('.rrow .rno', list).forEach((n, i) => n.textContent = i + 1);
    });
    const end = () => { if (!drag) return; drag.classList.remove('dragging'); drag = null; DRAGGING = false; saveOrder(listOrder()); render(true); };
    list.addEventListener('pointerup', end); list.addEventListener('pointercancel', end);
  }
  function studentModal(sid) {
    const s = sid ? Object.assign({ sid }, D.roster[sid]) : { sid: '', name: '', room: V.room, no: rosterOf(V.room).length + 1 };
    const w = modal('<h3>' + (sid ? '✎ แก้ไขข้อมูลนักเรียน' : '＋ เพิ่มนักเรียน') + '</h3>' +
      '<div class="f"><label>รหัสนักเรียน</label><input type="text" inputmode="numeric" id="s_sid" value="' + esc(s.sid) + '"' + (sid ? ' disabled' : '') + '><div class="hint">อีเมลที่ใช้ล็อกอิน: <b id="s_mail">' + esc((s.sid || 'รหัส') + '@' + C.auth.domain) + '</b>' + (sid ? ' (เปลี่ยนรหัสไม่ได้ ถ้ากรอกผิดให้กด “ออก” แล้วเพิ่มใหม่)' : '') + '</div></div>' +
      '<div class="f"><label>ชื่อ-นามสกุล (มีคำนำหน้า)</label><input type="text" id="s_name" value="' + esc(s.name) + '"></div>' +
      '<div class="row"><div class="f grow"><label>ห้อง</label><select id="s_room">' + rooms().map(r => '<option value="' + r + '"' + (r === s.room ? ' selected' : '') + '>ม.' + r + '</option>').join('') + '</select></div><div class="f grow"><label>เลขที่</label><input type="number" id="s_no" value="' + esc(s.no) + '" min="1"></div></div>' +
      (sid && D.memberOf[sid] ? '<div class="hint" style="margin-bottom:10px">ถ้าย้ายห้อง นักเรียนจะถูกนำออกจากกลุ่มเดิม (งานที่บันทึกยังอยู่กับกลุ่ม)</div>' : '') +
      '<button class="btn gold block" id="s_ok">บันทึก</button>', { center: true });
    const sidIn = $('#s_sid', w); sidIn.oninput = () => { $('#s_mail', w).textContent = (sidIn.value.trim() || 'รหัส') + '@' + C.auth.domain; };
    $('#s_ok', w).onclick = () => {
      const nsid = sid || sidIn.value.trim(), name = $('#s_name', w).value.trim(), room = $('#s_room', w).value, no = +$('#s_no', w).value || '';
      if (!new RegExp(C.auth.sidPattern).test(nsid)) { toast('รหัสนักเรียนต้องเป็นตัวเลข 4–8 หลัก'); return; }
      if (!name) { toast('กรอกชื่อ'); return; }
      if (!sid && D.roster[nsid] && !D.roster[nsid].left) { toast('มีรหัส ' + nsid + ' ในระบบแล้ว (ม.' + D.roster[nsid].room + ')', 3500); return; }
      const upd = { ['roster/' + nsid]: { name, room, no } }; const gid = D.memberOf[nsid];
      if (gid && D.groups[gid]) { if (D.groups[gid].room !== room) { upd['groups/' + gid + '/members/' + nsid] = null; upd['groups/' + gid + '/roles/' + nsid] = null; upd['memberOf/' + nsid] = null; } else upd['groups/' + gid + '/members/' + nsid] = { name, no }; }
      W(B.update('', upd)); w.remove(); toast(sid ? 'บันทึกแล้ว' : 'เพิ่ม ' + name + ' แล้ว');
    };
  }

  /* ---------- นำเข้ารายชื่อ ---------- */
  const normRoom = s => { const m = /(\d)\s*\/\s*(\d{1,2})/.exec(String(s || '')); return m ? m[1] + '/' + (+m[2]) : ''; };
  function parseTable(rows, defRoom) {
    rows = rows.map(r => r.map(c => String(c == null ? '' : c).trim())).filter(r => r.some(Boolean));
    if (!rows.length) return [];
    const h = rows[0].map(x => x.replace(/\s/g, ''));
    const find = re => h.findIndex(x => re.test(x));
    let iS = find(/รหัส|เลขประจำตัว|studentid|^id$/i), iN = find(/^เลขที่|^no\.?$/i), iR = find(/ห้อง|ชั้น|room|class/i), iP = find(/คำนำหน้า|prefix/i), iF = find(/^ชื่อ$|^firstname|^ชื่อจริง/i), iL = find(/นามสกุล|lastname|surname/i), iFull = find(/ชื่อ-?สกุล|ชื่อ-?นามสกุล|fullname|^name$/i);
    let body = rows.slice(1);
    if (iS < 0) { // ไม่มีหัวตาราง → เดาจากข้อมูล
      body = rows; const r0 = rows[0];
      iS = r0.findIndex(c => /^\d{4,8}$/.test(c)); iN = r0.findIndex((c, i) => i !== iS && /^\d{1,2}$/.test(c)); iFull = r0.findIndex(c => /[ก-๙]/.test(c) && !/^\d/.test(c) && !normRoom(c)); iR = r0.findIndex(c => /^ม?\.?\s*\d\s*\/\s*\d{1,2}$/.test(c));
      if (iFull >= 0) { const nxt = r0[iFull + 1]; if (nxt && /[ก-๙]/.test(nxt) && iFull + 1 !== iR) { iF = iFull; iL = iFull + 1; iFull = -1; } }
    }
    const out = [];
    body.forEach(r => {
      const raw = (r[iS] || '').trim(); if (/[^\d\s-]/.test(raw)) return; const sid = raw.replace(/\D/g, ''); if (!new RegExp(C.auth.sidPattern).test(sid)) return;
      let name = iFull >= 0 ? r[iFull] : [iP >= 0 ? r[iP] : '', iF >= 0 ? r[iF] : '', iL >= 0 ? r[iL] : ''].filter(Boolean).join(' ').replace(/^(นาย|นางสาว|นาง|เด็กชาย|เด็กหญิง)\s+/, '$1');
      if (iP >= 0 && iF >= 0) name = (r[iP] || '') + (r[iF] || '') + (iL >= 0 ? ' ' + r[iL] : '');
      out.push({ sid, no: iN >= 0 ? (+r[iN] || '') : '', name: name.trim(), room: (iR >= 0 && normRoom(r[iR])) || defRoom });
    });
    return out;
  }
  function parseCSV(text) {
    const sep = text.indexOf('\t') >= 0 ? '\t' : ','; const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) { const ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch; }
    if (cur || row.length) { row.push(cur); rows.push(row); } return rows;
  }
  function importModal() {
    const w = modal('<h3>📥 นำเข้ารายชื่อนักเรียน</h3><div class="muted" style="margin-bottom:8px">คัดลอกตารางจาก Excel / Teacher OS / istudent มาวาง หรือเลือกไฟล์ .csv/.xlsx — ต้องมีอย่างน้อย <b>รหัสนักเรียน</b> และ <b>ชื่อ</b> (เลขที่/ห้อง ถ้ามี)</div>' +
      '<div class="row wrap"><div class="f grow"><label>ห้อง (ใช้เมื่อไฟล์ไม่มีคอลัมน์ห้อง)</label>' + roomSel('im_room') + '</div><div class="f grow"><label>หรือเลือกไฟล์</label><input type="file" id="im_file" accept=".csv,.txt,.xlsx,.xls"></div></div>' +
      '<div class="f"><label>วางตารางที่นี่</label><textarea id="im_text" rows="7" placeholder="เลขที่\tรหัสนักเรียน\tชื่อ-นามสกุล\n1\t30101\tนายกิตติ พรมมา"></textarea></div><div id="im_prev"></div><div class="row"><button class="btn sec" id="im_parse">ตรวจสอบ</button><button class="btn gold grow" id="im_save" disabled>บันทึกรายชื่อ</button></div>', { center: true, wide: true });
    let parsed = [];
    const show = () => { $('#im_prev', w).innerHTML = parsed.length ? '<div class="tbl-box" style="max-height:260px;margin-bottom:10px"><table class="t"><tr><th>เลขที่</th><th class="l">รหัส</th><th class="l">ชื่อ</th><th>ห้อง</th><th class="l">อีเมลที่ใช้ล็อกอิน</th></tr>' + parsed.map(p => '<tr><td>' + esc(p.no) + '</td><td class="l">' + esc(p.sid) + '</td><td class="l">' + esc(p.name) + '</td><td>' + esc(p.room) + '</td><td class="l muted">' + esc(p.sid + '@' + C.auth.domain) + '</td></tr>').join('') + '</table></div>' : '<div class="warn-box">อ่านรายชื่อไม่ได้ ตรวจว่ามีรหัสนักเรียน 4–8 หลัก</div>'; $('#im_save', w).disabled = !parsed.length; $('#im_save', w).textContent = 'บันทึกรายชื่อ ' + parsed.length + ' คน'; };
    $('#im_parse', w).onclick = () => { parsed = parseTable(parseCSV($('#im_text', w).value), $('#im_room', w).value); show(); };
    $('#im_file', w).onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { if (/\.xlsx?$/i.test(f.name)) { await M.loadLibs('xlsx'); const wb = XLSX.read(await f.arrayBuffer()); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false }); parsed = parseTable(rows, $('#im_room', w).value); } else { parsed = parseTable(parseCSV(await f.text()), $('#im_room', w).value); } show(); }
      catch (er) { toast('อ่านไฟล์ไม่สำเร็จ: ' + er.message, 4000); }
    };
    $('#im_save', w).onclick = () => { const upd = {}; const nx = {}; parsed.forEach(p => { if (!p.no) { if (nx[p.room] == null) nx[p.room] = rosterOf(p.room).reduce((m, s) => Math.max(m, +s.no || 0), 0); p.no = ++nx[p.room]; } }); parsed.forEach(p => { upd['roster/' + p.sid] = { name: p.name, no: p.no, room: p.room }; }); W(B.update('', upd)); w.remove(); toast('บันทึกรายชื่อ ' + parsed.length + ' คนแล้ว'); if (parsed[0]) { V.room = parsed[0].room; render(); } };
  }

  /* ---------- ปฏิทิน ---------- */
  const evActions = e => (e.status === 'proposed' ? '<button class="btn xs gold" data-act="evapprove" data-id="' + esc(e.id) + '">✓ อนุมัติ</button>' : '') + '<button class="btn xs sec" data-act="evedit" data-id="' + esc(e.id) + '">✎ แก้ไข</button><button class="btn xs sec" data-act="evics" data-id="' + esc(e.id) + '">📲 .ics</button>' + (CONSENT.needsConsent(e) ? (() => { const st = evStudents(e); let a = 0, d = 0; st.forEach(s => { const c = cRec(s.sid, e.id); if (c && c.decision === 'allow') a++; else if (c && c.decision === 'deny') d++; }); return '<button class="btn xs gold" data-act="evconsent" data-id="' + esc(e.id) + '">📝 ใบอนุญาตผู้ปกครอง ✅' + a + ' ❌' + d + ' ⏳' + (st.length - a - d) + '</button>'; })() : '');
  function viewCal() {
    const evs = Object.keys(D.calendar).map(id => Object.assign({ id }, D.calendar[id])).sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
    const day = evs.filter(e => e.date === V.cal.sel), up = evs.filter(e => e.date >= today() && e.status !== 'cancelled');
    return shell('<div class="cal-l"><div>' + M.monthGrid(V.cal.y, V.cal.m, evs, V.cal.sel) + '<button class="btn gold block" data-act="evnew">＋ เพิ่มนัดลงพื้นที่</button><h3 style="margin:14px 4px 8px">' + esc(thDate(V.cal.sel, true)) + '</h3>' + (day.length ? day.map(e => M.eventCard(e, D.groups, { actions: evActions })).join('') : '<div class="muted">ไม่มีนัด</div>') + '</div>' +
      '<div><div class="card-title" style="margin:4px">นัดที่กำลังจะมาถึง</div>' + (up.length ? up.map(e => M.eventCard(e, D.groups, { actions: evActions })).join('') : '<div class="empty">ยังไม่มีนัด</div>') + '</div></div>');
  }
  function eventModal(id) {
    const e = id ? Object.assign({ id }, D.calendar[id]) : { title: 'ลงพื้นที่ศึกษาดนตรี', date: V.cal.sel, start: '08:30', end: '12:00', community: 'karen', groups: {}, teacherJoin: true, status: 'approved', room: V.room };
    const gs = groupsOf(e.room || V.room);
    const w = modal('<h3>' + (id ? '✎ แก้ไขนัด' : '＋ นัดลงพื้นที่ใหม่') + '</h3><div class="f"><label>หัวข้อ</label><input type="text" id="e_t" value="' + esc(e.title) + '"></div>' +
      '<div class="row wrap"><div class="f grow"><label>วันที่</label><input type="date" id="e_d" value="' + esc(e.date) + '"></div><div class="f"><label>เริ่ม</label><input type="time" id="e_s" value="' + esc(e.start) + '"></div><div class="f"><label>ถึง</label><input type="time" id="e_e" value="' + esc(e.end) + '"></div></div>' +
      '<div class="row wrap"><div class="f grow"><label>ชุมชน</label><select id="e_c" onchange="document.getElementById(\'e_cow\').hidden=this.value!==\'other\'">' + C.communities.map(c => '<option value="' + c.id + '"' + (c.id === e.community ? ' selected' : '') + '>' + c.emoji + ' ' + esc(c.name) + '</option>').join('') + '</select></div><div class="f grow" id="e_cow"' + (e.community === 'other' ? '' : ' hidden') + '><label>➕ ระบุชื่อกลุ่มดนตรี/ชุมชน</label><input type="text" id="e_co" list="dl-oc" value="' + esc(e.communityOther || '') + '"><datalist id="dl-oc">' + (C.otherSuggestions || []).map(x => '<option value="' + esc(x) + '">').join('') + '</datalist></div><div class="f grow"><label>สถานะ</label><select id="e_st">' + Object.keys(M.EV_STATUS).map(k => '<option value="' + k + '"' + (k === e.status ? ' selected' : '') + '>' + M.EV_STATUS[k][0] + '</option>').join('') + '</select></div></div>' +
      '<div class="f"><label>สถานที่</label><input type="text" id="e_p" value="' + esc(e.place || '') + '"></div><div class="f"><label>จุดนัดพบ/การเดินทาง</label><input type="text" id="e_m" value="' + esc(e.meet || '') + '"></div>' +
      '<label class="chk" style="margin-bottom:12px"><input type="checkbox" id="e_tj"' + (e.teacherJoin ? ' checked' : '') + '><span>👩‍🏫 ครูร่วมลงพื้นที่ด้วย</span></label>' +
      '<div class="f"><label>กลุ่มที่ไป (ไม่เลือก = ทุกกลุ่มของห้อง ม.' + esc(e.room || V.room) + ')</label><div class="schips">' + gs.map(g => '<label class="schip' + (e.groups && e.groups[g.gid] ? ' on' : '') + '"><input type="checkbox" hidden value="' + g.gid + '"' + (e.groups && e.groups[g.gid] ? ' checked' : '') + '>' + esc(g.name) + '</label>').join('') + '</div></div>' +
      '<div class="f"><label>หมายเหตุ</label><textarea id="e_n" rows="3">' + esc(e.note || '') + '</textarea></div><div class="row"><button class="btn gold grow" id="e_ok">บันทึก</button>' + (id ? '<button class="btn bad" id="e_del">ลบนัด</button>' : '') + '</div>', { center: true });
    w.addEventListener('change', ev => { const l = ev.target.closest('.schip'); if (l) l.classList.toggle('on', ev.target.checked); });
    $('#e_ok', w).onclick = () => {
      const groups = {}; $$('.schip input:checked', w).forEach(i => groups[i.value] = true);
      const ne = Object.assign({}, e, { title: $('#e_t', w).value, date: $('#e_d', w).value, start: $('#e_s', w).value, end: $('#e_e', w).value, community: $('#e_c', w).value, communityOther: $('#e_c', w).value === 'other' ? $('#e_co', w).value.trim() : null, status: $('#e_st', w).value, place: $('#e_p', w).value, meet: $('#e_m', w).value, teacherJoin: $('#e_tj', w).checked, note: $('#e_n', w).value, groups: Object.keys(groups).length ? groups : null, room: e.room || V.room, updatedAt: Date.now(), updatedBy: tMe() });
      delete ne.id; if (!ne.createdAt) { ne.createdAt = Date.now(); ne.createdBy = tMe(); }
      const eid2 = id || B.uid(); W(B.set('calendar/' + eid2, ne)); w.remove(); toast('บันทึกนัดแล้ว'); syncTokens(eid2, ne);
    };
    if (id) $('#e_del', w).onclick = () => { if (confirm('ลบนัดนี้?')) { W(B.remove('calendar/' + id)); w.remove(); } };
  }

  /* ---------- ตรวจงาน ---------- */
  function mediaFor(gid) { return MEDIA[gid] || (MEDIA[gid] = {}); }
  async function loadMedia(gid, recs) {
    const mm = mediaFor(gid); const ids = []; recs.forEach(r => M.mediaIds(r).forEach(id => { if (!mm[id] && !TRIED.has(gid + id)) { ids.push(id); TRIED.add(gid + id); } }));
    if (!ids.length) return; await Promise.all(ids.map(async id => { const m = await B.getMedia(gid, id); if (m) mm[id] = m; })); render(true);
  }
  const modeSw = () => '<div class="seg" style="max-width:520px;margin-bottom:10px"><button data-gmode="group" class="' + (V.gmode !== 'task' ? 'on' : '') + '">👥 ตรวจทีละกลุ่ม</button><button data-gmode="task" class="' + (V.gmode === 'task' ? 'on' : '') + '">⚡ ตรวจทีละงานทั้งห้อง</button></div>';
  function tcBox(gid, rid, kind) { const c = ((D.tc || {})[gid] || {})[rid]; return '<div class="tcbox"><label>💬 คอมเมนต์ถึงกลุ่ม (นักเรียนเห็นทันที)' + (c ? ' <span class="muted">· ' + esc(thDateTime(c.at)) + '</span>' : '') + '</label><textarea class="tc" rows="2" data-gid="' + esc(gid) + '" data-rid="' + esc(rid) + '" data-kind="' + esc(kind) + '" placeholder="เช่น ดีมาก เพิ่มรายละเอียดจังหวะอีกนิด">' + esc(c ? c.text : '') + '</textarea></div>'; }
  function tNotifs() {
    const out = []; let seen = 0; try { seen = +localStorage.getItem('mcm5_t_seen') || 0; } catch (e) { /* ignore */ }
    Object.keys(D.calendar || {}).forEach(id => { const e = D.calendar[id]; if (e.status === 'proposed') out.push({ ic: '🗓', t: 'คำขอลงพื้นที่: ' + e.title + ' (' + thDate(e.date) + ')', tab: 'cal', at: e.createdAt }); });
    Object.keys(D.groups || {}).forEach(gid => { const g = D.groups[gid]; const gg = ((D.grades.groups || {})[gid] || {}).tasks || {};
      Object.keys(g.flags || {}).forEach(tid => { const f = g.flags[tid]; if (f && !(gg[tid] && gg[tid].s != null) && taskById(tid)) out.push({ ic: '✋', t: g.name + ' (ม.' + g.room + ') แจ้งว่า “' + taskById(tid).name + '” เสร็จแล้ว — รอตรวจ', gid, tid, at: f.at }); }); });
    Object.keys(D.consents || {}).forEach(sid => Object.keys(D.consents[sid] || {}).forEach(eid => { const c = cRec(sid, eid), e = D.calendar[eid]; if (c && e && c.decision === 'deny' && (c.at || 0) > seen && c.method !== 'paper') out.push({ ic: '🚫', t: ((D.roster[sid] || {}).name || sid) + ' — ผู้ปกครองไม่อนุญาตลงพื้นที่ “' + e.title + '”' + (c.reason ? ' (' + c.reason + ')' : ''), tab: 'cal', at: c.at }); }));
    if (D.records) Object.keys(D.records).forEach(gid => { let n = 0, last = 0; Object.values(D.records[gid] || {}).forEach(k => Object.values(k || {}).forEach(r => { if ((r.updatedAt || 0) > seen) { n++; last = Math.max(last, r.updatedAt); } })); if (n && D.groups[gid]) out.push({ ic: '📝', t: D.groups[gid].name + ' (ม.' + D.groups[gid].room + ') บันทึก/แก้ไขใหม่ ' + n + ' รายการ', gid, at: last }); });
    return out.sort((a, b) => (b.at || 0) - (a.at || 0));
  }
  function teacherBell() {
    const list = tNotifs();
    modal('<h3>🔔 การแจ้งเตือน</h3>' + (list.length ? '<ul class="feed">' + list.map(n => '<li><span style="font-size:1.3rem">' + n.ic + '</span><div class="grow">' + esc(n.t) + '<div class="muted" style="font-size:.74rem">' + esc(ago(n.at)) + '</div></div>' + (n.tab ? '<button class="btn xs sec" data-tab="' + n.tab + '" data-close>ไปดู</button>' : '<button class="btn xs gold" data-opengroup="' + esc(n.gid) + '"' + (n.tid ? ' data-tid="' + n.tid + '"' : '') + ' data-close>ตรวจ</button>') + '</li>').join('') + '</ul>' : '<div class="empty">ไม่มีอะไรค้าง 🎉</div>') + '<button class="btn sec block" style="margin-top:10px" data-close>ปิด</button>', { center: true });
    try { localStorage.setItem('mcm5_t_seen', Date.now()); } catch (e) { /* ignore */ }
  }
  function mapPts() { needRecords(); const pts = []; groupsOf(V.room).forEach(g => EXTRAS.pointsFrom({ records: (D.records || {})[g.gid] || {} }, g.name).forEach(p => pts.push(p))); return pts; }
  function viewMapT() { const pts = mapPts(); return shell('<div class="toolbar"><div class="f"><label>ห้อง</label>' + roomSel('v_room') + '</div><div class="grow"></div></div><div class="card"><div class="card-title">🗺 แผนที่ดนตรีพหุวัฒนธรรมแม่สอด · ม.' + esc(V.room) + '</div><div class="muted">' + pts.length + ' จุดจากทุกกลุ่ม · ใช้เปิดบนจอในห้องเรียน/Gallery Walk ได้</div>' + EXTRAS.legendHTML(pts) + '<div id="mapEl" class="map-box tall"></div></div>'); }
  const LCACHE_T = {}; let LISTEN_T = [];
  async function viewListenT() {
    needRecords(); const cands = []; groupsOf(V.room).forEach(g => EXTRAS.audioCandidates({ records: (D.records || {})[g.gid] || {} }, g.gid, g.name).forEach(a => cands.push(a)));
    LISTEN_T = await EXTRAS.resolveAudio(cands, B.getMedia, LCACHE_T);
    return shell('<div class="toolbar"><div class="f"><label>ห้อง</label>' + roomSel('v_room') + '</div><div class="grow"></div><span class="muted">รวมเสียงจากทุกกลุ่ม · เหมาะสำหรับกิจกรรมหูทิพย์หน้าชั้น</span></div><div id="listenRoot">' + EXTRAS.listenHTML(LISTEN_T) + '</div>');
  }
  function needDocs() { if (D.docsAll) return; D.docsAll = {}; sub('docs', v => D.docsAll = v || {}); }
  function needPersonal() { if (D.personalAll) return; D.personalAll = true; sub('personal', v => { D.personal = v || {}; }); }
  function viewGradeTask() {
    needRecords(); needDocs(); needPersonal();
    const t = taskById(V.tid), kind = M.KIND_OF_TASK[V.tid], F = FORMS[kind], gs = groupsOf(V.room);
    const tabs = '<div class="tabs">' + C.tasks.map(x => '<button data-ttab="' + x.id + '" class="' + (x.id === V.tid ? 'on' : '') + '">' + x.icon + ' ' + esc(x.name.split(' ')[0]) + '</button>').join('') + '</div>';
    const head = '<div class="toolbar"><div class="f"><label>ห้อง</label>' + roomSel('v_room') + '</div><div class="grow"></div></div>' + modeSw() + tabs +
      '<div class="card"><b>' + t.icon + ' ' + esc(t.name) + '</b> <span class="muted">' + esc(t.indicator) + ' · เต็ม ' + maxOf(t) + ' · ' + (t.scope === 'group' ? gs.length + ' กลุ่ม' : 'รายบุคคล') + '</span><div class="hint">กดระดับ K-P-A ได้ทันที คะแนนคำนวณอัตโนมัติ · เปิด “ดูงาน” เพื่ออ่านรายละเอียดและคอมเมนต์รายรายการ</div></div>';
    if (t.scope === 'individual') {
      const stu = rosterOf(V.room); needPersonal();
      return shell(head + stu.map(s => { const p = D.personal[s.sid] || {}, rf = p.reflection || {}, sg = (D.grades.students || {})[s.sid] || {}, e = (sg.tasks && sg.tasks[t.id]) || {}; const g = D.groups[D.memberOf[s.sid]];
        return '<div class="card tcard"><div class="row"><b class="grow">' + esc(s.no) + '. ' + esc(s.name) + ' <span class="muted">' + esc(g ? g.name : 'ไม่มีกลุ่ม') + '</span></b>' + (p.flags && p.flags.t7 ? '<span class="tag st-ok">● ส่งแล้ว</span>' : (M.filled(rf) ? '<span class="tag">เขียนแล้ว</span>' : '<span class="tag st-cancel">ยังไม่เขียน</span>')) + '<span class="big-score sm">' + (e.s != null ? e.s : '–') + '</span></div>' +
          (M.filled(rf) ? '<details' + (V.open && V.open.has('s' + s.sid) ? ' open' : '') + ' data-det="s' + s.sid + '"><summary>อ่านสะท้อนคิด</summary>' + M.renderRecord('reflection', rf, {}, {}) + '</details>' : '') +
          '<div class="tgrid">' + t.criteria.map(c => rubricRow(c, e.r || {}, 'data-irub data-sid="' + s.sid + '"')).join('') + '</div><div class="row"><input type="number" step="0.5" class="is" data-sid="' + s.sid + '" value="' + (e.s != null ? e.s : '') + '" placeholder="คะแนน" style="width:110px"><textarea class="ic grow" rows="1" data-sid="' + s.sid + '" placeholder="ความเห็น">' + esc(e.c || '') + '</textarea></div></div>'; }).join(''));
    }
    return shell(head + (gs.length ? gs.map(g => {
      const gd = { records: (D.records || {})[g.gid] || {}, docs: (D.docsAll || {})[g.gid] || {} }; const e = (((D.grades.groups || {})[g.gid] || {}).tasks || {})[t.id] || {};
      const p = M.taskProgress(t, gd, null); const fl = g.flags && g.flags[t.id]; const media = mediaFor(g.gid); const isOpen = V.open && V.open.has(g.gid);
      let body = '';
      if (isOpen) {
        if (F.single) { const doc = gd.docs[kind] || {}; body = M.filled(doc) ? M.skipHTML(doc) + M.renderRecord(kind, doc, media, { showBy: true }) + tcBox(g.gid, kind, kind) : '<div class="muted">ยังไม่มีข้อมูล</div>'; }
        else { const list = M.listOf(gd, kind); body = list.length ? list.map((r, i) => { const s = F.summary(r); return '<div class="sub-rec"><div class="rec-t">' + (i + 1) + '. ' + esc(s.t) + '</div><div class="rec-s">' + esc(s.s) + '</div>' + M.metaHTML(r) + M.renderRecord(kind, r, media, {}) + tcBox(g.gid, r.id, kind) + '</div>'; }).join('') : '<div class="muted">ยังไม่มีรายการ</div>'; loadMedia(g.gid, list); }
      }
      return '<div class="card tcard"><div class="row"><b class="grow">' + esc(g.name) + ' <span class="muted">(' + Object.keys(g.members || {}).length + ' คน)</span></b>' + (fl ? '<span class="tag st-ok">● แจ้งเสร็จ</span>' : '') + (M.LIST_KINDS.includes(kind) ? '<span class="tag">' + p.n + '/' + p.min + ' รายการ</span>' : (p.done ? '<span class="tag">ครบ</span>' : '<span class="tag st-cancel">ยังไม่ครบ</span>')) + '<span class="big-score sm">' + (e.s != null ? e.s : '–') + '</span></div>' +
        '<details' + (isOpen ? ' open' : '') + ' data-det="' + g.gid + '"><summary>📖 ดูงาน</summary>' + body + '</details>' +
        '<div class="tgrid">' + t.criteria.map(c => rubricRow(c, e.r || {}, 'data-grub data-gid="' + g.gid + '"')).join('') + '</div><div class="row"><input type="number" step="0.5" class="gs" data-gid="' + g.gid + '" value="' + (e.s != null ? e.s : '') + '" placeholder="คะแนน" style="width:110px"><textarea class="gc grow" rows="1" data-gid="' + g.gid + '" placeholder="ความเห็นถึงกลุ่ม">' + esc(e.c || '') + '</textarea><button class="btn xs ghost" data-opengroup="' + g.gid + '">เปิดแบบละเอียด ›</button></div></div>';
    }).join('') : '<div class="empty">ยังไม่มีกลุ่มในห้องนี้</div>'));
  }
  function viewGrade() {
    if (V.gmode === 'task') return viewGradeTask();
    const gs = groupsOf(V.room); if (V.gid && (!D.groups[V.gid] || D.groups[V.gid].room !== V.room)) V.gid = null;
    if (!V.gid && gs[0]) openGroup(gs[0].gid);
    const left = '<div class="toolbar"><div class="f"><label>ห้อง</label>' + roomSel('v_room') + '</div><div class="f grow"><label>กลุ่ม</label><select id="v_gid">' + gs.map(g => '<option value="' + g.gid + '"' + (g.gid === V.gid ? ' selected' : '') + '>' + esc(g.name) + ' (' + memList(g).length + ' คน)</option>').join('') + '</select></div><button class="btn sec" data-act="prevg">‹</button><button class="btn sec" data-act="nextg">›</button></div>';
    if (!V.gid) return shell(left + modeSw() + '<div class="empty">ยังไม่มีกลุ่มในห้องนี้</div>');
    const g = Object.assign({ gid: V.gid }, D.groups[V.gid]), gd = D.gdata[V.gid] || { records: {}, docs: {}, history: {} }, ms = memList(g), sy = M.synth(gd, ms), t = taskById(V.tid);
    const gg = ((D.grades.groups || {})[V.gid] || {}).tasks || {};
    const tabs = '<div class="tabs">' + C.tasks.map(x => '<button data-ttab="' + x.id + '" class="' + (x.id === V.tid ? 'on' : '') + '">' + x.icon + ' ' + esc(x.name.split(' ')[0]) + (x.scope === 'group' ? (gg[x.id] && gg[x.id].s != null ? ' ✓' : '') : '') + (g.flags && g.flags[x.id] ? ' ●' : '') + '</button>').join('') + '</div>';
    const kind = M.KIND_OF_TASK[V.tid]; const F = FORMS[kind]; const ev = {}; Object.keys(D.calendar).forEach(k => ev[k] = D.calendar[k]); const media = mediaFor(V.gid);
    let content = '<div class="card"><h3>' + t.icon + ' ' + esc(t.name) + '</h3><div class="muted">' + esc(t.indicator) + ' · ' + esc(t.desc) + '</div>' + (g.flags && g.flags[t.id] ? '<div class="tag st-ok" style="margin-top:6px">● แจ้งว่าเสร็จโดย ' + esc(short(g.flags[t.id].by.name)) + ' ' + esc(thDateTime(g.flags[t.id].at)) + '</div>' : '') + '</div>';
    if (kind === 'reflection') {
      content += ms.map(m => { const p = D.personal[m.sid] || {}; const rf = p.reflection || {}; return '<div class="card"><div class="row">' + avatar(m.name) + '<b class="grow">' + esc(m.name) + '</b>' + (p.flags && p.flags.t7 ? '<span class="tag st-ok">● ส่งแล้ว</span>' : '') + '</div>' + (M.filled(rf) ? M.renderRecord('reflection', rf, {}, {}) : '<div class="muted">ยังไม่ได้เขียน</div>') + '</div>'; }).join('');
    } else if (F.single) {
      const doc = (gd.docs || {})[kind] || {}; content += M.filled(doc) ? '<div class="card">' + M.skipHTML(doc) + M.renderRecord(kind, doc, media, { showBy: true }) + tcBox(V.gid, kind, kind) + '</div>' : '<div class="empty">ยังไม่มีข้อมูล</div>';
      if (kind === 'report') content += '<div class="card"><div class="card-title">📑 รายงานวิชาการอัตโนมัติ</div><div class="row wrap" style="margin-bottom:10px"><button class="btn gold" data-act="gacdocx">⬇ Word (.docx)</button><button class="btn" data-act="gacpdf">⬇ PDF</button><button class="btn sec" data-act="gacprev">👁 ดูตัวอย่าง</button></div><div class="card-title">📒 สมุดบันทึกกลุ่ม</div><button class="btn" data-act="gpdf">⬇ รายงานกลุ่ม PDF</button> <button class="btn sec" data-act="gpreview">👁 ดูตัวอย่าง</button> <button class="btn sec" data-act="gposter">🎨 โปสเตอร์</button></div>';
    } else {
      const all = M.listOf(gd, kind, true), list = all.filter(r => !r.deleted), del = all.filter(r => r.deleted);
      content += list.length ? list.map((r, i) => { const s = F.summary(r), c = M.commObj(r); return '<div class="card" style="border-left:5px solid ' + (c ? c.color : 'var(--p200)') + '"><div class="rec-t">' + (c ? c.emoji + ' ' : '') + (i + 1) + '. ' + esc(s.t) + '</div><div class="rec-s">' + esc(s.s) + '</div>' + M.metaHTML(r) + M.renderRecord(kind, r, media, { events: ev }) + tcBox(V.gid, r.id, kind) + '</div>'; }).join('') : '<div class="empty">ยังไม่มีรายการ</div>';
      if (del.length) content += '<details class="card"><summary>🗑 รายการที่ถูกลบ (' + del.length + ')</summary>' + del.map(r => '<div class="row" style="padding:6px 0"><span class="grow">' + esc(F.summary(r).t) + ' <span class="muted">ลบโดย ' + esc(short((r.deletedBy || {}).name)) + ' ' + esc(thDateTime(r.deletedAt)) + '</span></span><button class="btn xs gold" data-act="trestore" data-kind="' + kind + '" data-id="' + r.id + '">กู้คืน</button></div>').join('') + '</details>';
      loadMedia(V.gid, list);
    }
    return shell(left + modeSw() + '<div class="row" style="margin:4px 0 8px"><h2 class="grow" style="margin:0">' + esc(g.name) + ' <span class="muted">ม.' + esc(g.room) + '</span></h2><button class="btn sm sec" data-act="synthview">🧩 ประมวลผลกลาง</button><a class="btn sm gold" href="index.html?as=' + esc(V.gid) + '">👀 มุมมองนักเรียนของกลุ่มนี้</a></div>' + tabs +
      '<div class="detail"><div>' + content + '</div><div class="grade-panel">' + gradePanel(g, ms, sy, t) + '</div></div>');
  }
  function rubricRow(c, r, attr) { return '<div class="f"><div class="lab">' + c.k + ' · ' + esc(c.name) + '</div><div class="rub">' + C.levels.map(l => '<button ' + attr + ' data-k="' + c.k + '" data-v="' + l.v + '" class="' + (r[c.k] === l.v ? 'on' : '') + '"><b>' + l.v + '</b>' + l.en + '</button>').join('') + '</div></div>'; }
  function gradePanel(g, ms, sy, t) {
    const peerAvg = sid => { const v = ms.filter(m => m.sid !== sid).map(m => ((D.personal[m.sid] || {}).peer || {})[sid]).filter(x => x && x.score).map(x => x.score); return v.length ? round1(v.reduce((a, b) => a + b, 0) / v.length) : null; };
    const shareOf = sid => (sy.contrib.find(x => x.sid === sid) || {}).share;
    if (t.scope === 'individual') {
      const sid = V.sid && ms.find(m => m.sid === V.sid) ? V.sid : (ms[0] || {}).sid; V.sid = sid; const sg = (D.grades.students || {})[sid] || {}; const e = (sg.tasks && sg.tasks[t.id]) || {};
      return '<div class="card"><div class="card-title">💭 ให้คะแนนรายบุคคล</div><div class="schips" style="margin-bottom:10px">' + ms.map(m => '<button class="schip' + (m.sid === sid ? ' on' : '') + '" data-pickstu="' + m.sid + '">' + esc(short(m.name)) + (((D.grades.students || {})[m.sid] || {}).tasks && D.grades.students[m.sid].tasks[t.id] && D.grades.students[m.sid].tasks[t.id].s != null ? ' ✓' : '') + '</button>').join('') + '</div>' +
        t.criteria.map(c => rubricRow(c, e.r || {}, 'data-irub')).join('') + '<div class="row"><div class="f grow"><label>คะแนน /' + maxOf(t) + '</label><input type="number" step="0.5" id="i_s" value="' + (e.s != null ? e.s : '') + '"></div><div class="big-score">' + (e.s != null ? e.s : '–') + '</div></div><div class="f"><label>ความเห็น</label><textarea id="i_c" rows="2">' + esc(e.c || '') + '</textarea></div>' +
        '<div class="hint">ค่าเฉลี่ยที่เพื่อนประเมิน: <b>' + (peerAvg(sid) == null ? '-' : peerAvg(sid) + '/4') + '</b> · การมีส่วนร่วม: <b>' + (shareOf(sid) == null ? '-' : shareOf(sid) + '%') + '</b></div></div>';
    }
    const gg = ((D.grades.groups || {})[g.gid] || {}).tasks || {}; const e = gg[t.id] || {};
    return '<div class="card"><div class="row"><div class="card-title grow">👥 คะแนนกลุ่ม</div><div class="big-score">' + (e.s != null ? e.s : '–') + '<span class="muted"> /' + maxOf(t) + '</span></div></div>' +
      t.criteria.map(c => rubricRow(c, e.r || {}, 'data-grub')).join('') +
      '<div class="row"><div class="f grow"><label>คะแนนกลุ่ม (แก้เองได้)</label><input type="number" step="0.5" id="g_s" value="' + (e.s != null ? e.s : '') + '"></div></div><div class="f"><label>ความเห็นถึงกลุ่ม</label><textarea id="g_c" rows="2">' + esc(e.c || '') + '</textarea></div></div>' +
      '<div class="card"><div class="card-title">⚖️ ปรับคะแนนรายคน (งานนี้)</div><div class="hint" style="margin-bottom:6px">คะแนนจริง = คะแนนกลุ่ม ± ปรับ (ไม่เกินคะแนนเต็ม) ใช้ข้อมูลการมีส่วนร่วมและการประเมินจากเพื่อนประกอบ</div>' +
      '<div class="scroll-x"><table class="mini"><tr><th>สมาชิก</th><th>มีส่วนร่วม</th><th>เพื่อนประเมิน</th><th>ลงพื้นที่</th><th>ปรับ ±</th><th>ได้</th></tr>' + ms.map(m => { const sg = (D.grades.students || {})[m.sid] || {}; const adj = (sg.adj || {})[t.id]; const FO = finalOf(m.sid), f = FO.tasks[t.id], fw = FO.fw; const fwc = '<td>' + (fw.total ? (fw.total - fw.deny) + '/' + fw.total + (fw.deny ? ' <span class="cs-chip cs-deny" title="ผู้ปกครองไม่อนุญาต ' + fw.deny + ' ครั้ง">❌' + fw.deny + '</span>' + (FIELD.includes(t.id) ? '<div style="font-size:.74rem">' + (fw.exempt ? 'ไม่หัก (งานทดแทน)' : 'หัก ' + fw.pct + '%') + '</div>' : '') + '<label style="font-size:.72rem;display:block;white-space:nowrap"><input type="checkbox" class="nopen" data-sid="' + m.sid + '"' + (fw.exempt ? ' checked' : '') + '> ทำงานทดแทนแล้ว</label>' : '') : '-') + '</td>';
        return '<tr><td>' + esc(short(m.name)) + '<div class="rolechips">' + m.roles.map(r => (roleById(r) || {}).icon || '').join(' ') + '</div></td><td><div class="bar" style="width:70px;display:inline-block;vertical-align:middle"><i style="width:' + (shareOf(m.sid) || 0) + '%"></i></div> ' + (shareOf(m.sid) || 0) + '%</td><td>' + (peerAvg(m.sid) == null ? '-' : peerAvg(m.sid)) + '</td>' + fwc + '<td><input type="number" step="0.5" class="adj" data-sid="' + m.sid + '" value="' + (adj != null ? adj : '') + '" placeholder="0" style="width:70px;min-height:34px;padding:4px"></td><td><b>' + (f == null ? '–' : f) + '</b></td></tr>'; }).join('') + '</table></div>' + (FIELD.includes(t.id) ? '<div class="hint" style="margin-top:6px">งานภาคสนาม: ผู้ที่ผู้ปกครองไม่อนุญาตให้ลงพื้นที่ จะถูกคิดคะแนนงานนี้ตามสัดส่วน (หัก ' + (C.consentPenalty || 0) + '% × สัดส่วนครั้งที่ไม่ได้ไป) — ติ๊ก “ทำงานทดแทนแล้ว” เพื่อไม่หัก หรือปรับ % ได้ที่ ⚙ คะแนนเต็ม</div>' : '') + '</div>';
  }
  function synthModal() {
    const g = D.groups[V.gid], gd = D.gdata[V.gid] || {}, ms = memList(g), sy = M.synth(gd, ms);
    modal('<div class="row"><h3 class="grow">🧩 ประมวลผลกลาง: ' + esc(g.name) + '</h3><button class="btn sm" data-close>ปิด</button></div>' +
      '<div class="card-title">การมีส่วนร่วม (จากประวัติการบันทึก)</div><table class="mini"><tr><th>สมาชิก</th><th>สร้าง</th><th>แก้ไข</th><th>แนบสื่อ</th><th>สัดส่วน</th><th>ล่าสุด</th><th>ตรา</th></tr>' + sy.contrib.map(x => '<tr><td>' + esc(x.name) + '</td><td>' + (x.create || 0) + '</td><td>' + (x.edit || 0) + '</td><td>' + (x.media || 0) + '</td><td>' + x.share + '%</td><td>' + esc(x.last ? ago(x.last) : '-') + '</td><td>' + EXTRAS.badgesHTML(EXTRAS.badges(gd, ms, x.sid, D.personal[x.sid]).filter(b => b.scope === 'me'), true) + '</td></tr>').join('') + '</table><div style="margin-top:6px">ตรากลุ่ม: ' + EXTRAS.badgesHTML(EXTRAS.badges(gd, ms, '', {}).filter(b => b.scope === 'group'), true) + '</div>' +
      '<div class="card-title" style="margin-top:14px">เครื่องดนตรีที่วิเคราะห์</div>' + (sy.instruments.length ? '<table class="mini"><tr><th>เครื่องดนตรี</th><th>ชุมชน</th><th>ประเภท</th><th>สีสันเสียง</th></tr>' + sy.instruments.map(r => '<tr><td>' + esc(r.inst) + '</td><td>' + esc(r.c ? r.c.name : '') + '</td><td>' + esc(r.classify) + '</td><td>' + esc(r.timbre) + '</td></tr>').join('') + '</table>' : '<div class="muted">-</div>') +
      '<div class="two-col"><div><div class="card-title" style="margin-top:14px">สีสันเสียง</div>' + M.barsHTML(sy.freq.timbre) + '</div><div><div class="card-title" style="margin-top:14px">หน้าที่ดนตรี</div>' + M.barsHTML(sy.freq.funcs) + '</div></div>', { center: true, wide: true });
  }
  function setGroupGrade(field, k, v, gid) {
    gid = gid || V.gid; const t = taskById(V.tid), path = 'grades/groups/' + gid; const cur = (((D.grades.groups || {})[gid] || {}).tasks || {})[t.id] || {}; const e = JSON.parse(JSON.stringify(cur));
    if (field === 'r') { e.r = e.r || {}; e.r[k] = e.r[k] === v ? null : v; const s = rubricScore(t, e.r); if (s != null) e.s = s; }
    else if (field === 's') e.s = v === '' ? null : Math.max(0, Math.min(maxOf(t), +v));
    else if (field === 'c') e.c = v;
    e.at = Date.now();
    D.grades.groups[gid] = D.grades.groups[gid] || {}; D.grades.groups[gid].tasks = D.grades.groups[gid].tasks || {}; D.grades.groups[gid].tasks[t.id] = e;
    W(B.update(path, { room: D.groups[gid].room, ['tasks/' + t.id]: e })); pushFinal(memList(D.groups[gid]).map(m => m.sid)); render(true);
  }
  function setIndGrade(field, k, v, sid) {
    sid = sid || V.sid; const t = taskById(V.tid); const sg = (D.grades.students || {})[sid] || {}; const e = JSON.parse(JSON.stringify((sg.tasks && sg.tasks[t.id]) || {}));
    if (field === 'r') { e.r = e.r || {}; e.r[k] = e.r[k] === v ? null : v; const s = rubricScore(t, e.r); if (s != null) e.s = s; }
    else if (field === 's') e.s = v === '' ? null : Math.max(0, Math.min(maxOf(t), +v)); else if (field === 'c') e.c = v;
    e.at = Date.now(); D.grades.students[sid] = Object.assign({}, sg, { tasks: Object.assign({}, sg.tasks, { [t.id]: e }) });
    W(B.update('grades/students/' + sid, { ['tasks/' + t.id]: e })); pushFinal([sid]); render(true);
  }

  /* ---------- คะแนน/ส่งออก ---------- */
  function viewScores() {
    const stu = rosterOf(V.room);
    const rows = stu.map(s => { const f = finalOf(s.sid); const g = D.groups[D.memberOf[s.sid]]; const rel = ((D.grades.students || {})[s.sid] || {}).released;
      return '<tr><td>' + esc(s.no) + '</td><td class="l">' + esc(s.sid) + '</td><td class="l">' + esc(s.name) + '</td><td class="l muted">' + esc(g ? g.name : '-') + '</td>' + C.tasks.map(t => '<td>' + (f.tasks[t.id] == null ? '<span class="muted">–</span>' : f.tasks[t.id]) + '</td>').join('') + '<td><b>' + (f.total == null ? '–' : f.total) + '</b></td><td>' + (f.fw.total ? (f.fw.total - f.fw.deny) + '/' + f.fw.total + (f.fw.deny ? ' ❌' : '') : '-') + '</td><td>' + (rel ? '👁' : '') + '</td></tr>'; }).join('');
    return shell('<div class="toolbar"><div class="f"><label>ห้อง</label>' + roomSel('v_room') + '</div><div class="f"><label>ปรับรวมเป็นเต็ม</label><input type="number" id="ex_scale" value="' + totalMax() + '" style="width:110px"></div><label class="chk" style="margin:0"><input type="checkbox" id="ex_only"><span>เฉพาะคะแนนรวม</span></label><div class="grow"></div><button class="btn sec" data-act="settings">⚙ คะแนนเต็ม</button></div>' +
      '<div class="card"><div class="tbl-box"><table class="t"><tr><th>เลขที่</th><th class="l">รหัส</th><th class="l">ชื่อ-นามสกุล</th><th class="l">กลุ่ม</th>' + C.tasks.map(t => '<th>' + t.icon + ' ' + esc(t.name.split(' ')[0]) + '<br>/' + maxOf(t) + '</th>').join('') + '<th>รวม<br>/' + totalMax() + '</th><th>ลงพื้นที่</th><th>เผยแพร่</th></tr>' + rows + '</table></div>' +
      '<div class="row wrap" style="margin-top:12px"><button class="btn gold" data-act="exp" data-k="csv">⬇ CSV (Excel/Teacher OS)</button><button class="btn sec" data-act="exp" data-k="xlsx">⬇ Excel .xlsx</button><button class="btn sec" data-act="exp" data-k="copy">📋 คัดลอกตาราง</button><div class="grow"></div><button class="btn sm sec" data-act="release" data-v="1">👁 เผยแพร่คะแนนห้องนี้</button><button class="btn sm ghost" data-act="release" data-v="0">🙈 ซ่อน</button></div>' +
      '<div class="hint" style="margin-top:6px">คะแนนงานกลุ่ม = คะแนนกลุ่ม ± ปรับรายคน · ไฟล์มี เลขที่ รหัส ชื่อ คะแนนรายชิ้น และรวม เพื่อจับคู่กับ Teacher OS ด้วยรหัสนักเรียน</div></div>');
  }
  function exportAoa(opts) {
    const scale = +opts.scale || totalMax(), only = opts.only; const head = ['เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้อง', 'กลุ่ม'];
    if (!only) C.tasks.forEach(t => head.push(t.name + ' (' + maxOf(t) + ')'));
    head.push('รวม (' + totalMax() + ')'); if (scale !== totalMax()) head.push('รวมปรับเป็น (' + scale + ')'); head.push('ลงพื้นที่ (ร่วม/ทั้งหมด)', 'หมายเหตุ');
    const out = [head];
    rosterOf(V.room).forEach(s => { const f = finalOf(s.sid); const g = D.groups[D.memberOf[s.sid]]; const row = [s.no, s.sid, s.name, 'ม.' + s.room, g ? g.name : ''];
      if (!only) C.tasks.forEach(t => row.push(f.tasks[t.id] == null ? '' : f.tasks[t.id])); row.push(f.total == null ? '' : f.total); if (scale !== totalMax()) row.push(f.total == null ? '' : round1(f.total * scale / totalMax())); row.push(f.fw.total ? (f.fw.total - f.fw.deny) + '/' + f.fw.total : '', f.fw.deny ? 'ผู้ปกครองไม่อนุญาตลงพื้นที่ ' + f.fw.deny + ' ครั้ง' + (f.fw.exempt ? ' (ทำงานทดแทนแล้ว ไม่หักคะแนน)' : ' (หักคะแนนงานภาคสนาม ' + f.fw.pct + '%)') : ''); out.push(row); });
    return out;
  }
  const csvEsc = v => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  async function doExport(k) {
    const aoa = exportAoa({ scale: $('#ex_scale').value, only: $('#ex_only').checked }); const name = 'คะแนนหน่วย2-ดนตรีแม่สอด-ม' + V.room.replace('/', '-');
    if (k === 'csv') await M.saveBlob(new Blob(['﻿' + aoa.map(r => r.map(csvEsc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), name + '.csv');
    else if (k === 'xlsx') { try { await M.loadLibs('xlsx'); const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = aoa[0].map((h, i) => ({ wch: i === 2 ? 28 : 14 })); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'คะแนน'); await M.saveBlob(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name + '.xlsx'); } catch (er) { toast('สร้าง .xlsx ไม่ได้ (ต้องมีอินเทอร์เน็ต) — ใช้ CSV แทน', 4000); } }
    else { try { await navigator.clipboard.writeText(aoa.map(r => r.join('\t')).join('\n')); toast('คัดลอกแล้ว — วางใน Teacher OS/Excel ได้เลย'); } catch (er) { toast('คัดลอกไม่สำเร็จ ใช้ CSV แทน'); } }
  }

  /* ---------- สำรอง/กู้คืน ---------- */
  async function viewBackup() {
    const failed = await B.failedOps(); const c = C.course;
    const F = [['school', 'ชื่อโรงเรียน (เต็ม)'], ['department', 'กลุ่มสาระการเรียนรู้'], ['teacher', 'ชื่อ-นามสกุลครูผู้สอน (ใช้ในรายงาน)'], ['teacherPosition', 'ตำแหน่ง (เช่น ครูผู้ช่วย / ครู / ครูผู้สอน)'], ['code', 'รหัสวิชา'], ['name', 'ชื่อวิชา'], ['unit', 'หน่วยการเรียนรู้'], ['year', 'ปีการศึกษา'], ['semester', 'ภาคเรียน'], ['rooms', 'จำนวนห้อง ม.5']];
    const info = '<div class="card gold"><div class="card-title">🏫 ข้อมูลส่วนกลาง</div><div class="muted" style="margin-bottom:8px">ใช้ในปกรายงานวิชาการ รายงานกลุ่ม โปสเตอร์ และหน้าแอปของนักเรียนทุกคน (ใช้ชื่อจริง–นามสกุลจริงสำหรับงานวิชาการ)</div>' +
      '<div class="info-grid">' + F.map(f => '<div class="f"><label>' + esc(f[1]) + '</label><input type="text" data-info="' + f[0] + '" value="' + esc(c[f[0]] == null ? '' : c[f[0]]) + '"></div>').join('') + '</div><button class="btn gold" data-act="saveinfo">บันทึกข้อมูลส่วนกลาง</button></div>';
    return shell(info + commCard() + '<div class="card"><div class="card-title">💾 สำรองข้อมูลทั้งระบบ</div><div class="muted" style="margin-bottom:8px">ดาวน์โหลดรายชื่อ กลุ่ม บันทึกทั้งหมด ประวัติการแก้ไข สะท้อนคิด ปฏิทิน และคะแนน เป็นไฟล์ .json (แนะนำทุกสัปดาห์)</div><div class="row wrap"><button class="btn gold" data-act="fullbackup" data-media="0">ดาวน์โหลด (ไม่รวมภาพ/เสียง)</button><button class="btn sec" data-act="fullbackup" data-media="1">ดาวน์โหลด (รวมภาพ/เสียง — ไฟล์ใหญ่)</button></div></div>' +
      '<div class="card"><div class="card-title">↩ กู้คืนข้อมูลกลุ่มจากไฟล์</div><div class="muted" style="margin-bottom:8px">ใช้ไฟล์ “สำรองกลุ่ม” หรือ “สำเนา” ที่นักเรียนดาวน์โหลดจากแอป ระบบจะ <b>เพิ่มเฉพาะรายการที่หายไป หรือฉบับในไฟล์ใหม่กว่า</b> ไม่เขียนทับงานล่าสุด</div><input type="file" id="rs_file" accept=".json"></div>' +
      '<div class="card"><div class="card-title">สถานะการส่งข้อมูลของเครื่องนี้</div>รอส่ง ' + STATUS.pending + ' · ส่งไม่สำเร็จ ' + failed.length + (failed.length ? '<div class="warn-box" style="margin-top:6px">' + esc(failed[0].p) + ': ' + esc(failed[0].error) + '</div><button class="btn sm gold" data-act="retry">ลองส่งใหม่</button>' : '') + '</div>' +
      '<div class="card"><div class="card-title">⚙ คะแนนเต็มแต่ละงาน & การหักคะแนนเมื่อไม่ได้ลงพื้นที่</div><div class="muted" style="margin-bottom:8px">ตอนนี้: ผู้ปกครองไม่อนุญาต → หักคะแนนงานภาคสนาม ' + (C.consentPenalty || 0) + '% ตามสัดส่วนครั้งที่ไม่ได้ไป</div><button class="btn sec" data-act="settings">ตั้งค่า</button></div>' +
      (B.mode === 'demo' ? '<div class="card"><div class="card-title">🧪 โหมดสาธิต</div><button class="btn bad" data-act="resetdemo">ล้างข้อมูลสาธิตทั้งหมด</button></div>' : ''));
  }
  async function fullBackup(withMedia) {
    const keys = ['roster', 'groups', 'memberOf', 'records', 'docs', 'history', 'personal', 'calendar', 'grades', 'config', 'consents', 'ctoken', 'tcomments']; const out = { app: 'mcm5-full', v: 2, exportedAt: Date.now(), by: USER.email };
    for (const k of keys) { try { out[k] = await B.get(k); } catch (er) { out[k] = null; } }
    if (withMedia) { out.media = {}; for (const gid of Object.keys(out.records || {})) { const ids = []; Object.values(out.records[gid] || {}).forEach(kind => Object.values(kind || {}).forEach(r => M.mediaIds(r).forEach(id => ids.push(id)))); out.media[gid] = {}; for (const id of ids) { const m = await B.getMedia(gid, id); if (m) { const o = Object.assign({}, m); delete o.id; out.media[gid][id] = o; } } } }
    M.saveJSON(out, 'สำรองทั้งระบบ-ดนตรีแม่สอด-' + today() + '.json');
  }
  async function restoreGroupFile(f) {
    try {
      const o = JSON.parse(await f.text()); let gid, data;
      if (o.app === 'mcm5g') { gid = o.gid; data = { records: o.records, docs: o.docs, history: o.history }; }
      else if (o.app === 'mcm5g-snap') { gid = o.gid; data = o.data; }
      else throw new Error('ไม่ใช่ไฟล์สำรองกลุ่มของแอปนี้');
      if (!D.groups[gid]) throw new Error('ไม่พบกลุ่ม ' + gid + ' ในระบบ');
      const cur = { records: (await B.get('records/' + gid)) || {}, docs: (await B.get('docs/' + gid)) || {} }; const upd = {}; let n = 0;
      Object.keys(data.records || {}).forEach(kind => Object.keys(data.records[kind] || {}).forEach(rid => { const r = data.records[kind][rid], c = (cur.records[kind] || {})[rid]; if (!c || (r.updatedAt || 0) > (c.updatedAt || 0)) { upd['records/' + gid + '/' + kind + '/' + rid] = r; n++; } }));
      Object.keys(data.docs || {}).forEach(k => { const d = data.docs[k], c = cur.docs[k]; if (!c || (d._updatedAt || 0) > (c._updatedAt || 0)) { upd['docs/' + gid + '/' + k] = d; n++; } });
      if (o.media) for (const id of Object.keys(o.media)) { const m = Object.assign({}, o.media[id]); delete m.id; await W(B.putMedia(gid, id, m)); }
      if (n) { await W(B.update('', upd)); W(B.set('history/' + gid + '/' + B.uid(), { at: Date.now(), by: tMe(), kind: 'restore-file', rid: '-', act: 'restore', snap: null })); }
      toast('กู้คืน ' + n + ' รายการให้ ' + D.groups[gid].name, 4000);
    } catch (er) { toast('กู้คืนไม่สำเร็จ: ' + er.message, 4500); }
  }
  /* ---------- กลุ่มวัฒนธรรม/ชาติพันธุ์ (ครูเพิ่ม แก้ไข ซ่อน/ลบ → แสดงในแอปนักเรียนทันที) ---------- */
  function commUse(id) { let n = 0; Object.values(D.records || {}).forEach(g => Object.values(g || {}).forEach(k => Object.values(k || {}).forEach(r => { if (r && !r.deleted && r.community === id) n++; }))); Object.values(D.calendar || {}).forEach(e => { if (e && e.community === id) n++; }); return n; }
  function commCard() {
    const all = C.commAll.filter(c => c.id !== 'other');
    return '<div class="card"><div class="row"><div class="card-title grow">🌏 กลุ่มวัฒนธรรม / ชาติพันธุ์</div><button class="btn sm gold" data-act="cmadd">＋ เพิ่มกลุ่ม</button></div><div class="muted" style="margin-bottom:6px">รายการนี้คือตัวเลือก “ชุมชน/กลุ่มวัฒนธรรม” ในแอปนักเรียน (แบบบันทึก ปฏิทิน แผนที่ รายงาน) — เพิ่ม แก้ไข หรือนำออกได้ นักเรียนเห็นทันที (ตัวเลือก “อื่น ๆ (ระบุเอง)” ยังมีให้เสมอ)</div>' +
      all.map(c => { const n = commUse(c.id); return '<div class="cm-row' + (c.hidden ? ' off' : '') + '"><div class="sw" style="background:' + esc(c.color) + '">' + esc(c.emoji) + '</div><div><b>' + esc(c.name) + '</b> ' + (c.added ? '<span class="tag gold">ครูเพิ่ม</span>' : '') + (c.hidden ? ' <span class="tag st-cancel">นำออกจากตัวเลือกแล้ว</span>' : '') + '<div class="muted" style="font-size:.8rem">' + esc((c.instruments || []).slice(0, 5).join(', ') || 'ยังไม่ระบุเครื่องดนตรี') + (n ? ' · ใช้อยู่ ' + n + ' รายการ' : '') + '</div></div><div class="row" style="gap:6px"><button class="btn xs sec" data-act="cmedit" data-id="' + esc(c.id) + '">✎ แก้ไข</button>' + (c.hidden ? '<button class="btn xs gold" data-act="cmshow" data-id="' + esc(c.id) + '">↩ นำกลับ</button>' : '<button class="btn xs bad" data-act="cmdel" data-id="' + esc(c.id) + '">นำออก</button>') + '</div></div>'; }).join('') + '</div>';
  }
  function commModal(id) {
    const c = id ? C.commAll.find(x => x.id === id) : { emoji: '🎶', color: '#0e7490', name: '', instruments: [], occasions: [] }; if (!c) return;
    const w = modal('<h3>' + (id ? '✎ แก้ไขกลุ่มวัฒนธรรม' : '＋ เพิ่มกลุ่มวัฒนธรรม/ชาติพันธุ์') + '</h3><div class="cm-grid"><div class="f"><label>สัญลักษณ์</label><input type="text" id="cm_e" value="' + esc(c.emoji) + '" maxlength="4"></div><div class="f"><label>ชื่อกลุ่ม <span class="req">*</span></label><input type="text" id="cm_n" value="' + esc(c.name) + '" placeholder="เช่น มอญ, ลาหู่ (มูเซอ), พม่า" list="cm_sug"><datalist id="cm_sug">' + (C.otherSuggestions || []).map(x => '<option value="' + esc(x) + '">').join('') + '</datalist></div><div class="f"><label>สีประจำกลุ่ม</label><input type="color" id="cm_c" value="' + esc(/^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#7e5a9b') + '" style="width:100%;height:46px;border:1.5px solid var(--line);border-radius:12px;padding:4px;background:#fff"></div></div>' +
      '<div class="f"><label>เครื่องดนตรี/การขับร้องที่พบบ่อย (คั่นด้วยจุลภาค) — ใช้เป็นตัวช่วยพิมพ์ของนักเรียน</label><textarea id="cm_i" rows="2" placeholder="เช่น ตะโพนมอญ, ปี่มอญ, ฆ้องมอญ">' + esc((c.instruments || []).join(', ')) + '</textarea></div>' +
      '<div class="f"><label>โอกาส/พิธีกรรมที่ใช้ดนตรี (คั่นด้วยจุลภาค)</label><textarea id="cm_o" rows="2" placeholder="เช่น งานบุญ, งานศพ, สงกรานต์">' + esc((c.occasions || []).join(', ')) + '</textarea></div>' +
      '<div class="row"><button class="btn gold grow" id="cm_ok">บันทึก</button><button class="btn sec" data-close>ยกเลิก</button></div>', { center: true });
    const sp = s => String(s || '').split(/[,，\n]+/).map(x => x.trim()).filter(Boolean).slice(0, 30);
    $('#cm_ok', w).onclick = () => {
      const name = $('#cm_n', w).value.trim(); if (!name) { toast('กรอกชื่อกลุ่ม'); return; }
      if (C.commAll.some(x => x.id !== id && x.name.trim() === name)) { toast('มีกลุ่มชื่อนี้อยู่แล้ว'); return; }
      const cid = id || ('c' + B.uid()); const prev = ((D.config || {}).communities || {})[cid] || {};
      const o = { name, emoji: $('#cm_e', w).value.trim() || '🎶', color: $('#cm_c', w).value, instruments: sp($('#cm_i', w).value), occasions: sp($('#cm_o', w).value), hidden: prev.hidden || null, at: prev.at || Date.now(), updatedAt: Date.now() };
      D.config = Object.assign({}, D.config, { communities: Object.assign({}, (D.config || {}).communities, { [cid]: o }) }); M.applyInfo(D.config);
      W(B.set('config/communities/' + cid, o)); w.remove(); toast(id ? 'แก้ไขแล้ว — นักเรียนเห็นค่าใหม่ทันที' : 'เพิ่ม “' + name + '” แล้ว — แสดงในแอปนักเรียนทันที', 3200); render(true);
    };
  }
  function commSet(id, patchObj) { const cur = ((D.config || {}).communities || {})[id] || {}; const o = patchObj === null ? null : Object.assign({}, cur, patchObj, { updatedAt: Date.now() }); const cm = Object.assign({}, (D.config || {}).communities); if (o) cm[id] = o; else delete cm[id]; D.config = Object.assign({}, D.config, { communities: cm }); M.applyInfo(D.config); W(B.set('config/communities/' + id, o)); render(true); }

  /* ---------- ใบอนุญาตผู้ปกครอง (ครู) ---------- */
  /* สร้างลิงก์ให้คนที่ยังไม่มี + อัปเดตรายละเอียดนัดในลิงก์ที่ผู้ปกครองยังไม่ตอบ */
  function syncTokens(eid, evObj, quiet) {
    const e0 = evObj || D.calendar[eid]; if (!e0) return 0; const e = Object.assign({}, e0, { id: eid }); if (!CONSENT.needsConsent(e)) return 0;
    const upd = {}; let n = 0;
    evStudents(e).forEach(s => { const t = tokOf(s.sid, eid), data = CONSENT.tokenData(e, s);
      if (!t) { const nt = CONSENT.newToken(); data.createdAt = Date.now(); upd['ctoken/' + nt] = data; upd['consents/' + s.sid + '/' + eid] = nt; D.ct[nt] = data; D.consents[s.sid] = Object.assign({}, typeof D.consents[s.sid] === 'object' ? D.consents[s.sid] : {}, { [eid]: nt }); n++; }
      else { const ct = D.ct[t]; if (ct && !ct.sign) { const ch = Object.keys(data).filter(k => JSON.stringify(data[k]) !== JSON.stringify(ct[k] == null ? null : ct[k]) && !(data[k] == null && ct[k] == null)); ch.forEach(k => { upd['ctoken/' + t + '/' + k] = data[k]; ct[k] = data[k]; }); } } });
    if (Object.keys(upd).length) W(B.update('', upd)); if (n && !quiet) toast('ออกลิงก์ใบอนุญาตให้นักเรียน ' + n + ' คนแล้ว — ลิงก์ขึ้นในแอปของนักเรียนทันที', 3500); return n;
  }
  function consentModal(eid) {
    const e0 = D.calendar[eid]; if (!e0) return; const e = Object.assign({ id: eid }, e0); syncTokens(eid, null, true);
    const st = evStudents(e).sort((a, b) => String(a.room).localeCompare(String(b.room), 'th', { numeric: true }) || (+a.no) - (+b.no));
    let a = 0, d = 0, nv = 0; st.forEach(s => { const c = cRec(s.sid, eid); if (c && c.decision === 'allow') { a++; if (!c.verified) nv++; } else if (c && c.decision === 'deny') d++; });
    const w = modal('<div class="row"><h3 class="grow" style="margin:0">📝 ใบอนุญาตผู้ปกครอง</h3><button class="btn sm" data-close>ปิด</button></div><div class="muted" style="margin:4px 0 10px">' + esc(e.title) + ' · ' + esc(thDate(e.date, true)) + ' · นักเรียน ' + st.length + ' คน — ✅ อนุญาต ' + a + ' · ❌ ไม่อนุญาต ' + d + ' · ⏳ ยังไม่ตอบ ' + (st.length - a - d) + '</div>' +
      '<div class="tip">ระบบออกลิงก์รายคนให้แล้ว นักเรียนเห็นปุ่ม “ส่งลิงก์ให้ผู้ปกครอง” ในปฏิทินของตนเอง ผู้ปกครองเปิดลิงก์บนโทรศัพท์ของผู้ปกครอง เซ็นชื่อ และส่งได้ครั้งเดียว (ไม่ต้องล็อกอิน)</div>' +
      '<div class="row wrap" style="margin-bottom:10px">' + (nv ? '<button class="btn sm gold" data-c="verall">✔ ยืนยันที่อนุญาตทั้งหมด (' + nv + ')</button>' : '') + '<button class="btn sm sec" data-c="pblank">🖨 พิมพ์ใบเปล่า (คนที่ยังไม่ตอบ)</button><button class="btn sm sec" data-c="psigned">🖨 พิมพ์ฉบับที่ลงนามแล้ว</button><button class="btn sm sec" data-c="pdfall">⬇ PDF ทุกคน (หลักฐาน)</button></div>' +
      (st.length ? '<div class="cs-wrap"><table class="cs-table"><tr><th>เลขที่</th><th>ชื่อ</th><th>กลุ่ม</th><th>ผลการขออนุญาต</th><th>จัดการ</th></tr>' + st.map(s => { const t = tokOf(s.sid, eid), ct = t ? D.ct[t] : null, c = CONSENT.rec(ct); return '<tr><td>' + esc(s.no) + '</td><td>' + esc(s.name) + '<div class="muted" style="font-size:.74rem">ม.' + esc(s.room) + '</div></td><td>' + esc(s.group) + '</td><td>' + CONSENT.statusChip(t, t ? (ct || false) : null) + (c ? '<div class="muted" style="font-size:.76rem">' + esc(c.parentName || '-') + (c.relation ? ' (' + esc(c.relation) + ')' : '') + (c.phone ? ' ☎ ' + esc(c.phone) : '') + '<br>' + esc(thDateTime(c.at)) + ' · ' + (c.method === 'paper' ? 'ครูบันทึกจากใบกระดาษ' : 'ลงนามผ่านลิงก์') + (c.reason ? '<br>เหตุผล: ' + esc(c.reason) : '') + '</div>' + (c.sign ? '<img src="' + esc(c.sign) + '" alt="ลายเซ็น" style="height:34px;background:#fff;border:1px solid var(--line);border-radius:6px">' : '') : '') + '</td>' +
        '<td><div class="row wrap" style="gap:4px">' + (t && !c ? '<button class="btn xs gold" data-c="copy" data-sid="' + s.sid + '">📋 ลิงก์</button><button class="btn xs sec" data-c="allow" data-sid="' + s.sid + '" title="บันทึกจากใบกระดาษ">📄 อนุญาต</button><button class="btn xs sec" data-c="deny" data-sid="' + s.sid + '" title="บันทึกจากใบกระดาษ">📄 ไม่อนุญาต</button>' : '') + (c && c.decision === 'allow' && !c.verified ? '<button class="btn xs gold" data-c="verify" data-sid="' + s.sid + '">✔ ยืนยัน</button>' : '') + '<button class="btn xs sec" data-c="print" data-sid="' + s.sid + '">🖨</button>' + (c ? '<button class="btn xs ghost" data-c="reissue" data-sid="' + s.sid + '" title="ยกเลิกคำตอบเดิมและออกลิงก์ใหม่">↺ ออกลิงก์ใหม่</button>' : '') + '</div></td></tr>'; }).join('') + '</table></div>' : '<div class="empty">ยังไม่มีนักเรียนในกลุ่มที่ไปนัดนี้</div>') +
      '<div class="hint" style="margin-top:8px">“ยืนยัน” = ครูตรวจแล้วว่าเป็นคำตอบของผู้ปกครองจริง (เช่น โทรสอบถามตามเบอร์ที่ให้ไว้) · เมื่อผู้ปกครอง “ไม่อนุญาต” ระบบคิดคะแนนงานภาคสนามตามสัดส่วน (ตั้ง % ที่ ⚙ ตั้งค่า) · ผู้ปกครองเปลี่ยนใจ → กด “ออกลิงก์ใหม่”</div>', { center: true, wide: true });
    const item = (s, signed) => { const t = tokOf(s.sid, eid), ct = t && D.ct[t]; return ct ? CONSENT.fromToken(ct, !signed) : { ev: e, stu: s, c: null }; };
    const again = () => { w.remove(); consentModal(eid); };
    w.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-c]'); if (!b) return; const k = b.dataset.c, s = st.find(x => x.sid === b.dataset.sid);
      if (k === 'verall') { const upd = {}, v = { by: tMe().name, at: Date.now() }; st.forEach(x => { const t = tokOf(x.sid, eid), c = cRec(x.sid, eid); if (c && c.decision === 'allow' && !c.verified) { upd['ctoken/' + t + '/verified'] = v; D.ct[t].verified = v; } }); W(B.update('', upd)); toast('ยืนยันแล้ว'); again(); return; }
      if (k === 'pblank') { const l = st.filter(x => !cRec(x.sid, eid)); if (!l.length) { toast('ทุกคนตอบแล้ว'); return; } w.remove(); CONSENT.printLetters(l.map(x => item(x, false))); return; }
      if (k === 'psigned') { const l = st.filter(x => cRec(x.sid, eid)); if (!l.length) { toast('ยังไม่มีใบที่ลงนาม'); return; } w.remove(); CONSENT.printLetters(l.map(x => item(x, true))); return; }
      if (k === 'pdfall') { if (!st.length) return; b.disabled = true; const o = b.textContent; b.textContent = 'กำลังสร้าง…'; try { await CONSENT.pdfLetters(st.map(x => item(x, true)), 'ใบขออนุญาตผู้ปกครอง-' + e.date); } catch (er) { toast('สร้าง PDF ไม่ได้ (ต้องมีอินเทอร์เน็ตครั้งแรก) — ใช้ปุ่มพิมพ์แล้วบันทึกเป็น PDF แทน', 4500); } b.disabled = false; b.textContent = o; return; }
      if (!s) return; const t = tokOf(s.sid, eid), ct = t && D.ct[t];
      if (k === 'print') { w.remove(); CONSENT.printLetters([item(s, true)]); return; }
      if (k === 'copy') { CONSENT.copyLink(t); return; }
      if (k === 'verify') { const v = { by: tMe().name, at: Date.now() }; ct.verified = v; W(B.set('ctoken/' + t + '/verified', v)); again(); return; }
      if (k === 'reissue') { if (!confirm('ยกเลิกคำตอบเดิมของผู้ปกครอง ' + s.name + ' และออกลิงก์ใหม่?\n(คำตอบและลายเซ็นเดิมจะถูกลบ ลิงก์เดิมใช้ไม่ได้อีก)')) return; delete D.ct[t]; D.consents[s.sid] = Object.assign({}, D.consents[s.sid]); delete D.consents[s.sid][eid]; W(B.update('', { ['ctoken/' + t]: null, ['consents/' + s.sid + '/' + eid]: null, ['groups/' + s.gid + '/fieldwork/' + eid + '/' + s.sid]: null })); syncTokens(eid, null, true); pushFinal([s.sid]); toast('ออกลิงก์ใหม่แล้ว — นักเรียนเห็นลิงก์ใหม่ทันที', 3200); again(); return; }
      if (k === 'allow' || k === 'deny') {
        if (!ct) return; const pn = prompt('บันทึกจากใบกระดาษ: ' + (k === 'allow' ? 'อนุญาต' : 'ไม่อนุญาต') + '\nชื่อผู้ปกครองของ ' + s.name + ' ที่ลงนาม:', ''); if (pn === null) return; if (!pn.trim()) { toast('กรอกชื่อผู้ปกครอง'); return; }
        let reason = ''; if (k === 'deny') { reason = prompt('เหตุผลที่ไม่อนุญาต (ไม่บังคับ):', ''); if (reason === null) return; }
        const sg = { name: pn.trim(), relation: 'ผู้ปกครอง', allow: k === 'allow', reason: reason.trim(), paper: true, at: Date.now() }, v = { by: tMe().name, at: Date.now() };
        ct.sign = sg; ct.verified = v; W(B.update('', { ['ctoken/' + t + '/sign']: sg, ['ctoken/' + t + '/verified']: v, ['groups/' + s.gid + '/fieldwork/' + eid + '/' + s.sid]: k })); pushFinal([s.sid]); again();
      }
    });
  }
  function settingsModal() {
    const w = modal('<h3>⚙ คะแนนเต็มแต่ละงาน</h3>' + C.tasks.map(t => '<div class="row" style="margin-bottom:8px"><div class="grow">' + t.icon + ' ' + esc(t.name) + ' <span class="tag">' + (t.scope === 'group' ? 'กลุ่ม' : 'รายบุคคล') + '</span></div><input type="number" step="0.5" min="0" data-max="' + t.id + '" value="' + maxOf(t) + '" style="width:90px"></div>').join('') + '<div class="muted">รวม: <b id="mx_tot">' + totalMax() + '</b></div><div class="row" style="margin-top:12px;border-top:1px dashed var(--line);padding-top:12px"><div class="grow">🚫 หักคะแนนงานภาคสนาม (' + FIELD.map(x => taskById(x).name.split(' ')[0]).join(', ') + ') เมื่อผู้ปกครองไม่อนุญาตลงพื้นที่ <span class="muted">% × สัดส่วนครั้งที่ไม่ได้ไป (0 = ไม่หัก)</span></div><input type="number" min="0" max="100" step="5" id="mx_pen" value="' + (C.consentPenalty || 0) + '" style="width:90px"></div><button class="btn gold block" style="margin-top:12px" id="mx_save">บันทึก</button>', { center: true });
    w.addEventListener('input', () => { $('#mx_tot', w).textContent = $$('[data-max]', w).reduce((a, i) => a + (+i.value || 0), 0); });
    $('#mx_save', w).onclick = () => { const mx = {}; $$('[data-max]', w).forEach(i => mx[i.dataset.max] = +i.value || 0); W(B.set('config/max', mx)); W(B.set('config/consentPenalty', Math.max(0, Math.min(100, +$('#mx_pen', w).value || 0)))); w.remove(); toast('บันทึกแล้ว'); };
  }

  /* ---------- render ---------- */
  let LASTT = '';
  async function render(keep) {
    if (!USER) return;
    const y = window.scrollY; let html;
    if (V.tab === 'roster') html = viewRoster(); else if (V.tab === 'groups') html = viewGroups(); else if (V.tab === 'cal') html = viewCal(); else if (V.tab === 'grade') html = viewGrade(); else if (V.tab === 'scores') html = viewScores(); else if (V.tab === 'backup') html = await viewBackup(); else if (V.tab === 'map') html = viewMapT(); else if (V.tab === 'listen') html = await viewListenT(); else html = viewDash();
    if (keep && html === LASTT && $('#root .t-wrap')) return; LASTT = html;
    const act = document.activeElement; const actId = act && act.id; const selS = act && act.selectionStart;
    $('#root').innerHTML = html; window.scrollTo(0, keep ? y : 0); if (V.tab === 'roster') initDrag(); if (V.tab === 'map') EXTRAS.renderMap($('#mapEl'), mapPts()); if (V.tab === 'listen') EXTRAS.bindListen($('#listenRoot'), LISTEN_T);
    if (actId && /^(g_c|i_c|g_s|i_s)$/.test(actId)) { const el = $('#' + actId); if (el) { el.focus(); try { el.setSelectionRange(selS, selS); } catch (er) { /* number input */ } } }
  }
  function renderLogin(msg) {
    msg = msg || loginMsg;
    $('#root').innerHTML = '<div class="hero"><div class="logos"><img class="big" src="icons/logo-full.png" alt="Mae Sot Musicology"></div><h1>หน้าครู</h1><p>' + esc(C.appFull) + '</p></div><div class="card login-card">' + (msg ? '<div class="warn-box">' + esc(msg) + '</div>' : '') +
      '<button class="btn gold block" data-act="login">เข้าสู่ระบบครูด้วย Google</button><a class="btn sec block" style="margin-top:8px" href="index.html">🏠 ไปหน้าหลัก</a><div class="muted" style="margin-top:8px">อนุญาตเฉพาะ: ' + esc((C.teacherEmails || []).join(', ')) + '</div>' + (B.mode === 'demo' ? '<div class="tip" style="margin-top:10px">🧪 โหมดทดลอง — กดปุ่มด้านบนแล้วเลือกบัญชีครูสาธิต</div>' : '') + '</div>' + M.copyrightHTML();
  }

  /* ---------- events ---------- */
  document.addEventListener('click', async e => {
    const tb = e.target.closest('[data-tab]'); if (tb) { V.tab = tb.dataset.tab; render(); return; }
    const pk = e.target.closest('[data-pick]'); if (pk) { const s = pk.dataset.pick; if (V.sel.has(s)) V.sel.delete(s); else V.sel.add(s); render(true); return; }
    const og = e.target.closest('[data-opengroup]'); if (og) { e.preventDefault(); V.tab = 'grade'; V.gmode = 'group'; if (og.dataset.tid) V.tid = og.dataset.tid; const gg = D.groups[og.dataset.opengroup]; if (gg) V.room = gg.room; openGroup(og.dataset.opengroup); render(); return; }
    const tt = e.target.closest('[data-ttab]'); if (tt) { V.tid = tt.dataset.ttab; render(true); return; }
    const gr = e.target.closest('[data-grub]'); if (gr) { setGroupGrade('r', gr.dataset.k, +gr.dataset.v, gr.dataset.gid); return; }
    const ir = e.target.closest('[data-irub]'); if (ir) { setIndGrade('r', ir.dataset.k, +ir.dataset.v, ir.dataset.sid); return; }
    const gm = e.target.closest('[data-gmode]'); if (gm) { V.gmode = gm.dataset.gmode; render(); return; }
    const bell = e.target.closest('[data-tbell]'); if (bell) { teacherBell(); return; }
    const ps = e.target.closest('[data-pickstu]'); if (ps) { V.sid = ps.dataset.pickstu; render(true); return; }
    const dy = e.target.closest('[data-day]'); if (dy) { V.cal.sel = dy.dataset.day; render(true); return; }
    const cn = e.target.closest('[data-cal]'); if (cn) { V.cal.m += +cn.dataset.cal; if (V.cal.m < 0) { V.cal.m = 11; V.cal.y--; } if (V.cal.m > 11) { V.cal.m = 0; V.cal.y++; } render(true); return; }
    const img = e.target.closest('.thumbs img'); if (img) { const lb = document.createElement('div'); lb.className = 'lb'; lb.innerHTML = '<img src="' + img.src + '" alt="">'; lb.onclick = () => lb.remove(); document.body.appendChild(lb); return; }
    const bt = e.target.closest('[data-act]'); if (!bt) return; const a = bt.dataset.act; const A = ACTIONS[a]; if (A) { e.preventDefault(); await A(bt); }
  });
  document.addEventListener('toggle', e => { const d = e.target; if (!d.matches || !d.matches('details[data-det]')) return; V.open = V.open || new Set(); const k = d.dataset.det; if (d.open) { if (!V.open.has(k)) { V.open.add(k); render(true); } } else V.open.delete(k); }, true);
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'v_room') { V.room = t.value; V.sel.clear(); V.gid = null; render(); }
    else if (t.id === 'v_gid') { openGroup(t.value); render(); }
    else if (t.id === 'g_s') setGroupGrade('s', null, t.value); else if (t.id === 'g_c') setGroupGrade('c', null, t.value);
    else if (t.id === 'i_s') setIndGrade('s', null, t.value); else if (t.id === 'i_c') setIndGrade('c', null, t.value);
    else if (t.matches('input.gs')) setGroupGrade('s', null, t.value, t.dataset.gid); else if (t.matches('textarea.gc')) setGroupGrade('c', null, t.value, t.dataset.gid);
    else if (t.matches('input.is')) setIndGrade('s', null, t.value, t.dataset.sid); else if (t.matches('textarea.ic')) setIndGrade('c', null, t.value, t.dataset.sid);
    else if (t.matches('textarea.tc')) { const v = t.value.trim(); W(B.set('tcomments/' + t.dataset.gid + '/' + t.dataset.rid, v ? { text: v, kind: t.dataset.kind, at: Date.now(), by: tMe() } : null)); toast(v ? 'ส่งคอมเมนต์ถึงกลุ่มแล้ว' : 'ลบคอมเมนต์แล้ว'); }
    else if (t.matches('input.nopen')) { const sid = t.dataset.sid; const sg = D.grades.students[sid] = D.grades.students[sid] || {}; sg.noPenalty = t.checked || null; W(B.set('grades/students/' + sid + '/noPenalty', t.checked ? true : null)); pushFinal([sid]); render(true); }
    else if (t.matches('input.adj')) { const v = t.value === '' ? null : +t.value; W(B.set('grades/students/' + t.dataset.sid + '/adj/' + V.tid, v)); const sg = D.grades.students[t.dataset.sid] = D.grades.students[t.dataset.sid] || {}; sg.adj = Object.assign({}, sg.adj, { [V.tid]: v }); pushFinal([t.dataset.sid]); render(true); }
    else if (t.id === 'rs_file' && t.files[0]) { restoreGroupFile(t.files[0]); t.value = ''; }
  });

  const ACTIONS = {
    login: async () => { try { await B.signIn({ teacher: true }); } catch (er) { renderLogin(B.authErrorText(er)); } },
    logout: async () => { await B.signOut(); },
    import: () => importModal(),
    radd: () => studentModal(null),
    redit: bt => studentModal(bt.closest('.rrow').dataset.sid),
    rmove: bt => { const row = bt.closest('.rrow'), d = +bt.dataset.d; const sib = d < 0 ? row.previousElementSibling : row.nextElementSibling; if (!sib) return; if (d < 0) sib.before(row); else sib.after(row); saveOrder(listOrder()); render(true); },
    rsort: bt => { const by = bt.dataset.by; const act = rosterOf(V.room).slice().sort((a, b) => by === 'sid' ? String(a.sid).localeCompare(String(b.sid), 'th', { numeric: true }) : String(a.name).replace(/^(นาย|นางสาว|นาง|เด็กชาย|เด็กหญิง)/, '').localeCompare(String(b.name).replace(/^(นาย|นางสาว|นาง|เด็กชาย|เด็กหญิง)/, ''), 'th')); if (!confirm('เรียงเลขที่ใหม่ทั้งห้อง ม.' + V.room + ' ' + (by === 'sid' ? 'ตามรหัสนักเรียน' : 'ตามชื่อ (ไม่นับคำนำหน้า)') + '?')) return; saveOrder(act.map(s => s.sid)); },
    rrenum: () => saveOrder(rosterOf(V.room).map(s => s.sid)),
    rleave: bt => {
      const sid = bt.closest('.rrow').dataset.sid, s = D.roster[sid]; const note = prompt('นำ ' + s.name + ' ออกจากรายชื่อ (ย้ายโรงเรียน/ลาออก/ย้ายห้องเรียนอื่น)\nหมายเหตุ (ไม่บังคับ):', 'ย้ายออก'); if (note === null) return;
      const upd = { ['roster/' + sid + '/left']: true, ['roster/' + sid + '/leftAt']: Date.now(), ['roster/' + sid + '/leftNote']: note || '' }; const gid = D.memberOf[sid];
      if (gid) { upd['groups/' + gid + '/members/' + sid] = null; upd['groups/' + gid + '/roles/' + sid] = null; upd['memberOf/' + sid] = null; }
      W(B.update('', upd)); toast('นำออกแล้ว — กด “บันทึกเลขที่” หากต้องการเรียงเลขที่ใหม่', 3500);
    },
    rback: bt => { const sid = bt.dataset.sid; W(B.update('roster/' + sid, { left: null, leftAt: null, leftNote: null, no: rosterOf(D.roster[sid].room).length + 1 })); toast('คืนสถานะแล้ว'); },
    clearsel: () => { V.sel.clear(); render(true); },
    newgroup: () => { const n = groupsOf(V.room).length + 1; const name = prompt('ชื่อกลุ่ม', 'กลุ่ม ' + n); if (!name) return; createGroup(name.trim(), Array.from(V.sel)); V.sel.clear(); toast('สร้างกลุ่มแล้ว'); },
    addto: bt => { addToGroup(bt.dataset.id, Array.from(V.sel)); V.sel.clear(); toast('เพิ่มสมาชิกแล้ว'); },
    unmember: bt => { const { gid, sid } = bt.dataset; if (!confirm('นำ ' + (D.roster[sid] || {}).name + ' ออกจากกลุ่ม? (ข้อมูลที่บันทึกยังอยู่กับกลุ่ม)')) return; W(B.update('', { ['groups/' + gid + '/members/' + sid]: null, ['groups/' + gid + '/roles/' + sid]: null, ['memberOf/' + sid]: null })); },
    rename: bt => { const g = D.groups[bt.dataset.id]; const n = prompt('ชื่อกลุ่มใหม่', g.name); if (n) W(B.set('groups/' + bt.dataset.id + '/name', n.trim())); },
    delgroup: bt => { const gid = bt.dataset.id, g = D.groups[gid]; if (!confirm('ลบกลุ่ม “' + g.name + '”? สมาชิกจะกลับไปเป็น “ยังไม่มีกลุ่ม” แต่ข้อมูลที่กลุ่มบันทึกไว้จะยังเก็บอยู่ (กู้ได้จากไฟล์สำรอง)')) return; const upd = { ['groups/' + gid]: null }; memList(g).forEach(m => upd['memberOf/' + m.sid] = null); W(B.update('', upd)); },
    autogroup: () => {
      const free = rosterOf(V.room).filter(s => !D.memberOf[s.sid] || !D.groups[D.memberOf[s.sid]]); if (!free.length) return;
      const size = +prompt('จำนวนคนต่อกลุ่ม (' + C.group.min + '–' + C.group.max + ')', 5); if (!size) return;
      const sh = free.slice().sort(() => Math.random() - .5); const k = Math.max(1, Math.round(sh.length / size)); const buckets = Array.from({ length: k }, () => []); sh.forEach((s, i) => buckets[i % k].push(s.sid));
      let n = groupsOf(V.room).length; buckets.forEach(b => createGroup('กลุ่ม ' + (++n), b)); toast('จัด ' + k + ' กลุ่มแล้ว (แก้ไขได้)');
    },
    evnew: () => eventModal(null), evedit: bt => eventModal(bt.dataset.id), evconsent: bt => consentModal(bt.dataset.id),
    cmadd: () => commModal(null), cmedit: bt => commModal(bt.dataset.id),
    cmshow: bt => { commSet(bt.dataset.id, { hidden: null }); toast('นำกลับมาเป็นตัวเลือกแล้ว'); },
    cmdel: bt => { const id = bt.dataset.id, c = C.commAll.find(x => x.id === id); if (!c) return; const n = commUse(id);
      if (c.added && !n) { if (!confirm('ลบ “' + c.name + '” ออกถาวร? (ยังไม่มีรายการใดใช้กลุ่มนี้)')) return; commSet(id, null); toast('ลบแล้ว'); return; }
      if (!confirm('นำ “' + c.name + '” ออกจากตัวเลือกของนักเรียน?' + (n ? '\nมี ' + n + ' รายการใช้อยู่ — ข้อมูลเดิมยังแสดงชื่อนี้ตามปกติ' : '') + '\n(นำกลับมาได้ภายหลัง)')) return; commSet(id, Object.assign({ name: c.name, emoji: c.emoji, color: c.color }, { hidden: true })); toast('นำออกจากตัวเลือกแล้ว'); },
    evapprove: bt => { W(B.update('calendar/' + bt.dataset.id, { status: 'approved', approvedAt: Date.now(), approvedBy: tMe() })); toast('อนุมัติแล้ว'); syncTokens(bt.dataset.id, Object.assign({}, D.calendar[bt.dataset.id], { status: 'approved' })); },
    evics: bt => { const e = Object.assign({ id: bt.dataset.id }, D.calendar[bt.dataset.id]); M.saveBlob(new Blob([M.icsFor(e)], { type: 'text/calendar' }), 'ลงพื้นที่-' + e.date + '.ics'); },
    prevg: () => { const gs = groupsOf(V.room); const i = gs.findIndex(g => g.gid === V.gid); if (gs[i - 1]) { openGroup(gs[i - 1].gid); render(); } },
    nextg: () => { const gs = groupsOf(V.room); const i = gs.findIndex(g => g.gid === V.gid); if (gs[i + 1]) { openGroup(gs[i + 1].gid); render(); } else toast('กลุ่มสุดท้ายแล้ว'); },
    synthview: () => synthModal(),
    trestore: bt => { W(B.update('records/' + V.gid + '/' + bt.dataset.kind + '/' + bt.dataset.id, { deleted: false, restoredAt: Date.now(), updatedAt: Date.now(), updatedBy: tMe() })); W(B.set('history/' + V.gid + '/' + B.uid(), { at: Date.now(), by: tMe(), kind: bt.dataset.kind, rid: bt.dataset.id, act: 'restore', snap: null })); toast('กู้คืนแล้ว'); },
    gpdf: async bt => { const ctx = await gctx(); const old = bt.textContent; bt.disabled = true; try { await M.exportPDF(M.buildPages(D.gdata[V.gid], ctx), 'รายงาน-' + D.groups[V.gid].name + '.pdf', (i, n) => bt.textContent = 'หน้า ' + i + '/' + n); } catch (er) { toast('สร้าง PDF ไม่ได้ (ต้องมีอินเทอร์เน็ต)', 3500); } bt.disabled = false; bt.textContent = old; },
    gacdocx: async bt => { const o = bt.textContent; bt.disabled = true; bt.textContent = 'กำลังเรียบเรียง…'; try { await REPORT.exportDocx(D.gdata[V.gid], await gctx()); } catch (er) { toast('สร้างไม่สำเร็จ: ' + er.message, 4000); } bt.disabled = false; bt.textContent = o; },
    gacpdf: async bt => { const o = bt.textContent; bt.disabled = true; try { await REPORT.exportPdf(D.gdata[V.gid], await gctx(), (i, n) => bt.textContent = 'หน้า ' + i + '/' + n); } catch (er) { toast('สร้าง PDF ไม่ได้ (ต้องมีอินเทอร์เน็ต)', 3500); } bt.disabled = false; bt.textContent = o; },
    gacprev: async () => REPORT.preview(D.gdata[V.gid], await gctx()),
    gpreview: async () => M.previewPages(M.buildPages(D.gdata[V.gid], await gctx())),
    gposter: async () => { const gd = D.gdata[V.gid]; const n0 = M.listOf(gd, 'notes')[0]; const cid = ((gd.docs || {}).report || {}).posterCommunity || (n0 ? (M.commObj(n0) || {}).id : '') || 'karen'; try { await M.exportPoster(M.buildPoster(gd, await gctx(), cid), 'โปสเตอร์-' + D.groups[V.gid].name + '.png'); } catch (er) { toast('สร้างโปสเตอร์ไม่ได้', 3000); } },
    exp: bt => doExport(bt.dataset.k),
    release: bt => { const on = bt.dataset.v === '1'; const stu = rosterOf(V.room); if (!confirm((on ? 'เผยแพร่' : 'ซ่อน') + 'คะแนนของนักเรียน ม.' + V.room + ' ' + stu.length + ' คน?')) return; const upd = {}; stu.forEach(s => upd['grades/students/' + s.sid + '/released'] = on); groupsOf(V.room).forEach(g => upd['grades/groups/' + g.gid + '/released'] = on); pushFinal(stu.map(s => s.sid)); W(B.update('', upd)); toast('เรียบร้อย'); },
    settings: () => settingsModal(),
    saveinfo: () => { const o = {}; $$('[data-info]').forEach(i => o[i.dataset.info] = i.value.trim()); if (!o.teacher) { toast('กรอกชื่อครูผู้สอน'); return; } W(B.set('config/info', o)); M.applyInfo({ info: o }); toast('บันทึกข้อมูลส่วนกลางแล้ว — นักเรียนเห็นค่าใหม่ทันที'); },
    fullbackup: bt => fullBackup(bt.dataset.media === '1'),
    retry: async () => { await B.retryFailed(); render(true); },
    resetdemo: async () => { if (!confirm('ล้างข้อมูลสาธิตทั้งหมด?')) return; await B.resetDemo(); location.reload(); }
  };
  async function gctx() { const g = D.groups[V.gid], gd = D.gdata[V.gid]; const recs = []; M.LIST_KINDS.forEach(k => M.listOf(gd, k).forEach(r => recs.push(r))); const mm = mediaFor(V.gid); for (const r of recs) for (const id of M.mediaIds(r)) if (!mm[id]) { const m = await B.getMedia(V.gid, id); if (m) mm[id] = m; } return { gid: V.gid, group: g, members: memList(g), media: mm, events: D.calendar }; }

  /* ---------- start ---------- */
  (async function boot() {
    try { await B.init(); } catch (er) { $('#root').innerHTML = '<div class="card" style="margin:20px">เชื่อมต่อระบบไม่สำเร็จ: ' + esc(er.message) + '</div>'; return; }
    B.onStatus(s => { STATUS = s; const b = $('.topbar .sync'); if (b) { const [c, t] = badge(); b.className = 'sync ' + c; b.textContent = t; } });
    B.onAuth(u => {
      subs.forEach(f => f()); subs = []; gsubs.forEach(f => f()); gsubs = []; D.records = null;
      if (!u) { USER = null; renderLogin(); return; }
      if (!B.isTeacher(u.email)) { USER = null; if (B.sidFromEmail(u.email)) { location.replace('index.html'); return; } loginMsg = 'บัญชี ' + u.email + ' ไม่มีสิทธิ์ครู'; B.signOut(); return; }
      loginMsg = '';
      USER = u; startData(); render();
    });
  })();
  window.__TD = () => D; window.__TV = () => V;
})();
