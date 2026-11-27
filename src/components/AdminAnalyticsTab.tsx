import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import {
  BOOKING_STATUS_LABELS,
  type BookingStatus,
  formatThaiDate,
  getBangkokTodayISO,
} from '../lib/constants';
import {
  exportReportCsv,
  exportReportExcel,
  exportReportPdf,
  type ReportRow,
} from '../lib/exportUtils';

interface AnalyticsPayload {
  range: 'daily' | 'monthly' | 'yearly';
  refDate: string;
  metrics: {
    totalCount: number;
    completedCount: number;
    cancelledCount: number;
    noShowCount: number;
    specialCount: number;
    avgAge: number;
    popularDay: string;
    popularHour: string;
    noShowRate: number;
    cancelRate: number;
    newPatients: number;
    returningPatients: number;
  };
  topDiseases: Array<{ name: string; value: number }>;
  byTimeSlot: Array<{ slot: string; value: number }>;
  dailySeries: Array<{ label: string; value: number }>;
  monthlySeries: Array<{ label: string; value: number }>;
  yearlySeries: Array<{ label: string; value: number }>;
  rows: ReportRow[];
}

function SimpleBarChart({
  title,
  items,
  accentColor = '#0F294A',
}: {
  title: string;
  items: Array<{ label: string; value: number }>;
  accentColor?: string;
}) {
  const maxVal = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bg-white border border-[#CBD5E1] rounded-2xl p-6 space-y-4">
      <h3 className="text-xl font-bold text-[#0F294A]">{title}</h3>
      {items.length === 0 ? (
        <p className="text-[16px] text-slate-500 py-6">ไม่มีข้อมูลในช่วงที่เลือก</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const pct = Math.round((item.value / maxVal) * 100);
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex justify-between text-[15px] font-semibold text-[#0F294A]">
                  <span className="truncate pr-3">{item.label}</span>
                  <span className="font-mono-num shrink-0">{item.value} ราย</span>
                </div>
                <div className="w-full h-3 rounded bg-[#EFF4FA] overflow-hidden">
                  <div
                    className="h-full rounded transition-all"
                    style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: accentColor }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AdminAnalyticsTab() {
  const [range, setRange] = useState<'daily' | 'monthly' | 'yearly'>('monthly');
  const [refDate, setRefDate] = useState<string>(getBangkokTodayISO());
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportMsg, setExportMsg] = useState('');

  const loadAnalytics = async (r: string, d: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/analytics?range=${encodeURIComponent(r)}&date=${encodeURIComponent(d)}`
      );
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics(range, refDate);
  }, [range, refDate]);

  const rangeLabel =
    range === 'daily' ? 'รายงานรายวัน' : range === 'monthly' ? 'รายงานรายเดือน' : 'รายงานรายปี';

  const handleExcel = () => {
    if (!data) return;
    exportReportExcel(data.rows, `${rangeLabel}-${refDate}`);
    setExportMsg('ส่งออกไฟล์ Excel (.xlsx) เรียบร้อยแล้ว');
  };

  const handleCsv = () => {
    if (!data) return;
    exportReportCsv(data.rows, `${rangeLabel}-${refDate}`);
    setExportMsg('ส่งออกไฟล์ CSV (.csv) เรียบร้อยแล้ว');
  };

  const handlePdf = async () => {
    if (!data) return;
    await exportReportPdf(data.rows, `${rangeLabel} (${formatThaiDate(refDate)})`, data.metrics);
    setExportMsg('ส่งออกไฟล์ PDF (.pdf) เรียบร้อยแล้ว');
  };

  if (loading || !data) {
    return (
      <div className="bg-white border border-[#CBD5E1] rounded-2xl p-8 text-[18px] text-slate-600">
        กำลังคำนวณสถิติและรายงาน...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Controls & Export Toolbar */}
      <div className="bg-white border border-[#CBD5E1] rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#EFF4FA] rounded-xl">
            {(['daily', 'monthly', 'yearly'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-4 py-2 rounded-lg text-[16px] font-bold transition-colors cursor-pointer ${
                  range === r
                    ? 'bg-[#0F294A] text-white'
                    : 'text-[#0F294A] hover:bg-white'
                }`}
              >
                {r === 'daily' ? 'รายวัน' : r === 'monthly' ? 'รายเดือน' : 'รายปี'}
              </button>
            ))}
          </div>

          <input
            type="date"
            aria-label="เลือกวันที่อ้างอิงรายงาน"
            value={refDate}
            onChange={(e) => setRefDate(e.target.value)}
            className="px-4 py-2 rounded-xl border border-[#CBD5E1] bg-white text-[16px] font-mono-num text-[#0F294A]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExcel}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F294A] text-white text-[16px] font-bold hover:bg-[#163A66] cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#86EFAC]" />
            <span>Export Excel (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={handlePdf}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#86EFAC] bg-[#ECFDF5] text-[#0F294A] text-[16px] font-bold hover:bg-[#DCFCE7] cursor-pointer"
          >
            <FileText className="w-4 h-4 text-[#065F46]" />
            <span>Export PDF</span>
          </button>
          <button
            type="button"
            onClick={handleCsv}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-[#0F294A] text-[16px] font-semibold hover:bg-[#F4F7FB] cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {exportMsg && (
        <p role="status" className="bg-[#ECFDF5] border border-[#86EFAC] text-[#0F294A] px-5 py-3 rounded-xl text-[16px] font-semibold">
          {exportMsg}
        </p>
      )}

      {/* Advanced Analytics KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#CBD5E1] rounded-2xl p-5">
          <p className="text-[15px] text-slate-600">ผู้รับบริการช่วงนี้</p>
          <p className="text-3xl font-bold font-mono-num text-[#0F294A] mt-1">
            {data.metrics.totalCount}
          </p>
          <p className="text-[14px] text-slate-600 mt-1">
            สำเร็จ {data.metrics.completedCount} · คิวพิเศษ {data.metrics.specialCount}
          </p>
        </div>

        <div className="bg-[#ECFDF5] border border-[#86EFAC] rounded-2xl p-5">
          <p className="text-[15px] text-[#065F46] font-semibold">อายุเฉลี่ยผู้รับบริการ</p>
          <p className="text-3xl font-bold font-mono-num text-[#0F294A] mt-1">
            {data.metrics.avgAge} ปี
          </p>
          <p className="text-[14px] text-slate-700 mt-1">
            ผู้ป่วยใหม่ {data.metrics.newPatients} · เดิม {data.metrics.returningPatients}
          </p>
        </div>

        <div className="bg-white border border-[#CBD5E1] rounded-2xl p-5">
          <p className="text-[15px] text-slate-600">วัน / ช่วงเวลายอดนิยม</p>
          <p className="text-2xl font-bold text-[#0F294A] mt-1">วัน{data.metrics.popularDay}</p>
          <p className="text-[15px] font-mono-num text-[#065F46] font-bold mt-1">{data.metrics.popularHour} น.</p>
        </div>

        <div className="bg-white border border-[#CBD5E1] rounded-2xl p-5">
          <p className="text-[15px] text-slate-600">อัตราไม่มา / ยกเลิก</p>
          <p className="text-2xl font-bold font-mono-num text-[#B91C1C] mt-1">
            {data.metrics.noShowRate}% / {data.metrics.cancelRate}%
          </p>
          <p className="text-[14px] text-slate-600 mt-1">
            ไม่มา {data.metrics.noShowCount} · ยกเลิก {data.metrics.cancelledCount}
          </p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SimpleBarChart
          title="โรค / อาการที่พบบ่อย"
          items={data.topDiseases.map((d) => ({ label: d.name, value: d.value }))}
          accentColor="#10B981"
        />
        <SimpleBarChart
          title="จำนวนผู้ใช้บริการแยกตามช่วงเวลา"
          items={data.byTimeSlot.map((s) => ({ label: `${s.slot} น.`, value: s.value }))}
          accentColor="#0F294A"
        />
        <SimpleBarChart
          title="แนวโน้มจำนวนผู้ใช้รายวัน (ล่าสุด)"
          items={data.dailySeries.map((d) => ({
            label: formatThaiDate(d.label),
            value: d.value,
          }))}
          accentColor="#0F294A"
        />
        <SimpleBarChart
          title="แนวโน้มรายเดือน และรายปี (พ.ศ.)"
          items={[
            ...data.monthlySeries.map((m) => ({ label: `เดือน ${m.label}`, value: m.value })),
            ...data.yearlySeries.map((y) => ({ label: `รวมปี พ.ศ. ${y.label}`, value: y.value })),
          ]}
          accentColor="#10B981"
        />
      </div>

      {/* Detailed Report Table */}
      <div className="bg-white border border-[#CBD5E1] rounded-2xl p-6 space-y-4">
        <h3 className="text-xl font-bold text-[#0F294A]">
          รายการข้อมูลสำหรับรายงาน ({rangeLabel})
        </h3>
        {data.rows.length === 0 ? (
          <p className="text-[17px] text-slate-500 py-4">ไม่พบรายการในช่วงเวลาที่เลือก</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#EFF4FA] text-[15px] text-[#0F294A]">
                  <th className="py-3 px-4 font-bold rounded-l-lg">วันที่</th>
                  <th className="py-3 px-4 font-bold">เวลา</th>
                  <th className="py-3 px-4 font-bold">เลขคิว</th>
                  <th className="py-3 px-4 font-bold">ชื่อ-นามสกุล</th>
                  <th className="py-3 px-4 font-bold text-right">อายุ</th>
                  <th className="py-3 px-4 font-bold">โรคประจำตัว</th>
                  <th className="py-3 px-4 font-bold text-right rounded-r-lg">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[16px]">
                {data.rows.map((r, idx) => (
                  <tr key={`${r.queueNo}-${r.bookingDate}-${idx}`} className="hover:bg-[#F4F7FB]">
                    <td className="py-3 px-4 font-mono-num">{formatThaiDate(r.bookingDate)}</td>
                    <td className="py-3 px-4 font-mono-num">{r.bookingTime}</td>
                    <td className="py-3 px-4 font-mono-num font-bold text-[#0F294A]">{r.queueNo}</td>
                    <td className="py-3 px-4 font-semibold text-[#0F294A]">{r.fullName}</td>
                    <td className="py-3 px-4 text-right font-mono-num">{r.age}</td>
                    <td className="py-3 px-4 text-slate-700">{r.disease}</td>
                    <td className="py-3 px-4 text-right font-medium text-[#065F46]">
                      {BOOKING_STATUS_LABELS[r.status as BookingStatus] || r.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
