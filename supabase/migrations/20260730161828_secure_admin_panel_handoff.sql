-- Lote 2: handoff de uso único entre o Bloquin e o painel SAG.
--
-- O código e o token de sessão nunca são persistidos em claro. A Edge Function
-- e o backend do SAG calculam SHA-256 e estas funções recebem somente o hash em
-- hexadecimal. As funções são exclusivas do service_role; clientes do Data API
-- não recebem acesso direto às tabelas nem às operações abaixo.

begin;

create extension if not exists pgcrypto with schema extensions;

create table private.admin_panel_handoffs (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  actor_id uuid not null references auth.users(id) on delete cascade,
  source_auth_session_id uuid not null
    references auth.sessions(id) on delete cascade,
  source_session_token_hash text not null,
  purpose text not null default 'admin_panel_login',
  audience text not null default 'sag',
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  invalidation_reason text,
  constraint admin_panel_handoffs_code_hash_check
    check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint admin_panel_handoffs_source_hash_check
    check (source_session_token_hash ~ '^[0-9a-f]{64}$'),
  constraint admin_panel_handoffs_purpose_check
    check (purpose = 'admin_panel_login'),
  constraint admin_panel_handoffs_audience_check
    check (audience = 'sag'),
  constraint admin_panel_handoffs_expiry_check
    check (
      expires_at > created_at
      and expires_at <= created_at + interval '2 minutes'
    ),
  constraint admin_panel_handoffs_terminal_state_check
    check (consumed_at is null or invalidated_at is null)
);

comment on table private.admin_panel_handoffs is
  'Códigos SHA-256 de uso único para autenticação server-side do painel SAG.';

alter table private.admin_panel_handoffs enable row level security;

revoke all on table private.admin_panel_handoffs
  from public, anon, authenticated, service_role;

create index admin_panel_handoffs_actor_pending_idx
  on private.admin_panel_handoffs (actor_id, created_at desc)
  where consumed_at is null and invalidated_at is null;

alter table public.backoffice_sessions
  add column if not exists source_session_token_hash text,
  add column if not exists source_auth_session_id uuid,
  add column if not exists handoff_id uuid,
  add column if not exists last_seen_at timestamptz not null default clock_timestamp(),
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_reason text;

comment on column public.backoffice_sessions.source_session_token_hash is
  'SHA-256 da sessão autoritativa do Bloquin; NULL apenas para login direto no SAG.';
comment on column public.backoffice_sessions.source_auth_session_id is
  'auth.sessions.id da sessão que emitiu o handoff; NULL apenas para login direto.';
comment on column public.backoffice_sessions.handoff_id is
  'Identificador do handoff consumido; nunca contém o código de uso único.';

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'backoffice_sessions_source_hash_check'
      and conrelid = 'public.backoffice_sessions'::regclass
  ) then
    alter table public.backoffice_sessions
      add constraint backoffice_sessions_source_hash_check
      check (
        (
          source_session_token_hash is null
          and source_auth_session_id is null
        )
        or (
          source_session_token_hash ~ '^[0-9a-f]{64}$'
          and source_auth_session_id is not null
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'backoffice_sessions_source_auth_session_fkey'
      and conrelid = 'public.backoffice_sessions'::regclass
  ) then
    alter table public.backoffice_sessions
      add constraint backoffice_sessions_source_auth_session_fkey
      foreign key (source_auth_session_id)
      references auth.sessions(id)
      on delete cascade;
  end if;
end;
$$;

create unique index if not exists backoffice_sessions_handoff_key
  on public.backoffice_sessions (handoff_id)
  where handoff_id is not null;

create index if not exists backoffice_sessions_actor_active_idx
  on public.backoffice_sessions (actor_id, expires_at)
  where revoked_at is null;

create or replace function public.issue_admin_panel_handoff(
  p_actor_id uuid,
  p_source_auth_session_id uuid,
  p_code_hash text,
  p_source_session_token_hash text,
  p_purpose text default 'admin_panel_login',
  p_audience text default 'sag'
)
returns table (
  handoff_id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_id is null
     or p_source_auth_session_id is null
     or p_code_hash !~ '^[0-9a-f]{64}$'
     or p_source_session_token_hash !~ '^[0-9a-f]{64}$'
     or p_purpose <> 'admin_panel_login'
     or p_audience <> 'sag' then
    raise exception 'Invalid admin panel handoff request'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.perfis profile
    join public.user_sessions source_session
      on source_session.user_id = profile.id
    join auth.sessions auth_session
      on auth_session.id = p_source_auth_session_id
     and auth_session.user_id = profile.id
    where profile.id = p_actor_id
      and profile.role = 'teacher'
      and profile.access_status::text = 'ATIVO'
      and profile.entity_status::text = 'ATIVO'
      and source_session.updated_at > v_now - interval '12 minutes'
      and source_session.updated_at <= v_now + interval '30 seconds'
      and encode(
        extensions.digest(
          convert_to(source_session.session_token, 'UTF8'),
          'sha256'
        ),
        'hex'
      ) = p_source_session_token_hash
  ) then
    raise exception 'Teacher profile or source session is not authorized'
      using errcode = '42501';
  end if;

  update private.admin_panel_handoffs pending
  set invalidated_at = v_now,
      invalidation_reason = 'superseded'
  where pending.actor_id = p_actor_id
    and pending.purpose = p_purpose
    and pending.audience = p_audience
    and pending.consumed_at is null
    and pending.invalidated_at is null;

  update public.backoffice_sessions panel_session
  set revoked_at = v_now,
      revoked_reason = 'new_handoff_issued'
  where panel_session.actor_id = p_actor_id
    and panel_session.actor_type = 'teacher'
    and panel_session.revoked_at is null;

  return query
  insert into private.admin_panel_handoffs (
    code_hash,
    actor_id,
    source_auth_session_id,
    source_session_token_hash,
    purpose,
    audience,
    created_at,
    expires_at
  )
  values (
    p_code_hash,
    p_actor_id,
    p_source_auth_session_id,
    p_source_session_token_hash,
    p_purpose,
    p_audience,
    v_now,
    v_now + interval '60 seconds'
  )
  returning id, private.admin_panel_handoffs.expires_at;
end;
$$;

create or replace function public.consume_admin_panel_handoff(
  p_code_hash text,
  p_panel_session_token_hash text,
  p_purpose text default 'admin_panel_login',
  p_audience text default 'sag'
)
returns table (
  session_id uuid,
  actor_id uuid,
  actor_name text,
  actor_role text,
  must_change_password boolean,
  session_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handoff private.admin_panel_handoffs%rowtype;
  v_profile public.perfis%rowtype;
  v_session_id uuid;
  v_session_expires_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or p_panel_session_token_hash !~ '^[0-9a-f]{64}$'
     or p_purpose <> 'admin_panel_login'
     or p_audience <> 'sag' then
    return;
  end if;

  select handoff.*
  into v_handoff
  from private.admin_panel_handoffs handoff
  where handoff.code_hash = p_code_hash
    and handoff.purpose = p_purpose
    and handoff.audience = p_audience
  for update;

  if not found then
    return;
  end if;

  if v_handoff.consumed_at is not null
     or v_handoff.invalidated_at is not null then
    return;
  end if;

  if v_handoff.expires_at <= v_now then
    update private.admin_panel_handoffs
    set invalidated_at = v_now,
        invalidation_reason = 'expired'
    where id = v_handoff.id;
    return;
  end if;

  select profile.*
  into v_profile
  from public.perfis profile
  join public.user_sessions source_session
    on source_session.user_id = profile.id
  join auth.sessions auth_session
    on auth_session.id = v_handoff.source_auth_session_id
   and auth_session.user_id = profile.id
  where profile.id = v_handoff.actor_id
    and profile.role = 'teacher'
    and profile.access_status::text = 'ATIVO'
    and profile.entity_status::text = 'ATIVO'
    and source_session.updated_at > v_now - interval '12 minutes'
    and source_session.updated_at <= v_now + interval '30 seconds'
    and encode(
      extensions.digest(
        convert_to(source_session.session_token, 'UTF8'),
        'sha256'
      ),
      'hex'
    ) = v_handoff.source_session_token_hash;

  if not found then
    update private.admin_panel_handoffs
    set invalidated_at = v_now,
        invalidation_reason = 'identity_or_source_session_invalid'
    where id = v_handoff.id;
    return;
  end if;

  update private.admin_panel_handoffs
  set consumed_at = v_now
  where id = v_handoff.id
    and consumed_at is null
    and invalidated_at is null;

  if not found then
    return;
  end if;

  update public.backoffice_sessions panel_session
  set revoked_at = v_now,
      revoked_reason = 'replaced_by_handoff'
  where panel_session.actor_id = v_handoff.actor_id
    and panel_session.actor_type = 'teacher'
    and panel_session.revoked_at is null;

  v_session_expires_at := v_now + interval '8 hours';

  insert into public.backoffice_sessions (
    actor_id,
    actor_type,
    token_hash,
    source_session_token_hash,
    source_auth_session_id,
    handoff_id,
    expires_at,
    created_at,
    last_seen_at
  )
  values (
    v_handoff.actor_id,
    'teacher',
    p_panel_session_token_hash,
    v_handoff.source_session_token_hash,
    v_handoff.source_auth_session_id,
    v_handoff.id,
    v_session_expires_at,
    v_now,
    v_now
  )
  returning id into v_session_id;

  return query
  select
    v_session_id,
    v_profile.id,
    v_profile.nome,
    'TEACHER'::text,
    v_profile.must_change_senha,
    v_session_expires_at;
end;
$$;

create or replace function public.create_backoffice_session(
  p_actor_id uuid,
  p_actor_type text,
  p_panel_session_token_hash text
)
returns table (
  session_id uuid,
  actor_id uuid,
  actor_name text,
  actor_role text,
  must_change_password boolean,
  session_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_must_change boolean := false;
  v_session_id uuid;
  v_session_expires_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_id is null
     or p_actor_type not in ('admin', 'teacher')
     or p_panel_session_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid backoffice session request'
      using errcode = '22023';
  end if;

  if p_actor_type = 'admin' then
    select admin_user.nome
    into v_name
    from public.backoffice_admins admin_user
    where admin_user.id = p_actor_id;
  else
    select profile.nome, profile.must_change_senha
    into v_name, v_must_change
    from public.perfis profile
    where profile.id = p_actor_id
      and profile.role = 'teacher'
      and profile.access_status::text = 'ATIVO'
      and profile.entity_status::text = 'ATIVO';
  end if;

  if not found then
    raise exception 'Backoffice actor is not authorized'
      using errcode = '42501';
  end if;

  update public.backoffice_sessions panel_session
  set revoked_at = v_now,
      revoked_reason = 'replaced_by_direct_login'
  where panel_session.actor_id = p_actor_id
    and panel_session.actor_type = p_actor_type
    and panel_session.revoked_at is null;

  v_session_expires_at := v_now + interval '8 hours';

  insert into public.backoffice_sessions (
    actor_id,
    actor_type,
    token_hash,
    expires_at,
    created_at,
    last_seen_at
  )
  values (
    p_actor_id,
    p_actor_type,
    p_panel_session_token_hash,
    v_session_expires_at,
    v_now,
    v_now
  )
  returning id into v_session_id;

  return query
  select
    v_session_id,
    p_actor_id,
    v_name,
    upper(p_actor_type),
    v_must_change,
    v_session_expires_at;
end;
$$;

create or replace function public.validate_backoffice_session(
  p_panel_session_token_hash text
)
returns table (
  session_id uuid,
  actor_id uuid,
  actor_name text,
  actor_role text,
  must_change_password boolean,
  session_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_panel_session public.backoffice_sessions%rowtype;
  v_name text;
  v_must_change boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  if p_panel_session_token_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  select panel_session.*
  into v_panel_session
  from public.backoffice_sessions panel_session
  where panel_session.token_hash = p_panel_session_token_hash
  for update;

  if not found
     or v_panel_session.revoked_at is not null
     or v_panel_session.expires_at <= v_now then
    return;
  end if;

  if v_panel_session.actor_type = 'admin' then
    select admin_user.nome
    into v_name
    from public.backoffice_admins admin_user
    where admin_user.id = v_panel_session.actor_id;
  elsif v_panel_session.actor_type = 'teacher' then
    select profile.nome, profile.must_change_senha
    into v_name, v_must_change
    from public.perfis profile
    where profile.id = v_panel_session.actor_id
      and profile.role = 'teacher'
      and profile.access_status::text = 'ATIVO'
      and profile.entity_status::text = 'ATIVO'
      and (
        (
          v_panel_session.source_session_token_hash is null
          and v_panel_session.source_auth_session_id is null
        )
        or exists (
          select 1
          from public.user_sessions source_session
          join auth.sessions auth_session
            on auth_session.id = v_panel_session.source_auth_session_id
           and auth_session.user_id = source_session.user_id
          where source_session.user_id = profile.id
            and source_session.updated_at > v_now - interval '12 minutes'
            and source_session.updated_at <= v_now + interval '30 seconds'
            and encode(
              extensions.digest(
                convert_to(source_session.session_token, 'UTF8'),
                'sha256'
              ),
              'hex'
            ) = v_panel_session.source_session_token_hash
        )
      );
  end if;

  if not found then
    update public.backoffice_sessions
    set revoked_at = v_now,
        revoked_reason = 'actor_or_source_session_invalid'
    where id = v_panel_session.id
      and revoked_at is null;
    return;
  end if;

  update public.backoffice_sessions
  set last_seen_at = v_now
  where id = v_panel_session.id;

  return query
  select
    v_panel_session.id,
    v_panel_session.actor_id,
    v_name,
    upper(v_panel_session.actor_type),
    v_must_change,
    v_panel_session.expires_at;
end;
$$;

create or replace function public.revoke_backoffice_session(
  p_panel_session_token_hash text,
  p_reason text default 'logout'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revoked boolean;
begin
  if p_panel_session_token_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  update public.backoffice_sessions panel_session
  set revoked_at = coalesce(panel_session.revoked_at, clock_timestamp()),
      revoked_reason = coalesce(panel_session.revoked_reason, left(p_reason, 120))
  where panel_session.token_hash = p_panel_session_token_hash;

  v_revoked := found;
  return v_revoked;
end;
$$;

create or replace function public.revoke_admin_panel_access(
  p_actor_id uuid,
  p_source_session_token_hash text,
  p_reason text default 'bloquin_logout'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_revoked integer := 0;
begin
  if p_actor_id is null
     or p_source_session_token_hash !~ '^[0-9a-f]{64}$' then
    return 0;
  end if;

  update private.admin_panel_handoffs handoff
  set invalidated_at = v_now,
      invalidation_reason = left(p_reason, 120)
  where handoff.actor_id = p_actor_id
    and handoff.source_session_token_hash = p_source_session_token_hash
    and handoff.consumed_at is null
    and handoff.invalidated_at is null;

  update public.backoffice_sessions panel_session
  set revoked_at = coalesce(panel_session.revoked_at, v_now),
      revoked_reason = coalesce(panel_session.revoked_reason, left(p_reason, 120))
  where panel_session.actor_id = p_actor_id
    and panel_session.actor_type = 'teacher'
    and panel_session.source_session_token_hash = p_source_session_token_hash;

  get diagnostics v_revoked = row_count;
  return v_revoked;
end;
$$;

create or replace function public.backoffice_actor_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select panel_session.actor_id
  from public.backoffice_sessions panel_session
  where panel_session.token_hash =
        pg_catalog.current_setting('app.backoffice_token_hash', true)
    and panel_session.expires_at > pg_catalog.now()
    and panel_session.revoked_at is null
  limit 1;
$$;

create or replace function public.backoffice_actor_type()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select panel_session.actor_type
  from public.backoffice_sessions panel_session
  where panel_session.token_hash =
        pg_catalog.current_setting('app.backoffice_token_hash', true)
    and panel_session.expires_at > pg_catalog.now()
    and panel_session.revoked_at is null
  limit 1;
$$;

create or replace function public.cleanup_backoffice_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.backoffice_sessions panel_session
  where panel_session.expires_at <= pg_catalog.now()
     or panel_session.revoked_at <= pg_catalog.now() - interval '24 hours';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.issue_admin_panel_handoff(
  uuid, uuid, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.consume_admin_panel_handoff(
  text, text, text, text
) from public, anon, authenticated;
revoke all on function public.create_backoffice_session(
  uuid, text, text
) from public, anon, authenticated;
revoke all on function public.validate_backoffice_session(text)
  from public, anon, authenticated;
revoke all on function public.revoke_backoffice_session(text, text)
  from public, anon, authenticated;
revoke all on function public.revoke_admin_panel_access(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.issue_admin_panel_handoff(
  uuid, uuid, text, text, text, text
) to service_role;
grant execute on function public.consume_admin_panel_handoff(
  text, text, text, text
) to service_role;
grant execute on function public.create_backoffice_session(
  uuid, text, text
) to service_role;
grant execute on function public.validate_backoffice_session(text)
  to service_role;
grant execute on function public.revoke_backoffice_session(text, text)
  to service_role;
grant execute on function public.revoke_admin_panel_access(uuid, text, text)
  to service_role;

commit;
