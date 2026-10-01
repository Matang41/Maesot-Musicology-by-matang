/* ============================================================
   extras.js — ตราสัญลักษณ์ · แผนที่ลงพื้นที่ · ห้องฟัง/เกมหูทิพย์
   ใช้ร่วมกันทั้งหน้านักเรียนและหน้าครู · © 2569 พัฒนาโดย นนทพัทธ์ วงค์มูล
   ============================================================ */
(function () {
  'use strict';
  const M = window.MC, C = M.C;
  const { esc, listOf, mediaIds, mediaType, commObj, inComm, short, thDate, thDateTime } = M;

  /* ============ 1) ตราสัญลักษณ์ (Badges) ============ */
  const BADGES = [
    { id: 'first', icon: '👣', name: 'ก้าวแรก', desc: 'สร้างรายการแรกของตัวเอง', scope: 'me' },
    { id: 'notes', icon: '📝', name: 'นักบันทึกภาคสนาม', desc: 'บันทึกภาคสนาม 3 รายการ', scope: 'me', need: 3 },
    { id: 'inter', icon: '🎤', name: 'นักสัมภาษณ์', desc: 'สัมภาษณ์ผู้ให้ข้อมูลที่ยินยอมแล้ว 1 คน', scope: 'me' },
    { id: 'media', icon: '📷', name: 'ช่างภาพสนาม', desc: 'แนบภาพ/เสียง 5 ไฟล์', scope: 'me', need: 5 },
    { id: 'gps', icon: '📍', name: 'นักสำรวจ', desc: 'บันทึกพร้อมพิกัด GPS 3 รายการ', scope: 'me', need: 3 },
    { id: 'ear', icon: '🎼', name: 'หูทิพย์', desc: 'วิเคราะห์องค์ประกอบดนตรี 2 รายการ', scope: 'me', need: 2 },
    { id: 'reflect', icon: '💭', name: 'นักสะท้อนคิด', desc: 'เขียนสะท้อนคิดครบ', scope: 'me' },
    { id: 'peer', icon: '🤝', name: 'เพื่อนร่วมทีมที่ดี', desc: 'ประเมินเพื่อนครบทุกคน', scope: 'me' },
    { id: 'multi', icon: '🌏', name: 'พหุวัฒนธรรม', desc: 'กลุ่มเก็บข้อมูลได้ 3 ชุมชนขึ้นไป', scope: 'group', need: 3 },
    { id: 'discover', icon: '🧭', name: 'นักค้นพบ', desc: 'กลุ่มพบดนตรี/ชุมชนนอกรายการ', scope: 'group' },
    { id: 'team', icon: '🫂', name: 'ทีมเวิร์ก', desc: 'สมาชิกทุกคนมีผลงานของตัวเอง', scope: 'group' },
    { id: 'all', icon: '🏆', name: 'ครบทุกงาน', desc: 'กลุ่มทำงานครบทุกชิ้น', scope: 'group' }
  ];
  function badges(G, members, sid, personal) {
    const recs = []; M.LIST_KINDS.forEach(k => listOf(G, k).forEach(r => recs.push(Object.assign({ _k: k }, r))));
    const byMe = recs.filter(r => r.createdBy && r.createdBy.sid === sid);
    const hist = Object.values((G && G.history) || {});
    const mediaMe = hist.filter(h => h.act === 'media' && h.by && h.by.sid === sid).length;
    const p = personal || {}; const rf = p.reflection || {};
    const sy = M.synth(G, members); const others = (members || []).filter(m => m.sid !== sid);
    const val = {
      first: byMe.length, notes: byMe.filter(r => r._k === 'notes').length, inter: byMe.filter(r => r._k === 'interviews' && r.consent).length,
      media: mediaMe, gps: byMe.filter(r => r.gps && r.gps.lat != null).length, ear: byMe.filter(r => r._k === 'analyses').length,
      reflect: (rf.learned && rf.mywork) ? 1 : 0, peer: others.length && others.every(m => p.peer && p.peer[m.sid] && p.peer[m.sid].score) ? 1 : 0,
      multi: sy.coverage.filter(x => !x.c.custom || x.c.name).length, discover: recs.some(r => r.community === 'other' && r.communityOther) ? 1 : 0,
      team: (members || []).length && (members || []).every(m => recs.some(r => r.createdBy && r.createdBy.sid === m.sid)) ? 1 : 0,
      all: C.tasks.filter(t => t.scope === 'group').every(t => M.taskProgress(t, G, null).done) ? 1 : 0
    };
    return BADGES.map(b => { const need = b.need || 1, v = val[b.id] || 0; return Object.assign({}, b, { got: v >= need, v: Math.min(v, need), need }); });
  }
  function badgesHTML(list, compact) {
    if (compact) return list.filter(b => b.got).map(b => '<span class="bdg-mini" title="' + esc(b.name + ' — ' + b.desc) + '">' + b.icon + '</span>').join('') || '<span class="muted">—</span>';
    return '<div class="bdg-grid">' + list.map(b => '<div class="bdg' + (b.got ? ' got' : '') + '" title="' + esc(b.desc) + '"><span>' + b.icon + '</span><b>' + esc(b.name) + '</b><small>' + (b.got ? 'ได้แล้ว ✓' : esc(b.desc) + (b.need > 1 ? ' (' + b.v + '/' + b.need + ')' : '')) + '</small></div>').join('') + '</div>';
  }

  /* ============ 2) แผนที่ลงพื้นที่ ============ */
  function pointsFrom(G, gname) {
    const pts = []; M.LIST_KINDS.forEach(k => listOf(G, k).forEach(r => { if (r.gps && r.gps.lat != null) { const c = commObj(r) || {}; const s = M.FORMS[k].summary(r);
      pts.push({ lat: +r.gps.lat, lng: +r.gps.lng, color: c.color || '#6d28d9', emoji: c.emoji || '🎶', comm: c.name || '', title: s.t, sub: [gname, thDate(r.date), r.place, r.createdBy ? 'โดย ' + short(r.createdBy.name) : ''].filter(Boolean).join(' · '), kind: M.FORMS[k].title }); } }));
    return pts;
  }
  function legendHTML(pts) {
    const m = {}; pts.forEach(p => { m[p.comm] = m[p.comm] || { color: p.color, emoji: p.emoji, n: 0 }; m[p.comm].n++; });
    return '<div class="map-legend">' + Object.keys(m).map(k => '<span><i style="background:' + m[k].color + '"></i>' + m[k].emoji + ' ' + esc(k) + ' (' + m[k].n + ')</span>').join('') + '</div>';
  }
  function svgFallback(el, pts) {
    if (!pts.length) { el.innerHTML = '<div class="empty">ยังไม่มีพิกัด GPS — กด “📍 ใช้ตำแหน่งปัจจุบัน” ตอนบันทึกภาคสนาม</div>'; return; }
    const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng); let a = Math.min(...lats), b = Math.max(...lats), c = Math.min(...lngs), d = Math.max(...lngs);
    const pad = Math.max(0.002, (b - a) * 0.15, (d - c) * 0.15); a -= pad; b += pad; c -= pad; d += pad; const W = 600, H = 420;
    const X = lng => (lng - c) / (d - c) * W, Y = lat => H - (lat - a) / (b - a) * H;
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="map-svg"><rect width="' + W + '" height="' + H + '" fill="#f6f3fc"/>' + [1, 2, 3].map(i => '<line x1="0" x2="' + W + '" y1="' + H * i / 4 + '" y2="' + H * i / 4 + '" stroke="#e7e0f1"/><line y1="0" y2="' + H + '" x1="' + W * i / 4 + '" x2="' + W * i / 4 + '" stroke="#e7e0f1"/>').join('') +
      pts.map(p => '<g><circle cx="' + X(p.lng).toFixed(1) + '" cy="' + Y(p.lat).toFixed(1) + '" r="9" fill="' + p.color + '" stroke="#fff" stroke-width="2.5"><title>' + esc(p.title + ' — ' + p.sub) + '</title></circle></g>').join('') + '</svg><div class="hint">โหมดแผนที่อย่างง่าย (ไม่มีอินเทอร์เน็ต) — แตะจุดเพื่อดูชื่อ</div>';
  }
  async function renderMap(el, pts) {
    if (!el) return;
    try {
      await M.loadLibs('leaflet'); if (!window.L) throw new Error('no leaflet');
      el.innerHTML = ''; const map = L.map(el, { scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
      if (!pts.length) { map.setView([16.7131, 98.5714], 12); return; } // อ.แม่สอด
      const ms = pts.map(p => L.circleMarker([p.lat, p.lng], { radius: 9, color: '#fff', weight: 2.5, fillColor: p.color, fillOpacity: .95 }).addTo(map)
        .bindPopup('<b>' + p.emoji + ' ' + esc(p.title) + '</b><br>' + esc(p.comm) + ' · ' + esc(p.kind) + '<br><small>' + esc(p.sub) + '</small><br><a target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + p.lat + ',' + p.lng + '">เปิดใน Google Maps</a>'));
      map.fitBounds(L.featureGroup(ms).getBounds().pad(0.25), { maxZoom: 15 });
      setTimeout(() => map.invalidateSize(), 200);
    } catch (e) { svgFallback(el, pts); }
  }

  /* ============ 3) ห้องฟัง / เกมหูทิพย์ ============ */
  /* items: [{id, gid, rec, kind, comm, label, by}] — ต้องโหลดไฟล์เสียงผ่าน getMedia(gid,id) */
  function audioCandidates(G, gid, gname) {
    const out = []; M.LIST_KINDS.forEach(k => listOf(G, k).forEach(r => mediaIds(r).forEach(id => { const t = mediaType(r, id); if (t && t !== 'audio') return;
      const c = commObj(r) || {}; out.push({ id, gid, kind: k, known: t === 'audio', comm: c.name || 'ไม่ระบุ', color: c.color || '#6d28d9', emoji: c.emoji || '🎶', label: M.FORMS[k].summary(r).t, by: r.createdBy ? short(r.createdBy.name) : '', group: gname || '' }); })));
    return out;
  }
  async function resolveAudio(cands, getMedia, cache) {
    const res = [];
    for (const a of cands) { const key = a.gid + '/' + a.id; let m = cache[key]; if (!m) { m = await getMedia(a.gid, a.id); if (m) cache[key] = m; } if (m && m.type === 'audio' && m.d) res.push(Object.assign({ d: m.d }, a)); }
    return res;
  }
  function listenHTML(items, opts) {
    opts = opts || {}; if (!items.length) return '<div class="empty"><div class="big">🎧</div>ยังไม่มีไฟล์เสียง — อัดเสียงในบันทึกภาคสนาม/วิเคราะห์ดนตรี (ขออนุญาตผู้ให้ข้อมูลก่อน)</div>';
    const by = {}; items.forEach((a, i) => { (by[a.comm] = by[a.comm] || []).push(Object.assign({ i }, a)); });
    const opt = items.map((a, i) => '<option value="' + i + '">' + esc(a.emoji + ' ' + a.comm + ' · ' + a.label + (a.group ? ' · ' + a.group : '')) + '</option>').join('');
    return '<div class="card"><div class="card-title">🆚 ฟังเปรียบเทียบ A/B</div><div class="ab"><div><label>A</label><select data-ab="a">' + opt + '</select><audio controls preload="none" data-abp="a" src="' + items[0].d + '"></audio></div><div><label>B</label><select data-ab="b">' + opt.replace('value="' + Math.min(1, items.length - 1) + '"', 'value="' + Math.min(1, items.length - 1) + '" selected') + '</select><audio controls preload="none" data-abp="b" src="' + items[Math.min(1, items.length - 1)].d + '"></audio></div></div>' +
      '<div class="hint" style="margin-top:6px">ฟังแล้วเปรียบเทียบ: สีสันเสียง · ระบบเสียง/ทำนอง · จังหวะและความเร็ว · การบรรเลงร่วม · อารมณ์ของเพลง — เหมือนหรือต่างกันอย่างไร เพราะอะไร</div></div>' +
      '<div class="card gold"><div class="card-title">🎯 เกมหูทิพย์</div><div class="muted">ฟังเสียงปริศนา แล้วทายว่าเป็นดนตรีของชุมชนใด</div><div id="quiz"><button class="btn gold" data-quiz="start">▶ เริ่มเกม</button></div></div>' +
      Object.keys(by).map(k => '<div class="card"><div class="card-title">' + by[k][0].emoji + ' ' + esc(k) + ' <span class="muted">(' + by[k].length + ')</span></div>' + by[k].map(a => '<div class="lrow"><div class="grow"><b>' + esc(a.label) + '</b><div class="muted" style="font-size:.78rem">' + esc([a.group, a.by ? 'อัดโดย ' + a.by : ''].filter(Boolean).join(' · ')) + '</div></div><audio controls preload="none" src="' + a.d + '"></audio></div>').join('') + '</div>').join('');
  }
  function bindListen(root, items) {
    if (!root || !items.length) return;
    root.addEventListener('change', e => { const s = e.target.closest('[data-ab]'); if (!s) return; const p = root.querySelector('[data-abp="' + s.dataset.ab + '"]'); p.src = items[+s.value].d; });
    let q = { n: 0, ok: 0, cur: null }; const comms = Array.from(new Set(items.map(a => a.comm)));
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-quiz]'); if (!b) return; const box = root.querySelector('#quiz');
      if (b.dataset.quiz === 'start' || b.dataset.quiz === 'next') {
        if (comms.length < 2) { box.innerHTML = '<div class="tip">ต้องมีเสียงอย่างน้อย 2 ชุมชนจึงจะเล่นเกมได้</div>'; return; }
        q.cur = items[Math.floor(Math.random() * items.length)];
        const ch = comms.slice().sort(() => Math.random() - .5).slice(0, 4); if (!ch.includes(q.cur.comm)) ch[0] = q.cur.comm; ch.sort(() => Math.random() - .5);
        box.innerHTML = '<div class="quiz-score">ข้อที่ ' + (q.n + 1) + ' · ถูก ' + q.ok + '</div><audio controls autoplay src="' + q.cur.d + '"></audio><div class="chips" style="margin-top:8px">' + ch.map(c => '<button data-quiz="ans" data-c="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>';
      } else if (b.dataset.quiz === 'ans' && q.cur) {
        q.n++; const right = b.dataset.c === q.cur.comm; if (right) q.ok++;
        box.innerHTML = '<div class="quiz-score">' + (right ? '🎉 ถูกต้อง!' : '😅 ยังไม่ใช่') + ' คำตอบคือ <b>' + esc(q.cur.emoji + ' ' + q.cur.comm) + '</b> — ' + esc(q.cur.label) + '</div><div class="muted">คะแนน ' + q.ok + '/' + q.n + '</div><button class="btn gold" style="margin-top:8px" data-quiz="next">ข้อต่อไป ›</button>'; q.cur = null;
      }
    });
  }

  window.EXTRAS = { BADGES, badges, badgesHTML, pointsFrom, legendHTML, renderMap, audioCandidates, resolveAudio, listenHTML, bindListen };
})();
