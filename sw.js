/* Service worker: ให้แอปเปิดและบันทึกข้อมูลได้แม้ไม่มีสัญญาณ (ตอนลงพื้นที่) */
const CACHE = 'mcm5-v11';
const SHELL = ['./', 'index.html', 'teacher.html', 'style.css', 'config.js', 'core.js', 'consent.js', 'report.js', 'extras.js', 'backend.js', 'student.js', 'teacher.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'icons/logo-full.png', 'icons/logo-mark-512.png', 'icons/school-logo.png'];
const CDN = ['cdnjs.cloudflare.com', 'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
// หมายเหตุ: ไม่แคชคำขอ Firebase/Google Sign-in (ต้องสดเสมอ)

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === location.origin, cdn = CDN.includes(url.hostname);
  if (!same && !cdn) return; // Firebase ฯลฯ ไม่ยุ่ง
  if (cdn) { // cache-first สำหรับไลบรารี/ฟอนต์
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res; })));
    return;
  }
  // ไฟล์ของแอป: stale-while-revalidate (ได้ของเร็ว + อัปเดตรอบถัดไป)
  e.respondWith(caches.open(CACHE).then(c => c.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(res => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  })));
});
