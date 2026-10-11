# Cinema67: Railway + PostgreSQL

เว็บ Demo จองหนังพร้อมสมัครสมาชิก/เข้าสู่ระบบ มีหนัง 15 เรื่อง โปสเตอร์จริง โหมดสว่าง/มืด และสไลด์หนังแนะนำ
ออนไลน์: https://cinema67-production.up.railway.app
หลังบ้าน: https://cinema67-production.up.railway.app/#staff

## ฐานข้อมูลตามรายงาน

ใช้ schema cinema67 และตารางธุรกิจ 17 ตารางตาม DDL: CUSTOMER, BRANCH, EMPLOYEE, THEATER, SEAT, MOVIE, SHOWTIME, SHOWTIME_SEAT, PROMOTION, CUSTOMER_ORDER, PAYMENT, TICKET, FOOD_DRINK_COUPON, COMPLAINT, BOOKING_OPERATION, BOOKING_HISTORY, COMPLAINT_OPERATION

หลังบ้าน → ฐานข้อมูล แสดงจำนวนแถว คอลัมน์ และข้อมูลจริงจาก PostgreSQL พร้อมดาวน์โหลด DDL
CUSTOMER เก็บรหัสผ่านแบบ scrypt hash และบังคับอีเมล/เบอร์โทรไม่ซ้ำ การจองและเรื่องร้องเรียนใช้ข้อมูลจากบัญชีที่เข้าสู่ระบบ
ประวัติงานพนักงานสร้างฝั่งเซิร์ฟเวอร์ การชำระ คูปอง QR อีเมลและบทบาทพนักงานยังเป็นการจำลอง

schema.sql คือไฟล์ที่แอปใช้จริง รวม public.demo_state สำหรับข้อมูลประกอบ UI และ revision
sql/cinema67_production_postgresql.sql เป็น DDL 17 ตารางธุรกิจ
sql/cinema67_report_oracle.sql เป็นฉบับตามรายงาน
sql/cinema67_report_postgresql.sql เป็นฉบับแปลงตรงตัวสำหรับศึกษา
รายละเอียดการแมปอยู่ใน sql/README.md

เพิ่ม TICKET_STATUS และ unique index เฉพาะตั๋วที่ยังใช้งาน เพื่อเก็บประวัติยกเลิก/เปลี่ยนรอบและจองที่นั่งเดิมซ้ำได้
PROMOTION เพิ่ม DISCOUNT_KIND และ MINIMUM_AMOUNT เพื่อรองรับโปรโมชั่นเดิมของ Demo

รายการจองเดิมถูกย้ายโดยไม่ reset ข้อมูล ตาราง plural รุ่นเก่าใน public เก็บไว้เป็นข้อมูลเดิมและไม่รับการเขียนจากแอปรุ่นนี้
ทุกการเขียนล็อก transaction ตรวจ revision และอัปเดตตารางธุรกิจกับ snapshot พร้อมกัน
ชุดข้อมูลตารางสัมพันธ์สร้างใหม่ในแต่ละ transaction เหมาะกับการนำเสนอ ไม่เหมาะกับปริมาณงานโรงหนังจริง

## รันและ Deploy

Node.js 22 ขึ้นไป; npm ci; ตั้ง DATABASE_URL และ AUTH_SECRET ใน environment; npm start
Dockerfile และ railway.json พร้อม deploy จาก repository
Railway Function ใช้ railway-function.ts; สร้างไฟล์ใหม่ด้วย node bundle-function.mjs
อย่าใช้ prepare-frontend.mjs ทับไฟล์ที่แก้ล่าสุด เพราะเป็นตัวช่วยย้าย UI รุ่นเริ่มต้น
npm test ทดสอบ PostgreSQL ผ่าน PGlite: concurrent booking, unique index, ราคา, ชำระ, ยกเลิก, หมดเวลา, migration, persistence, reset และ API

ข้อมูลติดต่อควรเป็นข้อมูลสมมติ ทุกเครื่องอ่านข้อมูลชุดเดียวกัน และ reset มีผลร่วมกัน

