import { useEffect, useRef, useState } from 'react';
import { Phone, MessageSquare, ArrowRight, Send } from 'lucide-react';
import {
  ApiError,
  API_BASE,
  fetchSalesAssociateConfig,
  mintSalesAssociateToken,
  saveSalesConversation,
  sendSalesChatMessage,
  sendOutreachSms,
  sendOutreachCall,
  type SalesAssociateConfig,
  type SalesConversationTurn,
} from '../lib/api';

const REALTIME_SAMPLE_RATE = 24000;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streamKey?: string;
}

type CallStatus = 'checking' | 'idle' | 'connecting' | 'live' | 'error';

function floatToPcm16Base64(float32: Float32Array): string {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(out.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function downsample(float32: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate >= inRate) return float32;
  const ratio = inRate / outRate;
  const outLength = Math.floor(float32.length / ratio);
  const result = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) result[i] = float32[Math.floor(i * ratio)];
  return result;
}

// Bare 10-digit input is assumed US (+1); anything already '+'-prefixed
// passes through digit-cleaned. Mirrors the server's own toE164() so the
// dial tool can disable itself before ever hitting the network.
function toE164(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('+')) {
    const digits = value.slice(1).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : '';
  }
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
}

export default function SalesAssociateView({ onSwitch }: { onSwitch: () => void }) {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [config, setConfig] = useState<SalesAssociateConfig | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [status, setStatus] = useState<CallStatus>('checking');
  const [statusText, setStatusText] = useState('Checking availability…');
  const [banner, setBanner] = useState<{ text: string; ok: boolean } | null>(null);
  const [recording, setRecording] = useState(false);
  const [saveInfo, setSaveInfo] = useState<string | null>(null);

  const [dialNumber, setDialNumber] = useState('');
  const [dialSending, setDialSending] = useState<'sms' | 'call' | null>(null);
  const [dialMessage, setDialMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const configRef = useRef<SalesAssociateConfig | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const connectingRef = useRef(false);
  const awaitingResponseRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const turnKeysRef = useRef<Record<string, string>>({});
  const micStreamRef = useRef<MediaStream | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const micNodeRef = useRef<ScriptProcessorNode | null>(null);
  const recordingRef = useRef(false);
  const playContextRef = useRef<AudioContext | null>(null);
  const playCursorRef = useRef(0);
  const callStartedAtRef = useRef<string | null>(null);
  const conversationSavedRef = useRef(false);
  const savingRef = useRef(false);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // ---- transcript bookkeeping (shared by text chat + voice call) ---------
  function addMessage(role: ChatMessage['role'], streamKey: string | undefined, initialText: string): ChatMessage {
    const msg: ChatMessage = { id: crypto.randomUUID(), role, text: initialText, streamKey };
    messagesRef.current = [...messagesRef.current, msg];
    setMessages(messagesRef.current);
    return msg;
  }

  function appendDelta(role: ChatMessage['role'], streamKey: string, delta: string) {
    const existingId = turnKeysRef.current[streamKey];
    if (existingId) {
      messagesRef.current = messagesRef.current.map((m) => (m.id === existingId ? { ...m, text: m.text + delta } : m));
      setMessages(messagesRef.current);
      return;
    }
    const msg = addMessage(role, streamKey, delta);
    turnKeysRef.current[streamKey] = msg.id;
  }

  function collectConversationTurns(): SalesConversationTurn[] {
    return messagesRef.current
      .filter((m) => m.text.trim())
      .map((m) => ({ role: m.role, content: m.text.trim() }));
  }

  async function saveConversationNow(reason: string) {
    const turns = collectConversationTurns();
    if (!turns.length || savingRef.current || conversationSavedRef.current) return;
    savingRef.current = true;
    try {
      const cfg = configRef.current;
      const saved = await saveSalesConversation({
        turns,
        channel: 'web_realtime',
        reason,
        started_at: callStartedAtRef.current,
        ended_at: new Date().toISOString(),
        agent_id: cfg?.agentId,
        model: cfg?.model,
      });
      conversationSavedRef.current = true;
      const extracted = saved.extracted || {};
      const bits = [...(extracted.emails || []), ...(extracted.phones || []), ...(extracted.websites || []).slice(0, 1)];
      setSaveInfo(
        bits.length
          ? `Saved conversation ${saved.id} · contacts: ${bits.join(', ')}`
          : `Saved conversation ${saved.id} (${turns.length} turns). Review the inbox for details.`
      );
    } catch (err) {
      setSaveInfo(`Could not save conversation: ${err instanceof ApiError ? err.message : String(err)}`);
    } finally {
      savingRef.current = false;
    }
  }

  // ---- text chat: POST /api/sales/chat (OpenRouter, no realtime session) --
  async function handleSendText() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setChatError(null);
    addMessage('user', undefined, text);
    setSending(true);
    try {
      const history = messagesRef.current
        .filter((m) => m.text.trim())
        .map((m) => ({ role: m.role, content: m.text.trim() }));
      const { reply } = await sendSalesChatMessage(sessionId, history);
      addMessage('assistant', undefined, reply);
    } catch (err) {
      setChatError(err instanceof ApiError ? err.message : 'Could not reach the sales associate. Please try again.');
    } finally {
      setSending(false);
    }
  }

  // ---- realtime audio playback (PCM16 @ 24kHz) ---------------------------
  function playbackContext(): AudioContext {
    if (!playContextRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      playContextRef.current = new Ctx({ sampleRate: REALTIME_SAMPLE_RATE });
      playCursorRef.current = 0;
    }
    return playContextRef.current;
  }

  function enqueueAudio(base64: string) {
    try {
      const ctx = playbackContext();
      const bytes = atob(base64);
      const len = bytes.length >> 1;
      const buffer = ctx.createBuffer(1, len, REALTIME_SAMPLE_RATE);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const lo = bytes.charCodeAt(i * 2);
        const hi = bytes.charCodeAt(i * 2 + 1);
        let sample = (hi << 8) | lo;
        if (sample >= 0x8000) sample -= 0x10000;
        channel[i] = sample / 0x8000;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      const now = ctx.currentTime;
      const startAt = Math.max(now, playCursorRef.current);
      src.start(startAt);
      playCursorRef.current = startAt + buffer.duration;
    } catch (err) {
      console.error('audio playback error', err);
    }
  }

  // ---- microphone capture (downsample to PCM16 24kHz) --------------------
  async function startMic() {
    if (micStreamRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    micStreamRef.current = stream;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    micContextRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    micNodeRef.current = processor;
    processor.onaudioprocess = (event) => {
      if (!recordingRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      const down = downsample(input, ctx.sampleRate, REALTIME_SAMPLE_RATE);
      const audio = floatToPcm16Base64(down);
      if (audio) sendEvent({ type: 'input_audio_buffer.append', audio });
    };
    source.connect(processor);
    processor.connect(ctx.destination);
  }

  function stopMic() {
    recordingRef.current = false;
    setRecording(false);
    if (micNodeRef.current) {
      try {
        micNodeRef.current.disconnect();
      } catch {
        /* already disconnected */
      }
      micNodeRef.current = null;
    }
    if (micContextRef.current) {
      try {
        micContextRef.current.close();
      } catch {
        /* already closed */
      }
      micContextRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }

  // ---- voice call: xAI Grok Voice realtime WebSocket ------------------------
  function sendEvent(payload: unknown) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }

  function handleEvent(event: { type?: string; [key: string]: unknown }) {
    const type = event.type || '';
    if (type.indexOf('response.') === 0 || type.indexOf('transcript') !== -1) setBanner(null);

    if (/^response\.(output_audio_transcript|audio_transcript|output_text|text)\.delta$/.test(type)) {
      const key = 'resp:' + String(event.response_id || event.item_id || 'live');
      appendDelta('assistant', key, String(event.delta || ''));
      return;
    }
    if (/^response\.(output_audio|audio)\.delta$/.test(type)) {
      if (event.delta) enqueueAudio(String(event.delta));
      return;
    }

    switch (type) {
      case 'response.created':
        awaitingResponseRef.current = true;
        setStatus('live');
        setStatusText('Sales associate is responding…');
        break;
      case 'conversation.item.input_audio_transcription.delta': {
        const key = 'user:' + String(event.item_id || 'live');
        appendDelta('user', key, String(event.delta || ''));
        break;
      }
      case 'response.done':
      case 'response.completed':
        awaitingResponseRef.current = false;
        setStatus('live');
        setStatusText('Connected — your turn.');
        break;
      case 'error': {
        const err = (event.error as { message?: string; code?: string }) || {};
        const msg = err.message || err.code || 'Realtime error.';
        console.error('[sales-associate] realtime error', event);
        const benign = /session|turn_detection|unknown|unsupported|not\s+allowed|read[-\s]?only/i.test(String(msg));
        if (!benign) setBanner({ text: `⚠️ ${msg}`, ok: false });
        break;
      }
      default:
        break;
    }
  }

  async function startCall() {
    if (connectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) return;
    connectingRef.current = true;
    setBanner(null);
    setStatus('connecting');
    setStatusText('Connecting…');
    try {
      const tokenJson = await mintSalesAssociateToken();
      const cfg = configRef.current;
      const proto = (tokenJson.wsProtocolPrefix || 'xai-client-secret.') + tokenJson.token.value;
      const realtimeUrl = tokenJson.realtimeUrl || cfg?.realtimeUrl || '';
      const agentId = tokenJson.agentId || cfg?.agentId || '';
      const wsUrl = `${realtimeUrl}?agent_id=${encodeURIComponent(agentId)}`;
      const ws = new WebSocket(wsUrl, [proto]);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        connectingRef.current = false;
        awaitingResponseRef.current = false;
        // Only reset streaming-turn bookkeeping, not the transcript itself —
        // prior text-chat turns (a separate backend session) stay visible.
        turnKeysRef.current = {};
        callStartedAtRef.current = new Date().toISOString();
        conversationSavedRef.current = false;
        setSaveInfo(null);
        setBanner(null);
        setStatus('live');
        setStatusText('Connected — say hi.');
      });

      ws.addEventListener('message', (evt) => {
        let parsed: { type?: string; [key: string]: unknown } | null = null;
        try {
          parsed = JSON.parse(evt.data);
        } catch {
          return;
        }
        if (parsed) handleEvent(parsed);
      });

      ws.addEventListener('error', () => {
        setBanner({ text: '⚠️ Connection error talking to the sales associate.', ok: false });
      });

      ws.addEventListener('close', () => {
        const wasConnecting = connectingRef.current;
        connectingRef.current = false;
        stopMic();
        wsRef.current = null;
        const ready = configRef.current?.ready;
        setStatus(ready ? 'idle' : 'error');
        setStatusText(ready ? 'Call ended. Ready to reconnect.' : 'Sales associate offline.');
        if (wasConnecting) {
          setBanner({ text: '⚠️ Could not connect. Please try again.', ok: false });
        } else {
          saveConversationNow('socket_close');
        }
      });
    } catch (err) {
      connectingRef.current = false;
      setStatus('error');
      setStatusText('Could not connect.');
      setBanner({
        text: `⚠️ ${err instanceof ApiError ? err.message : 'Failed to start the voice call.'}`,
        ok: false,
      });
    }
  }

  function endCall() {
    stopMic();
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        /* already closing */
      }
    } else {
      saveConversationNow('end_call');
    }
  }

  async function beginTalk() {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    try {
      if (playContextRef.current?.state === 'suspended') playContextRef.current.resume();
      await startMic();
      recordingRef.current = true;
      setRecording(true);
      setStatus('live');
      setStatusText('Listening…');
    } catch (err) {
      setBanner({
        text: `⚠️ Microphone unavailable: ${err instanceof Error ? err.message : 'permission denied'}`,
        ok: false,
      });
    }
  }

  function endTalk() {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    sendEvent({ type: 'input_audio_buffer.commit' });
    if (!awaitingResponseRef.current) {
      awaitingResponseRef.current = true;
      sendEvent({ type: 'response.create' });
    }
    setStatus('live');
    setStatusText('Sales associate is responding…');
  }

  // ---- "Text or call any number" outreach tool (Twilio, server-side) ------
  const dialE164 = toE164(dialNumber);

  async function handleDialSend(kind: 'sms' | 'call') {
    if (!dialE164 || dialSending) return;
    setDialSending(kind);
    setDialMessage(null);
    const idempotencyKey = crypto.randomUUID();
    try {
      if (kind === 'sms') {
        await sendOutreachSms(dialE164, 'Hi — this is the ClawAgent sales team. Reach out any time!', idempotencyKey);
        setDialMessage({ text: `Text sent to ${dialE164}.`, ok: true });
      } else {
        await sendOutreachCall(dialE164, idempotencyKey);
        setDialMessage({ text: `Calling ${dialE164}…`, ok: true });
      }
    } catch (err) {
      setDialMessage({
        text: err instanceof ApiError ? err.message : `Could not ${kind === 'sms' ? 'text' : 'call'} that number.`,
        ok: false,
      });
    } finally {
      setDialSending(null);
    }
  }

  // ---- lifecycle -----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchSalesAssociateConfig();
        if (cancelled) return;
        setConfig(cfg);
        if (!cfg.enabled) {
          setStatus('error');
          setStatusText('Voice call is disabled.');
          setBanner({ text: 'The voice call feature is currently turned off. Text chat still works.', ok: false });
        } else if (!cfg.ready) {
          setStatus('error');
          setStatusText('Voice call not configured.');
          setBanner({ text: 'Voice call is not configured on this deployment yet. Text chat still works.', ok: false });
        } else {
          setStatus('idle');
          setStatusText('Sales associate online. Type a message or start a voice call.');
        }
      } catch {
        if (cancelled) return;
        setStatus('error');
        setStatusText('Could not reach the server.');
        setBanner({ text: '⚠️ Could not reach the server. Is it running?', ok: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const flushOnLeave = () => {
      if (collectConversationTurns().length) saveConversationNow('pagehide');
    };
    window.addEventListener('beforeunload', flushOnLeave);
    window.addEventListener('pagehide', flushOnLeave);
    return () => {
      window.removeEventListener('beforeunload', flushOnLeave);
      window.removeEventListener('pagehide', flushOnLeave);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* already closing */
        }
      }
      stopMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const callActive = status === 'live';
  const textInputId = 'sales-associate-text-input';
  const canSendText = Boolean(input.trim()) && !sending;
  const dotClass =
    status === 'live'
      ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.6)] animate-pulse'
      : status === 'connecting'
        ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)] animate-pulse'
        : status === 'error'
          ? 'bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.5)]'
          : status === 'idle'
            ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]'
            : 'bg-slate-500';

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
            <div className={`w-3 h-3 rounded-full ${dotClass}`}></div>
            <span className="text-sm font-medium text-slate-300">{statusText}</span>
          </div>

          {config?.phoneNumberDisplay && config?.phoneHref && (
            <div className="bg-[#1A1423] border border-purple-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
              <Phone className="w-5 h-5 text-slate-400" />
              <span className="text-slate-300">Prefer the phone? Call</span>
              <a href={config.phoneHref} className="text-cyan-400 font-medium hover:underline">
                {config.phoneNumberDisplay}
              </a>
            </div>
          )}

          <div className="border border-slate-800 rounded-xl p-5 mb-6 bg-[#0E121E]">
            <div className="text-sm font-medium text-slate-400 mb-3">Text or call any number</div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="(555) 123-4567"
                value={dialNumber}
                onChange={(e) => setDialNumber(e.target.value)}
                className="flex-1 bg-[#0A0D14] border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleDialSend('sms')}
                  disabled={!dialE164 || dialSending !== null}
                  className="flex-1 sm:flex-none flex justify-center items-center gap-2 bg-[#1A2133] hover:bg-[#232D45] text-slate-300 px-6 py-3 rounded-lg font-medium transition-colors border border-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <MessageSquare className="w-4 h-4" />
                  {dialSending === 'sms' ? 'Sending…' : 'Text'}
                </button>
                <button
                  onClick={() => handleDialSend('call')}
                  disabled={!dialE164 || dialSending !== null}
                  className="flex-1 sm:flex-none flex justify-center items-center gap-2 bg-[#1A2133] hover:bg-[#232D45] text-slate-300 px-6 py-3 rounded-lg font-medium transition-colors border border-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Phone className="w-4 h-4" />
                  {dialSending === 'call' ? 'Calling…' : 'Call'}
                </button>
              </div>
            </div>
            <div className={`text-xs mt-3 ${dialMessage ? (dialMessage.ok ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'}`}>
              {dialMessage ? dialMessage.text : 'Enter a phone number, then choose Text or Call.'}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <button
              type="button"
              onClick={startCall}
              disabled={!config?.ready || status === 'connecting' || status === 'live'}
              aria-describedby="sales-associate-voice-status"
              className="min-h-12 px-6 py-3 rounded-lg border border-slate-700 text-slate-300 font-medium hover:bg-slate-800 transition-colors bg-[#0A0D14]/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              Start voice call
            </button>
            <button
              type="button"
              onClick={endCall}
              disabled={!callActive}
              className="min-h-12 px-6 py-3 rounded-lg border border-slate-800 text-slate-500 font-medium bg-[#0A0D14]/30 disabled:cursor-not-allowed enabled:text-slate-300 enabled:border-slate-700 enabled:hover:bg-slate-800 transition-colors"
            >
              End call
            </button>
          </div>

          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              beginTalk();
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
              endTalk();
            }}
            onPointerLeave={endTalk}
            onPointerCancel={endTalk}
            onKeyDown={(e) => {
              if ((e.key === ' ' || e.key === 'Enter') && !recording) {
                e.preventDefault();
                beginTalk();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                endTalk();
              }
            }}
            disabled={!callActive}
            aria-pressed={recording}
            aria-describedby="sales-associate-voice-status"
            className={`w-full min-h-16 touch-none select-none font-semibold py-4 rounded-xl mb-2 transition-all shadow-[0_0_20px_rgba(20,184,166,0.15)] border disabled:opacity-50 disabled:cursor-not-allowed ${
              recording
                ? 'bg-gradient-to-r from-red-600/80 to-orange-500/80 border-red-400/40 text-white'
                : 'bg-gradient-to-r from-teal-700/80 to-cyan-700/80 hover:from-teal-600 hover:to-cyan-600 text-slate-200 border-teal-500/30'
            }`}
          >
            {recording ? 'Release to send' : 'Hold to talk'}
          </button>
          <p id="sales-associate-voice-status" className="mb-6 text-xs text-slate-500">
            Start a voice call first, then press and hold this button. Keyboard users can hold Space or Enter.
          </p>

          <div className="bg-[#0A0D14] border border-purple-500/10 rounded-xl h-48 p-5 mb-4 overflow-y-auto flex flex-col gap-3">
            {messages.length === 0 ? (
              <span className="text-slate-500 italic text-sm">Your conversation will appear here.</span>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
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

          {saveInfo && (
            <div className="text-xs text-slate-500 mb-4 flex flex-wrap gap-2 items-center">
              <span>{saveInfo}</span>
              {config?.inboxPath && (
                <a
                  href={`${API_BASE}${config.inboxPath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 font-medium hover:underline"
                >
                  View saved transcript →
                </a>
              )}
            </div>
          )}

          {banner && (
            <div className={`text-sm mb-4 ${banner.ok ? 'text-emerald-400' : 'text-red-400'}`}>{banner.text}</div>
          )}
          {chatError && <div className="text-sm mb-4 text-red-400">{chatError}</div>}

          <button
            onClick={onSwitch}
            className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-sm font-medium transition-colors mb-4 group"
          >
            Open sales inbox <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>

          <form
            className="flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleSendText();
            }}
          >
            <label htmlFor={textInputId} className="sr-only">
              Text chat message
            </label>
            <input
              id={textInputId}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message to the sales associate..."
              autoComplete="off"
              className="min-h-14 flex-1 bg-[#0A0D14] border border-slate-800 rounded-xl px-4 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!canSendText}
              className="min-h-14 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-cyan-400 hover:from-purple-400 hover:to-cyan-300 text-white font-bold px-8 rounded-xl transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-600 leading-relaxed max-w-2xl">
        Definition of Done: prospect can hold a live text/voice conversation with the sales associate; when the call ends the transcript is saved and leads are queued for action.
      </p>
    </div>
  );
}
