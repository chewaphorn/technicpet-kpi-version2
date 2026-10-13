import { AuthorizedUserRecord, ScreenId, UserRole } from '../types';
import { db, auth } from './firebase';
import { collection, deleteDoc, doc, getDoc, getDocFromServer, getDocs, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';

export const DEFAULT_AUTHORIZED_USERS: AuthorizedUserRecord[] = [
  {
    id: 'chewaphorn@tni.ac.th',
    email: 'chewaphorn@tni.ac.th',
    username: 'chewaphorn',
    name: 'Chewaphorn P.',
    role: 'admin',
    roleLabel: 'ผู้ดูแลระบบสูงสุด (System Admin)',
    department: 'Technic Pet Enterprise HQ',
    status: 'active',
    allowedScreens: ['overview', 'sales', 'warehouse', 'delivery'],
    addedAt: '2025-01-01',
    addedBy: 'System Master',
    notes: 'ผู้ดูแลระบบ',
  },
];

export const PRIMARY_ADMIN_EMAIL = DEFAULT_AUTHORIZED_USERS[0].email;

export const ROLE_DETAILS: Record<UserRole, { label: string; department: string; defaultScreens: ScreenId[] }> = {
  admin: {
    label: 'ผู้ดูแลระบบสูงสุด (System Admin)',
    department: 'TechnicPet',
    defaultScreens: ['overview', 'sales', 'warehouse', 'delivery'],
  },
  sales_manager: {
    label: 'ผู้จัดการฝ่ายขาย (Sales Manager)',
    department: 'แผนกฝ่ายขายและการตลาด',
    defaultScreens: ['overview', 'sales'],
  },
  warehouse_supervisor: {
    label: 'หัวหน้างานคลังสินค้า (Warehouse Supervisor)',
    department: 'แผนกคลังสินค้าและจัดส่ง',
    defaultScreens: ['overview', 'warehouse'],
  },
  logistics_coordinator: {
    label: 'ผู้ควบคุมการขนส่ง (Logistics Coordinator)',
    department: 'แผนกจัดส่งและยานพาหนะ',
    defaultScreens: ['overview', 'delivery'],
  },
  viewer: {
    label: 'ผู้ดูรายงานทั่วไป (Viewer)',
    department: 'Technic Pet Operations',
    defaultScreens: ['overview'],
  },
};

export const checkUserAuthorization = async (
  email: string
): Promise<{
  isAuthorized: boolean;
  record?: AuthorizedUserRecord;
  reason?: 'not_found' | 'inactive' | 'invalid_email';
}> => {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return { isAuthorized: false, reason: 'invalid_email' };

  const user = auth.currentUser;
  if (!user || user.email?.toLowerCase() !== cleanEmail || !user.emailVerified) {
    return { isAuthorized: false, reason: 'invalid_email' };
  }
  const token = await user.getIdTokenResult();
  if (token.signInProvider !== 'google.com') return { isAuthorized: false, reason: 'invalid_email' };
  const snapshot = await getDocFromServer(doc(db, 'authorized_users', cleanEmail));
  if (!snapshot.exists()) return { isAuthorized: false, reason: 'not_found' };
  const record = { ...snapshot.data(), id: snapshot.id } as AuthorizedUserRecord;
  if (record.status !== 'active') return { isAuthorized: false, reason: 'inactive' };
  if (record.email !== cleanEmail || !Object.hasOwn(ROLE_DETAILS, record.role) ||
      typeof record.name !== 'string' || !Array.isArray(record.allowedScreens)) {
    return { isAuthorized: false, reason: 'not_found' };
  }
  return { isAuthorized: true, record };
};

const requireAccountAdministrator = async (): Promise<void> => {
  const email = auth.currentUser?.email?.trim().toLowerCase();
  if (!email) throw new Error('กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแลก่อนจัดการบัญชี');

  const permission = await checkUserAuthorization(email);
  if (!permission.isAuthorized || permission.record?.role !== 'admin') {
    throw new Error('เฉพาะผู้ดูแลระบบที่เข้าสู่ระบบแล้วเท่านั้นที่จัดการบัญชีได้');
  }
};

export const getAuthorizedUsers = async (): Promise<AuthorizedUserRecord[]> => {
  await requireAccountAdministrator();

  const snapshot = await getDocs(collection(db, 'authorized_users'));
  return snapshot.docs.map(item => ({ ...item.data(), id: item.id } as AuthorizedUserRecord));
};

export const subscribeToUserAuthorization = (
  email: string,
  onChange: (record: AuthorizedUserRecord | null) => void,
  onError: (error: Error) => void
): (() => void) => onSnapshot(
  doc(db, 'authorized_users', email.trim().toLowerCase()),
  (userSnapshot) => {
    onChange(userSnapshot.exists()
      ? { ...userSnapshot.data(), id: userSnapshot.id } as AuthorizedUserRecord
      : null);
  },
  onError
);

export const saveAuthorizedUser = async (userRecord: AuthorizedUserRecord): Promise<void> => {
  await requireAccountAdministrator();
  const email = userRecord.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('.invalid')) throw new Error('กรุณาระบุอีเมล Google ที่ใช้งานได้จริง');
  if (email === PRIMARY_ADMIN_EMAIL && (userRecord.role !== 'admin' || userRecord.status !== 'active')) throw new Error('ไม่สามารถลดสิทธิ์ผู้ดูแลหลักได้');
  if (email === auth.currentUser?.email?.toLowerCase() && (userRecord.role !== 'admin' || userRecord.status !== 'active')) throw new Error('ไม่สามารถลดสิทธิ์หรือระงับบัญชีที่กำลังใช้งานอยู่');

  const batch = writeBatch(db);
  batch.set(doc(db, 'authorized_users', email), {
    ...userRecord,
    id: email,
    email,
  });
  batch.set(doc(db, 'authorized_emails', email), {
    email,
    status: userRecord.status,
  });
  await batch.commit();
};

export const removeAuthorizedUser = async (id: string): Promise<void> => {
  await requireAccountAdministrator();
  const email = id.trim().toLowerCase();
  if (email === PRIMARY_ADMIN_EMAIL) {
    throw new Error('ไม่สามารถลบบัญชีผู้ดูแลระบบสูงสุด (Master Admin) ได้');
  }
  if (email === auth.currentUser?.email?.toLowerCase()) throw new Error('ไม่สามารถลบสิทธิ์บัญชีที่กำลังใช้งานอยู่');
  const batch = writeBatch(db);
  batch.delete(doc(db, 'authorized_users', email));
  batch.delete(doc(db, 'authorized_emails', email));
  await batch.commit();
};

export const toggleUserStatus = async (id: string): Promise<AuthorizedUserRecord | null> => {
  await requireAccountAdministrator();
  const email = id.trim().toLowerCase();
  if (email === PRIMARY_ADMIN_EMAIL) {
    throw new Error('ไม่สามารถระงับสิทธิ์บัญชีผู้ดูแลระบบสูงสุด (Master Admin) ได้');
  }

  const userRef = doc(db, 'authorized_users', email);
  if (email === auth.currentUser?.email?.toLowerCase()) throw new Error('ไม่สามารถระงับบัญชีที่กำลังใช้งานอยู่');
  const userSnapshot = await getDoc(userRef);
  if (!userSnapshot.exists()) return null;

  const target = { ...userSnapshot.data(), id: userSnapshot.id } as AuthorizedUserRecord;
  const status: AuthorizedUserRecord['status'] = target.status === 'active' ? 'inactive' : 'active';
  const updated: AuthorizedUserRecord = { ...target, status };
  const batch = writeBatch(db);
  batch.set(userRef, { status: updated.status }, { merge: true });
  batch.set(doc(db, 'authorized_emails', email), {
    email,
    status: updated.status,
  });
  await batch.commit();
  return updated;
};

export const canAccessScreen = (
  role: UserRole,
  screen: ScreenId,
  allowedScreens?: ScreenId[]
): boolean => {
  if (role === 'admin') return true;
  const roleInfo = ROLE_DETAILS[role];
  return !!roleInfo && roleInfo.defaultScreens.includes(screen) &&
    (allowedScreens === undefined || allowedScreens.includes(screen));
};

export const canAccessReport = (user: import('../types').AuthUser | null | undefined,
  department: 'overview' | 'sales' | 'warehouse' | 'delivery' | 'all'): boolean => {
  if (!user) return false;
  // Consolidated exports include details from every department.
  if (department === 'all' || department === 'overview') return user.role === 'admin';
  return canAccessScreen(user.role, department, user.allowedScreens);
};

export const canConfigureDepartmentSheet = (
  role: UserRole,
  department: 'all' | 'sales' | 'warehouse' | 'delivery'
): boolean => {
  if (role === 'admin') return true;
  if (department === 'all') return false;
  if (department === 'sales' && role === 'sales_manager') return true;
  if (department === 'warehouse' && role === 'warehouse_supervisor') return true;
  if (department === 'delivery' && role === 'logistics_coordinator') return true;
  return false;
};
