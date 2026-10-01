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
  const D = { roster: {}, groups: {}, memberOf: {}, calendar: {}, grades: { groups: {}, students: {} }, config: {}, records: null, personal: {}, gdata: {} };
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
  function finalOf(sid) {
    const sg = (D.grades.students || {})[sid] || {}, gid = D.memberOf[sid], gg = ((D.grades.groups || {})[gid] || {}).tasks || {}; const out = {}; let tot = 0, any = false;
    C.tasks.forEach(t => {
      let s = null;
      if (t.scope === 'individual') { const e = sg.tasks && sg.tasks[t.id]; s = e && e.s != null && e.s !== '' ? +e.s : null; }
      else { const e = gg[t.id]; if (e && e.s != null && e.s !== '') s = Math.max(0, Math.min(maxOf(t), round1(+e.s + (+((sg.adj || {})[t.id]) || 0)))); }
      out[t.id] = s; if (s != null) { tot += s; any = true; }
    });
    return { tasks: out, total: any ? round1(tot) : null };
  }
  function pushFinal(sids) {
    const upd = {}; sids.forEach(sid => { const f = finalOf(sid); const fin = {}; Object.keys(f.tasks).forEach(k => { if (f.tasks[k] != null) fin[k] = f.tasks[k]; }); upd['grades/students/' + sid + '/final'] = Object.keys(fin).length ? fin : null; upd['grades/students/' + sid + '/total'] = f.total; upd['grades/students/' + sid + '/room'] = (D.roster[sid] || {}).room || ''; upd['grades/students/' + sid + '/gid'] = D.memberOf[sid] || null; });
    if (Object.keys(upd).length) W(B.update('', upd));
  }
  function rubricScore(t, r) { if (!t.criteria.every(c => r && r[c.k])) return null; return round1(maxOf(t) * t.criteria.reduce((a, c) => a + r[c.k], 0) / (4 * t.criteria.length)); }

  /* ---------- subscriptions ---------- */
  function sub(path, fn) { subs.push(B.on(path, v => { fn(v); schedule(); }, e => toast('อ่านข้อมูลไม่ได้ (' + path + '): ' + (e.code || e.message), 4000))); }
  function startData() {
    sub('roster', v => D.roster = v || {}); sub('groups', v => D.groups = v || {}); sub('memberOf', v => D.memberOf = v || {});
    sub('calendar', v => D.calendar = v || {}); sub('grades', v => D.grades = Object.assign({ groups: {}, students: {} }, v || {})); sub('config', v => D.config = v || {});
  }
  function needRecords() { if (D.records !== null) return; D.records = {}; sub('records', v => D.records = v || {}); }
  function openGroup(gid) {
    gsubs.forEach(f => f()); gsubs = []; V.gid = gid; if (!gid) return;
    D.gdata[gid] = D.gdata[gid] || { records: {}, docs: {}, history: {} };
    ['records', 'docs', 'history'].forEach(k => gsubs.push(B.on(k + '/' + gid, v => { D.gdata[gid][k] = v || {}; schedule(); })));
    memList(D.groups[gid]).forEach(m => gsubs.push(B.on('personal/' + m.sid, v => { D.personal[m.sid] = v || {}; schedule(); })));
  }
  let rT = null, DRAGGING = false; function schedule() { if (DRAGGING) return; cancelAnimationFrame(rT); rT = requestAnimationFrame(() => render(true)); }

  /* ---------- shell ---------- */
  const TABS = [['dash', '📋 ภาพรวม'], ['roster', '🧾 จัดการรายชื่อ'], ['groups', '👥 จัดกลุ่ม'], ['cal', '🗓 ปฏิทิน'], ['grade', '✅ ตรวจงาน'], ['scores', '📤 คะแนน/ส่งออก'], ['backup', '🛟 สำรอง/กู้คืน']];
  function badge() { if (B.mode === 'demo') return ['off', '🧪 โหมดสาธิต']; if (STATUS.failed) return ['err', '⚠ ส่งไม่สำเร็จ ' + STATUS.failed]; if (!STATUS.online) return ['pend', '📴 ออฟไลน์']; if (STATUS.pending) return ['pend', '⏫ ' + STATUS.pending]; return ['ok', '☁️ ซิงก์แล้ว']; }
  function shell(inner) {
    const [bc, bt] = badge(); const prop = Object.values(D.calendar || {}).filter(e => e.status === 'proposed').length;
    return '<header class="topbar"><img class="logo" src="icons/logo-mark-512.png" alt=""><h1>แผงควบคุมครู · ' + esc(C.appName) + '</h1><a class="sync" href="index.html#/hub">🏠 ศูนย์กลาง</a><a class="sync" href="index.html#/hub/groups">👀 มุมมองนักเรียน</a><span class="sync ' + bc + '">' + bt + '</span>' + (USER ? '<span class="muted" style="color:#ddd6fe">' + esc(USER.email) + '</span><button class="sync" data-act="logout">ออก</button>' : '') + '</header>' +
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
  const evActions = e => (e.status === 'proposed' ? '<button class="btn xs gold" data-act="evapprove" data-id="' + esc(e.id) + '">✓ อนุมัติ</button>' : '') + '<button class="btn xs sec" data-act="evedit" data-id="' + esc(e.id) + '">✎ แก้ไข</button><button class="btn xs sec" data-act="evics" data-id="' + esc(e.id) + '">📲 .ics</button>';
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
      W(B.set('calendar/' + (id || B.uid()), ne)); w.remove(); toast('บันทึกนัดแล้ว');
    };
    if (id) $('#e_del', w).onclick = () => { if (confirm('ลบนัดนี้?')) { W(B.remove('calendar/' + id)); w.remove(); } };
  }

  /* ---------- ตรวจงาน ---------- */
  function mediaFor(gid) { return MEDIA[gid] || (MEDIA[gid] = {}); }
  async function loadMedia(gid, recs) {
    const mm = mediaFor(gid); const ids = []; recs.forEach(r => M.mediaIds(r).forEach(id => { if (!mm[id] && !TRIED.has(gid + id)) { ids.push(id); TRIED.add(gid + id); } }));
    if (!ids.length) return; await Promise.all(ids.map(async id => { const m = await B.getMedia(gid, id); if (m) mm[id] = m; })); render(true);
  }
  function viewGrade() {
    const gs = groupsOf(V.room); if (V.gid && (!D.groups[V.gid] || D.groups[V.gid].room !== V.room)) V.gid = null;
    if (!V.gid && gs[0]) openGroup(gs[0].gid);
    const left = '<div class="toolbar"><div class="f"><label>ห้อง</label>' + roomSel('v_room') + '</div><div class="f grow"><label>กลุ่ม</label><select id="v_gid">' + gs.map(g => '<option value="' + g.gid + '"' + (g.gid === V.gid ? ' selected' : '') + '>' + esc(g.name) + ' (' + memList(g).length + ' คน)</option>').join('') + '</select></div><button class="btn sec" data-act="prevg">‹</button><button class="btn sec" data-act="nextg">›</button></div>';
    if (!V.gid) return shell(left + '<div class="empty">ยังไม่มีกลุ่มในห้องนี้</div>');
    const g = Object.assign({ gid: V.gid }, D.groups[V.gid]), gd = D.gdata[V.gid] || { records: {}, docs: {}, history: {} }, ms = memList(g), sy = M.synth(gd, ms), t = taskById(V.tid);
    const gg = ((D.grades.groups || {})[V.gid] || {}).tasks || {};
    const tabs = '<div class="tabs">' + C.tasks.map(x => '<button data-ttab="' + x.id + '" class="' + (x.id === V.tid ? 'on' : '') + '">' + x.icon + ' ' + esc(x.name.split(' ')[0]) + (x.scope === 'group' ? (gg[x.id] && gg[x.id].s != null ? ' ✓' : '') : '') + (g.flags && g.flags[x.id] ? ' ●' : '') + '</button>').join('') + '</div>';
    const kind = M.KIND_OF_TASK[V.tid]; const F = FORMS[kind]; const ev = {}; Object.keys(D.calendar).forEach(k => ev[k] = D.calendar[k]); const media = mediaFor(V.gid);
    let content = '<div class="card"><h3>' + t.icon + ' ' + esc(t.name) + '</h3><div class="muted">' + esc(t.indicator) + ' · ' + esc(t.desc) + '</div>' + (g.flags && g.flags[t.id] ? '<div class="tag st-ok" style="margin-top:6px">● แจ้งว่าเสร็จโดย ' + esc(short(g.flags[t.id].by.name)) + ' ' + esc(thDateTime(g.flags[t.id].at)) + '</div>' : '') + '</div>';
    if (kind === 'reflection') {
      content += ms.map(m => { const p = D.personal[m.sid] || {}; const rf = p.reflection || {}; return '<div class="card"><div class="row">' + avatar(m.name) + '<b class="grow">' + esc(m.name) + '</b>' + (p.flags && p.flags.t7 ? '<span class="tag st-ok">● ส่งแล้ว</span>' : '') + '</div>' + (M.filled(rf) ? M.renderRecord('reflection', rf, {}, {}) : '<div class="muted">ยังไม่ได้เขียน</div>') + '</div>'; }).join('');
    } else if (F.single) {
      const doc = (gd.docs || {})[kind] || {}; content += M.filled(doc) ? '<div class="card">' + M.renderRecord(kind, doc, media, { showBy: true }) + '</div>' : '<div class="empty">ยังไม่มีข้อมูล</div>';
      if (kind === 'report') content += '<div class="card"><div class="card-title">📑 รายงานวิชาการอัตโนมัติ</div><div class="row wrap" style="margin-bottom:10px"><button class="btn gold" data-act="gacdocx">⬇ Word (.docx)</button><button class="btn" data-act="gacpdf">⬇ PDF</button><button class="btn sec" data-act="gacprev">👁 ดูตัวอย่าง</button></div><div class="card-title">📒 สมุดบันทึกกลุ่ม</div><button class="btn" data-act="gpdf">⬇ รายงานกลุ่ม PDF</button> <button class="btn sec" data-act="gpreview">👁 ดูตัวอย่าง</button> <button class="btn sec" data-act="gposter">🎨 โปสเตอร์</button></div>';
    } else {
      const all = M.listOf(gd, kind, true), list = all.filter(r => !r.deleted), del = all.filter(r => r.deleted);
      content += list.length ? list.map((r, i) => { const s = F.summary(r), c = M.commObj(r); return '<div class="card" style="border-left:5px solid ' + (c ? c.color : 'var(--p200)') + '"><div class="rec-t">' + (c ? c.emoji + ' ' : '') + (i + 1) + '. ' + esc(s.t) + '</div><div class="rec-s">' + esc(s.s) + '</div>' + M.metaHTML(r) + M.renderRecord(kind, r, media, { events: ev }) + '</div>'; }).join('') : '<div class="empty">ยังไม่มีรายการ</div>';
      if (del.length) content += '<details class="card"><summary>🗑 รายการที่ถูกลบ (' + del.length + ')</summary>' + del.map(r => '<div class="row" style="padding:6px 0"><span class="grow">' + esc(F.summary(r).t) + ' <span class="muted">ลบโดย ' + esc(short((r.deletedBy || {}).name)) + ' ' + esc(thDateTime(r.deletedAt)) + '</span></span><button class="btn xs gold" data-act="trestore" data-kind="' + kind + '" data-id="' + r.id + '">กู้คืน</button></div>').join('') + '</details>';
      loadMedia(V.gid, list);
    }
    return shell(left + '<div class="row" style="margin:4px 0 8px"><h2 class="grow" style="margin:0">' + esc(g.name) + ' <span class="muted">ม.' + esc(g.room) + '</span></h2><button class="btn sm sec" data-act="synthview">🧩 ประมวลผลกลาง</button><a class="btn sm gold" href="index.html?as=' + esc(V.gid) + '">👀 มุมมองนักเรียนของกลุ่มนี้</a></div>' + tabs +
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
      '<table class="mini"><tr><th>สมาชิก</th><th>มีส่วนร่วม</th><th>เพื่อนประเมิน</th><th>ปรับ ±</th><th>ได้</th></tr>' + ms.map(m => { const sg = (D.grades.students || {})[m.sid] || {}; const adj = (sg.adj || {})[t.id]; const f = finalOf(m.sid).tasks[t.id];
        return '<tr><td>' + esc(short(m.name)) + '<div class="rolechips">' + m.roles.map(r => (roleById(r) || {}).icon || '').join(' ') + '</div></td><td><div class="bar" style="width:70px;display:inline-block;vertical-align:middle"><i style="width:' + (shareOf(m.sid) || 0) + '%"></i></div> ' + (shareOf(m.sid) || 0) + '%</td><td>' + (peerAvg(m.sid) == null ? '-' : peerAvg(m.sid)) + '</td><td><input type="number" step="0.5" class="adj" data-sid="' + m.sid + '" value="' + (adj != null ? adj : '') + '" placeholder="0" style="width:70px;min-height:34px;padding:4px"></td><td><b>' + (f == null ? '–' : f) + '</b></td></tr>'; }).join('') + '</table></div>';
  }
  function synthModal() {
    const g = D.groups[V.gid], gd = D.gdata[V.gid] || {}, ms = memList(g), sy = M.synth(gd, ms);
    modal('<div class="row"><h3 class="grow">🧩 ประมวลผลกลาง: ' + esc(g.name) + '</h3><button class="btn sm" data-close>ปิด</button></div>' +
      '<div class="card-title">การมีส่วนร่วม (จากประวัติการบันทึก)</div><table class="mini"><tr><th>สมาชิก</th><th>สร้าง</th><th>แก้ไข</th><th>แนบสื่อ</th><th>สัดส่วน</th><th>ล่าสุด</th></tr>' + sy.contrib.map(x => '<tr><td>' + esc(x.name) + '</td><td>' + (x.create || 0) + '</td><td>' + (x.edit || 0) + '</td><td>' + (x.media || 0) + '</td><td>' + x.share + '%</td><td>' + esc(x.last ? ago(x.last) : '-') + '</td></tr>').join('') + '</table>' +
      '<div class="card-title" style="margin-top:14px">เครื่องดนตรีที่วิเคราะห์</div>' + (sy.instruments.length ? '<table class="mini"><tr><th>เครื่องดนตรี</th><th>ชุมชน</th><th>ประเภท</th><th>สีสันเสียง</th></tr>' + sy.instruments.map(r => '<tr><td>' + esc(r.inst) + '</td><td>' + esc(r.c ? r.c.name : '') + '</td><td>' + esc(r.classify) + '</td><td>' + esc(r.timbre) + '</td></tr>').join('') + '</table>' : '<div class="muted">-</div>') +
      '<div class="two-col"><div><div class="card-title" style="margin-top:14px">สีสันเสียง</div>' + M.barsHTML(sy.freq.timbre) + '</div><div><div class="card-title" style="margin-top:14px">หน้าที่ดนตรี</div>' + M.barsHTML(sy.freq.funcs) + '</div></div>', { center: true, wide: true });
  }
  function setGroupGrade(field, k, v) {
    const t = taskById(V.tid), path = 'grades/groups/' + V.gid; const cur = (((D.grades.groups || {})[V.gid] || {}).tasks || {})[t.id] || {}; const e = JSON.parse(JSON.stringify(cur));
    if (field === 'r') { e.r = e.r || {}; e.r[k] = e.r[k] === v ? null : v; const s = rubricScore(t, e.r); if (s != null) e.s = s; }
    else if (field === 's') e.s = v === '' ? null : Math.max(0, Math.min(maxOf(t), +v));
    else if (field === 'c') e.c = v;
    e.at = Date.now();
    D.grades.groups[V.gid] = D.grades.groups[V.gid] || {}; D.grades.groups[V.gid].tasks = D.grades.groups[V.gid].tasks || {}; D.grades.groups[V.gid].tasks[t.id] = e;
    W(B.update(path, { room: D.groups[V.gid].room, ['tasks/' + t.id]: e })); pushFinal(memList(D.groups[V.gid]).map(m => m.sid)); render(true);
  }
  function setIndGrade(field, k, v) {
    const t = taskById(V.tid), sid = V.sid; const sg = (D.grades.students || {})[sid] || {}; const e = JSON.parse(JSON.stringify((sg.tasks && sg.tasks[t.id]) || {}));
    if (field === 'r') { e.r = e.r || {}; e.r[k] = e.r[k] === v ? null : v; const s = rubricScore(t, e.r); if (s != null) e.s = s; }
    else if (field === 's') e.s = v === '' ? null : Math.max(0, Math.min(maxOf(t), +v)); else if (field === 'c') e.c = v;
    e.at = Date.now(); D.grades.students[sid] = Object.assign({}, sg, { tasks: Object.assign({}, sg.tasks, { [t.id]: e }) });
    W(B.update('grades/students/' + sid, { ['tasks/' + t.id]: e })); pushFinal([sid]); render(true);
  }

  /* ---------- คะแนน/ส่งออก ---------- */
  function viewScores() {
    const stu = rosterOf(V.room);
    const rows = stu.map(s => { const f = finalOf(s.sid); const g = D.groups[D.memberOf[s.sid]]; const rel = ((D.grades.students || {})[s.sid] || {}).released;
      return '<tr><td>' + esc(s.no) + '</td><td class="l">' + esc(s.sid) + '</td><td class="l">' + esc(s.name) + '</td><td class="l muted">' + esc(g ? g.name : '-') + '</td>' + C.tasks.map(t => '<td>' + (f.tasks[t.id] == null ? '<span class="muted">–</span>' : f.tasks[t.id]) + '</td>').join('') + '<td><b>' + (f.total == null ? '–' : f.total) + '</b></td><td>' + (rel ? '👁' : '') + '</td></tr>'; }).join('');
    return shell('<div class="toolbar"><div class="f"><label>ห้อง</label>' + roomSel('v_room') + '</div><div class="f"><label>ปรับรวมเป็นเต็ม</label><input type="number" id="ex_scale" value="' + totalMax() + '" style="width:110px"></div><label class="chk" style="margin:0"><input type="checkbox" id="ex_only"><span>เฉพาะคะแนนรวม</span></label><div class="grow"></div><button class="btn sec" data-act="settings">⚙ คะแนนเต็ม</button></div>' +
      '<div class="card"><div class="tbl-box"><table class="t"><tr><th>เลขที่</th><th class="l">รหัส</th><th class="l">ชื่อ-นามสกุล</th><th class="l">กลุ่ม</th>' + C.tasks.map(t => '<th>' + t.icon + ' ' + esc(t.name.split(' ')[0]) + '<br>/' + maxOf(t) + '</th>').join('') + '<th>รวม<br>/' + totalMax() + '</th><th>เผยแพร่</th></tr>' + rows + '</table></div>' +
      '<div class="row wrap" style="margin-top:12px"><button class="btn gold" data-act="exp" data-k="csv">⬇ CSV (Excel/Teacher OS)</button><button class="btn sec" data-act="exp" data-k="xlsx">⬇ Excel .xlsx</button><button class="btn sec" data-act="exp" data-k="copy">📋 คัดลอกตาราง</button><div class="grow"></div><button class="btn sm sec" data-act="release" data-v="1">👁 เผยแพร่คะแนนห้องนี้</button><button class="btn sm ghost" data-act="release" data-v="0">🙈 ซ่อน</button></div>' +
      '<div class="hint" style="margin-top:6px">คะแนนงานกลุ่ม = คะแนนกลุ่ม ± ปรับรายคน · ไฟล์มี เลขที่ รหัส ชื่อ คะแนนรายชิ้น และรวม เพื่อจับคู่กับ Teacher OS ด้วยรหัสนักเรียน</div></div>');
  }
  function exportAoa(opts) {
    const scale = +opts.scale || totalMax(), only = opts.only; const head = ['เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้อง', 'กลุ่ม'];
    if (!only) C.tasks.forEach(t => head.push(t.name + ' (' + maxOf(t) + ')'));
    head.push('รวม (' + totalMax() + ')'); if (scale !== totalMax()) head.push('รวมปรับเป็น (' + scale + ')');
    const out = [head];
    rosterOf(V.room).forEach(s => { const f = finalOf(s.sid); const g = D.groups[D.memberOf[s.sid]]; const row = [s.no, s.sid, s.name, 'ม.' + s.room, g ? g.name : ''];
      if (!only) C.tasks.forEach(t => row.push(f.tasks[t.id] == null ? '' : f.tasks[t.id])); row.push(f.total == null ? '' : f.total); if (scale !== totalMax()) row.push(f.total == null ? '' : round1(f.total * scale / totalMax())); out.push(row); });
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
    const failed = await B.failedOps();
    return shell('<div class="card"><div class="card-title">💾 สำรองข้อมูลทั้งระบบ</div><div class="muted" style="margin-bottom:8px">ดาวน์โหลดรายชื่อ กลุ่ม บันทึกทั้งหมด ประวัติการแก้ไข สะท้อนคิด ปฏิทิน และคะแนน เป็นไฟล์ .json (แนะนำทุกสัปดาห์)</div><div class="row wrap"><button class="btn gold" data-act="fullbackup" data-media="0">ดาวน์โหลด (ไม่รวมภาพ/เสียง)</button><button class="btn sec" data-act="fullbackup" data-media="1">ดาวน์โหลด (รวมภาพ/เสียง — ไฟล์ใหญ่)</button></div></div>' +
      '<div class="card"><div class="card-title">↩ กู้คืนข้อมูลกลุ่มจากไฟล์</div><div class="muted" style="margin-bottom:8px">ใช้ไฟล์ “สำรองกลุ่ม” หรือ “สำเนา” ที่นักเรียนดาวน์โหลดจากแอป ระบบจะ <b>เพิ่มเฉพาะรายการที่หายไป หรือฉบับในไฟล์ใหม่กว่า</b> ไม่เขียนทับงานล่าสุด</div><input type="file" id="rs_file" accept=".json"></div>' +
      '<div class="card"><div class="card-title">สถานะการส่งข้อมูลของเครื่องนี้</div>รอส่ง ' + STATUS.pending + ' · ส่งไม่สำเร็จ ' + failed.length + (failed.length ? '<div class="warn-box" style="margin-top:6px">' + esc(failed[0].p) + ': ' + esc(failed[0].error) + '</div><button class="btn sm gold" data-act="retry">ลองส่งใหม่</button>' : '') + '</div>' +
      '<div class="card"><div class="card-title">⚙ คะแนนเต็มแต่ละงาน</div><button class="btn sec" data-act="settings">ตั้งค่าคะแนนเต็ม</button></div>' +
      (B.mode === 'demo' ? '<div class="card"><div class="card-title">🧪 โหมดสาธิต</div><button class="btn bad" data-act="resetdemo">ล้างข้อมูลสาธิตทั้งหมด</button></div>' : ''));
  }
  async function fullBackup(withMedia) {
    const keys = ['roster', 'groups', 'memberOf', 'records', 'docs', 'history', 'personal', 'calendar', 'grades', 'config']; const out = { app: 'mcm5-full', v: 2, exportedAt: Date.now(), by: USER.email };
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
  function settingsModal() {
    const w = modal('<h3>⚙ คะแนนเต็มแต่ละงาน</h3>' + C.tasks.map(t => '<div class="row" style="margin-bottom:8px"><div class="grow">' + t.icon + ' ' + esc(t.name) + ' <span class="tag">' + (t.scope === 'group' ? 'กลุ่ม' : 'รายบุคคล') + '</span></div><input type="number" step="0.5" min="0" data-max="' + t.id + '" value="' + maxOf(t) + '" style="width:90px"></div>').join('') + '<div class="muted">รวม: <b id="mx_tot">' + totalMax() + '</b></div><button class="btn gold block" style="margin-top:12px" id="mx_save">บันทึก</button>', { center: true });
    w.addEventListener('input', () => { $('#mx_tot', w).textContent = $$('[data-max]', w).reduce((a, i) => a + (+i.value || 0), 0); });
    $('#mx_save', w).onclick = () => { const mx = {}; $$('[data-max]', w).forEach(i => mx[i.dataset.max] = +i.value || 0); W(B.set('config/max', mx)); w.remove(); toast('บันทึกแล้ว'); };
  }

  /* ---------- render ---------- */
  async function render(keep) {
    if (!USER) return;
    const y = window.scrollY; let html;
    if (V.tab === 'roster') html = viewRoster(); else if (V.tab === 'groups') html = viewGroups(); else if (V.tab === 'cal') html = viewCal(); else if (V.tab === 'grade') html = viewGrade(); else if (V.tab === 'scores') html = viewScores(); else if (V.tab === 'backup') html = await viewBackup(); else html = viewDash();
    const act = document.activeElement; const actId = act && act.id; const selS = act && act.selectionStart;
    $('#root').innerHTML = html; window.scrollTo(0, keep ? y : 0); if (V.tab === 'roster') initDrag();
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
    const og = e.target.closest('[data-opengroup]'); if (og) { e.preventDefault(); V.tab = 'grade'; openGroup(og.dataset.opengroup); render(); return; }
    const tt = e.target.closest('[data-ttab]'); if (tt) { V.tid = tt.dataset.ttab; render(true); return; }
    const gr = e.target.closest('[data-grub]'); if (gr) { setGroupGrade('r', gr.dataset.k, +gr.dataset.v); return; }
    const ir = e.target.closest('[data-irub]'); if (ir) { setIndGrade('r', ir.dataset.k, +ir.dataset.v); return; }
    const ps = e.target.closest('[data-pickstu]'); if (ps) { V.sid = ps.dataset.pickstu; render(true); return; }
    const dy = e.target.closest('[data-day]'); if (dy) { V.cal.sel = dy.dataset.day; render(true); return; }
    const cn = e.target.closest('[data-cal]'); if (cn) { V.cal.m += +cn.dataset.cal; if (V.cal.m < 0) { V.cal.m = 11; V.cal.y--; } if (V.cal.m > 11) { V.cal.m = 0; V.cal.y++; } render(true); return; }
    const img = e.target.closest('.thumbs img'); if (img) { const lb = document.createElement('div'); lb.className = 'lb'; lb.innerHTML = '<img src="' + img.src + '" alt="">'; lb.onclick = () => lb.remove(); document.body.appendChild(lb); return; }
    const bt = e.target.closest('[data-act]'); if (!bt) return; const a = bt.dataset.act; const A = ACTIONS[a]; if (A) { e.preventDefault(); await A(bt); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'v_room') { V.room = t.value; V.sel.clear(); V.gid = null; render(); }
    else if (t.id === 'v_gid') { openGroup(t.value); render(); }
    else if (t.id === 'g_s') setGroupGrade('s', null, t.value); else if (t.id === 'g_c') setGroupGrade('c', null, t.value);
    else if (t.id === 'i_s') setIndGrade('s', null, t.value); else if (t.id === 'i_c') setIndGrade('c', null, t.value);
    else if (t.matches('input.adj')) { const v = t.value === '' ? null : +t.value; W(B.set('grades/students/' + t.dataset.sid + '/adj/' + V.tid, v)); const sg = D.grades.students[t.dataset.sid] = D.grades.students[t.dataset.sid] || {}; sg.adj = Object.assign({}, sg.adj, { [V.tid]: v }); pushFinal([t.dataset.sid]); render(true); }
    else if (t.id === 'rs_file' && t.files[0]) { restoreGroupFile(t.files[0]); t.value = ''; }
  });

  const ACTIONS = {
    login: async () => { try { await B.signIn({ teacher: true }); } catch (er) { renderLogin(er.message || er.code); } },
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
    evnew: () => eventModal(null), evedit: bt => eventModal(bt.dataset.id),
    evapprove: bt => { W(B.update('calendar/' + bt.dataset.id, { status: 'approved', approvedAt: Date.now(), approvedBy: tMe() })); toast('อนุมัติแล้ว'); },
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
