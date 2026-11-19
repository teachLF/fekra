import React, { useState } from 'react';
import { Lock, User as UserIcon, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { apiFetch, setStoredToken } from '../lib/api';
import type { User } from '../types';

export interface PublicBranding {
  site_name: string;
  logo_url: string;
  primary_color: string;
  accent_color: string;
  login_title: string;
  login_subtitle: string;
  footer_text: string;
}

interface LoginViewProps {
  branding: PublicBranding;
  onLoginSuccess: (user: User) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ branding, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      setStoredToken(data.token);
      onLoginSuccess(data.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const primary = branding.primary_color || '#0F2A4A';
  const accent = branding.accent_color || '#B4832E';

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row">
      {/* Form Column */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-10 lg:p-14 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center shrink-0">
            <img
              src={branding.logo_url || '/src/assets/images/site_logo_emblem_1795021613540.jpg'}
              alt={branding.site_name}
              draggable={false}
              referrerPolicy="no-referrer"
              className="protected-media w-9 h-9 object-contain"
            />
          </div>
          <span className="text-lg font-bold text-slate-900">{branding.site_name}</span>
        </div>

        <div className="w-full max-w-md mx-auto my-12">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2 text-balance">
            {branding.login_title || 'تسجيل الدخول إلى المنصة'}
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed mb-8">
            {branding.login_subtitle || 'أدخل الاسم وكلمة السر المرسلة لك من إدارة المنصة'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-username" className="block text-sm font-semibold text-slate-800 mb-2">
                الاسم (اسم الدخول)
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  dir="ltr"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="أدخل اسم المستخدم"
                  className="w-full pr-10 pl-4 py-3 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-900 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2A4A]/20 focus:border-[#0F2A4A] transition-colors text-right"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-semibold text-slate-800 mb-2">
                كلمة السر
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pr-10 pl-11 py-3 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-900 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2A4A]/20 focus:border-[#0F2A4A] transition-colors text-right"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ backgroundColor: primary }}
              className="w-full py-3.5 px-5 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60 transition-opacity cursor-pointer"
            >
              <span>{loading ? 'جاري التحقق...' : 'دخول إلى المنصة'}</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </form>

          <p className="mt-6 text-xs text-slate-500 leading-relaxed">
            الحسابات تُنشأ وتُوزّع حصرياً عبر إدارة المنصة حسب الصف الدراسي لكل طالب.
          </p>
        </div>

        <p className="text-xs text-slate-400">{branding.footer_text}</p>
      </div>

      {/* Editorial Visual Panel */}
      <div
        onContextMenu={(e) => e.preventDefault()}
        className="hidden lg:flex lg:w-[50%] relative overflow-hidden bg-slate-900 select-none"
      >
        <img
          src="/src/assets/images/hero_banner_academy_1795021611755.jpg"
          alt="بيئة تعليمية محمية"
          draggable={false}
          referrerPolicy="no-referrer"
          className="protected-media w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, ${primary}40 0%, #091526E6 100%)`,
          }}
        />
        <div className="relative z-10 mt-auto p-12 text-white max-w-xl">
          <div
            className="w-12 h-1 rounded-full mb-5"
            style={{ backgroundColor: accent }}
          />
          <h2 className="text-3xl font-bold leading-snug mb-3 text-balance">
            تعليم منظم، محمي، ومخصص لكل صف دراسي
          </h2>
          <p className="text-sm text-slate-200 leading-relaxed">
            فيديوهات تعليمية واضحة، ملفات PDF تفاعلية، اختبارات كويز فورية، ولوحة شرف تحفّز الطلاب على التفوق المستمر.
          </p>
        </div>
      </div>
    </div>
  );
};
