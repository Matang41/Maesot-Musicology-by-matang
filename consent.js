/* ============================================================
   consent.js — ระบบขออนุญาตผู้ปกครองก่อนลงพื้นที่
   • ครูออกลิงก์ใช้ครั้งเดียวรายคน → นักเรียนคัดลอกส่งให้ผู้ปกครอง → ผู้ปกครองเซ็นบนเครื่องของตนเอง เลือก "อนุญาต" หรือ "ไม่อนุญาต" ได้
   • ทุกการตัดสินใจบันทึกพร้อมเวลา ชื่อผู้ปกครอง และประวัติการแก้ไข
   • พิมพ์/บันทึก PDF "หนังสือขออนุญาตผู้ปกครอง" ได้ทั้งฉบับเปล่าและฉบับที่เซ็นแล้ว
   • คำนวณสัดส่วนการลงพื้นที่ เพื่อปรับคะแนนงานภาคสนามอัตโนมัติ
   © 2569 พัฒนาโดย นนทพัทธ์ วงค์มูล
   ============================================================ */
(function () {
  'use strict';
  const M = window.MC, C = M.C;
  const { $, $$, esc, thDate, thDateTime, modal, toast } = M;

  /* ---------- สไตล์เฉพาะโมดูล (ฉีดครั้งเดียว) ---------- */
  if (!document.getElementById('consent-css')) {
    const st = document.createElement('style'); st.id = 'consent-css';
    st.textContent = `
.cs-chip{display:inline-flex;align-items:center;gap:4px;border-radius:99px;padding:2px 10px;font-size:.78rem;font-weight:600}
.cs-allow{background:#d9f3ea;color:#0f8a6a}.cs-deny{background:#fde7ef;color:#b4235a}.cs-pend{background:#fff1d6;color:#8a5a00}
.cs-letter{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:.92rem;line-height:1.65;max-height:38vh;overflow:auto;margin-bottom:12px}
.cs-dec{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.cs-dec button{min-height:56px;border-radius:14px;border:2px solid var(--line);background:#fff;font-weight:700;font-size:1rem;cursor:pointer}
.cs-dec button.on[data-dec=allow]{background:#d9f3ea;border-color:#0f8a6a;color:#0f8a6a}
.cs-dec button.on[data-dec=deny]{background:#fde7ef;border-color:#b4235a;color:#b4235a}
.cs-sign{width:100%;height:150px;background:#fff;border:1.5px dashed var(--p200);border-radius:12px;touch-action:none;display:block}
.cs-table{width:100%;border-collapse:collapse;font-size:.86rem}.cs-table th,.cs-table td{border-bottom:1px solid var(--line);padding:6px;text-align:left;vertical-align:top}.cs-table th{background:var(--p50);color:var(--p600)}
/* ---- หนังสือขออนุญาต A4 ---- */
.cl-page{font:400 13.5px/1.5 'Sarabun','TH SarabunPSK',sans-serif;color:#111;background:#fff}
.cl-page .cl-head{text-align:center}.cl-page .cl-head img{height:60px}
.cl-page .cl-school{font-weight:700;font-size:16px;margin-top:4px}
.cl-page h1{font-size:17px;line-height:1.35;text-align:center;margin:6px 0 2px;font-weight:700}
.cl-page .cl-date{text-align:right;margin:6px 0 10px}
.cl-page p{margin:0 0 6px;text-indent:44px;text-align:justify}
.cl-page .cl-np{text-indent:0}
.cl-page table.cl-info{width:100%;border-collapse:collapse;margin:4px 0 6px;font-size:13px}.cl-page table.cl-info td{border:1px solid #c4b5fd;padding:1px 8px;vertical-align:top}.cl-page table.cl-info td:first-child{width:28%;background:#f6f3fc;font-weight:600}
.cl-page .cl-sig{width:46%;margin-left:auto;text-align:center;margin-top:4px;line-height:1.45}
.cl-page .cl-cut{border-top:2px dashed #999;margin:14px 0 4px;position:relative;text-align:center;font-size:12px;color:#666}
.cl-page .cl-cut span{background:#fff;padding:0 8px;position:relative;top:-11px}
.cl-page .cl-box{display:inline-block;width:14px;height:14px;border:1.5px solid #333;vertical-align:-2px;margin:0 4px 0 12px;text-align:center;line-height:12px;font-size:12px;font-weight:700}
.cl-page .cl-signimg{height:46px;max-width:220px;display:block;margin:0 auto -6px}
.cl-page .cl-line{display:inline-block;min-width:180px;border-bottom:1px dotted #333;text-align:center;padding:0 6px}
.cl-page .cl-ref{position:absolute;left:60px;right:60px;bottom:26px;font-size:10.5px;color:#777;text-align:center;border-top:1px solid #eee;padding-top:4px}
.cl-page .cl-stamp{position:absolute;top:70px;right:60px;border:2.5px solid;border-radius:10px;padding:2px 10px;font-weight:700;transform:rotate(-8deg);font-size:15px}
.cl-page .cl-stamp.allow{color:#0f8a6a;border-color:#0f8a6a}.cl-page .cl-stamp.deny{color:#b4235a;border-color:#b4235a}`;
    document.head.appendChild(st);
  }

  const DEC = { allow: ['✅ ผู้ปกครองอนุญาต', 'cs-allow'], deny: ['❌ ผู้ปกครองไม่อนุญาต', 'cs-deny'] };
  function chip(c) { if (!c || !c.decision) return '<span class="cs-chip cs-pend">⏳ ยังไม่ได้ขออนุญาต</span>'; const d = DEC[c.decision]; return '<span class="cs-chip ' + d[1] + '">' + d[0] + '</span>'; }
  const needsConsent = e => e && e.date && e.status !== 'cancelled' && e.status !== 'proposed';
  const commOf = e => (M.commObj ? M.commObj(e) : M.comm(e.community)) || (e && e._commName ? { name: e._commName } : {});

  /* ---------- เนื้อความหนังสือ ---------- */
  function letterBody(ev, stu) {
    const c = commOf(ev); const t = C.course;
    return { intro: 'ด้วยรายวิชา' + t.name + ' (' + t.code + ') ' + (t.unit || '') + ' ' + t.school + ' ได้จัดกิจกรรมให้นักเรียนออกไปศึกษาเรียนรู้นอกสถานที่ เพื่อศึกษาดนตรีพหุวัฒนธรรมในชุมชน โดยการสังเกต สัมภาษณ์ผู้รู้ และบันทึกข้อมูลภาคสนาม ซึ่งเป็นส่วนหนึ่งของการเรียนรู้และการประเมินผลในรายวิชา',
      rows: [['ชื่อนักเรียน', (stu.name || '') + '  ชั้น ม.' + (stu.room || '') + '  เลขที่ ' + (stu.no || '')], ['กลุ่ม', stu.group || '-'], ['กิจกรรม', ev.title || 'ลงพื้นที่ศึกษาดนตรี'], ['วัน เวลา', thDate(ev.date, true) + (ev.start ? ' เวลา ' + ev.start + (ev.end ? '–' + ev.end : '') + ' น.' : '')], ['สถานที่ / ชุมชน', [ev.place, c.name ? 'ชุมชน' + c.name : ''].filter(Boolean).join(' · ') || '-'], ['จุดนัดพบ / การเดินทาง', ev.meet || '-'], ['ครูผู้ควบคุม', t.teacher + (t.teacherPosition ? ' (' + t.teacherPosition + ')' : '') + (ev.teacherJoin ? ' — ร่วมเดินทางไปกับนักเรียน' : '')], ].concat(ev.note ? [['หมายเหตุ', ev.note]] : []),
      close: 'จึงเรียนมาเพื่อโปรดพิจารณาอนุญาตให้นักเรียนในปกครองของท่านเข้าร่วมกิจกรรมดังกล่าว ทั้งนี้ ท่านสามารถเลือก “อนุญาต” หรือ “ไม่อนุญาต” ได้ตามความเหมาะสม หากไม่อนุญาต นักเรียนจะได้รับมอบหมายงานทดแทนตามที่ครูกำหนด' };
  }

  /* ---------- หน้า A4 สำหรับพิมพ์ ---------- */
  function letterPage(ev, stu, c) {
    const L = letterBody(ev, stu); const t = C.course; const signed = c && c.decision;
    const pg = document.createElement('section'); pg.className = 'rp-page cl-page';
    pg.style.cssText = 'width:794px;height:1123px;padding:34px 60px 50px;position:relative;overflow:hidden;background:#fff';
    const box = v => '<span class="cl-box">' + (signed && c.decision === v ? '✓' : '') + '</span>';
    pg.innerHTML = (signed ? '<div class="cl-stamp ' + c.decision + '">' + (c.decision === 'allow' ? 'อนุญาต' : 'ไม่อนุญาต') + '</div>' : '') +
      '<div class="cl-head"><img src="icons/school-logo.png" alt=""><div class="cl-school">' + esc(t.school) + '</div></div>' +
      '<h1>หนังสือขออนุญาตผู้ปกครอง<br><span style="font-size:16px;font-weight:600">ให้นักเรียนออกไปศึกษาเรียนรู้นอกสถานที่</span></h1>' +
      '<div class="cl-date">วันที่ ' + esc(thDate(M.today(), true)) + '</div>' +
      '<p class="cl-np"><b>เรื่อง</b> ขออนุญาตให้นักเรียนลงพื้นที่ศึกษาดนตรีพหุวัฒนธรรม<br><b>เรียน</b> ผู้ปกครองของ ' + esc(stu.name || '') + '</p>' +
      '<p>' + esc(L.intro) + ' รายละเอียดดังนี้</p><table class="cl-info">' + L.rows.map(r => '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>').join('') + '</table>' +
      '<p>' + esc(L.close) + '</p>' +
      '<div class="cl-sig">ขอแสดงความนับถือ<br><span class="cl-line">&nbsp;</span><br>(' + esc(t.teacher) + ')<br>' + esc(t.teacherPosition || 'ครูผู้สอน') + '</div>' +
      '<div class="cl-cut"><span>✂ ส่วนของผู้ปกครอง</span></div>' +
      '<p class="cl-np">ข้าพเจ้า <span class="cl-line">' + esc(signed ? c.parentName : '') + '</span> เกี่ยวข้องเป็น <span class="cl-line" style="min-width:90px">' + esc(signed ? c.relation : '') + '</span> ของ ' + esc(stu.name || '') + ' ชั้น ม.' + esc(stu.room || '') + ' เลขที่ ' + esc(stu.no || '') + '</p>' +
      '<p class="cl-np">ได้รับทราบรายละเอียดกิจกรรม “' + esc(ev.title || '') + '” วันที่ ' + esc(thDate(ev.date, true)) + ' แล้ว และขอแจ้งว่า</p>' +
      '<p class="cl-np" style="margin:6px 0">' + box('allow') + ' <b>อนุญาต</b> ให้นักเรียนเข้าร่วมกิจกรรม &nbsp;&nbsp; ' + box('deny') + ' <b>ไม่อนุญาต</b> เนื่องจาก <span class="cl-line" style="min-width:220px">' + esc(signed && c.decision === 'deny' ? (c.reason || '-') : '') + '</span></p>' +
      '<p class="cl-np">เบอร์โทรศัพท์ที่ติดต่อได้ <span class="cl-line">' + esc(signed ? (c.phone || '-') : '') + '</span></p>' +
      '<div class="cl-sig">' + (signed && c.sign ? '<img class="cl-signimg" src="' + c.sign + '" alt="">' : '<br>') + 'ลงชื่อ <span class="cl-line">&nbsp;</span> ผู้ปกครอง<br>(' + (signed ? esc(c.parentName) : '<span class="cl-line">&nbsp;</span>') + ')<br>วันที่ ' + (signed ? esc(thDateTime(c.at)) : '........./........./.........') + '</div>' +
      '<div class="cl-ref">' + (signed ? 'บันทึกทางอิเล็กทรอนิกส์ผ่านแอป ' + esc(C.appName) + ' เมื่อ ' + esc(thDateTime(c.at)) + (c.method === 'paper' ? ' (ครูบันทึกจากใบกระดาษ)' : ' (ผู้ปกครองลงนามผ่านลิงก์บนอุปกรณ์ของผู้ปกครอง)' + (c.verified ? ' · ครูยืนยันแล้ว' : '')) + ' · รหัสอ้างอิง ' + esc(ev.id) + '-' + esc(stu.sid) : 'ฉบับสำหรับพิมพ์ให้ผู้ปกครองลงนาม · รหัสอ้างอิง ' + esc(ev.id) + '-' + esc(stu.sid)) + ' · ' + esc(C.copyright) + '</div>';
    return pg;
  }
  function letters(items) { const root = document.createElement('div'); root.className = 'rp-root'; items.forEach(it => root.appendChild(letterPage(it.ev, it.stu, it.c))); return root; }
  function printLetters(items) { M.printPages(letters(items)); }
  async function pdfLetters(items, name) { return M.exportPDF(letters(items), (name || 'ใบขออนุญาตผู้ปกครอง') + '.pdf'); }

  /* ---------- ลิงก์ใบอนุญาต: ctoken/{token} = รายละเอียดนัด + sign (ผู้ปกครองเขียนได้ครั้งเดียว) + verified (ครู) ---------- */
  const newToken = () => { const a = new Uint8Array(18); crypto.getRandomValues(a); return Array.from(a).map(x => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join(''); };
  const linkOf = t => location.origin + location.pathname.replace(/teacher\.html$/, 'index.html').replace(/index\.html$/, '') + '?c=' + t + (window.B && B.mode === 'demo' ? '&demo=1' : '');
  const COURSE_KEYS = ['school', 'code', 'name', 'unit', 'teacher', 'teacherPosition'];
  function tokenData(ev, stu) {
    const course = {}; COURSE_KEYS.forEach(k => { if (C.course[k] != null) course[k] = C.course[k]; });
    const o = { eid: ev.id, sid: stu.sid, gid: stu.gid || null, student: stu.name || '', room: stu.room || '', no: stu.no == null ? '' : stu.no, group: stu.group || '', title: ev.title || '', date: ev.date || '', start: ev.start || null, end: ev.end || null, community: ev.community || null, communityOther: ev.communityOther || null, commName: (commOf(ev) || {}).name || null, place: ev.place || null, meet: ev.meet || null, note: ev.note || null, teacherJoin: !!ev.teacherJoin, course };
    return JSON.parse(JSON.stringify(o));
  }
  /* แปลงข้อมูลลิงก์ → รูปแบบที่หนังสือ/การคิดคะแนนใช้ */
  function rec(ct) { const s = ct && ct.sign; if (!s) return null; return { decision: s.allow ? 'allow' : 'deny', parentName: s.name || '', relation: s.relation || '', phone: s.phone || '', reason: s.reason || '', sign: s.sig || '', at: s.at, method: s.paper ? 'paper' : 'link', verified: ct.verified || null }; }
  function fromToken(ct, blank) { return { ev: { id: ct.eid, title: ct.title, date: ct.date, start: ct.start, end: ct.end, community: ct.community, communityOther: ct.communityOther, _commName: ct.commName, place: ct.place, meet: ct.meet, note: ct.note, teacherJoin: ct.teacherJoin }, stu: { sid: ct.sid, name: ct.student, room: ct.room, no: ct.no, group: ct.group, gid: ct.gid }, c: blank ? null : rec(ct) }; }
  function status(t, ct) {
    if (!t) return ['⏳ ครูยังไม่ได้ออกลิงก์', 'cs-pend']; if (ct === undefined || ct === null) return ['กำลังโหลด…', 'cs-pend']; if (ct === false) return ['ลิงก์ถูกยกเลิก', 'cs-pend'];
    const s = ct.sign; if (!s) return ['⏳ รอผู้ปกครองตอบ', 'cs-pend'];
    if (!s.allow) return ['❌ ผู้ปกครองไม่อนุญาต', 'cs-deny'];
    return [ct.verified ? '✅ อนุญาต · ครูยืนยันแล้ว' : '✅ อนุญาต · รอครูยืนยัน', 'cs-allow'];
  }
  const statusChip = (t, ct) => { const s = status(t, ct); return '<span class="cs-chip ' + s[1] + '">' + s[0] + '</span>'; };
  async function copyLink(t) { const l = linkOf(t); try { await navigator.clipboard.writeText(l); toast('คัดลอกลิงก์แล้ว — วางส่งให้ผู้ปกครองทาง LINE ได้เลย', 3200); } catch (e) { modal('<h3>ลิงก์สำหรับผู้ปกครอง</h3><div class="muted" style="margin-bottom:6px">กดค้างที่ข้อความเพื่อคัดลอก</div><textarea rows="3" readonly style="font-size:14px">' + esc(l) + '</textarea><button class="btn sec block" data-close style="margin-top:12px">ปิด</button>', { center: true }); } }
  async function shareLink(t, ct) { const l = linkOf(t); if (navigator.share) { try { await navigator.share({ title: 'ใบขออนุญาตผู้ปกครอง', text: 'ขออนุญาตให้ ' + ((ct && ct.student) || 'นักเรียน') + ' ร่วมกิจกรรม “' + ((ct && ct.title) || 'ลงพื้นที่ศึกษาดนตรี') + '” กรุณาเปิดลิงก์เพื่ออ่านรายละเอียดและลงชื่อ', url: l }); return; } catch (e) { if (e && e.name === 'AbortError') return; } } return copyLink(t); }

  /* ---------- สัดส่วนการลงพื้นที่ (ใช้ปรับคะแนน): mine = { eid: rec } ---------- */
  function participation(events, mine) {
    const evs = events.filter(needsConsent); let allow = 0, deny = 0, pend = 0; mine = mine || {};
    evs.forEach(e => { const c = mine[e.id]; if (c && c.decision === 'allow') allow++; else if (c && c.decision === 'deny') deny++; else pend++; });
    return { total: evs.length, allow, deny, pend, ratio: evs.length ? (evs.length - deny) / evs.length : 1 };
  }

  /* ============ หน้าสาธารณะสำหรับผู้ปกครอง (index.html?c=token) — ไม่ต้องล็อกอิน เซ็นบนเครื่องผู้ปกครอง ส่งได้ครั้งเดียว ============ */
  async function publicPage() {
    let t = null; try { t = new URLSearchParams(location.search).get('c'); } catch (e) { /* ignore */ } if (!t) return false;
    const root = $('#root');
    const page = h => { root.innerHTML = '<div class="hero small"><div class="logos"><img class="big" src="icons/logo-full.png" alt=""></div><h1>ใบขออนุญาตผู้ปกครอง</h1><p>' + esc(C.course.school) + '</p></div><div class="card login-card" style="max-width:560px">' + h + '</div>' + M.copyrightHTML(); window.scrollTo(0, 0); };
    if (!/^[a-z0-9]{12,40}$/.test(t)) { page('<h3>ลิงก์ไม่ถูกต้อง</h3><p class="muted">กรุณาขอลิงก์ใหม่จากนักเรียนหรือครูผู้สอน</p>'); return true; }
    page('<div class="empty">กำลังโหลด…</div>');
    try { await B.init(); } catch (e) { page('<h3>เชื่อมต่อระบบไม่สำเร็จ</h3><p class="muted">ตรวจอินเทอร์เน็ตแล้วเปิดลิงก์ใหม่อีกครั้ง</p>'); return true; }
    let ct = null; try { ct = await Promise.race([B.get('ctoken/' + t), new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), 15000))]); } catch (e) { page('<h3>โหลดข้อมูลไม่สำเร็จ</h3><p class="muted">สัญญาณอินเทอร์เน็ตอาจช้า กรุณาเปิดลิงก์ใหม่อีกครั้ง</p><button class="btn gold block" onclick="location.reload()">↻ ลองใหม่</button>'); return true; }
    if (!ct) { page('<h3>ไม่พบใบขออนุญาตนี้</h3><p class="muted">ลิงก์อาจไม่ถูกต้อง หรือครูออกลิงก์ใหม่แทนแล้ว กรุณาขอลิงก์ล่าสุดจากนักเรียนหรือครูผู้สอน</p>'); return true; }
    if (ct.course) COURSE_KEYS.forEach(k => { if (ct.course[k]) C.course[k] = ct.course[k]; });
    const it = fromToken(ct), L = letterBody(it.ev, it.stu);
    const letter = '<div class="cs-letter" style="max-height:none"><b>เรียน ผู้ปกครองของ ' + esc(ct.student) + '</b><br>' + esc(L.intro) + '<table class="mini" style="margin:8px 0">' + L.rows.map(r => '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>').join('') + '</table>' + esc(L.close) + '</div>';
    const done = () => { const c = rec(ct); page(letter + '<div class="' + (c.decision === 'allow' ? 'tip' : 'warn-box') + '"><b>' + (c.decision === 'allow' ? '✅ บันทึกแล้ว: ผู้ปกครองอนุญาต' : '❌ บันทึกแล้ว: ผู้ปกครองไม่อนุญาต') + '</b><br>ลงชื่อโดย ' + esc(c.parentName) + (c.relation ? ' (' + esc(c.relation) + ')' : '') + ' · ' + esc(thDateTime(c.at)) + (c.reason ? '<br>เหตุผล: ' + esc(c.reason) : '') + (c.sign ? '<br><img src="' + esc(c.sign) + '" alt="ลายเซ็น" style="height:60px;background:#fff;border:1px solid var(--line);border-radius:8px;margin-top:6px">' : '') + '</div><p class="muted">ขอบคุณครับ ปิดหน้านี้ได้เลย คำตอบส่งถึงครูผู้สอนแล้วและแก้ไขเองไม่ได้ หากต้องการเปลี่ยนคำตอบ กรุณาติดต่อครูผู้สอน (' + esc(C.course.teacher) + ') เพื่อออกลิงก์ใหม่</p>'); };
    if (ct.sign) { done(); return true; }
    page(letter + '<form id="pf" novalidate><div class="f"><label>ชื่อ-นามสกุลผู้ปกครอง <span class="req">*</span></label><input type="text" id="cs_name" autocomplete="name"></div>' +
      '<div class="row wrap"><div class="f grow"><label>เกี่ยวข้องเป็น</label><select id="cs_rel">' + ['บิดา', 'มารดา', 'ผู้ปกครอง', 'ปู่ / ย่า / ตา / ยาย', 'ญาติ'].map(x => '<option>' + x + '</option>').join('') + '</select></div><div class="f grow"><label>เบอร์โทรที่ติดต่อได้ <span class="req">*</span></label><input type="tel" id="cs_phone" inputmode="tel" autocomplete="tel"></div></div>' +
      '<div class="lab" style="font-weight:600;margin-bottom:6px">ข้าพเจ้าขอแจ้งว่า <span class="req">*</span></div><div class="cs-dec"><button type="button" data-dec="allow">✅ อนุญาต</button><button type="button" data-dec="deny">❌ ไม่อนุญาต</button></div>' +
      '<div class="f" id="cs_rw" hidden><label>เหตุผลที่ไม่อนุญาต (ไม่บังคับ)</label><input type="text" id="cs_reason"></div>' +
      '<div class="f"><label>ลายมือชื่อผู้ปกครอง <span class="req">*</span> (ใช้นิ้วเซ็นในกรอบ)</label><canvas class="cs-sign" id="cs_sign" width="640" height="300"></canvas><div class="row" style="margin-top:6px"><button class="btn sec sm" id="cs_clear" type="button">ล้างลายเซ็น</button></div></div>' +
      '<label class="chk" style="margin-bottom:12px"><input type="checkbox" id="cs_ok"><span>ข้าพเจ้าเป็นผู้ปกครองของนักเรียน ได้อ่านรายละเอียดแล้ว และเป็นผู้ลงนามด้วยตนเอง</span></label>' +
      '<div class="warn-box" id="cs_err" hidden></div><button class="btn gold block" id="cs_save">ส่งคำตอบถึงครู</button><div class="muted" style="margin-top:8px">ข้อมูลนี้ใช้เป็นหลักฐานการขออนุญาตของรายวิชาเท่านั้น · ส่งแล้วแก้ไขไม่ได้</div></form>');
    let dec = '', drawn = 0, down = false; const cv = $('#cs_sign'), g = cv.getContext('2d'); g.lineWidth = 3.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111';
    const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); down = true; try { cv.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } const p = pos(e); g.beginPath(); g.moveTo(p[0], p[1]); });
    cv.addEventListener('pointermove', e => { if (!down) return; e.preventDefault(); const p = pos(e); g.lineTo(p[0], p[1]); g.stroke(); drawn++; });
    ['pointerup', 'pointercancel'].forEach(k => cv.addEventListener(k, () => { down = false; }));
    $('#cs_clear').onclick = () => { g.clearRect(0, 0, cv.width, cv.height); drawn = 0; };
    root.addEventListener('click', e => { const b = e.target.closest('[data-dec]'); if (!b) return; dec = b.dataset.dec; $$('[data-dec]', root).forEach(x => x.classList.toggle('on', x === b)); $('#cs_rw').hidden = dec !== 'deny'; });
    $('#pf').addEventListener('submit', async e => {
      e.preventDefault(); const er = $('#cs_err'), err = x => { er.textContent = x; er.hidden = false; er.scrollIntoView({ block: 'center' }); };
      const name = $('#cs_name').value.trim(), phone = $('#cs_phone').value.trim();
      if (name.length < 4) return err('กรอกชื่อ-นามสกุลผู้ปกครอง'); if (!/^[0-9+\- ]{9,15}$/.test(phone)) return err('กรอกเบอร์โทรให้ถูกต้อง (ตัวเลข 9–15 หลัก)'); if (!dec) return err('เลือก อนุญาต หรือ ไม่อนุญาต'); if (drawn < 6) return err('กรุณาเซ็นชื่อในกรอบ'); if (!$('#cs_ok').checked) return err('ติ๊กยืนยันว่าเป็นผู้ปกครองและลงนามด้วยตนเอง');
      const s = { name, relation: $('#cs_rel').value, phone, allow: dec === 'allow', reason: dec === 'deny' ? $('#cs_reason').value.trim().slice(0, 300) : '', sig: cv.toDataURL('image/png'), at: Date.now() };
      const btn = $('#cs_save'); btn.disabled = true; btn.textContent = 'กำลังส่ง…'; er.hidden = true;
      try {
        const now = await B.get('ctoken/' + t); if (!now) throw new Error('ลิงก์นี้ถูกยกเลิกแล้ว กรุณาขอลิงก์ใหม่'); if (now.sign) { ct = now; done(); return; }
        await Promise.race([B.set('ctoken/' + t + '/sign', s), new Promise((_, rj) => setTimeout(() => rj(new Error('ส่งไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วกดส่งอีกครั้ง')), 20000))]);
        ct.sign = s; done();
      } catch (ex) { btn.disabled = false; btn.textContent = 'ส่งคำตอบถึงครู'; err((ex && (ex.message || ex.code)) || 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง'); }
    });
    return true;
  }

  window.CONSENT = { chip, statusChip, status, letterBody, letterPage, letters, printLetters, pdfLetters, participation, needsConsent, DEC, newToken, linkOf, tokenData, rec, fromToken, copyLink, shareLink, publicPage };
})();
