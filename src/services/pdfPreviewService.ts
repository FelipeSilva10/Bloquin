import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/types/src/display/api';

let pdfModulePromise: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;

export interface PdfFirstPagePreview {
  thumbnail: File;
  pageCount: number;
}

export interface PdfDocumentHandle {
  document: PDFDocumentProxy;
  destroy: () => Promise<void>;
}

export async function renderPdfFirstPage(file: File): Promise<PdfFirstPagePreview> {
  const pdfjs = await loadPdfModule();
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const document = await loadingTask.promise;
    const page = await document.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1.8, 960 / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Não foi possível criar a prévia do PDF.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
    if (!blob) throw new Error('Não foi possível gerar a prévia da primeira página.');
    return {
      thumbnail: new File([blob], 'pdf-thumbnail.webp', { type: 'image/webp', lastModified: Date.now() }),
      pageCount: document.numPages,
    };
  } finally {
    await loadingTask.destroy();
  }
}

export async function openPdfDocument(url: string): Promise<PdfDocumentHandle> {
  const pdfjs = await loadPdfModule();
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({ url, rangeChunkSize: 65536 });
  try {
    const document = await loadingTask.promise;
    return { document, destroy: () => loadingTask.destroy() };
  } catch (error) {
    await loadingTask.destroy();
    throw error;
  }
}

export async function renderPdfPage(
  document: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  zoom: number,
  availableWidth?: number,
): Promise<{ page: PDFPageProxy; renderTask: ReturnType<PDFPageProxy['render']> }> {
  const page = await document.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const fitScale = availableWidth
    ? Math.min(1.6, Math.max(0.25, availableWidth / baseViewport.width))
    : 1;
  const cssScale = fitScale * zoom;
  const cssWidth = Math.ceil(baseViewport.width * cssScale);
  const cssHeight = Math.ceil(baseViewport.height * cssScale);
  const desiredOutputScale = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
  const dimensionScale = 8_192 / Math.max(cssWidth, cssHeight);
  const pixelScale = Math.sqrt(16_000_000 / Math.max(1, cssWidth * cssHeight));
  const outputScale = Math.max(0.5, Math.min(desiredOutputScale, dimensionScale, pixelScale));
  const viewport = page.getViewport({ scale: cssScale * outputScale });
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Não foi possível preparar o visualizador do PDF.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const renderTask = page.render({ canvas, canvasContext: context, viewport });
  return { page, renderTask };
}

async function loadPdfModule(): Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> {
  pdfModulePromise ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfModulePromise;
}
