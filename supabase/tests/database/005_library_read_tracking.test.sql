begin;

create extension if not exists pgtap with schema extensions;

set local search_path = extensions, public, pg_catalog;

select plan(9);

select has_table('public', 'biblioteca_leituras', 'a Biblioteca possui rastreamento de leitura');

select ok(
  not exists (
    select 1
      from information_schema.table_privileges privilege
     where privilege.table_schema = 'public'
       and privilege.table_name = 'biblioteca_leituras'
       and privilege.grantee in ('PUBLIC', 'anon')
  ),
  'PUBLIC e anon não recebem grants em biblioteca_leituras'
);

select ok(
  not exists (
    select 1
      from information_schema.table_privileges privilege
     where privilege.table_schema = 'public'
       and privilege.table_name = 'biblioteca_leituras'
       and privilege.grantee = 'authenticated'
       and privilege.privilege_type not in ('SELECT', 'INSERT', 'UPDATE')
  ),
  'authenticated não recebe DELETE em biblioteca_leituras'
);

insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('91000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'read-teacher-a@test.local', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('92000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'read-student-a@test.local', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('92000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'read-student-b@test.local', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

insert into public.escolas (id, nome, updated_at)
values ('93000000-0000-0000-0000-000000000001', 'Escola Leituras', now());

insert into public.perfis (id, nome, role, email)
values ('91000000-0000-0000-0000-000000000001', 'Professora Leituras', 'teacher', 'read-teacher-a@test.local');

insert into public.turmas (id, escola_id, nome, ano_letivo, professor_id)
values
  ('94000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', 'Turma Leituras A', '2026', '91000000-0000-0000-0000-000000000001'),
  ('94000000-0000-0000-0000-000000000002', '93000000-0000-0000-0000-000000000001', 'Turma Leituras B', '2026', '91000000-0000-0000-0000-000000000001');

insert into public.perfis (id, nome, role, turma_id, email)
values
  ('92000000-0000-0000-0000-000000000001', 'Aluno Leituras A', 'student', '94000000-0000-0000-0000-000000000001', 'read-student-a@test.local'),
  ('92000000-0000-0000-0000-000000000002', 'Aluno Leituras B', 'student', '94000000-0000-0000-0000-000000000002', 'read-student-b@test.local');

insert into public.biblioteca_publicacoes (
  id, autor_id, autor_nome, titulo, status, publicado_em, atualizado_em
)
values (
  '95000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  'Professora Leituras',
  'Publicação rastreada',
  'published',
  now(),
  now()
);

insert into public.biblioteca_publicacao_turmas (publicacao_id, turma_id)
values ('95000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claim.sub = '92000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';

select lives_ok(
  $$
    insert into public.biblioteca_leituras (publicacao_id, aluno_id, visto_atualizado_em)
    values ('95000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', now())
  $$,
  'aluno com acesso à publicação registra a própria leitura'
);

select throws_ok(
  $$
    insert into public.biblioteca_leituras (publicacao_id, aluno_id, visto_atualizado_em)
    values ('95000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', now())
  $$,
  '42501'::character(5),
  null,
  'aluno não registra leitura em nome de outro aluno'
);

select lives_ok(
  $$
    insert into public.biblioteca_leituras (publicacao_id, aluno_id, visto_atualizado_em)
    values ('95000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', now())
    on conflict (publicacao_id, aluno_id)
    do update set visualizado_em = now(), visto_atualizado_em = excluded.visto_atualizado_em
  $$,
  'aluno atualiza a própria leitura via upsert (contrato do PostgREST)'
);

set local request.jwt.claim.sub = '92000000-0000-0000-0000-000000000002';

select throws_ok(
  $$
    insert into public.biblioteca_leituras (publicacao_id, aluno_id, visto_atualizado_em)
    values ('95000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002', now())
  $$,
  '42501'::character(5),
  null,
  'aluno de outra turma não registra leitura de publicação fora do seu alcance'
);

select is(
  (select count(*)::bigint from public.biblioteca_leituras),
  0::bigint,
  'aluno de outra turma não enxerga a leitura registrada pelo aluno A'
);

set local request.jwt.claim.sub = '92000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::bigint from public.biblioteca_leituras where aluno_id = '92000000-0000-0000-0000-000000000001'),
  1::bigint,
  'aluno A enxerga a própria leitura'
);

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claim.role;

select * from finish();

rollback;
