-- A FK usada para a capa é consultada e atualizada junto com as publicações.
-- O índice evita scans ao resolver ou limpar a capa de uma publicação.
create index if not exists biblioteca_publicacoes_capa_anexo_idx
  on public.biblioteca_publicacoes (capa_anexo_id);
