import React, { useEffect, useState, useRef } from 'react';
import { ShieldAlert } from 'lucide-react';

interface ContentShieldProps {
  enabled: boolean;
  message: string;
  strictCaptureGuard: boolean;
  studentWatermark?: string;
  children: React.ReactNode;
}

export const ContentShield: React.FC<ContentShieldProps> = ({
  enabled,
  message,
  strictCaptureGuard,
  studentWatermark,
  children,
}) => {
  const [shieldActive, setShieldActive] = useState(false);
  const timerRef = useRef<number | null>(null);
  const shownAtRef = useRef<number>(0);
  const activeRecordingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled) {
      setShieldActive(false);
      return;
    }

    const exitFullscreenIfAny = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    };

    const showShield = (autoHideMs?: number) => {
      exitFullscreenIfAny();
      shownAtRef.current = Date.now();
      setShieldActive(true);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (autoHideMs) {
        timerRef.current = window.setTimeout(() => {
          if (
            !activeRecordingRef.current &&
            document.hasFocus() &&
            document.visibilityState === 'visible'
          ) {
            setShieldActive(false);
          }
        }, autoHideMs);
      }
    };

    const scheduleAutoDismiss = (minHoldMs = 1000) => {
      if (activeRecordingRef.current) return;
      if (!document.hasFocus() || document.visibilityState !== 'visible') return;
      const elapsed = Date.now() - shownAtRef.current;
      const waitMs = Math.max(120, minHoldMs - elapsed);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        if (
          !activeRecordingRef.current &&
          document.hasFocus() &&
          document.visibilityState === 'visible'
        ) {
          setShieldActive(false);
        }
      }, waitMs);
    };

    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // Always block right-click on images, videos, canvas, and protected containers
      if (
        strictCaptureGuard ||
        target?.tagName === 'IMG' ||
        target?.tagName === 'VIDEO' ||
        target?.tagName === 'CANVAS' ||
        target?.closest('.protected-surface')
      ) {
        e.preventDefault();
      }
    };

    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        strictCaptureGuard ||
        target?.tagName === 'IMG' ||
        target?.tagName === 'VIDEO' ||
        target?.closest('.protected-surface')
      ) {
        e.preventDefault();
      }
    };

    const handleCopyOrCut = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        strictCaptureGuard &&
        target &&
        !['INPUT', 'TEXTAREA'].includes(target.tagName)
      ) {
        e.preventDefault();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const rawKey = typeof e.key === 'string' ? e.key : '';
      const key = rawKey.toLowerCase();
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      // PrintScreen / Screenshot / Screen-recording hotkeys (active for all users)
      if (
        rawKey === 'PrintScreen' ||
        e.code === 'PrintScreen' ||
        (e.metaKey && e.shiftKey && ['3', '4', '5', 's'].includes(key)) ||
        (e.ctrlKey && e.shiftKey && ['s', 'i', 'j', 'c'].includes(key))
      ) {
        e.preventDefault();
        showShield(2000);
        try {
          navigator.clipboard?.writeText?.('');
        } catch {
          // ignore clipboard permissions
        }
        return;
      }

      // Block Save (Ctrl+S), Print (Ctrl+P), View Source (Ctrl+U), F12
      if (
        (isCtrlOrMeta && ['s', 'p', 'u'].includes(key)) ||
        rawKey === 'F12'
      ) {
        if (strictCaptureGuard || key === 'p') {
          e.preventDefault();
          showShield(1800);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const rawKey = typeof e.key === 'string' ? e.key : '';
      if (rawKey === 'PrintScreen' || e.code === 'PrintScreen') {
        showShield(2000);
        try {
          navigator.clipboard?.writeText?.('');
        } catch {
          // ignore
        }
      }
    };

    const handleBeforePrint = () => {
      showShield();
    };

    const handleAfterPrint = () => {
      scheduleAutoDismiss(900);
    };

    const handleEnterPiP = () => {
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture?.().catch(() => {});
      }
      showShield(2000);
    };

    const handleBlur = () => {
      if (strictCaptureGuard) {
        showShield();
      }
    };

    const handleFocus = () => {
      if (strictCaptureGuard) {
        scheduleAutoDismiss(1000);
      }
    };

    const handleVisibilityChange = () => {
      if (!strictCaptureGuard) return;
      if (document.visibilityState !== 'visible') {
        showShield();
      } else {
        scheduleAutoDismiss(900);
      }
    };

    const handlePageHide = () => {
      if (strictCaptureGuard) {
        showShield();
      }
    };

    // Intercept screen-share / recording API attempts for all roles while enabled
    let originalGetDisplayMedia: typeof navigator.mediaDevices.getDisplayMedia | undefined;
    if (navigator.mediaDevices?.getDisplayMedia) {
      originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getDisplayMedia = async (...args) => {
        activeRecordingRef.current = true;
        showShield();
        try {
          const stream = await originalGetDisplayMedia!(...args);
          const tracks = stream.getTracks();
          const checkEnded = () => {
            if (tracks.every((t) => t.readyState === 'ended')) {
              activeRecordingRef.current = false;
              scheduleAutoDismiss(600);
            }
          };
          tracks.forEach((track) => {
            track.addEventListener('ended', checkEnded);
          });
          return stream;
        } catch (err) {
          activeRecordingRef.current = false;
          scheduleAutoDismiss(1500);
          throw err;
        }
      };
    }

    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('dragstart', handleDragStart, true);
    document.addEventListener('copy', handleCopyOrCut, true);
    document.addEventListener('cut', handleCopyOrCut, true);
    document.addEventListener('enterpictureinpicture', handleEnterPiP, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('dragstart', handleDragStart, true);
      document.removeEventListener('copy', handleCopyOrCut, true);
      document.removeEventListener('cut', handleCopyOrCut, true);
      document.removeEventListener('enterpictureinpicture', handleEnterPiP, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (originalGetDisplayMedia && navigator.mediaDevices) {
        navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia;
      }
    };
  }, [enabled, strictCaptureGuard]);

  return (
    <div className={strictCaptureGuard ? 'protected-surface relative min-h-screen' : 'relative min-h-screen'}>
      <div
        className={
          shieldActive
            ? 'blur-2xl opacity-0 pointer-events-none select-none transition-all duration-75'
            : 'transition-all duration-150'
        }
      >
        {children}
      </div>

      {/* Subtle floating student watermark across content when strict guard is on */}
      {strictCaptureGuard && studentWatermark && !shieldActive && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-30 overflow-hidden opacity-[0.035] select-none"
        >
          <div className="grid grid-cols-3 gap-24 -rotate-12 scale-125 py-20 text-center font-bold text-slate-900 text-lg">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i}>{studentWatermark}</span>
            ))}
          </div>
        </div>
      )}

      {/* Fullscreen Anti-Capture / Anti-Screenshot Curtain */}
      {shieldActive && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-950 text-white px-6 text-center select-none"
        >
          <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mb-6">
            <ShieldAlert className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            {message || 'لا يمكنك اخذ المحتوى'}
          </h2>
          <p className="text-slate-400 text-sm md:text-base max-w-md leading-relaxed">
            المحتوى محمي ضد النسخ، الحفظ، لقطات الشاشة، أو تسجيل الشاشة. سيعود العرض تلقائياً فور إنهاء المحاولة والعودة إلى نافذة المنصة.
          </p>
        </div>
      )}
    </div>
  );
};
