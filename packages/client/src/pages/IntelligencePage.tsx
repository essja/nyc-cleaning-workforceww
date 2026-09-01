import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Brain, Send, Sparkles, AlertTriangle, Building2,
  Clock, TrendingUp, HelpCircle
} from 'lucide-react';

export const IntelligencePage: React.FC = () => {
  const { organization } = useAuth();
  const [insights, setInsights] = useState<any[]>([]);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Array<{ sender: 'USER' | 'AI'; text: string }>>([
    { sender: 'AI', text: 'Hello Marcus. I am your Workforce Intelligence Assistant. You can ask me questions about understaffed buildings today, repeated tardiness, overtime hotspots, or operational summaries.' }
  ]);
  const [isAsking, setIsAsking] = useState(false);

  const fetchInsights = async () => {
    try {
      const res = await api.get('/ai/insights');
      setInsights(res.insights || []);
    } catch (err) {}
  };

  useEffect(() => {
    fetchInsights();
  }, [organization?.id]);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    const userQ = question;
    setQuestion('');
    setMessages((prev) => [...prev, { sender: 'USER', text: userQ }]);
    setIsAsking(true);

    try {
      const res = await api.post('/ai/ask', { question: userQ });
      setMessages((prev) => [...prev, { sender: 'AI', text: res.answer }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { sender: 'AI', text: `Inquiry failed: ${err.message}` }]);
    } finally {
      setIsAsking(false);
    }
  };

  const sampleQuestions = [
    'Which buildings are understaffed today?',
    'Which employees have repeated late arrivals?',
    'Which locations have the highest overtime hours?'
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Brain className="w-6 h-6 text-indigo-400" />
            Workforce Intelligence & Anomaly Engine
          </h1>
          <p className="text-sm text-slate-400">Explainable operational insights and management assistant.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Active Insights Feed */}
        <div className="lg:col-span-6 space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Automated Operational Insights</h3>
          {insights.length === 0 ? (
            <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 text-center text-slate-500 text-xs">
              No critical workforce anomalies detected across active facilities.
            </div>
          ) : (
            insights.map((item, idx) => (
              <div key={idx} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    {item.title}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                    item.severity === 'HIGH' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    {item.severity} SEVERITY
                  </span>
                </div>
                <p className="text-slate-300">{item.description}</p>
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-indigo-300">
                  <strong>Recommendation:</strong> {item.recommendation}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right: Operational Assistant Chat */}
        <div className="lg:col-span-6 p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col h-[520px]">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Operations Q&A Assistant
            </h3>
            <span className="text-[10px] text-slate-500">Grounded strictly on live database facts</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`p-3 rounded-2xl max-w-[85%] ${
                  m.sender === 'USER'
                    ? 'ml-auto bg-blue-600 text-white rounded-br-none'
                    : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none whitespace-pre-line'
                }`}
              >
                {m.text}
              </div>
            ))}
            {isAsking && (
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 text-xs w-24 flex items-center gap-1.5 animate-pulse">
                Thinking...
              </div>
            )}
          </div>

          {/* Quick Prompts */}
          <div className="flex flex-wrap gap-1.5 py-2 border-t border-slate-800/80">
            {sampleQuestions.map((sq, i) => (
              <button
                key={i}
                onClick={() => setQuestion(sq)}
                className="text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-800 transition"
              >
                {sq}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form onSubmit={handleAsk} className="flex gap-2 pt-2">
            <input
              type="text"
              placeholder="Ask an operational question..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={isAsking || !question.trim()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
