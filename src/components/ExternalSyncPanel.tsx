import React, { useCallback, useEffect, useState } from 'react';
import {
  Link2,
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  Download,
  Upload,
  Check,
  ArrowDownToLine,
  ArrowUpFromLine,
  Sparkles,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { IntegrationConfig, User } from '../types';

interface ExternalSyncPanelProps {
  users: User[];
  onUsersChanged: () => Promise<void>;
  onNotify: (type: 'ok' | 'err', text: string) => void;
}

export const ExternalSyncPanel: React.FC<ExternalSyncPanelProps> = ({
  users,
  onUsersChanged,
  onNotify,
}) => {
  const [config, setConfig] = useState<IntegrationConfig | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const loadConfig = useCallback(async () => {
    try {
      const data = await apiFetch<IntegrationConfig>('/api/integration/config');
      setConfig(data);
    } catch (err) {
      onNotify('err', (err as Error).message);
    }
  }, [onNotify]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const copyText = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      onNotify('err', 'تعذر النسخ التلقائي، يمكنك النسخ يدوياً');
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setBusy(true);
    try {
      await apiFetch('/api/integration/config', {
        method: 'PUT',
        body: JSON.stringify({
          external_api_key: config.external_api_key,
          remote_sync_url: config.remote_sync_url,
          remote_sync_api_key: config.remote_sync_api_key,
          webhook_url: config.webhook_url,
          auto_sync_enabled: config.auto_sync_enabled,
        }),
      });
      onNotify('ok', 'تم حفظ إعدادات الربط الخارجي');
      await loadConfig();
    } catch (err) {
      onNotify('err', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRotateKey = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{ external_api_key: string }>('/api/integration/rotate-key', {
        method: 'POST',
      });
      setConfig((prev) => (prev ? { ...prev, external_api_key: res.external_api_key } : prev));
      onNotify('ok', 'تم توليد مفتاح ربط جديد');
      await loadConfig();
    } catch (err) {
      onNotify('err', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handlePull = async () => {
    if (!config?.remote_sync_url) {
      onNotify('err', 'أدخل رابط API الموقع الآخر أولاً');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ summary: string }>('/api/integration/pull', {
        method: 'POST',
        body: JSON.stringify({
          url: config.remote_sync_url,
          api_key: config.remote_sync_api_key,
        }),
      });
      onNotify('ok', res.summary);
      await onUsersChanged();
      await loadConfig();
    } catch (err) {
      onNotify('err', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handlePush = async () => {
    if (!config?.remote_sync_url) {
      onNotify('err', 'أدخل رابط API الموقع الآخر أولاً');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ summary: string }>('/api/integration/push', {
        method: 'POST',
        body: JSON.stringify({
          url: config.remote_sync_url,
          api_key: config.remote_sync_api_key,
        }),
      });
      onNotify('ok', res.summary);
      await loadConfig();
    } catch (err) {
      onNotify('err', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleImportJson = async () => {
    if (!importJsonText.trim()) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(importJsonText);
      const res = await apiFetch<{ summary: string }>('/api/integration/import-json', {
        method: 'POST',
        body: JSON.stringify(Array.isArray(parsed) ? { users: parsed } : parsed),
      });
      setImportJsonText('');
      onNotify('ok', res.summary);
      await onUsersChanged();
      await loadConfig();
    } catch (err) {
      onNotify('err', `صيغة JSON غير صالحة: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadExport = () => {
    const payload = JSON.stringify({ users }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fekra-users-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!config) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
        جاري تحميل إعدادات الربط...
      </div>
    );
  }

  const readyAiStudioPrompt = `اربط هذا الموقع بقاعدة بيانات الأسماء وكلمات المرور والرتب (طلاب ومشرفين وأدمن) في موقعي الآخر عبر واجهة API التالية:
- الرابط الأساسي (EXTERNAL_API_BASE_URL): ${origin}
- المفتاح السري في الهيدر (EXTERNAL_API_KEY): X-API-Key: ${config.external_api_key}
- للتحقق المباشر من تسجيل الدخول بنفس الاسم وكلمة المرور المسجلة هناك: POST ${origin}/api/external/verify-login (يرسل JSON يحتوي على username و password، ويرجع valid: true مع بيانات المستخدم)
- لجلب جميع الحسابات (طلاب/مشرفين/أدمن): GET ${origin}/api/external/users (أو أضف ?include_hashes=1 لجلب password_hash المشفر بـ bcrypt للمطابقة المحلية)
- لإضافة أو تحديث حساب: POST ${origin}/api/external/users (يرسل username, full_name, password, role, grade_name)
- لجلب الصفوف الدراسية: GET ${origin}/api/external/grades`;

  return (
    <div className="space-y-6">
      {/* Section 1: Inbound API Credentials for the Other Google AI Studio Site */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-[#0F2A4A]" />
              <span>ربط قاعدة بيانات الطلاب والأدمن والمشرفين مع موقعك الآخر</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              استخدم هذه البيانات لربط موقعك الآخر في Google AI Studio بقاعدة بيانات الحسابات هنا بشكل فوري وآمن.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
            {users.length} حساب جاهز للمزامنة
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              رابط جلب/تحديث الحسابات (Users API Endpoint)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                dir="ltr"
                value={`${origin}/api/external/users`}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-800"
              />
              <button
                type="button"
                onClick={() => copyText('url', `${origin}/api/external/users`)}
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
                title="نسخ الرابط"
              >
                {copiedId === 'url' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              مفتاح الربط السري / السيكرت (X-API-Key) — قابل للتعديل
            </label>
            <div className="flex items-center gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                dir="ltr"
                value={config.external_api_key}
                onChange={(e) => setConfig({ ...config, external_api_key: e.target.value })}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-800"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
                title={showKey ? 'إخفاء' : 'إظهار'}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => copyText('key', config.external_api_key)}
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
                title="نسخ المفتاح"
              >
                {copiedId === 'key' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleSaveConfig}
                className="px-2.5 py-2 rounded-lg bg-[#0F2A4A] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                title="حفظ المفتاح"
              >
                حفظ
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleRotateKey}
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
                title="توليد مفتاح جديد"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* One-Click Copy Prompt for the Other AI Studio App */}
        <div className="p-4 rounded-xl bg-[#0F2A4A]/5 border border-[#0F2A4A]/20 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0F2A4A]">
              <Sparkles className="w-4 h-4 text-[#B4832E]" />
              <span>أمر ربط جاهز للموقع الآخر في Google AI Studio</span>
            </div>
            <button
              type="button"
              onClick={() => copyText('prompt', readyAiStudioPrompt)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0F2A4A] text-white text-xs font-semibold cursor-pointer"
            >
              {copiedId === 'prompt' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedId === 'prompt' ? 'تم النسخ!' : 'نسخ أمر الربط للموقع الآخر'}</span>
            </button>
          </div>
          <pre
            dir="rtl"
            className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-200 whitespace-pre-wrap leading-relaxed font-sans"
          >
            {readyAiStudioPrompt}
          </pre>
        </div>
      </div>

      {/* Section 2: Bidirectional Remote Sync (Pull / Push / Webhook) */}
      <form
        onSubmit={handleSaveConfig}
        className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
      >
        <div>
          <h3 className="text-base font-bold text-slate-900">
            المزامنة المباشرة مع رابط الموقع الآخر (سحب / دفع / إشعار تلقائي)
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            إذا كان لديك رابط API في الموقع الآخر، أدخله هنا لسحب الحسابات منه أو إرسال الحسابات إليه.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              رابط API الحسابات في الموقع الآخر
            </label>
            <input
              type="url"
              dir="ltr"
              value={config.remote_sync_url}
              onChange={(e) => setConfig({ ...config, remote_sync_url: e.target.value })}
              placeholder="https://other-app.run.app/api/users"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-right"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              مفتاح API الموقع الآخر (إن وجد)
            </label>
            <input
              type="text"
              dir="ltr"
              value={config.remote_sync_api_key}
              onChange={(e) => setConfig({ ...config, remote_sync_api_key: e.target.value })}
              placeholder="API Key أو Bearer Token"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-right"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              رابط Webhook للإشعار الفوري عند إضافة/تعديل/حذف أي حساب هنا (اختياري)
            </label>
            <input
              type="url"
              dir="ltr"
              value={config.webhook_url}
              onChange={(e) => setConfig({ ...config, webhook_url: e.target.value })}
              placeholder="https://other-app.run.app/api/webhook/users"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-right"
            />
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={config.auto_sync_enabled === 1}
            onChange={(e) =>
              setConfig({ ...config, auto_sync_enabled: e.target.checked ? 1 : 0 })
            }
          />
          <span>تفعيل الإرسال التلقائي (Webhook) فور تعديل أي حساب</span>
        </label>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2 rounded-xl bg-[#0F2A4A] text-white text-xs font-semibold cursor-pointer"
          >
            حفظ إعدادات الربط
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handlePull}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer"
          >
            <ArrowDownToLine className="w-4 h-4 text-emerald-700" />
            <span>سحب الحسابات من الموقع الآخر</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handlePush}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer"
          >
            <ArrowUpFromLine className="w-4 h-4 text-[#B4832E]" />
            <span>إرسال جميع الحسابات للموقع الآخر</span>
          </button>
        </div>
      </form>

      {/* Section 3: Instant JSON Export / Import */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">تصدير واستيراد الحسابات (JSON)</h3>
            <p className="text-xs text-slate-500">
              صدّر قائمة الطلاب والمشرفين والأدمن بضغطة زر أو استورد قائمة من موقعك الآخر مباشرة.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadExport}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>تنزيل ملف الحسابات JSON</span>
          </button>
        </div>

        <textarea
          rows={3}
          dir="ltr"
          value={importJsonText}
          onChange={(e) => setImportJsonText(e.target.value)}
          placeholder='[{"username":"student1","full_name":"سالم علي","password":"123456","role":"student","grade_name":"الأول المتوسط"}]'
          className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-left"
        />
        <button
          type="button"
          disabled={busy || !importJsonText.trim()}
          onClick={handleImportJson}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          <span>استيراد ودمج الحسابات</span>
        </button>
      </div>

      {/* Section 4: Sync Logs */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
        <h3 className="text-base font-bold text-slate-900">سجل عمليات الربط والمزامنة</h3>
        {config.logs.length === 0 ? (
          <p className="text-xs text-slate-500">لا توجد عمليات مزامنة مسجلة حتى الآن.</p>
        ) : (
          <div className="space-y-2">
            {config.logs.map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/70 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`font-semibold ${
                      log.status === 'success' ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    {log.status === 'success' ? 'ناجح' : 'تعذر'}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-800">{log.summary}</span>
                </div>
                <span className="font-mono text-[11px] text-slate-500">{log.created_at}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
