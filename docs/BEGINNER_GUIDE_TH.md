# คู่มือเริ่มพัฒนา TechnicPet KPI ด้วย VS Code สำหรับมือใหม่

## 1. โปรแกรมที่ใช้และคำศัพท์

คู่มือนี้ใช้ Visual Studio Code (VS Code ไอคอนสีน้ำเงิน) บน Windows ไม่ใช่ Visual Studio ไอคอนสีม่วงที่มักใช้กับ .NET

| คำ | ความหมายในงานนี้ |
|---|---|
| Source code | ไฟล์ต้นฉบับที่คุณแก้เพื่อเปลี่ยนพฤติกรรมเว็บ |
| VS Code | โปรแกรมเปิดและแก้โค้ด |
| Node.js / npm | เครื่องมือรันระบบพัฒนาและติดตั้งแพ็กเกจ |
| React | สร้างหน้าจอจากชิ้นส่วน เช่น เมนู ตาราง กราฟ |
| TypeScript | JavaScript ที่ระบุชนิดข้อมูล ช่วยแจ้งข้อผิดพลาดก่อนรัน |
| Vite | เปิดเว็บระหว่างพัฒนาและสร้างไฟล์สำหรับเผยแพร่ |
| Component | ชิ้นส่วนหน้าจอ เช่น Header หรือหน้ารายงาน |
| State | ข้อมูลที่ React เก็บระหว่างใช้งาน เมื่อเปลี่ยน หน้าจอจะอัปเดต |
| Props | ข้อมูลหรือฟังก์ชันที่ส่งจากส่วนแม่ไปยังส่วนลูก |
| Terminal | หน้าต่างพิมพ์คำสั่งภายใน VS Code |
| Build | แปลงโค้ดต้นฉบับเป็นไฟล์เว็บใน dist |
| localStorage | ที่เก็บข้อมูลในเบราว์เซอร์เครื่องนั้น ไม่ใช่ฐานข้อมูลกลาง |

## 2. เปิดใช้งานครั้งแรกทีละขั้น

1. ติดตั้ง VS Code จาก https://code.visualstudio.com/ และ Node.js จาก https://nodejs.org/ ใช้ Node 22.12 ขึ้นไปในสาย 22 หรือ LTS ที่ใหม่กว่า
2. คลิกขวา ZIP → Extract All แตกไฟล์ไปยังตำแหน่ง เช่น `C:\Projects` อย่าแก้โค้ดขณะยังอยู่ใน ZIP
3. เปิด VS Code → File → Open Folder → เลือกโฟลเดอร์ `TechnicPet_KPI_VSCode` ที่เห็น `package.json` อยู่ภายใน
4. ด้านซ้ายต้องเห็น `src`, `package.json`, `README.md` หากเห็นเพียงโฟลเดอร์ซ้อน ให้เปิดเข้าไปอีกระดับ
5. คลิก `README.md` แล้วกด Ctrl+Shift+V เพื่ออ่านแบบจัดหน้า
6. เลือก Terminal → New Terminal ตรวจว่าเปิดในโฟลเดอร์โปรเจกต์ แล้วพิมพ์ทีละบรรทัด:

```bat
node -v
npm.cmd -v
npm.cmd install
npm.cmd run dev
```

7. รอ Terminal แสดง URL แล้วเปิด http://127.0.0.1:3000 ในเบราว์เซอร์ คง Terminal นี้ไว้ตลอดการพัฒนา
8. เมื่อจะหยุด ให้กลับมาที่ Terminal กด Ctrl+C หากมีคำถาม Terminate batch job ให้ตอบ Y

`npm.cmd install` ใช้ติดตั้งครั้งแรกและเมื่อ dependencies เปลี่ยน ไม่ต้องทำทุกครั้งที่แก้ข้อความ
`npm.cmd run dev` ต้องรันใหม่เมื่อเริ่มทำงานรอบใหม่

อย่าเปิด index.html ด้วยการดับเบิลคลิก เพราะไฟล์ .tsx ต้องผ่าน Vite ก่อน ไม่ต้องติดตั้ง Live Server สำหรับโปรเจกต์นี้

## 3. วิธีใช้ไฟล์ช่วยบน Windows

| ไฟล์ | ใช้เมื่อใด |
|---|---|
| TechnicPet.code-workspace | เปิดพื้นที่ทำงานด้วย VS Code |
| 01_INSTALL.cmd | ติดตั้งแพ็กเกจครั้งแรก ต้องต่ออินเทอร์เน็ต |
| 02_START_DEV.cmd | เปิดเซิร์ฟเวอร์พัฒนา แล้วเปิด URL ในเบราว์เซอร์เอง |
| 03_CHECK_AND_BUILD.cmd | ตรวจ TypeScript ถ้าผ่านจึง build |

ทุกไฟล์ .cmd เปลี่ยนตำแหน่งทำงานเข้ามายังโฟลเดอร์ของตัวเอง และใช้ npm.cmd เพื่อไม่ติดข้อจำกัด npm.ps1 ของ PowerShell
หาก Windows ไม่เปิด workspace ให้ใช้ File → Open Folder แทน

## 4. รู้จักพื้นที่ใน VS Code

- Explorer ด้านซ้าย: เปิดโฟลเดอร์และไฟล์
- Editor ตรงกลาง: แก้โค้ด กด Ctrl+S บันทึก
- Search หรือ Ctrl+Shift+F: ค้นหาข้อความทุกไฟล์ เช่นชื่อหัวข้อบนหน้าเว็บ
- Problems หรือ Ctrl+Shift+M: ดูข้อผิดพลาดพร้อมตำแหน่ง
- Terminal: ดูผลคำสั่งและข้อผิดพลาดตอน build
- Run and Debug: ตั้ง breakpoint ตรวจค่าตัวแปรได้ ชุดนี้มีตัวเลือกเปิด Edge หลังรัน dev server แล้ว

เริ่มต้นไม่จำเป็นต้องลงส่วนขยายเพิ่ม VS Code อ่าน TypeScript ได้อยู่แล้ว

## 5. แบบฝึกหัดแรก: เปลี่ยนหัวข้อ Dashboard

1. เปิด `src/components/Header.tsx`
2. กด Ctrl+F ค้นหา `return 'Dashboard';`
3. ภายใน `case 'overview':` เปลี่ยนเป็น `return 'ภาพรวมผลการดำเนินงาน';`
4. กด Ctrl+S แล้วกลับไปดูเบราว์เซอร์ Vite จะอัปเดตหน้าจอให้
5. หากต้องการย้อนกลับ กด Ctrl+Z แล้ว Ctrl+S

แก้ครั้งละเรื่อง และยังไม่เปลี่ยนชื่อฟังก์ชัน ตัวแปร หรือวงเล็บที่ไม่เข้าใจ

## 6. แบบฝึกหัดที่สอง: แก้ข้อความใต้หัวข้อหน้าแรก

กด Ctrl+Shift+F ค้นหา `Real-time performance metrics and operational health.`
ข้อความนี้อยู่ใน `src/components/ExecutiveOverview.tsx` ในโค้ดที่แนบมา
แทนข้อความระหว่างแท็กด้วยภาษาไทย เช่น `สรุปผลการดำเนินงานของแต่ละแผนก`
ถ้าต้องการลบทั้งย่อหน้า ให้ลบแท็กเปิด เนื้อหา และแท็กปิดของย่อหน้านั้นให้ครบ ไม่ลบเฉพาะแท็กปิด
ถ้าค้นไม่พบ ให้ตรวจว่าเปิดโฟลเดอร์ชุดนี้ และช่องค้นหาไม่มีตัวกรองไฟล์ค้างอยู่

## 7. การทดสอบหลังแก้

เปิด Terminal อีกหน้าต่าง โดยคง dev server ไว้ แล้วรัน:

```bat
npm.cmd run typecheck
npm.cmd run build
```

การตรวจ TypeScript ช่วยหาข้อผิดพลาดของชนิดข้อมูล ส่วน build ตรวจว่าประกอบเว็บได้ ทั้งสองอย่างไม่ได้ยืนยันความถูกต้องของตัวเลข KPI
หลังเปลี่ยนสูตร ให้ใช้ข้อมูลเล็ก ๆ ที่คำนวณด้วยมือได้ เช่น 3 รายการ แล้วเทียบยอดรวมและตัวกรองบนหน้าจอ
เมื่อ build สำเร็จ ใช้ `npm.cmd run preview` เพื่อดูผล build และเปิด URL ที่ Terminal แสดง
แก้ไฟล์ใน src เท่านั้น อย่าแก้ dist เพราะ build ครั้งถัดไปจะสร้างใหม่

## 8. ปัญหาพบบ่อย

| อาการ | วิธีตรวจและแก้ |
|---|---|
| npm.ps1 cannot be loaded | ใช้ `npm.cmd` แทน `npm` หรือเลือก Command Prompt ไม่ต้องเปลี่ยนนโยบาย PowerShell |
| node / npm ไม่เป็นที่รู้จัก | ติดตั้ง Node.js แล้วปิดเปิด VS Code ใหม่ |
| ENOENT / หา package.json ไม่พบ | เปิด Terminal ในโฟลเดอร์ที่มี package.json ใช้ `dir` ตรวจ |
| ติดตั้งไม่สำเร็จ | อ่านบรรทัด error ตรวจอินเทอร์เน็ตและการเข้าถึง npm registry อย่าลบ dependency แบบสุ่ม |
| Port 3000 is already in use | หยุด dev server เดิมด้วย Ctrl+C หรือรัน `npm.cmd run dev -- --port 3001` แล้วเปิด URL ใหม่ |
| หน้าขาว | ดู Terminal และกด F12 → Console ในเบราว์เซอร์ เก็บข้อความ error แรกเพื่อหาสาเหตุ |
| แก้แล้วไม่เปลี่ยน | ตรวจ Ctrl+S, โฟลเดอร์ที่รัน, URL และสถานะ dev server |
| ข้อมูลเก่าค้าง | ตรวจปุ่ม sync และลิงก์รายแผนกก่อน การล้าง browser data จะทำให้ข้อมูลและการตั้งค่าในเครื่องหาย |
| Google Sheets โหลดไม่ได้ | ตรวจสิทธิ์การเข้าถึง แท็บ/gid และข้อผิดพลาดเครือข่ายใน Console |
| Login หรือ Firebase มี error | ตรวจ project config และสถานะบริการ การ build ผ่านไม่ได้ยืนยันว่าเชื่อม Firebase ได้ |

localhost และ 127.0.0.1 รวมถึง port ต่างกัน ถือเป็นคนละ origin ข้อมูล localStorage จึงอาจไม่เหมือนกัน ให้ใช้ URL เดิมสม่ำเสมอ

## 9. การจัดการสิทธิ์และการยืนยันตัวตน

- `parseUploadFile` อ่าน Excel เฉพาะชีทแรก (`workbook.SheetNames[0]`) จึงยังไม่ได้รวมทุกชีทโดยอัตโนมัติ
- `salesAnalyzer.ts` มีการประมาณราคาสินค้าเมื่อข้อมูลราคาไม่ครบ ตัวเลขบางส่วนจึงอาจไม่ใช่ยอดเงินจริงจากต้นทาง ต้องตรวจสูตรก่อนใช้รายงาน
- รายชื่อและบทบาทผู้ใช้จริงเก็บใน Firestore (`authorized_users`) ผู้ดูแลจัดการผ่าน Settings → Access Control และการเพิ่ม/เปลี่ยนสิทธิ์จะไม่บันทึกเป็นข้อมูลจำลองใน localStorage
- หน้าเข้าสู่ระบบใช้ชื่อผู้ใช้และรหัสผ่าน ไม่มีช่องอีเมลหรือการสมัคร ผู้ดูแลสร้างบัญชีพร้อมรหัสผ่านเริ่มต้น กำหนดบทบาท/แผนก เปลี่ยนรหัสผ่าน ระงับ หรือลบบัญชีได้ที่ Settings → Access Control
- บัญชีผู้ดูแลเดิมใช้ username `chewaphorn` กับรหัสผ่านเดิม หากต้องย้ายรายชื่อสิทธิ์แบบเก่า ผู้ดูแลเพิ่มบัญชีด้วย username ส่วนหน้าของอีเมลเดิม ระบบจะย้ายสิทธิ์และตั้งรหัสผ่านใหม่ตามที่กำหนด
- ระบบสร้างอีเมลภายในเป็นรหัสบัญชีให้ Firebase Authentication เบื้องหลัง ผู้ใช้ไม่ต้องมีหรือกรอกอีเมล แต่ Firebase Authentication ยังต้องเปิด Email/Password provider ไว้ ไม่ต้องเปิด Email Link
- การสร้างบัญชีและกำหนดรหัสผ่านทำผ่าน Firebase Cloud Functions ในโฟลเดอร์ `functions` รหัสผ่านไม่ถูกบันทึกใน Firestore ต้อง deploy Functions และ Firestore rules ก่อนเปิดใช้งานจริง และโปรเจกต์ Firebase ต้องใช้แพ็กเกจ Blaze ซึ่งอาจมีค่าใช้จ่าย
- กำหนดฐานข้อมูลที่ functions ใช้โดยคัดลอก `functions/.env.example` เป็น `functions/.env` ตรวจค่า `FIRESTORE_DATABASE_ID` ให้ตรงกับ `firebase-applet-config.json` จากนั้นเปิด Terminal ที่ `Version2` แล้วรัน `npx.cmd firebase-tools deploy --only functions,firestore:rules --project gen-lang-client-0028497325`
- `firestore.rules` จำกัดการจัดการรายชื่อไว้กับผู้ดูแล แต่การแก้ไฟล์นี้ไม่ deploy กฎไปยัง Firebase เอง ต้อง deploy กฎไปยังโครงการจริงก่อนใช้งานจริงเสมอ
- การ build สำเร็จยืนยันเฉพาะโค้ดฝั่งแอป ไม่ยืนยันว่า Email/Password provider, Cloud Functions หรือ Firestore rules ในโครงการ Firebase ถูกตั้งค่า/deploy แล้ว
- `firebase-applet-config.json` ยังชี้ค่าที่มากับต้นฉบับ การเปิด dev server ไม่ได้สร้างฐานข้อมูลทดสอบใหม่ให้
- ไม่มี backend server ที่รันผ่าน scripts ของโปรเจกต์นี้ แม้ package.json มี express อยู่
- ยังไม่พบการเรียก Gemini ใน src การใส่ GEMINI_API_KEY ใน .env อย่างเดียวจึงไม่ได้เปิดระบบ AI ในหน้ารายงาน

ข้อจำกัดเรื่องการอ่าน Excel และสูตรธุรกิจข้างต้นยังต้องตรวจสอบแยกต่างหาก

## 10. วงจรการทำงานที่ฝึกได้ทุกวัน

เปิดโปรเจกต์ → รัน dev → เลือกแก้หนึ่งเรื่อง → บันทึก → ดูผล → ตรวจ typecheck/build → สำรองงาน
ก่อนแก้ใหญ่ ให้สำรองโฟลเดอร์ src และไฟล์ตั้งค่า หรือใช้ Git เมื่อพร้อม เริ่มจากข้อความ สี และตำแหน่งก่อน แล้วค่อยเรียนรู้สูตรและการดึงข้อมูล

เอกสารอ้างอิงการใช้งานเครื่องมือ:
- https://code.visualstudio.com/docs/terminal/getting-started
- https://code.visualstudio.com/docs/getstarted/overview
- https://vite.dev/guide/
- https://vite.dev/guide/cli
