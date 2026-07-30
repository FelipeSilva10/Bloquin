alter table public.biblioteca_anexos
  add constraint biblioteca_anexos_metadata_length_check check (
    (titulo is null or char_length(titulo) <= 180)
    and (descricao is null or char_length(descricao) <= 500)
  );

