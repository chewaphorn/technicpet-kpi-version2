import React, { useState, useEffect } from 'react';
import { 
  X, 
  Settings, 
  Target, 
  Building, 
  ShieldCheck, 
  Save, 
  Check, 
  User,
  Users,
  Shield,
  UserPlus,
  CheckCircle2,
  Sliders,
  Trash2,
  Clock,
  Truck,
  Package,
  TrendingUp,
  RefreshCw,
  Eye,
  KeyRound
} from 'lucide-react';
import { AuthUser, UserRole, AuthorizedUserRecord } from '../types';

import { getRoleInfo } from '../lib/firebase';
import { saveKpiTargets } from '../lib/kpiSettings';
import { readReportTargets } from '../hooks/useReportTargets';
import { DEFAULT_KPI_TARGETS } from '../utils/kpiTargets';
import { 
  getAuthorizedUsers, 
  saveAuthorizedUser, 
  removeAuthorizedUser, 
  toggleUserStatus,
  ROLE_DETAILS,
  PRIMARY_ADMIN_EMAIL
} from '../lib/authControl';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: AuthUser | null;
  onUpdateUser?: (updated: AuthUser) => void;
  onClearCacheAndReset?: () => void;
}

interface SystemUserItem {
  id: string;
  name: string;
  email: string;
  username: string;
  role: UserRole;
  roleLabel: string;
  department: string;
  initials: string;
  status: 'active' | 'inactive';
  lastActive: string;
  permissions: {
    canViewAll: boolean;
    canEditKPIs: boolean;
    canImportData: boolean;
    canExportReports: boolean;
  };
}

interface KpiTargetFieldProps {
  id: string;
  label: string;
  hint: string;
  unit: string;
  value: number;
  onChange: (value: number) => void;
  icon: React.ReactNode;
  min: number;
  max?: number;
  step?: number;
}

const KpiTargetField: React.FC<KpiTargetFieldProps> = ({ id, label, hint, unit, value, onChange, icon, min, max, step = 1 }) => (
  <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
    <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
      <span className="text-blue-600">{icon}</span>
      {label}
    </label>
    <p className="text-[11px] text-slate-500 leading-relaxed">{hint}</p>
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-32 px-3 py-2 border border-slate-300 rounded-xl text-slate-900 font-extrabold text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
      />
      <span className="text-xs font-medium text-slate-500">{unit}</span>
    </div>
  </div>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose,
  currentUser,
  onUpdateUser,
  onClearCacheAndReset,
}) => {
  // Tabs: 'targets' = เมนูการกำหนดเป้าหมาย, 'access' = การตั้งค่าบัญชี & กำหนดสิทธิ์, 'general' = ข้อมูลระบบ
  const [activeTab, setActiveTab] = useState<'targets' | 'access' | 'general'>('targets');

  // Tab 1: KPI Goal Settings States
  const [warehouseCompletionTargetPercent, setWarehouseCompletionTargetPercent] = useState(DEFAULT_KPI_TARGETS.warehouseCompletionTargetPercent);
  const [warehousePickingLeadTimeTarget, setWarehousePickingLeadTimeTarget] = useState(DEFAULT_KPI_TARGETS.warehousePickingLeadTimeTarget);
  const [monthlySalesTarget, setMonthlySalesTarget] = useState(DEFAULT_KPI_TARGETS.monthlySalesTarget);
  const [averageSalesPerBillTargetBaht, setAverageSalesPerBillTargetBaht] = useState(DEFAULT_KPI_TARGETS.averageSalesPerBillTargetBaht);
  const [deliveryCompletionTargetPercent, setDeliveryCompletionTargetPercent] = useState(DEFAULT_KPI_TARGETS.deliveryCompletionTargetPercent);
  const [salesToLoadedLeadTimeTargetDays, setSalesToLoadedLeadTimeTargetDays] = useState(DEFAULT_KPI_TARGETS.salesToLoadedLeadTimeTargetDays);
 

  // Tab 2: User Account & Access Control States
  const [usersList, setUsersList] = useState<SystemUserItem[]>([]);

  // Add User Form State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('sales_manager');
  const [newUserDepartment, setNewUserDepartment] = useState('แผนกฝ่ายขายและการตลาด');

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [usersLoadError, setUsersLoadError] = useState<string | null>(null);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [usersReloadKey, setUsersReloadKey] = useState(0);
  const [isUserSaving, setIsUserSaving] = useState(false);

  useEffect(() => {
    if (isOpen && currentUser?.role !== 'admin' && activeTab === 'targets') {
      setActiveTab('general');
    }
  }, [isOpen, currentUser?.role, activeTab]);

  // The report cache is populated from the shared Firestore settings.
  useEffect(() => {
    const targets = readReportTargets();
    setWarehouseCompletionTargetPercent(targets.warehouseCompletionTargetPercent);
    setWarehousePickingLeadTimeTarget(targets.warehousePickingLeadTimeTarget);
    setMonthlySalesTarget(targets.monthlySalesTarget);
    setAverageSalesPerBillTargetBaht(targets.averageSalesPerBillTargetBaht);
    setDeliveryCompletionTargetPercent(targets.deliveryCompletionTargetPercent);
    setSalesToLoadedLeadTimeTargetDays(targets.salesToLoadedLeadTimeTargetDays);

    if (!isOpen || currentUser?.role !== 'admin') {
      setUsersList([]);
      setCanManageUsers(false);
      setIsUsersLoading(false);
      return;
    }

    let isMounted = true;
    setIsUsersLoading(true);
    setUsersLoadError(null);
    void getAuthorizedUsers().then((authUsers) => {
      if (isMounted) {
        setCanManageUsers(true);
        setUsersList(authUsers.map(a => ({
          id: a.id,
          name: a.name,
          email: a.email,
          username: a.username || a.email.split('@')[0],
          role: a.role,
          roleLabel: a.roleLabel,
          department: a.department,
          initials: (a.name.split(' ').map(n => n[0]).join('') || a.username?.slice(0, 2) || 'U').slice(0, 2).toUpperCase(),
          status: a.status,
          lastActive: a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'ได้รับอนุญาต',
          permissions: {
            canViewAll: a.role === 'admin',
            canEditKPIs: a.role === 'admin',
            canImportData: true,
            canExportReports: true,
          }
        })));
      }
    }).catch((error: unknown) => {
      if (isMounted) {
        setCanManageUsers(false);
        setUsersLoadError(error instanceof Error ? error.message : 'ไม่สามารถโหลดรายชื่อผู้ใช้จาก Firestore ได้');
      }
    }).finally(() => {
      if (isMounted) setIsUsersLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentUser?.role, usersReloadKey]);

  if (!isOpen) return null;

  // Handle Save Settings
  const handleSave = async () => {
    if (currentUser?.role !== 'admin') {
      setSettingsError('เฉพาะผู้บริหารเท่านั้นที่สามารถกำหนดเป้าหมาย KPI ได้');
      return;
    }
    try {
      const targetsToSave = {
        warehouseCompletionTargetPercent,
        warehousePickingLeadTimeTarget,
        monthlySalesTarget,
        averageSalesPerBillTargetBaht,
        deliveryCompletionTargetPercent,
        salesToLoadedLeadTimeTargetDays,
      };
      await saveKpiTargets(targetsToSave);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'ไม่สามารถบันทึกการตั้งค่าได้');
      return;
    }

    setSettingsError(null);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 900);
  };

  // Toggle user active status
  const handleToggleUserStatus = async (userId: string) => {
    if (currentUser?.role !== 'admin') return;
    setSettingsError(null);
    try {
      const updated = await toggleUserStatus(userId);
      if (updated) {
        setUsersList(prev => prev.map(u => {
          if (u.id === userId) {
            return { ...u, status: updated.status };
          }
          return u;
        }));
      }
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'ไม่สามารถเปลี่ยนสถานะได้');
    }
  };

  // Change user role
  const handleChangeUserRole = async (userId: string, newRole: UserRole) => {
    if (currentUser?.role !== 'admin') return;
    const roleInfo = ROLE_DETAILS[newRole] || {
      label: getRoleInfo(newRole).roleLabel,
      department: getRoleInfo(newRole).department,
      defaultScreens: ['overview']
    };
    const existing = usersList.find(u => u.id === userId);
    if (!existing) return;

    const authRecord: AuthorizedUserRecord = {
      id: existing.id,
      email: existing.email,
      username: existing.username,
      name: existing.name,
      role: newRole,
      roleLabel: roleInfo.label,
      department: roleInfo.department,
      status: existing.status,
      allowedScreens: roleInfo.defaultScreens,
      addedAt: new Date().toISOString().split('T')[0],
      addedBy: currentUser?.username || 'admin',
    };

    setSettingsError(null);
    try {
      await saveAuthorizedUser(authRecord);
      setUsersList(prev => prev.map(u => {
        if (u.id === userId) {
          return {
            ...u,
            role: newRole,
            roleLabel: roleInfo.label,
            department: roleInfo.department,
            permissions: {
              canViewAll: newRole === 'admin',
              canEditKPIs: newRole === 'admin',
              canImportData: true,
              canExportReports: true,
            }
          };
        }
        return u;
      }));
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'ไม่สามารถบันทึกสิทธิ์ผู้ใช้ได้');
    }
  };

  // Add new user handler
  const handleAddNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser?.role !== 'admin') return;
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    const normalizedEmail = newUserEmail.trim().toLowerCase();
    if (usersList.some(user =>
      user.email.toLowerCase() === normalizedEmail
    )) {
      setSettingsError('อีเมลนี้มีอยู่ในรายชื่อแล้ว');
      return;
    }

    const roleInfo = ROLE_DETAILS[newUserRole] || {
      label: getRoleInfo(newUserRole).roleLabel,
      department: getRoleInfo(newUserRole).department,
      defaultScreens: ['overview']
    };
    const initials = newUserName
      .split(' ')
      .map(n => n.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'UT';

    setIsUserSaving(true);
    setSettingsError(null);
    let authEmail: string;
    try {
      authEmail = normalizedEmail;
      await saveAuthorizedUser({
        id: authEmail, email: authEmail, username: authEmail,
        name: newUserName.trim(), role: newUserRole, roleLabel: roleInfo.label,
        department: newUserDepartment || roleInfo.department,
        status: 'active', allowedScreens: roleInfo.defaultScreens,
        addedAt: new Date().toISOString(), addedBy: currentUser.email,
      });
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'ไม่สามารถสร้างบัญชีผู้ใช้ได้');
      setIsUserSaving(false);
      return;
    }

    const newUser: SystemUserItem = {
      id: authEmail,
      name: newUserName.trim(),
      email: authEmail,
      username: normalizedEmail,
      role: newUserRole,
      roleLabel: roleInfo.label,
      department: newUserDepartment || roleInfo.department,
      initials: initials,
      status: 'active',
      lastActive: 'สร้างใหม่',
      permissions: {
        canViewAll: newUserRole === 'admin',
        canEditKPIs: newUserRole === 'admin',
        canImportData: true,
        canExportReports: true,
      }
    };

    setUsersList((currentUsers) => [
      newUser,
      ...currentUsers.filter((user) => user.email.toLowerCase() !== normalizedEmail),
    ]);

    // Reset Form
    setNewUserName('');
    setNewUserEmail('');
    setShowAddUserModal(false);
    setIsUserSaving(false);
  };

  const closeAddUserModal = () => {
    setShowAddUserModal(false);
    setSettingsError(null);
  };


  // Delete user
  const handleDeleteUser = async (userId: string) => {
    if (currentUser?.role !== 'admin') return;
    try {
      await removeAuthorizedUser(userId);
      const updated = usersList.filter(u => u.id !== userId);
      setUsersList(updated);
      setSettingsError(null);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'ไม่สามารถลบผู้ใช้งานได้');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 text-blue-300 flex items-center justify-center font-bold border border-blue-400/20">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white tracking-tight">
                ตั้งค่า (Settings)
              </h3>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                Technic Pet Enterprise Logistics & KPI Management
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation Navigation Switcher */}
        <div className="flex items-center gap-2 px-6 pt-4 pb-2 bg-slate-50 border-b border-slate-200 overflow-x-auto">
          <button
            type="button"
            id="tab-kpi-targets"
            disabled={currentUser?.role !== 'admin'}
            onClick={() => { if (currentUser?.role === 'admin') setActiveTab('targets'); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'targets'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Target className="w-4 h-4" />
            <span>1. การกำหนดเป้าหมาย (KPI Goal Settings)</span>
          </button>

          <button
            type="button"
            id="tab-access-control"
            onClick={() => setActiveTab('access')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'access'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>2. การเข้าใช้งานบัญชี & สิทธิ์ (Access Control)</span>
          </button>

          <button
            type="button"
            id="tab-system-information"
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'general'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>3. ข้อมูลระบบ (System Information)</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
          {settingsError && activeTab !== 'access' && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {settingsError}
            </div>
          )}
          
          {/* TAB 1: เมนูการกำหนดเป้าหมาย (KPI Goal Settings) */}
          {activeTab === 'targets' && currentUser?.role === 'admin' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Header description */}
              <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200/80 flex items-start gap-3">
                <Target className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">
                    กำหนดเป้าหมาย KPI แยกตามแผนก
                  </h4>
                  <p className="text-slate-600 text-[11px] mt-0.5 leading-relaxed">
                    เป้าหมายยอดขายรายเดือนและยอดเฉลี่ยต่อบิลเป็นคนละค่า · ระยะเวลาคลังนับถึงจัดของเสร็จ ส่วนระยะเวลาขนส่งนับถึงโหลดเสร็จ โดยเริ่มจากวันที่เปิดบิลขายทั้งคู่
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-blue-600" />
                  เกณฑ์เป้าหมายรายแผนก (Department KPI Targets)
                </h4>

                <section className="space-y-2" aria-label="เป้าหมายแผนกคลังสินค้า">
                  <h5 className="text-sm font-bold text-emerald-800">แผนกคลังสินค้า</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <KpiTargetField id="target-warehouse-completion" label="อัตราการจัดสำเร็จ (%)" hint="บิลที่จัดเสร็จ ÷ บิลคลังทั้งหมด" unit="เปอร์เซ็นต์" value={warehouseCompletionTargetPercent} onChange={setWarehouseCompletionTargetPercent} icon={<CheckCircle2 className="w-4 h-4" />} min={0} max={100} step={0.1} />
                    <KpiTargetField id="target-warehouse-picking-days" label="ระยะเวลาจัดของ (Picking Lead Time)" hint="เฉลี่ยจากวันที่เปิดบิลขายถึงวันที่จัดของเสร็จ" unit="วัน" value={warehousePickingLeadTimeTarget} onChange={setWarehousePickingLeadTimeTarget} icon={<Package className="w-4 h-4" />} min={0.1} step={0.1} />
                  </div>
                </section>

                <section className="space-y-2" aria-label="เป้าหมายแผนกขาย">
                  <h5 className="text-sm font-bold text-blue-800">แผนกขาย</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <KpiTargetField id="target-sales-monthly" label="เป้าหมายยอดขายรายเดือน (ล้านบาท)" hint="ยอดขายรวมต่อเดือน" unit="ล้านบาท" value={monthlySalesTarget} onChange={setMonthlySalesTarget} icon={<TrendingUp className="w-4 h-4" />} min={0.1} step={0.1} />
                    <KpiTargetField id="target-sales-average-bill" label="เป้าหมายยอดขายเฉลี่ยต่อบิล (บาท)" hint="ยอดขายรวม ÷ จำนวนบิลขาย" unit="บาทต่อบิล" value={averageSalesPerBillTargetBaht} onChange={setAverageSalesPerBillTargetBaht} icon={<TrendingUp className="w-4 h-4" />} min={1} />
                  </div>
                </section>

                <section className="space-y-2" aria-label="เป้าหมายแผนกขนส่ง">
                  <h5 className="text-sm font-bold text-purple-800">แผนกขนส่ง</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <KpiTargetField id="target-delivery-completion" label="อัตราส่งสำเร็จ (%)" hint="บิลที่ส่งสำเร็จ ÷ บิลขนส่งทั้งหมด" unit="เปอร์เซ็นต์" value={deliveryCompletionTargetPercent} onChange={setDeliveryCompletionTargetPercent} icon={<Truck className="w-4 h-4" />} min={0} max={100} step={0.1} />
                    <KpiTargetField id="target-delivery-sales-to-loaded-days" label="ระยะเวลาจัดส่ง (วัน)" hint="เฉลี่ยจากวันที่เปิดบิลขายถึงวันที่โหลดเสร็จ" unit="วัน" value={salesToLoadedLeadTimeTargetDays} onChange={setSalesToLoadedLeadTimeTargetDays} icon={<Clock className="w-4 h-4" />} min={0.1} step={0.1} />
                  </div>
                </section>
              </div>

            </div>
          )}

          {/* TAB 2: การตั้งค่าการเข้าใช้งานบัญชี หรือการกำหนดสิทธิ์การเข้าถึง (User Accounts & Access Control) */}
          {activeTab === 'access' && currentUser?.role !== 'admin' && (<p className="p-6 text-sm text-slate-600">เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการบัญชีผู้ใช้ได้</p>)}
          {activeTab === 'access' && currentUser?.role === 'admin' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Active User Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center font-bold text-lg text-blue-200">
                    {currentUser?.initials || 'CP'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-white text-sm">
                        {currentUser?.displayName || 'Chewaphorn P.'}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-400/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        เข้าสู่ระบบอยู่ (Active)
                      </span>
                    </div>
                    <p className="text-xs text-blue-200/90 mt-0.5">
                      {currentUser?.username || 'chewaphorn'} • <strong className="text-white">{currentUser?.roleLabel || 'ผู้ดูแลระบบสูงสุด'}</strong>
                    </p>
                  </div>
                </div>

                <div className="text-xs bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 text-blue-100 self-start sm:self-auto">
                  สิทธิ์: <strong className="text-white">เข้าถึงได้ทุกหน้าจอ (Full Access)</strong>
                </div>
              </div>

              {/* Role Permissions Matrix Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-blue-600" />
                    <span>ระดับสิทธิ์การเข้าถึงตามบทบาท (Role-Based Access Control)</span>
                  </h4>
                  <span className="text-[11px] text-slate-500">5 บทบาทหลัก</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Role 1 */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5 hover:border-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-blue-600" />
                        <span>ผู้ดูแลระบบ (Executive Admin)</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px]">ระดับ 1</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      ดูภาพรวม Executive Dashboard, แก้ไขเป้าหมาย KPI, จัดการผู้ใช้และสิทธิ์, นำเข้าข้อมูลทุกฝ่าย
                    </p>
                  </div>

                  {/* Role 2 */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5 hover:border-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-teal-600" />
                        <span>ฝ่ายขาย (Sales Manager / Rep)</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-700 font-bold text-[10px]">ระดับ 2</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      ดูรายงานฝ่ายขาย, ติดตามสถานะใบสั่งขาย (SO), อัปโหลดไฟล์ใบสั่งซื้อ, ส่งออกรายงาน Excel
                    </p>
                  </div>

                  {/* Role 3 */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5 hover:border-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-amber-600" />
                        <span>ฝ่ายคลังสินค้า (Warehouse Lead)</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-bold text-[10px]">ระดับ 2</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      ตรวจสอบใบหยิบสินค้า (Picking List), อัปเดตสถานะจัดของ, จัดการคิวงานเร่งด่วน, นำเข้าไฟล์คลัง
                    </p>
                  </div>

                  {/* Role 4 */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5 hover:border-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Truck className="w-4 h-4 text-indigo-600" />
                        <span>ฝ่ายจัดส่ง (Logistics / Driver)</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold text-[10px]">ระดับ 2</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      ตรวจสอบเที่ยวจัดส่ง (Delivery Tag), บันทึกเวลาออกจากคลัง/ส่งมอบจริง (POD), ตรวจสอบทะเบียนรถ
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5 hover:border-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Eye className="w-4 h-4 text-slate-500" />
                        <span>ผู้ดูรายงาน (Viewer)</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">ระดับ 3</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      ดูภาพรวมระบบเท่านั้น ไม่มีสิทธิ์จัดการผู้ใช้หรือนำเข้าข้อมูล
                    </p>
                  </div>
                </div>
              </div>

              {/* Users Account Management Table */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-600" />
                      <span>รายชื่อบัญชีผู้ใช้งาน & สิทธิ์การเข้าถึง ({usersList.length} บัญชี)</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      กำหนดสิทธิ์และบทบาทการเข้าถึงระบบ Technic Pet สำหรับแต่ละผู้ใช้งาน
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSettingsError(null);
                      setShowAddUserModal(true);
                    }}
                    disabled={isUsersLoading || !canManageUsers}
                    className="bg-[#0a2558] hover:bg-[#0d3175] text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>+ เพิ่มผู้ใช้งาน</span>
                  </button>
                </div>

                {settingsError && (
                  <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                    {settingsError}
                  </div>
                )}
                {isUsersLoading && (
                  <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                    กำลังโหลดรายชื่อผู้ใช้จากฐานข้อมูล...
                  </p>
                )}
                {usersLoadError && (
                  <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 flex items-center justify-between gap-3">
                    <span>{usersLoadError}</span>
                    <button
                      type="button"
                      onClick={() => setUsersReloadKey((key) => key + 1)}
                      className="font-bold underline shrink-0"
                    >
                      ลองใหม่
                    </button>
                  </div>
                )}

                {/* Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">ผู้ใช้งาน</th>
                        <th className="py-2.5 px-3">แผนก</th>
                        <th className="py-2.5 px-3">บทบาท/สิทธิ์</th>
                        <th className="py-2.5 px-3 text-center">สถานะ</th>
                        <th className="py-2.5 px-3 text-center">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {usersList.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Name & Username */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[11px]">
                                {user.initials}
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 block">{user.name}</span>
                                <span className="text-[11px] text-slate-500 font-medium">ชื่อผู้ใช้: {user.email}</span>
                              </div>
                            </div>
                          </td>

                          {/* Department */}
                          <td className="py-2.5 px-3 text-slate-700 font-medium">
                            {user.department}
                          </td>

                          {/* Role Selector */}
                          <td className="py-2.5 px-3">
                            <select
                              value={user.role}
                              onChange={(e) => handleChangeUserRole(user.id, e.target.value as UserRole)}
                              disabled={user.email.toLowerCase() === currentUser?.email.toLowerCase() ||
                                user.email.toLowerCase() === PRIMARY_ADMIN_EMAIL}
                              className="px-2 py-1 border border-slate-300 rounded-lg text-slate-800 text-[11px] font-semibold bg-white cursor-pointer"
                            >
                              <option value="admin">System Admin</option>
                              <option value="sales_manager">Sales Manager</option>
                              <option value="warehouse_supervisor">Warehouse Lead</option>
                              <option value="logistics_coordinator">Logistics Coordinator</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          </td>

                          {/* Status Toggle */}
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleUserStatus(user.id)}
                              disabled={user.email.toLowerCase() === currentUser?.email.toLowerCase() ||
                                user.email.toLowerCase() === PRIMARY_ADMIN_EMAIL}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${
                                user.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {user.status === 'active' ? 'เปิดใช้งาน' : 'ระงับชั่วคราว'}
                            </button>
                          </td>

                          {/* Action Delete */}
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex justify-center gap-1">

                              {user.email.toLowerCase() !== currentUser?.email.toLowerCase() &&
                              user.email.toLowerCase() !== PRIMARY_ADMIN_EMAIL ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(user.id)}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                title="ลบผู้ใช้งาน"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-bold">หลัก</span>
                            )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!isUsersLoading && usersList.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-xs text-slate-500">
                            {usersLoadError ? 'ไม่สามารถโหลดรายชื่อผู้ใช้ได้' : 'ยังไม่มีผู้ใช้ที่ได้รับสิทธิ์'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>รายชื่ออีเมลที่อนุญาตและบทบาท</span>
                </h4>
                <p className="text-[11px] leading-relaxed text-slate-600">
                  เพิ่มอีเมล Google ของพนักงานพร้อมบทบาท ผู้ใช้เข้าสู่ระบบด้วย Google โดยไม่ต้องรับรหัสผ่านจากผู้ดูแล การลบหรือระงับรายชื่อจะยกเลิกสิทธิ์เข้าใช้งาน
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: ข้อมูลระบบ (System Information) */}
          {activeTab === 'general' && (
            <div className="space-y-6 animate-in fade-in duration-200">

              {/* Organization & System Specs */}
              <div className="space-y-3 pt-2">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-blue-600" />
                  <span>ข้อมูลองค์กร & เวอร์ชันระบบ (Organization Info)</span>
                </h4>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 divide-y divide-slate-200/80 space-y-2 text-slate-600">
                  <div className="flex items-center justify-between pb-2">
                    <span className="font-medium">ชื่อองค์กร:</span>
                    <strong className="text-slate-900 font-bold">Technic Pet Co., Ltd.</strong>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="font-medium">ฐานข้อมูล & เซิร์ฟเวอร์:</span>
                    <span className="font-mono text-blue-700 font-semibold">Google Cloud Firestore (Enterprise DB)</span>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="font-medium">เวอร์ชันระบบ:</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-800 font-mono text-[11px] font-bold">
                      v2.5.0-PROD
                    </span>
                  </div>
                </div>
              </div>

              {/* Cache & Local Data Maintenance */}
              {onClearCacheAndReset && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                      ล้างข้อมูลแคชที่บันทึกไว้ในเบราว์เซอร์
                    </span>
                    <span className="text-slate-500 text-[11px] leading-relaxed block">
                      ล้างข้อมูลแคชชีตและรายงานชั่วคราวในเบราว์เซอร์ เพื่อบังคับดึงข้อมูลสดใหม่ทั้งหมด
                    </span>
                  </div>
                  <button
                    type="button"
                    id="btn-settings-clear-cache"
                    onClick={() => {
                      onClearCacheAndReset();
                      onClose();
                    }}
                    className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 active:bg-slate-400 text-slate-800 font-bold text-xs rounded-xl shadow-2xs transition-colors shrink-0 cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
                    <span>ล้างแคชและรีเซ็ต</span>
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500 font-medium">
            {activeTab === 'access'
              ? 'การเปลี่ยนแปลงสิทธิ์บันทึกลง Firestore ทันที'
              : 'บันทึกการตั้งค่าลงในระบบ Technic Pet'}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer transition-colors"
            >
              ปิด
            </button>
            {activeTab !== 'access' && currentUser?.role === 'admin' && (
              <button
                onClick={handleSave}
                id="btn-save-settings"
                className="bg-[#0a2558] hover:bg-[#0d3175] active:scale-95 text-white px-6 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md transition-all"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>บันทึกการตั้งค่าเรียบร้อย</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>บันทึกการตั้งค่า</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Add New User Sub-Modal */}
      {showAddUserModal && currentUser?.role === 'admin' && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-600" />
                <span>เพิ่มผู้ใช้งานใหม่ (Add New User)</span>
              </h4>
              <button
                type="button"
                onClick={closeAddUserModal}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddNewUser} className="space-y-3 text-xs">
              {settingsError && (
                <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
                  {settingsError}
                </p>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  ชื่อ-นามสกุล (Full Name) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น นภาพร สุขสมบูรณ์"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800 font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  อีเมล Google ที่อนุญาต *
                </label>
                <input
                  type="email"
                  required
                  autoComplete="off"
                  placeholder="name@company.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800 font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>



              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  บทบาท & ระดับสิทธิ์ (Role & Permissions)
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => {
                    const r = e.target.value as UserRole;
                    setNewUserRole(r);
                    setNewUserDepartment(ROLE_DETAILS[r].department);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800 font-semibold bg-white"
                >
                  <option value="sales_manager">ผู้จัดการฝ่ายขาย (Sales Manager)</option>
                  <option value="warehouse_supervisor">หัวหน้างานคลังสินค้า (Warehouse Supervisor)</option>
                  <option value="logistics_coordinator">ผู้ควบคุมการขนส่ง (Logistics Coordinator)</option>
                  <option value="viewer">ผู้ดูรายงานทั่วไป (Viewer)</option>
                  <option value="admin">ผู้ดูแลระบบสูงสุด (System Admin)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  แผนก/ส่วนงาน (Department)
                </label>
                <input
                  type="text"
                  value={newUserDepartment}
                  onChange={(e) => setNewUserDepartment(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-800 font-semibold bg-slate-50"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <p className="mr-auto text-[10px] text-slate-500">ผู้ใช้เลือกบัญชี Google ที่ตรงกับอีเมลนี้</p>
                <button
                  type="button"
                  onClick={closeAddUserModal}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isUserSaving}
                  className="px-5 py-2 bg-[#0a2558] hover:bg-[#0d3175] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer disabled:opacity-60"
                >
                  {isUserSaving ? 'กำลังบันทึก...' : 'เพิ่มผู้ใช้'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


    </div>
  );
};
