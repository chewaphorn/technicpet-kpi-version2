# แผนที่โค้ดและการทำงานของแต่ละส่วน

## ภาพรวม

`index.html` เป็นจุดให้เบราว์เซอร์โหลดแอป จากนั้น `src/main.tsx` นำ `App.tsx` มาวางบนหน้าเว็บ
`App.tsx` เก็บสถานะผู้ใช้ หน้าที่กำลังเปิด ข้อมูลรายแผนก และหน้าต่างย่อย แล้วส่งข้อมูลกับฟังก์ชันให้ components
React วาดหน้าจอใหม่เมื่อ state เปลี่ยน เช่น เมื่อกด sync แล้วได้รับรายงานชุดใหม่

## หน้าจอและงานแต่ละแผนก

| ส่วนงาน | ไฟล์หน้าจอ | ไฟล์คำนวณ | การทำงาน |
|---|---|---|---|
| ภาพรวมผู้บริหาร | components/ExecutiveOverview.tsx | รับข้อมูลที่ App รวมจากรายแผนก | แสดง KPI กราฟและภาพรวม |
| ฝ่ายขาย | components/SalesReportView.tsx | utils/salesAnalyzer.ts | วิเคราะห์ข้อมูลขาย เช่นยอดขาย ออเดอร์ ลูกค้า สินค้าและพนักงานขาย |
| คลังสินค้า | components/WarehouseReportView.tsx | utils/warehouseAnalyzer.ts | วิเคราะห์เอกสารคลัง ความสำเร็จและเวลาการจัดสินค้า |
| ขนส่ง | components/DeliveryReportView.tsx | utils/deliveryAnalyzer.ts | วิเคราะห์เที่ยวส่ง น้ำหนัก ระยะเวลาส่งและสถานะ |

ทุกเส้นทางในตารางเริ่มจาก `src/` การเปลี่ยนหน้าตากราฟทำที่ component ส่วนการเปลี่ยนนิยามตัวเลขเริ่มตรวจที่ analyzer และตรวจว่าหน้าจอมีการกรองหรือคำนวณเพิ่มหรือไม่

## แผนที่ไฟล์สำคัญ

| ไฟล์หรือโฟลเดอร์ | หน้าที่ | เมื่อต้องการแก้ |
|---|---|---|
| src/App.tsx | ศูนย์กลาง state, navigation, modal และ callback sync | การส่งข้อมูลระหว่างหน้าจอ |
| src/main.tsx | จุดเริ่ม React | ปกติยังไม่ต้องแก้ |
| src/index.css | สไตล์ส่วนกลางและ Tailwind | ฟอนต์/สไตล์ร่วม |
| src/types.ts | ข้อตกลงรูปร่างข้อมูลและบทบาทผู้ใช้ | เพิ่ม field แล้วตามแก้ผู้สร้างและผู้ใช้ field |
| src/components/Sidebar.tsx | เมนูซ้าย | ชื่อเมนู ไอคอน การแสดงเมนู |
| src/components/Header.tsx | แถบบนและชื่อหน้า | ชื่อหัวข้อและปุ่มบน |
| src/components/LoginView.tsx | แบบฟอร์มเข้าสู่ระบบ | หน้าตาและข้อความ login |
| src/components/AccessRestrictedView.tsx | หน้าจอแจ้งจำกัดสิทธิ์ | ข้อความเมื่อเข้าไม่ได้ |
| src/components/NewReportModal.tsx | หน้าต่างนำเข้าไฟล์และจัดทำรายงาน | ขั้นตอนอัปโหลด |
| src/components/GoogleSheetIntegrationModal.tsx | หน้าต่างตั้งค่าและนำเข้าจาก Sheets | ลิงก์/การเลือกแผนก |
| src/components/SettingsModal.tsx | หน้าต่างตั้งค่า | ตัวเลือกและการจัดการในหน้าตั้งค่า |
| src/components/DocumentTrackingModal.tsx | แสดงการติดตามเอกสาร | รายละเอียดเอกสาร |
| src/components/PDFReportPreviewModal.tsx | จัดหน้ารายงานก่อนส่งออก | รูปแบบเอกสาร PDF |
| src/utils/pdfExport.ts | เครื่องมือส่งออก PDF | กระบวนการ export |
| src/components/NotificationModal.tsx | รายการแจ้งเตือน | หน้าต่างแจ้งเตือน |
| src/components/ProfileModal.tsx | ข้อมูลผู้ใช้ | หน้าต่าง profile |
| src/components/HelpModal.tsx | ความช่วยเหลือ | คู่มือในแอป |
| src/utils/fileParser.ts | อ่าน CSV/Excel และจัดข้อมูลตาราง | อ่านหัวตาราง รูปแบบไฟล์และหลายชีท |
| src/utils/dataProcessor.ts | ฟังก์ชันแปลงข้อมูลและรวมผลจาก analyzer | ประมวลผลไฟล์เป็นรายงานรวม |
| src/utils/googleSheets.ts | ทำความสะอาด URL อ่าน ID/gid ดึงและแปลงข้อมูล | ลิงก์ แท็บ และการ fetch |
| src/utils/departmentSyncService.ts | ประสานการดึง วิเคราะห์และ cache แยกแผนก | sync เฉพาะฝ่ายขาย/คลัง/ขนส่ง |
| src/utils/dateUtils.ts | เครื่องมือเรื่องวันที่ | รูปแบบและการจัดการวันที่ |
| src/lib/firebase.ts | เชื่อม Firebase, ส่ง/ยืนยัน email sign-in link, profile และ import batches | การเชื่อมต่อและการยืนยันตัวตนจริง |
| src/lib/authControl.ts | รายชื่อผู้มีสิทธิ์จาก Firestore, บทบาท และการตรวจสิทธิ์แบบ real-time | การจัดการและบังคับใช้สิทธิ์ผู้ใช้ |
| src/data/mockData.ts | ค่าเริ่มต้น/ชุดข้อมูลประกอบ | ตรวจข้อมูลตัวอย่างที่แสดง |
| firebase-applet-config.json | ค่าระบุโครงการ Firebase | เชื่อมโครงการทดสอบของคุณ |
| firebase.json | ชี้ Firebase CLI ไปยังกฎใน `firestore.rules` | deploy กฎด้วย Firebase CLI |
| firestore.rules | กฎ Firestore สำหรับข้อมูลผู้ใช้และผู้ดูแล | ต้อง deploy ไปยัง Firebase project เองก่อนใช้งานจริง |
| firebase-blueprint.json | เอกสารโครงสร้าง Firebase ที่แนบมา | ใช้อ่านประกอบ ไม่ใช่ตัวรันฐานข้อมูล |
| metadata.json | metadata ของแอปต้นทาง | ปกติไม่ใช่จุดแก้หน้าจอ |
| package.json | รายการแพ็กเกจและคำสั่ง npm | เพิ่มเครื่องมือหรือคำสั่ง |
| package-lock.json | รุ่นแพ็กเกจที่ npm ติดตั้งในชุดนี้ | เก็บไปกับโปรเจกต์ ไม่แก้ด้วยมือ |
| bun.lock | lockfile เดิมของ Bun | คู่มือนี้ใช้ npm ไม่ต้องสลับไปใช้ Bun |
| vite.config.ts | ตั้งค่า Vite, React, Tailwind และ alias | การทำงานของ dev server/build |
| tsconfig.json | ตั้งค่า TypeScript | กติกาตรวจโค้ด |
| index.html | เอกสารเริ่มต้น | ชื่อแท็บ browser และจุด mount |
| .env.example | ตัวอย่าง env เดิมจาก AI Studio | ไม่จำเป็นต้องกรอก Gemini เพื่อเริ่มแอปชุดนี้ |
| .vscode/ | ตั้งค่า Terminal, tasks และ debug | เครื่องมือช่วยใน VS Code |
| node_modules/ | แพ็กเกจที่ npm ดาวน์โหลด | ไม่แก้โค้ดที่นี่ ไม่รวมใน ZIP |
| dist/ | ผลลัพธ์จาก build | ใช้ทดสอบ/เผยแพร่ ไม่แก้ต้นฉบับที่นี่ |

## เส้นทางข้อมูลสองแบบ

**อัปโหลดไฟล์:** ผู้ใช้เลือกไฟล์ใน NewReportModal → fileParser แปลงเป็นแถวข้อมูล → dataProcessor เรียก analyzer ของแต่ละแผนก → ส่งรายงานกลับ App → App เก็บ state แล้วส่งให้หน้ารายงาน
ปัจจุบัน Excel แบบอัปโหลดใช้ชีทแรกเท่านั้น ไม่ใช่การรวมทุกชีท

**Google Sheets รายแผนก:** ผู้ใช้ระบุลิงก์ → departmentSyncService เลือก URL ของแผนก → googleSheets ดึงข้อมูล → analyzer แผนกนั้นคำนวณ → เก็บ cache แยกแผนก → callback ใน App อัปเดต state → หน้ารายงานแสดงผล

| แผนก | ฟังก์ชัน sync | callback ใน App | analyzer |
|---|---|---|---|
| ขาย | syncSalesData | handleSyncSales | analyzeSalesData |
| คลัง | syncWarehouseData | handleSyncWarehouse | analyzeWarehouseData |
| ขนส่ง | syncDeliveryData | handleSyncDelivery | analyzeDeliveryData |
| รวม | syncAllDepartments | handleSyncAllDepartments | ประสานผลของแต่ละแผนก |

ไฟล์แนบเวอร์ชันนี้มี `getDepartmentUrls`, `saveDepartmentUrl` และ cache รายแผนกแล้ว หากเปลี่ยนลิงก์ผ่านหน้าจอได้ ไม่ต้องแก้ URL ฝังในโค้ด
หากจะแก้พฤติกรรม ให้เริ่มจาก GoogleSheetIntegrationModal → departmentSyncService → callback ใน App ตามลำดับ
การเปลี่ยน URL หรือ state ในเบราว์เซอร์หนึ่งไม่ใช่การตั้งค่าร่วมให้ทุกเครื่อง

## ตัวอย่างอ่าน React ให้เข้าใจ

ใน App มี `const [currentScreen, setCurrentScreen] = useState<ScreenId>('overview');`
`currentScreen` คือหน้าที่เปิดอยู่ ส่วน `setCurrentScreen` ใช้เปลี่ยนค่า และ `overview` เป็นหน้าเริ่มต้น
ชื่อที่ส่งให้ component เช่น `onSyncSales` เป็นฟังก์ชันที่ลูกเรียกเมื่อผู้ใช้กดปุ่ม ไม่ใช่ข้อมูลที่บันทึกในฐานข้อมูล

การเพิ่ม KPI ใหม่ควรเริ่มจากนิยามสูตรและหน่วย → เพิ่ม/แก้ types → คำนวณใน analyzer → ส่งผลผ่าน App → แสดงในหน้ารายงาน → เทียบกับข้อมูลตัวอย่างที่คำนวณด้วยมือ
เพียงเปลี่ยนข้อความบนการ์ด KPI ไม่ได้เปลี่ยนสูตรที่คำนวณ

## สิ่งที่เพิ่มในชุดพัฒนา

เพิ่ม workspace, VS Code tasks/debug/settings, คำสั่ง .cmd สำหรับ Windows, คู่มือภาษาไทยและ package-lock.json
เปลี่ยน dev server ให้ใช้ 127.0.0.1:3000 และ strictPort เพื่อไม่เปลี่ยน port โดยไม่ตั้งใจ
เพิ่ม typecheck และเปลี่ยน clean จากคำสั่ง rm ของ Unix เป็น Node.js ลบเฉพาะ dist
โค้ดใน src และกฎธุรกิจคงตามต้นฉบับ ดูผลการตรวจใน VALIDATION.md
