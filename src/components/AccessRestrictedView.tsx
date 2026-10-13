import React from 'react';
import { AuthUser, ScreenId } from '../types';
import { ShieldAlert, ArrowLeft, Lock, CheckCircle2 } from 'lucide-react';
import { ROLE_DETAILS } from '../lib/authControl';

interface AccessRestrictedViewProps {
  currentUser: AuthUser;
  attemptedScreen: ScreenId;
  onNavigateScreen: (screen: ScreenId) => void;
}

export const AccessRestrictedView: React.FC<AccessRestrictedViewProps> = ({
  currentUser,
  attemptedScreen,
  onNavigateScreen,
}) => {
  const roleInfo = ROLE_DETAILS[currentUser.role] || {
    label: currentUser.roleLabel,
    department: currentUser.department,
    defaultScreens: ['overview'],
  };

  const allowedScreens = currentUser.allowedScreens || roleInfo.defaultScreens;

  const getScreenLabel = (s: ScreenId) => {
    switch (s) {
      case 'overview': return 'ภาพรวม (Executive Overview)';
      case 'sales': return 'รายงานผลฝ่ายขาย (Sales Report)';
      case 'warehouse': return 'รายงานคลังสินค้า (Warehouse)';
      case 'delivery': return 'รายงานการขนส่ง (Delivery)';
      default: return s;
    }
  };

  return (
    <div className="p-6 sm:p-10 max-w-3xl mx-auto animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl border border-rose-200/80 shadow-sm p-8 sm:p-10 text-center relative overflow-hidden">
        {/* Decorative background ring */}
        <div className="absolute -top-24 -right-24 w-56 h-56 bg-rose-50 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-56 h-56 bg-amber-50 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-100/80 border border-rose-200 flex items-center justify-center text-rose-600 mb-5 shadow-inner">
            <ShieldAlert className="w-9 h-9" />
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 mb-2">
            จำกัดสิทธิ์การเข้าถึง (ACCESS RESTRICTED)
          </span>

          <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">
            ขออภัย คุณไม่มีสิทธิ์เข้าถึงหน้านี้
          </h2>

          <p className="text-sm text-slate-600 max-w-lg mb-6 leading-relaxed">
            หน้า <span className="font-bold text-slate-800">"{getScreenLabel(attemptedScreen)}"</span> ถูกจำกัดสิทธิ์เฉพาะบุคลากรที่ได้รับมอบหมาย
          </p>

          {/* User Role Card */}
          <div className="w-full max-w-md bg-slate-50 border border-slate-200/90 rounded-2xl p-4 mb-6 text-left shadow-2xs">
            <div className="flex items-center justify-between mb-3 border-b border-slate-200/70 pb-2.5">
              <span className="text-xs font-semibold text-slate-500">ข้อมูลผู้ใช้งานที่เข้าสู่ระบบ:</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800">
                {currentUser.roleLabel}
              </span>
            </div>
            <div className="text-xs space-y-1.5 text-slate-700">
              <p><strong className="text-slate-900">ชื่อผู้ใช้:</strong> {currentUser.username}</p>
              <p><strong className="text-slate-900">แผนก:</strong> {currentUser.department}</p>
            </div>
          </div>

          {/* Permitted Screens List */}
          <div className="w-full max-w-md bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 mb-8 text-left">
            <p className="text-xs font-bold text-emerald-900 mb-2.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>ส่วนงานที่คุณมีสิทธิ์เข้าใช้งานได้:</span>
            </p>
            <div className="space-y-1.5">
              {allowedScreens.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onNavigateScreen(s)}
                  className="w-full text-left px-3 py-2 rounded-xl bg-white border border-emerald-200 text-xs font-bold text-emerald-950 hover:bg-emerald-100/50 transition-colors flex items-center justify-between cursor-pointer"
                >
                  <span>{getScreenLabel(s)}</span>
                  <span className="text-[11px] text-emerald-600 font-semibold">คลิกเพื่อเปิด &rarr;</span>
                </button>
              ))}
            </div>
          </div>

          {/* Return button */}
          <button
            type="button"
            onClick={() => onNavigateScreen(allowedScreens[0] || 'overview')}
            className="px-6 py-2.5 rounded-xl bg-[#0a2558] hover:bg-[#0d3175] text-white text-xs font-bold shadow-sm transition-all flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับสู่หน้าหลักที่ได้รับอนุญาต</span>
          </button>
        </div>
      </div>
    </div>
  );
};
