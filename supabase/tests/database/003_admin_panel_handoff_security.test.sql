begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

select has_table(
  'private',
  'admin_panel_handoffs',
  'handoffs ficam fora dos schemas expostos pelo Data API'
);
select has_table(
  'public',
  'backoffice_sessions',
  'a sessão server-side existente do painel é reutilizada'
);
select has_column(
  'public',
  'backoffice_sessions',
  'source_session_token_hash',
  'sessão do painel registra somente o hash da sessão de origem'
);
select has_column(
  'public',
  'backoffice_sessions',
  'source_auth_session_id',
  'sessão derivada fica vinculada a auth.sessions'
);
select has_column(
  'public',
  'backoffice_sessions',
  'revoked_at',
  'sessão do painel possui revogação explícita'
);

select ok(
  not has_table_privilege(
    'anon',
    'private.admin_panel_handoffs',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'private.admin_panel_handoffs',
    'SELECT'
  )
  and not has_table_privilege(
    'service_role',
    'private.admin_panel_handoffs',
    'SELECT'
  ),
  'nenhuma role da API acessa diretamente a fila privada'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'admin_panel_handoffs'
      and column_name in ('code', 'token', 'access_token', 'refresh_token')
  ),
  'o schema não possui coluna para código ou token em claro'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.issue_admin_panel_handoff(uuid,uuid,text,text,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.consume_admin_panel_handoff(text,text,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.create_backoffice_session(uuid,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.validate_backoffice_session(text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.revoke_backoffice_session(text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.revoke_admin_panel_access(uuid,text,text)',
    'EXECUTE'
  ),
  'somente o backend privilegiado recebe os RPCs necessários'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.issue_admin_panel_handoff(uuid,uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.issue_admin_panel_handoff(uuid,uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.consume_admin_panel_handoff(text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.consume_admin_panel_handoff(text,text,text,text)',
    'EXECUTE'
  ),
  'clientes não emitem nem consomem handoffs diretamente'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'issue_admin_panel_handoff',
        'consume_admin_panel_handoff',
        'create_backoffice_session',
        'validate_backoffice_session',
        'revoke_backoffice_session',
        'revoke_admin_panel_access'
      )
      and procedure.prosecdef
      and array_to_string(procedure.proconfig, ',') ~ 'search_path='
  ),
  6,
  'todos os RPCs privilegiados fixam search_path vazio'
);

select ok(
  (
    select relation.relrowsecurity
    from pg_catalog.pg_class relation
    where relation.oid = 'private.admin_panel_handoffs'::regclass
  ),
  'RLS também fica habilitada na tabela privada'
);

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
    '61000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'teacher@lot2.test',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '62000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'student@lot2.test',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.perfis (id, nome, role, email)
values
  (
    '61000000-0000-0000-0000-000000000001',
    'Professora Lot 2',
    'teacher',
    'teacher@lot2.test'
  ),
  (
    '62000000-0000-0000-0000-000000000001',
    'Aluno Lot 2',
    'student',
    'student@lot2.test'
  );

insert into auth.sessions (id, user_id, created_at, updated_at)
values
  (
    '71000000-0000-4000-8000-000000000001',
    '61000000-0000-0000-0000-000000000001',
    now(),
    now()
  ),
  (
    '72000000-0000-4000-8000-000000000001',
    '62000000-0000-0000-0000-000000000001',
    now(),
    now()
  );

insert into public.user_sessions (user_id, session_token, updated_at)
values
  (
    '61000000-0000-0000-0000-000000000001',
    'teacher-source-token-1',
    now()
  ),
  (
    '62000000-0000-0000-0000-000000000001',
    'student-source-token-1',
    now()
  );

insert into public.backoffice_admins (id, login, senha, nome)
values (
  '63000000-0000-0000-0000-000000000001',
  'admin-lot2',
  'fixture-only',
  'Admin Lot 2'
);

select is(
  (
    select count(*)::integer
    from public.issue_admin_panel_handoff(
      '61000000-0000-0000-0000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      repeat('a', 64),
      encode(
        extensions.digest(
          convert_to('teacher-source-token-1', 'UTF8'),
          'sha256'
        ),
        'hex'
      )
    )
  ),
  1,
  'professor ativo com sessão autoritativa emite um handoff'
);

select ok(
  (
    select expires_at - created_at = interval '60 seconds'
    from private.admin_panel_handoffs
    where code_hash = repeat('a', 64)
  ),
  'o código expira em sessenta segundos definidos pelo servidor'
);

select is(
  (
    select code_hash
    from private.admin_panel_handoffs
    where actor_id = '61000000-0000-0000-0000-000000000001'
    order by created_at desc
    limit 1
  ),
  repeat('a', 64),
  'somente SHA-256 do código é persistido'
);

select throws_ok(
  $$
    select *
    from public.issue_admin_panel_handoff(
      '62000000-0000-0000-0000-000000000001',
      '72000000-0000-4000-8000-000000000001',
      repeat('b', 64),
      encode(
        extensions.digest(
          convert_to('student-source-token-1', 'UTF8'),
          'sha256'
        ),
        'hex'
      )
    )
  $$,
  '42501'::character(5),
  'Teacher profile or source session is not authorized',
  'aluno não emite código administrativo'
);

select throws_ok(
  $$
    select *
    from public.issue_admin_panel_handoff(
      '61000000-0000-0000-0000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      repeat('b', 64),
      repeat('0', 64)
    )
  $$,
  '42501'::character(5),
  'Teacher profile or source session is not authorized',
  'hash de sessão de origem incorreto é recusado'
);

select throws_ok(
  $$
    select *
    from public.issue_admin_panel_handoff(
      '61000000-0000-0000-0000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      repeat('b', 64),
      encode(
        extensions.digest(
          convert_to('teacher-source-token-1', 'UTF8'),
          'sha256'
        ),
        'hex'
      ),
      'other_purpose',
      'sag'
    )
  $$,
  '22023'::character(5),
  'Invalid admin panel handoff request',
  'finalidade diferente não reutiliza o código'
);

select results_eq(
  $$
    select actor_id::text, actor_role
    from public.consume_admin_panel_handoff(
      repeat('a', 64),
      repeat('c', 64)
    )
  $$,
  $$
    values (
      '61000000-0000-0000-0000-000000000001'::text,
      'TEACHER'::text
    )
  $$,
  'troca válida revalida e devolve a identidade de professor'
);

select ok(
  (
    select consumed_at is not null
    from private.admin_panel_handoffs
    where code_hash = repeat('a', 64)
  ),
  'handoff é marcado como consumido na mesma transação'
);

select ok(
  exists (
    select 1
    from public.backoffice_sessions
    where token_hash = repeat('c', 64)
      and source_session_token_hash = encode(
        extensions.digest(
          convert_to('teacher-source-token-1', 'UTF8'),
          'sha256'
        ),
        'hex'
      )
      and handoff_id is not null
  ),
  'sessão própria guarda apenas hashes e referência do handoff'
);

select is(
  (
    select count(*)::integer
    from public.consume_admin_panel_handoff(
      repeat('a', 64),
      repeat('d', 64)
    )
  ),
  0,
  'replay do mesmo código não cria outra sessão'
);

select results_eq(
  $$
    select actor_id::text, actor_role
    from public.validate_backoffice_session(repeat('c', 64))
  $$,
  $$
    values (
      '61000000-0000-0000-0000-000000000001'::text,
      'TEACHER'::text
    )
  $$,
  'sessão válida é revalidada server-side'
);

select lives_ok(
  $$
    select *
    from public.issue_admin_panel_handoff(
      '61000000-0000-0000-0000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      repeat('d', 64),
      encode(
        extensions.digest(
          convert_to('teacher-source-token-1', 'UTF8'),
          'sha256'
        ),
        'hex'
      )
    )
  $$,
  'novo handoff pode substituir a janela anterior'
);

select is(
  (
    select revoked_reason
    from public.backoffice_sessions
    where token_hash = repeat('c', 64)
  ),
  'new_handoff_issued',
  'emissão nova revoga imediatamente a sessão antiga'
);

select is(
  (
    select count(*)::integer
    from public.consume_admin_panel_handoff(
      repeat('d', 64),
      repeat('e', 64)
    )
  ),
  1,
  'o segundo código gera uma nova sessão'
);

update public.user_sessions
set session_token = 'teacher-source-token-2',
    updated_at = now()
where user_id = '61000000-0000-0000-0000-000000000001';

select is(
  (
    select count(*)::integer
    from public.validate_backoffice_session(repeat('e', 64))
  ),
  0,
  'substituição da sessão do Bloquin invalida a sessão do painel'
);

select is(
  (
    select revoked_reason
    from public.backoffice_sessions
    where token_hash = repeat('e', 64)
  ),
  'actor_or_source_session_invalid',
  'a invalidação por troca de sessão fica auditável'
);

select lives_ok(
  $$
    select *
    from public.issue_admin_panel_handoff(
      '61000000-0000-0000-0000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      repeat('f', 64),
      encode(
        extensions.digest(
          convert_to('teacher-source-token-2', 'UTF8'),
          'sha256'
        ),
        'hex'
      )
    )
  $$,
  'fixture cria handoff para validar expiração'
);

update private.admin_panel_handoffs
set created_at = now() - interval '2 minutes',
    expires_at = now() - interval '1 minute'
where code_hash = repeat('f', 64);

select is(
  (
    select count(*)::integer
    from public.consume_admin_panel_handoff(
      repeat('f', 64),
      repeat('1', 64)
    )
  ),
  0,
  'código expirado não pode ser consumido'
);

select is(
  (
    select invalidation_reason
    from private.admin_panel_handoffs
    where code_hash = repeat('f', 64)
  ),
  'expired',
  'expiração do código fica registrada'
);

select lives_ok(
  $$
    select *
    from public.issue_admin_panel_handoff(
      '61000000-0000-0000-0000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      repeat('1', 64),
      encode(
        extensions.digest(
          convert_to('teacher-source-token-2', 'UTF8'),
          'sha256'
        ),
        'hex'
      )
    )
  $$,
  'fixture cria sessão para revogação explícita'
);

select is(
  (
    select count(*)::integer
    from public.consume_admin_panel_handoff(
      repeat('1', 64),
      repeat('2', 64)
    )
  ),
  1,
  'fixture consome sessão para revogação explícita'
);

select is(
  public.revoke_admin_panel_access(
    '61000000-0000-0000-0000-000000000001',
    encode(
      extensions.digest(
        convert_to('teacher-source-token-2', 'UTF8'),
        'sha256'
      ),
      'hex'
    ),
    'test_logout'
  ),
  1,
  'logout do Bloquin revoga a sessão vinculada'
);

select is(
  (
    select count(*)::integer
    from public.validate_backoffice_session(repeat('2', 64))
  ),
  0,
  'sessão explicitamente revogada deixa de validar'
);

select results_eq(
  $$
    select actor_role
    from public.create_backoffice_session(
      '63000000-0000-0000-0000-000000000001',
      'admin',
      repeat('3', 64)
    )
  $$,
  $$values ('ADMIN'::text)$$,
  'login direto de administrador também recebe sessão opaca'
);

select ok(
  public.revoke_backoffice_session(repeat('3', 64), 'test_logout')
  and not exists (
    select 1
    from public.validate_backoffice_session(repeat('3', 64))
  ),
  'logout do SAG consome o cookie opaco no servidor'
);

delete from auth.sessions
where id = '71000000-0000-4000-8000-000000000001';

select is(
  (
    select count(*)::integer
    from public.backoffice_sessions
    where actor_id = '61000000-0000-0000-0000-000000000001'
  ),
  0,
  'logout no Supabase Auth remove imediatamente sessões derivadas'
);

reset role;
set local role anon;

select throws_ok(
  $$
    select *
    from public.issue_admin_panel_handoff(
      '61000000-0000-0000-0000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      repeat('4', 64),
      repeat('5', 64)
    )
  $$,
  '42501'::character(5),
  'permission denied for function issue_admin_panel_handoff',
  'anon não invoca emissão privilegiada'
);

reset role;
set local role authenticated;

select throws_ok(
  $$
    select *
    from public.consume_admin_panel_handoff(
      repeat('4', 64),
      repeat('5', 64)
    )
  $$,
  '42501'::character(5),
  'permission denied for function consume_admin_panel_handoff',
  'authenticated não consome código diretamente'
);

reset role;

select * from finish();
rollback;
