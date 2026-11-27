import { useState } from 'react';
import { Activity, Calendar, Clock, ExternalLink, FileText, Phone, ShieldCheck } from 'lucide-react';
import { FOUNDATION_INFO } from '../lib/constants';
import { type AppView } from './LandingViewTypes';

export type { AppView } from './LandingViewTypes';

interface LandingViewProps {
  onNavigate: (view: AppView) => void;
  announcement: string;
  foundationPhone: string;
  facebookUrl: string;
  globalPaused: boolean;
  liveSummary: {
    currentQueue: string;
    waitingCount: number;
    completedCount: number;
  } | null;
}

export function LandingView({
  onNavigate,
  announcement,
  foundationPhone,
  facebookUrl,
  globalPaused,
  liveSummary,
}: LandingViewProps) {
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  return (
    <div className="space-y-10 pb-16">
      {/* Targeted Announcement Banner (div#root > div > main > div > div:nth-of-type(1)) */}
      <div
        role="region"
        aria-label="ประกาศจากมูลนิธิ"
        className={`rounded-2xl border px-6 py-5 text-[18px] leading-relaxed ${
          globalPaused
            ? 'border-red-300 bg-red-50 text-red-950'
            : 'border-[#86EFAC] bg-[#ECFDF5] text-[#0F294A]'
        }`}
      >
        <p className="font-semibold">
          <span className="font-bold mr-2">ประกาศ:</span>
          {announcement || FOUNDATION_INFO.defaultAnnouncement}
        </p>
        <p className="mt-2 text-[17px]">
          หรือติดตามข่าวสารและวันเปิดให้บริการผ่านเพจ{' '}
          <a
            href={facebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-bold text-[#0F294A] underline hover:text-[#163A66]"
          >
            <span>Facebook : มูลนิธิร่วมกุศลสมุทรปราการ</span>
            <ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
          </a>
        </p>
      </div>

      {/* Simplified High-Clarity Hero Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 flex flex-col justify-between bg-white border border-[#CBD5E1] rounded-2xl p-8 lg:p-10">
          <div className="space-y-4">
            <p className="text-[17px] font-bold text-[#065F46]">
              {FOUNDATION_INFO.name} · คลินิกบริการฝังเข็ม
            </p>
            <h1
              className="text-3xl sm:text-4xl lg:text-[42px] font-bold text-[#0F294A] leading-tight"
              style={{ textWrap: 'balance' }}
            >
              ระบบนัดหมายเข้ารับบริการฝังเข็มออนไลน์
            </h1>
            <p className="text-[18px] sm:text-[19px] text-slate-700 leading-relaxed max-w-2xl">
              จองคิวง่ายใน 3 ขั้นตอน ไม่ต้องเข้าสู่ระบบ เปิดให้บริการวันอาทิตย์ เวลา 09.00–11.30 น.
              (วันเปิดรับจองคิวกำหนดโดยผู้ดูแลระบบเท่านั้น) รับบัตรคิวอิเล็กทรอนิกส์และเช็กคิวได้ทันที
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => onNavigate('book')}
              disabled={globalPaused}
              className="inline-flex items-center justify-center gap-3 px-7 py-4 min-h-[58px] rounded-xl bg-[#0F294A] text-white text-[19px] font-bold hover:bg-[#163A66] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#0F294A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Calendar className="w-6 h-6 text-[#86EFAC]" aria-hidden="true" />
              <span>{globalPaused ? 'ปิดรับจองชั่วคราว' : 'จองคิวเข้ารับบริการ'}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('status')}
              className="inline-flex items-center justify-center gap-3 px-6 py-4 min-h-[58px] rounded-xl border border-[#86EFAC] bg-[#ECFDF5] text-[#0F294A] text-[19px] font-bold hover:bg-[#DCFCE7] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#0F294A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Activity className="w-6 h-6 text-[#065F46]" aria-hidden="true" />
              <span>ตรวจสอบสถานะคิว</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl overflow-hidden border border-[#CBD5E1] bg-white min-h-[280px]">
          {!heroImgFailed ? (
            <img
              src={FOUNDATION_INFO.heroImagePath}
              alt="ห้องให้บริการฝังเข็ม มูลนิธิร่วมกุศลสมุทรปราการ"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgFailed(true)}
              className="w-full h-full lg:h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-[#0F294A]">
              <ShieldCheck className="w-12 h-12 text-[#065F46] mb-3" />
              <p className="text-[18px] font-bold">{FOUNDATION_INFO.name}</p>
              <p className="text-[16px] text-slate-600">บริการฝังเข็มเพื่อสุขภาพ</p>
            </div>
          )}
        </div>
      </section>

      {/* Clean 4-Column Live Status Strip */}
      <section
        aria-label="สรุปสถานะคิววันนี้"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div className="bg-[#0F294A] text-white rounded-2xl p-6">
          <p className="text-[16px] text-slate-200">กำลังเรียกคิวปัจจุบัน</p>
          <p className="mt-1 text-3xl font-bold font-mono-num text-[#86EFAC]">
            {liveSummary?.currentQueue || '-'}
          </p>
        </div>
        <div className="bg-white border border-[#CBD5E1] rounded-2xl p-6">
          <p className="text-[16px] text-slate-600">คิวที่กำลังรอรับบริการ</p>
          <p className="mt-1 text-3xl font-bold font-mono-num text-[#0F294A]">
            {liveSummary ? `${liveSummary.waitingCount} คิว` : '-'}
          </p>
        </div>
        <div className="bg-[#ECFDF5] border border-[#86EFAC] rounded-2xl p-6">
          <p className="text-[16px] text-[#065F46] font-semibold">วัน-เวลาเปิดให้บริการ</p>
          <p className="mt-1 text-xl font-bold text-[#0F294A] tabular-nums">
            วันอาทิตย์ 09.00 - 11.30 น.
          </p>
          <p className="text-[15px] text-slate-700">เปิดรับ 25 คิวต่อวัน</p>
        </div>
        <div className="bg-white border border-[#CBD5E1] rounded-2xl p-6">
          <p className="text-[16px] text-slate-600">ติดต่อเจ้าหน้าที่โดยตรง</p>
          <a
            href={`tel:${foundationPhone.replace(/\D/g, '')}`}
            className="mt-1 inline-flex items-center gap-2 text-2xl font-bold font-mono-num text-[#0F294A] hover:underline"
          >
            <Phone className="w-5 h-5 text-[#065F46]" aria-hidden="true" />
            <span>{foundationPhone}</span>
          </a>
        </div>
      </section>

      {/* 4 Large Easy-to-Tap Main Menu Buttons */}
      <section aria-labelledby="main-menu-heading" className="space-y-5">
        <div>
          <h2 id="main-menu-heading" className="text-2xl sm:text-3xl font-bold text-[#0F294A]">
            เลือกบริการที่ต้องการ
          </h2>
          <p className="text-[18px] text-slate-600 mt-1">
            ออกแบบให้ปุ่มใหญ่ ตัวอักษรชัดเจน ใช้งานง่ายสำหรับผู้สูงอายุ
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <button
            type="button"
            onClick={() => onNavigate('book')}
            className="text-left bg-white border-2 border-[#CBD5E1] hover:border-[#0F294A] rounded-2xl p-7 transition-colors focus-visible:outline-3 focus-visible:outline-[#0F294A] cursor-pointer group"
          >
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-xl bg-[#ECFDF5] border border-[#86EFAC] text-[#0F294A] flex items-center justify-center shrink-0">
                <Calendar className="w-7 h-7" aria-hidden="true" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-2xl font-bold text-[#0F294A] group-hover:underline">
                  1. จองคิวเข้ารับบริการ
                </h3>
                <p className="text-[18px] text-slate-600 leading-relaxed">
                  เลือกวันและเวลาที่เปิดจอง กรอกข้อมูลสั้นๆ และรับบัตรคิว A001–A025 ทันที
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('status')}
            className="text-left bg-white border-2 border-[#CBD5E1] hover:border-[#0F294A] rounded-2xl p-7 transition-colors focus-visible:outline-3 focus-visible:outline-[#0F294A] cursor-pointer group"
          >
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-xl bg-[#ECFDF5] border border-[#86EFAC] text-[#0F294A] flex items-center justify-center shrink-0">
                <Clock className="w-7 h-7" aria-hidden="true" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-2xl font-bold text-[#0F294A] group-hover:underline">
                  2. ตรวจสอบสถานะคิว Real-Time
                </h3>
                <p className="text-[18px] text-slate-600 leading-relaxed">
                  เช็กเลขคิวที่กำลังเรียก และดูว่าเหลืออีกกี่คิวจะถึงคิวของท่าน
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="text-left bg-white border-2 border-[#CBD5E1] hover:border-[#0F294A] rounded-2xl p-7 transition-colors focus-visible:outline-3 focus-visible:outline-[#0F294A] cursor-pointer group"
          >
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-xl bg-[#ECFDF5] border border-[#86EFAC] text-[#0F294A] flex items-center justify-center shrink-0">
                <FileText className="w-7 h-7" aria-hidden="true" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-2xl font-bold text-[#0F294A] group-hover:underline">
                  3. ประวัติการรับบริการ
                </h3>
                <p className="text-[18px] text-slate-600 leading-relaxed">
                  ค้นหาประวัติการฝังเข็มย้อนหลัง และเปิดดูหรือยกเลิกบัตรคิวที่จองไว้
                </p>
              </div>
            </div>
          </button>

          <a
            href={`tel:${foundationPhone.replace(/\D/g, '')}`}
            className="text-left bg-white border-2 border-[#CBD5E1] hover:border-[#0F294A] rounded-2xl p-7 transition-colors focus-visible:outline-3 focus-visible:outline-[#0F294A] group block"
          >
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-xl bg-[#0F294A] text-[#86EFAC] flex items-center justify-center shrink-0">
                <Phone className="w-7 h-7" aria-hidden="true" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-2xl font-bold text-[#0F294A] group-hover:underline">
                  4. โทรติดต่อเจ้าหน้าที่ ({foundationPhone})
                </h3>
                <p className="text-[18px] text-slate-600 leading-relaxed">
                  กดเพื่อโทรสอบถามข้อมูลหรือขอความช่วยเหลือกับเจ้าหน้าที่ทันที
                </p>
              </div>
            </div>
          </a>
        </div>
      </section>

      {/* Clean Schedule Timetable */}
      <section className="bg-white border border-[#CBD5E1] rounded-2xl p-6 sm:p-8">
        <h2 className="text-2xl font-bold text-[#0F294A] mb-5">
          รอบเวลาให้บริการ (วันอาทิตย์ 09.00 - 11.30 น. · รวม 25 คิว)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#EFF4FA] text-[17px] text-[#0F294A]">
                <th className="py-3.5 px-4 font-bold rounded-l-lg">รอบที่</th>
                <th className="py-3.5 px-4 font-bold">ช่วงเวลา</th>
                <th className="py-3.5 px-4 font-bold text-right">จำนวนคิว</th>
                <th className="py-3.5 px-4 font-bold text-right rounded-r-lg">เวลาแนะนำมาถึง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-[18px]">
              {[
                ['รอบที่ 1', '09.00 - 09.30 น.', '5 คิว', '08.45 น.'],
                ['รอบที่ 2', '09.31 - 10.00 น.', '5 คิว', '09.15 น.'],
                ['รอบที่ 3', '10.01 - 10.30 น.', '5 คิว', '09.45 น.'],
                ['รอบที่ 4', '10.31 - 11.00 น.', '5 คิว', '10.15 น.'],
                ['รอบที่ 5', '11.01 - 11.30 น.', '5 คิว', '10.45 น.'],
              ].map(([round, time, cap, note]) => (
                <tr key={round} className="hover:bg-[#F4F7FB]">
                  <td className="py-3.5 px-4 font-medium text-slate-800">{round}</td>
                  <td className="py-3.5 px-4 font-mono-num font-bold text-[#0F294A]">{time}</td>
                  <td className="py-3.5 px-4 text-right font-mono-num font-bold text-[#065F46]">
                    {cap}
                  </td>
                  <td className="py-3.5 px-4 text-right text-slate-600 font-mono-num">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
