/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import SalesAssociateView from './components/SalesAssociateView';
import LeadCaptureView from './components/LeadCaptureView';
import OpsConsoleView from './components/OpsConsoleView';
import { checkGatewayStatus, fetchOpsLeads, type GatewayStatus } from './lib/api';

const OPS_KEY_STORAGE = 'clawagent_ops_key';
const STATUS_POLL_MS = 30000;

type View = 'sales' | 'lead' | 'ops';

function DeweyDesLogo() {
  return (
    <div className="flex items-center gap-3 shrink-0" aria-label="Dewey Des">
      <div className="relative grid h-12 w-12 place-items-center rounded-full border border-orange-200/60 bg-[#E9540D] text-orange-50 shadow-lg shadow-orange-950/30">
        <svg
          aria-hidden="true"
          viewBox="0 0 120 120"
          className="absolute inset-1 h-10 w-10 text-orange-50"
        >
          <circle cx="60" cy="60" r="51" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle
            cx="60"
            cy="60"
            r="41"
            fill="none"
            stroke="currentColor"
            strokeDasharray="1 6"
            strokeLinecap="round"
            strokeWidth="2"
          />
          <path
            d="M25 60c8-13 21-20 35-20s27 7 35 20c-8 13-21 20-35 20S33 73 25 60Z"
            fill="currentColor"
            opacity="0.96"
          />
          <circle cx="60" cy="60" r="31" fill="#E9540D" />
          <path
            d="M60 18l4 4-4 4-4-4 4-4ZM60 94l4 4-4 4-4-4 4-4Z"
            fill="currentColor"
          />
        </svg>
        <span className="relative z-10 flex w-9 items-center justify-center gap-0.5 font-serif text-2xl font-bold leading-none tracking-[-0.18em] text-orange-50">
          <span>D</span>
          <span>D</span>
        </span>
      </div>
      <div className="hidden sm:block">
        <div className="font-serif text-lg font-semibold tracking-[0.25em] text-orange-50">
          DEWEY DES
        </div>
        <div className="text-[10px] uppercase tracking-[0.35em] text-orange-200/70">
          Maison &middot; Établi MMXXVI
        </div>
      </div>
    </div>
  );
}

const TABS: { id: View; label: string }[] = [
  { id: 'sales', label: 'Sales Associate' },
  { id: 'lead', label: 'Lead Capture' },
  { id: 'ops', label: 'Ops Console' },
];

export default function App() {
  const [currentView, setCurrentView] = useState<View>('sales');
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>('checking');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const status = await checkGatewayStatus();
      if (!cancelled) setGatewayStatus(status);

      const opsKey = localStorage.getItem(OPS_KEY_STORAGE);
      if (opsKey) {
        try {
          const { rows } = await fetchOpsLeads(opsKey);
          if (!cancelled) setPendingCount(rows.filter((l) => l.status === 'pending').length);
        } catch {
          // Ops key invalid or gateway unreachable; leave the last known count.
        }
      }
    };

    poll();
    const interval = setInterval(poll, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-200 font-sans relative overflow-x-hidden selection:bg-purple-500/30">
      {/* Background gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-purple-900/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-teal-900/20 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-8 pt-6 sm:pt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <DeweyDesLogo />
        <div className="flex items-center gap-3 sm:gap-4">
          <nav className="flex gap-1 bg-[#111627]/80 border border-slate-800 rounded-full p-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCurrentView(tab.id)}
                className={`relative px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                  currentView === tab.id
                    ? 'bg-gradient-to-r from-purple-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
                {tab.id === 'ops' && pendingCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div
            title={`Gateway ${gatewayStatus}`}
            className="flex items-center gap-2 text-xs font-medium text-slate-400 shrink-0"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                gatewayStatus === 'online'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                  : gatewayStatus === 'offline'
                    ? 'bg-red-500'
                    : 'bg-slate-600 animate-pulse'
              }`}
            ></span>
            <span className="hidden sm:inline">Gateway {gatewayStatus}</span>
          </div>
        </div>
      </div>

      <main className="relative z-10 w-full max-w-3xl mx-auto p-4 sm:p-8 pt-8 sm:pt-10 pb-24">
        {currentView === 'sales' && <SalesAssociateView onSwitch={() => setCurrentView('lead')} />}
        {currentView === 'lead' && <LeadCaptureView onSwitch={() => setCurrentView('sales')} />}
        {currentView === 'ops' && <OpsConsoleView onSwitch={() => setCurrentView('sales')} />}
      </main>
    </div>
  );
}
