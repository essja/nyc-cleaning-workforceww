import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Lock, Mail, User, Eye, EyeOff, Smartphone } from 'lucide-react';

interface EmployeeLoginPageProps {
  onSuccess: () => void;
}

export const EmployeeLoginPage: React.FC<EmployeeLoginPageProps> = ({ onSuccess }) => {
  const { loginEmployee } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await loginEmployee(email, password);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Invalid employee email or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 text-slate-100">
      <div className="max-w-md w-full space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center font-black text-white text-2xl mx-auto shadow-xl shadow-emerald-500/25">
            NYC
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">NYC Cleaning & Maintenance</h1>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <User className="w-3.5 h-3.5" />
            <span>Employee & Cleaner Portal</span>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-slate-950/90 backdrop-blur border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="text-base font-bold text-white">Staff Sign In</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Sign in with your assigned staff credentials to clock in, view shifts, and check your hours.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-xs text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 font-semibold mb-1.5">Staff Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="email"
                  spellCheck={false}
                  placeholder="cleaner@nyccleaning.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3 py-3 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-slate-400 font-semibold">Password</label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showPassword ? 'Hide Password' : 'Show Password'}</span>
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="current-password"
                  spellCheck={false}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-10 py-3 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/25 transition disabled:opacity-50 mt-2 text-sm flex items-center justify-center gap-2"
            >
              <Smartphone className="w-4 h-4" />
              <span>{isLoading ? 'Verifying Staff Access...' : 'Sign In to Cleaner Portal'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
