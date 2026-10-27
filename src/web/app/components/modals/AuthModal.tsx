import React, { useState } from 'react';
import { IconLock, IconUser, IconClose, IconCheck } from '../Icons.js';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: { id: string; username: string }) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setError('请输入用户名');
      return;
    }
    if (password.length < 6) {
      setError('密码长度不能少于 6 个字符');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUsername, password }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || '请求失败，请检查网络或凭据');
      }

      const payload = data.data || data;
      localStorage.setItem('roadmap_auth_token', payload.token);
      onLoginSuccess(payload.user);
      onClose();
    } catch (err: any) {
      setError(err.message || '操作发生异常');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-800 gold-border-hover animate-slideUp">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/10">
              <IconLock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-zinc-100 tracking-tight">
                {mode === 'login' ? '账号鉴权登录' : '注册专属空间'}
              </h2>
              <p className="text-[11px] text-zinc-400 font-medium mt-0.5">
                {mode === 'login' ? '登录以加载个人专属技能树与加密资料库' : '注册即刻享有物理级隔离的成长空间'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors active:scale-95"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border border-zinc-800 bg-zinc-950 p-1 mx-6 mt-6 rounded-xl">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all active:scale-95 ${
              mode === 'login'
                ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-zinc-950 font-black shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            账号登录
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all active:scale-95 ${
              mode === 'register'
                ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-zinc-950 font-black shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            新用户注册
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <IconUser className="w-3.5 h-3.5 text-amber-400" />
              <span>用户名</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名（如 mom, 4nubisr00t）"
              autoFocus
              className="w-full px-3.5 py-2.5 text-xs bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-zinc-100 placeholder-zinc-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <IconLock className="w-3.5 h-3.5 text-amber-400" />
              <span>安全密码</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位安全密码"
              className="w-full px-3.5 py-2.5 text-xs bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-zinc-100 placeholder-zinc-500 font-medium"
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <IconCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>确认安全密码</span>
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入以确认密码"
                className="w-full px-3.5 py-2.5 text-xs bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-zinc-100 placeholder-zinc-500 font-medium"
              />
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-zinc-950 font-black text-xs rounded-xl hover:from-amber-400 hover:to-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  <span>正在安全校验...</span>
                </>
              ) : (
                <span>{mode === 'login' ? '立即登录' : '立即注册并登入'}</span>
              )}
            </button>
          </div>
        </form>

        {/* Footer tip */}
        <div className="px-6 py-3.5 bg-zinc-950/80 border-t border-zinc-800 text-[11px] text-zinc-500 text-center flex items-center justify-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50" />
          <span>游客模式下仍可完整研读公共基准课程与实验讲义</span>
        </div>
      </div>
    </div>
  );
};
