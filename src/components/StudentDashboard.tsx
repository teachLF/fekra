import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PlayCircle,
  FileText,
  ClipboardCheck,
  MessageSquare,
  LogOut,
  Trophy,
  Star,
  Timer,
  Send,
  Search,
  CheckCircle2,
  Bookmark,
  Play,
  Pause,
  RotateCcw,
  Megaphone,
  Save,
} from 'lucide-react';
import type {
  Grade,
  HeroSlide,
  LeaderboardEntry,
  PdfItem,
  Quiz,
  SiteSettings,
  StudentMessage,
  StudentNote,
  User,
  VideoItem,
} from '../types';
import { apiFetch } from '../lib/api';
import { HeroCarousel } from './HeroCarousel';
import { ProtectedVideoPlayer } from './ProtectedVideoPlayer';
import { ProtectedPdfViewer } from './ProtectedPdfViewer';
import { QuizTaker } from './QuizTaker';

type StudentTab = 'home' | 'videos' | 'pdfs' | 'quizzes' | 'messages';

interface StudentDashboardProps {
  user: User;
  settings: SiteSettings;
  myGrade: Grade | null;
  heroSlides: HeroSlide[];
  onLogout: () => void;
  onRefreshUser: () => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  user,
  settings,
  myGrade,
  heroSlides,
  onLogout,
  onRefreshUser,
}) => {
  const [tab, setTab] = useState<StudentTab>('home');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [pdfs, setPdfs] = useState<PdfItem[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [messages, setMessages] = useState<StudentMessage[]>([]);
  const [remainingMsgs, setRemainingMsgs] = useState(3);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [favorites, setFavorites] = useState<Array<{ content_type: string; content_id: number }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<PdfItem | null>(null);
  const [activeQuizId, setActiveQuizId] = useState<number | null>(null);

  // Notes editor state
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSavedToast, setNoteSavedToast] = useState(false);

  // Message form state
  const [msgSubject, setMsgSubject] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [msgSending, setMsgSending] = useState(false);
  const [msgFeedback, setMsgFeedback] = useState<string | null>(null);

  // Pomodoro Focus Timer (Extra legendary study tool)
  const [pomodoroSec, setPomodoroSec] = useState(25 * 60);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);

  const primary = settings.primary_color || '#0F2A4A';
  const accent = settings.accent_color || '#B4832E';
  const watermarkLabel = `${user.full_name} (${user.username})`;

  const loadContent = useCallback(async () => {
    try {
      const [vRes, pRes, qRes, mRes, lRes, nRes, fRes] = await Promise.all([
        apiFetch<{ videos: VideoItem[] }>('/api/videos'),
        apiFetch<{ pdfs: PdfItem[] }>('/api/pdfs'),
        apiFetch<{ quizzes: Quiz[] }>('/api/quizzes'),
        apiFetch<{ messages: StudentMessage[]; remaining_count: number }>('/api/messages'),
        apiFetch<{ entries: LeaderboardEntry[] }>('/api/leaderboard'),
        apiFetch<{ notes: StudentNote[] }>('/api/notes'),
        apiFetch<{ favorites: Array<{ content_type: string; content_id: number }> }>('/api/favorites'),
      ]);
      setVideos(vRes.videos);
      setPdfs(pRes.pdfs);
      setQuizzes(qRes.quizzes);
      setMessages(mRes.messages);
      setRemainingMsgs(mRes.remaining_count);
      setLeaderboard(lRes.entries);
      setNotes(nRes.notes);
      setFavorites(fRes.favorites);
    } catch {
      // handled gracefully
    }
  }, []);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  useEffect(() => {
    if (!pomodoroRunning) return;
    const t = window.setInterval(() => {
      setPomodoroSec((s) => {
        if (s <= 1) {
          setPomodoroRunning(false);
          return 25 * 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [pomodoroRunning]);

  // Sync draft note when selecting video or pdf
  useEffect(() => {
    if (tab === 'videos' && selectedVideo) {
      const found = notes.find((n) => n.content_type === 'video' && n.content_id === selectedVideo.id);
      setNoteDraft(found?.note_text || '');
    } else if (tab === 'pdfs' && selectedPdf) {
      const found = notes.find((n) => n.content_type === 'pdf' && n.content_id === selectedPdf.id);
      setNoteDraft(found?.note_text || '');
    }
  }, [tab, selectedVideo, selectedPdf, notes]);

  const handleVideoWatch = useCallback(
    async (videoId: number) => {
      try {
        await apiFetch(`/api/videos/${videoId}/view`, { method: 'POST' });
        setVideos((prev) =>
          prev.map((v) => (v.id === videoId ? { ...v, watched: true } : v))
        );
        onRefreshUser();
      } catch {
        // ignore
      }
    },
    [onRefreshUser]
  );

  const handlePdfView = useCallback(
    async (pdfId: number) => {
      try {
        await apiFetch(`/api/pdfs/${pdfId}/view`, { method: 'POST' });
        setPdfs((prev) => prev.map((p) => (p.id === pdfId ? { ...p, viewed: true } : p)));
        onRefreshUser();
      } catch {
        // ignore
      }
    },
    [onRefreshUser]
  );

  const toggleFavorite = async (content_type: 'video' | 'pdf' | 'quiz', content_id: number) => {
    try {
      const res = await apiFetch<{ favorited: boolean }>('/api/favorites/toggle', {
        method: 'POST',
        body: JSON.stringify({ content_type, content_id }),
      });
      setFavorites((prev) => {
        if (res.favorited) {
          return [...prev, { content_type, content_id }];
        }
        return prev.filter((f) => !(f.content_type === content_type && f.content_id === content_id));
      });
    } catch {
      // ignore
    }
  };

  const isFav = (type: string, id: number) =>
    favorites.some((f) => f.content_type === type && f.content_id === id);

  const saveNote = async (content_type: 'video' | 'pdf', content_id: number) => {
    try {
      await apiFetch('/api/notes', {
        method: 'POST',
        body: JSON.stringify({ content_type, content_id, note_text: noteDraft }),
      });
      setNotes((prev) => {
        const idx = prev.findIndex((n) => n.content_type === content_type && n.content_id === content_id);
        const updated: StudentNote = {
          id: idx >= 0 ? prev[idx].id : Date.now(),
          content_type,
          content_id,
          note_text: noteDraft,
          updated_at: new Date().toISOString(),
        };
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = updated;
          return copy;
        }
        return [updated, ...prev];
      });
      setNoteSavedToast(true);
      window.setTimeout(() => setNoteSavedToast(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (remainingMsgs <= 0 || msgSending) return;
    setMsgFeedback(null);
    if (!msgSubject.trim() || !msgBody.trim()) {
      setMsgFeedback('يرجى كتابة عنوان الرسالة ومحتواها');
      return;
    }

    setMsgSending(true);
    try {
      await apiFetch('/api/messages', {
        method: 'POST',
        body: JSON.stringify({ subject: msgSubject.trim(), body: msgBody.trim() }),
      });
      setMsgSubject('');
      setMsgBody('');
      setMsgFeedback('تم إرسال رسالتك إلى المشرفين والأدمن بنجاح');
      await loadContent();
    } catch (err) {
      setMsgFeedback((err as Error).message);
    } finally {
      setMsgSending(false);
    }
  };

  const filteredVideos = useMemo(() => {
    return videos.filter((v) => {
      const matchesSearch =
        !searchQuery.trim() ||
        v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFav = !onlyFavorites || isFav('video', v.id);
      return matchesSearch && matchesFav;
    });
  }, [videos, searchQuery, onlyFavorites, favorites]);

  const filteredPdfs = useMemo(() => {
    return pdfs.filter((p) => {
      const matchesSearch =
        !searchQuery.trim() ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFav = !onlyFavorites || isFav('pdf', p.id);
      return matchesSearch && matchesFav;
    });
  }, [pdfs, searchQuery, onlyFavorites, favorites]);

  const filteredQuizzes = useMemo(() => {
    return quizzes.filter((q) => {
      const matchesSearch =
        !searchQuery.trim() ||
        q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFav = !onlyFavorites || isFav('quiz', q.id);
      return matchesSearch && matchesFav;
    });
  }, [quizzes, searchQuery, onlyFavorites, favorites]);

  const navItems: Array<{ id: StudentTab; label: string }> = [
    { id: 'home', label: 'الرئيسية' },
    { id: 'videos', label: 'الفيديوهات' },
    { id: 'pdfs', label: 'ملخصات PDF' },
    { id: 'quizzes', label: 'الكويزات' },
    { id: 'messages', label: 'رسائلي' },
  ];

  const pomoMins = Math.floor(pomodoroSec / 60);
  const pomoSecs = pomodoroSec % 60;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {/* Announcement Strip */}
      {settings.announcement_enabled === 1 && settings.announcement_text && (
        <div
          style={{ backgroundColor: primary }}
          className="text-white text-xs sm:text-sm py-2 px-4 text-center flex items-center justify-center gap-2"
        >
          <Megaphone className="w-4 h-4 shrink-0" style={{ color: accent }} />
          <span className="font-medium truncate">{settings.announcement_text}</span>
        </div>
      )}

      {/* Top Bar (3-zone contract) */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand */}
          <button
            type="button"
            onClick={() => {
              setTab('home');
              setActiveQuizId(null);
            }}
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <img
              src={settings.logo_url || '/src/assets/images/site_logo_emblem_1795021613540.jpg'}
              alt={settings.site_name}
              draggable={false}
              referrerPolicy="no-referrer"
              className="protected-media w-9 h-9 rounded-lg object-contain border border-slate-200 bg-white"
            />
            <span className="text-base sm:text-lg font-bold text-slate-900">
              {settings.site_name}
            </span>
          </button>

          {/* Zone 2: Clean Nav Links */}
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setActiveQuizId(null);
                }}
                className={`text-sm font-medium py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
                  tab === item.id
                    ? 'border-[#0F2A4A] text-[#0F2A4A] font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: User & Logout */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold text-slate-900 whitespace-nowrap">{user.full_name}</p>
              <p className="text-[11px] text-slate-500 whitespace-nowrap">
                {myGrade?.name || user.grade_name || 'طالب'} ·{' '}
                <span className="font-mono tabular-nums">{user.points} نقطة</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
          </div>
        </div>

        {/* Mobile Nav Strip */}
        <div className="md:hidden border-t border-slate-100 px-3 py-2 flex items-center gap-2 overflow-x-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setActiveQuizId(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                tab === item.id ? 'bg-[#0F2A4A] text-white' : 'text-slate-600 bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
        {tab === 'home' && (
          <>
            {/* Top Rotating Rectangular Carousel Banner */}
            <HeroCarousel
              slides={heroSlides}
              intervalMs={settings.hero_interval_ms}
              accentColor={accent}
              onActionClick={(section) => {
                if (section === 'videos' || section === 'pdfs' || section === 'quizzes') {
                  setTab(section);
                }
              }}
            />

            {/* Grade-Specific Banner */}
            {myGrade && (
              <section
                onContextMenu={(e) => e.preventDefault()}
                className="protected-surface relative rounded-2xl overflow-hidden border border-slate-200 bg-white grid grid-cols-1 lg:grid-cols-12 items-stretch"
              >
                <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center">
                  <p className="text-xs font-semibold text-slate-500 mb-2">
                    صفك الدراسي المخصص · {myGrade.name}
                  </p>
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2 text-balance">
                    {myGrade.banner_title || `مرحباً بك في بوابة ${myGrade.name}`}
                  </h1>
                  <p className="text-sm text-slate-600 leading-relaxed mb-6 max-w-xl">
                    {myGrade.banner_subtitle || settings.welcome_subheading}
                  </p>

                  <div className="grid grid-cols-3 gap-3 max-w-md">
                    <button
                      type="button"
                      onClick={() => setTab('videos')}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-right transition-colors cursor-pointer"
                    >
                      <p className="text-lg font-bold font-mono tabular-nums text-slate-900">
                        {videos.length}
                      </p>
                      <p className="text-xs text-slate-600">فيديو تعليمي</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('pdfs')}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-right transition-colors cursor-pointer"
                    >
                      <p className="text-lg font-bold font-mono tabular-nums text-slate-900">
                        {pdfs.length}
                      </p>
                      <p className="text-xs text-slate-600">ملف PDF</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('quizzes')}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-right transition-colors cursor-pointer"
                    >
                      <p className="text-lg font-bold font-mono tabular-nums text-slate-900">
                        {quizzes.length}
                      </p>
                      <p className="text-xs text-slate-600">كويز متاح</p>
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-5 relative min-h-[200px]">
                  <img
                    src={myGrade.banner_image || '/src/assets/images/grade_banner_default_1795021613504.jpg'}
                    alt={myGrade.name}
                    draggable={false}
                    referrerPolicy="no-referrer"
                    className="protected-media w-full h-full object-cover"
                  />
                </div>
              </section>
            )}

            {/* Quick Content Preview + Legendary Extras (Focus Timer & Honor Roll) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 space-y-6">
                {/* Latest Videos */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-slate-900">أحدث الدروس المرئية</h2>
                    <button
                      type="button"
                      onClick={() => setTab('videos')}
                      className="text-xs font-semibold text-[#0F2A4A] hover:underline cursor-pointer"
                    >
                      عرض الكل
                    </button>
                  </div>
                  {videos.length === 0 ? (
                    <p className="text-sm text-slate-500 py-6 text-center">
                      لا توجد فيديوهات مضافة لصفك الدراسي حتى الآن.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {videos.slice(0, 4).map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setSelectedVideo(v);
                            setTab('videos');
                          }}
                          className="text-right p-4 rounded-xl border border-slate-200 hover:border-[#0F2A4A]/40 hover:bg-slate-50/70 transition-all flex items-start gap-3 cursor-pointer"
                        >
                          <div className="w-10 h-10 rounded-lg bg-[#0F2A4A]/10 text-[#0F2A4A] flex items-center justify-center shrink-0">
                            <PlayCircle className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-900 truncate">{v.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {v.duration_label} · {v.watched ? 'تمت المشاهدة' : 'جديد'}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Latest Quizzes */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-slate-900">الاختبارات المتاحة لصفك</h2>
                    <button
                      type="button"
                      onClick={() => setTab('quizzes')}
                      className="text-xs font-semibold text-[#0F2A4A] hover:underline cursor-pointer"
                    >
                      جميع الكويزات
                    </button>
                  </div>
                  {quizzes.length === 0 ? (
                    <p className="text-sm text-slate-500 py-6 text-center">
                      لا توجد اختبارات كويز منشورة لصفك حالياً.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {quizzes.slice(0, 4).map((q) => (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => {
                            setTab('quizzes');
                            setActiveQuizId(q.id);
                          }}
                          className="text-right p-4 rounded-xl border border-slate-200 hover:border-[#0F2A4A]/40 hover:bg-slate-50/70 transition-all flex items-start justify-between gap-3 cursor-pointer"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{q.title}</p>
                            <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                              {q.question_count || 0} سؤال · {q.time_limit_minutes} دقيقة
                            </p>
                          </div>
                          <ClipboardCheck className="w-5 h-5 text-[#B4832E] shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar Extras: Focus Timer & Honor Roll */}
              <div className="lg:col-span-4 space-y-6">
                {/* Pomodoro Focus Timer */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Timer className="w-4 h-4 text-[#B4832E]" />
                      <span>مؤقت التركيز للمذاكرة</span>
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">
                    خصص 25 دقيقة تركيز متواصل أثناء مشاهدة الدروس وحل الملخصات.
                  </p>
                  <div className="text-center py-4 rounded-xl bg-slate-50 border border-slate-200 mb-4">
                    <span className="text-3xl font-bold font-mono tabular-nums text-slate-900">
                      {String(pomoMins).padStart(2, '0')}:{String(pomoSecs).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPomodoroRunning((r) => !r)}
                      style={{ backgroundColor: primary }}
                      className="flex-1 py-2 px-4 rounded-lg text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {pomodoroRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{pomodoroRunning ? 'إيقاف مؤقت' : 'بدء التركيز'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPomodoroRunning(false);
                        setPomodoroSec(25 * 60);
                      }}
                      className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                      title="إعادة ضبط"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Grade Honor Roll */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
                    <Trophy className="w-4 h-4 text-[#B4832E]" />
                    <span>لوحة الشرف ({myGrade?.name || 'صفك'})</span>
                  </h3>
                  {leaderboard.length === 0 ? (
                    <p className="text-xs text-slate-500">لا توجد نقاط مسجلة بعد.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {leaderboard.slice(0, 5).map((entry, idx) => (
                        <div
                          key={entry.id}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs ${
                            entry.id === user.id
                              ? 'bg-[#0F2A4A]/5 border-[#0F2A4A]/30 font-semibold'
                              : 'bg-slate-50/70 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center font-mono text-[11px] font-bold shrink-0">
                              {idx + 1}
                            </span>
                            <span className="truncate text-slate-900">{entry.full_name}</span>
                          </div>
                          <span className="font-mono tabular-nums font-bold text-[#B4832E] shrink-0">
                            {entry.points} نقطة
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Search & Favorites Toolbar for Content Tabs */}
        {(tab === 'videos' || tab === 'pdfs' || (tab === 'quizzes' && !activeQuizId)) && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث في محتوى صفك الدراسي..."
                className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:outline-none focus:border-[#0F2A4A]"
              />
            </div>
            <button
              type="button"
              onClick={() => setOnlyFavorites((f) => !f)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                onlyFavorites
                  ? 'bg-[#B4832E]/10 border-[#B4832E] text-[#8A611C]'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Bookmark className="w-4 h-4" />
              <span>المفضلة فقط</span>
            </button>
          </div>
        )}

        {/* VIDEOS TAB */}
        {tab === 'videos' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-5">
              {selectedVideo ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">
                        {selectedVideo.grade_name} · {selectedVideo.duration_label}
                      </p>
                      <h2 className="text-xl font-bold text-slate-900">{selectedVideo.title}</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFavorite('video', selectedVideo.id)}
                      className={`p-2 rounded-lg border cursor-pointer ${
                        isFav('video', selectedVideo.id)
                          ? 'bg-amber-50 border-amber-300 text-amber-700'
                          : 'bg-white border-slate-200 text-slate-500'
                      }`}
                      title="إضافة للمفضلة"
                    >
                      <Star className="w-4 h-4" />
                    </button>
                  </div>

                  <ProtectedVideoPlayer
                    video={selectedVideo}
                    watermarkText={watermarkLabel}
                    onWatched={handleVideoWatch}
                  />

                  {selectedVideo.description && (
                    <p className="text-sm text-slate-600 leading-relaxed">{selectedVideo.description}</p>
                  )}

                  {/* Personal Student Notes */}
                  <div className="pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-bold text-slate-800">
                        ملاحظاتي الشخصية على هذا الدرس
                      </label>
                      {noteSavedToast && (
                        <span className="text-xs text-emerald-700 font-semibold">تم حفظ الملاحظة</span>
                      )}
                    </div>
                    <textarea
                      rows={3}
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="اكتب ملخصاً أو نقاطاً مهمة تذكرك بمحتوى الدرس..."
                      className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:outline-none focus:border-[#0F2A4A] mb-2"
                    />
                    <button
                      type="button"
                      onClick={() => saveNote('video', selectedVideo.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F2A4A] text-white text-xs font-semibold cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>حفظ الملاحظة</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <PlayCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-base font-bold text-slate-800 mb-1">اختر فيديو للمشاهدة</h3>
                  <p className="text-xs text-slate-500">
                    جميع الفيديوهات الظاهرة مخصصة لصفك الدراسي ومحمية ضد التحميل أو التصوير.
                  </p>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-800 px-1">
                قائمة دروس {myGrade?.name} ({filteredVideos.length})
              </h3>
              {filteredVideos.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-xs text-slate-500">
                  لا توجد دروس مطابقة لبحثك.
                </div>
              ) : (
                filteredVideos.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVideo(v)}
                    className={`w-full text-right p-4 rounded-xl border transition-all flex items-start gap-3 cursor-pointer ${
                      selectedVideo?.id === v.id
                        ? 'bg-[#0F2A4A]/5 border-[#0F2A4A]'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <PlayCircle className="w-5 h-5 text-[#0F2A4A] shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 truncate">{v.title}</p>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                        <span>{v.duration_label}</span>
                        {v.watched && (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            تمت المشاهدة
                          </span>
                        )}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* PDFs TAB */}
        {tab === 'pdfs' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-5">
              {selectedPdf ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">{selectedPdf.grade_name} · ملف محمي للقراءة</p>
                      <h2 className="text-xl font-bold text-slate-900">{selectedPdf.title}</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFavorite('pdf', selectedPdf.id)}
                      className={`p-2 rounded-lg border cursor-pointer ${
                        isFav('pdf', selectedPdf.id)
                          ? 'bg-amber-50 border-amber-300 text-amber-700'
                          : 'bg-white border-slate-200 text-slate-500'
                      }`}
                    >
                      <Star className="w-4 h-4" />
                    </button>
                  </div>

                  <ProtectedPdfViewer
                    pdf={selectedPdf}
                    watermarkText={watermarkLabel}
                    onViewed={handlePdfView}
                  />

                  <div className="pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-bold text-slate-800">ملاحظاتي على الملخص</label>
                      {noteSavedToast && (
                        <span className="text-xs text-emerald-700 font-semibold">تم الحفظ</span>
                      )}
                    </div>
                    <textarea
                      rows={2}
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="دوّن ملاحظاتك حول هذا الملف..."
                      className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:outline-none focus:border-[#0F2A4A] mb-2"
                    />
                    <button
                      type="button"
                      onClick={() => saveNote('pdf', selectedPdf.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F2A4A] text-white text-xs font-semibold cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>حفظ الملاحظة</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-base font-bold text-slate-800 mb-1">اختر ملف PDF للقراءة</h3>
                  <p className="text-xs text-slate-500">
                    يُعرض الملف مباشرة داخل المنصة بحماية كاملة ودون إمكانية التنزيل.
                  </p>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-800 px-1">
                ملخصات {myGrade?.name} ({filteredPdfs.length})
              </h3>
              {filteredPdfs.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-xs text-slate-500">
                  لا توجد ملفات PDF متاحة حالياً.
                </div>
              ) : (
                filteredPdfs.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPdf(p)}
                    className={`w-full text-right p-4 rounded-xl border transition-all flex items-start gap-3 cursor-pointer ${
                      selectedPdf?.id === p.id
                        ? 'bg-[#0F2A4A]/5 border-[#0F2A4A]'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <FileText className="w-5 h-5 text-[#B4832E] shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 truncate">{p.title}</p>
                      {p.description && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">{p.description}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* QUIZZES TAB */}
        {tab === 'quizzes' && (
          <>
            {activeQuizId ? (
              <QuizTaker
                quizId={activeQuizId}
                studentName={user.full_name}
                siteName={settings.site_name}
                onClose={() => setActiveQuizId(null)}
                onCompleted={() => {
                  loadContent();
                  onRefreshUser();
                }}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredQuizzes.length === 0 ? (
                  <div className="col-span-full bg-white rounded-2xl border border-slate-200 p-12 text-center text-sm text-slate-500">
                    لا توجد اختبارات كويز متاحة لصفك الدراسي حالياً.
                  </div>
                ) : (
                  filteredQuizzes.map((q) => (
                    <div
                      key={q.id}
                      className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-xs text-slate-500">
                            {q.grade_name} · {q.question_count || 0} سؤال · {q.time_limit_minutes} دقيقة
                          </p>
                          <button
                            type="button"
                            onClick={() => toggleFavorite('quiz', q.id)}
                            className={`p-1.5 rounded-lg border cursor-pointer ${
                              isFav('quiz', q.id)
                                ? 'bg-amber-50 border-amber-300 text-amber-700'
                                : 'bg-white border-slate-200 text-slate-400'
                            }`}
                          >
                            <Star className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">{q.title}</h3>
                        {q.description && (
                          <p className="text-xs text-slate-600 leading-relaxed">{q.description}</p>
                        )}
                      </div>

                      <div className="space-y-3 pt-4 border-t border-slate-100">
                        {q.my_best_attempt && (
                          <div className="text-xs flex items-center justify-between text-slate-700">
                            <span>أفضل نتيجة لك:</span>
                            <span className="font-mono tabular-nums font-bold text-emerald-700">
                              {q.my_best_attempt.percentage}% ({q.my_best_attempt.score}/
                              {q.my_best_attempt.total_questions})
                            </span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setActiveQuizId(q.id)}
                          style={{ backgroundColor: primary }}
                          className="w-full py-2.5 px-4 rounded-xl text-white text-xs sm:text-sm font-semibold hover:opacity-95 cursor-pointer"
                        >
                          {q.my_best_attempt ? 'إعادة حل الكويز' : 'ابدأ الكويز الآن'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {/* MESSAGES TAB (MAX 3 MESSAGES LIMIT) */}
        {tab === 'messages' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-[#0F2A4A]" />
                  <span>إرسال رسالة للإدارة والمشرفين</span>
                </h2>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 mb-5 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">الرصيد المتاح للرسائل:</span>
                <span
                  className={`font-mono tabular-nums font-bold ${
                    remainingMsgs === 0 ? 'text-red-600' : 'text-[#0F2A4A]'
                  }`}
                >
                  متبقي {remainingMsgs} من أصل 3 رسائل
                </span>
              </div>

              <form onSubmit={handleSendMessage} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    عنوان الرسالة
                  </label>
                  <input
                    type="text"
                    disabled={remainingMsgs <= 0}
                    value={msgSubject}
                    onChange={(e) => setMsgSubject(e.target.value)}
                    placeholder="مثال: استفسار حول درس الرياضيات"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm disabled:opacity-50 focus:bg-white focus:outline-none focus:border-[#0F2A4A]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    نص الرسالة
                  </label>
                  <textarea
                    rows={4}
                    disabled={remainingMsgs <= 0}
                    value={msgBody}
                    onChange={(e) => setMsgBody(e.target.value)}
                    placeholder="اكتب رسالتك بوضوح للأدمن والمشرفين..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm disabled:opacity-50 focus:bg-white focus:outline-none focus:border-[#0F2A4A]"
                  />
                </div>

                {msgFeedback && (
                  <p className="text-xs font-semibold text-[#0F2A4A] bg-slate-100 p-3 rounded-xl">
                    {msgFeedback}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={remainingMsgs <= 0 || msgSending}
                  style={{ backgroundColor: primary }}
                  className="w-full py-2.5 px-4 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-45 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {remainingMsgs <= 0
                      ? 'تم استهلاك الحد الأقصى (3 رسائل)'
                      : msgSending
                      ? 'جاري الإرسال...'
                      : 'إرسال الرسالة'}
                  </span>
                </button>
              </form>
            </div>

            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-4">سجل رسائلك وردود الإدارة</h3>
              {messages.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  لم تقم بإرسال أي رسائل حتى الآن. يمكنك إرسال حتى 3 رسائل للأدمن والمشرفين.
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((m) => (
                    <div key={m.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-bold text-slate-900">{m.subject}</h4>
                        <span className="text-[11px] font-mono text-slate-500">
                          {new Date(m.created_at).toLocaleDateString('ar-SA')}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">{m.body}</p>
                      {m.reply_body ? (
                        <div className="p-3.5 rounded-xl bg-white border border-emerald-200">
                          <p className="text-xs font-bold text-emerald-800 mb-1">
                            رد الإدارة ({m.replied_by_name || 'المشرف'}):
                          </p>
                          <p className="text-sm text-slate-800">{m.reply_body}</p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">بانتظار رد المشرف أو الأدمن</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-5 px-4 text-center text-xs text-slate-500">
        {settings.footer_text}
      </footer>
    </div>
  );
};
