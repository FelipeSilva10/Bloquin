begin;

create extension if not exists pgtap with schema extensions;

set local search_path = extensions, public, pg_catalog;

select plan(25);

select has_table('public', 'biblioteca_publicacoes', 'o mural possui publicações');
select has_table('public', 'biblioteca_anexos', 'o mural possui anexos');

select ok(
  exists (select 1 from storage.buckets where id = 'biblioteca-media'),
  'o bucket privado da Biblioteca é reproduzido pelas migrations'
);
select is(
  (select public from storage.buckets where id = 'biblioteca-media'),
  false,
  'o bucket da Biblioteca não é público'
);
select is(
  (select file_size_limit from storage.buckets where id = 'biblioteca-media'),
  26214400::bigint,
  'o bucket limita cada objeto a 25 MiB'
);
select ok(
  (
    select allowed_mime_types @> array[
      'image/webp',
      'image/jpeg',
      'image/png',
      'application/pdf'
    ]::text[]
      and cardinality(allowed_mime_types) = 4
    from storage.buckets
    where id = 'biblioteca-media'
  ),
  'o bucket aceita somente as mídias processadas pelo cliente'
);

select is(
  (
    select string_agg(policy.cmd, ',' order by policy.cmd)
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname like 'biblioteca_storage_%'
  ),
  'DELETE,INSERT,SELECT',
  'Storage possui policies separadas de inserção, leitura e remoção'
);
select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname like 'biblioteca_storage_%'
      and policy.roles <> array['authenticated']::name[]
  ),
  'as policies de mídia são exclusivas de usuários autenticados'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'biblioteca_storage_insert'
      and lower(policy.with_check) ~ 'foldername'
      and lower(policy.with_check) ~ 'auth.uid'
      and lower(policy.with_check) ~ 'current_profile_role'
      and lower(policy.with_check) ~ '''teacher'''
  ),
  'somente professor autenticado envia para o próprio diretório'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'biblioteca_storage_select'
      and lower(policy.qual) ~ 'foldername'
      and lower(policy.qual) ~ 'current_profile_role'
      and lower(policy.qual) ~ 'biblioteca_can_read_publicacao'
  ),
  'a leitura cobre limpeza do professor e materiais visíveis ao aluno'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'biblioteca_storage_delete'
      and lower(policy.qual) ~ 'foldername'
      and lower(policy.qual) ~ 'current_profile_role'
      and lower(policy.qual) ~ 'biblioteca_can_manage_publicacao'
  ),
  'a remoção fica limitada ao professor proprietário'
);
select ok(
  exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'biblioteca_anexos_storage_path_idx')
  and exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'biblioteca_anexos_thumbnail_path_idx')
  and exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'biblioteca_anexos_original_path_idx'),
  'as três buscas por caminho usadas nas policies possuem índice'
);
select ok(
  exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'biblioteca_anexos_tipo_publicacao_idx'),
  'o filtro de material possui índice por tipo e publicação'
);
select is(
  (
    select count(*)::integer
      from pg_catalog.pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename in (
         'biblioteca_publicacoes',
         'biblioteca_publicacao_turmas',
         'biblioteca_anexos'
       )
  ),
  3,
  'publicações, destinos e anexos notificam murais já abertos'
);
select ok(
  not exists (
    select 1
      from information_schema.table_privileges privilege
     where privilege.table_schema = 'public'
       and privilege.table_name in (
         'biblioteca_publicacoes',
         'biblioteca_publicacao_turmas',
         'biblioteca_anexos'
       )
       and privilege.grantee in ('PUBLIC', 'anon')
  ),
  'PUBLIC e anon não recebem grants nas tabelas do mural'
);
select ok(
  not exists (
    select 1
      from information_schema.table_privileges privilege
     where privilege.table_schema = 'public'
       and privilege.table_name in (
         'biblioteca_publicacoes',
         'biblioteca_publicacao_turmas',
         'biblioteca_anexos'
       )
       and privilege.grantee = 'authenticated'
       and (
         (privilege.table_name = 'biblioteca_publicacao_turmas'
          and privilege.privilege_type not in ('SELECT', 'INSERT', 'DELETE'))
         or (privilege.table_name in ('biblioteca_publicacoes', 'biblioteca_anexos')
             and privilege.privilege_type not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
       )
  ),
  'authenticated recebe somente os privilégios de CRUD necessários ao mural'
);

insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('81000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'library-teacher-a@test.local', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('81000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'library-teacher-b@test.local', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('82000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'library-student-a@test.local', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('82000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'library-student-b@test.local', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

insert into public.escolas (id, nome, updated_at)
values
  ('83000000-0000-0000-0000-000000000001', 'Escola Biblioteca A', now()),
  ('83000000-0000-0000-0000-000000000002', 'Escola Biblioteca B', now());

insert into public.perfis (id, nome, role, email)
values
  ('81000000-0000-0000-0000-000000000001', 'Professora Biblioteca A', 'teacher', 'library-teacher-a@test.local'),
  ('81000000-0000-0000-0000-000000000002', 'Professor Biblioteca B', 'teacher', 'library-teacher-b@test.local');

insert into public.turmas (id, escola_id, nome, ano_letivo, professor_id)
values
  ('84000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', 'Turma Biblioteca A', '2026', '81000000-0000-0000-0000-000000000001'),
  ('84000000-0000-0000-0000-000000000002', '83000000-0000-0000-0000-000000000002', 'Turma Biblioteca B', '2026', '81000000-0000-0000-0000-000000000002');

insert into public.perfis (id, nome, role, turma_id, email)
values
  ('82000000-0000-0000-0000-000000000001', 'Aluno Biblioteca A', 'student', '84000000-0000-0000-0000-000000000001', 'library-student-a@test.local'),
  ('82000000-0000-0000-0000-000000000002', 'Aluno Biblioteca B', 'student', '84000000-0000-0000-0000-000000000002', 'library-student-b@test.local');

insert into public.biblioteca_publicacoes (
  id, autor_id, autor_nome, titulo, status, publicado_em, excluido_em
)
values
  ('85000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'Professora Biblioteca A', 'Publicado para A', 'published', now(), null),
  ('85000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001', 'Professora Biblioteca A', 'Rascunho de A', 'draft', null, null),
  ('85000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000002', 'Professor Biblioteca B', 'Publicado para B', 'published', now(), null),
  ('85000000-0000-0000-0000-000000000004', '81000000-0000-0000-0000-000000000001', 'Professora Biblioteca A', 'Arquivado de A', 'archived', now(), now());

insert into public.biblioteca_publicacao_turmas (publicacao_id, turma_id)
values
  ('85000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001'),
  ('85000000-0000-0000-0000-000000000002', '84000000-0000-0000-0000-000000000001'),
  ('85000000-0000-0000-0000-000000000003', '84000000-0000-0000-0000-000000000002'),
  ('85000000-0000-0000-0000-000000000004', '84000000-0000-0000-0000-000000000001');

insert into public.biblioteca_anexos (
  id, publicacao_id, tipo, titulo, ordem, storage_path, status
)
values (
  '86000000-0000-0000-0000-000000000001',
  '85000000-0000-0000-0000-000000000001',
  'image',
  'Esquema da turma A',
  0,
  '81000000-0000-0000-0000-000000000001/85000000-0000-0000-0000-000000000001/86000000-0000-0000-0000-000000000001/arquivo.webp',
  'ready'
);

insert into storage.objects (bucket_id, name)
values
  ('biblioteca-media', '81000000-0000-0000-0000-000000000001/85000000-0000-0000-0000-000000000001/86000000-0000-0000-0000-000000000001/arquivo.webp'),
  ('biblioteca-media', '81000000-0000-0000-0000-000000000001/incompleto/orfao/arquivo.webp');

set local role authenticated;
set local request.jwt.claim.sub = '82000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';

select results_eq(
  $$select titulo from public.biblioteca_publicacoes order by titulo$$,
  $$values ('Publicado para A'::text)$$,
  'aluno lê somente publicação ativa destinada à própria turma'
);
select results_eq(
  $$select titulo from public.biblioteca_anexos order by titulo$$,
  $$values ('Esquema da turma A'::text)$$,
  'aluno lê os anexos da publicação liberada'
);
select results_eq(
  $$select name from storage.objects where bucket_id = 'biblioteca-media' order by name$$,
  $$values ('81000000-0000-0000-0000-000000000001/85000000-0000-0000-0000-000000000001/86000000-0000-0000-0000-000000000001/arquivo.webp'::text)$$,
  'aluno lê somente o objeto associado ao material liberado'
);
select throws_ok(
  $$
    insert into public.biblioteca_publicacoes (autor_id, autor_nome, titulo)
    values ('82000000-0000-0000-0000-000000000001', 'Aluno Biblioteca A', 'Publicação indevida')
  $$,
  '42501'::character(5),
  'new row violates row-level security policy for table "biblioteca_publicacoes"',
  'aluno não publica no mural'
);

set local request.jwt.claim.sub = '82000000-0000-0000-0000-000000000002';
select is(
  (select count(*)::bigint from public.biblioteca_publicacoes where autor_id = '81000000-0000-0000-0000-000000000001'),
  0::bigint,
  'aluno de outra turma não enxerga publicações de A'
);

set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000001';
select results_eq(
  $$select titulo from public.biblioteca_publicacoes order by titulo$$,
  $$values ('Arquivado de A'::text), ('Publicado para A'::text), ('Rascunho de A'::text)$$,
  'professor lê publicações ativas, rascunhos e arquivo próprios'
);
select is(
  (select count(*)::bigint from storage.objects where bucket_id = 'biblioteca-media'),
  2::bigint,
  'professor lê também objetos órfãos do próprio diretório para limpá-los'
);
set local request.jwt.claim.sub = '81000000-0000-0000-0000-000000000002';
select results_eq(
  $$select titulo from public.biblioteca_publicacoes order by titulo$$,
  $$values ('Publicado para B'::text)$$,
  'outro professor enxerga somente o próprio mural'
);
select results_eq(
  $$
    with changed as (
      update public.biblioteca_publicacoes
      set titulo = 'Alteração indevida'
      where id = '85000000-0000-0000-0000-000000000001'
      returning 1
    )
    select count(*)::bigint from changed
  $$,
  array[0::bigint],
  'outro professor não altera publicação alheia'
);

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claim.role;

select * from finish();

rollback;
