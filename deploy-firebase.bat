@echo off
chcp 65001 >nul
REM ดับเบิลคลิกบน Windows เพื่ออัปโหลดเว็บขึ้น Firebase Hosting + อัปเดต Rules (ต้องติดตั้ง Node.js จาก https://nodejs.org ก่อน)
cd /d "%~dp0"
call npx -y firebase-tools@latest login
call npx -y firebase-tools@latest deploy --only hosting,database --project mae-sot-musicology-by-matang
echo.
echo เสร็จแล้ว - เว็บอยู่ที่ https://mae-sot-musicology-by-matang.web.app
pause
