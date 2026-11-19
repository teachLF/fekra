import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Users,
  Video,
  FileText,
  ClipboardList,
  Layers,
  MessageSquare,
  Settings,
  LogOut,
  Plus,
  Trash2,
  Edit3,
  Upload,
  Check,
  X,
  Eye,
  Send,
  Shield,
  Link2,
  Download,
  FileJson,
} from 'lucide-react';
import type {
  AnalyticsOverview,
  Grade,
  HeroSlide,
  PdfItem,
  Quiz,
  QuizQuestion,
  SiteSettings,
  StudentMessage,
  User,
  UserRole,
  VideoItem,
} from '../types';
import { apiFetch, uploadFile } from '../lib/api';
import { ExternalSyncPanel } from './ExternalSyncPanel';

type AdminTab =
  | 'analytics'
  | 'users'
  | 'content'
  | 'quizzes'
  | 'grades'
  | 'messages'
  | 'sync'
  | 'settings';

interface AdminDashboardProps {
  user: User;
  settings: SiteSettings;
  grades: Grade[];
  heroSlides: HeroSlide[];
  onLogout: () => void;
  onRefreshBootstrap: () => Promise<void>;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  settings,
  grades,
  heroSlides,
  onLogout,
  onRefreshBootstrap,
}) => {
  const isAdmin = user.role === 'admin';
  const [tab, setTab] = useState<AdminTab>('analytics');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [pdfs, setPdfs] = useState<PdfItem[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [messages, setMessages] = useState<StudentMessage[]>([]);

  // Expanded analytics details
  const [expandedVideoId, setExpandedVideoId] = useState<number | null>(null);
  const [expandedQuizId, setExpandedQuizId] = useState<number | null>(null);

  // User Form State
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [uFullName, setUFullName] = useState('');
  const [uUsername, setUUsername] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uRole, setURole] = useState<UserRole>('student');
  const [uGradeId, setUGradeId] = useState<number>(grades[0]?.id || 1);
  const [userSearch, setUserSearch] = useState('');

  // Video Form State
  const [vTitle, setVTitle] = useState('');
  const [vDesc, setVDesc] = useState('');
  const [vGradeId, setVGradeId] = useState<number>(grades[0]?.id || 1);
  const [vSourceType, setVSourceType] = useState<'upload' | 'url'>('upload');
  const [vMediaPath, setVMediaPath] = useState('');
  const [vDuration, setVDuration] = useState('درس مرئي');
  const [vUploading, setVUploading] = useState(false);

  // PDF Form State
  const [pTitle, setPTitle] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [pGradeId, setPGradeId] = useState<number>(grades[0]?.id || 1);
  const [pSourceType, setPSourceType] = useState<'upload' | 'url'>('upload');
  const [pFilePath, setPFilePath] = useState('');
  const [pUploading, setPUploading] = useState(false);

  // Quiz Builder State
  const [editingQuizId, setEditingQuizId] = useState<number | null>(null);
  const [qTitle, setQTitle] = useState('');
  const [qDesc, setQDesc] = useState('');
  const [qGradeId, setQGradeId] = useState<number>(grades[0]?.id || 1);
  const [qTimeLimit, setQTimeLimit] = useState(10);
  const [qPassPct, setQPassPct] = useState(60);
  const [qQuestions, setQQuestions] = useState<QuizQuestion[]>([
    { question_text: '', options: ['', '', '', ''], correct_index: 0, explanation: '' },
  ]);
  const [showQuizJsonSample, setShowQuizJsonSample] = useState(false);
  const [autoPublishQuizJson, setAutoPublishQuizJson] = useState(false);

  // Grade & Slide Forms
  const [newGradeName, setNewGradeName] = useState('');
  const [editingGrade, setEditingGrade] = useState<Grade | null>(null);
  const [slideImage, setSlideImage] = useState('');
  const [slideTitle, setSlideTitle] = useState('');
  const [slideSubtitle, setSlideSubtitle] = useState('');
  const [slideSection, setSlideSection] = useState('videos');
  const [slideUploading, setSlideUploading] = useState(false);

  // Message Reply State
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});

  // Site Settings Draft
  const [settingsDraft, setSettingsDraft] = useState<SiteSettings>(settings);
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    setSettingsDraft(settings);
  }, [settings]);

  useEffect(() => {
    if (grades.length > 0) {
      if (!grades.some((g) => g.id === uGradeId)) setUGradeId(grades[0].id);
      if (!grades.some((g) => g.id === vGradeId)) setVGradeId(grades[0].id);
      if (!grades.some((g) => g.id === pGradeId)) setPGradeId(grades[0].id);
      if (!grades.some((g) => g.id === qGradeId)) setQGradeId(grades[0].id);
    }
  }, [grades]);

  const notify = (type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 3500);
  };

  const loadAllData = useCallback(async () => {
    try {
      const [aRes, uRes, vRes, pRes, qRes, mRes] = await Promise.all([
        apiFetch<AnalyticsOverview>('/api/analytics'),
        apiFetch<{ users: User[] }>('/api/users'),
        apiFetch<{ videos: VideoItem[] }>('/api/videos'),
        apiFetch<{ pdfs: PdfItem[] }>('/api/pdfs'),
        apiFetch<{ quizzes: Quiz[] }>('/api/quizzes'),
        apiFetch<{ messages: StudentMessage[] }>('/api/messages'),
      ]);
      setAnalytics(aRes);
      setUsersList(uRes.users);
      setVideos(vRes.videos);
      setPdfs(pRes.pdfs);
      setQuizzes(qRes.quizzes);
      setMessages(mRes.messages);
    } catch (err) {
      notify('err', (err as Error).message);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // ========== HANDLERS: USERS ==========
  const resetUserForm = () => {
    setEditingUserId(null);
    setUFullName('');
    setUUsername('');
    setUPassword('');
    setURole('student');
    setUGradeId(grades[0]?.id || 1);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUserId) {
        await apiFetch(`/api/users/${editingUserId}`, {
          method: 'PUT',
          body: JSON.stringify({
            full_name: uFullName,
            username: uUsername,
            ...(uPassword ? { password: uPassword } : {}),
            role: uRole,
            grade_id: uRole === 'student' ? uGradeId : null,
          }),
        });
        notify('ok', 'تم تحديث بيانات الحساب بنجاح');
      } else {
        await apiFetch('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            full_name: uFullName,
            username: uUsername,
            password: uPassword,
            role: uRole,
            grade_id: uRole === 'student' ? uGradeId : null,
          }),
        });
        notify('ok', 'تم إنشاء الحساب الجديد بنجاح');
      }
      resetUserForm();
      await loadAllData();
    } catch (err) {
      notify('err', (err as Error).message);
    }
  };

  const handleDeleteUser = async (id: number) => {
    try {
      await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
      notify('ok', 'تم حذف الحساب');
      await loadAllData();
    } catch (err) {
      notify('err', (err as Error).message);
    }
  };

  const handleToggleActive = async (u: User) => {
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: u.is_active ? 0 : 1 }),
      });
      await loadAllData();
    } catch (err) {
      notify('err', (err as Error).message);
    }
  };

  // ========== HANDLERS: VIDEOS & PDFs ==========
  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/videos', {
        method: 'POST',
        body: JSON.stringify({
          grade_id: vGradeId,
          title: vTitle,
          description: vDesc,
          source_type: vSourceType,
          media_path: vMediaPath,
          duration_label: vDuration,
        }),
      });
      setVTitle('');
      setVDesc('');
      setVMediaPath('');
      notify('ok', 'تمت إضافة الفيديو وتخصيصه للصف بنجاح');
      await loadAllData();
    } catch (err) {
      notify('err', (err as Error).message);
    }
  };

  const handleDeleteVideo = async (id: number) => {
    try {
      await apiFetch(`/api/videos/${id}`, { method: 'DELETE' });
      notify('ok', 'تم حذف الفيديو');
      await loadAllData();
    } catch (err) {
      notify('err', (err as Error).message);
    }
  };

  const handleAddPdf = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/pdfs', {
        method: 'POST',
        body: JSON.stringify({
          grade_id: pGradeId,
          title: pTitle,
          description: pDesc,
          source_type: pSourceType,
          file_path: pFilePath,
        }),
      });
      setPTitle('');
      setPDesc('');
      setPFilePath('');
      notify('ok', 'تمت إضافة ملف الـ PDF بنجاح');
      await loadAllData();
    } catch (err) {
      notify('err', (err as Error).message);
    }
  };

  const handleDeletePdf = async (id: number) => {
    try {
      await apiFetch(`/api/pdfs/${id}`, { method: 'DELETE' });
      notify('ok', 'تم حذف ملف الـ PDF');
      await loadAllData();
    } catch (err) {
      notify('err', (err as Error).message);
    }
  };

  // ========== HANDLERS: QUIZZES ==========
  const resetQuizForm = () => {
    setEditingQuizId(null);
    setQTitle('');
    setQDesc('');
    setQTimeLimit(10);
    setQPassPct(60);
    setQQuestions([
      { question_text: '', options: ['', '', '', ''], correct_index: 0, explanation: '' },
    ]);
  };

  const handleEditQuiz = async (quizId: number) => {
    try {
      const res = await apiFetch<{ quiz: Quiz & { questions: QuizQuestion[] } }>(
        `/api/quizzes/${quizId}`
      );
      const q = res.quiz;
      setEditingQuizId(q.id);
      setQTitle(q.title);
      setQDesc(q.description || '');
      setQGradeId(q.grade_id);
      setQTimeLimit(q.time_limit_minutes);
      setQPassPct(q.pass_percentage);
      setQQuestions(
        q.questions.length > 0
          ? q.questions
          : [{ question_text: '', options: ['', '', '', ''], correct_index: 0, explanation: '' }]
      );
    } catch (err) {
      notify('err', (err as Error).message);
    }
  };

  const handleSaveQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    const validQuestions = qQuestions.filter(
      (q) => q.question_text.trim() && q.options.filter((o) => o.trim()).length >= 2
    );
    if (!qTitle.trim() || validQuestions.length === 0) {
      notify('err', 'أدخل اسم الكويز وسؤالاً واحداً مكتمل الخيارات على الأقل');
      return;
    }

    try {
      const payload = {
        grade_id: qGradeId,
        title: qTitle.trim(),
        description: qDesc.trim(),
        time_limit_minutes: qTimeLimit,
        pass_percentage: qPassPct,
        is_published: 1,
        questions: validQuestions.map((q) => ({
          ...q,
          options: q.options.map((o) => o.trim()).filter(Boolean),
        })),
      };

      if (editingQuizId) {
        await apiFetch(`/api/quizzes/${editingQuizId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify('ok', 'تم تحديث الكويز والأسئلة بنجاح');
      } else {
        await apiFetch('/api/quizzes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('ok', 'تم إنشاء الكويز ونشره للصف بنجاح');
      }
      resetQuizForm();
      await loadAllData();
    } catch (err) {
      notify('err', (err as Error).message);
    }
  };

  const handleDeleteQuiz = async (id: number) => {
    try {
      await apiFetch(`/api/quizzes/${id}`, { method: 'DELETE' });
      notify('ok', 'تم حذف الكويز');
      await loadAllData();
    } catch (err) {
      notify('err', (err as Error).message);
    }
  };

  const SAMPLE_QUIZ_JSON = {
    title: 'اختبار تجريبي - العلوم العامة',
    description: 'اختبار سريع لتقييم فهم الدرس الأول',
    time_limit_minutes: 10,
    pass_percentage: 60,
    questions: [
      {
        question_text: 'ما هو الكوكب الأقرب إلى الشمس؟',
        options: ['عطارد', 'الزهرة', 'الأرض', 'المريخ'],
        correct_index: 0,
        explanation: 'عطارد هو أقرب كواكب المجموعة الشمسية إلى الشمس.',
      },
      {
        question_text: 'كم عدد ألوان قوس قزح؟',
        options: ['5 ألوان', '6 ألوان', '7 ألوان', '8 ألوان'],
        correct_index: 2,
        explanation: 'يتكون قوس قزح من 7 ألوان رئيسية.',
      },
      {
        question_text: 'أي الغازات التالية تتنفسه الكائنات الحية؟',
        options: ['النيتروجين', 'الأكسجين', 'ثاني أكسيد الكربون', 'الهيليوم'],
        correct_index: 1,
        explanation: 'الأكسجين هو الغاز الأساسي لعملية التنفس.',
      },
    ],
  };

  const handleDownloadSampleQuizJson = () => {
    const blob = new Blob([JSON.stringify(SAMPLE_QUIZ_JSON, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quiz-questions-sample.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleQuizJsonFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const raw = JSON.parse(text) as unknown;

      let rawList: unknown[] = [];
      let meta: Record<string, unknown> = {};
      if (Array.isArray(raw)) {
        rawList = raw;
      } else if (raw && typeof raw === 'object') {
        meta = raw as Record<string, unknown>;
        if (Array.isArray(meta.questions)) {
          rawList = meta.questions;
        }
      }

      const parsedQuestions: QuizQuestion[] = rawList
        .map((item): QuizQuestion | null => {
          if (!item || typeof item !== 'object') return null;
          const obj = item as Record<string, unknown>;
          const qText = String(obj.question_text ?? obj.question ?? obj.text ?? '').trim();
          const rawOpts = Array.isArray(obj.options)
            ? obj.options
            : Array.isArray(obj.choices)
            ? obj.choices
            : [];
          const cleanOpts = rawOpts.map((o) => String(o ?? '').trim()).filter(Boolean);
          if (!qText || cleanOpts.length < 2) return null;

          const rawCorrect = Number(
            obj.correct_index ?? obj.correctIndex ?? obj.answer_index ?? obj.answer ?? 0
          );
          const safeCorrect =
            Number.isFinite(rawCorrect) && rawCorrect >= 0 && rawCorrect < cleanOpts.length
              ? Math.floor(rawCorrect)
              : 0;

          const paddedOpts = [...cleanOpts];
          while (paddedOpts.length < 4) paddedOpts.push('');

          return {
            question_text: qText,
            options: paddedOpts,
            correct_index: safeCorrect,
            explanation: String(obj.explanation ?? obj.note ?? '').trim(),
          };
        })
        .filter((q): q is QuizQuestion => q !== null);

      if (parsedQuestions.length === 0) {
        notify('err', 'لم يتم العثور على أسئلة صالحة داخل ملف JSON (تأكد من مطابقة المثال الجاهز)');
        return;
      }

      const nextTitle =
        typeof meta.title === 'string' && meta.title.trim() ? meta.title.trim() : qTitle.trim();
      const nextDesc =
        typeof meta.description === 'string' ? meta.description.trim() : qDesc.trim();
      const nextTime =
        typeof meta.time_limit_minutes === 'number' && meta.time_limit_minutes > 0
          ? meta.time_limit_minutes
          : qTimeLimit;
      const nextPass =
        typeof meta.pass_percentage === 'number' &&
        meta.pass_percentage >= 1 &&
        meta.pass_percentage <= 100
          ? meta.pass_percentage
          : qPassPct;

      let nextGradeId = qGradeId;
      if (typeof meta.grade_id === 'number' && grades.some((g) => g.id === meta.grade_id)) {
        nextGradeId = meta.grade_id;
      } else if (typeof meta.grade_name === 'string') {
        const foundGrade = grades.find((g) => g.name.trim() === String(meta.grade_name).trim());
        if (foundGrade) nextGradeId = foundGrade.id;
      }

      if (nextTitle) setQTitle(nextTitle);
      if (typeof meta.description === 'string') setQDesc(nextDesc);
      setQTimeLimit(nextTime);
      setQPassPct(nextPass);
      setQGradeId(nextGradeId);
      setQQuestions(parsedQuestions);

      if (autoPublishQuizJson && nextTitle) {
        await apiFetch('/api/quizzes', {
          method: 'POST',
          body: JSON.stringify({
            grade_id: nextGradeId,
            title: nextTitle,
            description: nextDesc,
            time_limit_minutes: nextTime,
            pass_percentage: nextPass,
            is_published: 1,
            questions: parsedQuestions.map((q) => ({
              ...q,
              options: q.options.map((o) => o.trim()).filter(Boolean),
            })),
          }),
        });
        resetQuizForm();
        await loadAllData();
        notify('ok', `تم استيراد ونشر الكويز "${nextTitle}" بعدد ${parsedQuestions.length} سؤال تلقائياً`);
      } else {
        notify(
          'ok',
          `تم تكوين ${parsedQuestions.length} سؤال تلقائياً من ملف JSON — راجعها ثم اضغط حفظ ونشر الكويز`
        );
      }
    } catch (err) {
      notify('err', `تعذر قراءة ملف JSON: ${(err as Error).message}`);
    }
  };

  // ========== HANDLERS: GRADES & HERO SLIDES ==========
  const handleAddGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGradeName.trim()) return;
    try {
      await apiFetch('/api/grades', {
        method: 'POST',
        body: JSON.stringify({ name: newGradeName.trim(), sort_order: grades.length + 1 }),
      });
      setNewGradeName('');
      notify('ok', 'تمت إضافة الصف الجديد');
      await onRefreshBootstrap();
    } catch (err) {
      notify('err', (err as Error).message);
    }
  };

  const handleUpdateGradeBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGrade) return;
    try {
      await apiFetch(`/api/grades/${editingGrade.id}`, {
        method: 'PUT',
        body: JSON.stringify(editingGrade),
      });
      setEditingGrade(null);
      notify('ok', 'تم تحديث بيانات وبانر الصف بنجاح');
      await onRefreshBootstrap();
    } catch (err) {
      notify('err', (err as Error).message);
    }
  };

  const handleDeleteGrade = async (id: number) => {
    try {
      await apiFetch(`/api/grades/${id}`, { method: 'DELETE' });
      notify('ok', 'تم حذف الصف');
      await onRefreshBootstrap();
    } catch (err) {
      notify('err', (err as Error).message);
    }
  };

  const handleAddHeroSlide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slideImage) {
      notify('err', 'ارفع صورة البانر أو أدخل رابطها');
      return;
    }
    try {
      await apiFetch('/api/hero-slides', {
        method: 'POST',
        body: JSON.stringify({
          image_url: slideImage,
          title: slideTitle,
          subtitle: slideSubtitle,
          link_section: slideSection,
          sort_order: heroSlides.length + 1,
        }),
      });
      setSlideImage('');
      setSlideTitle('');
      setSlideSubtitle('');
      notify('ok', 'تمت إضافة الشريحة للبانر العلوي المتحرك');
      await onRefreshBootstrap();
    } catch (err) {
      notify('err', (err as Error).message);
    }
  };

  const handleDeleteSlide = async (id: number) => {
    try {
      await apiFetch(`/api/hero-slides/${id}`, { method: 'DELETE' });
      notify('ok', 'تم حذف الشريحة');
      await onRefreshBootstrap();
    } catch (err) {
      notify('err', (err as Error).message);
    }
  };

  // ========== HANDLERS: MESSAGES & SETTINGS ==========
  const handleReplyMessage = async (msgId: number) => {
    const reply = replyDrafts[msgId];
    if (!reply || !reply.trim()) return;
    try {
      await apiFetch(`/api/messages/${msgId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ reply_body: reply.trim() }),
      });
      notify('ok', 'تم إرسال الرد للطالب');
      await loadAllData();
    } catch (err) {
      notify('err', (err as Error).message);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settingsDraft),
      });
      notify('ok', 'تم حفظ جميع إعدادات الموقع وتطبيقها فوراً');
      await onRefreshBootstrap();
    } catch (err) {
      notify('err', (err as Error).message);
    }
  };

  const navTabs: Array<{ id: AdminTab; label: string; icon: React.ReactNode; adminOnly?: boolean }> = [
    { id: 'analytics', label: 'الإحصائيات السرية', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'users', label: 'الطلاب والمشرفون', icon: <Users className="w-4 h-4" />, adminOnly: true },
    { id: 'content', label: 'الفيديوهات و PDF', icon: <Video className="w-4 h-4" /> },
    { id: 'quizzes', label: 'إدارة الكويزات', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'grades', label: 'الصفوف والبانرات', icon: <Layers className="w-4 h-4" />, adminOnly: true },
    { id: 'messages', label: 'رسائل الطلاب', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'sync', label: 'ربط موقع آخر', icon: <Link2 className="w-4 h-4" />, adminOnly: true },
    { id: 'settings', label: 'تخصيص الموقع', icon: <Settings className="w-4 h-4" />, adminOnly: true },
  ];

  const visibleTabs = navTabs.filter((t) => !t.adminOnly || isAdmin);
  const filteredUsers = usersList.filter(
    (u) =>
      !userSearch.trim() ||
      u.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.grade_name || '').toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Top Admin Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
            <img
              src={settings.logo_url || '/src/assets/images/site_logo_emblem_1795021613540.jpg'}
              alt={settings.site_name}
              className="w-9 h-9 rounded-lg object-contain border border-slate-200 bg-white"
            />
            <div>
              <span className="text-base font-bold text-slate-900 block leading-tight">
                {settings.site_name}
              </span>
              <span className="text-[11px] text-slate-500">
                {isAdmin ? 'لوحة تحكم الأدمن الشاملة' : 'لوحة المشرف المساعد'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg">
              <Shield className="w-3.5 h-3.5 text-[#0F2A4A]" />
              <span className="font-semibold">{user.full_name}</span>
              <span className="text-slate-400">·</span>
              <span className="font-mono text-[11px]">{user.username}</span>
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
      </header>

      {/* Toast Banner */}
      {toast && (
        <div className="fixed bottom-5 left-5 z-50">
          <div
            className={`px-4 py-3 rounded-xl shadow-lg text-xs font-semibold border ${
              toast.type === 'ok'
                ? 'bg-emerald-900 text-white border-emerald-700'
                : 'bg-red-900 text-white border-red-700'
            }`}
          >
            {toast.text}
          </div>
        </div>
      )}

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar Navigation */}
        <aside className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-2.5 flex lg:flex-col gap-1 overflow-x-auto">
            {visibleTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  tab === item.id
                    ? 'bg-[#0F2A4A] text-white font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Main Workspace */}
        <main className="lg:col-span-9 space-y-6">
          {/* 1. ANALYTICS TAB (ADMIN & SUPERVISORS ONLY) */}
          {tab === 'analytics' && analytics && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-1">
                  إحصائيات المشاهدة وحل الكويزات (سرية للإدارة والمشرفين)
                </h2>
                <p className="text-xs text-slate-500 mb-5">
                  لا تظهر هذه الأرقام والتفاصيل للطلاب نهائياً، وتُحدث فورياً مع كل مشاهدة أو اختبار.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">الطلاب المسجلون</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                      {analytics.total_students}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">المشرفون المساعدون</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                      {analytics.total_supervisors}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">مشاهدات الفيديوهات</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-[#0F2A4A]">
                      {analytics.total_video_views}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">مرات حل الكويزات</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
                      {analytics.total_quiz_attempts}
                    </p>
                  </div>
                </div>
              </div>

              {/* Per-Video Watch Breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="text-base font-bold text-slate-900 mb-4">
                  متابعة مشاهدات الفيديوهات ({analytics.video_stats.length})
                </h3>
                {analytics.video_stats.length === 0 ? (
                  <p className="text-xs text-slate-500">لم تُضف فيديوهات بعد.</p>
                ) : (
                  <div className="space-y-3">
                    {analytics.video_stats.map((vs) => (
                      <div key={vs.id} className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="p-4 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{vs.title}</p>
                            <p className="text-xs text-slate-500">{vs.grade_name}</p>
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="font-mono tabular-nums font-bold text-[#0F2A4A]">
                              {vs.unique_viewers} طالب شاهدوه
                            </span>
                            <span className="font-mono tabular-nums text-slate-600">
                              ({vs.total_views} إجمالي المشاهدات)
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedVideoId(expandedVideoId === vs.id ? null : vs.id)
                              }
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>الأسماء</span>
                            </button>
                          </div>
                        </div>

                        {expandedVideoId === vs.id && (
                          <div className="p-4 bg-white border-t border-slate-200">
                            {vs.viewers.length === 0 ? (
                              <p className="text-xs text-slate-500">لم يشاهد أي طالب هذا الفيديو حتى الآن.</p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                {vs.viewers.map((vw, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200"
                                  >
                                    <span className="font-semibold text-slate-800">
                                      {vw.full_name} ({vw.username})
                                    </span>
                                    <span className="font-mono tabular-nums text-slate-600">
                                      {vw.view_count} مشاهدة
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Per-Quiz Solver Breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="text-base font-bold text-slate-900 mb-4">
                  متابعة حل الكويزات والدرجات ({analytics.quiz_stats.length})
                </h3>
                {analytics.quiz_stats.length === 0 ? (
                  <p className="text-xs text-slate-500">لم تُضف كويزات بعد.</p>
                ) : (
                  <div className="space-y-3">
                    {analytics.quiz_stats.map((qs) => (
                      <div key={qs.id} className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="p-4 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{qs.title}</p>
                            <p className="text-xs text-slate-500">{qs.grade_name}</p>
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="font-mono tabular-nums font-bold text-emerald-700">
                              {qs.unique_solvers} طالب حلّوه
                            </span>
                            <span className="font-mono tabular-nums text-slate-600">
                              متوسط الدرجات: {qs.avg_percentage}%
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedQuizId(expandedQuizId === qs.id ? null : qs.id)
                              }
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>النتائج</span>
                            </button>
                          </div>
                        </div>

                        {expandedQuizId === qs.id && (
                          <div className="p-4 bg-white border-t border-slate-200">
                            {qs.attempts.length === 0 ? (
                              <p className="text-xs text-slate-500">لم يحل أي طالب هذا الكويز بعد.</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs text-right">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-slate-500">
                                      <th className="py-2 font-semibold">الطالب</th>
                                      <th className="py-2 font-semibold">الصف</th>
                                      <th className="py-2 font-semibold">الدرجة</th>
                                      <th className="py-2 font-semibold">النسبة</th>
                                      <th className="py-2 font-semibold">الحالة</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {qs.attempts.map((a) => (
                                      <tr key={a.id} className="border-b border-slate-100">
                                        <td className="py-2 font-semibold text-slate-900">
                                          {a.full_name} ({a.username})
                                        </td>
                                        <td className="py-2 text-slate-600">{a.grade_name}</td>
                                        <td className="py-2 font-mono tabular-nums">
                                          {a.score} / {a.total_questions}
                                        </td>
                                        <td className="py-2 font-mono tabular-nums font-bold">
                                          {a.percentage}%
                                        </td>
                                        <td className="py-2">
                                          <span
                                            className={
                                              a.passed ? 'text-emerald-700 font-semibold' : 'text-red-600'
                                            }
                                          >
                                            {a.passed ? 'اجتاز' : 'لم يجتز'}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. USERS & SUPERVISORS TAB (ADMIN ONLY) */}
          {tab === 'users' && isAdmin && (
            <div className="space-y-6">
              <form
                onSubmit={handleSaveUser}
                className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900">
                    {editingUserId ? 'تعديل بيانات الحساب' : 'إضافة طالب أو مشرف مساعد جديد'}
                  </h2>
                  {editingUserId && (
                    <button
                      type="button"
                      onClick={resetUserForm}
                      className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      إلغاء التعديل
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      الاسم الكامل للطالب / المشرف
                    </label>
                    <input
                      type="text"
                      required
                      value={uFullName}
                      onChange={(e) => setUFullName(e.target.value)}
                      placeholder="مثال: أحمد محمد"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      اسم الدخول (Username)
                    </label>
                    <input
                      type="text"
                      required
                      dir="ltr"
                      value={uUsername}
                      onChange={(e) => setUUsername(e.target.value)}
                      placeholder="ahmed2026"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-right"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {editingUserId ? 'كلمة سر جديدة (اختياري)' : 'كلمة السر'}
                    </label>
                    <input
                      type="text"
                      required={!editingUserId}
                      dir="ltr"
                      value={uPassword}
                      onChange={(e) => setUPassword(e.target.value)}
                      placeholder="كلمة السر المرسلة للطالب"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-right"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      نوع الحساب (الرتبة)
                    </label>
                    <select
                      value={uRole}
                      onChange={(e) => setURole(e.target.value as UserRole)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    >
                      <option value="student">مستخدم عادي (طالب)</option>
                      <option value="supervisor">مشرف مساعد للأدمن</option>
                      <option value="admin">أدمن</option>
                    </select>
                  </div>
                  {uRole === 'student' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        تحديد الصف الدراسي
                      </label>
                      <select
                        value={uGradeId}
                        onChange={(e) => setUGradeId(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                      >
                        {grades.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F2A4A] text-white text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{editingUserId ? 'حفظ التعديلات' : 'إنشاء الحساب الآن'}</span>
                </button>
              </form>

              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-slate-900">
                    الحسابات المسجلة ({filteredUsers.length})
                  </h3>
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="بحث بالاسم أو الصف..."
                    className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs w-60"
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 font-semibold">الاسم</th>
                        <th className="py-2.5 font-semibold">اسم الدخول</th>
                        <th className="py-2.5 font-semibold">الرتبة</th>
                        <th className="py-2.5 font-semibold">الصف</th>
                        <th className="py-2.5 font-semibold">الحالة</th>
                        <th className="py-2.5 font-semibold">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 font-semibold text-slate-900">{u.full_name}</td>
                          <td className="py-3 font-mono text-slate-600">{u.username}</td>
                          <td className="py-3">
                            {u.role === 'admin'
                              ? 'أدمن رئيسي'
                              : u.role === 'supervisor'
                              ? 'مشرف مساعد'
                              : 'طالب'}
                          </td>
                          <td className="py-3 text-slate-700">{u.grade_name || 'جميع الصفوف'}</td>
                          <td className="py-3">
                            <button
                              type="button"
                              disabled={u.username === 'fekra@n'}
                              onClick={() => handleToggleActive(u)}
                              className={`text-xs font-semibold cursor-pointer disabled:opacity-50 ${
                                u.is_active ? 'text-emerald-700' : 'text-red-600'
                              }`}
                            >
                              {u.is_active ? 'نشط' : 'موقوف'}
                            </button>
                          </td>
                          <td className="py-3 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUserId(u.id);
                                setUFullName(u.full_name);
                                setUUsername(u.username);
                                setUPassword('');
                                setURole(u.role);
                                if (u.grade_id) setUGradeId(u.grade_id);
                              }}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                              title="تعديل"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {u.username !== 'fekra@n' && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u.id)}
                                className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                                title="حذف"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 3. VIDEOS & PDFs TAB */}
          {tab === 'content' && (
            <div className="space-y-6">
              {/* Add Video */}
              <form
                onSubmit={handleAddVideo}
                className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
              >
                <h2 className="text-lg font-bold text-slate-900">إضافة فيديو تعليمي وتحديد الصف</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">عنوان الفيديو</label>
                    <input
                      type="text"
                      required
                      value={vTitle}
                      onChange={(e) => setVTitle(e.target.value)}
                      placeholder="مثال: الدرس الأول - الكسور العشرية"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      الصف المسموح له بالمشاهدة
                    </label>
                    <select
                      value={vGradeId}
                      onChange={(e) => setVGradeId(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    >
                      {grades.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">طريقة الإضافة</label>
                    <select
                      value={vSourceType}
                      onChange={(e) => {
                        setVSourceType(e.target.value as 'upload' | 'url');
                        setVMediaPath('');
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    >
                      <option value="upload">رفع فيديو من الجهاز (محمي بالكامل)</option>
                      <option value="url">رابط فيديو (يوتيوب / فيميو / رابط مباشر)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">المدة / التصنيف</label>
                    <input
                      type="text"
                      value={vDuration}
                      onChange={(e) => setVDuration(e.target.value)}
                      placeholder="مثال: 15 دقيقة"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    />
                  </div>
                </div>

                {vSourceType === 'upload' ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold cursor-pointer">
                      <Upload className="w-4 h-4" />
                      <span>{vUploading ? 'جاري رفع الفيديو...' : 'اختر ملف فيديو MP4/WebM'}</span>
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setVUploading(true);
                          try {
                            const res = await uploadFile(file, 'video');
                            setVMediaPath(res.filename);
                            notify('ok', `تم رفع الفيديو: ${res.originalName}`);
                          } catch (err) {
                            notify('err', (err as Error).message);
                          } finally {
                            setVUploading(false);
                          }
                        }}
                      />
                    </label>
                    {vMediaPath && (
                      <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                        <Check className="w-4 h-4" /> جاهز للنشر
                      </span>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">رابط الفيديو</label>
                    <input
                      type="url"
                      required
                      dir="ltr"
                      value={vMediaPath}
                      onChange={(e) => setVMediaPath(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-right"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">وصف مختصر</label>
                  <textarea
                    rows={2}
                    value={vDesc}
                    onChange={(e) => setVDesc(e.target.value)}
                    placeholder="شرح سريع لمحتوى الدرس..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!vMediaPath || vUploading}
                  className="px-5 py-2.5 rounded-xl bg-[#0F2A4A] text-white text-xs sm:text-sm font-semibold disabled:opacity-50 cursor-pointer"
                >
                  نشر الفيديو للصف المحدد
                </button>
              </form>

              {/* Videos List */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="text-base font-bold text-slate-900 mb-4">
                  الفيديوهات المنشورة ({videos.length})
                </h3>
                <div className="space-y-2.5">
                  {videos.map((v) => (
                    <div
                      key={v.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/50"
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-900">{v.title}</p>
                        <p className="text-xs text-slate-500">
                          {v.grade_name} · {v.unique_viewers || 0} مشاهد
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteVideo(v.id)}
                        className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add PDF */}
              <form
                onSubmit={handleAddPdf}
                className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
              >
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#B4832E]" />
                  <span>إضافة ملف PDF محمي</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">عنوان الملف</label>
                    <input
                      type="text"
                      required
                      value={pTitle}
                      onChange={(e) => setPTitle(e.target.value)}
                      placeholder="ملخص الفصل الأول PDF"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الصف المخصص</label>
                    <select
                      value={pGradeId}
                      onChange={(e) => setPGradeId(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    >
                      {grades.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">المصدر</label>
                    <select
                      value={pSourceType}
                      onChange={(e) => {
                        setPSourceType(e.target.value as 'upload' | 'url');
                        setPFilePath('');
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    >
                      <option value="upload">رفع ملف PDF من الجهاز</option>
                      <option value="url">رابط ملف PDF خارجي</option>
                    </select>
                  </div>
                </div>

                {pSourceType === 'upload' ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold cursor-pointer">
                      <Upload className="w-4 h-4" />
                      <span>{pUploading ? 'جاري الرفع...' : 'اختيار ملف PDF'}</span>
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setPUploading(true);
                          try {
                            const res = await uploadFile(file, 'pdf');
                            setPFilePath(res.filename);
                            notify('ok', `تم رفع الملف: ${res.originalName}`);
                          } catch (err) {
                            notify('err', (err as Error).message);
                          } finally {
                            setPUploading(false);
                          }
                        }}
                      />
                    </label>
                    {pFilePath && (
                      <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                        <Check className="w-4 h-4" /> الملف جاهز
                      </span>
                    )}
                  </div>
                ) : (
                  <input
                    type="url"
                    required
                    dir="ltr"
                    value={pFilePath}
                    onChange={(e) => setPFilePath(e.target.value)}
                    placeholder="https://example.com/file.pdf"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-right"
                  />
                )}

                <input
                  type="text"
                  value={pDesc}
                  onChange={(e) => setPDesc(e.target.value)}
                  placeholder="وصف مختصر للملخص (اختياري)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                />

                <button
                  type="submit"
                  disabled={!pFilePath || pUploading}
                  className="px-5 py-2.5 rounded-xl bg-[#0F2A4A] text-white text-xs sm:text-sm font-semibold disabled:opacity-50 cursor-pointer"
                >
                  نشر ملف الـ PDF
                </button>
              </form>

              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="text-base font-bold text-slate-900 mb-4">
                  ملفات الـ PDF المضافة ({pdfs.length})
                </h3>
                <div className="space-y-2.5">
                  {pdfs.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/50"
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-900">{p.title}</p>
                        <p className="text-xs text-slate-500">{p.grade_name}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeletePdf(p.id)}
                        className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 4. QUIZZES BUILDER TAB */}
          {tab === 'quizzes' && (
            <div className="space-y-6">
              {isAdmin && (
                <div className="bg-white rounded-2xl border border-[#0F2A4A]/20 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-[#0F2A4A] flex items-center gap-2">
                        <FileJson className="w-4 h-4 text-[#B4832E]" />
                        <span>رفع ملف JSON لتكوين الأسئلة تلقائياً (خاص بالأدمن فقط)</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        ارفع ملف JSON يحتوي على الأسئلة ليتم تعبئتها تلقائياً في النموذج أدناه، أو حمّل ملف المثال الجاهز للاسترشاد بصيغته.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadSampleQuizJson}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer"
                      >
                        <Download className="w-4 h-4 text-[#0F2A4A]" />
                        <span>تحميل ملف مثال جاهز (.json)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowQuizJsonSample((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                        <span>{showQuizJsonSample ? 'إخفاء المثال' : 'معاينة المثال'}</span>
                      </button>
                      <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F2A4A] hover:bg-[#0F2A4A]/90 text-white text-xs font-semibold cursor-pointer">
                        <Upload className="w-4 h-4" />
                        <span>رفع ملف أسئلة JSON</span>
                        <input
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          onChange={handleQuizJsonFileChange}
                        />
                      </label>
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoPublishQuizJson}
                      onChange={(e) => setAutoPublishQuizJson(e.target.checked)}
                      className="accent-[#0F2A4A]"
                    />
                    <span>إنشاء ونشر الكويز تلقائياً فور رفع الملف (إذا توفر اسم الكويز داخل الملف أو النموذج)</span>
                  </label>

                  {showQuizJsonSample && (
                    <pre
                      dir="ltr"
                      className="p-3.5 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed"
                    >
                      {JSON.stringify(SAMPLE_QUIZ_JSON, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              <form
                onSubmit={handleSaveQuiz}
                className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900">
                    {editingQuizId ? 'تعديل الكويز وأسئلته' : 'إنشاء كويز جديد وتحديد الصف'}
                  </h2>
                  {editingQuizId && (
                    <button
                      type="button"
                      onClick={resetQuizForm}
                      className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                    >
                      إلغاء التعديل
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">اسم الكويز</label>
                    <input
                      type="text"
                      required
                      value={qTitle}
                      onChange={(e) => setQTitle(e.target.value)}
                      placeholder="مثال: اختبار الوحدة الأولى - الجبر"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">الصف الدراسي</label>
                    <select
                      value={qGradeId}
                      onChange={(e) => setQGradeId(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    >
                      {grades.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      المدة (دقائق) / نسبة النجاح %
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={1}
                        value={qTimeLimit}
                        onChange={(e) => setQTimeLimit(Number(e.target.value))}
                        className="w-1/2 px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-mono"
                        title="المدة بالدقائق"
                      />
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={qPassPct}
                        onChange={(e) => setQPassPct(Number(e.target.value))}
                        className="w-1/2 px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-mono"
                        title="نسبة النجاح"
                      />
                    </div>
                  </div>
                </div>

                <input
                  type="text"
                  value={qDesc}
                  onChange={(e) => setQDesc(e.target.value)}
                  placeholder="وصف مختصر للكويز (اختياري)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                />

                {/* Questions Builder */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800">
                      أسئلة الكويز ({qQuestions.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        setQQuestions((prev) => [
                          ...prev,
                          {
                            question_text: '',
                            options: ['', '', '', ''],
                            correct_index: 0,
                            explanation: '',
                          },
                        ])
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة سؤال جديد</span>
                    </button>
                  </div>

                  {qQuestions.map((q, qIdx) => (
                    <div
                      key={qIdx}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#0F2A4A]">السؤال {qIdx + 1}</span>
                        {qQuestions.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setQQuestions((prev) => prev.filter((_, idx) => idx !== qIdx))
                            }
                            className="text-xs text-red-600 hover:underline cursor-pointer"
                          >
                            حذف السؤال
                          </button>
                        )}
                      </div>

                      <input
                        type="text"
                        required
                        value={q.question_text}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQQuestions((prev) =>
                            prev.map((item, idx) =>
                              idx === qIdx ? { ...item, question_text: val } : item
                            )
                          );
                        }}
                        placeholder="اكتب نص السؤال هنا..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {q.options.map((opt, oIdx) => (
                          <div key={oIdx} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`correct-${qIdx}`}
                              checked={q.correct_index === oIdx}
                              onChange={() =>
                                setQQuestions((prev) =>
                                  prev.map((item, idx) =>
                                    idx === qIdx ? { ...item, correct_index: oIdx } : item
                                  )
                                )
                              }
                              title="تحديد كإجابة صحيحة"
                              className="accent-emerald-600 cursor-pointer"
                            />
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => {
                                const val = e.target.value;
                                setQQuestions((prev) =>
                                  prev.map((item, idx) => {
                                    if (idx !== qIdx) return item;
                                    const nextOpts = [...item.options];
                                    nextOpts[oIdx] = val;
                                    return { ...item, options: nextOpts };
                                  })
                                );
                              }}
                              placeholder={`الخيار ${oIdx + 1}`}
                              className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                            />
                          </div>
                        ))}
                      </div>

                      <input
                        type="text"
                        value={q.explanation}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQQuestions((prev) =>
                            prev.map((item, idx) =>
                              idx === qIdx ? { ...item, explanation: val } : item
                            )
                          );
                        }}
                        placeholder="توضيح الإجابة الصحيحة (يظهر للطالب بعد التسليم)"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#0F2A4A] text-white text-sm font-semibold cursor-pointer"
                >
                  {editingQuizId ? 'حفظ تعديلات الكويز' : 'حفظ ونشر الكويز'}
                </button>
              </form>

              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="text-base font-bold text-slate-900 mb-4">
                  الكويزات المنشورة ({quizzes.length})
                </h3>
                <div className="space-y-3">
                  {quizzes.map((q) => (
                    <div
                      key={q.id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-900">{q.title}</p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums">
                          {q.grade_name} · {q.question_count} سؤال · {q.unique_solvers || 0} طالب حلّوه
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditQuiz(q.id)}
                          className="p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-white cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuiz(q.id)}
                          className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 5. GRADES & BANNERS & ROTATING TOP CAROUSEL (ADMIN ONLY) */}
          {tab === 'grades' && isAdmin && (
            <div className="space-y-6">
              {/* Top Rotating Rectangular Carousel Management */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
                <h2 className="text-lg font-bold text-slate-900">
                  البانر العلوي المستطيل المتحرك (أكثر من صورة تتبدل تلقائياً)
                </h2>

                <form onSubmit={handleAddHeroSlide} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      عنوان الشريحة
                    </label>
                    <input
                      type="text"
                      value={slideTitle}
                      onChange={(e) => setSlideTitle(e.target.value)}
                      placeholder="عنوان رئيسي على البانر"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      النص الفرعي
                    </label>
                    <input
                      type="text"
                      value={slideSubtitle}
                      onChange={(e) => setSlideSubtitle(e.target.value)}
                      placeholder="وصف مختصر"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      القسم المرتبط عند الضغط
                    </label>
                    <select
                      value={slideSection}
                      onChange={(e) => setSlideSection(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    >
                      <option value="videos">الفيديوهات</option>
                      <option value="pdfs">ملخصات PDF</option>
                      <option value="quizzes">الكويزات</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      صورة البانر (رفع أو رابط)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        dir="ltr"
                        value={slideImage}
                        onChange={(e) => setSlideImage(e.target.value)}
                        placeholder="رابط الصورة أو ارفعها"
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-right"
                      />
                      <label className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-100 text-xs font-semibold cursor-pointer whitespace-nowrap">
                        {slideUploading ? '...' : 'رفع صورة'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            setSlideUploading(true);
                            try {
                              const r = await uploadFile(f, 'image');
                              setSlideImage(r.url);
                            } catch (err) {
                              notify('err', (err as Error).message);
                            } finally {
                              setSlideUploading(false);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-[#0F2A4A] text-white text-xs font-semibold cursor-pointer"
                    >
                      إضافة صورة للبانر العلوي
                    </button>
                  </div>
                </form>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {heroSlides.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50 flex flex-col"
                    >
                      <img src={s.image_url} alt={s.title} className="w-full h-28 object-cover" />
                      <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-slate-900 truncate">{s.title || 'بانر'}</p>
                          <p className="text-[11px] text-slate-500 truncate">{s.subtitle}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteSlide(s.id)}
                          className="text-xs text-red-600 hover:underline text-right cursor-pointer"
                        >
                          حذف من البانر
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-Grade Banner Management */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-slate-900">
                    إدارة الصفوف الدراسية وبانر كل صف ({grades.length})
                  </h2>
                  <form onSubmit={handleAddGrade} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newGradeName}
                      onChange={(e) => setNewGradeName(e.target.value)}
                      placeholder="اسم صف جديد..."
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 rounded-xl bg-[#0F2A4A] text-white text-xs font-semibold cursor-pointer"
                    >
                      إضافة صف
                    </button>
                  </form>
                </div>

                {editingGrade && (
                  <form
                    onSubmit={handleUpdateGradeBanner}
                    className="p-5 rounded-xl border-2 border-[#0F2A4A]/30 bg-slate-50 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-[#0F2A4A]">
                        تخصيص بانر واسم الصف: {editingGrade.name}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setEditingGrade(null)}
                        className="text-slate-500 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={editingGrade.name}
                        onChange={(e) => setEditingGrade({ ...editingGrade, name: e.target.value })}
                        placeholder="اسم الصف"
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                      <input
                        type="text"
                        value={editingGrade.banner_title}
                        onChange={(e) =>
                          setEditingGrade({ ...editingGrade, banner_title: e.target.value })
                        }
                        placeholder="عنوان بانر الصف"
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                      <input
                        type="text"
                        value={editingGrade.banner_subtitle}
                        onChange={(e) =>
                          setEditingGrade({ ...editingGrade, banner_subtitle: e.target.value })
                        }
                        placeholder="وصف بانر الصف"
                        className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                      <div className="sm:col-span-2 flex gap-2">
                        <input
                          type="text"
                          dir="ltr"
                          value={editingGrade.banner_image}
                          onChange={(e) =>
                            setEditingGrade({ ...editingGrade, banner_image: e.target.value })
                          }
                          placeholder="رابط صورة بانر الصف"
                          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-right"
                        />
                        <label className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold cursor-pointer">
                          رفع صورة للبانر
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              const r = await uploadFile(f, 'image');
                              setEditingGrade({ ...editingGrade, banner_image: r.url });
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-[#0F2A4A] text-white text-xs font-semibold cursor-pointer"
                    >
                      حفظ بانر الصف
                    </button>
                  </form>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {grades.map((g) => (
                    <div
                      key={g.id}
                      className="rounded-xl border border-slate-200 overflow-hidden bg-white flex flex-col"
                    >
                      <img src={g.banner_image} alt={g.name} className="w-full h-24 object-cover" />
                      <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{g.name}</p>
                          <p className="text-xs text-slate-500 truncate">{g.banner_title}</p>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => setEditingGrade(g)}
                            className="text-xs font-semibold text-[#0F2A4A] hover:underline cursor-pointer"
                          >
                            تعديل البانر والاسم
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteGrade(g.id)}
                            className="text-xs text-red-600 hover:underline cursor-pointer"
                          >
                            حذف
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 6. STUDENT MESSAGES INBOX */}
          {tab === 'messages' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
              <h2 className="text-lg font-bold text-slate-900">
                رسائل الطلاب الواردة ({messages.length})
              </h2>
              {messages.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">لا توجد رسائل من الطلاب حتى الآن.</p>
              ) : (
                <div className="space-y-4">
                  {messages.map((m) => (
                    <div key={m.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">{m.subject}</h3>
                          <p className="text-xs text-slate-500">
                            من: {m.student_name} ({m.student_username}) · {m.grade_name}
                          </p>
                        </div>
                        <span className="text-xs font-mono text-slate-500">
                          {new Date(m.created_at).toLocaleDateString('ar-SA')}
                        </span>
                      </div>
                      <p className="text-sm text-slate-800">{m.body}</p>

                      {m.reply_body ? (
                        <div className="p-3 rounded-xl bg-white border border-emerald-200 text-xs">
                          <span className="font-bold text-emerald-800">
                            تم الرد ({m.replied_by_name}):{' '}
                          </span>
                          <span className="text-slate-700">{m.reply_body}</span>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={replyDrafts[m.id] || ''}
                            onChange={(e) =>
                              setReplyDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))
                            }
                            placeholder="اكتب ردك للطالب..."
                            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleReplyMessage(m.id)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F2A4A] text-white text-xs font-semibold cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>إرسال الرد</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 7. FULL SITE CUSTOMIZATION TAB (ADMIN ONLY) */}
          {tab === 'settings' && isAdmin && (
            <form
              onSubmit={handleSaveSettings}
              className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5"
            >
              <div>
                <h2 className="text-lg font-bold text-slate-900">تخصيص كل تفاصيل الموقع</h2>
                <p className="text-xs text-slate-500">
                  تحكم كامل في اسم الموقع، الشعار، الألوان، شريط الإعلانات، نصوص الدخول، ورسالة حماية الشاشة.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">اسم الموقع</label>
                  <input
                    type="text"
                    value={settingsDraft.site_name}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, site_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">شعار الموقع</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      value={settingsDraft.logo_url}
                      onChange={(e) => setSettingsDraft({ ...settingsDraft, logo_url: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-right"
                    />
                    <label className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-100 text-xs font-semibold cursor-pointer whitespace-nowrap">
                      {logoUploading ? '...' : 'رفع شعار'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setLogoUploading(true);
                          try {
                            const r = await uploadFile(f, 'image');
                            setSettingsDraft({ ...settingsDraft, logo_url: r.url });
                          } finally {
                            setLogoUploading(false);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">اللون الأساسي</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settingsDraft.primary_color}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, primary_color: e.target.value })
                      }
                      className="w-10 h-9 rounded border border-slate-200 cursor-pointer"
                    />
                    <input
                      type="text"
                      dir="ltr"
                      value={settingsDraft.primary_color}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, primary_color: e.target.value })
                      }
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">اللون الثانوي (التمييز)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settingsDraft.accent_color}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, accent_color: e.target.value })
                      }
                      className="w-10 h-9 rounded border border-slate-200 cursor-pointer"
                    />
                    <input
                      type="text"
                      dir="ltr"
                      value={settingsDraft.accent_color}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, accent_color: e.target.value })
                      }
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">عنوان شاشة الدخول</label>
                  <input
                    type="text"
                    value={settingsDraft.login_title}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, login_title: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">وصف شاشة الدخول</label>
                  <input
                    type="text"
                    value={settingsDraft.login_subtitle}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, login_subtitle: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    شريط الإعلانات العلوي
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="text"
                      value={settingsDraft.announcement_text}
                      onChange={(e) =>
                        setSettingsDraft({ ...settingsDraft, announcement_text: e.target.value })
                      }
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                    />
                    <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settingsDraft.announcement_enabled === 1}
                        onChange={(e) =>
                          setSettingsDraft({
                            ...settingsDraft,
                            announcement_enabled: e.target.checked ? 1 : 0,
                          })
                        }
                      />
                      <span>تفعيل الشريط</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    رسالة منع اللقطات والتسجيل
                  </label>
                  <input
                    type="text"
                    value={settingsDraft.protection_message}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, protection_message: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    سرعة تبديل البانر المتحرك (بالملي ثانية)
                  </label>
                  <input
                    type="number"
                    min={2500}
                    step={500}
                    value={settingsDraft.hero_interval_ms}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, hero_interval_ms: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">نص التذييل (Footer)</label>
                  <input
                    type="text"
                    value={settingsDraft.footer_text}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, footer_text: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-[#0F2A4A] text-white text-sm font-semibold cursor-pointer"
              >
                حفظ وتطبيق جميع التعديلات
              </button>
            </form>
          )}

          {/* 8. EXTERNAL AI STUDIO SITE SYNC TAB (ADMIN ONLY) */}
          {tab === 'sync' && isAdmin && (
            <ExternalSyncPanel
              users={usersList}
              onUsersChanged={loadAllData}
              onNotify={notify}
            />
          )}
        </main>
      </div>
    </div>
  );
};
