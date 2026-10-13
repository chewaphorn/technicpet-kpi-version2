import React, { useRef, useState } from 'react';
import { AuthUser } from '../types';
import { loginWithGoogle } from '../lib/firebase';
import { ShieldCheck } from 'lucide-react';

export const LoginView: React.FC<{ onLoginSuccess: (user: AuthUser) => void }> = ({ onLoginSuccess }) => {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const login = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try { onLoginSuccess(await loginWithGoogle()); }
    catch (error) { setError(error instanceof Error ? error.message : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่'); }
    finally { pending.current = false; setBusy(false); }
  };
  return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <section className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="bg-[#0a2558] p-8 text-center text-white">
          <ShieldCheck className="mx-auto mb-4 h-10 w-10" />
          <h1 className="font-bold text-lg">TECHNIC PET</h1>
          <p className="mt-2 text-sm text-blue-100">ระบบบริหารจัดการเป้าหมายและตัวชี้วัด</p>
        </header>
        <div className="p-8 space-y-5">
          <p className="text-sm text-slate-600">เข้าใช้งานด้วยบัญชี Google ที่ผู้ดูแลอนุญาตไว้เท่านั้น</p>
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          <button type="button" disabled={busy} onClick={login} aria-busy={busy}
            className="w-full rounded-xl bg-[#0a2558] p-3 font-semibold text-white disabled:opacity-60">
            {busy ? 'กำลังตรวจสอบบัญชี…' : 'เข้าสู่ระบบด้วย Google'}
          </button>
          <p className="text-xs text-slate-500">หากเข้าใช้งานไม่ได้ ให้ติดต่อผู้ดูแลเพื่อเพิ่มอีเมลของคุณในรายชื่อที่อนุญาต</p>
        </div>
      </section>
    </main>
  );
};
