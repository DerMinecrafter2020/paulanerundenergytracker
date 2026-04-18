import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Minimize2, Maximize2, MessageSquare, GripHorizontal } from 'lucide-react';
import { sendAiChat } from '../services/aiApi';

const DAILY_LIMIT = 400;

// Hilfsfunktion: Markdown ** zu HTML <strong> konvertieren
const parseMarkdown = (text) => {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/_(.*?)_/g, '<em>$1</em>');
};

const AIAssistant = ({ totalCaffeineToday = 0 }) => {
  const [open, setOpen]       = useState(false);
  const [minimized, setMin]   = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hallo! Ich bin dein Koffein-Assistent. Stell mir Fragen zu Koffein, Schlaf oder Energie – oder frag mich, wie viel du heute noch trinken kannst.' },
  ]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [width, setWidth]     = useState(384); // w-96 = 384px
  const [height, setHeight]   = useState(480);
  const [isResizing, setIsResizing] = useState(null);
  const bottomRef             = useRef(null);
  const containerRef          = useRef(null);

  useEffect(() => {
    if (open && !minimized) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open, minimized]);

  // Resize Handling
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      if (isResizing === 'se') { // South-East
        const newWidth = Math.max(320, e.clientX - containerRef.current?.getBoundingClientRect().left);
        const newHeight = Math.max(300, e.clientY - containerRef.current?.getBoundingClientRect().top);
        setWidth(newWidth);
        setHeight(newHeight);
      } else if (isResizing === 's') { // South
        const newHeight = Math.max(300, e.clientY - containerRef.current?.getBoundingClientRect().top);
        setHeight(newHeight);
      } else if (isResizing === 'e') { // East
        const newWidth = Math.max(320, e.clientX - containerRef.current?.getBoundingClientRect().left);
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => setIsResizing(null);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setError('');

    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages.filter((m) => m.role !== 'assistant' || messages.indexOf(m) > 0), userMsg];
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      // Only send user/assistant messages (not system) to API
      const history = [...messages.slice(1), userMsg].map(({ role, content }) => ({ role, content }));
      const reply = await sendAiChat({
        messages: history,
        totalCaffeineToday,
        dailyLimit: DAILY_LIMIT,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 shadow-lg hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
        title="AI-Assistent öffnen"
      >
        <Bot className="w-7 h-7 text-white" />
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl shadow-2xl overflow-hidden transition-all duration-200 ${minimized ? 'cursor-auto' : 'cursor-auto'}`}
      style={{
        width: minimized ? 288 : `${width}px`,
        height: minimized ? 56 : `${height}px`,
        background: 'linear-gradient(160deg, rgba(30,22,50,0.98), rgba(15,10,30,0.98))',
        border: '1px solid rgba(139,92,246,0.3)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-700/80 to-purple-700/60 shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-violet-200" />
          <span className="text-sm font-semibold text-white">Koffein-Assistent</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMin((v) => !v)} className="p-1 rounded hover:bg-white/10 text-violet-300">
            {minimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </button>
          <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/10 text-violet-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
                  ${msg.role === 'user'
                    ? 'bg-violet-600 text-white rounded-br-sm'
                    : 'bg-white/8 text-slate-200 rounded-bl-sm border border-white/10'}`}
                >
                  {msg.role === 'assistant' ? (
                    <div dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.content) }} />
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/8 border border-white/10 px-4 py-2 rounded-2xl rounded-bl-sm">
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
            {error && (
              <p className="text-xs text-red-400 text-center px-2">{error}</p>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-white/10 shrink-0">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Frage stellen... (Enter zum Senden)"
                rows={1}
                className="flex-1 bg-white/5 border border-white/10 text-slate-200 placeholder-slate-600 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-violet-500/50 transition-colors"
                style={{ maxHeight: '80px' }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Resize Handles */}
      {!minimized && (
        <>
          {/* South-East corner */}
          <div
            onMouseDown={() => setIsResizing('se')}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize hover:bg-violet-500/20 rounded-tl"
            style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(139,92,246,0.4) 50%)' }}
          />
          {/* South edge */}
          <div
            onMouseDown={() => setIsResizing('s')}
            className="absolute bottom-0 left-0 right-0 h-1 cursor-s-resize hover:bg-violet-500/30"
            style={{ background: 'linear-gradient(180deg, transparent 50%, rgba(139,92,246,0.2) 50%)' }}
          />
          {/* East edge */}
          <div
            onMouseDown={() => setIsResizing('e')}
            className="absolute top-0 bottom-0 right-0 w-1 cursor-e-resize hover:bg-violet-500/30"
            style={{ background: 'linear-gradient(90deg, transparent 50%, rgba(139,92,246,0.2) 50%)' }}
          />
        </>
      )}
    </div>
  );
};

export default AIAssistant;
