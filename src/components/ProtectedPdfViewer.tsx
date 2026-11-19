import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChevronRight, ChevronLeft, ZoomIn, ZoomOut, FileText, Loader2 } from 'lucide-react';
import type { PdfItem } from '../types';
import { withAuthToken } from '../lib/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface ProtectedPdfViewerProps {
  pdf: PdfItem;
  watermarkText: string;
  onViewed?: (pdfId: number) => void;
}

export const ProtectedPdfViewer: React.FC<ProtectedPdfViewerProps> = ({
  pdf,
  watermarkText,
  onViewed,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fallbackIframeUrl, setFallbackIframeUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFallbackIframeUrl(null);
    setPageNumber(1);
    setPdfDoc(null);

    async function loadPdf() {
      try {
        const targetUrl =
          pdf.source_type === 'upload' ? withAuthToken(pdf.file_path) : pdf.file_path;

        // Google Drive link handling
        if (pdf.source_type === 'url' && targetUrl.includes('drive.google.com')) {
          const match = targetUrl.match(/\/d\/([^/]+)/);
          if (match?.[1]) {
            if (!cancelled) {
              setFallbackIframeUrl(`https://drive.google.com/file/d/${match[1]}/preview`);
              setLoading(false);
              onViewed?.(pdf.id);
            }
            return;
          }
        }

        const res = await fetch(targetUrl, { credentials: 'include' });
        if (!res.ok) throw new Error('تعذر تحميل ملف الـ PDF');
        const buffer = await res.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: buffer });
        const doc = await loadingTask.promise;

        if (cancelled) {
          loadingTask.destroy().catch(() => {});
          return;
        }
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
        onViewed?.(pdf.id);
      } catch {
        if (!cancelled) {
          if (pdf.source_type === 'url') {
            setFallbackIframeUrl(`${pdf.file_path}#toolbar=0&navpanes=0&scrollbar=1`);
            setLoading(false);
            onViewed?.(pdf.id);
          } else {
            setError('تعذر عرض ملف الـ PDF المحمي. تأكد من صلاحية الملف.');
            setLoading(false);
          }
        }
      }
    }

    loadPdf();
    return () => {
      cancelled = true;
    };
  }, [pdf.id, pdf.file_path, pdf.source_type]);

  useEffect(() => {
    let renderTask: pdfjsLib.RenderTask | null = null;
    let cancelled = false;

    async function renderPage() {
      if (!pdfDoc || !canvasRef.current) return;
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform =
          outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        renderTask = page.render({
          canvas,
          canvasContext: context,
          transform,
          viewport,
        });
        await renderTask.promise;
      } catch {
        // ignore cancelled render tasks
      }
    }

    renderPage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDoc, pageNumber, scale]);

  if (fallbackIframeUrl) {
    return (
      <div
        onContextMenu={(e) => e.preventDefault()}
        className="protected-surface relative w-full h-[640px] bg-slate-100 rounded-xl overflow-hidden border border-slate-200 select-none"
      >
        <iframe
          src={fallbackIframeUrl}
          title={pdf.title}
          className="w-full h-full border-0"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-15 -rotate-12 text-slate-900 font-bold text-xl select-none"
        >
          {watermarkText}
        </div>
      </div>
    );
  }

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="protected-surface flex flex-col bg-slate-100 rounded-xl border border-slate-200 overflow-hidden select-none"
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <FileText className="w-4 h-4 text-[#0F2A4A]" />
          <span className="truncate max-w-xs">{pdf.title}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pageNumber <= 1 || loading}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            title="الصفحة السابقة"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="px-2 text-xs font-mono tabular-nums text-slate-700">
            {numPages > 0 ? `${pageNumber} / ${numPages}` : '—'}
          </span>
          <button
            type="button"
            disabled={pageNumber >= numPages || loading}
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            title="الصفحة التالية"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-slate-200 mx-1" />

          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.75, Number((s - 0.2).toFixed(2))))}
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer"
            title="تصغير"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono tabular-nums text-slate-600 w-11 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(2.4, Number((s + 0.2).toFixed(2))))}
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer"
            title="تكبير"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div className="relative min-h-[480px] max-h-[720px] overflow-auto p-6 flex items-start justify-center bg-slate-200/70">
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-600 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#0F2A4A]" />
            <span className="text-sm font-medium">جاري تجهيز عرض الملف المحمي...</span>
          </div>
        )}
        {error && (
          <div className="py-20 text-center text-red-600 text-sm font-medium">{error}</div>
        )}
        {!loading && !error && (
          <div className="relative inline-block shadow-md bg-white">
            <canvas
              ref={canvasRef}
              onContextMenu={(e) => e.preventDefault()}
              className="block max-w-full"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.07] -rotate-12 text-slate-900 font-bold text-2xl select-none"
            >
              {watermarkText}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
