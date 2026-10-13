import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { checkUserAuthorization } from './authControl';
import { DEFAULT_KPI_TARGETS, KpiTargets, normalizeKpiTargets, validKpiTargets } from '../utils/kpiTargets';

function publishTargets(targets: KpiTargets) {
  localStorage.setItem('technicpet_kpi_targets', JSON.stringify(targets));
  window.dispatchEvent(new Event('technicpet:kpi-targets-updated'));
}

/** Firestore is the shared source of truth; localStorage is only its report cache. */
export function subscribeToKpiTargets(onError: (message: string | null) => void) {
  publishTargets(DEFAULT_KPI_TARGETS);
  return onSnapshot(doc(db, 'settings', 'kpiTargets'), snapshot => {
    const value = snapshot.exists() ? snapshot.data() : DEFAULT_KPI_TARGETS;
    const targets = normalizeKpiTargets(value);
    if (!targets) {
      publishTargets(DEFAULT_KPI_TARGETS);
      onError('การตั้งค่า KPI บนเซิร์ฟเวอร์ไม่ถูกต้อง ขณะนี้ใช้ค่าเริ่มต้น กรุณาให้ผู้บริหารบันทึกใหม่');
      return;
    }
    publishTargets(targets);
    onError(snapshot.exists() ? null : 'ยังไม่ได้บันทึกเป้าหมาย KPI ส่วนกลาง ขณะนี้ใช้ค่าเริ่มต้น กรุณาให้ผู้บริหารกำหนดเป้าหมายในหน้าตั้งค่า');
  }, () => {
    publishTargets(DEFAULT_KPI_TARGETS);
    onError('โหลดเป้าหมาย KPI ส่วนกลางไม่ได้ ขณะนี้ใช้ค่าเริ่มต้น กรุณาตรวจสอบการเชื่อมต่อและ Firestore Rules');
  });
}

export async function saveKpiTargets(targets: KpiTargets) {
  if (!validKpiTargets(targets)) throw new Error('กรุณาระบุเป้าหมายจำนวนวันและยอดขายมากกว่า 0 และอัตราสำเร็จระหว่าง 0–100%');
  const permission = await checkUserAuthorization(auth.currentUser?.email || '');
  if (!permission.isAuthorized || permission.record?.role !== 'admin') throw new Error('เฉพาะผู้บริหารที่ได้รับอนุญาตเท่านั้นที่กำหนดเป้าหมาย KPI ได้');
  await setDoc(doc(db, 'settings', 'kpiTargets'), { ...targets, updatedBy: auth.currentUser!.uid, updatedAt: serverTimestamp() });
  publishTargets(targets);
}
