import React from 'react';
import { ScreenId, AuthUser } from '../types';
import { Settings, HelpCircle } from 'lucide-react';

interface HeaderProps {
  currentScreen: ScreenId;
  currentUser: AuthUser | null;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onOpenProfile: () => void;
  onOpenGoogleSheetsModal?: (dept?: 'all' | 'sales' | 'warehouse' | 'delivery') => void;
  onClearCacheAndReset?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentScreen,
  currentUser,
  onOpenSettings,
  onOpenHelp,
  onOpenProfile,
}) => {
  const getScreenTitle = () => {
    switch (currentScreen) {
      case 'overview':
        return 'Dashboard รายงานผลการดำเนินงาน';
      case 'sales':
        return 'รายงาน (ฝ่ายขาย)';
      case 'warehouse':
        return 'รายงาน (ฝ่ายคลังสินค้า)';
      case 'delivery':
        return 'รายงาน (ฝ่ายขนส่ง)';
      default:
        return 'Dashboard รายงานผลการดำเนินงาน';
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-20">
      {/* Page Title */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          {getScreenTitle()}
        </h1>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2">
        {/* Settings */}
        <button
          id="btn-header-settings"
          onClick={onOpenSettings}
          className="p-2 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          title="ตั้งค่าระบบ"
          aria-label="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* Help */}
        <button
          id="btn-header-help"
          onClick={onOpenHelp}
          className="p-2 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          title="คู่มือการใช้งาน"
          aria-label="Help"
        >
          <HelpCircle className="w-5 h-5" />
        </button>

        {/* User Profile */}
        <div className="h-6 w-px bg-slate-200 mx-1"></div>

        <button
          id="btn-header-user-profile"
          onClick={onOpenProfile}
          className="flex items-center gap-2.5 pl-1.5 pr-2.5 py-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <div className="w-8 h-8 rounded-full bg-[#0a2558] text-white flex items-center justify-center font-bold text-xs shadow-xs ring-1 ring-slate-300">
            {currentUser?.initials || 'CP'}
          </div>
          <div className="hidden lg:block text-left">
            <p className="text-xs font-semibold text-slate-800 leading-tight">
              {currentUser?.displayName || currentUser?.username || 'Chewaphorn P.'}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">
              {currentUser?.roleLabel || 'Logistics Admin'}
            </p>
          </div>
        </button>
      </div>
    </header>
  );
};
