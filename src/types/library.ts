export type LibraryPostStatus = 'draft' | 'published' | 'archived';
export type LibraryAttachmentType = 'image' | 'pdf' | 'youtube' | 'link';

export interface LibraryAttachment {
  id: string;
  publicacao_id: string;
  tipo: LibraryAttachmentType;
  provider: string | null;
  titulo: string | null;
  descricao: string | null;
  ordem: number;
  pode_baixar: boolean;
  mime_type: string | null;
  tamanho_bytes: number | null;
  largura: number | null;
  altura: number | null;
  quantidade_paginas: number | null;
  storage_path: string | null;
  thumbnail_path: string | null;
  original_path: string | null;
  external_url: string | null;
  external_id: string | null;
  status: 'uploading' | 'ready' | 'failed';
  criado_em: string;
  thumbnail_url?: string;
  content_url?: string;
  download_url?: string;
}

export interface LibraryPost {
  id: string;
  autor_id: string;
  autor_nome: string;
  titulo: string;
  conteudo_json: Record<string, unknown>;
  conteudo_texto: string;
  status: LibraryPostStatus;
  capa_anexo_id: string | null;
  publicado_em: string | null;
  atualizado_em: string;
  criado_em: string;
  excluido_em: string | null;
  anexos: LibraryAttachment[];
  turma_ids: string[];
  media_signed_at?: number;
}

export interface LibraryClass {
  id: string;
  nome: string;
  ano_letivo: string;
}

export interface LibraryPostInput {
  id?: string;
  autor_nome: string;
  titulo: string;
  conteudo_html: string;
  conteudo_texto: string;
  turma_ids: string[];
  attachments: LibraryAttachmentInput[];
  removed_attachment_ids?: string[];
  attachment_order?: string[];
  attachment_updates?: LibraryAttachmentUpdate[];
  status: Extract<LibraryPostStatus, 'draft' | 'published'>;
}

export interface LibraryAttachmentUpdate {
  id: string;
  title: string;
  description: string;
  type?: Extract<LibraryAttachmentType, 'youtube' | 'link'>;
  url?: string;
}

export interface LibraryAttachmentInput {
  clientId?: string;
  type: 'image' | 'pdf' | 'youtube' | 'link';
  title?: string;
  description?: string;
  file?: File;
  youtubeUrl?: string;
  youtubeId?: string;
  url?: string;
  order: number;
  previewUrl?: string;
  mimeType?: string;
  pdfThumbnail?: File;
  pdfPageCount?: number;
}
