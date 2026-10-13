import React from 'react';
import { X, HelpCircle, BookOpen, Layers, CheckCircle2, ShieldCheck, Mail, Phone } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#0a2558] flex items-center justify-center">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                คู่มือการใช้งานระบบ Technic Pet KPI
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Logistics & Warehouse Operations Guide
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs text-slate-700">
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-blue-600" />
              1. ลำดับขั้นตอนการทำงาน (Workflow)
            </h4>
            <p className="leading-relaxed text-slate-600">
              ระบบออกแบบมาเพื่อวัดประสิทธิภาพและติดตามการจัดส่งตามเกณฑ์ KPI ภายใน 3 วัน ประกอบด้วย 4 แผนกหลัก:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li><strong>ภาพรวม (Dashboard):</strong> ดูสถิติ KPI รวม ยอดขาย YTD ฿485.2M และ On-Time Rate 94.5%</li>
              <li><strong>นำเข้าข้อมูล (Data Import):</strong> อัปโหลด 3 เอกสารประจำวัน (Sales Order, Picking List, Delivery Tag)</li>
              <li><strong>ฝ่ายขาย (Sales):</strong> ตรวจสอบยอดขายรายบุคคล และระยะเวลาจัดส่งสำเร็จ</li>
              <li><strong>คลังสินค้า (Warehouse):</strong> ตรวจสอบสถานะการหยิบสินค้าและเวลาเฉลี่ย 42 นาที/ใบ</li>
              <li><strong>การจัดส่ง (Delivery):</strong> ติดตามสถานะเที่ยวรถ 156 คัน และการแจ้งเตือนล่าช้า</li>
            </ul>
          </div>

          <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-900 space-y-1">
            <p className="font-bold">ต้องการความช่วยเหลือเพิ่มเติม?</p>
            <p className="text-[11px] text-blue-700">
              ฝ่ายสนับสนุนระบบไอทีและโลจิสติกส์: support@technicpet.com หรือ โทร 02-xxx-xxxx
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="bg-[#0a2558] hover:bg-[#0d3175] text-white px-5 py-2 rounded-lg text-xs font-semibold cursor-pointer"
          >
            ปิดคู่มือ
          </button>
        </div>
      </div>
    </div>
  );
};
