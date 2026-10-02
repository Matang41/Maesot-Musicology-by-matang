/* ============================================================
   core.js — ส่วนกลาง: ตัวช่วย, สกีมาแบบฟอร์ม, การแสดงผล, ประมวลผลกลาง, ปฏิทิน, รายงาน/ส่งออก
   ใช้ร่วมกันระหว่างหน้านักเรียน (index.html) และหน้าครู (teacher.html)
   ============================================================ */
(function () {
  'use strict';
  const C = window.APP_CONFIG;

  /* ---------- helpers ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = n => String(n).padStart(2, '0');
  const isoDate = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => isoDate(new Date());
  const nowTime = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const MONTHS_F = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  function thDate(iso, full) {
    if (!iso) return ''; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); if (!m) return iso;
    const y = +m[1]; return (+m[3]) + ' ' + (full ? MONTHS_F : MONTHS)[+m[2] - 1] + ' ' + (y < 2400 ? y + 543 : y);
  }
  function thDateTime(ts) { if (!ts) return ''; const d = new Date(ts); return thDate(isoDate(d)) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function ago(ts) {
    if (!ts) return ''; const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'เมื่อสักครู่'; if (s < 3600) return Math.floor(s / 60) + ' นาทีที่แล้ว'; if (s < 86400) return Math.floor(s / 3600) + ' ชม.ที่แล้ว';
    return thDateTime(ts);
  }
  /* กลุ่มวัฒนธรรม: ค่าเริ่มต้นจาก config.js + ที่ครูเพิ่ม/แก้/ซ่อนในแผงครู (config/communities) */
  const BASE_COMMS = C.communities.map(c => Object.assign({}, c)); C.commAll = C.communities.slice();
  const arr = v => Array.isArray(v) ? v.filter(Boolean) : (v && typeof v === 'object' ? Object.values(v).filter(Boolean) : []);
  function applyComms(cfg) {
    const ov = (cfg && cfg.communities) || {}; const fix = o => { const x = Object.assign({}, o); if ('instruments' in x) x.instruments = arr(x.instruments); if ('occasions' in x) x.occasions = arr(x.occasions); return x; };
    const all = BASE_COMMS.filter(c => c.id !== 'other').map(c => Object.assign({}, c, ov[c.id] ? fix(ov[c.id]) : {}, { builtin: true }));
    Object.keys(ov).filter(id => id !== 'other' && !BASE_COMMS.some(c => c.id === id) && ov[id] && ov[id].name).sort((a, b) => (ov[a].at || 0) - (ov[b].at || 0)).forEach(id => all.push(Object.assign({ id, emoji: '🎶', color: '#7e5a9b', instruments: [], occasions: [] }, fix(ov[id]), { added: true })));
    const other = BASE_COMMS.find(c => c.id === 'other');
    C.commAll = all.concat(other ? [other] : []); C.communities = C.commAll.filter(c => !c.hidden);
  }
  const comm = id => C.commAll.find(c => c.id === id) || null;
  const commName = id => (comm(id) || {}).name || '';
  /* ชุมชนที่นักเรียนระบุเอง ("อื่น ๆ") → ถือเป็นชุมชนแยกตามชื่อ id = 'other:<ชื่อ>' */
  function commObj(r) {
    if (!r) return null;
    if (r.community === 'other') { const o = comm('other') || {}; const n = String(r.communityOther || '').trim(); return { id: 'other:' + (n || '-'), name: n || 'อื่น ๆ (ยังไม่ระบุชื่อ)', emoji: '🎶', color: o.color || '#7e5a9b', instruments: [], occasions: [], custom: true }; }
    return comm(r.community);
  }
  const commLabel = r => (commObj(r) || {}).name || '';
  const commById = id => String(id || '').indexOf('other:') === 0 ? commObj({ community: 'other', communityOther: String(id).slice(6) }) : comm(id);
  const inComm = (r, c) => c && (c.custom ? (r.community === 'other' && (commObj(r) || {}).id === c.id) : r.community === c.id);
  const taskById = id => C.tasks.find(t => t.id === id);
  const roleById = id => C.roles.find(r => r.id === id);
  const nl2 = s => esc(s).replace(/\n/g, '<br>');
  const short = n => String(n || '').replace(/^(นาย|นางสาว|นาง|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.)\s*/, '').split(' ')[0];
  const initials = n => short(n).slice(0, 2);

  /* ---------- ตัวเลือก ---------- */
  const OPT = {
    classify: ['เครื่องดีด/สี (เครื่องสาย)', 'เครื่องเป่า', 'เครื่องตี (กลอง ฆ้อง ฉาบ)', 'การขับร้อง', 'อื่น ๆ'],
    timbre: ['ใส', 'ทุ้ม', 'นุ่ม', 'แหลม', 'กังวาน', 'สั้น/แห้ง', 'หนา', 'บางเบา', 'สั่นพริ้ว', 'ดุดัน'],
    scale: ['เพนทาโทนิก (5 เสียง)', '7 เสียง (ไดอะโทนิก)', 'มีเสียงเอื้อน/เสียงเลื่อน', 'ไม่ชัดเจน (เป็นเสียงจังหวะ)', 'ไม่แน่ใจ'],
    tempo: ['ช้า', 'ปานกลาง', 'เร็ว', 'เปลี่ยนความเร็ว'],
    meter: ['2 จังหวะ', '3 จังหวะ', '4 จังหวะ', 'อิสระ/ไม่ตายตัว', 'ไม่แน่ใจ'],
    texture: ['เดี่ยว', 'เล่นรวมวง/ประสานเสียง', 'ถาม-ตอบ', 'ร้องนำ-ร้องตาม', 'ไม่แน่ใจ'],
    mood: ['สงบ', 'ศักดิ์สิทธิ์', 'รื่นเริง', 'โศกเศร้า', 'ฮึกเหิม', 'อบอุ่น', 'ลึกลับ', 'ผ่อนคลาย'],
    funcs: ['สื่อสารกับบรรพบุรุษ/ผู้ล่วงลับ', 'กำกับจังหวะพิธี', 'สร้างความสามัคคี', 'ความบันเทิง', 'ถ่ายทอดประวัติ/ความรู้', 'บอกสถานะทางสังคม', 'ขับไล่/คุ้มครอง', 'เกี้ยวพาราสี', 'ศาสนา/ความเชื่อ'],
    threats: ['ขาดผู้สืบทอด', 'เด็กรุ่นใหม่นิยมดนตรีสมัยใหม่', 'วัสดุทำเครื่องดนตรีหายาก', 'ขาดงบประมาณ/เวทีแสดง', 'ความเชื่อ/ศาสนาเปลี่ยนไป', 'การเคลื่อนย้ายถิ่น/ชายแดน', 'ไม่มีบันทึกเป็นลายลักษณ์อักษร'],
    ich: ['ศิลปะการแสดง', 'ประเพณี/พิธีกรรม', 'งานช่างฝีมือดั้งเดิม', 'ภาษา/วรรณกรรมปากเปล่า', 'ความรู้เกี่ยวกับธรรมชาติ']
  };
  const Q = [
    'คุณเริ่มเล่น/ขับร้อง/เรียนรู้ดนตรีนี้ตั้งแต่เมื่อใด และเรียนรู้จากใคร',
    'ดนตรี/เครื่องดนตรีนี้ใช้ในโอกาสหรือพิธีกรรมใดบ้าง',
    'ใครเป็นผู้เล่นหรือขับร้องได้ และมีข้อห้าม/ข้อควรปฏิบัติอะไรหรือไม่',
    'เครื่องดนตรีทำจากวัสดุอะไร ใครเป็นผู้ทำ และใช้เวลานานเท่าใด',
    'ดนตรีนี้สื่อความหมายหรือเล่าเรื่องอะไรให้คนในชุมชน',
    'ในช่วงหลายปีที่ผ่านมา ดนตรีนี้เปลี่ยนไปอย่างไร และคนรุ่นใหม่สนใจแค่ไหน',
    'ดนตรีช่วยให้คนต่างวัฒนธรรมในแม่สอดอยู่ร่วมกันได้อย่างไร',
    'อยากให้คนรุ่นใหม่ช่วยสืบสานหรือเผยแพร่ดนตรีนี้อย่างไร'
  ];

  /* ---------- สกีมาแบบฟอร์ม ---------- */
  const FORMS = {
    notes: {
      title: 'บันทึกภาคสนาม', icon: '📓', task: 't1', scope: 'group',
      fields: [
        { k: 'community', t: 'select', label: 'ชุมชน/กลุ่มวัฒนธรรม', opts: 'comm', req: 1 },
        { k: 'communityOther', t: 'text', label: '➕ ระบุชื่อกลุ่มดนตรี/ชุมชนที่พบ', list: 'otherComm', ph: 'เช่น มอญ, ลาหู่, ดนตรีร่วมสมัย…', req: 1, showIf: 'other' },
        { k: 'eventId', t: 'select', label: 'การลงพื้นที่ตามปฏิทิน', opts: 'events' },
        { k: 'date', t: 'date', label: 'วันที่' },
        { k: 'time', t: 'time', label: 'เวลา' },
        { k: 'place', t: 'text', label: 'สถานที่ (หมู่บ้าน วัด มัสยิด ศาลเจ้า ศูนย์การเรียนรู้)' },
        { k: 'gps', t: 'gps', label: 'พิกัด GPS' },
        { k: 'informant', t: 'text', label: 'บุคคลที่พบ / ผู้ให้ข้อมูล (ถ้ามี)' },
        { k: 'topic', t: 'text', label: 'หัวข้อที่ไปดู/ฟัง (เช่น การซ้อมเตหน่ากู)', req: 1 },
        { k: 'observe', t: 'area', label: '👀 สิ่งที่เห็น', ph: 'เครื่องดนตรี ผู้เล่น การแต่งกาย สถานที่ ขั้นตอน…' },
        { k: 'heard', t: 'area', label: '👂 สิ่งที่ได้ยิน', ph: 'เสียง จังหวะ ทำนอง ความดัง-เบา การร้อง…' },
        { k: 'felt', t: 'area', label: '💭 ความรู้สึก / คำถามที่อยากถามต่อ' },
        { k: 'media', t: 'media', label: 'ภาพ / เสียง' }
      ],
      summary: r => ({ t: r.topic || r.place || '(ยังไม่ตั้งหัวข้อ)', s: [commLabel(r), thDate(r.date), r.place].filter(Boolean).join(' · ') })
    },
    interviews: {
      title: 'ใบยินยอม & แบบสัมภาษณ์', icon: '🤝', task: 't2', scope: 'group',
      fields: [
        { k: 'community', t: 'select', label: 'ชุมชน/กลุ่มวัฒนธรรม', opts: 'comm', req: 1 },
        { k: 'communityOther', t: 'text', label: '➕ ระบุชื่อกลุ่มดนตรี/ชุมชนที่พบ', list: 'otherComm', ph: 'เช่น มอญ, ลาหู่, ดนตรีร่วมสมัย…', req: 1, showIf: 'other' },
        { k: 'date', t: 'date', label: 'วันที่สัมภาษณ์' },
        { k: 'place', t: 'text', label: 'สถานที่' },
        { t: 'section', label: '1) ผู้ให้ข้อมูลและความยินยอม', hint: 'อธิบายว่าทำเพื่อการเรียนวิชาดนตรี ไม่ใช้เพื่อการค้า ผู้ให้ข้อมูลปฏิเสธหรือหยุดได้ทุกเมื่อ' },
        { k: 'informant', t: 'text', label: 'ชื่อ หรือ นามสมมติของผู้ให้ข้อมูล', req: 1 },
        { k: 'age', t: 'number', label: 'อายุโดยประมาณ (ปี)' },
        { k: 'role', t: 'text', label: 'บทบาทในชุมชน (เช่น ผู้อาวุโส ช่างทำแคน ผู้ประกอบพิธี)' },
        { k: 'minor', t: 'check', label: 'ผู้ให้ข้อมูลอายุต่ำกว่า 18 ปี (ผู้ปกครองต้องรับทราบ/ลงนามแทน)' },
        { k: 'consent', t: 'check', label: 'ชี้แจงวัตถุประสงค์แล้ว ผู้ให้ข้อมูลสมัครใจให้ข้อมูลเพื่อการเรียน', req: 1 },
        { k: 'allowPhoto', t: 'check', label: 'ยินยอมให้ถ่ายภาพ' },
        { k: 'allowAudio', t: 'check', label: 'ยินยอมให้บันทึกเสียง' },
        { k: 'allowPublish', t: 'check', label: 'ยินยอมให้ระบุชื่อในรายงาน (ถ้าไม่ติ๊ก รายงานจะแสดงเป็น "ผู้ให้ข้อมูล")' },
        { k: 'sign', t: 'sign', label: '✍️ ลายเซ็นผู้ให้ข้อมูล (หรือผู้ปกครอง)' },
        { t: 'section', label: '2) คำถามสัมภาษณ์' },
        ...Q.map((q, i) => ({ k: 'q' + (i + 1), t: 'area', label: (i + 1) + '. ' + q, rows: 3 })),
        { k: 'q9', t: 'text', label: '9. คำถามของกลุ่มเราเอง (พิมพ์คำถาม)' },
        { k: 'a9', t: 'area', label: 'คำตอบข้อ 9', rows: 3 },
        { k: 'media', t: 'media', label: 'ภาพ / เสียงขณะสัมภาษณ์ (เฉพาะที่ได้รับอนุญาต)' }
      ],
      summary: r => ({ t: r.informant || '(ยังไม่ระบุผู้ให้ข้อมูล)', s: [commLabel(r), thDate(r.date), r.consent ? '✓ ยินยอมแล้ว' : '⚠ ยังไม่ติ๊กยินยอม'].filter(Boolean).join(' · ') })
    },
    analyses: {
      title: 'วิเคราะห์องค์ประกอบดนตรี', icon: '🎻', task: 't3', scope: 'group',
      fields: [
        { k: 'community', t: 'select', label: 'ชุมชน/กลุ่มวัฒนธรรม', opts: 'comm', req: 1 },
        { k: 'communityOther', t: 'text', label: '➕ ระบุชื่อกลุ่มดนตรี/ชุมชนที่พบ', list: 'otherComm', ph: 'เช่น มอญ, ลาหู่, ดนตรีร่วมสมัย…', req: 1, showIf: 'other' },
        { k: 'instrument', t: 'text', label: 'ชื่อเครื่องดนตรี / บทเพลง', req: 1, list: 'instruments' },
        { k: 'classify', t: 'select', label: 'ประเภท', opts: OPT.classify },
        { k: 'material', t: 'text', label: 'วัสดุที่ใช้ทำ' },
        { k: 'technique', t: 'area', label: 'วิธีเล่น/วิธีขับร้อง', rows: 2 },
        { t: 'section', label: 'องค์ประกอบของเสียง (ฟังจริง แล้วเลือก)' },
        { k: 'timbre', t: 'chips', label: 'ลักษณะสีสันเสียง (เลือกได้หลายข้อ)', opts: OPT.timbre },
        { k: 'scale', t: 'select', label: 'ระบบเสียง/บันไดเสียง', opts: OPT.scale },
        { k: 'tempo', t: 'select', label: 'ความเร็ว', opts: OPT.tempo },
        { k: 'meter', t: 'select', label: 'ลักษณะจังหวะ', opts: OPT.meter },
        { k: 'texture', t: 'select', label: 'การเล่นรวมกัน', opts: OPT.texture },
        { k: 'mood', t: 'chips', label: 'บรรยากาศ/อารมณ์เพลง', opts: OPT.mood },
        { t: 'section', label: 'วิเคราะห์และเปรียบเทียบ' },
        { k: 'role', t: 'area', label: 'หน้าที่ของเครื่องดนตรี/เสียงนี้ในวงหรือพิธี', rows: 2, ph: 'ดำเนินทำนองหลัก / กำกับจังหวะ / ประสานเสียง / ให้สัญญาณ…' },
        { k: 'compare', t: 'area', label: 'เปรียบเทียบกับเครื่อง/วงดนตรีไทยหรือสากลที่เคยเรียน', rows: 3, ph: 'เหมือนหรือต่างกันอย่างไร เพราะเหตุใด' },
        { k: 'media', t: 'media', label: 'ภาพ / เสียงตัวอย่าง' }
      ],
      summary: r => ({ t: r.instrument || '(ยังไม่ระบุเครื่องดนตรี)', s: [commLabel(r), r.classify, r.tempo].filter(Boolean).join(' · ') })
    },
    roles: {
      title: 'บทบาทดนตรีในสังคม/พิธีกรรม', icon: '🏮', task: 't4', scope: 'group',
      fields: [
        { k: 'community', t: 'select', label: 'ชุมชน/กลุ่มวัฒนธรรม', opts: 'comm', req: 1 },
        { k: 'communityOther', t: 'text', label: '➕ ระบุชื่อกลุ่มดนตรี/ชุมชนที่พบ', list: 'otherComm', ph: 'เช่น มอญ, ลาหู่, ดนตรีร่วมสมัย…', req: 1, showIf: 'other' },
        { k: 'occasion', t: 'text', label: 'โอกาส/พิธีกรรม/เทศกาล', req: 1, list: 'occasions' },
        { k: 'who', t: 'text', label: 'ผู้เล่น/ผู้ร่วมพิธี (ใคร เพศ อายุ สถานะ)' },
        { k: 'steps', t: 'area', label: 'ลำดับขั้นตอนของพิธี/งาน และดนตรีเข้ามามีส่วนตรงไหน', rows: 4 },
        { k: 'funcs', t: 'chips', label: 'หน้าที่ของดนตรีในโอกาสนี้ (เลือกได้หลายข้อ)', opts: OPT.funcs },
        { k: 'meaning', t: 'area', label: 'ความหมายหรือความเชื่อที่อยู่เบื้องหลัง', rows: 3 },
        { k: 'taboo', t: 'area', label: 'ข้อห้าม/ข้อควรปฏิบัติของผู้ชม', rows: 2 },
        { k: 'change', t: 'area', label: 'ที่ผ่านมาเปลี่ยนไปอย่างไร และปัจจัยที่ทำให้เปลี่ยน', rows: 3 },
        { k: 'peace', t: 'area', label: '🕊️ ดนตรีนี้ช่วยให้คนต่างวัฒนธรรมเข้าใจ/อยู่ร่วมกันได้อย่างไร', rows: 3 },
        { k: 'media', t: 'media', label: 'ภาพ / เสียง' }
      ],
      summary: r => ({ t: r.occasion || '(ยังไม่ระบุโอกาส)', s: [commLabel(r), r.who].filter(Boolean).join(' · ') })
    },
    conservation: {
      title: 'แนวทางอนุรักษ์ & สันติภาพ', icon: '🕊️', task: 't5', single: true, scope: 'group',
      fields: [
        { t: 'section', label: 'ดนตรีท้องถิ่นที่กลุ่มเลือกพูดถึง' },
        { k: 'focus', t: 'text', label: 'ดนตรี/เครื่องดนตรี/ชุมชนที่เลือก', req: 1 },
        { k: 'ich', t: 'chips', label: 'จัดเป็นมรดกทางวัฒนธรรมที่จับต้องไม่ได้ (ICH) ด้านใด', opts: OPT.ich },
        { k: 'threats', t: 'chips', label: 'ปัจจัยที่ทำให้ดนตรีนี้เสี่ยงเลือนหาย', opts: OPT.threats },
        { k: 'why', t: 'area', label: 'ทำไมดนตรีนี้จึงควรได้รับการอนุรักษ์', rows: 3, req: 1 },
        { t: 'section', label: 'ข้อเสนอแนวทางอนุรักษ์ (อย่างน้อย 1 ข้อ)' },
        { k: 'idea1', t: 'text', label: 'ข้อเสนอที่ 1', req: 1 }, { k: 'how1', t: 'area', label: 'ทำอย่างไร / ใครทำ / ต้องใช้อะไร', rows: 2 },
        { k: 'idea2', t: 'text', label: 'ข้อเสนอที่ 2' }, { k: 'how2', t: 'area', label: 'ทำอย่างไร / ใครทำ / ต้องใช้อะไร', rows: 2 },
        { k: 'idea3', t: 'text', label: 'ข้อเสนอที่ 3' }, { k: 'how3', t: 'area', label: 'ทำอย่างไร / ใครทำ / ต้องใช้อะไร', rows: 2 },
        { k: 'digital', t: 'area', label: '💻 ไอเดียคอนเทนต์ดิจิทัลเพื่อเผยแพร่ (คลิป โปสเตอร์ Padlet เพลย์ลิสต์ ฯลฯ)', rows: 3 },
        { t: 'section', label: 'ดนตรีกับสันติภาพและการอยู่ร่วมกัน' },
        { k: 'peace', t: 'area', label: 'ดนตรีช่วยสร้างความเข้าใจระหว่างกลุ่มวัฒนธรรมในแม่สอดได้อย่างไร', rows: 4 },
        { k: 'message', t: 'area', label: '✉️ ข้อความถึงเพื่อนร่วมโรงเรียนและคนรุ่นใหม่', rows: 3 }
      ]
    },
    report: {
      title: 'รายงานกลุ่ม', icon: '📄', task: 't6', single: true, scope: 'group',
      fields: [
        { k: 'title', t: 'text', label: 'ชื่อรายงาน', req: 1, ph: 'เช่น เสียงที่เชื่อมใจ: ดนตรีพหุวัฒนธรรมแม่สอด' },
        { k: 'intro', t: 'area', label: 'คำนำ/ความสำคัญ — ทำไมกลุ่มเราจึงไปศึกษาดนตรีพหุวัฒนธรรมแม่สอด', rows: 4, req: 1 },
        { k: 'synthesis', t: 'area', label: 'อภิปรายผลจากห้องประมวลผลกลาง — เครื่องดนตรีของแต่ละชุมชนเหมือน/ต่างกันอย่างไร', rows: 5 },
        { k: 'conclusion', t: 'area', label: 'สรุปผลการศึกษา — ข้อค้นพบสำคัญของกลุ่ม', rows: 5, req: 1 },
        { k: 'posterCommunity', t: 'select', label: 'โปสเตอร์ Padlet: ชุมชนที่จะนำเสนอ', opts: 'comm' },
        { k: 'posterQuote', t: 'text', label: 'โปสเตอร์: ข้อความเด็ดจากการลงพื้นที่ (1 ประโยค)' }
      ]
    },
    reflection: {
      title: 'สะท้อนคิด & ประเมินเพื่อน', icon: '💭', task: 't7', single: true, scope: 'individual',
      fields: [
        { k: 'before', t: 'scale', n: 5, label: 'ก่อนลงพื้นที่ ฉันเปิดใจรับดนตรีต่างวัฒนธรรมระดับใด (1 น้อย – 5 มาก)' },
        { k: 'after', t: 'scale', n: 5, label: 'หลังลงพื้นที่ ฉันเปิดใจรับดนตรีต่างวัฒนธรรมระดับใด' },
        { k: 'mywork', t: 'area', label: '🙋 สิ่งที่ฉันทำให้กลุ่ม (บทบาท/ชิ้นงานที่รับผิดชอบ)', rows: 3, req: 1 },
        { k: 'learned', t: 'area', label: 'สิ่งสำคัญที่สุดที่ฉันได้เรียนรู้', rows: 3, req: 1 },
        { k: 'surprise', t: 'area', label: 'สิ่งที่ทำให้ฉันประหลาดใจหรือเปลี่ยนความคิด', rows: 3 },
        { k: 'next', t: 'area', label: 'หลังจากนี้ ฉันจะนำสิ่งที่เรียนรู้ไปใช้อย่างไร', rows: 3 }
      ]
    }
  };
  const KIND_OF_TASK = {}; Object.keys(FORMS).forEach(k => KIND_OF_TASK[FORMS[k].task] = k);
  const LIST_KINDS = ['notes', 'interviews', 'analyses', 'roles'];

  /* ---------- ข้อมูลกลุ่ม ---------- */
  function listOf(G, kind, withDeleted) {
    const o = (G && G.records && G.records[kind]) || {};
    return Object.keys(o).map(k => Object.assign({ id: k }, o[k])).filter(r => withDeleted || !r.deleted).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }
  function otherNames(G) { const s = new Set(); LIST_KINDS.forEach(k => listOf(G, k).forEach(r => { if (r.community === 'other' && r.communityOther) s.add(String(r.communityOther).trim()); })); return Array.from(s); }
  function commList(G) { const base = C.commAll.filter(c => c.id !== 'other'); const ex = {}; LIST_KINDS.forEach(k => listOf(G, k).forEach(r => { if (r.community === 'other') { const c = commObj(r); ex[c.id] = c; } })); return base.concat(Object.values(ex)); }
  const mAt = v => (v && typeof v === 'object') ? (v.at || 0) : (v || 0);
  const mediaIds = rec => { const m = rec && rec.media; if (!m) return []; if (Array.isArray(m)) return m.filter(Boolean); return Object.keys(m).filter(k => m[k]).sort((a, b) => mAt(m[a]) - mAt(m[b])); };
  /* ประเภทสื่อจากข้อมูลในรายการ (รายการใหม่เก็บ {at,t,by}); รายการเก่าคืนค่า '' = ต้องโหลดไฟล์ก่อนจึงรู้ */
  const mediaType = (rec, id) => { const v = rec && rec.media && rec.media[id]; return (v && typeof v === 'object' && v.t) || ''; };
  function filled(o) { return !!o && Object.keys(o).some(k => { if (k[0] === '_') return false; const v = o[k]; return Array.isArray(v) ? v.length : (v !== '' && v != null && v !== false && typeof v !== 'object'); }); }
  function taskProgress(t, G, personal) {
    const docs = (G && G.docs) || {};
    switch (t.kind) {
      case 'notes': case 'analyses': case 'roles': case 'interviews': { const all = listOf(G, t.kind); const n = all.filter(r => checkRecord(t.kind, r).valid).length; return { n, min: t.min, done: n >= t.min, drafts: all.length - n }; }
      case 'conservation': { const c = docs.conservation || {}; const d = !!(c.focus && c.why && c.idea1); return { n: d ? 1 : 0, min: 1, done: d, partial: filled(c) }; }
      case 'report': { const c = docs.report || {}; const d = !!(c.title && c.intro && c.conclusion); return { n: d ? 1 : 0, min: 1, done: d, partial: filled(c) }; }
      case 'reflection': { const c = (personal && personal.reflection) || {}; const d = !!(c.learned && c.mywork); return { n: d ? 1 : 0, min: 1, done: d, partial: filled(c) }; }
    }
    return { n: 0, min: 1, done: false };
  }

  /* ---------- ตรวจความครบถ้วนของข้อมูล ----------
     req  = ข้อมูลขั้นต่ำ (ช่องที่มี *) — ขาดแล้วรายการเป็น "ร่าง" ยังไม่นับเป็นชิ้นงาน
     key  = รายละเอียดสำคัญ — ขาดได้ถ้านักเรียน "ยืนยัน" พร้อมเหตุผล (เก็บใน _skip ครูเห็น) */
  const KEYF = {
    notes: [['gps', '📍 พิกัด GPS'], ['place', 'สถานที่'], ['observe', 'สิ่งที่เห็น'], ['heard', 'สิ่งที่ได้ยิน'], ['media', 'ภาพหรือเสียงประกอบอย่างน้อย 1 ไฟล์']],
    interviews: [['sign', 'ลายเซ็นผู้ให้ข้อมูล'], ['date', 'วันที่สัมภาษณ์'], ['place', 'สถานที่'], ['answers', 'คำตอบสัมภาษณ์อย่างน้อย 3 ข้อ']],
    analyses: [['classify', 'ประเภทเครื่องดนตรี'], ['timbre', 'ลักษณะสีสันเสียง'], ['tempo', 'ความเร็ว'], ['role', 'หน้าที่ในวงหรือพิธี'], ['compare', 'การเปรียบเทียบกับดนตรีที่เคยเรียน']],
    roles: [['who', 'ผู้เล่น/ผู้ร่วมพิธี'], ['steps', 'ลำดับขั้นตอนของพิธี'], ['funcs', 'หน้าที่ของดนตรี'], ['meaning', 'ความหมาย/ความเชื่อ'], ['peace', 'ดนตรีกับการอยู่ร่วมกัน']],
    conservation: [['ich', 'ประเภทมรดกวัฒนธรรม (ICH)'], ['threats', 'ปัจจัยเสี่ยง'], ['how1', 'วิธีดำเนินการของข้อเสนอที่ 1'], ['peace', 'ดนตรีกับสันติภาพ']],
    report: [['synthesis', 'อภิปรายผลจากห้องประมวลผลกลาง']],
    reflection: [['before', 'ระดับการเปิดใจก่อนลงพื้นที่'], ['after', 'ระดับการเปิดใจหลังลงพื้นที่'], ['surprise', 'สิ่งที่ทำให้ประหลาดใจ'], ['next', 'การนำไปใช้']]
  };
  const SKIP_WHY = { gps: ['ไม่มีสัญญาณ GPS/อินเทอร์เน็ต', 'บันทึกย้อนหลังที่โรงเรียน/ที่บ้าน', 'ไม่ได้ลงพื้นที่ (ผู้ปกครองไม่อนุญาต)', 'เจ้าของสถานที่ไม่สะดวกให้ระบุตำแหน่ง'], media: ['ไม่ได้รับอนุญาตให้ถ่ายภาพ/บันทึกเสียง', 'อุปกรณ์ไม่พร้อม', 'ใช้ไฟล์ของเพื่อนในรายการอื่น'], sign: ['ผู้ให้ข้อมูลไม่สะดวกเซ็น (ยินยอมด้วยวาจา)', 'สัมภาษณ์ทางโทรศัพท์/ออนไลน์'], _: ['ยังไม่มีข้อมูลส่วนนี้', 'ไม่เกี่ยวข้องกับสิ่งที่ศึกษา', 'เพื่อนในกลุ่มจะมาเพิ่มภายหลัง'] };
  const has = v => Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object') ? Object.keys(v).length > 0 : (v != null && v !== '' && v !== false);
  const plain = s => String(s || '').replace(/^[^\wก-๙(]+/, '').replace(/\s*\(.*?\)/g, '').trim();
  function checkRecord(kind, rec) {
    rec = rec || {}; const F = FORMS[kind]; const req = [], key = []; const sk = rec._skip || {};
    if (!F) return { req, key, open: [], valid: true };
    F.fields.forEach(f => { if (!f.req || !f.k) return; if (f.showIf && rec.community !== f.showIf) return; if (!has(rec[f.k])) req.push({ k: f.k, label: plain(f.label) }); });
    (KEYF[kind] || []).forEach(p => { const k = p[0]; let ok;
      if (k === 'answers') ok = [1, 2, 3, 4, 5, 6, 7, 8].filter(i => has(rec['q' + i])).length >= 3; else if (k === 'media') ok = mediaIds(rec).length > 0; else if (k === 'gps') ok = !!(rec.gps && rec.gps.lat != null); else ok = has(rec[k]);
      if (!ok) key.push({ k, label: p[1], skipped: sk[k] || null }); });
    return { req, key, open: key.filter(x => !x.skipped), valid: req.length === 0 };
  }
  function skipHTML(rec) { const sk = rec && rec._skip; if (!sk) return ''; const ks = Object.keys(sk).filter(k => sk[k]); if (!ks.length) return ''; return '<div class="skipnote">⚠ ยืนยันว่าไม่มีข้อมูล: ' + ks.map(k => '<b>' + esc(sk[k].label || k) + '</b>' + (sk[k].why ? ' (' + esc(sk[k].why) + ')' : '') + ' <span class="muted">— ' + esc(short((sk[k].by || {}).name)) + '</span>').join(' · ') + '</div>'; }

  /* ---------- ประมวลผลกลาง (Synthesis) ---------- */
  const PTS = { create: 3, media: 2, edit: 1, restore: 1, delete: 0 };
  function synth(G, members) {
    const out = { coverage: [], instruments: [], freq: {}, contrib: [], total: 0 };
    commList(G).forEach(c => {
      const row = { c, total: 0 }; LIST_KINDS.forEach(k => { row[k] = listOf(G, k).filter(r => inComm(r, c)).length; row.total += row[k]; });
      if (row.total) out.coverage.push(row);
    });
    out.instruments = listOf(G, 'analyses').map(r => ({ inst: r.instrument || '-', c: commObj(r), classify: r.classify || '', timbre: (r.timbre || []).join(', '), scale: r.scale || '', tempo: r.tempo || '', role: r.role || '' }));
    const cnt = (arrs) => { const m = {}; arrs.forEach(a => (a || []).forEach(x => m[x] = (m[x] || 0) + 1)); return Object.keys(m).map(k => [k, m[k]]).sort((a, b) => b[1] - a[1]); };
    out.freq.timbre = cnt(listOf(G, 'analyses').map(r => r.timbre));
    out.freq.mood = cnt(listOf(G, 'analyses').map(r => r.mood));
    out.freq.funcs = cnt(listOf(G, 'roles').map(r => r.funcs));
    out.freq.classify = cnt(listOf(G, 'analyses').map(r => r.classify ? [r.classify] : []));
    const hist = Object.values((G && G.history) || {});
    const by = {}; (members || []).forEach(m => by[m.sid] = { sid: m.sid, name: m.name, no: m.no, roles: m.roles || [], create: 0, edit: 0, media: 0, pts: 0, last: 0, kinds: {} });
    hist.forEach(h => {
      const s = h.by && h.by.sid; if (!s || !by[s]) return; const x = by[s];
      x[h.act] = (x[h.act] || 0) + 1; x.pts += PTS[h.act] || 0; x.last = Math.max(x.last, h.at || 0); if (h.kind) x.kinds[h.kind] = (x.kinds[h.kind] || 0) + 1;
    });
    out.total = Object.values(by).reduce((a, x) => a + x.pts, 0);
    out.contrib = Object.values(by).map(x => Object.assign(x, { share: out.total ? Math.round(x.pts / out.total * 100) : 0 })).sort((a, b) => (+a.no) - (+b.no));
    return out;
  }

  /* ---------- การแสดงผลแบบอ่านอย่างเดียว ---------- */
  function metaHTML(rec, cls) {
    if (!rec || !rec.createdAt) return '';
    const c = rec.createdBy || {}, u = rec.updatedBy || {};
    let h = '<div class="meta ' + (cls || '') + '">📝 บันทึกโดย <b>' + esc(c.name || '-') + '</b> · ' + esc(thDateTime(rec.createdAt));
    if (rec.updatedAt && rec.updatedAt - rec.createdAt > 60000) h += ' · แก้ล่าสุด <b>' + esc(u.name || '-') + '</b> ' + esc(thDateTime(rec.updatedAt));
    return h + '</div>' + skipHTML(rec);
  }
  function mediaHTML(rec, media, opts) {
    const ids = mediaIds(rec); if (!ids.length) return ''; const imgs = [], aud = [];
    ids.forEach(id => { const m = media && media[id]; if (!m) { imgs.push(null); return; } (m.type === 'audio' ? aud : imgs).push(m); });
    let h = '';
    const im = imgs.filter(m => m && m.d);
    if (im.length) h += '<div class="thumbs">' + im.slice(0, (opts && opts.maxImg) || 12).map(m => '<figure><img src="' + m.d + '" alt="">' + (m.by && !(opts && opts.forReport) ? '<figcaption>' + esc(short(m.by.name)) + ' · ' + esc(thDateTime(m.at)) + '</figcaption>' : '') + '</figure>').join('') + '</div>';
    const missing = imgs.filter(m => !m).length; if (missing && !(opts && opts.forReport)) h += '<div class="muted">⏳ ไฟล์แนบ ' + missing + ' ไฟล์ยังโหลดไม่เสร็จ</div>';
    if (aud.length) h += (opts && opts.forReport) ? '<div class="muted">🎧 มีไฟล์เสียง ' + aud.length + ' ไฟล์ (เปิดฟังได้ในแอป)</div>' : aud.map(m => '<audio controls preload="none" src="' + m.d + '"></audio>').join('');
    return h;
  }
  function gpsHTML(g) { if (!g || g.lat == null) return ''; return '<a href="https://www.google.com/maps?q=' + g.lat + ',' + g.lng + '" target="_blank" rel="noopener">📍 ' + (+g.lat).toFixed(5) + ', ' + (+g.lng).toFixed(5) + (g.acc ? ' (±' + Math.round(g.acc) + ' ม.)' : '') + '</a>'; }
  function renderRecord(kind, rec, media, opts) {
    opts = opts || {}; const F = FORMS[kind]; let h = ''; rec = rec || {};
    const hideName = opts.forReport && kind === 'interviews' && !rec.allowPublish;
    const by = rec._by || {};
    F.fields.forEach(f => {
      const v = rec[f.k];
      if (f.k === 'communityOther') return;
      if (f.t === 'section') { h += '<div class="r-sec">' + esc(f.label.replace(/^\d\)\s*/, '')) + '</div>'; return; }
      if (f.t === 'sign') { if (opts.forReport) return; if (v) h += '<div class="r-row"><b>' + esc(f.label) + '</b><img class="sig" src="' + v + '" alt=""></div>'; return; }
      if (f.t === 'media') { const mh = mediaHTML(rec, media, opts); if (mh) h += '<div class="r-row">' + mh + '</div>'; return; }
      if (f.t === 'gps') { const g = gpsHTML(v); if (g) h += '<div class="r-row"><b>พิกัด</b> ' + g + '</div>'; return; }
      if (f.t === 'check') { if (opts.forReport && !['consent', 'allowPhoto', 'allowAudio'].includes(f.k)) return; h += '<div class="r-row"><b>' + (v ? '✓' : '✗') + '</b> ' + esc(f.label) + '</div>'; return; }
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) return;
      if (opts.forReport && ['community', 'date', 'time', 'eventId'].includes(f.k)) return;
      let val;
      if (f.t === 'chips') val = v.map(x => '<span class="pill">' + esc(x) + '</span>').join(' ');
      else if (f.t === 'select' && f.opts === 'comm') val = esc(f.k === 'community' ? commLabel(rec) : (commById(v) || {}).name || '');
      else if (f.t === 'select' && f.opts === 'events') { const ev = opts.events && opts.events[v]; val = ev ? '🗓 ' + esc(ev.title) + ' (' + esc(thDate(ev.date)) + ')' : '-'; }
      else if (f.t === 'date') val = esc(thDate(v));
      else if (f.t === 'scale') val = esc(v) + ' / ' + (f.n || 5);
      else val = nl2(v);
      if (hideName && f.k === 'informant') val = 'ผู้ให้ข้อมูล (ไม่ประสงค์ระบุชื่อ)';
      const label = f.label.replace(/^[^\wก-๙(]+/, '').replace(opts.forReport ? /\s*\(.*?\)/g : /$^/, '');
      h += '<div class="r-row"><b>' + esc(label) + '</b> ' + val + (opts.showBy && by[f.k] ? ' <span class="by">— ' + esc(short(by[f.k].name)) + ' ' + esc(thDateTime(by[f.k].at)) + '</span>' : '') + '</div>';
    });
    return h;
  }
  function barsHTML(pairs, max) {
    if (!pairs || !pairs.length) return '<div class="muted">ยังไม่มีข้อมูล</div>';
    const top = Math.max.apply(null, pairs.map(p => p[1]));
    return '<div class="bars">' + pairs.slice(0, max || 8).map(p => '<div class="bar-row"><span class="bl">' + esc(p[0]) + '</span><span class="bt"><i style="width:' + Math.round(p[1] / top * 100) + '%"></i></span><span class="bn">' + p[1] + '</span></div>').join('') + '</div>';
  }

  /* ---------- ปฏิทิน ---------- */
  const EV_STATUS = { proposed: ['เสนอโดยนักเรียน', 'st-prop'], approved: ['อนุมัติแล้ว', 'st-ok'], planned: ['วางแผน', 'st-plan'], done: ['ลงพื้นที่แล้ว', 'st-done'], cancelled: ['ยกเลิก', 'st-cancel'] };
  function monthGrid(y, m, events, sel) {
    const first = new Date(y, m, 1), start = first.getDay(), days = new Date(y, m + 1, 0).getDate();
    const byDate = {}; events.forEach(e => { (byDate[e.date] = byDate[e.date] || []).push(e); });
    let h = '<div class="cal"><div class="cal-h"><button class="cal-nav" data-cal="-1" aria-label="เดือนก่อน">‹</button><b>' + MONTHS_F[m] + ' ' + (y + 543) + '</b><button class="cal-nav" data-cal="1" aria-label="เดือนถัดไป">›</button></div><div class="cal-g">' + DOW.map(d => '<div class="cal-dow">' + d + '</div>').join('');
    for (let i = 0; i < start; i++) h += '<div></div>';
    for (let d = 1; d <= days; d++) {
      const ds = y + '-' + pad(m + 1) + '-' + pad(d); const evs = byDate[ds] || [];
      h += '<button class="cal-d' + (ds === today() ? ' today' : '') + (ds === sel ? ' sel' : '') + (evs.length ? ' has' : '') + '" data-day="' + ds + '"><span>' + d + '</span>' + (evs.length ? '<i>' + evs.slice(0, 3).map(e => '<em style="background:' + ((comm(e.community) || {}).color || '#d4a72c') + '"></em>').join('') + '</i>' : '') + '</button>';
    }
    return h + '</div></div>';
  }
  function eventCard(e, groups, opts) {
    const c = commObj(e); const st = EV_STATUS[e.status] || EV_STATUS.planned;
    const gs = Object.keys(e.groups || {}).map(g => (groups && groups[g] && groups[g].name) || g);
    return '<div class="ev" data-ev="' + esc(e.id) + '" style="--ec:' + (c ? c.color : '#d4a72c') + '"><div class="ev-date"><b>' + (+e.date.slice(8)) + '</b><span>' + MONTHS[+e.date.slice(5, 7) - 1] + '</span></div><div class="grow"><div class="ev-t">' + esc(e.title) + '</div>' +
      '<div class="ev-s">🕘 ' + esc(e.start || '') + (e.end ? '–' + esc(e.end) : '') + (c ? ' · ' + c.emoji + ' ' + esc(c.name) : '') + (e.place ? ' · 📍 ' + esc(e.place) : '') + '</div>' +
      '<div class="ev-s">' + (e.teacherJoin ? '<span class="tag gold">👩‍🏫 ครูร่วมลงพื้นที่</span> ' : '') + '<span class="tag ' + st[1] + '">' + st[0] + '</span>' + (gs.length ? ' <span class="muted">' + esc(gs.join(', ')) + '</span>' : ' <span class="muted">ทุกกลุ่ม</span>') + '</div>' +
      (e.meet ? '<div class="ev-s">🚩 จุดนัดพบ: ' + esc(e.meet) + '</div>' : '') + (e.note ? '<div class="ev-s">' + nl2(e.note) + '</div>' : '') +
      (opts && opts.actions ? '<div class="row wrap" style="margin-top:6px">' + opts.actions(e) + '</div>' : '') + '</div></div>';
  }
  function icsFor(e) {
    const dt = (d, t) => d.replace(/-/g, '') + 'T' + (t || '08:00').replace(':', '') + '00';
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SAPPHA//MaeSotMusic//TH', 'BEGIN:VEVENT', 'UID:' + e.id + '@maesot-music', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
      'DTSTART;TZID=Asia/Bangkok:' + dt(e.date, e.start), 'DTEND;TZID=Asia/Bangkok:' + dt(e.date, e.end || e.start), 'SUMMARY:' + (e.title || '').replace(/[,;]/g, ' '),
      'LOCATION:' + (e.place || '').replace(/[,;]/g, ' '), 'DESCRIPTION:' + ((e.meet ? 'จุดนัดพบ ' + e.meet + ' ' : '') + (e.note || '')).replace(/[,;\n]/g, ' '), 'END:VEVENT', 'END:VCALENDAR'];
    return L.join('\r\n');
  }

  /* ---------- รายงาน A4 (794×1123px) ---------- */
  const PAGE_W = 794, PAGE_H = 1123, PAD = 46, FOOT = 38;
  function memberTable(members, sy) {
    const sh = {}; (sy ? sy.contrib : []).forEach(x => sh[x.sid] = x);
    return '<table class="tb"><tr><th>เลขที่</th><th>ชื่อ-สกุล</th><th>บทบาท</th><th>การมีส่วนร่วม</th></tr>' + members.map(m => '<tr><td>' + esc(m.no) + '</td><td style="text-align:left">' + esc(m.name) + '</td><td style="text-align:left">' + esc((m.roles || []).map(r => (roleById(r) || {}).name).filter(Boolean).join(', ') || '-') + '</td><td>' + (sh[m.sid] ? sh[m.sid].share + '%' : '-') + '</td></tr>').join('') + '</table>';
  }
  function buildReportBlocks(G, ctx) {
    const R = (G.docs && G.docs.report) || {}; const blocks = []; const sy = synth(G, ctx.members);
    const title = R.title || 'รายงานการลงพื้นที่ศึกษาดนตรีพหุวัฒนธรรมแม่สอด';
    blocks.push({ page: true, html:
      '<div class="cover"><div class="cv-logos"><img src="icons/logo-full.png" alt=""></div><div class="cv-badge">' + esc(C.course.code) + ' ' + esc(C.course.name) + '</div>' +
      '<h1>' + esc(title) + '</h1><div class="cv-unit">' + esc(C.course.unit) + '</div>' +
      '<div class="cv-name">' + esc((ctx.group && ctx.group.name) || '') + ' · ม.' + esc((ctx.group && ctx.group.room) || '') + '</div>' +
      '<div class="cv-members">' + ctx.members.map(m => esc(m.name) + ' เลขที่ ' + esc(m.no)).join('<br>') + '</div>' +
      '<div class="cv-foot">' + esc(C.course.school) + '<br>ครูผู้สอน ' + esc(C.course.teacher) + ' · ภาคเรียนที่ ' + esc(C.course.semester || '') + ' ปีการศึกษา ' + esc(C.course.year) + '</div></div>' });
    let ov = '<h2>สมาชิกและบทบาทในกลุ่ม</h2>' + memberTable(ctx.members, sy);
    if (R.intro) ov += '<h3>คำนำ</h3><p>' + nl2(R.intro) + '</p>';
    if (sy.coverage.length) ov += '<h3>ภาพรวมข้อมูลที่เก็บได้</h3><table class="tb"><tr><th>ชุมชน</th><th>ภาคสนาม</th><th>สัมภาษณ์</th><th>วิเคราะห์ดนตรี</th><th>บทบาทสังคม</th></tr>' + sy.coverage.map(x => '<tr><td style="text-align:left">' + x.c.emoji + ' ' + esc(x.c.name) + '</td><td>' + x.notes + '</td><td>' + x.interviews + '</td><td>' + x.analyses + '</td><td>' + x.roles + '</td></tr>').join('') + '</table>';
    blocks.push({ html: ov });
    [['notes', '1. สมุดภาคสนาม'], ['interviews', '2. แบบสัมภาษณ์ผู้ให้ข้อมูล'], ['analyses', '3. วิเคราะห์องค์ประกอบดนตรี'], ['roles', '4. บทบาทดนตรีในสังคมและพิธีกรรม']].forEach(([kind, head]) => {
      listOf(G, kind).forEach((rec, i) => {
        const sm = FORMS[kind].summary(rec); const c = commObj(rec);
        const hh = (kind === 'interviews' && !rec.allowPublish) ? 'สัมภาษณ์ผู้ให้ข้อมูล #' + (i + 1) : sm.t;
        blocks.push({ html: (i === 0 ? '<h2>' + esc(head) + '</h2>' : '') + '<div class="card" style="border-left-color:' + (c ? c.color : '#5b21b6') + '"><div class="card-h">' + (c ? c.emoji : '') + ' ' + esc(hh) + '</div><div class="card-s">' + esc(sm.s) + '</div>' + metaHTML(rec, 'small') + renderRecord(kind, rec, ctx.media, { forReport: true, maxImg: 3, events: ctx.events }) + '</div>' });
      });
    });
    if (sy.instruments.length) blocks.push({ html: '<h2>ผลการประมวลผลกลาง: เปรียบเทียบดนตรีแต่ละชุมชน</h2><table class="tb sm"><tr><th>เครื่องดนตรี/บทเพลง</th><th>ชุมชน</th><th>ประเภท</th><th>สีสันเสียง</th><th>ระบบเสียง</th><th>ความเร็ว</th></tr>' + sy.instruments.map(r => '<tr><td style="text-align:left">' + esc(r.inst) + '</td><td>' + esc(r.c ? r.c.name : '') + '</td><td>' + esc(r.classify) + '</td><td>' + esc(r.timbre) + '</td><td>' + esc(r.scale) + '</td><td>' + esc(r.tempo) + '</td></tr>').join('') + '</table>' +
      '<div class="two"><div><h3>สีสันเสียงที่พบบ่อย</h3>' + barsHTML(sy.freq.timbre, 6) + '</div><div><h3>หน้าที่ของดนตรีในสังคม</h3>' + barsHTML(sy.freq.funcs, 6) + '</div></div>' + (R.synthesis ? '<h3>อภิปรายผล</h3><p>' + nl2(R.synthesis) + '</p>' : '') });
    const cons = (G.docs && G.docs.conservation) || {};
    if (filled(cons)) blocks.push({ html: '<h2>5. แนวทางอนุรักษ์ & ดนตรีเพื่อสันติภาพ</h2><div class="card">' + renderRecord('conservation', cons, ctx.media, { forReport: true }) + '</div>' });
    if (R.conclusion) blocks.push({ html: '<h2>สรุปผลการศึกษา</h2><p>' + nl2(R.conclusion) + '</p>' });
    if (ctx.exporter && ctx.personal && filled(ctx.personal.reflection)) blocks.push({ html: '<h2>ภาคผนวก: สะท้อนคิดของ ' + esc(ctx.exporter.name) + '</h2><div class="card">' + renderRecord('reflection', ctx.personal.reflection, ctx.media, { forReport: true }) + '</div>' });
    return blocks;
  }
  function paginate(blocks) {
    const meas = document.createElement('div'); meas.className = 'rp rp-measure';
    meas.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + (PAGE_W - PAD * 2) + 'px;visibility:hidden';
    document.body.appendChild(meas);
    const maxH = PAGE_H - PAD * 2 - FOOT; const pages = []; let cur = null, used = 0;
    const newPage = () => { cur = []; pages.push(cur); used = 0; };
    blocks.forEach(b => {
      const d = document.createElement('div'); d.className = 'blk'; d.innerHTML = b.html; meas.appendChild(d);
      const h = d.offsetHeight + 12;
      if (b.page) { newPage(); cur.push(b); newPage(); used = maxH + 1; return; }
      if (!cur || used + h > maxH) newPage();
      cur.push(b); used += h;
    });
    meas.remove(); return pages.filter(p => p.length);
  }
  function buildPages(G, ctx) {
    const pages = paginate(buildReportBlocks(G, ctx)); const root = document.createElement('div'); root.className = 'rp-root'; const total = pages.length;
    pages.forEach((blks, i) => {
      const pg = document.createElement('section'); pg.className = 'rp rp-page' + (blks[0].page ? ' rp-cover' : '');
      pg.style.cssText = 'width:' + PAGE_W + 'px;height:' + PAGE_H + 'px;padding:' + PAD + 'px ' + PAD + 'px 0';
      pg.innerHTML = blks.map(b => '<div class="blk">' + b.html + '</div>').join('') +
        '<div class="rp-foot"><span>' + esc((ctx.group && ctx.group.name) || '') + ' · ' + esc(C.course.code) + ' · ' + esc(C.copyright) + '</span><span>' + (i + 1) + ' / ' + total + '</span></div>';
      root.appendChild(pg);
    });
    return root;
  }

  /* ---------- โปสเตอร์ 1080×1350 ---------- */
  function buildPoster(G, ctx, cid) {
    const c = commById(cid) || C.communities[0]; const R = (G.docs && G.docs.report) || {};
    const pick = k => listOf(G, k).filter(r => inComm(r, c));
    const notes = pick('notes'), an = pick('analyses'), ro = pick('roles'), iv = pick('interviews');
    const imgs = []; notes.concat(an, ro, iv).forEach(r => mediaIds(r).forEach(id => { const m = ctx.media && ctx.media[id]; if (m && m.type === 'image' && m.d && imgs.length < 3) imgs.push(m.d); }));
    const inst = (an[0] && an[0].instrument) || (c.instruments[0] || ''), occ = (ro[0] && ro[0].occasion) || '';
    const quote = R.posterQuote || ((G.docs && G.docs.conservation) || {}).message || (ro[0] && ro[0].peace) || '';
    const el = document.createElement('div'); el.className = 'poster'; el.style.setProperty('--pc', c.color);
    el.innerHTML = '<div class="po-head"><div class="po-emoji">' + c.emoji + '</div><div class="grow"><div class="po-kicker">ดนตรีพหุวัฒนธรรมแม่สอด</div><div class="po-title">' + esc(c.name) + '</div></div><img class="po-logo" src="icons/logo-mark-512.png" alt=""></div>' +
      (imgs.length ? '<div class="po-imgs n' + imgs.length + '">' + imgs.map(s => '<img src="' + s + '" alt="">').join('') + '</div>' : '<div class="po-imgs empty">' + c.emoji + '</div>') +
      '<div class="po-body">' + (inst ? '<div class="po-item"><span>เครื่องดนตรี/บทเพลง</span><b>' + esc(inst) + '</b></div>' : '') +
      (occ ? '<div class="po-item"><span>โอกาส/พิธีกรรม</span><b>' + esc(occ) + '</b></div>' : '') +
      (an[0] && an[0].timbre && an[0].timbre.length ? '<div class="po-item"><span>เสียงเป็นอย่างไร</span><b>' + esc(an[0].timbre.join(' · ')) + '</b></div>' : '') +
      (quote ? '<div class="po-quote">“' + esc(String(quote).slice(0, 160)) + '”</div>' : '') + '</div>' +
      '<div class="po-foot"><div><b>' + esc((ctx.group && ctx.group.name) || '') + '</b><br>' + esc(ctx.members.map(m => short(m.name)).join(' · ')) + '</div><div class="r">' + esc(C.course.code) + ' · ม.' + esc((ctx.group && ctx.group.room) || '') + '<br>' + esc(C.copyright) + '</div></div>';
    return el;
  }

  /* ---------- ส่งออกไฟล์ ---------- */
  const LIBS = {
    h2c: [['html2canvas.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', () => window.html2canvas]],
    pdf: [['jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', () => window.jspdf]],
    leaflet: [['leaflet.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', () => window.L]],
    xlsx: [['xlsx.full.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', () => window.XLSX]],
    fb: [
      ['firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js', () => window.firebase],
      ['firebase-auth-compat.js', 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js', () => window.firebase && window.firebase.auth],
      ['firebase-database-compat.js', 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database-compat.js', () => window.firebase && window.firebase.database]
    ]
  };
  const libCache = {};
  const injectScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = false; s.onload = res; s.onerror = () => { s.remove(); rej(new Error('load fail ' + src)); }; document.head.appendChild(s); });
  function loadLibs(name) {
    if (name === 'leaflet' && !document.getElementById('leaflet-css')) { const l = document.createElement('link'); l.id = 'leaflet-css'; l.rel = 'stylesheet'; l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(l); }
    if (!libCache[name]) libCache[name] = (async () => {
      for (const [file, cdn, check] of LIBS[name]) { if (check()) continue; try { await injectScript('lib/' + file); } catch (e) { /* no local copy */ } if (!check()) await injectScript(cdn); }
    })().catch(e => { delete libCache[name]; throw e; });
    return libCache[name];
  }
  const mobile = () => /iPhone|iPad|Android/i.test(navigator.userAgent);
  async function saveBlob(blob, name) {
    const file = new File([blob], name, { type: blob.type });
    if (mobile() && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000); return 'downloaded';
  }
  async function saveFiles(files) {
    if (files.length > 1 && mobile() && navigator.canShare && navigator.canShare({ files })) { try { await navigator.share({ files }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    for (const f of files) { await saveBlob(f, f.name); await new Promise(r => setTimeout(r, 400)); }
  }
  const saveJSON = (obj, name) => saveBlob(new Blob([JSON.stringify(obj)], { type: 'application/json' }), name);
  function stage(el) { const w = document.createElement('div'); w.style.cssText = 'position:fixed;left:-30000px;top:0;'; w.appendChild(el); document.body.appendChild(w); return w; }
  const canvasBlob = (c, type, q) => new Promise(res => c.toBlob(res, type, q));
  const imgsReady = el => Promise.all($$('img', el).map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
  async function exportPDF(root, filename, onProgress) {
    await Promise.all([loadLibs('h2c'), loadLibs('pdf')]);
    const w = stage(root); await imgsReady(root); const pages = $$('.rp-page', root); const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    try { for (let i = 0; i < pages.length; i++) { if (onProgress) onProgress(i + 1, pages.length); const cv = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false }); if (i) doc.addPage(); doc.addImage(cv.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, 210, 297); cv.width = cv.height = 0; } }
    finally { w.remove(); }
    return saveBlob(doc.output('blob'), filename);
  }
  async function exportPNGs(root, base, onProgress) {
    await loadLibs('h2c'); const w = stage(root); await imgsReady(root); const pages = $$('.rp-page', root); const files = [];
    try { for (let i = 0; i < pages.length; i++) { if (onProgress) onProgress(i + 1, pages.length); const cv = await html2canvas(pages[i], { scale: 1.6, backgroundColor: '#ffffff', useCORS: true, logging: false }); files.push(new File([await canvasBlob(cv, 'image/png')], base + '-หน้า' + (i + 1) + '.png', { type: 'image/png' })); cv.width = cv.height = 0; } }
    finally { w.remove(); }
    return saveFiles(files);
  }
  async function exportPoster(el, filename) {
    await loadLibs('h2c'); const w = stage(el); await imgsReady(el);
    try { const cv = await html2canvas(el, { scale: 1, backgroundColor: '#ffffff', useCORS: true, logging: false }); return saveBlob(await canvasBlob(cv, 'image/png'), filename); } finally { w.remove(); }
  }
  function printPages(root) {
    let pr = $('#print-root'); if (pr) pr.remove();
    pr = document.createElement('div'); pr.id = 'print-root'; pr.appendChild(root); document.body.appendChild(pr);
    const done = () => { pr.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); setTimeout(() => window.print(), 300);
  }
  function previewPages(root, title) {
    const k = Math.min(1, (Math.min(window.innerWidth, 820) - 32) / 794);
    const w = modal('<div class="row" style="margin-bottom:10px"><h3 class="grow" style="margin:0">' + esc(title || 'ตัวอย่างรายงาน') + '</h3><button class="btn sm" data-close>ปิด</button></div><div class="pv"></div>', { full: true });
    const box = $('.pv', w);
    Array.from(root.children).forEach(pg => { const o = document.createElement('div'); o.style.cssText = 'width:' + 794 * k + 'px;height:' + 1123 * k + 'px;margin:0 auto 14px;box-shadow:0 4px 16px rgba(46,16,101,.25);overflow:hidden;background:#fff;border-radius:4px'; const i = document.createElement('div'); i.style.cssText = 'transform:scale(' + k + ');transform-origin:top left;width:794px'; i.appendChild(pg); o.appendChild(i); box.appendChild(o); });
  }

  /* ---------- UI ทั่วไป ---------- */
  function toast(msg, ms) { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms || 2400); }
  function modal(html, opts) {
    opts = opts || {}; const w = document.createElement('div'); w.className = 'modal' + (opts.center ? ' center' : '') + (opts.full ? ' full' : '');
    w.innerHTML = '<div class="modal-in' + (opts.wide ? ' wide' : '') + '">' + html + '</div>'; document.body.appendChild(w);
    w.addEventListener('click', e => { if (e.target === w || e.target.closest('[data-close]')) { w.remove(); if (opts.onClose) opts.onClose(); } });
    return w;
  }
  function fileToImageData(file, max, q) {
    max = max || 1280; q = q || 0.72;
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => { let w = img.naturalWidth, h = img.naturalHeight; const k = Math.min(1, max / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k); const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q)); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('อ่านภาพไม่ได้')); }; img.src = url;
    });
  }
  const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  const avatar = (name, cls) => '<span class="av ' + (cls || '') + '" title="' + esc(name) + '">' + esc(initials(name)) + '</span>';
  const brandHTML = () => '<div class="brand"><img src="icons/logo-mark-512.png" alt=""><div><b>' + esc(C.appName) + '</b><span>' + esc(C.appFull) + '</span></div></div>';
  const INFO_KEYS = ['school', 'department', 'code', 'name', 'unit', 'teacher', 'teacherPosition', 'year', 'semester', 'rooms'];
  function applyInfo(cfg) { applyComms(cfg); C.consentPenalty = cfg && cfg.consentPenalty != null && cfg.consentPenalty !== '' ? Math.max(0, Math.min(100, +cfg.consentPenalty || 0)) : (C.consentPenaltyDefault == null ? 20 : C.consentPenaltyDefault); const inf = cfg && cfg.info; if (!inf) return; INFO_KEYS.forEach(k => { if (inf[k] != null && inf[k] !== '') C.course[k] = k === 'rooms' ? +inf[k] || C.course.rooms : inf[k]; }); }
  const copyrightHTML = () => '<footer class="copy">' + esc(C.copyright) + '</footer>';

  /* ---------- ตรวจขนาดหน้าจอ → html[data-size] ให้ CSS จัดวางให้เหมาะ ---------- */
  (function () {
    const de = document.documentElement, ua = navigator.userAgent || '';
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios) de.dataset.ios = '1';
    try { if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) de.dataset.standalone = '1'; } catch (e) { /* ignore */ }
    let lastW = 0, raf = 0;
    function fit() {
      const w = Math.round(window.innerWidth || de.clientWidth || 0), h = Math.round(window.innerHeight || 0); if (!w) return;
      const o = w > h ? 'land' : 'port'; if (de.dataset.orient !== o) de.dataset.orient = o;
      const short = h < 480 ? '1' : ''; if ((de.dataset.short || '') !== short) { if (short) de.dataset.short = '1'; else delete de.dataset.short; }
      if (w === lastW) return; lastW = w;   /* ไม่คิดใหม่เมื่อแถบเบราว์เซอร์ iOS หด/ขยาย (สูงเปลี่ยนแต่กว้างเท่าเดิม) */
      const s = w < 350 ? 'xs' : w < 480 ? 'sm' : w < 768 ? 'md' : w < 1100 ? 'lg' : 'xl'; if (de.dataset.size !== s) de.dataset.size = s;
    }
    fit(); const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); };
    window.addEventListener('resize', on); window.addEventListener('orientationchange', () => setTimeout(fit, 250));
  })();
  const screenInfo = () => { const de = document.documentElement; return { size: de.dataset.size, orient: de.dataset.orient, w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1, ios: !!de.dataset.ios, standalone: !!de.dataset.standalone }; };

  window.MC = { mediaType, checkRecord, skipHTML, KEYF, SKIP_WHY, has, applyComms, BASE_COMMS, screenInfo,
    C, $, $$, esc, uid, pad, isoDate, today, nowTime, thDate, thDateTime, ago, comm, commName, commObj, commLabel, commById, inComm, commList, otherNames, taskById, roleById, nl2, short, initials, OPT, Q, FORMS, KIND_OF_TASK, LIST_KINDS,
    listOf, mediaIds, filled, taskProgress, synth, metaHTML, mediaHTML, gpsHTML, renderRecord, barsHTML, memberTable,
    EV_STATUS, monthGrid, eventCard, icsFor, buildPages, buildPoster, exportPDF, exportPNGs, exportPoster, printPages, previewPages,
    loadLibs, saveBlob, saveFiles, saveJSON, toast, modal, fileToImageData, blobToDataURL, avatar, brandHTML, copyrightHTML, applyInfo, INFO_KEYS };
})();
