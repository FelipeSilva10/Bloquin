begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

select has_table('public', 'perfis', 'o baseline define public.perfis');
select has_table('public', 'user_sessions', 'o baseline define public.user_sessions');

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_info
    where constraint_info.conrelid = 'public.perfis'::regclass
      and constraint_info.contype = 'f'
      and constraint_info.confrelid = 'auth.users'::regclass
      and pg_get_constraintdef(constraint_info.oid) ~
        'FOREIGN KEY \(id\) REFERENCES auth\.users\(id\) ON DELETE CASCADE'
  ),
  'perfis.id referencia auth.users.id'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_info
    where constraint_info.conrelid = 'public.user_sessions'::regclass
      and constraint_info.contype = 'f'
      and constraint_info.confrelid = 'auth.users'::regclass
      and pg_get_constraintdef(constraint_info.oid) ~
        'FOREIGN KEY \(user_id\) REFERENCES auth\.users\(id\) ON DELETE CASCADE'
  ),
  'user_sessions.user_id referencia auth.users.id'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_info
    where constraint_info.conrelid = 'public.perfis'::regclass
      and constraint_info.contype = 'c'
      and pg_get_constraintdef(constraint_info.oid) ~
        '''admin''.*''teacher''.*''student'''
  ),
  'o papel de perfil é limitado aos valores de negócio conhecidos'
);

select ok(
  (select relation.relrowsecurity
   from pg_catalog.pg_class relation
   where relation.oid = 'public.perfis'::regclass),
  'RLS está habilitada em public.perfis'
);

select ok(
  (select relation.relrowsecurity
   from pg_catalog.pg_class relation
   where relation.oid = 'public.user_sessions'::regclass),
  'RLS está habilitada em public.user_sessions'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'perfis'
      and policy.cmd = 'SELECT'
      and policy.roles = array['authenticated']::name[]
  ),
  1,
  'perfis possui uma única policy SELECT para authenticated'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'perfis'
      and policy.policyname = 'perfis_authenticated_read'
      and lower(policy.qual) ~ 'auth\.uid'
      and lower(policy.qual) ~ 'id'
  ),
  'a policy permite que o usuário leia o próprio perfil'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'perfis'
      and policy.policyname = 'perfis_authenticated_read'
      and lower(policy.qual) ~ 'current_profile_role'
      and lower(policy.qual) ~ '''teacher'''
  ),
  'a leitura de perfis da turma exige role teacher'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'perfis'
      and policy.policyname = 'perfis_authenticated_read'
      and lower(policy.qual) ~ 'classroom\.id = perfis\.turma_id'
      and lower(policy.qual) ~ 'classroom\.professor_id'
      and lower(policy.qual) ~ 'auth\.uid'
      and lower(policy.qual) ~ 'role = ''student'''
  ),
  'a leitura da turma correlaciona aluno, turma, professor e auth.uid()'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'perfis'
      and policy.cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
  ),
  'o Data API não possui policy de escrita em perfis'
);

select ok(
  not exists (
    select 1
    from information_schema.table_privileges privilege
    where privilege.table_schema = 'public'
      and privilege.table_name = 'perfis'
      and privilege.grantee in ('PUBLIC', 'anon')
  )
  and not exists (
    select 1
    from information_schema.column_privileges privilege
    where privilege.table_schema = 'public'
      and privilege.table_name = 'perfis'
      and privilege.grantee in ('PUBLIC', 'anon')
  ),
  'PUBLIC e anon não possuem grants em perfis'
);

select is(
  (
    select string_agg(privilege.column_name, ',' order by privilege.column_name)
    from information_schema.column_privileges privilege
    where privilege.table_schema = 'public'
      and privilege.table_name = 'perfis'
      and privilege.grantee = 'authenticated'
      and privilege.privilege_type = 'SELECT'
  ),
  'id,nome,role,turma_id',
  'authenticated lê somente id, nome, role e turma_id'
);

select ok(
  not exists (
    select 1
    from information_schema.column_privileges privilege
    where privilege.table_schema = 'public'
      and privilege.table_name = 'perfis'
      and privilege.grantee = 'authenticated'
      and privilege.privilege_type = 'SELECT'
      and privilege.column_name in (
        'email',
        'senha',
        'temp_senha',
        'temp_senha_expiry',
        'blocked_reason'
      )
  ),
  'campos sensíveis de perfil não são legíveis pelo cliente'
);

select ok(
  not exists (
    select 1
    from information_schema.table_privileges privilege
    where privilege.table_schema = 'public'
      and privilege.table_name = 'perfis'
      and privilege.grantee = 'authenticated'
      and privilege.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  )
  and not exists (
    select 1
    from information_schema.column_privileges privilege
    where privilege.table_schema = 'public'
      and privilege.table_name = 'perfis'
      and privilege.grantee = 'authenticated'
      and privilege.privilege_type in ('INSERT', 'UPDATE')
  ),
  'authenticated não cria, altera ou exclui perfis'
);

select is(
  (
    select string_agg(policy.cmd, ',' order by policy.cmd)
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'user_sessions'
  ),
  'DELETE,INSERT,SELECT,UPDATE',
  'sessões têm policies separadas para cada comando'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'user_sessions'
      and policy.roles <> array['authenticated']::name[]
  ),
  'todas as policies de sessão são exclusivas de authenticated'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'user_sessions'
      and concat_ws(' ', policy.policyname, policy.qual, policy.with_check)
        ~* '(teacher|professor)'
  ),
  'não existe leitura global de sessões por professor'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'user_sessions'
      and (
        (
          policy.cmd in ('SELECT', 'DELETE', 'UPDATE')
          and (
            lower(coalesce(policy.qual, '')) !~ 'auth\.uid'
            or lower(coalesce(policy.qual, '')) !~ 'user_id'
          )
        )
        or (
          policy.cmd in ('INSERT', 'UPDATE')
          and (
            lower(coalesce(policy.with_check, '')) !~ 'auth\.uid'
            or lower(coalesce(policy.with_check, '')) !~ 'user_id'
          )
        )
      )
  ),
  'toda leitura e escrita de sessão exige auth.uid() = user_id'
);

select ok(
  not exists (
    select 1
    from information_schema.table_privileges privilege
    where privilege.table_schema = 'public'
      and privilege.table_name = 'user_sessions'
      and privilege.grantee in ('PUBLIC', 'anon')
  )
  and not exists (
    select 1
    from information_schema.column_privileges privilege
    where privilege.table_schema = 'public'
      and privilege.table_name = 'user_sessions'
      and privilege.grantee in ('PUBLIC', 'anon')
  ),
  'PUBLIC e anon não possuem grants em user_sessions'
);

select ok(
  has_table_privilege('authenticated', 'public.user_sessions', 'SELECT')
  and has_table_privilege('authenticated', 'public.user_sessions', 'DELETE')
  and has_column_privilege(
    'authenticated',
    'public.user_sessions',
    'user_id',
    'INSERT'
  )
  and has_column_privilege(
    'authenticated',
    'public.user_sessions',
    'session_token',
    'INSERT'
  )
  and has_column_privilege(
    'authenticated',
    'public.user_sessions',
    'session_token',
    'UPDATE'
  )
  and has_column_privilege(
    'authenticated',
    'public.user_sessions',
    'updated_at',
    'UPDATE'
  ),
  'authenticated possui apenas os grants necessários ao ciclo da própria sessão'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.user_sessions',
    'user_id',
    'UPDATE'
  ),
  'authenticated não troca o proprietário de uma sessão'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    cross join lateral aclexplode(
      coalesce(
        procedure.proacl,
        acldefault('f', procedure.proowner)
      )
    ) acl
    where procedure.oid =
      'public.encerrar_escola(uuid,text,text)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.encerrar_escola(uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.encerrar_escola(uuid,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.encerrar_escola(uuid,text,text)',
    'EXECUTE'
  ),
  'encerrar_escola é executável somente pelo backend privilegiado'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    cross join lateral aclexplode(
      coalesce(
        procedure.proacl,
        acldefault('f', procedure.proowner)
      )
    ) acl
    where procedure.oid = 'public.set_updated_at()'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  )
  and not has_function_privilege('anon', 'public.set_updated_at()', 'EXECUTE')
  and not has_function_privilege(
    'authenticated',
    'public.set_updated_at()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.set_updated_at()',
    'EXECUTE'
  ),
  'set_updated_at permanece restrita ao proprietário e aos triggers'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_default_acl default_acl
    join pg_catalog.pg_namespace namespace
      on namespace.oid = default_acl.defaclnamespace
    cross join lateral aclexplode(default_acl.defaclacl) acl
    where pg_get_userbyid(default_acl.defaclrole) = 'postgres'
      and namespace.nspname = 'public'
      and acl.grantee in (
        0,
        (select oid from pg_catalog.pg_roles where rolname = 'anon'),
        (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
      )
  ),
  'novos objetos public não são autoexpostos a PUBLIC, anon ou authenticated'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_publication_tables publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'user_sessions'
  ),
  'user_sessions está na publicação Realtime'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename in ('perfis', 'user_sessions')
      and concat_ws(' ', policy.qual, policy.with_check)
        ~* '(raw_user_meta_data|user_metadata|app_metadata)'
  ),
  'policies não autorizam por metadata editável do JWT'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.prosecdef
      and pg_get_functiondef(procedure.oid) ~* '(perfis|user_sessions)'
      and (
        not (
          coalesce(procedure.proconfig, array[]::text[])
          && array[
            'search_path=pg_catalog, public',
            'search_path=pg_catalog,public'
          ]
        )
        or exists (
          select 1
          from aclexplode(
            coalesce(
              procedure.proacl,
              acldefault('f', procedure.proowner)
            )
          ) acl
          where acl.grantee = 0
            and acl.privilege_type = 'EXECUTE'
        )
      )
  ),
  'helpers SECURITY DEFINER têm search_path fixo e não são públicos'
);

select ok(
  not exists (
    select policy.tablename, policy.cmd
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename in ('perfis', 'user_sessions')
      and 'authenticated' = any(policy.roles)
    group by policy.tablename, policy.cmd
    having count(*) > 1
  ),
  'não há policies permissivas sobrepostas em perfis ou sessões'
);

select ok(
  to_regprocedure('public.delete_student_user(uuid)') is null,
  'a RPC destrutiva e quebrada delete_student_user foi removida'
);

select * from finish();

rollback;
