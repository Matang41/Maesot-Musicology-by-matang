/* ============================================================
   consent.js — ระบบขออนุญาตผู้ปกครองก่อนลงพื้นที่
   • ผู้ปกครองเซ็นบนมือถือของนักเรียน เลือก "อนุญาต" หรือ "ไม่อนุญาต" ได้
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
  const commOf = e => (M.commObj ? M.commObj(e) : M.comm(e.community)) || {};

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
      '<div class="cl-ref">' + (signed ? 'บันทึกทางอิเล็กทรอนิกส์ผ่านแอป ' + esc(C.appName) + ' เมื่อ ' + esc(thDateTime(c.at)) + (c.method === 'paper' ? ' (ครูบันทึกจากใบกระดาษ)' : ' (ผู้ปกครองเซ็นบนอุปกรณ์ของนักเรียน)') + ' · รหัสอ้างอิง ' + esc(ev.id) + '-' + esc(stu.sid) : 'ฉบับสำหรับพิมพ์ให้ผู้ปกครองลงนาม · รหัสอ้างอิง ' + esc(ev.id) + '-' + esc(stu.sid)) + ' · ' + esc(C.copyright) + '</div>';
    return pg;
  }
  function letters(items) { const root = document.createElement('div'); root.className = 'rp-root'; items.forEach(it => root.appendChild(letterPage(it.ev, it.stu, it.c))); return root; }
  function printLetters(items) { M.printPages(letters(items)); }
  async function pdfLetters(items, name) { return M.exportPDF(letters(items), (name || 'ใบขออนุญาตผู้ปกครอง') + '.pdf'); }

  /* ---------- ฟอร์มให้ผู้ปกครองเซ็น (บนมือถือนักเรียน) ---------- */
  function formModal(o) {
    const ev = o.ev, stu = o.stu, ex = o.existing || {}; const L = letterBody(ev, stu);
    const w = modal('<h3>✍️ ขออนุญาตผู้ปกครอง</h3><div class="muted" style="margin-bottom:8px">ให้ผู้ปกครองอ่านรายละเอียด เลือก อนุญาต/ไม่อนุญาต แล้วเซ็นชื่อบนหน้าจอ</div>' +
      '<div class="cs-letter"><b>เรียน ผู้ปกครองของ ' + esc(stu.name) + '</b><br>' + esc(L.intro) + '<table class="mini" style="margin:8px 0">' + L.rows.map(r => '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>').join('') + '</table>' + esc(L.close) + '</div>' +
      '<div class="f"><label>ชื่อ-นามสกุลผู้ปกครอง <span class="req">*</span></label><input type="text" id="cs_name" value="' + esc(ex.parentName || '') + '" autocomplete="name"></div>' +
      '<div class="row"><div class="f grow"><label>ความเกี่ยวข้อง</label><select id="cs_rel">' + ['บิดา', 'มารดา', 'ผู้ปกครอง', 'ญาติ'].map(x => '<option' + (ex.relation === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div><div class="f grow"><label>เบอร์โทร (ไม่บังคับ)</label><input type="tel" id="cs_phone" value="' + esc(ex.phone || '') + '" inputmode="tel"></div></div>' +
      '<div class="lab" style="font-weight:600;margin-bottom:6px">ผู้ปกครองขอแจ้งว่า <span class="req">*</span></div><div class="cs-dec"><button type="button" data-dec="allow" class="' + (ex.decision === 'allow' ? 'on' : '') + '">✅ อนุญาต</button><button type="button" data-dec="deny" class="' + (ex.decision === 'deny' ? 'on' : '') + '">❌ ไม่อนุญาต</button></div>' +
      '<div class="f" id="cs_rw"' + (ex.decision === 'deny' ? '' : ' hidden') + '><label>เหตุผลที่ไม่อนุญาต</label><input type="text" id="cs_reason" value="' + esc(ex.reason || '') + '"></div>' +
      '<div class="f"><label>ลายเซ็นผู้ปกครอง <span class="req">*</span></label><canvas class="cs-sign" id="cs_sign"></canvas><div class="row" style="margin-top:6px"><button class="btn sec sm" id="cs_clear" type="button">ล้างลายเซ็น</button><span class="hint">เซ็นด้วยนิ้วในกรอบ</span></div></div>' +
      '<label class="chk" style="margin-bottom:12px"><input type="checkbox" id="cs_ok"><span>ข้าพเจ้าเป็นผู้ปกครองของนักเรียน ได้อ่านรายละเอียดแล้ว และเป็นผู้ลงนามด้วยตนเอง</span></label>' +
      '<button class="btn gold block" id="cs_save">บันทึกการตัดสินใจของผู้ปกครอง</button><button class="btn sec block" style="margin-top:8px" data-close>ยกเลิก</button>', { center: true });
    let dec = ex.decision || '', signed = false;
    const cv = $('#cs_sign', w); const dpr = 2; const W = cv.clientWidth || 320, H = cv.clientHeight || 150; cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr); g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111';
    let dr = false, last = null; const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.onpointerdown = e => { dr = true; last = pos(e); cv.setPointerCapture(e.pointerId); e.preventDefault(); };
    cv.onpointermove = e => { if (!dr) return; const p = pos(e); g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(p[0], p[1]); g.stroke(); last = p; signed = true; };
    cv.onpointerup = cv.onpointercancel = () => { dr = false; };
    if (ex.sign) { const im = new Image(); im.onload = () => { g.drawImage(im, 0, 0, W, H); }; im.src = ex.sign; signed = true; }
    $('#cs_clear', w).onclick = () => { g.clearRect(0, 0, cv.width, cv.height); signed = false; };
    w.addEventListener('click', e => { const b = e.target.closest('[data-dec]'); if (!b) return; dec = b.dataset.dec; $$('[data-dec]', w).forEach(x => x.classList.toggle('on', x === b)); $('#cs_rw', w).hidden = dec !== 'deny'; });
    $('#cs_save', w).onclick = async () => {
      const name = $('#cs_name', w).value.trim();
      if (!name) { toast('กรอกชื่อผู้ปกครอง'); return; } if (!dec) { toast('เลือก อนุญาต หรือ ไม่อนุญาต'); return; }
      if (!signed) { toast('ให้ผู้ปกครองเซ็นชื่อในกรอบ'); return; } if (!$('#cs_ok', w).checked) { toast('ติ๊กยืนยันว่าเป็นผู้ปกครองและลงนามเอง'); return; }
      const rec = { decision: dec, method: o.method || 'app', parentName: name, relation: $('#cs_rel', w).value, phone: $('#cs_phone', w).value.trim(), reason: dec === 'deny' ? $('#cs_reason', w).value.trim() : '', sign: cv.toDataURL('image/png'), at: Date.now(), studentName: stu.name, room: stu.room, no: stu.no, gid: stu.gid || null, eventTitle: ev.title || '', eventDate: ev.date || '', by: { sid: stu.sid, name: stu.name } };
      const btn = $('#cs_save', w); btn.disabled = true;
      try { await o.onSave(rec); w.remove(); toast(dec === 'allow' ? 'บันทึกแล้ว: ผู้ปกครองอนุญาต ✓' : 'บันทึกแล้ว: ผู้ปกครองไม่อนุญาต — ครูจะมอบหมายงานทดแทน', 3500); }
      catch (er) { btn.disabled = false; toast('บันทึกไม่สำเร็จ: ' + (er.message || er), 4000); }
    };
  }

  /* ---------- สัดส่วนการลงพื้นที่ (ใช้ปรับคะแนน) ---------- */
  function participation(events, mine) {
    const evs = events.filter(needsConsent); let allow = 0, deny = 0, pend = 0; mine = mine || {};
    evs.forEach(e => { const c = mine[e.id]; if (c && c.decision === 'allow') allow++; else if (c && c.decision === 'deny') deny++; else pend++; });
    return { total: evs.length, allow, deny, pend, ratio: evs.length ? (evs.length - deny) / evs.length : 1 };
  }

  window.CONSENT = { chip, letterBody, letterPage, letters, printLetters, pdfLetters, formModal, participation, needsConsent, DEC };
})();
