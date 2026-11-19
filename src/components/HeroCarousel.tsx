import React, { useEffect, useState } from 'react';
import { ChevronRight, ChevronLeft, ArrowLeft } from 'lucide-react';
import type { HeroSlide } from '../types';

interface HeroCarouselProps {
  slides: HeroSlide[];
  intervalMs: number;
  accentColor: string;
  onActionClick?: (section: string) => void;
}

export const HeroCarousel: React.FC<HeroCarouselProps> = ({
  slides,
  intervalMs,
  accentColor,
  onActionClick,
}) => {
  const activeSlides = slides.filter((s) => s.is_active === 1);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= activeSlides.length && activeSlides.length > 0) {
      setIndex(0);
    }
  }, [activeSlides.length, index]);

  useEffect(() => {
    if (activeSlides.length <= 1) return;
    const ms = Math.max(2500, intervalMs || 5000);
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % activeSlides.length);
    }, ms);
    return () => window.clearInterval(id);
  }, [activeSlides.length, intervalMs]);

  if (activeSlides.length === 0) return null;

  const current = activeSlides[index] || activeSlides[0];

  const sectionLabels: Record<string, string> = {
    videos: 'استكشف الدروس المرئية',
    pdfs: 'تصفح ملخصات PDF',
    quizzes: 'ابدأ الاختبارات الآن',
  };

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="protected-surface relative w-full h-56 sm:h-72 lg:h-84 rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 select-none"
    >
      {activeSlides.map((slide, i) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-opacity duration-700 ease-out ${
            i === index ? 'opacity-100 z-0' : 'opacity-0 pointer-events-none'
          }`}
        >
          <img
            src={slide.image_url}
            alt={slide.title || 'بانر المنصة'}
            draggable={false}
            referrerPolicy="no-referrer"
            className="protected-media w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-slate-950/20" />
        </div>
      ))}

      {/* Content Overlay */}
      <div className="relative z-10 h-full flex flex-col justify-end p-6 sm:p-8 lg:p-10 max-w-3xl text-white">
        {current.title && (
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold leading-snug mb-2 text-balance">
            {current.title}
          </h2>
        )}
        {current.subtitle && (
          <p className="text-sm sm:text-base text-slate-200 leading-relaxed mb-4 max-w-2xl">
            {current.subtitle}
          </p>
        )}
        {current.link_section && onActionClick && (
          <div>
            <button
              type="button"
              onClick={() => onActionClick(current.link_section)}
              style={{ backgroundColor: accentColor || '#B4832E' }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold text-white hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{sectionLabels[current.link_section] || 'استكشف القسم'}</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Controls */}
      {activeSlides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setIndex((prev) => (prev - 1 + activeSlides.length) % activeSlides.length)}
            aria-label="الشريحة السابقة"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/40 hover:bg-black/65 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setIndex((prev) => (prev + 1) % activeSlides.length)}
            aria-label="الشريحة التالية"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/40 hover:bg-black/65 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="absolute bottom-4 left-6 z-20 flex items-center gap-1.5">
            {activeSlides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`الانتقال للبانر ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  i === index ? 'w-7 bg-white' : 'w-2 bg-white/45 hover:bg-white/75'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
