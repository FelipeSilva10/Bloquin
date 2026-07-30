begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'teacher-a@lot1.test',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'teacher-b@lot1.test',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'student-a@lot1.test',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'student-b@lot1.test',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'student-rogue-class@lot1.test',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '30000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'without-profile@lot1.test',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"teacher"}'::jsonb,
    now(),
    now()
  );

insert into public.escolas (id, nome, updated_at)
values
  (
    '40000000-0000-0000-0000-000000000001',
    'Escola A',
    '2000-01-01T00:00:00Z'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    'Escola B',
    '2000-01-01T00:00:00Z'
  );

insert into public.perfis (id, nome, role, email)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'Professor A',
    'teacher',
    'teacher-a@lot1.test'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'Professor B',
    'teacher',
    'teacher-b@lot1.test'
  );

insert into public.turmas (
  id,
  escola_id,
  nome,
  ano_letivo,
  professor_id
)
values
  (
    '50000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    'Turma A',
    '2026',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000002',
    'Turma B',
    '2026',
    '10000000-0000-0000-0000-000000000002'
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    '40000000-0000-0000-0000-000000000001',
    'Turma com proprietário sem role teacher',
    '2026',
    null
  );

insert into public.perfis (id, nome, role, turma_id, email)
values
  (
    '20000000-0000-0000-0000-000000000001',
    'Aluno A',
    'student',
    '50000000-0000-0000-0000-000000000001',
    'student-a@lot1.test'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'Aluno B',
    'student',
    '50000000-0000-0000-0000-000000000002',
    'student-b@lot1.test'
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    'Aluno da turma irregular',
    'student',
    '50000000-0000-0000-0000-000000000003',
    'student-rogue-class@lot1.test'
  );

update public.turmas
set professor_id = '20000000-0000-0000-0000-000000000001'
where id = '50000000-0000-0000-0000-000000000003';

insert into public.user_sessions (user_id, session_token, updated_at)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'teacher-a-initial',
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'teacher-b-initial',
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000001',
    'student-a-initial',
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'student-b-initial',
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    'student-rogue-initial',
    now()
  );

set local role authenticated;
set local request.jwt.claim.sub =
  '10000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';

select results_eq(
  $$
    select id::text
    from public.perfis
    order by id
  $$,
  $$
    values
      ('10000000-0000-0000-0000-000000000001'::text),
      ('20000000-0000-0000-0000-000000000001'::text)
  $$,
  'professor lê o próprio perfil e os alunos da sua turma'
);

select lives_ok(
  $$
    select id, nome, role, turma_id
    from public.perfis
  $$,
  'professor lê somente as colunas públicas de perfil'
);

select throws_ok(
  $$select email from public.perfis$$,
  '42501'::character(5),
  'permission denied for table perfis',
  'professor não lê e-mail ou outras colunas sensíveis'
);

select throws_ok(
  $$
    update public.perfis
    set role = 'teacher'
    where id = '10000000-0000-0000-0000-000000000001'
  $$,
  '42501'::character(5),
  'permission denied for table perfis',
  'usuário autenticado não eleva o próprio papel'
);

select results_eq(
  $$
    select user_id::text
    from public.user_sessions
    order by user_id
  $$,
  $$
    values ('10000000-0000-0000-0000-000000000001'::text)
  $$,
  'professor enxerga somente a própria sessão'
);

select lives_ok(
  $$
    insert into public.user_sessions (user_id, session_token, updated_at)
    values (
      '10000000-0000-0000-0000-000000000001',
      'teacher-a-replaced',
      now()
    )
    on conflict (user_id) do update
    set session_token = excluded.session_token,
        updated_at = excluded.updated_at
  $$,
  'upsert da própria sessão continua autorizado'
);

select is(
  (
    select session_token
    from public.user_sessions
    where user_id = '10000000-0000-0000-0000-000000000001'
  ),
  'teacher-a-replaced',
  'o upsert persistiu o novo token da própria sessão'
);

select throws_ok(
  $$
    insert into public.user_sessions (user_id, session_token, updated_at)
    values (
      '30000000-0000-0000-0000-000000000001',
      'cross-user-insert',
      now()
    )
  $$,
  '42501'::character(5),
  'new row violates row-level security policy for table "user_sessions"',
  'professor não cria sessão para outro usuário'
);

select results_eq(
  $$
    with affected as (
      update public.user_sessions
      set session_token = 'cross-user-update'
      where user_id = '20000000-0000-0000-0000-000000000002'
      returning 1
    )
    select count(*)::bigint from affected
  $$,
  array[0::bigint],
  'professor não atualiza sessão de outro usuário'
);

select results_eq(
  $$
    with affected as (
      delete from public.user_sessions
      where user_id = '20000000-0000-0000-0000-000000000002'
      returning 1
    )
    select count(*)::bigint from affected
  $$,
  array[0::bigint],
  'professor não exclui sessão de outro usuário'
);

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claim.role;

set local role authenticated;
set local request.jwt.claim.sub =
  '20000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';

select results_eq(
  $$
    select id::text
    from public.perfis
    order by id
  $$,
  $$
    values ('20000000-0000-0000-0000-000000000001'::text)
  $$,
  'aluno lê somente o próprio perfil'
);

select is(
  (
    select count(*)::bigint
    from public.perfis
    where id = '20000000-0000-0000-0000-000000000003'
  ),
  0::bigint,
  'ser professor_id de uma turma sem role teacher não concede leitura'
);

reset request.jwt.claim.sub;
set local request.jwt.claims =
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","user_metadata":{"role":"teacher"}}';

select is(
  (
    select count(*)::bigint
    from public.perfis
    where id = '20000000-0000-0000-0000-000000000003'
  ),
  0::bigint,
  'metadata JWT não transforma aluno em professor'
);

select results_eq(
  $$
    select user_id::text
    from public.user_sessions
    order by user_id
  $$,
  $$
    values ('20000000-0000-0000-0000-000000000001'::text)
  $$,
  'aluno enxerga somente a própria sessão'
);

select lives_ok(
  $$
    insert into public.user_sessions (user_id, session_token, updated_at)
    values (
      '20000000-0000-0000-0000-000000000001',
      'student-a-replaced',
      now()
    )
    on conflict (user_id) do update
    set session_token = excluded.session_token,
        updated_at = excluded.updated_at
  $$,
  'aluno também pode substituir somente a própria sessão'
);

reset role;
reset request.jwt.claim.role;
reset request.jwt.claims;

set local role anon;

select throws_ok(
  $$select id from public.perfis$$,
  '42501'::character(5),
  'permission denied for table perfis',
  'anon não lê perfis'
);

select throws_ok(
  $$select user_id from public.user_sessions$$,
  '42501'::character(5),
  'permission denied for table user_sessions',
  'anon não lê sessões'
);

reset role;

set local role authenticated;
set local request.jwt.claim.sub =
  '30000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';

select is(
  (select count(*)::bigint from public.perfis),
  0::bigint,
  'usuário Auth sem perfil não obtém nenhum perfil'
);

select is(
  (select count(*)::bigint from public.user_sessions),
  0::bigint,
  'usuário Auth sem sessão não lê sessões de terceiros'
);

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claim.role;

set local role service_role;

select lives_ok(
  $$
    update public.escolas
    set nome = 'Escola A atualizada'
    where id = '40000000-0000-0000-0000-000000000001'
  $$,
  'trigger set_updated_at funciona sem grant EXECUTE ao service_role'
);

select ok(
  (
    select updated_at > '2000-01-01T00:00:00Z'::timestamptz
    from public.escolas
    where id = '40000000-0000-0000-0000-000000000001'
  ),
  'o trigger realmente atualizou updated_at'
);

reset role;

select * from finish();

rollback;
