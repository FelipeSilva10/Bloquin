-- Lote 1 — inventário somente leitura da RPC legada delete_student_user.
--
-- Não executa a função, não lê dados de usuários e não altera objetos.
-- O resultado comprova definição, grants, dependências registradas, tabelas
-- legadas ausentes e o caminho atual baseado em auth.users -> perfis.

with target_function as (
  select procedure.oid
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'delete_student_user'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      = 'p_student_id uuid'
),
function_inventory as (
  select jsonb_build_object(
    'owner', pg_catalog.pg_get_userbyid(procedure.proowner),
    'security_definer', procedure.prosecdef,
    'volatility', procedure.provolatile,
    'configuration', procedure.proconfig,
    'definition', pg_catalog.pg_get_functiondef(procedure.oid)
  ) as value
  from pg_catalog.pg_proc procedure
  join target_function target on target.oid = procedure.oid
),
grants as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'grantee', privilege.grantee,
        'privilege', privilege.privilege_type,
        'grantable', privilege.is_grantable
      )
      order by privilege.grantee, privilege.privilege_type
    ),
    '[]'::jsonb
  ) as value
  from information_schema.routine_privileges privilege
  where privilege.routine_schema = 'public'
    and privilege.routine_name = 'delete_student_user'
),
database_dependents as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'dependency_type', dependency.deptype,
        'object', pg_catalog.pg_describe_object(
          dependency.classid,
          dependency.objid,
          dependency.objsubid
        )
      )
      order by dependency.deptype, dependency.classid, dependency.objid
    ),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_depend dependency
  join target_function target
    on dependency.refclassid = 'pg_catalog.pg_proc'::regclass
   and dependency.refobjid = target.oid
),
relation_inventory as (
  select jsonb_build_object(
    'legacy', jsonb_build_object(
      'public.projects', pg_catalog.to_regclass('public.projects'),
      'public.classroom_students',
        pg_catalog.to_regclass('public.classroom_students'),
      'public.profiles', pg_catalog.to_regclass('public.profiles')
    ),
    'current', jsonb_build_object(
      'public.projetos', pg_catalog.to_regclass('public.projetos'),
      'public.membros_turma', pg_catalog.to_regclass('public.membros_turma'),
      'public.perfis', pg_catalog.to_regclass('public.perfis')
    )
  ) as value
),
equivalent_inventory as (
  select jsonb_build_object(
    'signature',
      'public.apagar_utilizador(user_id_to_delete uuid)',
    'owner', pg_catalog.pg_get_userbyid(procedure.proowner),
    'security_definer', procedure.prosecdef,
    'configuration', procedure.proconfig,
    'definition', pg_catalog.pg_get_functiondef(procedure.oid)
  ) as value
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'apagar_utilizador'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      = 'user_id_to_delete uuid'
),
current_cascades as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'constraint', constraint_info.conname,
        'child', constraint_info.conrelid::regclass::text,
        'parent', constraint_info.confrelid::regclass::text,
        'definition',
          pg_catalog.pg_get_constraintdef(constraint_info.oid, true)
      )
      order by
        constraint_info.confrelid::regclass::text,
        constraint_info.conrelid::regclass::text,
        constraint_info.conname
    ),
    '[]'::jsonb
  ) as value
  from pg_catalog.pg_constraint constraint_info
  where constraint_info.contype = 'f'
    and constraint_info.confrelid in (
      'auth.users'::regclass,
      'public.perfis'::regclass
    )
)
select jsonb_pretty(
  jsonb_build_object(
    'function', (select value from function_inventory),
    'grants', (select value from grants),
    'database_dependents', (select value from database_dependents),
    'relations', (select value from relation_inventory),
    'current_equivalent', (select value from equivalent_inventory),
    'current_cascades', (select value from current_cascades)
  )
) as lot1_delete_student_user_inventory;
