/* ============================================================
   report.js — รายงานวิชาการอัตโนมัติ (DOCX / PDF)
   รวบรวมข้อมูลทั้งกลุ่ม → เรียบเรียงเป็นรายงานการศึกษาค้นคว้า 5 บท ตามรูปแบบรายงานวิชาการไทย
   (ปก · คำนำ · สารบัญ · บทที่ 1–5 · บรรณานุกรม · ภาคผนวก)
   • .docx สร้างในเครื่องเอง (ไม่ต้องโหลดไลบรารี) ฟอนต์ TH SarabunPSK 16 pt ระยะขอบ บน/ซ้าย 1.5" ล่าง/ขวา 1"
   • PDF ใช้ตัวแปลงหน้า A4 เดียวกับรายงานเดิม
   © 2569 พัฒนาโดย นนทพัทธ์ วงค์มูล
   ============================================================ */
(function () {
  'use strict';
  const M = window.MC, C = M.C;
  const { esc, thDate, listOf, mediaIds, commObj, commList, inComm, short, roleById, synth, Q } = M;

  /* ============ 1) สร้างเนื้อหา (document model) ============ */
  const TH_NUM = n => String(n);
  const joinTH = arr => { arr = arr.filter(Boolean); if (arr.length <= 1) return arr.join(''); return arr.slice(0, -1).join(' ') + ' และ' + arr[arr.length - 1]; };
  const clean = s => String(s || '').replace(/\s+\n/g, '\n').trim();
  const sentence = s => { s = clean(s); return s; };
  function dateRange(G) {
    const ds = []; M.LIST_KINDS.forEach(k => listOf(G, k).forEach(r => { if (r.date) ds.push(r.date); }));
    ds.sort(); return ds.length ? (ds[0] === ds[ds.length - 1] ? 'วันที่ ' + thDate(ds[0], true) : 'ระหว่างวันที่ ' + thDate(ds[0], true) + ' ถึงวันที่ ' + thDate(ds[ds.length - 1], true)) : 'ภาคเรียนที่ ' + (C.course.semester || '2') + ' ปีการศึกษา ' + C.course.year;
  }

  function buildModel(G, ctx) {
    const B = []; const R = (G.docs && G.docs.report) || {}, CONS = (G.docs && G.docs.conservation) || {};
    const mem = ctx.members || [], grp = ctx.group || {}, media = ctx.media || {};
    const sy = synth(G, mem); const comms = sy.coverage.map(x => x.c); const commNames = comms.map(c => c.name);
    const notes = listOf(G, 'notes'), ivs = listOf(G, 'interviews').filter(r => r.consent), ans = listOf(G, 'analyses'), ros = listOf(G, 'roles');
    const places = Array.from(new Set(notes.map(r => clean(r.place)).filter(Boolean)));
    const title = clean(R.title) || 'การศึกษาดนตรีพหุวัฒนธรรมในอำเภอแม่สอด จังหวัดตาก';
    const ivName = (r, i) => (r.allowPublish && r.informant) ? clean(r.informant) : 'ผู้ให้ข้อมูลคนที่ ' + (i + 1);
    let fig = 0, tab = 0;
    const H1 = (num, text) => B.push({ t: 'h1', num, text });
    const H2 = text => B.push({ t: 'h2', text });
    const H3 = text => B.push({ t: 'h3', text });
    const P = (text, o) => { text = clean(text); if (!text) return; text.split(/\n+/).forEach(par => B.push(Object.assign({ t: 'p', text: par.trim() }, o || {}))); };
    const UL = items => { items = items.map(clean).filter(Boolean); if (items.length) B.push({ t: 'ul', items }); };
    const TABLE = (caption, head, rows, widths) => { if (!rows.length) return; tab++; B.push({ t: 'cap', text: 'ตารางที่ ' + tab + ' ' + caption }); B.push({ t: 'table', head, rows: rows.map(r => r.map(c => clean(c) || '-')), widths }); };
    const FIG = (m, caption) => { if (!m || !m.d || m.type !== 'image') return; fig++; B.push({ t: 'img', src: m.d }); B.push({ t: 'cap', text: 'ภาพที่ ' + fig + ' ' + caption, center: true }); };

    /* ---- ปก ---- */
    B.push({ t: 'cover', title, sub: 'รายงานการศึกษาค้นคว้า รายวิชา' + C.course.name.replace(/\s*ม\.\d/, '') + ' (' + C.course.code + ')', unit: C.course.unit, group: grp.name || '', room: grp.room || '',
      members: mem.map(m => m.name + ' เลขที่ ' + m.no), school: C.course.school, teacher: C.course.teacher, position: C.course.teacherPosition || '', dept: C.course.department || '', year: C.course.year, sem: C.course.semester || '2' });

    /* ---- คำนำ ---- */
    B.push({ t: 'front', text: 'คำนำ' });
    P('รายงานฉบับนี้เป็นส่วนหนึ่งของรายวิชา' + C.course.name + ' รหัสวิชา ' + C.course.code + ' ' + C.course.unit + ' จัดทำขึ้นเพื่อศึกษาองค์ประกอบของดนตรี บทบาทของดนตรีในสังคมและวัฒนธรรม และเสนอแนวทางการอนุรักษ์ดนตรีของ' + (commNames.length ? 'ชุมชน' + joinTH(commNames) : 'ชุมชนต่าง ๆ') + ' ในอำเภอแม่สอด จังหวัดตาก โดยคณะผู้จัดทำได้ลงพื้นที่เก็บข้อมูลจริง สังเกต สัมภาษณ์ผู้ให้ข้อมูล บันทึกภาพและเสียง แล้วนำมาวิเคราะห์และสังเคราะห์อย่างเป็นระบบ', { indent: true });
    P('คณะผู้จัดทำขอขอบพระคุณผู้ให้ข้อมูลทุกท่านที่กรุณาสละเวลาถ่ายทอดความรู้ ขอบพระคุณ' + C.course.teacher + ' ' + (C.course.teacherPosition || 'ครูผู้สอน') + ' ที่ให้คำแนะนำตลอดการศึกษา และหวังเป็นอย่างยิ่งว่ารายงานฉบับนี้จะเป็นประโยชน์ต่อผู้ที่สนใจดนตรีพหุวัฒนธรรมและการอยู่ร่วมกันอย่างสันติในพื้นที่แม่สอด หากมีข้อผิดพลาดประการใด คณะผู้จัดทำขออภัยมา ณ ที่นี้', { indent: true });
    B.push({ t: 'sign', lines: ['คณะผู้จัดทำ', grp.name || '', thDate(M.today(), true)] });

    /* ---- สารบัญ ---- */
    B.push({ t: 'toc' });

    /* ---- บทที่ 1 ---- */
    H1(1, 'บทนำ');
    H2('1.1 ความเป็นมาและความสำคัญ');
    P('อำเภอแม่สอด จังหวัดตาก เป็นเมืองชายแดนที่ติดต่อกับประเทศเมียนมา เป็นพื้นที่ที่ผู้คนหลากหลายกลุ่มชาติพันธุ์ ศาสนา และวัฒนธรรมอาศัยอยู่ร่วมกัน ดนตรีของแต่ละกลุ่มจึงเป็นทั้งมรดกทางวัฒนธรรม เครื่องมือในการประกอบพิธีกรรม และสื่อกลางที่ช่วยสร้างความเข้าใจระหว่างผู้คนต่างวัฒนธรรม', { indent: true });
    if (R.intro) P(R.intro, { indent: true });
    P('หลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551 สาระที่ 2 ดนตรี กำหนดให้ผู้เรียนเข้าใจความสัมพันธ์ระหว่างดนตรี ประวัติศาสตร์ และวัฒนธรรม เห็นคุณค่าของดนตรีที่เป็นมรดกทางวัฒนธรรม ภูมิปัญญาท้องถิ่น ภูมิปัญญาไทยและสากล คณะผู้จัดทำจึงสนใจศึกษาดนตรีพหุวัฒนธรรมในพื้นที่จริง เพื่อเรียนรู้จากแหล่งข้อมูลในชุมชนโดยตรง', { indent: true });
    H2('1.2 วัตถุประสงค์ของการศึกษา');
    UL(['เพื่อวิเคราะห์องค์ประกอบของดนตรีในแต่ละวัฒนธรรมของชุมชนในอำเภอแม่สอด (ศ 2.1 ม.4-6/2)', 'เพื่อวิเคราะห์สถานะและบทบาทของดนตรีในสังคมและวัฒนธรรมของชุมชนที่ศึกษา (ศ 2.2 ม.4-6/2)', 'เพื่อเสนอแนวทางในการอนุรักษ์ดนตรีท้องถิ่นในฐานะมรดกทางวัฒนธรรม (ศ 2.2 ม.4-6/4)']);
    H2('1.3 ขอบเขตของการศึกษา');
    UL(['ด้านพื้นที่: อำเภอแม่สอด จังหวัดตาก' + (places.length ? ' ได้แก่ ' + joinTH(places.slice(0, 8)) : ''),
      'ด้านกลุ่มวัฒนธรรม: ' + (commNames.length ? joinTH(commNames) : 'ชุมชนในอำเภอแม่สอด'),
      'ด้านเนื้อหา: องค์ประกอบของดนตรี บทบาทของดนตรีในพิธีกรรมและวิถีชีวิต และแนวทางการอนุรักษ์',
      'ด้านผู้ให้ข้อมูล: ' + (ivs.length ? 'ผู้รู้ ศิลปิน และผู้ประกอบพิธีในชุมชน จำนวน ' + ivs.length + ' คน' : 'ผู้รู้และศิลปินในชุมชน'),
      'ด้านระยะเวลา: ' + dateRange(G)]);
    H2('1.4 นิยามศัพท์เฉพาะ');
    UL(['ดนตรีพหุวัฒนธรรม หมายถึง ดนตรีของกลุ่มชาติพันธุ์ ศาสนา และวัฒนธรรมที่หลากหลายซึ่งดำรงอยู่ร่วมกันในพื้นที่เดียวกัน',
      'องค์ประกอบของดนตรี หมายถึง ลักษณะสำคัญของเสียงดนตรี ได้แก่ สีสันของเสียง ระบบเสียง จังหวะ ความเร็ว และลักษณะการบรรเลงร่วมกัน',
      'มรดกทางวัฒนธรรมที่จับต้องไม่ได้ หมายถึง แนวปฏิบัติ การแสดงออก ความรู้ และทักษะที่ชุมชนยอมรับว่าเป็นส่วนหนึ่งของมรดกวัฒนธรรมและสืบทอดจากรุ่นสู่รุ่น',
      'ผู้ให้ข้อมูล หมายถึง บุคคลในชุมชนที่ยินยอมให้ข้อมูลแก่คณะผู้จัดทำด้วยความสมัครใจ']);
    H2('1.5 ประโยชน์ที่คาดว่าจะได้รับ');
    UL(['ได้ข้อมูลองค์ประกอบและบทบาทของดนตรีพหุวัฒนธรรมในอำเภอแม่สอดจากแหล่งข้อมูลจริง', 'ผู้เรียนเกิดความเข้าใจ เคารพ และเห็นคุณค่าของความหลากหลายทางวัฒนธรรม', 'ได้แนวทางการอนุรักษ์และเผยแพร่ดนตรีท้องถิ่นที่นำไปใช้ได้จริงในโรงเรียนและชุมชน']);

    /* ---- บทที่ 2 ---- */
    H1(2, 'แนวคิดและเอกสารที่เกี่ยวข้อง');
    H2('2.1 แนวคิดพหุวัฒนธรรมกับดนตรี');
    P('แนวคิดพหุวัฒนธรรมยอมรับว่าสังคมประกอบด้วยกลุ่มคนที่มีภาษา ศาสนา ความเชื่อ และวิถีชีวิตแตกต่างกัน การเรียนรู้วัฒนธรรมของผู้อื่นอย่างเคารพช่วยลดอคติและส่งเสริมการอยู่ร่วมกันอย่างสันติ ดนตรีเป็นการแสดงออกทางวัฒนธรรมที่สื่อสารข้ามภาษาได้ จึงเป็นช่องทางสำคัญในการทำความเข้าใจกันระหว่างกลุ่มวัฒนธรรม', { indent: true });
    H2('2.2 องค์ประกอบของดนตรี');
    P('การวิเคราะห์ดนตรีในรายงานนี้พิจารณาองค์ประกอบสำคัญ ได้แก่ (1) สีสันของเสียง (timbre) ซึ่งขึ้นอยู่กับวัสดุและวิธีบรรเลง (2) ระบบเสียงหรือบันไดเสียง เช่น ระบบเสียง 5 เสียง (เพนทาโทนิก) และ 7 เสียง (3) จังหวะและความเร็ว (4) ลักษณะการบรรเลงร่วมกันหรือพื้นผิวของเสียง และ (5) หน้าที่ของเครื่องดนตรีในวง เช่น ดำเนินทำนองหลัก กำกับจังหวะ หรือประสานเสียง', { indent: true });
    H2('2.3 มรดกทางวัฒนธรรมที่จับต้องไม่ได้');
    P('อนุสัญญาว่าด้วยการสงวนรักษามรดกทางวัฒนธรรมที่จับต้องไม่ได้ ขององค์การยูเนสโก (UNESCO, 2003) จำแนกมรดกทางวัฒนธรรมที่จับต้องไม่ได้ออกเป็น 5 ด้าน ได้แก่ ประเพณีและการแสดงออกทางมุขปาฐะรวมถึงภาษา ศิลปะการแสดง แนวปฏิบัติทางสังคม พิธีกรรมและงานเทศกาล ความรู้และแนวปฏิบัติเกี่ยวกับธรรมชาติและจักรวาล และงานช่างฝีมือดั้งเดิม สำหรับประเทศไทยมีพระราชบัญญัติส่งเสริมและรักษามรดกภูมิปัญญาทางวัฒนธรรม พ.ศ. 2559 เป็นกฎหมายรองรับการส่งเสริมและรักษามรดกดังกล่าว ดนตรีพื้นบ้านและดนตรีประกอบพิธีกรรมของชุมชนจึงเป็นมรดกที่ควรได้รับการบันทึกและสืบทอด', { indent: true });
    H2('2.4 ข้อมูลเบื้องต้นของชุมชนที่ศึกษา');
    if (comms.length) UL(comms.map(c => { const base = M.comm(c.custom ? 'x' : c.id); const ins = (base && base.instruments || []).slice(0, 4), occ = (base && base.occasions || []).slice(0, 4);
      return 'ชุมชน' + c.name + (ins.length ? ' — เครื่องดนตรี/บทเพลงที่พบได้ เช่น ' + ins.join(' ') : '') + (occ.length ? ' ใช้ในโอกาส เช่น ' + occ.join(' ') : '') + (c.custom ? ' (กลุ่มวัฒนธรรมที่คณะผู้จัดทำพบเพิ่มเติมจากการลงพื้นที่)' : ''); }));
    else P('—');

    /* ---- บทที่ 3 ---- */
    H1(3, 'วิธีดำเนินการศึกษา');
    H2('3.1 พื้นที่และผู้ให้ข้อมูล');
    P('การศึกษาครั้งนี้เป็นการศึกษาเชิงคุณภาพ (qualitative study) ดำเนินการในพื้นที่อำเภอแม่สอด จังหวัดตาก ครอบคลุม ' + (comms.length || '-') + ' กลุ่มวัฒนธรรม' + (commNames.length ? ' ได้แก่ ' + joinTH(commNames) : '') + ' ผู้ให้ข้อมูลเลือกแบบเจาะจง (purposive selection) จากผู้รู้ ศิลปิน และผู้ประกอบพิธีในชุมชน รวม ' + ivs.length + ' คน', { indent: true });
    if (ivs.length) TABLE('ผู้ให้ข้อมูลหลัก', ['ที่', 'ผู้ให้ข้อมูล', 'บทบาทในชุมชน', 'ชุมชน', 'วันที่สัมภาษณ์'], ivs.map((r, i) => [String(i + 1), ivName(r, i), r.role || '-', (commObj(r) || {}).name || '-', thDate(r.date)]), [8, 30, 26, 18, 18]);
    H2('3.2 เครื่องมือที่ใช้ในการศึกษา');
    const nImg = Object.values(media).filter(m => m.type === 'image').length, nAud = Object.values(media).filter(m => m.type === 'audio').length;
    UL(['แบบบันทึกภาคสนาม สำหรับบันทึกสิ่งที่เห็น ได้ยิน และรู้สึก พร้อมวันเวลา สถานที่ และพิกัด GPS',
      'แบบขอความยินยอมและแบบสัมภาษณ์กึ่งโครงสร้าง จำนวน ' + Q.length + ' ข้อ (ภาคผนวก ก)',
      'แบบวิเคราะห์องค์ประกอบดนตรี และแบบวิเคราะห์บทบาทของดนตรีในสังคม',
      'อุปกรณ์บันทึกภาพและเสียง (โทรศัพท์เคลื่อนที่) ได้ภาพถ่าย ' + nImg + ' ภาพ และไฟล์เสียง ' + nAud + ' ไฟล์',
      'แอปพลิเคชัน Mae Sot Musicology สำหรับบันทึกข้อมูลร่วมกันแบบกลุ่ม ซึ่งประทับเวลาและชื่อผู้บันทึกทุกรายการ']);
    H2('3.3 การเก็บรวบรวมข้อมูล');
    P('คณะผู้จัดทำลงพื้นที่เก็บข้อมูล' + dateRange(G) + ' โดยใช้การสังเกตแบบมีส่วนร่วมและไม่มีส่วนร่วม การสัมภาษณ์เชิงลึก และการบันทึกภาพและเสียง รวมบันทึกภาคสนาม ' + notes.length + ' รายการ การสัมภาษณ์ ' + ivs.length + ' รายการ การวิเคราะห์องค์ประกอบดนตรี ' + ans.length + ' รายการ และการวิเคราะห์บทบาทของดนตรี ' + ros.length + ' รายการ', { indent: true });
    const trips = {}; notes.forEach(r => { const k = (r.date || '-') + '|' + ((commObj(r) || {}).name || '-'); const t = trips[k] = trips[k] || { date: r.date, c: (commObj(r) || {}).name || '-', places: new Set(), n: 0, by: new Set() }; if (r.place) t.places.add(r.place); t.n++; if (r.createdBy) t.by.add(short(r.createdBy.name)); });
    TABLE('การลงพื้นที่เก็บข้อมูล', ['วันที่', 'ชุมชน', 'สถานที่', 'บันทึก', 'ผู้บันทึก'], Object.values(trips).sort((a, b) => String(a.date).localeCompare(String(b.date))).map(t => [thDate(t.date), t.c, Array.from(t.places).join(', ') || '-', String(t.n), Array.from(t.by).join(', ')]), [17, 20, 30, 10, 23]);
    H2('3.4 การวิเคราะห์ข้อมูล');
    P('วิเคราะห์ข้อมูลด้วยการวิเคราะห์เนื้อหา (content analysis) จัดหมวดหมู่ข้อมูลตามประเด็นองค์ประกอบดนตรี บทบาททางสังคม และการเปลี่ยนแปลง จากนั้นเปรียบเทียบข้อมูลระหว่างชุมชน (comparative analysis) และตรวจสอบความน่าเชื่อถือของข้อมูลแบบสามเส้า (triangulation) ระหว่างการสังเกตภาคสนาม การสัมภาษณ์ และการฟังวิเคราะห์จากไฟล์เสียง', { indent: true });
    H2('3.5 จริยธรรมในการเก็บข้อมูล');
    const nPub = ivs.filter(r => r.allowPublish).length, nMinor = ivs.filter(r => r.minor).length;
    P('คณะผู้จัดทำชี้แจงวัตถุประสงค์และขอความยินยอมจากผู้ให้ข้อมูลทุกคนก่อนสัมภาษณ์ (ได้รับความยินยอม ' + ivs.length + ' คน) ผู้ให้ข้อมูลยินยอมให้ระบุชื่อในรายงาน ' + nPub + ' คน ส่วนผู้ที่ไม่ประสงค์ระบุชื่อใช้นามแฝง' + (nMinor ? ' และมีผู้ให้ข้อมูลอายุต่ำกว่า 18 ปี ' + nMinor + ' คน ซึ่งผู้ปกครองรับทราบ' : '') + ' ภาพและเสียงบันทึกเฉพาะเมื่อได้รับอนุญาตและใช้เพื่อการศึกษาเท่านั้น', { indent: true });
    H2('3.6 การแบ่งบทบาทหน้าที่ในกลุ่ม');
    const sh = {}; sy.contrib.forEach(x => sh[x.sid] = x);
    TABLE('บทบาทหน้าที่และการมีส่วนร่วมของสมาชิก', ['เลขที่', 'ชื่อ-สกุล', 'บทบาท', 'การมีส่วนร่วม'], mem.map(m => [String(m.no), m.name, (m.roles || []).map(r => (roleById(r) || {}).name).filter(Boolean).join(', ') || '-', sh[m.sid] ? sh[m.sid].share + '% (สร้าง ' + (sh[m.sid].create || 0) + ' รายการ)' : '-']), [10, 32, 36, 22]);

    /* ---- บทที่ 4 ---- */
    H1(4, 'ผลการศึกษา');
    H2('4.1 ภาพรวมข้อมูลที่เก็บรวบรวมได้');
    P('จากการลงพื้นที่ คณะผู้จัดทำเก็บข้อมูลได้ ' + comms.length + ' กลุ่มวัฒนธรรม รายละเอียดดังตารางต่อไปนี้', { indent: true });
    TABLE('จำนวนข้อมูลจำแนกตามชุมชน', ['ชุมชน', 'ภาคสนาม', 'สัมภาษณ์', 'วิเคราะห์ดนตรี', 'บทบาทสังคม'], sy.coverage.map(x => [x.c.name, String(x.notes), String(x.interviews), String(x.analyses), String(x.roles)]), [32, 17, 17, 17, 17]);
    let sec = 1;
    comms.forEach(c => {
      sec++; H2('4.' + sec + ' ดนตรีของชุมชน' + c.name);
      let sub = 0; const H3n = t => H3('4.' + sec + '.' + (++sub) + ' ' + t);
      const nn = notes.filter(r => inComm(r, c)), ii = ivs.filter(r => inComm(r, c)), aa = ans.filter(r => inComm(r, c)), rr = ros.filter(r => inComm(r, c));
      if (nn.length) { H3n('ข้อมูลจากการสังเกตภาคสนาม');
        nn.forEach(r => { P('เมื่อ' + (r.date ? 'วันที่ ' + thDate(r.date, true) : '') + (r.place ? ' ณ ' + r.place : '') + (r.topic ? ' คณะผู้จัดทำได้ศึกษาเรื่อง ' + r.topic : '') + (r.observe ? ' พบว่า ' + r.observe : '') + (r.heard ? ' ด้านเสียงที่ได้ยิน ' + r.heard : ''), { indent: true }); }); }
      if (ii.length) { H3n('ข้อมูลจากการสัมภาษณ์');
        ii.forEach(r => { const i = ivs.indexOf(r); const nm = ivName(r, i) + (r.role ? ' (' + r.role + ')' : '');
          const parts = []; for (let q = 1; q <= 8; q++) if (r['q' + q]) parts.push(r['q' + q]); if (r.q9 && r.a9) parts.push(r.a9);
          if (parts.length) P(nm + ' ให้ข้อมูลว่า ' + parts.map(p => clean(p).replace(/[.\s]+$/, '')).join(' นอกจากนี้ ') + ' (' + nm.split(' (')[0] + ', ' + (r.date ? thDate(r.date) : 'สัมภาษณ์') + ')', { indent: true }); }); }
      if (aa.length) { H3n('องค์ประกอบของดนตรี');
        TABLE('องค์ประกอบดนตรีของชุมชน' + c.name, ['เครื่องดนตรี/บทเพลง', 'ประเภท', 'สีสันเสียง', 'ระบบเสียง', 'จังหวะ/ความเร็ว', 'การบรรเลง'], aa.map(r => [r.instrument, r.classify, (r.timbre || []).join(', '), r.scale, [r.meter, r.tempo].filter(Boolean).join(' / '), r.texture]), [20, 16, 18, 16, 16, 14]);
        aa.forEach(r => { const t = []; if (r.material) t.push('ทำจาก' + r.material); if (r.technique) t.push('วิธีบรรเลงคือ ' + r.technique); if (r.role) t.push('ทำหน้าที่' + r.role); if ((r.mood || []).length) t.push('ให้บรรยากาศ' + r.mood.join(' ')); if (r.compare) t.push('เมื่อเปรียบเทียบกับดนตรีไทยหรือสากล ' + r.compare);
          if (t.length) P((r.instrument || 'เครื่องดนตรีนี้') + ' ' + t.join(' '), { indent: true }); }); }
      if (rr.length) { H3n('บทบาทของดนตรีในสังคมและพิธีกรรม');
        rr.forEach(r => { const t = []; if (r.who) t.push('ผู้เกี่ยวข้อง ได้แก่ ' + r.who); if (r.steps) t.push('ลำดับพิธี ' + r.steps); if ((r.funcs || []).length) t.push('ดนตรีทำหน้าที่' + joinTH(r.funcs)); if (r.meaning) t.push('ความหมายและความเชื่อ คือ ' + r.meaning); if (r.taboo) t.push('ข้อควรปฏิบัติ ' + r.taboo); if (r.change) t.push('ปัจจุบัน ' + r.change); if (r.peace) t.push('ในด้านการอยู่ร่วมกัน ' + r.peace);
          P('ในโอกาส' + (r.occasion || 'ต่าง ๆ') + ' ' + t.join(' '), { indent: true }); }); }
      const pics = []; nn.concat(aa, rr, ii.filter(r => r.allowPhoto)).forEach(r => mediaIds(r).forEach(id => { const m = media[id]; if (m && m.type === 'image' && pics.length < 2) pics.push({ m, r }); }));
      pics.forEach(p => FIG(p.m, (p.r.topic || p.r.instrument || p.r.occasion || 'การลงพื้นที่') + ' ชุมชน' + c.name + (p.m.by ? ' (ภาพโดย ' + short(p.m.by.name) + (p.m.at ? ', ' + thDate(M.isoDate(new Date(p.m.at))) : '') + ')' : '')));
    });
    sec++; H2('4.' + sec + ' ผลการวิเคราะห์เปรียบเทียบดนตรีระหว่างชุมชน');
    if (sy.instruments.length) {
      TABLE('เปรียบเทียบองค์ประกอบดนตรีระหว่างชุมชน', ['เครื่องดนตรี', 'ชุมชน', 'ประเภท', 'สีสันเสียง', 'ระบบเสียง', 'ความเร็ว'], sy.instruments.map(r => [r.inst, r.c ? r.c.name : '-', r.classify, r.timbre, r.scale, r.tempo]), [20, 17, 17, 18, 16, 12]);
      const top = (arr, n) => arr.slice(0, n || 3).map(p => p[0] + ' (' + p[1] + ')').join(' ');
      const s = [];
      if (sy.freq.classify.length) s.push('ประเภทเครื่องดนตรีที่พบมากที่สุด ได้แก่ ' + top(sy.freq.classify));
      if (sy.freq.timbre.length) s.push('สีสันเสียงที่พบบ่อย ได้แก่ ' + top(sy.freq.timbre));
      if (sy.freq.mood.length) s.push('บรรยากาศของเพลงที่พบบ่อย ได้แก่ ' + top(sy.freq.mood));
      if (sy.freq.funcs.length) s.push('หน้าที่ของดนตรีในสังคมที่พบมาก ได้แก่ ' + top(sy.freq.funcs));
      P('จากการเปรียบเทียบข้อมูล ' + sy.instruments.length + ' รายการ พบว่า ' + s.join(' ') + ' (ตัวเลขในวงเล็บคือจำนวนรายการที่พบ)', { indent: true });
    } else P('ยังไม่มีข้อมูลการวิเคราะห์องค์ประกอบดนตรีเพียงพอสำหรับการเปรียบเทียบ', { indent: true });
    if (R.synthesis) P(R.synthesis, { indent: true });
    sec++; H2('4.' + sec + ' แนวทางการอนุรักษ์ดนตรีท้องถิ่น');
    if (M.filled(CONS)) {
      P('คณะผู้จัดทำเลือกศึกษาแนวทางการอนุรักษ์' + (CONS.focus ? ' ' + CONS.focus : '') + (CONS.ich && CONS.ich.length ? ' ซึ่งจัดเป็นมรดกทางวัฒนธรรมที่จับต้องไม่ได้ด้าน' + joinTH(CONS.ich) : '') + (CONS.threats && CONS.threats.length ? ' ปัจจัยที่ทำให้เสี่ยงต่อการเลือนหาย ได้แก่ ' + joinTH(CONS.threats) : '') + (CONS.why ? ' ดนตรีนี้ควรได้รับการอนุรักษ์เพราะ ' + CONS.why : ''), { indent: true });
      const ideas = [1, 2, 3].filter(i => CONS['idea' + i]).map(i => [String(i), CONS['idea' + i], CONS['how' + i] || '-']);
      TABLE('ข้อเสนอแนวทางการอนุรักษ์', ['ที่', 'แนวทาง', 'วิธีดำเนินการ / ผู้รับผิดชอบ'], ideas, [8, 36, 56]);
      if (CONS.digital) P('การเผยแพร่ผ่านสื่อดิจิทัล: ' + CONS.digital, { indent: true });
      if (CONS.peace) P('ดนตรีกับการอยู่ร่วมกันอย่างสันติ: ' + CONS.peace, { indent: true });
    } else P('ยังไม่ได้บันทึกข้อมูลแนวทางการอนุรักษ์', { indent: true });

    /* ---- บทที่ 5 ---- */
    H1(5, 'สรุป อภิปรายผล และข้อเสนอแนะ');
    H2('5.1 สรุปผลการศึกษา');
    UL(['ด้านองค์ประกอบของดนตรี: ' + (sy.instruments.length ? 'วิเคราะห์เครื่องดนตรี/บทเพลงได้ ' + sy.instruments.length + ' รายการ จาก ' + comms.length + ' ชุมชน' + (sy.freq.timbre[0] ? ' สีสันเสียงที่โดดเด่นคือ' + sy.freq.timbre[0][0] : '') : 'ยังมีข้อมูลไม่เพียงพอ'),
      'ด้านบทบาทของดนตรีในสังคม: ' + (ros.length ? 'ดนตรีมีบทบาทใน ' + ros.length + ' โอกาส/พิธีกรรม' + (sy.freq.funcs[0] ? ' โดยหน้าที่ที่พบมากที่สุดคือ' + sy.freq.funcs[0][0] : '') : 'ยังมีข้อมูลไม่เพียงพอ'),
      'ด้านการอนุรักษ์: ' + (CONS.idea1 ? 'เสนอแนวทาง ' + [1, 2, 3].filter(i => CONS['idea' + i]).length + ' แนวทาง ได้แก่ ' + joinTH([1, 2, 3].map(i => CONS['idea' + i]).filter(Boolean)) : 'ยังไม่ได้เสนอแนวทาง')]);
    if (R.conclusion) P(R.conclusion, { indent: true });
    H2('5.2 อภิปรายผล');
    P(R.synthesis || ('ผลการศึกษาแสดงให้เห็นว่าดนตรีของแต่ละชุมชนในอำเภอแม่สอดมีเอกลักษณ์เฉพาะทั้งด้านเสียงและบริบทการใช้ ขณะเดียวกันก็มีจุดร่วมในฐานะเครื่องมือเชื่อมโยงผู้คนกับความเชื่อ บรรพบุรุษ และชุมชน สอดคล้องกับแนวคิดพหุวัฒนธรรมที่มองความหลากหลายเป็นทุนทางสังคม และแนวคิดมรดกทางวัฒนธรรมที่จับต้องไม่ได้ที่เน้นการสืบทอดผ่านผู้คนในชุมชน'), { indent: true });
    H2('5.3 ข้อเสนอแนะ');
    UL(['ข้อเสนอแนะในการนำผลไปใช้: ' + (CONS.idea1 ? CONS.idea1 : 'นำข้อมูลไปจัดนิทรรศการหรือสื่อดิจิทัลเผยแพร่ในโรงเรียน'),
      'ข้อเสนอแนะในการศึกษาครั้งต่อไป: ' + (C.communities.filter(c => c.id !== 'other' && !comms.some(x => x.id === c.id)).length ? 'ควรศึกษาชุมชน' + joinTH(C.communities.filter(c => c.id !== 'other' && !comms.some(x => x.id === c.id)).map(c => c.name)) + ' เพิ่มเติม' : 'ควรศึกษาการเปลี่ยนแปลงของดนตรีในระยะยาว') + ' และบันทึกเสียงให้ครบทุกบทเพลงเพื่อการวิเคราะห์ที่ละเอียดยิ่งขึ้น']);

    /* ---- บรรณานุกรม ---- */
    B.push({ t: 'front', text: 'บรรณานุกรม', toc: true });
    const refs = ['กระทรวงศึกษาธิการ. (2551). หลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พุทธศักราช 2551. กรุงเทพฯ: โรงพิมพ์ชุมนุมสหกรณ์การเกษตรแห่งประเทศไทย.',
      'พระราชบัญญัติส่งเสริมและรักษามรดกภูมิปัญญาทางวัฒนธรรม พ.ศ. 2559. (2559). ราชกิจจานุเบกษา.'];
    ivs.forEach((r, i) => { const d = r.date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(r.date) : null; const by = r.createdBy ? short(r.createdBy.name) : 'คณะผู้จัดทำ';
      refs.push(ivName(r, i) + (r.allowPublish ? '' : ' (สงวนนาม)') + '. (' + (d ? (+d[1] + 543) + ', ' + (+d[3]) + ' ' + ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'][+d[2] - 1] : 'ม.ป.ป.') + '). ' + (r.role ? r.role + '. ' : '') + 'สัมภาษณ์โดย ' + by + '. ' + (r.place ? r.place + ' ' : '') + 'อำเภอแม่สอด จังหวัดตาก.'); });
    refs.sort((a, b) => a.localeCompare(b, 'th'));
    refs.push('UNESCO. (2003). Convention for the Safeguarding of the Intangible Cultural Heritage. Paris: UNESCO.');
    refs.forEach(r => B.push({ t: 'ref', text: r }));

    /* ---- ภาคผนวก ---- */
    B.push({ t: 'front', text: 'ภาคผนวก', toc: true });
    H2('ภาคผนวก ก แบบสัมภาษณ์');
    B.push({ t: 'ol', items: Q.slice() });
    H2('ภาคผนวก ข รายชื่อคณะผู้จัดทำ');
    UL(mem.map(m => m.name + ' ชั้น ม.' + (grp.room || '') + ' เลขที่ ' + m.no + ((m.roles || []).length ? ' — ' + m.roles.map(r => (roleById(r) || {}).name).filter(Boolean).join(', ') : '')));
    const evs = Object.keys(ctx.events || {}).map(k => Object.assign({ id: k }, ctx.events[k])).filter(e => e.groups && ctx.gid && e.groups[ctx.gid]);
    if (evs.length) { H2('ภาคผนวก ค กำหนดการลงพื้นที่'); TABLE('กำหนดการลงพื้นที่', ['วันที่', 'เวลา', 'กิจกรรม', 'สถานที่'], evs.map(e => [thDate(e.date), (e.start || '') + (e.end ? '–' + e.end : ''), e.title, e.place || '-']), [18, 16, 40, 26]); }
    const extra = []; notes.concat(ans, ros).forEach(r => mediaIds(r).forEach(id => { const m = media[id]; if (m && m.type === 'image') extra.push({ m, r }); }));
    const used = new Set(B.filter(b => b.t === 'img').map(b => b.src)); const rest = extra.filter(x => !used.has(x.m.d)).slice(0, 6);
    if (rest.length) { H2('ภาคผนวก ' + (evs.length ? 'ง' : 'ค') + ' ภาพประกอบการลงพื้นที่'); rest.forEach(x => FIG(x.m, (x.r.topic || x.r.instrument || x.r.occasion || 'การลงพื้นที่') + ' (' + ((commObj(x.r) || {}).name || '') + ')')); }
    return { title, blocks: B, group: grp, members: mem };
  }

  /* ============ 2) ตัวเขียน DOCX (WordprocessingML + ZIP ในเครื่อง) ============ */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = s => new TextEncoder().encode(s);
  function zip(files) {
    const parts = [], cen = []; let off = 0; const d = new Date(); const dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    files.forEach(f => {
      const name = enc(f.name), data = typeof f.data === 'string' ? enc(f.data) : f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      cen.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length;
    });
    const cenSize = cen.reduce((a, b) => a + b.length, 0);
    const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cenSize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(cen, [new Uint8Array(e.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  const xe = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const FONT = 'TH SarabunPSK';
  const run = (text, o) => { o = o || {}; const rp = (o.b ? '<w:b/><w:bCs/>' : '') + (o.i ? '<w:i/><w:iCs/>' : '') + (o.sz ? '<w:sz w:val="' + o.sz + '"/><w:szCs w:val="' + o.sz + '"/>' : '') + (o.color ? '<w:color w:val="' + o.color + '"/>' : '');
    return String(text).split('\n').map((ln, i) => (i ? '<w:r><w:br/></w:r>' : '') + '<w:r>' + (rp ? '<w:rPr>' + rp + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + xe(ln) + '</w:t></w:r>').join(''); };
  const para = (inner, o) => { o = o || {}; let pp = ''; if (o.style) pp += '<w:pStyle w:val="' + o.style + '"/>'; if (o.pb) pp += '<w:pageBreakBefore/>'; if (o.keep) pp += '<w:keepNext/>'; if (o.numId) pp += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="' + o.numId + '"/></w:numPr>';
    if (o.spacing) pp += '<w:spacing ' + o.spacing + '/>'; if (o.ind) pp += '<w:ind ' + o.ind + '/>'; if (o.jc) pp += '<w:jc w:val="' + o.jc + '"/>'; return '<w:p>' + (pp ? '<w:pPr>' + pp + '</w:pPr>' : '') + inner + '</w:p>'; };
  async function imgInfo(src) { return new Promise(res => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 800, h: 600 }); im.src = src; }); }
  const b64ToU8 = b64 => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  async function fetchU8(url) { try { const r = await fetch(url); if (!r.ok) return null; return new Uint8Array(await r.arrayBuffer()); } catch (e) { return null; } }

  async function toDocx(model) {
    const media = []; let rid = 10;
    const addImg = async (data, ext, maxIn) => {
      const id = 'rId' + (++rid); const name = 'image' + (media.length + 1) + '.' + ext; let w = 800, h = 600;
      if (typeof data === 'string') { const inf = await imgInfo(data); w = inf.w; h = inf.h; data = b64ToU8(data.split(',')[1]); }
      else { const inf = await imgInfo(URL.createObjectURL(new Blob([data]))); w = inf.w; h = inf.h; }
      media.push({ id, name, data }); const k = Math.min(1, (maxIn * 914400) / (w * 9525)); const cx = Math.round(w * 9525 * k), cy = Math.round(h * 9525 * k);
      const n = media.length;
      return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + n + '" name="Picture ' + n + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + n + '" name="' + name + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    };
    const TW = 8306; let body = ''; let firstChapter = true;
    for (const b of model.blocks) {
      if (b.t === 'cover') {
        const logo = await fetchU8('icons/logo-full.png');
        body += para(logo ? await addImg(logo, 'png', 1.3) : '', { jc: 'center', spacing: 'w:before="0" w:after="120"' });
        body += para(run(b.title, { b: 1, sz: 44 }), { jc: 'center', spacing: 'w:before="240" w:after="120"' });
        body += para(run(b.sub, { sz: 32 }), { jc: 'center' }) + para(run(b.unit, { sz: 28 }), { jc: 'center', spacing: 'w:after="600"' });
        body += para(run('จัดทำโดย', { b: 1, sz: 32 }), { jc: 'center' }) + para(run(b.group + (b.room ? '  ชั้นมัธยมศึกษาปีที่ ' + b.room : ''), { b: 1, sz: 32 }), { jc: 'center' });
        b.members.forEach(m => { body += para(run(m, { sz: 32 }), { jc: 'center', spacing: 'w:before="0" w:after="0"' }); });
        body += para(run('เสนอ', { b: 1, sz: 32 }), { jc: 'center', spacing: 'w:before="480"' }) + para(run(b.teacher, { sz: 32 }), { jc: 'center', spacing: 'w:before="0" w:after="0"' }) + (b.position ? para(run('ตำแหน่ง ' + b.position, { sz: 32 }), { jc: 'center', spacing: 'w:before="0" w:after="0"' }) : '');
        body += para(run('รายงานนี้เป็นส่วนหนึ่งของรายวิชา' + C.course.name + ' (' + C.course.code + ')', { sz: 32 }), { jc: 'center', spacing: 'w:before="600" w:after="0"' }) + para(run(b.school, { sz: 32 }), { jc: 'center', spacing: 'w:before="0" w:after="0"' }) + (b.dept ? para(run(b.dept, { sz: 32 }), { jc: 'center', spacing: 'w:before="0" w:after="0"' }) : '') + para(run('ภาคเรียนที่ ' + b.sem + ' ปีการศึกษา ' + b.year, { sz: 32 }), { jc: 'center', spacing: 'w:before="0" w:after="0"' });
        continue;
      }
      if (b.t === 'front') { body += para(run(b.text), { style: b.toc ? 'Heading1' : 'Title', pb: 1 }); continue; }
      if (b.t === 'toc') {
        const ents = []; model.blocks.forEach(x => { if (x.t === 'h1') ents.push([1, 'บทที่ ' + x.num + ' ' + x.text]); else if (x.t === 'h2' && !/^ภาคผนวก/.test(x.text)) ents.push([2, x.text]); else if (x.t === 'front' && x.toc) ents.push([1, x.text]); });
        const ep = (e, pre, post) => '<w:p><w:pPr><w:pStyle w:val="TOC' + e[0] + '"/></w:pPr>' + (pre || '') + run(e[1]) + '<w:r><w:tab/></w:r>' + (post || '') + '</w:p>';
        const begin = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
        body += para(run('สารบัญ'), { style: 'Title', pb: 1 }) + para(run('หน้า', { b: 1 }), { jc: 'right' });
        ents.forEach((e, i) => { body += ep(e, i === 0 ? begin : '', i === ents.length - 1 ? '<w:r><w:fldChar w:fldCharType="end"/></w:r>' : ''); });
        body += para(run('(เลขหน้าจะขึ้นอัตโนมัติ — ถ้าไม่ขึ้น ให้คลิกที่สารบัญ แล้วกด F9 หรือคลิกขวา “อัปเดตเขตข้อมูล”)', { sz: 24, color: '888888' }), { spacing: 'w:before="240"' });
        continue;
      }
      if (b.t === 'h1') { body += para(run('บทที่ ' + b.num) + '<w:r><w:br/></w:r>' + run(b.text), { style: 'Heading1', pb: 1 }); firstChapter = false; continue; }
      if (b.t === 'h2') { body += para(run(b.text), { style: 'Heading2', keep: 1 }); continue; }
      if (b.t === 'h3') { body += para(run(b.text), { style: 'Heading3', keep: 1 }); continue; }
      if (b.t === 'p') { body += para(run(b.text), { ind: b.indent ? 'w:firstLine="720"' : '', jc: 'thaiDistribute' }); continue; }
      if (b.t === 'ul') { b.items.forEach(it => { body += para(run(it), { numId: 1, jc: 'thaiDistribute' }); }); continue; }
      if (b.t === 'ol') { b.items.forEach((it, i) => { body += para(run((i + 1) + '. ' + it), { ind: 'w:left="720" w:hanging="360"' }); }); continue; }
      if (b.t === 'ref') { body += para(run(b.text), { ind: 'w:left="720" w:hanging="720"', jc: 'left' }); continue; }
      if (b.t === 'sign') { b.lines.forEach(l => { body += para(run(l), { jc: 'right', spacing: 'w:before="0" w:after="0"' }); }); continue; }
      if (b.t === 'cap') { body += para(run(b.text, { b: 1 }), { jc: b.center ? 'center' : 'left', keep: b.center ? 0 : 1, spacing: 'w:before="120" w:after="60"' }); continue; }
      if (b.t === 'img') { body += para(await addImg(b.src, 'jpeg', 4.2), { jc: 'center', keep: 1, spacing: 'w:before="120" w:after="0"' }); continue; }
      if (b.t === 'table') {
        const ws = (b.widths || b.head.map(() => 100 / b.head.length)).map(p => Math.round(TW * p / 100));
        const cell = (t, w, hd) => '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (hd ? '<w:shd w:val="clear" w:color="auto" w:fill="EDE9FE"/>' : '') + '</w:tcPr>' + para(run(t, { b: hd, sz: 28 }), { jc: hd ? 'center' : 'left', spacing: 'w:before="0" w:after="0"' }) + '</w:tc>';
        body += '<w:tbl><w:tblPr><w:tblW w:w="' + TW + '" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="8B5CF6"/>').join('') + '</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + ws.map(w => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>' +
          '<w:tr><w:trPr><w:tblHeader/></w:trPr>' + b.head.map((h, i) => cell(h, ws[i], true)).join('') + '</w:tr>' + b.rows.map(r => '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + r.map((c, i) => cell(c, ws[i], false)).join('') + '</w:tr>').join('') + '</w:tbl>' + para('', { spacing: 'w:before="0" w:after="120"' });
      }
    }
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    const sect = '<w:sectPr><w:headerReference w:type="default" r:id="rId4"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="2160" w:right="1440" w:bottom="1440" w:left="2160" w:header="720" w:footer="720" w:gutter="0"/><w:titlePg/></w:sectPr>';
    const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body>' + body + sect + '</w:body></w:document>';
    const rpr = sz => '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:hAnsi="' + FONT + '" w:eastAsia="' + FONT + '" w:cs="' + FONT + '"/><w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/><w:lang w:val="th-TH" w:bidi="th-TH"/></w:rPr>';
    const hst = (id, name, sz, jc, before, outline) => '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="' + before + '" w:after="120"/>' + (jc ? '<w:jc w:val="' + jc + '"/>' : '') + (outline != null ? '<w:outlineLvl w:val="' + outline + '"/>' : '') + '</w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/></w:rPr></w:style>';
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault>' + rpr(32) + '</w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      hst('Title', 'Title', 40, 'center', 0, null) + hst('Heading1', 'heading 1', 40, 'center', 0, 0) + hst('Heading2', 'heading 2', 36, '', 240, 1) + hst('Heading3', 'heading 3', 32, '', 120, 2) +
      '<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="8296"/></w:tabs></w:pPr><w:rPr><w:b/><w:bCs/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="8296"/></w:tabs><w:ind w:left="360"/></w:pPr></w:style>' +
      '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>';
    const numbering = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1080" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';
    const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:hdr>';
    const settings = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/><w:defaultTabStop w:val="720"/><w:themeFontLang w:val="en-US" w:bidi="th-TH"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' +
      media.map(m => '<Relationship Id="' + m.id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + m.name + '"/>').join('') + '</Relationships>';
    const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + xe(model.title) + '</dc:title><dc:creator>' + xe(model.group.name || 'Mae Sot Musicology') + '</dc:creator><cp:keywords>Mae Sot Musicology; ' + xe(C.course.code) + '</cp:keywords><dc:description>' + xe(C.copyright) + '</dc:description><dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created></cp:coreProperties>';
    const root = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
    return zip([{ name: '[Content_Types].xml', data: ct }, { name: '_rels/.rels', data: root }, { name: 'docProps/core.xml', data: core }, { name: 'word/document.xml', data: doc }, { name: 'word/styles.xml', data: styles }, { name: 'word/settings.xml', data: settings }, { name: 'word/numbering.xml', data: numbering }, { name: 'word/header1.xml', data: header }, { name: 'word/_rels/document.xml.rels', data: rels }]
      .concat(media.map(m => ({ name: 'word/media/' + m.name, data: m.data }))));
  }

  /* ============ 3) หน้า A4 สำหรับ PDF/ดูตัวอย่าง ============ */
  const PW = 794, PH = 1123, MT = 120, ML = 120, MR = 80, MB = 80;
  function blockHTML(b, st) {
    switch (b.t) {
      case 'cover': return '<div class="ac-cover"><img src="icons/logo-full.png" alt=""><h1>' + esc(b.title) + '</h1><p>' + esc(b.sub) + '</p><p class="sm">' + esc(b.unit) + '</p><div class="cv-by"><b>จัดทำโดย</b><br><b>' + esc(b.group) + (b.room ? ' ชั้นมัธยมศึกษาปีที่ ' + esc(b.room) : '') + '</b><br>' + b.members.map(esc).join('<br>') + '</div><div class="cv-to"><b>เสนอ</b><br>' + esc(b.teacher) + (b.position ? '<br>ตำแหน่ง ' + esc(b.position) : '') + '</div><div class="cv-sc">รายงานนี้เป็นส่วนหนึ่งของรายวิชา' + esc(C.course.name) + ' (' + esc(C.course.code) + ')<br>' + esc(b.school) + (b.dept ? '<br>' + esc(b.dept) : '') + '<br>ภาคเรียนที่ ' + esc(b.sem) + ' ปีการศึกษา ' + esc(b.year) + '</div></div>';
      case 'front': return '<h1 class="ac-title" data-h="1">' + esc(b.text) + '</h1>';
      case 'toc': return '<h1 class="ac-title">สารบัญ</h1><div class="ac-toc">' + st.toc.map((t, i) => '<div class="' + (t.lv === 2 ? 'l2' : 'l1') + '"><span>' + esc(t.text) + '</span><i></i><b data-tocpg="' + i + '">…</b></div>').join('') + '</div>';
      case 'h1': return '<h1 class="ac-ch" data-h="1">บทที่ ' + b.num + '<br>' + esc(b.text) + '</h1>';
      case 'h2': return '<h2 data-h="2">' + esc(b.text) + '</h2>';
      case 'h3': return '<h3>' + esc(b.text) + '</h3>';
      case 'p': return '<p class="' + (b.indent ? 'ind' : '') + '">' + esc(b.text) + '</p>';
      case 'ul': return '<ul>' + b.items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>';
      case 'ol': return '<ol>' + b.items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ol>';
      case 'ref': return '<p class="ref">' + esc(b.text) + '</p>';
      case 'sign': return '<div class="ac-sign">' + b.lines.map(esc).join('<br>') + '</div>';
      case 'cap': return '<div class="ac-cap' + (b.center ? ' c' : '') + '">' + esc(b.text) + '</div>';
      case 'img': return '<div class="ac-img"><img src="' + b.src + '" alt=""></div>';
      case 'table': return '<table class="ac-tb"><colgroup>' + (b.widths || []).map(w => '<col style="width:' + w + '%">').join('') + '</colgroup><tr>' + b.head.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr>' + b.rows.map(r => '<tr>' + r.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</table>';
    }
    return '';
  }
  function pdfPages(model) {
    const blocks = []; const st = { toc: [] };
    // แยกตารางยาว / ติดหัวข้อกับย่อหน้าถัดไป
    model.blocks.forEach(b => {
      if (b.t === 'table' && b.rows.length > 14) { for (let i = 0; i < b.rows.length; i += 14) blocks.push(Object.assign({}, b, { rows: b.rows.slice(i, i + 14) })); }
      else blocks.push(b);
      if (b.t === 'h1') st.toc.push({ lv: 1, text: 'บทที่ ' + b.num + ' ' + b.text });
      if (b.t === 'h2' && !/^ภาคผนวก/.test(b.text)) st.toc.push({ lv: 2, text: b.text });
      if (b.t === 'front' && b.toc) st.toc.push({ lv: 1, text: b.text });
    });
    const meas = document.createElement('div'); meas.className = 'ac'; meas.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + (PW - ML - MR) + 'px;visibility:hidden'; document.body.appendChild(meas);
    const maxH = PH - MT - MB; const pages = []; let cur = null, used = 0; const newPage = () => { cur = []; pages.push(cur); used = 0; };
    const BREAK = { cover: 1, front: 1, toc: 1, h1: 1 };
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]; let html = blockHTML(b, st);
      if ((b.t === 'h2' || b.t === 'h3' || (b.t === 'cap' && !b.center) || b.t === 'img') && blocks[i + 1] && !BREAK[blocks[i + 1].t]) { html += blockHTML(blocks[i + 1], st); i++; if ((blocks[i].t === 'h3' || blocks[i].t === 'cap' || blocks[i].t === 'img') && blocks[i + 1] && !BREAK[blocks[i + 1].t]) { html += blockHTML(blocks[i + 1], st); i++; } }
      const d = document.createElement('div'); d.innerHTML = html; meas.appendChild(d); const h = d.offsetHeight + 6;
      if (BREAK[b.t] || !cur || used + h > maxH) newPage();
      cur.push({ html, cover: b.t === 'cover' }); used += h;
    }
    meas.remove();
    const root = document.createElement('div'); root.className = 'rp-root';
    pages.forEach((blks, i) => {
      const pg = document.createElement('section'); pg.className = 'rp-page ac' + (blks[0].cover ? ' ac-cpage' : '');
      pg.style.cssText = 'width:' + PW + 'px;height:' + PH + 'px;padding:' + MT + 'px ' + MR + 'px ' + MB + 'px ' + ML + 'px;position:relative;overflow:hidden;background:#fff';
      pg.innerHTML = (i > 0 && !blks[0].cover ? '<div class="ac-pn">' + (i + 1) + '</div>' : '') + blks.map(b => '<div class="ac-blk">' + b.html + '</div>').join('') + '<div class="ac-foot">' + esc(C.copyright) + '</div>';
      root.appendChild(pg);
    });
    // เติมเลขหน้าในสารบัญ
    const heads = []; Array.from(root.children).forEach((pg, pi) => pg.querySelectorAll('[data-h]').forEach(h => heads.push({ text: h.textContent.replace(/^บทที่ (\d+)/, 'บทที่ $1 '), pg: pi + 1 })));
    let k = 0; st.toc.forEach((t, ti) => { const norm = s => s.replace(/\s+/g, ''); for (let j = k; j < heads.length; j++) if (norm(heads[j].text) === norm(t.text)) { const el = root.querySelector('[data-tocpg="' + ti + '"]'); if (el) el.textContent = heads[j].pg; k = j; break; } });
    const h2s = []; Array.from(root.children).forEach((pg, pi) => pg.querySelectorAll('h2[data-h]').forEach(h => h2s.push({ text: h.textContent, pg: pi + 1 })));
    st.toc.forEach((t, ti) => { if (t.lv !== 2) return; const f = h2s.find(x => x.text === t.text); const el = root.querySelector('[data-tocpg="' + ti + '"]'); if (f && el) el.textContent = f.pg; });
    return root;
  }

  /* ============ 4) API ============ */
  const safeName = s => String(s || 'รายงาน').replace(/[\\/:*?"<>|\s]+/g, '_');
  async function exportDocx(G, ctx) { const model = buildModel(G, ctx); const blob = await toDocx(model); return M.saveBlob(blob, safeName('รายงานวิชาการ-' + (ctx.group && ctx.group.name)) + '.docx'); }
  async function exportPdf(G, ctx, onProgress) { const model = buildModel(G, ctx); return M.exportPDF(pdfPages(model), safeName('รายงานวิชาการ-' + (ctx.group && ctx.group.name)) + '.pdf', onProgress); }
  function preview(G, ctx) { M.previewPages(pdfPages(buildModel(G, ctx)), 'ตัวอย่างรายงานวิชาการ'); }
  window.REPORT = { buildModel, toDocx, pdfPages, exportDocx, exportPdf, preview, _zip: zip };
})();
