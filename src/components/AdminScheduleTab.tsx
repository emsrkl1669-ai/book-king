import { useEffect, useState, type FormEvent } from 'react';
import {
  Calendar,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Lock,
  RotateCcw,
  ShieldCheck,
  Square,
  Unlock,
} from 'lucide-react';
import {
  DEFAULT_SLOT_CAPACITY,
  formatThaiDateLong,
  getBangkokTodayISO,
  THAI_DAYS_SHORT,
  THAI_MONTHS,
  TIME_SLOTS,
} from '../lib/constants';

interface AdminCalendarDay {
  date: string;
  day: number;
  state: 'open' | 'closed' | 'full' | 'paused';
  isOpen: boolean;
  isPaused: boolean;
  isPast: boolean;
  hasOverride: boolean;
  updatedBy?: string;
  bookedCount: number;
  dailyCapacity: number;
  remaining: number;
  slotCapacity: number;
  reason: string;
}

interface AdminScheduleTabProps {
  onScheduleChanged: () => void;
}

export function AdminScheduleTab({ onScheduleChanged }: AdminScheduleTabProps) {
  const todayISO = getBangkokTodayISO();
  const [currentMonth, setCurrentMonth] = useState(todayISO.slice(0, 7));
  const [days, setDays] = useState<AdminCalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');

  // Mode: single date editor OR multi-select batch dates
  const [multiMode, setMultiMode] = useState(false);
  const [multiDates, setMultiDates] = useState<string[]>([]);
  const [batchCap, setBatchCap] = useState(DEFAULT_SLOT_CAPACITY);
  const [batchReason, setBatchReason] = useState('เปิดให้บริการฝังเข็ม (กำหนดโดยผู้ดูแลระบบ)');

  // Selected single date editor
  const [selectedDay, setSelectedDay] = useState<AdminCalendarDay | null>(null);
  const [editOpen, setEditOpen] = useState(true);
  const [editPaused, setEditPaused] = useState(false);
  const [editCap, setEditCap] = useState(DEFAULT_SLOT_CAPACITY);
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);

  const loadCalendar = async (monthStr: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/calendar?month=${encodeURIComponent(monthStr)}`);
      if (res.ok) {
        const data = await res.json();
        const loadedDays: AdminCalendarDay[] = data.days || [];
        setDays(loadedDays);
        if (selectedDay) {
          const refreshed = loadedDays.find((d) => d.date === selectedDay.date);
          if (refreshed) {
            setSelectedDay(refreshed);
            setEditOpen(refreshed.isOpen);
            setEditPaused(refreshed.isPaused);
            setEditCap(refreshed.slotCapacity);
            setEditReason(refreshed.hasOverride ? refreshed.reason : '');
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalendar(currentMonth);
  }, [currentMonth]);

  const changeMonth = (delta: number) => {
    const [y, m] = currentMonth.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
    setCurrentMonth(dt.toISOString().slice(0, 7));
    setSelectedDay(null);
    setMultiDates([]);
  };

  const handleClickDay = (d: AdminCalendarDay) => {
    setStatusMsg('');
    if (multiMode) {
      if (d.isPast) return;
      setMultiDates((prev) =>
        prev.includes(d.date) ? prev.filter((x) => x !== d.date) : [...prev, d.date].sort()
      );
      return;
    }

    setSelectedDay(d);
    setEditOpen(d.isOpen);
    setEditPaused(d.isPaused);
    setEditCap(d.slotCapacity);
    setEditReason(d.hasOverride ? d.reason : '');
  };

  const saveDayRule = async (
    dateISO: string,
    isOpen: boolean,
    isPaused: boolean,
    slotCapacity: number,
    reason: string
  ) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleDate: dateISO,
          isOpen,
          isPaused,
          slotCapacity,
          reason,
        }),
      });
      if (res.ok) {
        setStatusMsg(
          `บันทึกวันที่ ${formatThaiDateLong(dateISO)}: ${
            isOpen
              ? isPaused
                ? 'ระงับชั่วคราว'
                : `เปิดรับจอง (${slotCapacity * TIME_SLOTS.length} คิว)`
              : 'ปิดจอง'
          }`
        );
        await loadCalendar(currentMonth);
        onScheduleChanged();
      }
    } finally {
      setSaving(false);
    }
  };

  const clearDayOverride = async (dateISO: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/schedule?date=${encodeURIComponent(dateISO)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setStatusMsg(`ล้างการตั้งค่าวันที่ ${formatThaiDateLong(dateISO)} กลับเป็นปิดจองแล้ว`);
        await loadCalendar(currentMonth);
        onScheduleChanged();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitSelectedDay = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedDay) return;
    await saveDayRule(selectedDay.date, editOpen, editPaused, editCap, editReason);
  };

  const applyBatchDates = async (
    targetDates: string[],
    isOpen: boolean,
    reason: string,
    cap = batchCap
  ) => {
    if (targetDates.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/schedule/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dates: targetDates,
          isOpen,
          isPaused: false,
          slotCapacity: cap,
          reason,
        }),
      });
      if (res.ok) {
        setStatusMsg(
          `${isOpen ? 'เปิดจอง' : 'ปิดจอง'}จำนวน ${targetDates.length} วันเรียบร้อยแล้ว`
        );
        setMultiDates([]);
        await loadCalendar(currentMonth);
        onScheduleChanged();
      }
    } finally {
      setSaving(false);
    }
  };

  const selectSundaysInMonth = () => {
    const sundays = days
      .filter((d) => {
        const [y, m, day] = d.date.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, day)).getUTCDay() === 0 && !d.isPast;
      })
      .map((d) => d.date);
    setMultiMode(true);
    setMultiDates(sundays);
  };

  const openSundaysInMonth = async () => {
    const sundays = days
      .filter((d) => {
        const [y, m, day] = d.date.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, day)).getUTCDay() === 0 && !d.isPast;
      })
      .map((d) => d.date);
    await applyBatchDates(
      sundays,
      true,
      'เปิดให้บริการวันอาทิตย์ 09.00–11.30 น. (กำหนดโดยผู้ดูแลระบบ)',
      DEFAULT_SLOT_CAPACITY
    );
  };

  const closeAllMonth = async () => {
    const futureOrToday = days.filter((d) => !d.isPast).map((d) => d.date);
    await applyBatchDates(
      futureOrToday,
      false,
      'ปิดรับจองชั่วคราว (กำหนดโดยผู้ดูแลระบบ)',
      DEFAULT_SLOT_CAPACITY
    );
  };

  const [yr, mn] = currentMonth.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(yr, mn - 1, 1)).getUTCDay();
  const thaiMonthTitle = `${THAI_MONTHS[mn - 1]} พ.ศ. ${yr + 543}`;

  const openDaysCount = days.filter((d) => d.isOpen && !d.isPaused && !d.isPast).length;
  const totalOpenCapacity = days
    .filter((d) => d.isOpen && !d.isPaused && !d.isPast)
    .reduce((sum, d) => sum + d.dailyCapacity, 0);

  return (
    <div className="space-y-6">
      {statusMsg && (
        <div
          role="status"
          className="bg-[#ECFDF5] border border-[#4ADE80] text-[#0F294A] rounded-xl px-5 py-3.5 text-[17px] font-semibold"
        >
          {statusMsg}
        </div>
      )}

      {/* 100% Admin-Only Policy Header */}
      <div className="bg-[#0F294A] text-white rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 text-[#86EFAC] font-bold text-[16px]">
            <ShieldCheck className="w-5 h-5" />
            <span>กำหนดวันจองคิวโดยผู้ดูแลระบบเท่านั้น 100%</span>
          </div>
          <h2 className="text-2xl font-bold">จัดการวันเปิดรับจองคิวฝังเข็ม</h2>
          <p className="text-[16px] text-slate-200">
            ระบบจะปิดรับจองทุกวันไว้เป็นค่าเริ่มต้น ประชาชนจะจองคิวได้เฉพาะวันที่ผู้ดูแลระบบเปิดให้จองในหน้านี้เท่านั้น
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 shrink-0">
          <div className="bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-center">
            <p className="text-[14px] text-slate-200">วันที่เปิดจองเดือนนี้</p>
            <p className="text-2xl font-bold font-mono-num text-[#86EFAC]">{openDaysCount} วัน</p>
          </div>
          <div className="bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-center">
            <p className="text-[14px] text-slate-200">จำนวนคิวที่เปิดรับ</p>
            <p className="text-2xl font-bold font-mono-num text-white">{totalOpenCapacity} คิว</p>
          </div>
        </div>
      </div>

      {/* Interactive Monthly Calendar + Day / Multi-Day Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-[#CBD5E1] rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-bold text-[#0F294A] flex items-center gap-2.5">
              <Calendar className="w-6 h-6 text-[#065F46]" />
              <span>ปฏิทินกำหนดวันจองคิว</span>
            </h3>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                aria-label="เดือนก่อนหน้า"
                className="p-2 rounded-xl border border-[#CBD5E1] text-[#0F294A] hover:bg-[#F4F7FB] cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-[17px] font-bold text-[#0F294A] min-w-[175px] text-center">
                {thaiMonthTitle}
              </span>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                aria-label="เดือนถัดไป"
                className="p-2 rounded-xl border border-[#CBD5E1] text-[#0F294A] hover:bg-[#F4F7FB] cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Mode Selector + Quick Admin Batch Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[#F4F7FB] border border-[#CBD5E1] rounded-xl px-4 py-3">
            <button
              type="button"
              onClick={() => {
                setMultiMode((v) => !v);
                setMultiDates([]);
                setSelectedDay(null);
              }}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-[15px] font-bold cursor-pointer transition-colors ${
                multiMode
                  ? 'bg-[#0F294A] border-[#0F294A] text-white'
                  : 'bg-white border-[#CBD5E1] text-[#0F294A] hover:bg-[#ECFDF5]'
              }`}
            >
              {multiMode ? <CheckSquare className="w-4 h-4 text-[#86EFAC]" /> : <Square className="w-4 h-4" />}
              <span>{multiMode ? 'กำลังเลือกหลายวันพร้อมกัน' : 'โหมดเลือกหลายวัน'}</span>
            </button>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={openSundaysInMonth}
                className="px-3.5 py-2 rounded-lg bg-[#ECFDF5] border border-[#4ADE80] text-[#0F294A] text-[14px] font-bold hover:bg-[#DCFCE7] cursor-pointer"
              >
                เปิดทุกวันอาทิตย์ของเดือนนี้
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={closeAllMonth}
                className="px-3.5 py-2 rounded-lg bg-white border border-red-200 text-[#B91C1C] text-[14px] font-bold hover:bg-red-50 cursor-pointer"
              >
                ปิดทั้งเดือนนี้
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-[14px] text-slate-700">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <span className="w-4 h-4 rounded bg-[#ECFDF5] border-2 border-[#4ADE80] inline-block" />
              เปิดให้จอง (แอดมินเปิดแล้ว)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-slate-100 border border-slate-300 inline-block" />
              ปิดจอง / ยังไม่เปิด
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-amber-50 border-2 border-amber-400 inline-block" />
              ระงับชั่วคราว
            </span>
          </div>

          {loading ? (
            <div className="h-72 bg-slate-100 rounded-xl" />
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {THAI_DAYS_SHORT.map((d) => (
                <div key={d} className="text-center py-1.5 text-[15px] font-bold text-[#0F294A]">
                  {d}
                </div>
              ))}
              {Array.from({ length: firstWeekday }).map((_, i) => (
                <div key={`e-${i}`} className="min-h-[72px]" />
              ))}
              {days.map((d) => {
                const isSelected = multiMode
                  ? multiDates.includes(d.date)
                  : selectedDay?.date === d.date;

                let cls = 'border-slate-200 bg-slate-100 text-slate-500';
                let tag = 'ปิดจอง';
                if (d.isPast) {
                  cls = 'border-slate-200 bg-slate-50 text-slate-400';
                  tag = 'ผ่านมา';
                } else if (d.isOpen && !d.isPaused) {
                  cls = 'border-[#4ADE80] bg-[#ECFDF5] text-[#0F294A]';
                  tag = `${d.bookedCount}/${d.dailyCapacity}`;
                } else if (d.isPaused) {
                  cls = 'border-amber-300 bg-amber-50 text-amber-900';
                  tag = 'ระงับ';
                }

                return (
                  <button
                    key={d.date}
                    type="button"
                    disabled={multiMode && d.isPast}
                    onClick={() => handleClickDay(d)}
                    className={`min-h-[72px] rounded-xl border-2 p-1.5 flex flex-col items-center justify-between transition-colors ${
                      multiMode && d.isPast ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                    } ${
                      isSelected
                        ? 'border-[#0F294A] bg-[#0F294A] text-white'
                        : `${cls} hover:border-[#0F294A]`
                    }`}
                  >
                    <span className="text-[18px] font-bold font-mono-num">{d.day}</span>
                    <span className="text-[12px] font-bold font-mono-num">{tag}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Panel: Multi-Select OR Single Day Editor */}
        <div className="lg:col-span-5 bg-white border border-[#CBD5E1] rounded-2xl p-6 space-y-5">
          {multiMode ? (
            <div className="space-y-4">
              <div>
                <p className="text-[15px] text-[#065F46] font-bold">กำหนดหลายวันพร้อมกัน</p>
                <h3 className="text-2xl font-bold text-[#0F294A]">
                  เลือกแล้ว {multiDates.length} วัน
                </h3>
                <p className="text-[15px] text-slate-600 mt-1">
                  คลิกวันที่ในปฏิทินด้านซ้ายเพื่อเพิ่มหรือเอาออก
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectSundaysInMonth}
                  className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-[#F4F7FB] text-[#0F294A] text-[14px] font-bold hover:bg-[#ECFDF5] cursor-pointer"
                >
                  เลือกเฉพาะวันอาทิตย์เดือนนี้
                </button>
                <button
                  type="button"
                  onClick={() => setMultiDates([])}
                  className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-slate-600 text-[14px] font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  ล้างรายการที่เลือก
                </button>
              </div>

              {multiDates.length > 0 && (
                <div className="max-h-32 overflow-y-auto bg-[#F4F7FB] border border-[#CBD5E1] rounded-xl p-3 text-[14px] space-y-1">
                  {multiDates.map((dt) => (
                    <div key={dt} className="font-semibold text-[#0F294A]">
                      • {formatThaiDateLong(dt)}
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-[15px] font-bold text-[#0F294A] mb-1">
                  จำนวนคิวต่อรอบเวลา (มาตรฐาน 5 = {batchCap * TIME_SLOTS.length} คิว/วัน)
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={batchCap}
                  onChange={(e) => setBatchCap(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[17px] font-mono-num"
                />
              </div>

              <div>
                <label className="block text-[15px] font-bold text-[#0F294A] mb-1">
                  หมายเหตุ
                </label>
                <input
                  type="text"
                  value={batchReason}
                  onChange={(e) => setBatchReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[16px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  disabled={saving || multiDates.length === 0}
                  onClick={() => applyBatchDates(multiDates, true, batchReason, batchCap)}
                  className="inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0F294A] text-white text-[16px] font-bold hover:bg-[#163A66] disabled:opacity-40 cursor-pointer"
                >
                  <Unlock className="w-4 h-4 text-[#86EFAC]" />
                  <span>เปิดจอง ({multiDates.length})</span>
                </button>

                <button
                  type="button"
                  disabled={saving || multiDates.length === 0}
                  onClick={() =>
                    applyBatchDates(multiDates, false, batchReason || 'ปิดรับจองคิว', batchCap)
                  }
                  className="inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 border border-red-300 text-[#B91C1C] text-[16px] font-bold hover:bg-red-100 disabled:opacity-40 cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>ปิดจอง ({multiDates.length})</span>
                </button>
              </div>
            </div>
          ) : !selectedDay ? (
            <div className="py-12 text-center space-y-2 text-slate-600">
              <Calendar className="w-10 h-10 mx-auto text-[#0F294A]" />
              <p className="text-[18px] font-bold text-[#0F294A]">เลือกวันที่ในปฏิทินด้านซ้าย</p>
              <p className="text-[16px]">
                คลิก 1 วันเพื่อเปิด–ปิดจอง หรือกด &ldquo;โหมดเลือกหลายวัน&rdquo; เพื่อกำหนดทีละหลายวัน
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitSelectedDay} className="space-y-4">
              <div>
                <p className="text-[15px] text-[#065F46] font-bold">
                  {selectedDay.isOpen ? 'สถานะ: เปิดจอง (กำหนดโดยแอดมิน)' : 'สถานะ: ปิดจอง'}
                </p>
                <h3 className="text-2xl font-bold text-[#0F294A]">
                  {formatThaiDateLong(selectedDay.date)}
                </h3>
                <p className="text-[15px] text-slate-600 mt-1 font-mono-num">
                  มีการจองแล้ว {selectedDay.bookedCount} คิว
                  {selectedDay.updatedBy ? ` · อัปเดตโดย ${selectedDay.updatedBy}` : ''}
                </p>
              </div>

              {/* 1-Click Quick Toggle Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setEditOpen(true);
                    setEditPaused(false);
                    saveDayRule(
                      selectedDay.date,
                      true,
                      false,
                      editCap,
                      editReason || 'เปิดให้บริการจองคิว (กำหนดโดยผู้ดูแลระบบ)'
                    );
                  }}
                  className="inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-[#ECFDF5] border border-[#4ADE80] text-[#0F294A] text-[16px] font-bold hover:bg-[#DCFCE7] cursor-pointer"
                >
                  <Unlock className="w-4 h-4 text-[#065F46]" />
                  <span>เปิดให้จองทันที</span>
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setEditOpen(false);
                    setEditPaused(false);
                    saveDayRule(
                      selectedDay.date,
                      false,
                      false,
                      editCap,
                      editReason || 'ปิดรับจองคิว (กำหนดโดยผู้ดูแลระบบ)'
                    );
                  }}
                  className="inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 border border-red-300 text-[#B91C1C] text-[16px] font-bold hover:bg-red-100 cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>ปิดจองวันนี้</span>
                </button>
              </div>

              <div className="pt-3 border-t border-slate-200 space-y-3">
                <label className="flex items-center gap-3 text-[16px] font-semibold text-[#0F294A] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editOpen}
                    onChange={(e) => setEditOpen(e.target.checked)}
                    className="w-5 h-5 accent-[#0F294A]"
                  />
                  <span>เปิดให้บริการจองคิว</span>
                </label>

                <label className="flex items-center gap-3 text-[16px] font-semibold text-[#0F294A] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPaused}
                    onChange={(e) => setEditPaused(e.target.checked)}
                    className="w-5 h-5 accent-[#B91C1C]"
                  />
                  <span>ระงับรับจองชั่วคราว</span>
                </label>

                <div>
                  <label className="block text-[15px] font-bold text-[#0F294A] mb-1">
                    จำนวนคิวต่อช่วงเวลา (มาตรฐาน 5 = {editCap * TIME_SLOTS.length} คิว/วัน)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={editCap}
                    onChange={(e) => setEditCap(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[17px] font-mono-num"
                  />
                </div>

                <div>
                  <label className="block text-[15px] font-bold text-[#0F294A] mb-1">
                    หมายเหตุ / เหตุผล
                  </label>
                  <input
                    type="text"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    placeholder="เช่น เปิดรอบพิเศษ หรือ วันหยุด"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[16px]"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-3 rounded-xl bg-[#0F294A] text-white text-[17px] font-bold hover:bg-[#163A66] cursor-pointer"
                  >
                    บันทึกการตั้งค่าวันนี้
                  </button>
                  {selectedDay.hasOverride && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => clearDayOverride(selectedDay.date)}
                      title="ล้างการตั้งค่ากลับเป็นปิดจอง"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border border-[#CBD5E1] bg-white text-slate-700 text-[15px] font-semibold hover:bg-slate-50 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>ล้างเป็นปิด</span>
                    </button>
                  )}
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
