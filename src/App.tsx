import { useEffect, useState } from 'react';
import { Menu, Phone, X } from 'lucide-react';
import { FOUNDATION_INFO, getBangkokTodayISO } from './lib/constants';
import { LandingView, type AppView } from './components/LandingView';
import { BookingFlowView } from './components/BookingFlowView';
import { QueueTrackerView } from './components/QueueTrackerView';
import { HistoryView } from './components/HistoryView';
import { StaffPortalView } from './components/StaffPortalView';

export default function App() {
  const [view, setView] = useState<AppView>('landing');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [trackerQuery, setTrackerQuery] = useState('');

  const [config, setConfig] = useState({
    globalBookingPaused: false,
    announcement: FOUNDATION_INFO.defaultAnnouncement as string,
    foundationPhone: FOUNDATION_INFO.phone as string,
    customLogoUrl: '',
    facebookUrl: FOUNDATION_INFO.facebookUrl as string,
  });

  const [liveSummary, setLiveSummary] = useState<{
    currentQueue: string;
    waitingCount: number;
    completedCount: number;
  } | null>(null);

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/public/config');
      if (res.ok) {
        const data = await res.json();
        setConfig({
          globalBookingPaused: Boolean(data.globalBookingPaused),
          announcement: data.announcement || FOUNDATION_INFO.defaultAnnouncement,
          foundationPhone: data.foundationPhone || FOUNDATION_INFO.phone,
          customLogoUrl: data.customLogoUrl || '',
          facebookUrl: data.facebookUrl || FOUNDATION_INFO.facebookUrl,
        });
      }
    } catch {
      // ignore transient load failure
    }
  };

  const loadLiveSummary = async () => {
    try {
      const res = await fetch(`/api/public/queue-status?date=${getBangkokTodayISO()}`);
      if (res.ok) {
        const data = await res.json();
        const current =
          data.currentServing && data.currentServing.length > 0
            ? data.currentServing.map((c: { queueNo: string }) => c.queueNo).join(' / ')
            : 'รอเรียกคิว';
        setLiveSummary({
          currentQueue: current,
          waitingCount: data.waitingCount ?? 0,
          completedCount: data.completedCount ?? 0,
        });
      }
    } catch {
      // ignore transient error
    }
  };

  useEffect(() => {
    loadConfig();
    loadLiveSummary();

    const es = new EventSource('/api/events');
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'queue_updated') {
          loadLiveSummary();
        } else if (msg.type === 'settings_updated') {
          loadConfig();
        }
      } catch {
        // ignore heartbeat
      }
    };
    return () => es.close();
  }, []);

  const navigate = (nextView: AppView) => {
    setView(nextView);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTrackQueue = (queueNo: string) => {
    setTrackerQuery(queueNo);
    navigate('status');
  };

  const logoSrc = config.customLogoUrl || FOUNDATION_INFO.defaultLogoPath;
  const phoneDigits = (config.foundationPhone || FOUNDATION_INFO.phone).replace(/\D/g, '');

  const navItems: Array<{ id: AppView; label: string }> = [
    { id: 'landing', label: 'หน้าหลัก' },
    { id: 'book', label: 'จองคิว' },
    { id: 'status', label: 'ติดตามคิว' },
    { id: 'history', label: 'ประวัติบริการ' },
    { id: 'staff', label: 'เจ้าหน้าที่' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7FB] text-[#0F294A]">
      {/* Clean 3-Zone Top Bar in Deep Navy & Soft Light Green */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[#CBD5E1]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[74px] flex items-center justify-between gap-8">
          {/* Zone 1: Official Unmodified Foundation Logo + Single-Line Title */}
          <button
            type="button"
            onClick={() => navigate('landing')}
            className="flex items-center gap-3 text-left cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#0F294A]"
          >
            <img
              src={logoSrc}
              alt={FOUNDATION_INFO.name}
              className="w-11 h-11 object-contain shrink-0"
            />
            <span className="text-[18px] sm:text-[20px] font-bold tracking-tight text-[#0F294A] whitespace-nowrap shrink-0">
              {FOUNDATION_INFO.name}
            </span>
          </button>

          {/* Zone 2: 5 Single-Line Navigation Links */}
          <nav aria-label="เมนูหลัก" className="hidden lg:flex items-center gap-6">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                className={`py-2 text-[17px] font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                  view === item.id
                    ? 'border-[#0F294A] text-[#0F294A] font-bold'
                    : 'border-transparent text-slate-600 hover:text-[#0F294A] hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary Action (Direct Phone Call) */}
          <div className="flex items-center gap-3 shrink-0">
            <a
              href={`tel:${phoneDigits}`}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F294A] text-white text-[16px] font-semibold font-mono-num hover:bg-[#163A66] transition-colors whitespace-nowrap shrink-0"
            >
              <Phone className="w-4 h-4 text-[#86EFAC]" aria-hidden="true" />
              <span>{config.foundationPhone}</span>
            </a>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((o) => !o)}
              aria-label={mobileMenuOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
              className="lg:hidden p-2.5 rounded-xl border border-[#CBD5E1] text-[#0F294A] cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-[#CBD5E1] bg-white px-4 py-4 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                className={`w-full text-left px-4 py-3.5 rounded-xl text-[18px] font-semibold cursor-pointer ${
                  view === item.id
                    ? 'bg-[#0F294A] text-white'
                    : 'bg-[#F4F7FB] text-[#0F294A]'
                }`}
              >
                {item.label}
              </button>
            ))}
            <a
              href={`tel:${phoneDigits}`}
              className="flex items-center justify-center gap-2 w-full px-4 py-3.5 rounded-xl bg-[#DCFCE7] border border-[#86EFAC] text-[#064E3B] text-[18px] font-bold font-mono-num"
            >
              <Phone className="w-5 h-5" aria-hidden="true" />
              <span>โทรติดต่อเจ้าหน้าที่ {config.foundationPhone}</span>
            </a>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[1160px] mx-auto px-4 sm:px-6 pt-8 sm:pt-10">
        {view === 'landing' && (
          <LandingView
            onNavigate={navigate}
            announcement={config.announcement}
            foundationPhone={config.foundationPhone}
            facebookUrl={config.facebookUrl}
            globalPaused={config.globalBookingPaused}
            liveSummary={liveSummary}
          />
        )}

        {view === 'book' && (
          <BookingFlowView
            logoUrl={logoSrc}
            foundationPhone={config.foundationPhone}
            onTrackQueue={handleTrackQueue}
            onOpenStaff={() => navigate('staff')}
          />
        )}

        {view === 'status' && <QueueTrackerView initialQuery={trackerQuery} />}

        {view === 'history' && (
          <HistoryView
            logoUrl={logoSrc}
            foundationPhone={config.foundationPhone}
            onTrackQueue={handleTrackQueue}
          />
        )}

        {view === 'staff' && (
          <StaffPortalView
            onConfigUpdated={() => {
              loadConfig();
              loadLiveSummary();
            }}
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-[#CBD5E1] bg-white mt-auto">
        <div className="max-w-[1160px] mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-[16px] text-slate-600">
          <div className="space-y-1">
            <p className="font-bold text-[#0F294A]">
              {FOUNDATION_INFO.name} · {FOUNDATION_INFO.systemTitle}
            </p>
            <p>
              เปิดให้บริการวันอาทิตย์ เวลา 09.00 – 11.30 น. (โปรดมาก่อนเวลานัดหมาย 15 นาที) · โทร.{' '}
              <a
                href={`tel:${phoneDigits}`}
                className="font-mono-num font-bold text-[#0F294A] hover:underline"
              >
                {config.foundationPhone}
              </a>
            </p>
            <p>
              ติดตามข่าวสารผ่านเพจ{' '}
              <a
                href={config.facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#0F294A] underline hover:text-[#163A66]"
              >
                Facebook มูลนิธิร่วมกุศลสมุทรปราการ
              </a>
            </p>
          </div>
          <div className="flex flex-wrap gap-5 font-medium text-[#0F294A]">
            <button type="button" onClick={() => navigate('book')} className="hover:underline cursor-pointer">
              จองคิวออนไลน์
            </button>
            <button type="button" onClick={() => navigate('status')} className="hover:underline cursor-pointer">
              ติดตามคิว
            </button>
            <button type="button" onClick={() => navigate('staff')} className="hover:underline cursor-pointer">
              สำหรับเจ้าหน้าที่
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
