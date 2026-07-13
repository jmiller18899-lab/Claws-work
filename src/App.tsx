/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import SalesAssociateView from './components/SalesAssociateView';
import LeadCaptureView from './components/LeadCaptureView';

export default function App() {
  const [currentView, setCurrentView] = useState<'sales' | 'lead'>('sales');

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-200 font-sans relative overflow-x-hidden selection:bg-purple-500/30">
      {/* Background gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-purple-900/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-teal-900/20 rounded-full blur-[120px] pointer-events-none"></div>
      
      <main className="relative z-10 w-full max-w-3xl mx-auto p-4 sm:p-8 pt-12 sm:pt-20 pb-24">
        {currentView === 'sales' ? (
          <SalesAssociateView onSwitch={() => setCurrentView('lead')} />
        ) : (
          <LeadCaptureView onSwitch={() => setCurrentView('sales')} />
        )}
      </main>
    </div>
  );
}

