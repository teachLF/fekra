import React, { useEffect, useState } from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Award,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import type { Quiz, QuizQuestion } from '../types';
import { apiFetch } from '../lib/api';

interface QuizTakerProps {
  quizId: number;
  studentName: string;
  siteName: string;
  onClose: () => void;
  onCompleted: () => void;
}

interface SubmitResponse {
  score: number;
  total_questions: number;
  percentage: number;
  passed: boolean;
  points_earned: number;
  breakdown: Array<{
    question_id: number;
    question_text: string;
    options: string[];
    selected_index: number;
    correct_index: number;
    is_correct: boolean;
    explanation: string;
  }>;
}

export const QuizTaker: React.FC<QuizTakerProps> = ({
  quizId,
  studentName,
  siteName,
  onClose,
  onCompleted,
}) => {
  const [quiz, setQuiz] = useState<(Quiz & { questions: QuizQuestion[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [showCertificate, setShowCertificate] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<{ quiz: Quiz & { questions: QuizQuestion[] } }>(`/api/quizzes/${quizId}`)
      .then((res) => {
        if (!active) return;
        setQuiz(res.quiz);
        setSecondsLeft((res.quiz.time_limit_minutes || 10) * 60);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [quizId]);

  useEffect(() => {
    if (!quiz || result || loading) return;
    if (secondsLeft <= 0) {
      handleSubmit();
      return;
    }
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [quiz, result, loading, secondsLeft]);

  const handleSubmit = async () => {
    if (!quiz || submitting || result) return;
    setSubmitting(true);
    try {
      const data = await apiFetch<SubmitResponse>(`/api/quizzes/${quiz.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      });
      setResult(data);
      onCompleted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-600">
        جاري تحميل أسئلة الكويز...
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <p className="text-red-600 mb-4">{error || 'تعذر فتح الكويز'}</p>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm cursor-pointer"
        >
          العودة للكويزات
        </button>
      </div>
    );
  }

  if (result) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-100">
            <div>
              <p className="text-xs text-slate-500 mb-1">{quiz.grade_name} · نتيجة الكويز</p>
              <h2 className="text-2xl font-bold text-slate-900">{quiz.title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
              <span>العودة لقائمة الكويزات</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">الدرجة النهائية</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {result.score} / {result.total_questions}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">النسبة المئوية</p>
              <p
                className={`text-2xl font-bold font-mono tabular-nums ${
                  result.passed ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {result.percentage}%
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">حالة الاجتياز والنقاط</p>
              <p className="text-base font-bold text-slate-900">
                {result.passed ? 'ناجح — متفوق' : 'حاول مرة أخرى'}
                {result.points_earned > 0 && (
                  <span className="text-xs font-medium text-amber-700 mr-2">
                    (+{result.points_earned} نقطة)
                  </span>
                )}
              </p>
            </div>
          </div>

          {result.passed && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Award className="w-6 h-6 text-emerald-700 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-950">مبارك اجتيازك الاختبار بنجاح</p>
                  <p className="text-xs text-emerald-800">يمكنك عرض شهادة الإنجاز الخاصة بك داخل المنصة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCertificate(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>عرض شهادة الإنجاز</span>
              </button>
            </div>
          )}

          {/* Detailed Review */}
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900">مراجعة الإجابات</h3>
            {result.breakdown.map((item, idx) => (
              <div
                key={item.question_id}
                className={`p-4 rounded-xl border ${
                  item.is_correct
                    ? 'bg-emerald-50/40 border-emerald-200'
                    : 'bg-red-50/40 border-red-200'
                }`}
              >
                <div className="flex items-start gap-2 mb-2">
                  {item.is_correct ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <p className="text-sm font-semibold text-slate-900">
                    {idx + 1}. {item.question_text}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mr-7 text-xs">
                  {item.options.map((opt, optIdx) => {
                    const isSelected = item.selected_index === optIdx;
                    const isCorrect = item.correct_index === optIdx;
                    return (
                      <div
                        key={optIdx}
                        className={`px-3 py-2 rounded-lg border ${
                          isCorrect
                            ? 'bg-emerald-100/70 border-emerald-300 text-emerald-950 font-semibold'
                            : isSelected
                            ? 'bg-red-100/70 border-red-300 text-red-900'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        {opt}
                        {isCorrect && ' (الإجابة الصحيحة)'}
                        {!isCorrect && isSelected && ' (اختيارك)'}
                      </div>
                    );
                  })}
                </div>
                {item.explanation && (
                  <p className="text-xs text-slate-600 mt-2 mr-7">التوضيح: {item.explanation}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* In-app Certificate Modal */}
        {showCertificate && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
            <div className="bg-white max-w-xl w-full rounded-2xl border-2 border-[#B4832E] p-8 text-center shadow-2xl protected-surface">
              <div className="w-14 h-14 mx-auto rounded-full bg-[#0F2A4A]/10 text-[#0F2A4A] flex items-center justify-center mb-4">
                <Award className="w-8 h-8 text-[#B4832E]" />
              </div>
              <p className="text-xs font-semibold text-[#B4832E] mb-1">{siteName}</p>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">شهادة تفوق وإنجاز</h3>
              <p className="text-sm text-slate-600 mb-2">تشهد إدارة المنصة بأن الطالب المتميز</p>
              <p className="text-xl font-bold text-[#0F2A4A] mb-3">{studentName}</p>
              <p className="text-sm text-slate-700 leading-relaxed mb-6">
                قد أتم بنجاح اختبار <strong>{quiz.title}</strong> ({quiz.grade_name}) وحقق نسبة{' '}
                <span className="font-mono font-bold text-emerald-700">{result.percentage}%</span>.
              </p>
              <button
                type="button"
                onClick={() => setShowCertificate(false)}
                className="px-6 py-2.5 rounded-lg bg-[#0F2A4A] text-white text-sm font-semibold cursor-pointer"
              >
                إغلاق الشهادة
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const questions = quiz.questions || [];
  const currentQ = questions[currentIdx];
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-100">
        <div>
          <p className="text-xs text-slate-500 mb-1">
            {quiz.grade_name} · سؤال {currentIdx + 1} من {questions.length}
          </p>
          <h2 className="text-xl font-bold text-slate-900">{quiz.title}</h2>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono tabular-nums font-semibold ${
              secondsLeft < 60
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            إلغاء
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden my-5">
        <div
          className="h-full bg-[#0F2A4A] transition-all duration-300"
          style={{ width: `${((currentIdx + 1) / Math.max(1, questions.length)) * 100}%` }}
        />
      </div>

      {/* Question Card */}
      {currentQ && (
        <div className="py-2">
          <h3 className="text-lg font-bold text-slate-900 mb-5 leading-relaxed">
            {currentIdx + 1}. {currentQ.question_text}
          </h3>

          <div className="space-y-3">
            {currentQ.options.map((option, optIdx) => {
              const selected = answers[String(currentQ.id)] === optIdx;
              return (
                <button
                  key={optIdx}
                  type="button"
                  onClick={() =>
                    setAnswers((prev) => ({ ...prev, [String(currentQ.id!)]: optIdx }))
                  }
                  className={`w-full text-right px-4 py-3.5 rounded-xl border text-sm font-medium transition-all flex items-center gap-3 cursor-pointer ${
                    selected
                      ? 'border-[#0F2A4A] bg-[#0F2A4A]/5 text-[#0F2A4A] font-semibold'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-mono shrink-0 ${
                      selected
                        ? 'border-[#0F2A4A] bg-[#0F2A4A] text-white'
                        : 'border-slate-300 text-slate-500'
                    }`}
                  >
                    {optIdx + 1}
                  </span>
                  <span>{option}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-6 mt-6 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentIdx === 0}
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
            <span>السابق</span>
          </button>
          <button
            type="button"
            disabled={currentIdx >= questions.length - 1}
            onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
          >
            <span>التالي</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            تمت الإجابة: {answeredCount} / {questions.length}
          </span>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="px-5 py-2.5 rounded-lg bg-[#0F2A4A] text-white text-xs sm:text-sm font-semibold hover:opacity-95 disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'جاري التصحيح...' : 'إنهاء وتسليم الكويز'}
          </button>
        </div>
      </div>
    </div>
  );
};
