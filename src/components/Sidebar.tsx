import React from 'react';
import { ScreenId, AuthUser } from '../types';
import { 
  LayoutGrid, 
  TrendingUp, 
  Warehouse, 
  Truck, 
  Settings, 
  LogOut, 
  Download,
  PawPrint,
  Shield,
  Lock,
  Users
} from 'lucide-react';
import { canAccessScreen } from '../lib/authControl';

interface SidebarProps {
  currentScreen: ScreenId;
  currentUser: AuthUser | null;
  onSelectScreen: (screen: ScreenId) => void;
  onOpenNewReport: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onOpenGoogleSheetsModal?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentScreen,
  currentUser,
  onSelectScreen,
  onOpenNewReport,
  onOpenSettings,
  onLogout,
  onOpenGoogleSheetsModal,
}) => {
  const menuItems: { id: ScreenId; label: string; icon: React.ReactNode }[] = [
    {
      id: 'overview',
      label: 'ภาพรวม',
      icon: <LayoutGrid className="w-4 h-4" />,
    },
    {
      id: 'sales',
      label: 'ฝ่ายขาย',
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      id: 'warehouse',
      label: 'คลังสินค้า',
      icon: <Warehouse className="w-4 h-4" />,
    },
    {
      id: 'delivery',
      label: 'การจัดส่ง',
      icon: <Truck className="w-4 h-4" />,
    },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between h-screen shrink-0 sticky top-0 shadow-xs select-none">
      {/* Top section */}
      <div className="p-5 flex flex-col">
        {/* Brand Logo */}
        <div className="flex items-center gap-3 mb-6 px-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0a2558] to-[#1e40af] flex items-center justify-center text-white shadow-sm ring-2 ring-blue-100">
            <PawPrint className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 text-lg leading-tight tracking-tight">
              Technic Pet
            </h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide">
              KPI Management
            </p>
          </div>
        </div>

        {/* Export Report Button (ส่งออกรายงาน) */}
        <button
          id="btn-export-report"
          onClick={onOpenNewReport}
          className="w-full bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm hover:shadow transition-all duration-150 text-sm mb-6 cursor-pointer"
          title="ส่งออกรายงานข้อมูลแต่ละฝ่ายเป็น Excel"
        >
          <Download className="w-4 h-4" />
          <span>ส่งออกรายงาน</span>
        </button>

        {/* Navigation items */}
        <nav className="space-y-1">
          {menuItems.map((item) => {
            const isActive = currentScreen === item.id;
            const isPermitted = currentUser 
              ? canAccessScreen(currentUser.role, item.id, currentUser.allowedScreens)
              : false;

            return (
              <button
                key={item.id}
                id={`nav-item-${item.id}`}
                disabled={!isPermitted}
                onClick={() => { if (isPermitted) onSelectScreen(item.id); }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer text-left ${
                  isActive
                    ? 'bg-[#0a2558]/10 text-[#0a2558] font-bold shadow-2xs'
                    : isPermitted
                    ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                }`}
                title={!isPermitted ? 'ไม่มีสิทธิ์เข้าถึงส่วนนี้ (จำกัดสิทธิ์ตามแผนก)' : undefined}
              >
                <div className="flex items-center gap-3">
                  <span className={`${isActive ? 'text-[#0a2558]' : isPermitted ? 'text-slate-500' : 'text-slate-400'}`}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>

                {!isPermitted && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    <Lock className="w-3 h-3 text-slate-400" />
                    <span>จำกัด</span>
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom section */}
      <div className="p-4 border-t border-slate-100 space-y-2">
        {/* User Card */}
        {currentUser && (
          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 text-white ${
              currentUser.role === 'admin' ? 'bg-[#0a2558]' :
              currentUser.role === 'sales_manager' ? 'bg-amber-600' :
              currentUser.role === 'warehouse_supervisor' ? 'bg-emerald-600' :
              'bg-purple-600'
            }`}>
              {currentUser.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-bold text-slate-800 truncate">{currentUser.displayName}</p>
                {currentUser.role === 'admin' && (
                  <span className="px-1 py-0.2 rounded text-[9px] bg-blue-100 text-blue-800 font-bold">
                    Admin
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 truncate">{currentUser.username}</p>
            </div>
          </div>
        )}

        <button
          id="btn-settings-bottom"
          onClick={onOpenSettings}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <Settings className="w-4 h-4 text-slate-500" />
          <span>ตั้งค่า</span>
        </button>

        <button
          id="btn-logout"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4 text-slate-500" />
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </aside>
  );
};
