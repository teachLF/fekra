import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiFetch, setStoredToken } from './lib/api';
import type { Grade, HeroSlide, SiteSettings, User } from './types';
import { LoginView, type PublicBranding } from './components/LoginView';
import { StudentDashboard } from './components/StudentDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { ContentShield } from './components/ContentShield';

interface BootstrapPayload {
  user: User;
  settings: SiteSettings;
  grades: Grade[];
  myGrade: Grade | null;
  heroSlides: HeroSlide[];
}

const DEFAULT_BRANDING: PublicBranding = {
  site_name: 'منصة فكرة التعليمية',
  logo_url: '/src/assets/images/site_logo_emblem_1795021613540.jpg',
  primary_color: '#0F2A4A',
  accent_color: '#B4832E',
  login_title: 'تسجيل الدخول إلى المنصة',
  login_subtitle: 'أدخل الاسم وكلمة السر المرسلة لك من إدارة المنصة',
  footer_text: 'جميع الحقوق محفوظة لمنصة فكرة التعليمية — بيئة تعليمية محمية',
};

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [branding, setBranding] = useState<PublicBranding>(DEFAULT_BRANDING);
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);

  const loadBootstrap = useCallback(async () => {
    try {
      const data = await apiFetch<BootstrapPayload>('/api/bootstrap');
      setBootstrap(data);
      document.title = data.settings.site_name;
    } catch {
      setBootstrap(null);
      setStoredToken(null);
      try {
        const pub = await apiFetch<PublicBranding>('/api/public/branding');
        setBranding(pub);
        document.title = pub.site_name;
      } catch {
        // fallback to default branding
      }
    } finally {
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setStoredToken(null);
    setBootstrap(null);
    setInitializing(true);
    await loadBootstrap();
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center gap-3 text-slate-600">
        <Loader2 className="w-8 h-8 animate-spin text-[#0F2A4A]" />
        <span className="text-sm font-medium">جاري تحميل المنصة...</span>
      </div>
    );
  }

  if (!bootstrap) {
    return (
      <ContentShield
        enabled={true}
        strictCaptureGuard={false}
        message="لا يمكنك اخذ المحتوى"
      >
        <LoginView
          branding={branding}
          onLoginSuccess={() => {
            setInitializing(true);
            loadBootstrap();
          }}
        />
      </ContentShield>
    );
  }

  const { user, settings, grades, myGrade, heroSlides } = bootstrap;
  const isStudent = user.role === 'student';

  return (
    <ContentShield
      enabled={settings.anti_capture_enabled === 1}
      strictCaptureGuard={isStudent}
      message={settings.protection_message || 'لا يمكنك اخذ المحتوى'}
      studentWatermark={isStudent ? `${user.full_name} · ${user.username}` : undefined}
    >
      {isStudent ? (
        <StudentDashboard
          user={user}
          settings={settings}
          myGrade={myGrade}
          heroSlides={heroSlides}
          onLogout={handleLogout}
          onRefreshUser={loadBootstrap}
        />
      ) : (
        <AdminDashboard
          user={user}
          settings={settings}
          grades={grades}
          heroSlides={heroSlides}
          onLogout={handleLogout}
          onRefreshBootstrap={loadBootstrap}
        />
      )}
    </ContentShield>
  );
}
