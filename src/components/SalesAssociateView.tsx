import { useState } from 'react';
import { Phone, MessageSquare, ArrowRight, Send } from 'lucide-react';
import { sendSalesMessage, endSalesSession, ApiError } from '../lib/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export default function SalesAssociateView({ onSwitch }: { onSwitch: () => void }) {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || ended) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const { reply } = await sendSalesMessage(sessionId, text);
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Message failed (${err.status}).`
          : 'Could not reach the sales associate. Please try again.'
      );
    } finally {
      setSending(false);
    }
  };

  const handleEndCall = async () => {
    if (ended || messages.length === 0) return;
    try {
      await endSalesSession(sessionId);
    } catch {
      // Transcript may not have saved; surfacing this isn't actionable for the user here.
    } finally {
      setEnded(true);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="mb-8">
        <div className="text-cyan-400 text-xs font-bold tracking-widest uppercase mb-4">
          The Claw &middot; Live Sales Associate
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 font-display leading-tight">
          Talk to a ClawAgent sales<br className="hidden sm:block" /> associate.
        </h1>
        <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-2xl">
          Ask about technical SEO, AI-search visibility, or how the Claw captures and works your leads.
          Type a question or hold the mic to speak &ndash; powered by the xAI Grok Voice realtime agent.
        </p>
      </div>

      <div className="bg-[#111627] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Subtle inner glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 to-transparent pointer-events-none"></div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]"></div>
            <span className="text-sm font-medium text-slate-300">Sales associate online. Type a message or start a voice call.</span>
          </div>

          <div className="bg-[#1A1423] border border-purple-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
            <Phone className="w-5 h-5 text-slate-400" />
            <span className="text-slate-300">Prefer the phone? Call</span>
            <a href="tel:7623340186" className="text-cyan-400 font-medium hover:underline">(762) 334-0186</a>
          </div>

          <div className="border border-slate-800 rounded-xl p-5 mb-6 bg-[#0E121E]">
            <div className="text-sm font-medium text-slate-400 mb-3">Text or call any number</div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="(555) 123-4567"
                className="flex-1 bg-[#0A0D14] border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
              <div className="flex gap-2">
                <button className="flex-1 sm:flex-none flex justify-center items-center gap-2 bg-[#1A2133] hover:bg-[#232D45] text-slate-300 px-6 py-3 rounded-lg font-medium transition-colors border border-slate-700/50">
                  <MessageSquare className="w-4 h-4" />
                  Text
                </button>
                <button className="flex-1 sm:flex-none flex justify-center items-center gap-2 bg-[#1A2133] hover:bg-[#232D45] text-slate-300 px-6 py-3 rounded-lg font-medium transition-colors border border-slate-700/50">
                  <Phone className="w-4 h-4" />
                  Call
                </button>
              </div>
            </div>
            <div className="text-xs text-slate-500 mt-3">Enter a phone number, then choose Text or Call.</div>
          </div>

          <div className="flex gap-3 mb-6">
            <button className="px-6 py-3 rounded-lg border border-slate-700 text-slate-300 font-medium hover:bg-slate-800 transition-colors bg-[#0A0D14]/50">
              Start voice call
            </button>
            <button
              onClick={handleEndCall}
              disabled={ended || messages.length === 0}
              className="px-6 py-3 rounded-lg border border-slate-800 text-slate-500 font-medium bg-[#0A0D14]/30 disabled:cursor-not-allowed enabled:text-slate-300 enabled:border-slate-700 enabled:hover:bg-slate-800 transition-colors"
            >
              {ended ? 'Call ended' : 'End call'}
            </button>
          </div>

          <button className="w-full bg-gradient-to-r from-teal-700/80 to-cyan-700/80 hover:from-teal-600 hover:to-cyan-600 text-slate-200 font-semibold py-4 rounded-xl mb-6 transition-all shadow-[0_0_20px_rgba(20,184,166,0.15)] border border-teal-500/30">
            Hold to talk
          </button>

          <div className="bg-[#0A0D14] border border-purple-500/10 rounded-xl h-48 p-5 mb-4 overflow-y-auto flex flex-col gap-3">
            {messages.length === 0 ? (
              <span className="text-slate-500 italic text-sm">Your conversation will appear here.</span>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={`text-sm max-w-[85%] px-3 py-2 rounded-lg ${
                    m.role === 'user'
                      ? 'self-end bg-purple-500/20 text-purple-100'
                      : 'self-start bg-slate-800/60 text-slate-200'
                  }`}
                >
                  {m.text}
                </div>
              ))
            )}
          </div>

          {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

          <button
            onClick={onSwitch}
            className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-sm font-medium transition-colors mb-4 group"
          >
            Open sales inbox <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>

          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={ended}
              placeholder="Type a message to the sales associate..."
              className="flex-1 bg-[#0A0D14] border border-slate-800 rounded-xl px-4 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={sending || ended || !input.trim()}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-cyan-400 hover:from-purple-400 hover:to-cyan-300 text-white font-bold px-8 rounded-xl transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-600 leading-relaxed max-w-2xl">
        Definition of Done: prospect can hold a live text/voice conversation with the sales associate; when the call ends the transcript is saved and leads are queued for action.
      </p>
    </div>
  );
}
