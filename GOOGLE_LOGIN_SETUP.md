# ตั้งค่า Google Sign-in สำหรับรายชื่อที่อนุญาต

โค้ด Version2 ใช้ Firebase Authentication + Firestore โดยไม่เรียก Cloud Functions
สำหรับเข้าสู่ระบบ เพิ่มรายชื่อ ระงับสิทธิ์ หรือลบสิทธิ์อีกต่อไป

## ตั้งค่าครั้งเดียวก่อนใช้งาน

1. เปิด Firebase Console ของโปรเจกต์ `gen-lang-client-0028497325`.
2. Authentication → Sign-in method → Google → Enable เลือก Support email แล้ว Save.
3. Authentication → Settings → Authorized domains เพิ่ม `127.0.0.1` และ `localhost`
   ตาม URL ที่ใช้ทดสอบ และเพิ่มโดเมนจริงเมื่อเผยแพร่เว็บ (ไม่ใส่ http หรือ port).
4. Firestore Database เลือกฐานข้อมูล
   `ai-studio-technicpetkpiman-67ac0311-1cae-4e93-bb4f-36869697baa0`
   เปิด Rules แล้วแทนที่ด้วยเนื้อหาทั้งหมดของ `Version2/firestore.rules` และกด Publish.
   ต้องเผยแพร่ Rules ก่อนเปิดใช้จริง: โค้ดหน้าเว็บเพียงอย่างเดียวไม่ป้องกันการอ่านฐานข้อมูลโดยตรง.
5. คงเอกสาร `authorized_users/chewaphorn@tni.ac.th` ที่มีอยู่:
   `email` และ `id` เป็น `chewaphorn@tni.ac.th`, `role` เป็น `admin`, `status` เป็น `active`.
   เก็บ name, roleLabel, department และ allowedScreens เดิมไว้.
6. รีเฟรชเว็บแล้วกดเข้าสู่ระบบด้วย Google เลือกบัญชี `chewaphorn@tni.ac.th`.

หากไม่มีสิทธิ์เปิด Google provider หรือ Publish Rules ยังต้องให้ผู้ดูแล Firebase ทำสองขั้นตอนนี้
แต่ไม่ต้องเปิด Cloud Run หรือ deploy Functions สำหรับวิธีใหม่.

## เพิ่มพนักงาน

การตั้งค่า → สิทธิ์ผู้ใช้ → เพิ่มผู้ใช้: กรอกชื่อ อีเมล Google จริง บทบาท และแผนก.
จากนั้นพนักงานเลือกบัญชี Google อีเมลเดียวกันเพื่อเข้าใช้งาน ไม่ต้องสร้างบัญชี Authentication
หรือส่งรหัสผ่านให้พนักงาน. อีเมลอื่นที่ไม่ได้อนุญาตจะเข้าข้อมูลไม่ได้ตาม Rules ใหม่.
บัญชี Google อาจปรากฏใน Authentication แม้ถูกปฏิเสธสิทธิ์แอป นั่นไม่ใช่การให้สิทธิ์เข้าใช้ข้อมูล.

บัญชีเดิมที่ลงท้าย `@username.technicpet.invalid` ใช้ Google ไม่ได้ ให้เพิ่มอีเมลจริงของพนักงาน
แทน แล้วลบรายชื่อเก่าหลังตรวจสอบ. การลบจากหน้าตั้งค่าเป็นการถอนสิทธิ์ ไม่ลบบัญชี Google.
รายชื่อ `authorized_emails` ยังเขียนไว้เพื่อความเข้ากันได้ แต่ใช้ `authorized_users` เป็นแหล่งสิทธิ์หลัก.

โค้ด Functions เก่าเก็บไว้เพื่ออ้างอิงและไม่ได้ถูกเรียกจากแอป หากเคย deploy มาก่อน ให้ผู้ดูแล
ปิดบริการจัดการบัญชีเดิมด้วย เพราะ Functions เก่าใช้ Admin SDK ซึ่งไม่อยู่ภายใต้ Firestore Rules.

## การตรวจสอบ

`npm run typecheck`, `npm run build`, `node --test tests/google-access.test.cjs`

ทดสอบอัตโนมัติใช้ Firebase mock ไม่ใช่การทดสอบ Rules emulator หรือระบบจริง.
ต้องทดสอบ Google popup และ Rules จริงหลังตั้งค่า: บัญชีผู้ดูแล บัญชีพนักงานที่อนุญาต
บัญชีไม่อยู่ในรายชื่อ และบัญชีถูกระงับ. Rules และ Google provider ยังไม่ได้เปลี่ยนบน Cloud โดยงานนี้.
