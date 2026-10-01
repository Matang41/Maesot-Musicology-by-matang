/* ============================================================
   common.js — ส่วนที่ใช้ร่วมกันระหว่างหน้านักเรียน (index.html) และหน้าครู (teacher.html)
   ============================================================ */
(function () {
  'use strict';
  const C = window.APP_CONFIG;

  /* ---------- helpers ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  function thDate(iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso;
    const y = +m[1]; return (+m[3]) + ' ' + MONTHS[+m[2] - 1] + ' ' + (y < 2400 ? y + 543 : y);
  }
  function thDateTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return thDate(d.toISOString().slice(0, 10)) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  const comm = id => C.communities.find(c => c.id === id) || null;
  const commName = id => (comm(id) || {}).name || '';
  const taskById = id => C.tasks.find(t => t.id === id);
  const nl2 = s => esc(s).replace(/\n/g, '<br>');

  /* ---------- ตัวเลือกในแบบฟอร์ม ---------- */
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

  /* ---------- สกีมาแบบฟอร์ม (ใช้ทั้งหน้านักเรียน และแสดงผลในหน้าครู/รายงาน) ----------
     t: text | area | select | date | time | number | chips | check | scale | gps | media | sign | section */
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

  const FORMS = {
    notes: {
      title: 'บันทึกภาคสนาม', icon: '📓', task: 't1',
      fields: [
        { k: 'community', t: 'select', label: 'ชุมชน/กลุ่มวัฒนธรรม', opts: 'comm', req: 1 },
        { k: 'date', t: 'date', label: 'วันที่' },
        { k: 'time', t: 'time', label: 'เวลา' },
        { k: 'place', t: 'text', label: 'สถานที่ (หมู่บ้าน วัด มัสยิด ศาลเจ้า ศูนย์การเรียนรู้)' },
        { k: 'gps', t: 'gps', label: 'พิกัด GPS' },
        { k: 'informant', t: 'text', label: 'บุคคลที่พบ / ผู้ให้ข้อมูล (ถ้ามี)' },
        { k: 'topic', t: 'text', label: 'หัวข้อที่ไปดู/ฟัง (เช่น การซ้อมเตหน่ากู)' },
        { k: 'observe', t: 'area', label: '👀 สิ่งที่เห็น', ph: 'เครื่องดนตรี ผู้เล่น การแต่งกาย สถานที่ ขั้นตอน…' },
        { k: 'heard', t: 'area', label: '👂 สิ่งที่ได้ยิน', ph: 'เสียง จังหวะ ทำนอง ความดัง-เบา การร้อง…' },
        { k: 'felt', t: 'area', label: '💭 ความรู้สึก / คำถามที่อยากถามต่อ' },
        { k: 'media', t: 'media', label: 'ภาพ / เสียง' }
      ],
      summary: r => ({ t: r.topic || r.place || '(ยังไม่ตั้งหัวข้อ)', s: [commName(r.community), thDate(r.date), r.place].filter(Boolean).join(' · ') })
    },
    interviews: {
      title: 'ใบยินยอม & แบบสัมภาษณ์', icon: '🤝', task: 't2',
      fields: [
        { k: 'community', t: 'select', label: 'ชุมชน/กลุ่มวัฒนธรรม', opts: 'comm', req: 1 },
        { k: 'date', t: 'date', label: 'วันที่สัมภาษณ์' },
        { k: 'place', t: 'text', label: 'สถานที่' },
        { t: 'section', label: '1) ผู้ให้ข้อมูลและความยินยอม', hint: 'อธิบายให้ผู้ให้ข้อมูลทราบว่าทำเพื่อการเรียนวิชาดนตรี และจะไม่ถูกนำไปใช้เพื่อการค้า ผู้ให้ข้อมูลปฏิเสธหรือหยุดได้ทุกเมื่อ' },
        { k: 'informant', t: 'text', label: 'ชื่อ หรือ นามสมมติของผู้ให้ข้อมูล', req: 1 },
        { k: 'age', t: 'number', label: 'อายุโดยประมาณ (ปี)' },
        { k: 'role', t: 'text', label: 'บทบาทในชุมชน (เช่น ผู้อาวุโส ช่างทำแคน ผู้ประกอบพิธี)' },
        { k: 'minor', t: 'check', label: 'ผู้ให้ข้อมูลอายุต่ำกว่า 18 ปี (ผู้ปกครองต้องรับทราบ/ลงนามแทน)' },
        { k: 'consent', t: 'check', label: 'ชี้แจงวัตถุประสงค์แล้ว ผู้ให้ข้อมูลสมัครใจให้ข้อมูลเพื่อการเรียน', req: 1 },
        { k: 'allowPhoto', t: 'check', label: 'ยินยอมให้ถ่ายภาพ' },
        { k: 'allowAudio', t: 'check', label: 'ยินยอมให้บันทึกเสียง' },
        { k: 'allowPublish', t: 'check', label: 'ยินยอมให้ระบุชื่อ-นามในรายงาน (ถ้าไม่ติ๊ก รายงานจะแสดงเป็น "ผู้ให้ข้อมูล")' },
        { k: 'sign', t: 'sign', label: '✍️ ลายเซ็นผู้ให้ข้อมูล (หรือผู้ปกครอง)' },
        { t: 'section', label: '2) คำถามสัมภาษณ์' },
        ...Q.map((q, i) => ({ k: 'q' + (i + 1), t: 'area', label: (i + 1) + '. ' + q, rows: 3 })),
        { k: 'q9', t: 'text', label: '9. คำถามของฉันเอง (พิมพ์คำถาม)' },
        { k: 'a9', t: 'area', label: 'คำตอบข้อ 9', rows: 3 },
        { k: 'media', t: 'media', label: 'ภาพ / เสียงขณะสัมภาษณ์ (เฉพาะที่ได้รับอนุญาต)' }
      ],
      summary: r => ({ t: r.informant || '(ยังไม่ระบุผู้ให้ข้อมูล)', s: [commName(r.community), thDate(r.date), r.consent ? '✓ ยินยอมแล้ว' : '⚠ ยังไม่ติ๊กยินยอม'].filter(Boolean).join(' · ') })
    },
    analyses: {
      title: 'วิเคราะห์องค์ประกอบดนตรี', icon: '🎻', task: 't3',
      fields: [
        { k: 'community', t: 'select', label: 'ชุมชน/กลุ่มวัฒนธรรม', opts: 'comm', req: 1 },
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
      summary: r => ({ t: r.instrument || '(ยังไม่ระบุเครื่องดนตรี)', s: [commName(r.community), r.classify, r.tempo].filter(Boolean).join(' · ') })
    },
    roles: {
      title: 'บทบาทดนตรีในสังคม/พิธีกรรม', icon: '🏮', task: 't4',
      fields: [
        { k: 'community', t: 'select', label: 'ชุมชน/กลุ่มวัฒนธรรม', opts: 'comm', req: 1 },
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
      summary: r => ({ t: r.occasion || '(ยังไม่ระบุโอกาส)', s: [commName(r.community), r.who].filter(Boolean).join(' · ') })
    },
    conservation: {
      title: 'แนวทางอนุรักษ์ & ดนตรีเพื่อสันติภาพ', icon: '🕊️', task: 't5', single: true,
      fields: [
        { t: 'section', label: 'ดนตรีท้องถิ่นที่ฉันเลือกพูดถึง' },
        { k: 'focus', t: 'text', label: 'ดนตรี/เครื่องดนตรี/ชุมชนที่เลือก', req: 1 },
        { k: 'ich', t: 'chips', label: 'จัดเป็นมรดกทางวัฒนธรรมที่จับต้องไม่ได้ (ICH) ด้านใด', opts: OPT.ich },
        { k: 'threats', t: 'chips', label: 'ปัจจัยที่ทำให้ดนตรีนี้เสี่ยงเลือนหาย', opts: OPT.threats },
        { k: 'why', t: 'area', label: 'ทำไมดนตรีนี้จึงควรได้รับการอนุรักษ์', rows: 3, req: 1 },
        { t: 'section', label: 'ข้อเสนอแนวทางอนุรักษ์ (อย่างน้อย 1 ข้อ)' },
        { k: 'idea1', t: 'text', label: 'ข้อเสนอที่ 1' }, { k: 'how1', t: 'area', label: 'ทำอย่างไร / ใครทำ / ต้องใช้อะไร', rows: 2 },
        { k: 'idea2', t: 'text', label: 'ข้อเสนอที่ 2' }, { k: 'how2', t: 'area', label: 'ทำอย่างไร / ใครทำ / ต้องใช้อะไร', rows: 2 },
        { k: 'idea3', t: 'text', label: 'ข้อเสนอที่ 3' }, { k: 'how3', t: 'area', label: 'ทำอย่างไร / ใครทำ / ต้องใช้อะไร', rows: 2 },
        { k: 'digital', t: 'area', label: '💻 ไอเดียคอนเทนต์ดิจิทัลเพื่อเผยแพร่ (คลิป โปสเตอร์ Padlet เพลย์ลิสต์ ฯลฯ)', rows: 3 },
        { t: 'section', label: 'ดนตรีกับสันติภาพและการอยู่ร่วมกัน' },
        { k: 'peace', t: 'area', label: 'ดนตรีช่วยสร้างความเข้าใจระหว่างกลุ่มวัฒนธรรมในแม่สอดได้อย่างไร', rows: 4 },
        { k: 'message', t: 'area', label: '✉️ ข้อความถึงเพื่อนร่วมโรงเรียนและคนรุ่นใหม่', rows: 3 }
      ]
    },
    reflection: {
      title: 'สะท้อนคิด & จิตพิสัย', icon: '💭', task: 't7', single: true,
      fields: [
        { k: 'before', t: 'scale', n: 5, label: 'ก่อนลงพื้นที่ ฉันเปิดใจรับดนตรีต่างวัฒนธรรมระดับใด (1 น้อย – 5 มาก)' },
        { k: 'after', t: 'scale', n: 5, label: 'หลังลงพื้นที่ ฉันเปิดใจรับดนตรีต่างวัฒนธรรมระดับใด' },
        { k: 'learned', t: 'area', label: 'สิ่งสำคัญที่สุดที่ฉันได้เรียนรู้', rows: 3, req: 1 },
        { k: 'surprise', t: 'area', label: 'สิ่งที่ทำให้ฉันประหลาดใจหรือเปลี่ยนความคิด', rows: 3 },
        { k: 'team', t: 'scale', n: 4, label: 'ฉันทำงานร่วมกับเพื่อนได้ดีระดับใด (1–4)' },
        { k: 'respect', t: 'scale', n: 4, label: 'ฉันเคารพความแตกต่างของผู้ให้ข้อมูลระดับใด (1–4)' },
        { k: 'next', t: 'area', label: 'หลังจากนี้ ฉันจะนำสิ่งที่เรียนรู้ไปใช้อย่างไร', rows: 3 }
      ]
    },
    report: {
      title: 'รายงานสรุป', icon: '📄', task: 't6', single: true,
      fields: [
        { k: 'title', t: 'text', label: 'ชื่อรายงาน', req: 1, ph: 'เช่น เสียงที่เชื่อมใจ: ดนตรีพหุวัฒนธรรมแม่สอด' },
        { k: 'team', t: 'text', label: 'ชื่อสมาชิกกลุ่ม (ถ้ามี) คั่นด้วยจุลภาค' },
        { k: 'intro', t: 'area', label: 'คำนำ/ความสำคัญ — ทำไมเราจึงไปศึกษาดนตรีพหุวัฒนธรรมแม่สอด', rows: 4, req: 1 },
        { k: 'conclusion', t: 'area', label: 'สรุปผลการศึกษา — ข้อค้นพบสำคัญของเรา', rows: 5, req: 1 },
        { k: 'posterCommunity', t: 'select', label: 'โปสเตอร์ Padlet: เลือกชุมชนที่จะนำเสนอ', opts: 'comm' },
        { k: 'posterQuote', t: 'text', label: 'โปสเตอร์: ข้อความเด็ดจากการลงพื้นที่ (1 ประโยค)' }
      ]
    }
  };
  // ลำดับ kind ตามงาน
  const KIND_OF_TASK = {}; Object.keys(FORMS).forEach(k => KIND_OF_TASK[FORMS[k].task] = k);

  const SINGLE = ['conservation', 'reflection', 'report'];

  function emptyData() {
    return { notes: [], interviews: [], analyses: [], roles: [], conservation: {}, reflection: {}, report: {} };
  }
  function filled(o) { return o && Object.keys(o).some(k => { const v = o[k]; return Array.isArray(v) ? v.length : (v !== '' && v != null && v !== false && typeof v !== 'object'); }); }

  /* จำนวน/ความคืบหน้าของแต่ละงาน (ใช้ทั้งฝั่งนักเรียน/ครู) */
  function taskProgress(t, d) {
    d = d || emptyData();
    switch (t.kind) {
      case 'notes': return { n: d.notes.length, min: t.min, done: d.notes.length >= t.min };
      case 'interviews': { const n = d.interviews.filter(r => r.consent).length; return { n, min: t.min, done: n >= t.min }; }
      case 'analyses': return { n: d.analyses.length, min: t.min, done: d.analyses.length >= t.min };
      case 'roles': return { n: d.roles.length, min: t.min, done: d.roles.length >= t.min };
      case 'conservation': { const c = d.conservation || {}; const n = (c.focus && c.why && c.idea1) ? 1 : (filled(c) ? 0.5 : 0); return { n: n >= 1 ? 1 : 0, min: 1, done: n >= 1, partial: n > 0 }; }
      case 'reflection': { const c = d.reflection || {}; const n = c.learned ? 1 : (filled(c) ? 0.5 : 0); return { n: n >= 1 ? 1 : 0, min: 1, done: n >= 1, partial: n > 0 }; }
      case 'report': { const c = d.report || {}; const n = (c.title && c.intro && c.conclusion) ? 1 : (filled(c) ? 0.5 : 0); return { n: n >= 1 ? 1 : 0, min: 1, done: n >= 1, partial: n > 0 }; }
    }
    return { n: 0, min: 1, done: false };
  }
  function taskCounts(d) { const o = {}; C.tasks.forEach(t => { o[t.id] = taskProgress(t, d); }); return o; }

  /* ---------- IndexedDB สำหรับภาพ/เสียง ---------- */
  const memMedia = new Map();
  const DB = {
    _p: null,
    open() {
      if (!this._p) this._p = new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error('no idb'));
        const r = indexedDB.open('mcm5-media', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('media', { keyPath: 'id' }); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      return this._p;
    },
    async op(mode, fn) {
      try {
        const db = await this.open();
        return await new Promise((res, rej) => { const t = db.transaction('media', mode); const rq = fn(t.objectStore('media')); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
      } catch (e) { return undefined; }
    },
    async put(o) { memMedia.set(o.id, o); const r = await this.op('readwrite', s => s.put(o)); return r; },
    async get(id) { const r = await this.op('readonly', s => s.get(id)); return r || memMedia.get(id) || null; },
    async del(id) { memMedia.delete(id); return this.op('readwrite', s => s.delete(id)); },
    async all() { const r = await this.op('readonly', s => s.getAll()); return r || Array.from(memMedia.values()); },
    async clear() { memMedia.clear(); return this.op('readwrite', s => s.clear()); }
  };

  /* ---------- โหลดไลบรารีภายนอกแบบ lazy (ลองไฟล์ในโฟลเดอร์ lib/ ก่อน แล้วค่อย CDN) ---------- */
  const LIBS = {
    h2c: [['html2canvas.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', () => window.html2canvas]],
    pdf: [['jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', () => window.jspdf]],
    xlsx: [['xlsx.full.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', () => window.XLSX]],
    fb: [
      ['firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js', () => window.firebase],
      ['firebase-auth-compat.js', 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js', () => window.firebase && window.firebase.auth],
      ['firebase-database-compat.js', 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database-compat.js', () => window.firebase && window.firebase.database]
    ]
  };
  const libCache = {};
  function injectScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = false; s.onload = res; s.onerror = () => { s.remove(); rej(new Error('load fail ' + src)); }; document.head.appendChild(s); });
  }
  function loadLibs(name) {
    if (!libCache[name]) libCache[name] = (async () => {
      for (const [file, cdn, check] of LIBS[name]) {
        if (check()) continue;
        try { await injectScript('lib/' + file); } catch (e) { /* ไม่มีไฟล์ในเครื่อง */ }
        if (!check()) await injectScript(cdn);
      }
    })().catch(e => { delete libCache[name]; throw e; });
    return libCache[name];
  }

  /* ---------- Firebase ---------- */
  let FB = null;
  function fbConfigured() { const f = C.firebase || {}; return !!(f.apiKey && f.databaseURL && f.projectId); }
  async function initFirebase() {
    if (FB) return FB;
    if (!fbConfigured()) return null;
    await loadLibs('fb');
    if (!firebase.apps.length) firebase.initializeApp(C.firebase);
    FB = { db: firebase.database(), auth: firebase.auth() };
    return FB;
  }

  /* ---------- ภาพ: ย่อขนาดก่อนเก็บ ---------- */
  function fileToImageData(file, max, q) {
    max = max || 1024; q = q || 0.72;
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth, h = img.naturalHeight; const k = Math.min(1, max / Math.max(w, h));
        w = Math.round(w * k); h = Math.round(h * k);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('อ่านภาพไม่ได้')); };
      img.src = url;
    });
  }
  function blobToDataURL(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); }); }

  /* ---------- แสดงผลข้อมูลแบบอ่านอย่างเดียว (ครู/รายงาน) ---------- */
  function mediaHTML(ids, media, opts) {
    ids = ids || []; const imgs = [], aud = [];
    ids.forEach(id => { const m = media && media[id]; if (!m) { imgs.push('<span class="ph">[ไฟล์ ' + esc(id.slice(-4)) + ' ยังไม่ซิงก์]</span>'); return; } (m.type === 'audio' ? aud : imgs).push(m); });
    let h = '';
    const im = imgs.filter(m => m.d);
    if (im.length) h += '<div class="thumbs">' + im.slice(0, opts && opts.maxImg || 12).map(m => '<img src="' + m.d + '" alt="">').join('') + '</div>';
    if (aud.length) h += (opts && opts.forReport) ? '<div class="muted">🎧 มีไฟล์เสียง ' + aud.length + ' ไฟล์ (แนบในแอป)</div>'
      : aud.map(m => '<audio controls preload="none" src="' + m.d + '"></audio>').join('');
    return h;
  }
  function gpsHTML(g) { if (!g || g.lat == null) return ''; return '<a href="https://www.google.com/maps?q=' + g.lat + ',' + g.lng + '" target="_blank" rel="noopener">📍 ' + (+g.lat).toFixed(5) + ', ' + (+g.lng).toFixed(5) + (g.acc ? ' (±' + Math.round(g.acc) + ' ม.)' : '') + '</a>'; }

  function renderRecord(kind, rec, media, opts) {
    opts = opts || {}; const F = FORMS[kind]; let h = '';
    const hideName = opts.forReport && kind === 'interviews' && !rec.allowPublish;
    F.fields.forEach(f => {
      const v = rec[f.k];
      if (f.t === 'section') { h += '<div class="r-sec">' + esc(f.label.replace(/^\d\)\s*/, '')) + '</div>'; return; }
      if (f.t === 'sign') { if (opts.forReport) return; if (v) h += '<div class="r-row"><b>' + esc(f.label) + '</b><img class="sig" src="' + v + '" alt=""></div>'; return; }
      if (f.t === 'media') { const mh = mediaHTML(rec.media, media, opts); if (mh) h += '<div class="r-row">' + mh + '</div>'; return; }
      if (f.t === 'gps') { const g = gpsHTML(v); if (g) h += '<div class="r-row"><b>พิกัด</b> ' + g + '</div>'; return; }
      if (f.t === 'check') { if (opts.forReport && !['consent', 'allowPhoto', 'allowAudio'].includes(f.k)) return; h += '<div class="r-row"><b>' + (v ? '✓' : '✗') + '</b> ' + esc(f.label) + '</div>'; return; }
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) return;
      let val;
      if (f.t === 'chips') val = v.map(x => '<span class="pill">' + esc(x) + '</span>').join(' ');
      else if (f.t === 'select' && f.opts === 'comm') val = esc(commName(v));
      else if (f.t === 'date') val = esc(thDate(v));
      else if (f.t === 'scale') val = esc(v) + ' / ' + (f.n || 5);
      else val = nl2(v);
      if (hideName && f.k === 'informant') val = 'ผู้ให้ข้อมูล (ไม่ประสงค์ระบุชื่อ)';
      if (opts.forReport && (f.k === 'community' || f.k === 'date' || f.k === 'time')) return;
      h += '<div class="r-row"><b>' + esc(f.label.replace(/^[^\wก-๙(]+/, '').replace(opts.forReport ? /\s*\(.*?\)/g : /$^/, '')) + '</b> ' + val + '</div>';
    });
    return h;
  }

  /* ---------- การสร้างหน้ารายงาน A4 (794×1123px) ---------- */
  const PAGE_W = 794, PAGE_H = 1123, PAD = 44, FOOT = 34;
  function profileLine(p) { return p ? 'ชั้น ม.' + p.room + ' เลขที่ ' + p.no + ' · รหัส ' + p.sid : ''; }

  function buildReportBlocks(data, profile, media) {
    const R = data.report || {}; const blocks = [];
    const title = R.title || 'รายงานการลงพื้นที่ศึกษาดนตรีพหุวัฒนธรรมแม่สอด';
    const members = (R.team || '').split(/[,،]/).map(s => s.trim()).filter(Boolean);
    // ปก
    blocks.push({ page: true, html:
      '<div class="cover"><div class="cv-badge">' + esc(C.course.code) + ' ' + esc(C.course.name) + '</div>' +
      '<h1>' + esc(title) + '</h1><div class="cv-unit">' + esc(C.course.unit) + '</div>' +
      '<div class="cv-name">' + esc(profile ? profile.name : '') + '</div>' +
      '<div class="cv-meta">' + esc(profileLine(profile)) + '</div>' +
      (members.length ? '<div class="cv-meta">สมาชิกกลุ่ม: ' + esc(members.join(', ')) + '</div>' : '') +
      '<div class="cv-foot">' + esc(C.course.school) + '<br>ครูผู้สอน ' + esc(C.course.teacher) + ' · ปีการศึกษา ' + esc(C.course.year) + '</div></div>' });
    // ภาพรวม
    const cnt = C.communities.map(c => ({ c, n: data.notes.filter(r => r.community === c.id).length, i: data.interviews.filter(r => r.community === c.id).length, a: data.analyses.filter(r => r.community === c.id).length, r: data.roles.filter(r => r.community === c.id).length })).filter(x => x.n + x.i + x.a + x.r > 0);
    let ov = '<h2>ภาพรวมการลงพื้นที่</h2>';
    if (R.intro) ov += '<h3>คำนำ</h3><p>' + nl2(R.intro) + '</p>';
    if (cnt.length) ov += '<table class="tb"><tr><th>ชุมชน</th><th>บันทึกภาคสนาม</th><th>สัมภาษณ์</th><th>วิเคราะห์ดนตรี</th><th>บทบาทสังคม</th></tr>' + cnt.map(x => '<tr><td>' + x.c.emoji + ' ' + esc(x.c.name) + '</td><td>' + x.n + '</td><td>' + x.i + '</td><td>' + x.a + '</td><td>' + x.r + '</td></tr>').join('') + '</table>';
    blocks.push({ html: ov });
    // รายการ
    const sections = [['notes', '1. สมุดภาคสนาม'], ['interviews', '2. แบบสัมภาษณ์ผู้ให้ข้อมูล'], ['analyses', '3. วิเคราะห์องค์ประกอบดนตรี'], ['roles', '4. บทบาทดนตรีในสังคมและพิธีกรรม']];
    sections.forEach(([kind, head]) => {
      const list = data[kind]; if (!list.length) return;
      list.forEach((rec, i) => {
        const sm = FORMS[kind].summary(rec); const c = comm(rec.community);
        const hh = (kind === 'interviews' && !rec.allowPublish) ? 'สัมภาษณ์ผู้ให้ข้อมูล #' + (i + 1) : sm.t;
        blocks.push({ html: (i === 0 ? '<h2>' + esc(head) + '</h2>' : '') +
          '<div class="card" style="border-left-color:' + (c ? c.color : '#0f766e') + '"><div class="card-h">' + (c ? c.emoji : '') + ' ' + esc(hh) + '</div><div class="card-s">' + esc(sm.s) + '</div>' + renderRecord(kind, rec, media, { forReport: true, maxImg: 3 }) + '</div>' });
      });
    });
    if (filled(data.conservation)) blocks.push({ html: '<h2>5. แนวทางอนุรักษ์ & ดนตรีเพื่อสันติภาพ</h2><div class="card">' + renderRecord('conservation', data.conservation, media, { forReport: true }) + '</div>' });
    if (filled(data.reflection)) blocks.push({ html: '<h2>6. สะท้อนคิด</h2><div class="card">' + renderRecord('reflection', data.reflection, media, { forReport: true }) + '</div>' });
    if (R.conclusion) blocks.push({ html: '<h2>สรุปผลการศึกษา</h2><p>' + nl2(R.conclusion) + '</p>' });
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
      if (!cur || used + h > maxH) { newPage(); }
      cur.push(b); used += h;
    });
    meas.remove();
    return pages.filter(p => p.length);
  }

  function buildPages(data, profile, media) {
    const pages = paginate(buildReportBlocks(data, profile, media));
    const root = document.createElement('div'); root.className = 'rp-root';
    const total = pages.length;
    pages.forEach((blks, i) => {
      const pg = document.createElement('section'); pg.className = 'rp rp-page' + (blks[0].page ? ' rp-cover' : '');
      pg.style.cssText = 'width:' + PAGE_W + 'px;height:' + PAGE_H + 'px;padding:' + PAD + 'px ' + PAD + 'px 0';
      pg.innerHTML = blks.map(b => '<div class="blk">' + b.html + '</div>').join('') +
        '<div class="rp-foot"><span>' + esc(profile ? profile.name : '') + ' · ' + esc(C.course.code) + '</span><span>' + (i + 1) + ' / ' + total + '</span></div>';
      root.appendChild(pg);
    });
    return root;
  }

  /* ---------- โปสเตอร์ (1080×1350) สำหรับ Padlet ---------- */
  function buildPoster(data, profile, media, cid) {
    const c = comm(cid) || C.communities[0]; const R = data.report || {};
    const notes = data.notes.filter(r => r.community === c.id), an = data.analyses.filter(r => r.community === c.id), ro = data.roles.filter(r => r.community === c.id), iv = data.interviews.filter(r => r.community === c.id);
    const imgs = []; notes.concat(an, ro, iv).forEach(r => (r.media || []).forEach(id => { const m = media && media[id]; if (m && m.type === 'image' && m.d && imgs.length < 3) imgs.push(m.d); }));
    const inst = (an[0] && an[0].instrument) || (c.instruments[0] || '');
    const occ = (ro[0] && ro[0].occasion) || '';
    const quote = R.posterQuote || (data.conservation && data.conservation.message) || (ro[0] && ro[0].peace) || '';
    const el = document.createElement('div'); el.className = 'poster'; el.style.setProperty('--pc', c.color);
    el.innerHTML = '<div class="po-head"><div class="po-emoji">' + c.emoji + '</div><div><div class="po-kicker">ดนตรีพหุวัฒนธรรมแม่สอด</div><div class="po-title">' + esc(c.name) + '</div></div></div>' +
      (imgs.length ? '<div class="po-imgs n' + imgs.length + '">' + imgs.map(s => '<img src="' + s + '" alt="">').join('') + '</div>' : '<div class="po-imgs empty">' + c.emoji + '</div>') +
      '<div class="po-body">' +
      (inst ? '<div class="po-item"><span>เครื่องดนตรี/บทเพลง</span><b>' + esc(inst) + '</b></div>' : '') +
      (occ ? '<div class="po-item"><span>โอกาส/พิธีกรรม</span><b>' + esc(occ) + '</b></div>' : '') +
      (an[0] && an[0].timbre && an[0].timbre.length ? '<div class="po-item"><span>เสียงเป็นอย่างไร</span><b>' + esc(an[0].timbre.join(' · ')) + '</b></div>' : '') +
      (quote ? '<div class="po-quote">“' + esc(String(quote).slice(0, 160)) + '”</div>' : '') +
      '</div><div class="po-foot"><div><b>' + esc(profile ? profile.name : '') + '</b><br>' + esc(profileLine(profile)) + '</div><div class="r">' + esc(C.course.code) + ' ' + esc(C.course.name) + '<br>' + esc(C.course.school.split(' ')[0]) + '</div></div>';
    return el;
  }

  /* ---------- ส่งออกไฟล์ ---------- */
  function stage(el) { const w = document.createElement('div'); w.style.cssText = 'position:fixed;left:-30000px;top:0;'; w.appendChild(el); document.body.appendChild(w); return w; }
  async function saveBlob(blob, name) {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && /iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000); return 'downloaded';
  }
  async function saveFiles(files) {
    if (files.length > 1 && navigator.canShare && /iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare({ files })) {
      try { await navigator.share({ files }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    for (const f of files) { await saveBlob(f, f.name); await new Promise(r => setTimeout(r, 400)); }
  }
  const canvasBlob = (c, type, q) => new Promise(res => c.toBlob(res, type, q));
  async function exportPDF(root, filename, onProgress) {
    await Promise.all([loadLibs('h2c'), loadLibs('pdf')]);
    const w = stage(root); const pages = $$('.rp-page', root); const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    try {
      for (let i = 0; i < pages.length; i++) {
        if (onProgress) onProgress(i + 1, pages.length);
        const cv = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
        if (i) doc.addPage(); doc.addImage(cv.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, 210, 297); cv.width = cv.height = 0;
      }
    } finally { w.remove(); }
    return saveBlob(doc.output('blob'), filename);
  }
  async function exportPNGs(root, base, onProgress) {
    await loadLibs('h2c'); const w = stage(root); const pages = $$('.rp-page', root); const files = [];
    try {
      for (let i = 0; i < pages.length; i++) {
        if (onProgress) onProgress(i + 1, pages.length);
        const cv = await html2canvas(pages[i], { scale: 1.6, backgroundColor: '#ffffff', useCORS: true, logging: false });
        files.push(new File([await canvasBlob(cv, 'image/png')], base + '-หน้า' + (i + 1) + '.png', { type: 'image/png' })); cv.width = cv.height = 0;
      }
    } finally { w.remove(); }
    return saveFiles(files);
  }
  async function exportPoster(el, filename) {
    await loadLibs('h2c'); const w = stage(el);
    try { const cv = await html2canvas(el, { scale: 1, backgroundColor: '#ffffff', useCORS: true, logging: false }); return saveBlob(await canvasBlob(cv, 'image/png'), filename); } finally { w.remove(); }
  }
  function printPages(root) {
    let pr = $('#print-root'); if (pr) pr.remove();
    pr = document.createElement('div'); pr.id = 'print-root'; pr.appendChild(root); document.body.appendChild(pr);
    const done = () => { pr.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); setTimeout(() => window.print(), 100);
  }

  /* ---------- toast / ตัวช่วย UI ---------- */
  function toast(msg, ms) {
    let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms || 2400);
  }

  window.MC = { C, $, $$, esc, uid, today, thDate, thDateTime, comm, commName, taskById, nl2, OPT, Q, FORMS, KIND_OF_TASK, SINGLE, emptyData, filled,
    taskProgress, taskCounts, DB, loadLibs, initFirebase, fbConfigured, fileToImageData, blobToDataURL, mediaHTML, gpsHTML, renderRecord,
    buildPages, buildPoster, exportPDF, exportPNGs, exportPoster, printPages, saveBlob, saveFiles, toast, profileLine };
})();
