import { useEffect, useState, type FormEvent } from 'react';
import { RefreshCw, CheckCircle2, ArrowRight } from 'lucide-react';
import { approveLead, fetchOpsLeads, ApiError, type Lead } from '../lib/api';

const OPS_KEY_STORAGE = 'clawagent_ops_key';

export default function OpsConsoleView({ onSwitch }: { onSwitch: () => void }) {
  const [opsKey, setOpsKey] = useState(() => localStorage.getItem(OPS_KEY_STORAGE) ?? '');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const loadLeads = async (key: string) => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const { rows } = await fetchOpsLeads(key);
      setLeads(rows);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Ops key rejected (401). Check OPS_KEY on the gateway service.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load leads.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (opsKey) loadLeads(opsKey);
  }, []);

  const handleKeySubmit = (e: FormEvent) => {
    e.preventDefault();
    localStorage.setItem(OPS_KEY_STORAGE, opsKey);
    loadLeads(opsKey);
  };

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    setError(null);
    try {
      await approveLead(id, opsKey);
      setLeads((prev) =>
        prev.map((lead) => (lead.id === id ? { ...lead, status: 'approved' } : lead))
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Approve failed: ops key rejected (401).');
      } else {
        setError(err instanceof Error ? err.message : 'Approve failed.');
      }
    } finally {
      setApprovingId(null);
    }
  };

  const pendingCount = leads.filter((l) => l.status === 'pending').length;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="mb-8">
        <div className="text-cyan-400 text-xs font-bold tracking-widest uppercase mb-4">
          The Claw &middot; Ops Console
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 font-display leading-tight">
          Review and approve<br className="hidden sm:block" /> captured leads.
        </h1>
        <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-2xl">
          {pendingCount > 0
            ? `${pendingCount} lead${pendingCount === 1 ? '' : 's'} awaiting human approval before any AI-generated recommendations go out.`
            : 'No leads currently pending approval.'}
        </p>
      </div>

      <form onSubmit={handleKeySubmit} className="flex gap-3 mb-6">
        <input
          type="password"
          value={opsKey}
          onChange={(e) => setOpsKey(e.target.value)}
          placeholder="Ops key"
          className="flex-1 bg-[#0A0D14] border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors"
        />
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-cyan-400 hover:from-purple-400 hover:to-cyan-300 text-white font-bold px-6 rounded-xl transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading' : 'Load leads'}
        </button>
      </form>

      {error && (
        <div className="bg-red-950/40 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3 mb-6">
          {error}
        </div>
      )}

      <div className="bg-[#111627] border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl mb-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 to-transparent pointer-events-none"></div>
        <div className="relative z-10 overflow-x-auto">
          {leads.length === 0 ? (
            <div className="text-slate-500 text-sm italic py-6 text-center">
              {opsKey ? 'No leads loaded yet.' : 'Enter the ops key to load leads.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Website</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Run</th>
                  <th className="py-2 pr-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-slate-800/50">
                    <td className="py-3 pr-4 text-slate-200">
                      {lead.name}
                      <div className="text-slate-500 text-xs">{lead.email}</div>
                    </td>
                    <td className="py-3 pr-4 text-slate-300">{lead.website}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded-full ${
                          lead.status === 'approved'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}
                      >
                        {lead.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-500 text-xs">{lead.run_id ?? '—'}</td>
                    <td className="py-3 pr-4 text-right">
                      {lead.status !== 'approved' && (
                        <button
                          onClick={() => handleApprove(lead.id)}
                          disabled={approvingId === lead.id}
                          className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-xs font-semibold disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {approvingId === lead.id ? 'Approving…' : 'Approve'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <button
        onClick={onSwitch}
        className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-sm font-medium transition-colors group"
      >
        Back to sales associate <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>
    </div>
  );
}
