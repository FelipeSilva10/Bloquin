-- Rastreamento de leitura da Biblioteca, por aluno.
--
-- Guarda, para cada (publicacao, aluno), quando o aluno abriu a publicação e
-- qual era o atualizado_em da publicação naquele momento. Isso é suficiente
-- para o frontend derivar três estados sem precisar de um contador de versão
-- paralelo: nunca visto (sem linha) = "Novo"; visto, mas atualizado_em da
-- publicação avançou desde então = "Atualizada"; caso contrário = "Normal".
--
-- RLS espelha o padrão já usado em public.user_sessions
-- (20260730144836_harden_profiles_and_sessions.sql): cada aluno só enxerga e
-- escreve a própria linha, via auth.uid().

begin;

create table public.biblioteca_leituras (
  publicacao_id uuid not null references public.biblioteca_publicacoes(id) on delete cascade,
  aluno_id uuid not null references public.perfis(id) on delete cascade,
  visualizado_em timestamptz not null default now(),
  visto_atualizado_em timestamptz not null,
  primary key (publicacao_id, aluno_id)
);

comment on table public.biblioteca_leituras is 'Registro por aluno de quando uma publicação da Biblioteca foi vista, e qual atualizado_em da publicação estava vigente naquela visualização.';

alter table public.biblioteca_leituras enable row level security;

create policy biblioteca_leituras_self_select
  on public.biblioteca_leituras
  for select to authenticated
  using (aluno_id = (select auth.uid()));

create policy biblioteca_leituras_self_insert
  on public.biblioteca_leituras
  for insert to authenticated
  with check (
    aluno_id = (select auth.uid())
    and private.biblioteca_can_read_publicacao(publicacao_id)
  );

create policy biblioteca_leituras_self_update
  on public.biblioteca_leituras
  for update to authenticated
  using (aluno_id = (select auth.uid()))
  with check (
    aluno_id = (select auth.uid())
    and private.biblioteca_can_read_publicacao(publicacao_id)
  );

revoke all on table public.biblioteca_leituras from public, anon, authenticated;
grant select on table public.biblioteca_leituras to authenticated;

-- O PostgREST inclui as colunas da chave de conflito no SET gerado por um
-- upsert (ex.: "aluno_id = excluded.aluno_id") mesmo quando o valor não muda,
-- então elas também precisam de grant de update — mesma pegadinha já
-- corrigida para public.user_sessions em
-- 20260730231326_allow_owner_session_upsert.sql.
grant insert (publicacao_id, aluno_id, visualizado_em, visto_atualizado_em)
  on table public.biblioteca_leituras to authenticated;
grant update (publicacao_id, aluno_id, visualizado_em, visto_atualizado_em)
  on table public.biblioteca_leituras to authenticated;

grant all on table public.biblioteca_leituras to service_role;

commit;
