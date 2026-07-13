import { ArrowRight } from 'lucide-react';

export default function LeadCaptureView({ onSwitch }: { onSwitch: () => void }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="mb-10">
        <div className="text-cyan-400 text-xs font-bold tracking-widest uppercase mb-4">
          The Claw &middot; Lead Capture
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 font-display leading-tight">
          Claim your free technical<br className="hidden sm:block" /> SEO audit.
        </h1>
        <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-2xl">
          Submit a prospect site and Clawagent will capture the lead, queue the Technical SEO
          Agent, and alert the operator for human follow-up.
        </p>
      </div>

      <div className="bg-[#111627] border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl mb-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 to-transparent pointer-events-none"></div>

        <form className="space-y-6 relative z-10" onSubmit={(e) => e.preventDefault()}>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-300">
              Full Name
            </label>
            <input 
              type="text" 
              className="w-full bg-[#0A0D14] border border-slate-800 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
            />
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-300">
              Work Email
            </label>
            <input 
              type="email" 
              className="w-full bg-[#0A0D14] border border-slate-800 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-300">
              Website URL
            </label>
            <input 
              type="url" 
              placeholder="https://example.com"
              className="w-full bg-[#0A0D14] border border-slate-800 rounded-xl px-4 py-4 text-white placeholder-slate-700 focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
            />
          </div>

          <button className="w-full bg-gradient-to-r from-purple-500 to-cyan-400 hover:from-purple-400 hover:to-cyan-300 text-white font-bold py-4 rounded-xl mt-4 transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)]">
            Claim My Free Audit
          </button>
        </form>
      </div>
      
      <div className="text-xs text-slate-600 leading-relaxed max-w-2xl space-y-2">
        <p>Definition of Done: lead recorded, enrichment queued, alert emitted, and no AI-generated recommendations published without human QA.</p>
        <p className="flex items-center gap-1">
          Have questions first? 
          <button 
            onClick={onSwitch} 
            className="text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center gap-1 transition-colors underline underline-offset-2 group"
          >
            Talk to a sales associate <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
          </button>
        </p>
      </div>
    </div>
  );
}
