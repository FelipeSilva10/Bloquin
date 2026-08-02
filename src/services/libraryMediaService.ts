import { renderPdfFirstPage } from './pdfPreviewService';
import { normalizeExternalLink } from './libraryValidation';
export { normalizeExternalLink } from './libraryValidation';

export const LIBRARY_BUCKET = 'biblioteca-media';
export const MAX_IMAGE_INPUT_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 25_000_000;
export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_PDF_PAGES = 200;
export const MAX_ATTACHMENTS_PER_POST = 10;
export const MAX_RICH_TEXT_CHARS = 100_000;

export interface OptimizedImage {
  display: File;
  thumbnail: File;
  original: File;
  width: number;
  height: number;
}

export interface ValidatedPdf {
  file: File;
  thumbnail: File;
  previewUrl: string;
  pageCount: number;
}

export function sanitizeRichText(value: string): string {
  if (typeof DOMParser === 'undefined') return '';

  const documentFragment = new DOMParser().parseFromString(value, 'text/html');
  const allowedTags = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'UL', 'OL', 'LI', 'H2', 'H3', 'BLOCKQUOTE', 'DIV', 'A', 'PRE', 'CODE']);
  const elements = Array.from(documentFragment.body.querySelectorAll('*'));

  elements.forEach((element) => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(documentFragment.createTextNode(element.textContent ?? ''));
      return;
    }

    if (element.tagName === 'A') {
      const originalHref = (element as HTMLAnchorElement).getAttribute('href');
      const safeHref = originalHref ? normalizeExternalLink(originalHref) : null;
      if (!safeHref) {
        element.replaceWith(documentFragment.createTextNode(element.textContent ?? ''));
        return;
      }
      Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
      element.setAttribute('href', safeHref);
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer nofollow');
      return;
    }

    Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
  });

  return documentFragment.body.innerHTML.trim();
}

export function richTextToPlainText(value: string): string {
  if (typeof DOMParser === 'undefined') return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const documentFragment = new DOMParser().parseFromString(value, 'text/html');
  return (documentFragment.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export async function processImageFile(file: File): Promise<OptimizedImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Use uma imagem JPEG, PNG ou WebP.');
  }
  if (file.size > MAX_IMAGE_INPUT_BYTES) {
    throw new Error('A imagem original deve ter no máximo 15 MB.');
  }

  const image = await decodeImage(file);
  try {
    if (image.width * image.height > MAX_IMAGE_PIXELS) {
      throw new Error('A imagem possui dimensões muito grandes. Reduza-a antes de enviar.');
    }

    const width = image.width;
    const height = image.height;
    const display = await renderImageVariant(image, 3840, 0.92, 'imagem.webp');
    const thumbnail = await renderImageVariant(image, 960, 0.82, 'thumbnail.webp');
    return { display, thumbnail, original: file, width, height };
  } finally {
    closeDecodedImage(image);
  }
}

export async function validatePdfFile(file: File): Promise<ValidatedPdf> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Selecione um arquivo PDF.');
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error('O PDF deve ter no máximo 25 MB.');
  }

  const header = await file.slice(0, 5).text();
  if (header !== '%PDF-') {
    throw new Error('O arquivo selecionado não parece ser um PDF válido.');
  }

  const preview = await renderPdfFirstPage(file);
  if (preview.pageCount > MAX_PDF_PAGES) {
    throw new Error(`O PDF deve ter no máximo ${MAX_PDF_PAGES} páginas.`);
  }
  return { file, thumbnail: preview.thumbnail, previewUrl: URL.createObjectURL(preview.thumbnail), pageCount: preview.pageCount };
}

export function getYoutubePreviewUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function revokeMediaPreview(url?: string): void {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) return createImageBitmap(file);

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function closeDecodedImage(image: ImageBitmap | HTMLImageElement): void {
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
}

async function renderImageVariant(
  image: ImageBitmap | HTMLImageElement,
  maxDimension: number,
  quality: number,
  name: string,
): Promise<File> {
  const scale = Math.min(1, maxDimension / image.width, maxDimension / image.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar a imagem.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  if (!blob) throw new Error('Não foi possível comprimir a imagem.');
  return new File([blob], name, { type: 'image/webp', lastModified: Date.now() });
}
