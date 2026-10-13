import { createHash } from 'node:crypto';
import { getApp, initializeApp } from 'firebase-admin/app';
import { getAuth, UserRecord } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { defineString } from 'firebase-functions/params';
import { onInit } from 'firebase-functions/v2/core';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const projectId = process.env.GCLOUD_PROJECT;
const databaseIdParam = defineString('FIRESTORE_DATABASE_ID');
const primaryAdminEmail = 'chewaphorn@tni.ac.th';
const primaryAdminUsername = 'chewaphorn';
const validRoles = [
  'admin',
  'sales_manager',
  'warehouse_supervisor',
  'logistics_coordinator',
  'viewer',
] as const;
type UserRole = typeof validRoles[number];

initializeApp({ projectId });
const adminAuth = getAuth(getApp());
let db: ReturnType<typeof getFirestore>;
onInit(() => {
  const databaseId = databaseIdParam.value().trim();
  if (!databaseId) throw new Error('FIRESTORE_DATABASE_ID must be configured');
  db = getFirestore(getApp(), databaseId);
});

const normalizeUsername = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'กรุณาระบุชื่อผู้ใช้');
  }
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new HttpsError('invalid-argument', 'ชื่อผู้ใช้ต้องยาว 3-32 ตัว และใช้ a-z, 0-9, จุด, ขีดกลาง หรือขีดล่าง');
  }
  return username;
};

const getAuthEmailForUsername = (username: string): string =>
  `u-${createHash('sha256').update(username).digest('hex').slice(0, 32)}@username.technicpet.invalid`;

const requireAdministrator = async (request: { auth?: { uid: string; token: Record<string, unknown> } }): Promise<string> => {
  const callerEmail = typeof request.auth?.token.email === 'string'
    ? request.auth.token.email.trim().toLowerCase()
    : '';
  if (!request.auth || !callerEmail) {
    throw new HttpsError('unauthenticated', 'กรุณาเข้าสู่ระบบก่อนดำเนินการ');
  }
  if (callerEmail === primaryAdminEmail) return callerEmail;

  const callerSnapshot = await db.collection('authorized_users').doc(callerEmail).get();
  const caller = callerSnapshot.data();
  if (caller?.role !== 'admin' || caller.status !== 'active') {
    throw new HttpsError('permission-denied', 'เฉพาะผู้ดูแลระบบที่เปิดใช้งานเท่านั้น');
  }
  return callerEmail;
};

const findAuthEmailForUsername = async (
  username: string,
  includeLegacyRecords = false
): Promise<string | null> => {
  const indexRef = db.collection('login_usernames').doc(username);
  const index = await indexRef.get();
  if (index.exists && typeof index.get('authEmail') === 'string') {
    return index.get('authEmail') as string;
  }

  let authEmail: string | null = username === primaryAdminUsername ? primaryAdminEmail : null;
  if (!authEmail && includeLegacyRecords) {
    const namedUsers = await db.collection('authorized_users').where('username', '==', username).limit(2).get();
    if (namedUsers.size === 1) authEmail = namedUsers.docs[0].id;
    if (namedUsers.size > 1) throw new HttpsError('failed-precondition', 'ชื่อผู้ใช้ซ้ำกัน กรุณาให้ผู้ดูแลตรวจสอบ');
  }

  if (!authEmail && includeLegacyRecords) {
    const legacyUsers = await db.collection('authorized_users').get();
    const matches = legacyUsers.docs.filter((userDoc) => {
      const email = userDoc.get('email');
      return typeof email === 'string' && email.split('@')[0].toLowerCase() === username;
    });
    if (matches.length === 1) authEmail = matches[0].id;
    if (matches.length > 1) throw new HttpsError('failed-precondition', 'ชื่อผู้ใช้ซ้ำกัน กรุณาให้ผู้ดูแลตรวจสอบ');
  }

  if (authEmail) {
    const userDoc = await db.collection('authorized_users').doc(authEmail).get();
    if (!userDoc.exists || (!includeLegacyRecords && userDoc.get('status') !== 'active')) return null;
    await indexRef.set({ authEmail, createdAt: new Date() }, { merge: true });
  }
  return authEmail;
};

export const resolveLoginUsername = onCall({ region: 'asia-southeast1' }, async (request) => {
  const username = normalizeUsername(request.data?.username);
  const authEmail = await findAuthEmailForUsername(username) || getAuthEmailForUsername(username);
  return { authEmail };
});

export const createUsernameAccount = onCall({ region: 'asia-southeast1' }, async (request) => {
  try {
  const administratorEmail = await requireAdministrator(request);
  const username = normalizeUsername(request.data?.username);
  const password = request.data?.password;
  const name = typeof request.data?.name === 'string' ? request.data.name.trim() : '';
  const role = request.data?.role as UserRole;
  const department = typeof request.data?.department === 'string' ? request.data.department.trim() : '';
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new HttpsError('invalid-argument', 'รหัสผ่านต้องมีความยาว 8-128 ตัวอักษร');
  }
  if (!name || name.length > 120) throw new HttpsError('invalid-argument', 'กรุณาระบุชื่อผู้ใช้');
  if (!validRoles.includes(role)) throw new HttpsError('invalid-argument', 'บทบาทไม่ถูกต้อง');
  if (!department || department.length > 120) throw new HttpsError('invalid-argument', 'กรุณาระบุแผนก');

  const usernameRef = db.collection('login_usernames').doc(username);
  const existingIndex = await usernameRef.get();
  if (existingIndex.exists || username === primaryAdminUsername) {
    throw new HttpsError('already-exists', 'ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว');
  }

  const authEmail = getAuthEmailForUsername(username);
  const legacyAuthEmail = await findAuthEmailForUsername(username, true);
  if (legacyAuthEmail === authEmail) {
    throw new HttpsError('already-exists', 'ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว');
  }
  const roleDetails: Record<UserRole, { label: string; screens: string[] }> = {
    admin: { label: 'ผู้ดูแลระบบสูงสุด (System Admin)', screens: ['overview', 'sales', 'warehouse', 'delivery'] },
    sales_manager: { label: 'ผู้จัดการฝ่ายขาย (Sales Manager)', screens: ['overview', 'sales'] },
    warehouse_supervisor: { label: 'หัวหน้างานคลังสินค้า (Warehouse Supervisor)', screens: ['overview', 'warehouse'] },
    logistics_coordinator: { label: 'ผู้ควบคุมการขนส่ง (Logistics Coordinator)', screens: ['overview', 'delivery'] },
    viewer: { label: 'ผู้ดูรายงานทั่วไป (Viewer)', screens: ['overview'] },
  };
  const callerProfile = await db.collection('authorized_users').doc(administratorEmail).get();
  const addedBy = callerProfile.get('username') || primaryAdminUsername;
  const userRecord = {
    id: authEmail,
    email: authEmail,
    username,
    name,
    role,
    roleLabel: roleDetails[role].label,
    department,
    status: 'active',
    allowedScreens: roleDetails[role].screens,
    addedAt: new Date().toISOString().slice(0, 10),
    addedBy,
    notes: 'เพิ่มจากระบบจัดการสิทธิ์ผู้ใช้งาน',
  };

  let createdUid: string | undefined;
  let migratedExistingAuthAccount = false;
  try {
    let existingAuthUser: UserRecord | undefined;
    if (legacyAuthEmail) {
      try {
        existingAuthUser = await adminAuth.getUserByEmail(legacyAuthEmail);
      } catch (error) {
        if (typeof error !== 'object' || error === null || !('code' in error) ||
            error.code !== 'auth/user-not-found') {
          throw error;
        }
      }
    }
    if (existingAuthUser) {
      const migratedUser = await adminAuth.updateUser(existingAuthUser.uid, {
        email: authEmail,
        emailVerified: true,
        password,
        displayName: name,
      });
      createdUid = migratedUser.uid;
      migratedExistingAuthAccount = true;
    } else {
      const createdUser = await adminAuth.createUser({
        email: authEmail,
        password,
        emailVerified: true,
        displayName: name,
      });
      createdUid = createdUser.uid;
    }
    await db.runTransaction(async (transaction) => {
      const currentIndex = await transaction.get(usernameRef);
      if (currentIndex.exists && currentIndex.get('authEmail') !== legacyAuthEmail) {
        throw new HttpsError('already-exists', 'ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว');
      }
      const legacyUserRef = legacyAuthEmail
        ? db.collection('authorized_users').doc(legacyAuthEmail)
        : null;
      const legacyUserSnapshot = legacyUserRef ? await transaction.get(legacyUserRef) : null;
      transaction.set(usernameRef, { authEmail, createdAt: new Date() });
      transaction.set(db.collection('authorized_users').doc(authEmail), userRecord);
      transaction.set(db.collection('authorized_emails').doc(authEmail), { email: authEmail, status: 'active' });
      if (migratedExistingAuthAccount && createdUid) {
        transaction.set(db.collection('users').doc(createdUid), {
          username,
          email: FieldValue.delete(),
        }, { merge: true });
      }
      if (legacyAuthEmail && legacyAuthEmail !== authEmail) {
        if (legacyUserRef && legacyUserSnapshot?.exists) transaction.delete(legacyUserRef);
        transaction.delete(db.collection('authorized_emails').doc(legacyAuthEmail));
      }
    });
  } catch (error) {
    if (createdUid) {
      try {
        if (migratedExistingAuthAccount && legacyAuthEmail) {
          await adminAuth.updateUser(createdUid, { email: legacyAuthEmail, emailVerified: true });
        } else {
          await adminAuth.deleteUser(createdUid);
        }
      } catch (cleanupError) {
        console.error('Unable to roll back partially created auth account:', cleanupError);
        throw new HttpsError('internal', 'สร้างบัญชีไม่สำเร็จ และยกเลิกบัญชีภายในไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ');
      }
    }
    if (error instanceof HttpsError) throw error;
    const errorCode = typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';
    if (errorCode === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'บัญชีภายในนี้มีอยู่แล้ว กรุณาติดต่อผู้ดูแลระบบ');
    }
    console.error('Unable to create username account:', error);
    throw new HttpsError('internal', 'ไม่สามารถสร้างบัญชีผู้ใช้ได้ กรุณาลองใหม่');
  }

  return { authEmail };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code) : 'unknown';
    // Do not log request.data: it contains the initial password.
    console.error('createUsernameAccount failed before completion', { code });
    if (code === '5') {
      throw new HttpsError('failed-precondition', 'ไม่พบฐานข้อมูลที่บริการบัญชีใช้งาน กรุณาตรวจ FIRESTORE_DATABASE_ID ของ Functions');
    }
    if (code === '7' || code === 'auth/insufficient-permission') {
      throw new HttpsError('failed-precondition', 'บริการบัญชีไม่มีสิทธิ์เข้าถึง Firebase กรุณาตรวจสิทธิ์ Service Account ของ Functions');
    }
    if (code === '14' || code === '4') {
      throw new HttpsError('unavailable', 'บริการฐานข้อมูลไม่พร้อม กรุณารอสักครู่แล้วลองใหม่');
    }
    throw new HttpsError('internal', 'บริการสร้างบัญชีขัดข้อง กรุณาให้ผู้ดูแลตรวจ Logs ของ createUsernameAccount');
  }
});

export const setUsernamePassword = onCall({ region: 'asia-southeast1' }, async (request) => {
  await requireAdministrator(request);
  const authEmail = typeof request.data?.authEmail === 'string' ? request.data.authEmail.trim().toLowerCase() : '';
  const password = request.data?.password;
  if (!authEmail) throw new HttpsError('invalid-argument', 'ไม่พบบัญชีผู้ใช้');
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new HttpsError('invalid-argument', 'รหัสผ่านต้องมีความยาว 8-128 ตัวอักษร');
  }
  const target = await db.collection('authorized_users').doc(authEmail).get();
  if (!target.exists) throw new HttpsError('not-found', 'ไม่พบบัญชีผู้ใช้');
  const authUser = await adminAuth.getUserByEmail(authEmail);
  await adminAuth.updateUser(authUser.uid, { password });
  return { updated: true };
});

export const deleteUsernameAccount = onCall({ region: 'asia-southeast1' }, async (request) => {
  const administratorEmail = await requireAdministrator(request);
  const authEmail = typeof request.data?.authEmail === 'string' ? request.data.authEmail.trim().toLowerCase() : '';
  if (!authEmail) throw new HttpsError('invalid-argument', 'ไม่พบบัญชีผู้ใช้');
  if (authEmail === primaryAdminEmail || authEmail === administratorEmail) {
    throw new HttpsError('failed-precondition', 'ไม่สามารถลบบัญชีผู้ดูแลที่ใช้งานอยู่ได้');
  }

  const userRef = db.collection('authorized_users').doc(authEmail);
  const userSnapshot = await userRef.get();
  if (!userSnapshot.exists) throw new HttpsError('not-found', 'ไม่พบบัญชีผู้ใช้');
  const username = userSnapshot.get('username');
  const batch = db.batch();
  batch.update(userRef, { status: 'inactive' });
  batch.set(db.collection('authorized_emails').doc(authEmail), { email: authEmail, status: 'inactive' }, { merge: true });
  if (typeof username === 'string') batch.delete(db.collection('login_usernames').doc(username));
  await batch.commit();
  try {
    const authUser = await adminAuth.getUserByEmail(authEmail);
    await adminAuth.deleteUser(authUser.uid);
  } catch (error) {
    if (typeof error !== 'object' || error === null || !('code' in error) ||
        error.code !== 'auth/user-not-found') {
      throw error;
    }
  }
  const cleanupBatch = db.batch();
  cleanupBatch.delete(userRef);
  cleanupBatch.delete(db.collection('authorized_emails').doc(authEmail));
  await cleanupBatch.commit();
  return { deleted: true };
});
