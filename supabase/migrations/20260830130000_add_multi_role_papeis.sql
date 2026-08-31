-- Papéis múltiplos do painel SAG (admin + professor numa única identidade).
--
-- perfis.role continua exatamente como está — nenhuma policy do Bloquin muda
-- de texto, nenhum client do Data API é afetado. perfis_papeis é uma tabela
-- nova, exclusiva do backoffice do SAG (nunca exposta ao Data API), que
-- registra quais papéis de painel (admin, teacher) cada perfil possui. Uma
-- pessoa que já é professora (perfis.role = 'teacher') e também administra o
-- painel ganha uma segunda linha aqui — não uma segunda conta.
--
-- backoffice_admins deixa de ser consultada pelo login do SAG a partir desta
-- migration (ver repositório SAG), mas a tabela não é apagada: fica
-- disponível para auditoria/rollback até a migração de dados ser confirmada.

begin;

create table if not exists public.perfis_papeis (
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  papel text not null check (papel in ('admin', 'teacher')),
  created_at timestamptz not null default now(),
  primary key (perfil_id, papel)
);

comment on table public.perfis_papeis is
  'Papéis de painel (admin/teacher) que uma identidade de perfis possui simultaneamente. Exclusivo do backoffice do SAG — nunca exposto ao Data API do Bloquin.';

alter table public.perfis_papeis enable row level security;

drop policy if exists perfis_papeis_data_api_deny on public.perfis_papeis;
create policy perfis_papeis_data_api_deny
  on public.perfis_papeis
  using (false)
  with check (false);

revoke all on table public.perfis_papeis from public, anon, authenticated;
grant all on table public.perfis_papeis to service_role;

create index if not exists perfis_papeis_papel_idx
  on public.perfis_papeis (papel);

-- Backfill: toda identidade que já é 'admin' ou 'teacher' em perfis.role
-- ganha o papel correspondente. Alunos ficam de fora — não fazem parte do
-- backoffice e continuam autenticando exclusivamente pelo Bloquin.
insert into public.perfis_papeis (perfil_id, papel)
select id, role
from public.perfis
where role in ('admin', 'teacher')
on conflict do nothing;

comment on table public.backoffice_admins is
  'DEPRECADO: mantido apenas para auditoria/rollback. O login do SAG não lê mais esta tabela — identidades de admin agora são linhas de public.perfis com um papel ''admin'' em public.perfis_papeis.';

-- ── Sessões do backoffice: multi-papel ────────────────────────────────────
--
-- As funções abaixo paravam de bifurcar entre backoffice_admins e perfis:
-- toda identidade do backoffice agora é uma linha de perfis, e o conjunto de
-- papéis é sempre lido ao vivo de perfis_papeis — revogar um papel (ex.:
-- tirar o admin de alguém) tem efeito imediato na próxima validação, sem
-- esperar a sessão de 8h expirar.

drop function if exists public.create_backoffice_session(uuid, text, text);

create function public.create_backoffice_session(
  p_actor_id uuid,
  p_panel_session_token_hash text
)
returns table (
  session_id uuid,
  actor_id uuid,
  actor_name text,
  actor_roles text[],
  must_change_password boolean,
  session_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_must_change boolean;
  v_roles text[];
  v_session_id uuid;
  v_session_expires_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_id is null
     or p_panel_session_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid backoffice session request'
      using errcode = '22023';
  end if;

  select profile.nome, profile.must_change_senha
  into v_name, v_must_change
  from public.perfis profile
  where profile.id = p_actor_id
    and profile.access_status::text = 'ATIVO'
    and profile.entity_status::text = 'ATIVO';

  if not found then
    raise exception 'Backoffice actor is not authorized'
      using errcode = '42501';
  end if;

  select array_agg(upper(papeis.papel) order by papeis.papel)
  into v_roles
  from public.perfis_papeis papeis
  where papeis.perfil_id = p_actor_id;

  if v_roles is null or array_length(v_roles, 1) is null then
    raise exception 'Backoffice actor has no panel role assigned'
      using errcode = '42501';
  end if;

  update public.backoffice_sessions panel_session
  set revoked_at = v_now,
      revoked_reason = 'replaced_by_direct_login'
  where panel_session.actor_id = p_actor_id
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
    lower(v_roles[1]),
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
    v_roles,
    v_must_change,
    v_session_expires_at;
end;
$$;

drop function if exists public.validate_backoffice_session(text);

create function public.validate_backoffice_session(
  p_panel_session_token_hash text
)
returns table (
  session_id uuid,
  actor_id uuid,
  actor_name text,
  actor_roles text[],
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
  v_must_change boolean;
  v_roles text[];
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

  select profile.nome, profile.must_change_senha
  into v_name, v_must_change
  from public.perfis profile
  where profile.id = v_panel_session.actor_id
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

  if not found then
    update public.backoffice_sessions
    set revoked_at = v_now,
        revoked_reason = 'actor_or_source_session_invalid'
    where id = v_panel_session.id
      and revoked_at is null;
    return;
  end if;

  select array_agg(upper(papeis.papel) order by papeis.papel)
  into v_roles
  from public.perfis_papeis papeis
  where papeis.perfil_id = v_panel_session.actor_id;

  if v_roles is null or array_length(v_roles, 1) is null then
    update public.backoffice_sessions
    set revoked_at = v_now,
        revoked_reason = 'no_panel_role_assigned'
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
    v_roles,
    v_must_change,
    v_panel_session.expires_at;
end;
$$;

drop function if exists public.consume_admin_panel_handoff(text, text, text, text);

create function public.consume_admin_panel_handoff(
  p_code_hash text,
  p_panel_session_token_hash text,
  p_purpose text default 'admin_panel_login',
  p_audience text default 'sag'
)
returns table (
  session_id uuid,
  actor_id uuid,
  actor_name text,
  actor_roles text[],
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
  v_roles text[];
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

  select array_agg(upper(papeis.papel) order by papeis.papel)
  into v_roles
  from public.perfis_papeis papeis
  where papeis.perfil_id = v_profile.id;

  if v_roles is null or array_length(v_roles, 1) is null then
    update private.admin_panel_handoffs
    set invalidated_at = v_now,
        invalidation_reason = 'no_panel_role_assigned'
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
    lower(v_roles[1]),
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
    v_roles,
    v_profile.must_change_senha,
    v_session_expires_at;
end;
$$;

-- issue_admin_panel_handoff e revoke_admin_panel_access invalidavam sessões
-- antigas filtrando actor_type = 'teacher'. Com uma única identidade por
-- actor_id (em vez de admin/teacher como contas separadas), o filtro correto
-- passa a ser só o actor_id — evita duas sessões simultâneas válidas para a
-- mesma pessoa quando ela também acumula o papel admin.

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
    and panel_session.source_session_token_hash = p_source_session_token_hash;

  get diagnostics v_revoked = row_count;
  return v_revoked;
end;
$$;

revoke all on function public.create_backoffice_session(uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_backoffice_session(uuid, text)
  to service_role;

revoke all on function public.validate_backoffice_session(text)
  from public, anon, authenticated;
grant execute on function public.validate_backoffice_session(text)
  to service_role;

revoke all on function public.consume_admin_panel_handoff(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_admin_panel_handoff(text, text, text, text)
  to service_role;

revoke all on function public.issue_admin_panel_handoff(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.issue_admin_panel_handoff(uuid, uuid, text, text, text, text)
  to service_role;

revoke all on function public.revoke_admin_panel_access(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.revoke_admin_panel_access(uuid, text, text)
  to service_role;

commit;
