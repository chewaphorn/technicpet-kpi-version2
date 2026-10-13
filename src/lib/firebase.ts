import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, signInWithPopup,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';

import { 
  getFirestore, 
  initializeFirestore,
  deleteField,
  setLogLevel,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection, 
  doc, 
  setDoc, 
  getDoc,
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp
} from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';
import { AuthUser, UserRole } from '../types';
import { checkUserAuthorization } from './authControl';


export const firebaseConfig = {
  projectId: (firebaseConfigJson as any).projectId,
  appId: (firebaseConfigJson as any).appId,
  apiKey: (firebaseConfigJson as any).apiKey,
  authDomain: (firebaseConfigJson as any).authDomain,
  firestoreDatabaseId: (firebaseConfigJson as any).firestoreDatabaseId,
  storageBucket: (firebaseConfigJson as any).storageBucket,
  messagingSenderId: (firebaseConfigJson as any).messagingSenderId,
};

export const firestoreDatabaseId = firebaseConfig.firestoreDatabaseId || '(default)';

// Silence benign connection retry notifications in sandboxed/proxy iframe environments
setLogLevel('error');

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);


// Initialize Firestore with robust local persistent cache and long-polling for container and iframe proxy environments
export const db = (() => {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
        experimentalAutoDetectLongPolling: true,
      },
      firestoreDatabaseId
    );
  } catch (error) {
    console.warn('Firestore initialization fallback:', error);
    return getFirestore(app, firestoreDatabaseId);
  }
})();

// Check current auth session
export const initAuth = async (): Promise<User | null> => {
  await auth.authStateReady();
  return auth.currentUser;
};

export const getRoleInfo = (role: UserRole): { roleLabel: string; department: string } => {
  switch (role) {
    case 'admin':
      return { roleLabel: 'ผู้ดูแลระบบสูงสุด (System Admin)', department: 'Technic Pet Enterprise HQ' };
    case 'sales_manager':
      return { roleLabel: 'ผู้จัดการฝ่ายขาย (Sales Manager)', department: 'แผนกฝ่ายขายและการตลาด' };
    case 'warehouse_supervisor':
      return { roleLabel: 'หัวหน้างานคลังสินค้า (Warehouse Supervisor)', department: 'แผนกคลังสินค้าและจัดส่ง' };
    case 'logistics_coordinator':
      return { roleLabel: 'ผู้ควบคุมการขนส่ง (Logistics Coordinator)', department: 'แผนกจัดส่งและยานพาหนะ' };
    default:
      return { roleLabel: 'เจ้าหน้าที่ทั่วไป (Officer)', department: 'Technic Pet Operations' };
  }
};

// Save user profile to Firestore
export const saveUserProfileToFirestore = async (user: AuthUser) => {
  try {
    const userRef = doc(db, 'users', user.uid);
    const { email: authEmail, ...userProfile } = user;
    void authEmail;
    await setDoc(userRef, {
      ...userProfile,
      email: deleteField(),
      lastLoginAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error: any) {
    // Offline resilience: profile is saved in local session
    if (error?.code !== 'unavailable') {
      console.info('Firestore profile note:', error?.message || error);
    }
  }
};

const buildAuthorizedUser = (user: User, record: NonNullable<Awaited<ReturnType<typeof checkUserAuthorization>>['record']>): AuthUser => ({
  uid: user.uid,
  email: record.email,
  username: record.username || record.email.split('@')[0],
  displayName: record.name,
  role: record.role,
  roleLabel: record.roleLabel,
  department: record.department,
  initials: (record.name.split(' ').map((part) => part[0]).join('') || record.username?.slice(0, 2) || 'U').slice(0, 2).toUpperCase(),
  allowedScreens: record.allowedScreens,
  isAuthorized: true,
  lastLoginAt: new Date().toISOString(),
});

const persistAuthorizedUser = (userProfile: AuthUser): AuthUser => {
  void saveUserProfileToFirestore(userProfile);
  try {
    localStorage.setItem('technicpet_auth_user', JSON.stringify(userProfile));
  } catch {
    // Firebase owns the session; a blocked optional profile cache must not deny login.
  }
  return userProfile;
};

export const loginWithGoogle = async (): Promise<AuthUser> => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  let signedIn = false;
  try {
    const { user } = await signInWithPopup(auth, provider);
    signedIn = true;
    const authorization = await checkUserAuthorization(user.email || '');
    if (!authorization.isAuthorized || !authorization.record) {
      throw new Error('อีเมลนี้ไม่ได้รับอนุญาตหรือถูกระงับ กรุณาติดต่อผู้ดูแลระบบ');
    }
    return persistAuthorizedUser(buildAuthorizedUser(user, authorization.record));
  } catch (error: any) {
    if (signedIn) await firebaseSignOut(auth);
    if (error?.code === 'auth/popup-closed-by-user') throw new Error('ยกเลิกการเข้าสู่ระบบแล้ว กรุณาลองใหม่');
    if (error?.code === 'auth/popup-blocked') throw new Error('เบราว์เซอร์ปิดกั้นหน้าต่างเข้าสู่ระบบ กรุณาอนุญาตป๊อปอัปแล้วลองใหม่');
    if (error?.code === 'auth/operation-not-allowed') throw new Error('กรุณาเปิด Google ใน Firebase Authentication → Sign-in method');
    if (error?.code === 'auth/unauthorized-domain') throw new Error('โดเมนเว็บนี้ยังไม่ได้รับอนุญาต กรุณาเพิ่มโดเมนใน Firebase Authentication → Settings → Authorized domains');
    if (error?.code === 'permission-denied') throw new Error('อ่านสิทธิ์ไม่ได้ กรุณาตรวจว่าได้เผยแพร่ Firestore Rules สำหรับ Google Sign-in แล้ว');
    if (error?.code) throw new Error('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่ (' + error.code + ')');
    throw error;
  }
};

// Sign out
export const logOutUser = async () => {
  try {
    await firebaseSignOut(auth);
  } catch (err) {
    console.warn('Firebase signout note:', err);
  }
  localStorage.removeItem('technicpet_auth_user');
};

// Get current saved user with re-validation against the active account record
export const getStoredUser = async (): Promise<AuthUser | null> => {
  await auth.authStateReady();
  const firebaseUser = auth.currentUser;
  if (!firebaseUser?.email) {
    localStorage.removeItem('technicpet_auth_user');
    return null;
  }

  try {
    const saved = localStorage.getItem('technicpet_auth_user');
    const parsed = saved ? JSON.parse(saved) as AuthUser : null;
    if (parsed && (parsed.uid !== firebaseUser.uid ||
        parsed.email?.toLowerCase() !== firebaseUser.email.toLowerCase())) {
      localStorage.removeItem('technicpet_auth_user');
    }
    const authorization = await checkUserAuthorization(firebaseUser.email);
    if (!authorization.isAuthorized || !authorization.record) {
      await firebaseSignOut(auth);
      localStorage.removeItem('technicpet_auth_user');
      return null;
    }
    return persistAuthorizedUser(buildAuthorizedUser(firebaseUser, authorization.record));
  } catch (error) {
    console.error('Unable to restore the authenticated user from Firestore:', error);
    localStorage.removeItem('technicpet_auth_user');
    return null;
  }
};

export interface FirebaseImportBatch {
  id?: string;
  createdAt: any;
  importedBy: string;
  salesFileName?: string;
  salesRowCount?: number;
  pickingFileName?: string;
  pickingRowCount?: number;
  deliveryFileName?: string;
  deliveryRowCount?: number;
  status: string;
  kpiSnapshot?: {
    onTimeRate: number;
    totalOrders: number;
    completedOrders: number;
    pendingOrders: number;
  };
}

// Save an import batch to Firestore
export const saveImportBatchToFirestore = async (batchData: Omit<FirebaseImportBatch, 'createdAt'>) => {
  try {
    const batchesCol = collection(db, 'importBatches');
    const docRef = await addDoc(batchesCol, {
      ...batchData,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: any) {
    // Offline resilience: generate fallback batch ID
    console.info('Operating batch import with offline buffer:', error?.message || error);
    return `local-batch-${Date.now()}`;
  }
};

// Listen to real-time import history from Firestore
export const subscribeToImportBatches = (callback: (batches: FirebaseImportBatch[]) => void) => {
  try {
    const batchesCol = collection(db, 'importBatches');
    const q = query(batchesCol, orderBy('createdAt', 'desc'), limit(15));
    
    return onSnapshot(q, (snapshot) => {
      const batches: FirebaseImportBatch[] = [];
      snapshot.forEach((docSnap) => {
        batches.push({
          id: docSnap.id,
          ...docSnap.data(),
        } as FirebaseImportBatch);
      });
      callback(batches);
    }, (err) => {
      // Gracefully handle offline or network connection errors
      if (err.code === 'unavailable' || err.message?.includes('unavailable') || err.message?.includes('offline')) {
        // Expected when operating in offline cache mode
        return;
      }
      console.info('Firestore subscription note:', err.message || err);
    });
  } catch (error) {
    return () => {};
  }
};

// Save a KPI snapshot to Firestore
export const saveKPISummaryToFirestore = async (dateKey: string, summary: Record<string, any>) => {
  try {
    const summaryRef = doc(db, 'kpiSummaries', dateKey);
    await setDoc(summaryRef, {
      ...summary,
      dateKey,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error: any) {
    // Offline resilience
    if (error?.code !== 'unavailable') {
      console.info('Firestore KPI sync note:', error?.message || error);
    }
  }
};
