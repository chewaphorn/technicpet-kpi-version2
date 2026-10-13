# TechnicPet KPI — เปิดพัฒนาต่อใน VS Code

เริ่มจาก [คู่มือภาษาไทย](docs/BEGINNER_GUIDE_TH.md) และ [แผนที่โค้ด](docs/CODE_MAP_TH.md)

1. แตก ZIP แล้วเปิดโฟลเดอร์ที่มี package.json ด้วย VS Code
2. ใช้ Node.js 22.12 ขึ้นไปในสาย 22 หรือ LTS ที่ใหม่กว่า
3. Terminal → New Terminal แล้วรันบน Windows:

```bat
npm.cmd install
npm.cmd run dev
```

เปิด http://127.0.0.1:3000 และคง Terminal ไว้ หยุดด้วย Ctrl+C
ไม่เปิด index.html โดยตรง และไม่ใช้ Live Server แทน Vite

หรือดับเบิลคลิก 01_INSTALL.cmd ครั้งแรก แล้วใช้ 02_START_DEV.cmd ทุกครั้งที่เริ่มพัฒนา
เปิด TechnicPet.code-workspace ด้วย VS Code หรือ File → Open Folder

## การจัดการสิทธิ์ผู้ใช้

- หน้าเข้าสู่ระบบใช้ชื่อผู้ใช้และรหัสผ่านเท่านั้น ไม่มีช่องอีเมลหรือการสมัครด้วยอีเมล ผู้ดูแลสร้างบัญชี กำหนดรหัสผ่านเริ่มต้น บทบาท และแผนกจาก Settings → Access Control ได้
- บัญชีผู้ดูแลเดิมใช้ชื่อผู้ใช้ `chewaphorn` และรหัสผ่านเดิม; รายการสิทธิ์อีเมลเดิมสามารถย้ายเป็นบัญชี username ได้โดยผู้ดูแลเพิ่มบัญชีด้วยชื่อผู้ใช้ส่วนหน้าของอีเมลเดิม ซึ่งระบบจะตั้งรหัสผ่านใหม่ตามที่ผู้ดูแลระบุ
- บัญชีและสิทธิ์จัดเก็บใน Firebase Authentication/Firestore; รหัสผ่านไม่ถูกบันทึกใน Firestore ผู้ดูแลเปลี่ยนรหัสผ่าน ระงับสิทธิ์ และลบบัญชีได้จากหน้าตั้งค่า
- Firebase Authentication ใช้อีเมลภายในที่ระบบสร้างให้เป็นรหัสประจำบัญชีเบื้องหลัง ผู้ใช้ไม่ต้องมีหรือกรอกอีเมล ต้องเปิด Email/Password provider ใน Firebase Authentication ไว้ แต่ไม่ต้องเปิด Email Link
- การสร้าง/ลบผู้ใช้และการตั้งรหัสผ่านทำผ่าน Firebase Cloud Functions ใน `functions/` ต้อง deploy Functions พร้อม Firestore rules ก่อนใช้งานจริง ฟังก์ชันใช้ฐานข้อมูล named database ตาม `FIRESTORE_DATABASE_ID` ใน `functions/.env`
- Firebase Cloud Functions ต้องใช้แพ็กเกจ Blaze และอาจมีค่าใช้จ่ายตามการใช้งาน ตรวจสอบแผน/ค่าใช้จ่ายก่อน deploy
- แอปเชื่อม Firestore database `ai-studio-technicpetkpiman-67ac0311-1cae-4e93-bb4f-36869697baa0` ใน Firebase project `gen-lang-client-0028497325` การจับคู่ username กับรหัสบัญชีภายในทำใน Cloud Functions; Firestore rules ห้าม client อ่าน collection `login_usernames`
- ปุ่มเพิ่ม/เปลี่ยนสิทธิ์จะรายงานข้อผิดพลาดเมื่อ Firestore บันทึกไม่ได้ และไม่มีการใช้รายชื่อผู้ใช้จำลองหรือ localStorage แทนฐานข้อมูล

ติดตั้ง functions และ deploy ไปยังโปรเจกต์ที่เลือก (ตรวจสอบค่าใช้จ่ายและสิทธิ์ก่อน):

```bat
cd functions
npm.cmd install
copy .env.example .env
cd ..
npx.cmd firebase-tools deploy --only functions,firestore:rules --project gen-lang-client-0028497325
```

ชุดนี้เป็นโค้ดสำหรับพัฒนาต่อ ไม่ได้เผยแพร่เว็บไซต์หรือ deploy Functions/rules ให้โดยอัตโนมัติ
