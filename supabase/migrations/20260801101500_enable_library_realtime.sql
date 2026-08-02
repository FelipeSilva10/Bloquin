-- O mural permanece autoritativo no banco; Realtime serve apenas para avisar
-- clientes já abertos de que publicações, destinos ou materiais mudaram.
do $$
declare
  table_name text;
begin
  if not exists (
    select 1
      from pg_catalog.pg_publication
     where pubname = 'supabase_realtime'
  ) then
    return;
  end if;

  foreach table_name in array array[
    'biblioteca_publicacoes',
    'biblioteca_publicacao_turmas',
    'biblioteca_anexos'
  ] loop
    if not exists (
      select 1
        from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end;
$$;
