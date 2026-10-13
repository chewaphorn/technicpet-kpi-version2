import React from 'react';
import { AuthUser, UserRole } from '../types';
import { X, User, Shield, Building, LogOut, CheckCircle } from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  currentUser: AuthUser | null;
  onClose: () => void;
  onLogout: () => void;
  onUpdateUser: (updated: AuthUser) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ 
  isOpen, 
  currentUser, 
  onClose, 
  onLogout,
  onUpdateUser 
}) => {
  if (!isOpen || !currentUser) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            โปรไฟล์ผู้ใช้งาน (User Profile)
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-[#0a2558] text-white flex items-center justify-center font-bold text-xl mx-auto shadow-md ring-4 ring-blue-50">
            {currentUser.initials || 'CP'}
          </div>

          <div>
            <h4 className="text-base font-bold text-slate-900">
              {currentUser.displayName}
            </h4>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              ชื่อผู้ใช้: {currentUser.username}
            </p>
            <span className="inline-flex items-center gap-1 mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
              <Shield className="w-3 h-3 text-blue-600" />
              {currentUser.roleLabel}
            </span>
          </div>

          <div className="bg-slate-50 rounded-xl p-3.5 text-xs text-left space-y-2.5 text-slate-600 border border-slate-200">
            <div className="flex justify-between">
              <span className="text-slate-500">สังกัด / แผนก:</span>
              <strong className="text-slate-800">{currentUser.department}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">รหัสผู้ใช้งาน (UID):</span>
              <span className="font-mono text-[11px] text-slate-700">{currentUser.uid.slice(0, 14)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">ฐานข้อมูลคลาวด์:</span>
              <span className="font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-emerald-500" />
                Firestore Synced
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">เข้าสู่ระบบล่าสุด:</span>
              <span className="text-slate-700 font-medium">
                {currentUser.lastLoginAt ? new Date(currentUser.lastLoginAt).toLocaleTimeString('th-TH') : 'วันนี้'}
              </span>
            </div>
          </div>


        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
          <button
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="flex-1 bg-white hover:bg-red-50 text-rose-600 border border-rose-200 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>ออกจากระบบ</span>
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-[#0a2558] hover:bg-[#0d3175] text-white py-2.5 rounded-xl text-xs font-semibold cursor-pointer shadow-2xs"
          >
            เรียบร้อย
          </button>
        </div>
      </div>
    </div>
  );
};
