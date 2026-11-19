import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
} from 'lucide-react';
import type { VideoItem } from '../types';
import { withAuthToken } from '../lib/api';

interface ProtectedVideoPlayerProps {
  video: VideoItem;
  watermarkText: string;
  onWatched?: (videoId: number) => void;
}

function getEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v) return `https://www.youtube-nocookie.com/embed/${v}?rel=0&modestbranding=1&disablekb=0`;
      if (parsed.pathname.includes('/embed/')) {
        return `https://www.youtube-nocookie.com${parsed.pathname}?rel=0&modestbranding=1`;
      }
    }
    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.slice(1);
      if (id) return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
    }
    if (parsed.hostname.includes('vimeo.com')) {
      const id = parsed.pathname.split('/').filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${id}?dnt=1`;
    }
    if (parsed.hostname.includes('drive.google.com')) {
      const match = url.match(/\/d\/([^/]+)/);
      if (match?.[1]) return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
    return null;
  } catch {
    return null;
  }
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const ProtectedVideoPlayer: React.FC<ProtectedVideoPlayerProps> = ({
  video,
  watermarkText,
  onWatched,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackedRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wmPos, setWmPos] = useState({ top: 18, left: 16 });

  const embedUrl = video.source_type === 'url' ? getEmbedUrl(video.media_path) : null;
  const directStreamUrl =
    video.source_type === 'upload' ? withAuthToken(video.media_path) : video.media_path;

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    trackedRef.current = null;

    if (embedUrl && onWatched && trackedRef.current !== video.id) {
      trackedRef.current = video.id;
      onWatched(video.id);
    }
  }, [video.id, embedUrl, onWatched]);

  // Slowly shift watermark position inside video frame to discourage cropping
  useEffect(() => {
    const interval = window.setInterval(() => {
      setWmPos({
        top: 12 + Math.floor(Math.random() * 68),
        left: 10 + Math.floor(Math.random() * 64),
      });
    }, 6500);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const markWatchedOnce = () => {
    if (onWatched && trackedRef.current !== video.id) {
      trackedRef.current = video.id;
      onWatched(video.id);
    }
  };

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
      markWatchedOnce();
    } else {
      el.pause();
    }
  };

  const toggleMute = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = videoRef.current;
    if (!el) return;
    const val = Number(e.target.value);
    el.currentTime = val;
    setCurrentTime(val);
  };

  const cycleSpeed = () => {
    const el = videoRef.current;
    if (!el) return;
    const speeds = [1, 1.25, 1.5, 2];
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    el.playbackRate = next;
    setSpeed(next);
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  if (embedUrl) {
    return (
      <div
        ref={containerRef}
        onContextMenu={(e) => e.preventDefault()}
        className="protected-surface relative w-full aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-200 select-none"
      >
        <iframe
          src={embedUrl}
          title={video.title}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation"
        />
        {/* Top transparent shield bar blocking external link / copy title clicks */}
        <div
          onContextMenu={(e) => e.preventDefault()}
          className="absolute inset-x-0 top-0 h-14 z-10 pointer-events-auto"
          title="محتوى محمي"
        />
        <div
          aria-hidden="true"
          style={{ top: `${wmPos.top}%`, left: `${wmPos.left}%` }}
          className="pointer-events-none absolute z-20 px-2.5 py-1 rounded bg-black/35 text-white/60 text-xs font-mono transition-all duration-700"
        >
          {watermarkText}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => e.preventDefault()}
      className="protected-surface relative w-full aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-200 group select-none"
    >
      <video
        ref={videoRef}
        src={directStreamUrl}
        className="w-full h-full object-contain bg-black"
        playsInline
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        onPlay={() => {
          setPlaying(true);
          markWatchedOnce();
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onClick={togglePlay}
      />

      {/* Dynamic Student Watermark */}
      <div
        aria-hidden="true"
        style={{ top: `${wmPos.top}%`, left: `${wmPos.left}%` }}
        className="pointer-events-none absolute z-10 px-2.5 py-1 rounded bg-black/30 text-white/55 text-xs font-mono transition-all duration-700 select-none"
      >
        {watermarkText}
      </div>

      {/* Center Play Overlay when paused */}
      {!playing && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="تشغيل الفيديو"
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/25 hover:bg-black/35 transition-colors cursor-pointer"
        >
          <span className="w-16 h-16 rounded-full bg-white/95 text-[#0F2A4A] flex items-center justify-center shadow-lg transition-transform hover:scale-105">
            <Play className="w-7 h-7 fill-current mr-0.5" />
          </span>
        </button>
      )}

      {/* Custom Protected Control Bar (Zero Download / Zero Save) */}
      <div
        dir="ltr"
        className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pt-8 pb-3 flex flex-col gap-2"
      >
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.5}
          value={currentTime}
          onChange={handleSeek}
          aria-label="موضع التشغيل"
          className="w-full h-1.5 accent-[#B4832E] cursor-pointer rounded-lg"
        />

        <div className="flex items-center justify-between text-white text-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="p-1.5 rounded hover:bg-white/15 transition-colors cursor-pointer"
              title={playing ? 'إيقاف مؤقت' : 'تشغيل'}
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
                }
              }}
              className="p-1.5 rounded hover:bg-white/15 transition-colors cursor-pointer"
              title="رجوع 10 ثوانٍ"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={toggleMute}
              className="p-1.5 rounded hover:bg-white/15 transition-colors cursor-pointer"
              title={muted ? 'إلغاء الكتم' : 'كتم الصوت'}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <span className="font-mono tabular-nums text-white/85">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cycleSpeed}
              className="px-2 py-1 rounded bg-white/15 hover:bg-white/25 font-mono text-[11px] transition-colors cursor-pointer"
              title="سرعة التشغيل"
            >
              {speed}x
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 rounded hover:bg-white/15 transition-colors cursor-pointer"
              title="ملء الشاشة"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
