#!/bin/bash
# ดับเบิลคลิกไฟล์นี้บน Mac เพื่ออัปโหลดเว็บขึ้น Firebase Hosting + อัปเดต Rules
# ต้องติดตั้ง Node.js ก่อน 1 ครั้ง: https://nodejs.org (เลือก LTS)
cd "$(dirname "$0")"
echo "== Mae Sot Musicology: deploy ไปที่ Firebase Hosting =="
npx -y firebase-tools@latest login
npx -y firebase-tools@latest deploy --only hosting,database --project mae-sot-musicology-by-matang
echo ""
echo "เสร็จแล้ว ✓  เว็บอยู่ที่ https://mae-sot-musicology-by-matang.web.app"
read -p "กด Enter เพื่อปิด"
