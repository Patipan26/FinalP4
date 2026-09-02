# FinalP4 Car Care Management

โปรเจกต์เริ่มต้นสำหรับย้ายระบบจาก HTML/Firebase ไปเป็น React + Tailwind CSS, Node.js + Express และ MySQL

## โครงสร้าง

```text
FinalP4/
├── frontend/   React + Vite + Tailwind CSS
├── backend/    Node.js + Express API
└── database/   SQL schema สำหรับ MySQL
```

## รัน Frontend

```bash
cd frontend
npm run dev
```

เปิด `http://localhost:5173`

## รัน Backend

```bash
cd backend
copy .env.example .env
npm run dev
```

API ตรวจสอบสถานะอยู่ที่ `http://localhost:4000/api/health`

## ทดสอบระบบ Login

1. รัน `database/schema.sql` ใน MySQL
2. คัดลอก `backend/.env.example` เป็น `backend/.env` และใส่รหัสผ่าน MySQL
3. เปิด Backend และ Frontend
4. สมัครสมาชิกที่ `http://localhost:5173/register`
5. กลับมา Login ที่ `http://localhost:5173/`

## ตั้งค่า Google Login

1. สร้าง OAuth Client ID แบบ Web application ใน Google Cloud Console
2. เพิ่ม Authorized JavaScript origins เป็น `http://localhost:5174` (และ `http://localhost:5173` หากรันแบบ npm)
3. คัดลอก `.env.example` เป็น `.env` ที่โฟลเดอร์หลัก แล้วใส่ค่า `GOOGLE_CLIENT_ID`
4. รัน `docker compose up -d --build` ใหม่

เมื่อกดเข้าสู่ระบบด้วย Google ครั้งแรก ระบบจะสร้างบัญชีเป็นพนักงานอัตโนมัติ หากต้องการเป็น Admin ให้ใช้คำสั่ง `npm run admin:promote -- อีเมล` ในโฟลเดอร์ `backend`

ผู้สมัครใหม่จะได้สิทธิ์ Employee อัตโนมัติ หากต้องการทดสอบหน้า Admin ให้เปลี่ยนสิทธิ์ผู้ใช้ใน MySQL:

```sql
UPDATE users SET role = 'admin' WHERE email = 'อีเมลของคุณ';
```

หรือใช้คำสั่งที่ง่ายกว่าโดยไม่ต้องเปิด Workbench:

```bash
cd backend
npm run admin:promote -- admin@example.com
```

ต้องสมัครบัญชี `admin@example.com` ผ่านหน้า Register ก่อน แล้วจึงใช้คำสั่งนี้

## ตั้งค่า MySQL

ใส่รหัสผ่าน MySQL ใน `backend/.env` แล้วใช้คำสั่งนี้เพื่อสร้างฐานข้อมูลและตารางอัตโนมัติ:

```bash
cd backend
npm run db:init
```

หากเคยรัน `db:init` ไปแล้ว ให้ปรับตารางสำหรับระบบลงเวลา/ใบลาด้วยคำสั่ง:

```bash
npm run db:migrate
```

ไม่จำเป็นต้องใช้ MySQL CLI ส่วนไฟล์ `database/schema.sql` ยังเก็บไว้สำหรับตรวจสอบหรือรันด้วย Workbench ได้

ตอนนี้ Login/Register, Employee และ Admin เชื่อมกับ API และ MySQL แล้ว รวมถึงระบบ OT, Payroll รายเดือน และสลิปเงินเดือน

## ทดสอบ OT และเงินเดือน

1. เข้าหน้า Admin แล้วเลือก `บันทึก OT`
2. เลือกพนักงาน วันที่ จำนวนชั่วโมง และอัตรา OT (ค่าเริ่มต้น 1.5 เท่า) แล้วกดบันทึก
3. เลือก `เงินเดือน` เลือกเดือนเดียวกับรายการ OT แล้วกด `โหลดข้อมูล`
4. กด `คำนวณเงินเดือนเดือนนี้` ระบบจะบันทึกยอดค่าแรงปกติและ OT เป็นสลิปของแต่ละคน
5. กด `อนุมัติ` แล้วกด `จ่ายแล้ว` ตามลำดับ
6. พนักงานเปิดเมนู `เงินเดือน` เพื่อดูสลิปและประวัติย้อนหลัง หรือกด `พิมพ์สลิป`

หากมีการเพิ่ม OT หรืออนุมัติใบลาหลังจากคำนวณแล้ว ให้กด `คำนวณเงินเดือนเดือนนี้` อีกครั้ง ระบบจะคำนวณยอดใหม่และให้ตรวจสอบ/อนุมัติอีกครั้ง

การคำนวณค่าแรงรายชั่วโมงใช้สูตร `ชั่วโมงทำงาน × ค่าแรงต่อชั่วโมง` และ OT ใช้สูตร `ชั่วโมง OT × อัตรา OT × ค่าแรงต่อชั่วโมง` โดยค่าเริ่มต้นคือ 50 บาท/ชั่วโมง สลิปจะเก็บค่าแรง ณ วันที่คำนวณไว้ จึงไม่เปลี่ยนตามการแก้ค่าแรงในอนาคต

## คำนวณค่าแรงรายชั่วโมงแบบทดสอบ

ระบบจะนำชั่วโมงที่บันทึกจาก Check-in/Check-out มาคูณค่าแรงต่อชั่วโมง:

```text
รายได้ประมาณการ = ชั่วโมงทำงาน × 50 บาท
```

ค่าเริ่มต้นคือ `50` บาทต่อชั่วโมง สามารถเปลี่ยนได้ในไฟล์ `.env` ของ Docker ที่โฟลเดอร์หลัก:

```env
HOURLY_WAGE=50
```

หลังเปลี่ยนค่า ให้รัน `docker compose up -d` ใหม่ แล้วดูผลในแท็บ **รายได้** ของพนักงาน

## เปิดระบบด้วย Docker

ต้องติดตั้งและเปิด Docker Desktop ก่อน จากนั้นเปิด PowerShell ที่โฟลเดอร์โปรเจกต์:

```bash
cd E:\NewFinal\FinalP4
docker compose up --build
```

เมื่อเปิดสำเร็จ ให้เข้าใช้งานตามนี้:

- ระบบ: `http://localhost:5174`
- Backend ตรวจสอบสถานะ: `http://localhost:4001/api/health`
- phpMyAdmin: `http://localhost:8081`
- phpMyAdmin ใช้ Username `root` และ Password `finalp4root`

MySQL ใน Docker เปิดให้เครื่องเชื่อมต่อผ่านพอร์ต `3308` ส่วน Backend ภายใน Docker เชื่อมต่อผ่านชื่อบริการ `mysql` และพอร์ต `3306` อัตโนมัติ

หากพอร์ตชนกับโปรเจกต์อื่น ให้คัดลอก `.env.example` เป็น `.env` แล้วเปลี่ยนค่า `FRONTEND_PORT`, `BACKEND_PORT`, `MYSQL_PORT` หรือ `PHPMYADMIN_PORT` ได้

หยุดระบบด้วย `Ctrl + C` หรือใช้คำสั่ง:

```bash
docker compose down
```

ข้อมูล MySQL จะถูกเก็บใน Docker volume ชื่อ `finalp4_mysql_data` จึงไม่หายเมื่อหยุด Container ปกติ

ถ้าต้องการเปลี่ยนรหัสผ่านสำหรับการพัฒนา ให้สร้างไฟล์ `.env` ไว้ที่โฟลเดอร์หลัก แล้วใส่:

```env
MYSQL_ROOT_PASSWORD=รหัสผ่านใหม่
JWT_SECRET=คีย์ลับสำหรับระบบ
```

> ส่วนคำสั่ง `npm run dev` แบบเดิมยังใช้ได้เหมือนเดิม Docker เป็นอีกวิธีหนึ่งในการเปิดระบบ
