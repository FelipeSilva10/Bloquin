-- Lote 1 — inventário remoto estritamente somente leitura.
--
-- Execute este arquivo no SQL Editor do projeto Supabase e exporte o único
-- resultado JSON. O script não cria, altera nem remove objetos e não retorna
-- e-mails, tokens, hashes, senhas ou identificadores de usuários.
--
-- O relatório é a entrada obrigatória para reconciliar o baseline e escrever
-- a migration mínima de segurança de public.perfis/public.user_sessions.

with target_relations(table_schema, table_name) as (
  values
    ('public'::text, 'perfis'::text),
    ('public'::text, 'user_sessions'::text),
    ('public'::text, 'turmas'::text),
    ('public'::text, 'membros_turma'::text),
    ('public'::text, 'projetos'::text)
),
database_info as (
  select jsonb_build_object(
    'database', current_database(),
    'server_version', current_setting('server_version'),
    'server_version_num', current_setting('server_version_num')
  ) as value
),
migration_history as (
  select coalesce(
    jsonb_agg(to_jsonb(migration) - 'statements' order by migration.version),
    '[]'::jsonb
  ) as value
  from supabase_migrations.schema_migrations migration
),
relations as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'schema', namespace.nspname,
        'name', relation.relname,
        'kind', relation.relkind,
        'owner', pg_get_userbyid(relation.relowner),
        'rls_enabled', relation.relrowsecurity,
        'rls_forced', relation.relforcerowsecurity
      )
      order by namespace.nspname, relation.relname
    ),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  join target_relations target
    on target.table_schema = namespace.nspname
   and target.table_name = relation.relname
),
columns as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'schema', column_info.table_schema,
        'table', column_info.table_name,
        'position', column_info.ordinal_position,
        'column', column_info.column_name,
        'data_type', column_info.data_type,
        'udt', column_info.udt_schema || '.' || column_info.udt_name,
        'nullable', column_info.is_nullable,
        'default', column_info.column_default,
        'identity', column_info.is_identity,
        'generated', column_info.is_generated
      )
      order by column_info.table_schema, column_info.table_name, column_info.ordinal_position
    ),
    '[]'::jsonb
  ) as value
  from information_schema.columns column_info
  join target_relations target
    on target.table_schema = column_info.table_schema
   and target.table_name = column_info.table_name
),
constraints as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'schema', namespace.nspname,
        'table', relation.relname,
        'name', constraint_info.conname,
        'type', constraint_info.contype,
        'definition', pg_get_constraintdef(constraint_info.oid, true)
      )
      order by namespace.nspname, relation.relname, constraint_info.conname
    ),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_constraint constraint_info
  join pg_catalog.pg_class relation on relation.oid = constraint_info.conrelid
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  join target_relations target
    on target.table_schema = namespace.nspname
   and target.table_name = relation.relname
),
indexes as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'schema', index_info.schemaname,
        'table', index_info.tablename,
        'name', index_info.indexname,
        'definition', index_info.indexdef
      )
      order by index_info.schemaname, index_info.tablename, index_info.indexname
    ),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_indexes index_info
  join target_relations target
    on target.table_schema = index_info.schemaname
   and target.table_name = index_info.tablename
),
policies as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'schema', policy.schemaname,
        'table', policy.tablename,
        'name', policy.policyname,
        'permissive', policy.permissive,
        'roles', to_jsonb(policy.roles),
        'command', policy.cmd,
        'using', policy.qual,
        'with_check', policy.with_check
      )
      order by policy.schemaname, policy.tablename, policy.policyname
    ),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_policies policy
  join target_relations target
    on target.table_schema = policy.schemaname
   and target.table_name = policy.tablename
),
table_grants as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'schema', privilege.table_schema,
        'table', privilege.table_name,
        'grantee', privilege.grantee,
        'privilege', privilege.privilege_type,
        'grantable', privilege.is_grantable
      )
      order by privilege.table_schema, privilege.table_name, privilege.grantee, privilege.privilege_type
    ),
    '[]'::jsonb
  ) as value
  from information_schema.table_privileges privilege
  join target_relations target
    on target.table_schema = privilege.table_schema
   and target.table_name = privilege.table_name
  where privilege.grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
),
column_grants as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'schema', privilege.table_schema,
        'table', privilege.table_name,
        'column', privilege.column_name,
        'grantee', privilege.grantee,
        'privilege', privilege.privilege_type,
        'grantable', privilege.is_grantable
      )
      order by privilege.table_schema, privilege.table_name, privilege.column_name, privilege.grantee, privilege.privilege_type
    ),
    '[]'::jsonb
  ) as value
  from information_schema.column_privileges privilege
  join target_relations target
    on target.table_schema = privilege.table_schema
   and target.table_name = privilege.table_name
  where privilege.grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
),
default_privileges as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'owner', pg_get_userbyid(default_acl.defaclrole),
        'schema', namespace.nspname,
        'object_type', default_acl.defaclobjtype,
        'acl', default_acl.defaclacl::text
      )
      order by pg_get_userbyid(default_acl.defaclrole), namespace.nspname, default_acl.defaclobjtype
    ),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_default_acl default_acl
  left join pg_catalog.pg_namespace namespace on namespace.oid = default_acl.defaclnamespace
),
functions as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'schema', function_info.schema_name,
        'name', function_info.function_name,
        'identity_arguments', function_info.identity_arguments,
        'result', function_info.result_type,
        'security_definer', function_info.security_definer,
        'volatility', function_info.volatility,
        'configuration', function_info.configuration,
        'definition', function_info.definition
      )
      order by function_info.schema_name, function_info.function_name, function_info.identity_arguments
    ),
    '[]'::jsonb
  ) as value
  from (
    select
      namespace.nspname as schema_name,
      procedure.proname as function_name,
      pg_get_function_identity_arguments(procedure.oid) as identity_arguments,
      pg_get_function_result(procedure.oid) as result_type,
      procedure.prosecdef as security_definer,
      procedure.provolatile as volatility,
      procedure.proconfig as configuration,
      pg_get_functiondef(procedure.oid) as definition
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and procedure.prokind in ('f', 'p')
  ) function_info
  where function_info.definition ~* '(perfis|user_sessions|auth\\.uid|role)'
),
function_grants as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'schema', routine.routine_schema,
        'routine', routine.routine_name,
        'specific_name', routine.specific_name,
        'grantee', routine.grantee,
        'privilege', routine.privilege_type,
        'grantable', routine.is_grantable
      )
      order by routine.routine_schema, routine.routine_name, routine.grantee
    ),
    '[]'::jsonb
  ) as value
  from information_schema.routine_privileges routine
  where routine.routine_schema in ('public', 'private')
    and routine.grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
),
triggers as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'schema', namespace.nspname,
        'table', relation.relname,
        'name', trigger_info.tgname,
        'definition', pg_get_triggerdef(trigger_info.oid, true)
      )
      order by namespace.nspname, relation.relname, trigger_info.tgname
    ),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_trigger trigger_info
  join pg_catalog.pg_class relation on relation.oid = trigger_info.tgrelid
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  join target_relations target
    on target.table_schema = namespace.nspname
   and target.table_name = relation.relname
  where not trigger_info.tgisinternal
),
realtime_tables as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'publication', publication.pubname,
        'schema', namespace.nspname,
        'table', relation.relname
      )
      order by publication.pubname, namespace.nspname, relation.relname
    ),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_publication publication
  join pg_catalog.pg_publication_rel publication_relation
    on publication_relation.prpubid = publication.oid
  join pg_catalog.pg_class relation on relation.oid = publication_relation.prrelid
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  join target_relations target
    on target.table_schema = namespace.nspname
   and target.table_name = relation.relname
),
profile_role_distribution as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object('role', grouped.role, 'count', grouped.total)
      order by grouped.role
    ),
    '[]'::jsonb
  ) as value
  from (
    select coalesce(profile.role, '<null>') as role, count(*) as total
    from public.perfis profile
    group by profile.role
  ) grouped
),
integrity_summary as (
  select jsonb_build_object(
    'profiles', (select count(*) from public.perfis),
    'profiles_without_auth_user', (
      select count(*)
      from public.perfis profile
      left join auth.users auth_user on auth_user.id = profile.id
      where auth_user.id is null
    ),
    'sessions', (select count(*) from public.user_sessions),
    'sessions_without_auth_user', (
      select count(*)
      from public.user_sessions app_session
      left join auth.users auth_user on auth_user.id = app_session.user_id
      where auth_user.id is null
    ),
    'sessions_without_profile', (
      select count(*)
      from public.user_sessions app_session
      left join public.perfis profile on profile.id = app_session.user_id
      where profile.id is null
    )
  ) as value
)
select jsonb_pretty(
  jsonb_build_object(
    'generated_at', statement_timestamp(),
    'database', (select value from database_info),
    'migration_history', (select value from migration_history),
    'relations', (select value from relations),
    'columns', (select value from columns),
    'constraints', (select value from constraints),
    'indexes', (select value from indexes),
    'policies', (select value from policies),
    'table_grants', (select value from table_grants),
    'column_grants', (select value from column_grants),
    'default_privileges', (select value from default_privileges),
    'functions', (select value from functions),
    'function_grants', (select value from function_grants),
    'triggers', (select value from triggers),
    'realtime_tables', (select value from realtime_tables),
    'profile_role_distribution', (select value from profile_role_distribution),
    'integrity_summary', (select value from integrity_summary)
  )
) as lot1_remote_inventory;
