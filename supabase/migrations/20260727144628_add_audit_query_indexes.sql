


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."access_status" AS ENUM (
    'ATIVO',
    'BLOQUEADO',
    'ENCERRADO'
);


ALTER TYPE "public"."access_status" OWNER TO "postgres";


CREATE TYPE "public"."entity_status" AS ENUM (
    'ATIVO',
    'INATIVO',
    'ENCERRADO'
);


ALTER TYPE "public"."entity_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."biblioteca_can_manage_publicacao"("p_publicacao_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  select exists (
    select 1
      from public.biblioteca_publicacoes publication
     where publication.id = p_publicacao_id
       and publication.autor_id = (select auth.uid())
       and (select private.current_profile_role()) = 'teacher'
  );
$$;


ALTER FUNCTION "private"."biblioteca_can_manage_publicacao"("p_publicacao_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."biblioteca_can_manage_turma"("p_turma_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  select exists (
    select 1
      from public.turmas classroom
     where classroom.id = p_turma_id
       and classroom.professor_id = (select auth.uid())
       and (select private.current_profile_role()) = 'teacher'
  );
$$;


ALTER FUNCTION "private"."biblioteca_can_manage_turma"("p_turma_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."biblioteca_can_read_publicacao"("p_publicacao_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  select exists (
    select 1
      from public.biblioteca_publicacoes publication
     where publication.id = p_publicacao_id
       and (
         publication.autor_id = (select auth.uid())
         or (
           publication.excluido_em is null
           and publication.status = 'published'
           and exists (
             select 1
               from public.biblioteca_publicacao_turmas target
               join public.perfis student
                 on student.id = (select auth.uid())
                and student.turma_id = target.turma_id
                and student.role = 'student'
              where target.publicacao_id = publication.id
           )
         )
       )
  );
$$;


ALTER FUNCTION "private"."biblioteca_can_read_publicacao"("p_publicacao_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."current_profile_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  select profile.role
    from public.perfis profile
   where profile.id = (select auth.uid())
   limit 1;
$$;


ALTER FUNCTION "private"."current_profile_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."current_profile_turma_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  select p.turma_id
  from public.perfis p
  where p.id = auth.uid()
  limit 1;
$$;


ALTER FUNCTION "private"."current_profile_turma_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apagar_utilizador"("user_id_to_delete" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  DELETE FROM auth.users WHERE id = user_id_to_delete;
END;
$$;


ALTER FUNCTION "public"."apagar_utilizador"("user_id_to_delete" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backoffice_actor_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT actor_id
  FROM   public.backoffice_sessions
  WHERE  token_hash = current_setting('app.backoffice_token_hash', true)
    AND  expires_at > now()
  LIMIT  1;
$$;


ALTER FUNCTION "public"."backoffice_actor_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backoffice_actor_type"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT actor_type
  FROM   public.backoffice_sessions
  WHERE  token_hash = current_setting('app.backoffice_token_hash', true)
    AND  expires_at > now()
  LIMIT  1;
$$;


ALTER FUNCTION "public"."backoffice_actor_type"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_backoffice_sessions"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM public.backoffice_sessions WHERE expires_at <= now();
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;


ALTER FUNCTION "public"."cleanup_backoffice_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_project"("p_project_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  current_user_id uuid := auth.uid();
  project_owner_id uuid;
  deleted_project_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sessão não encontrada.' using errcode = '42501';
  end if;

  select dono_id
    into project_owner_id
    from public.projetos
   where id = p_project_id;

  if project_owner_id is null then
    raise exception 'Projeto não encontrado.' using errcode = 'P0002';
  end if;

  if project_owner_id <> current_user_id and not exists (
    select 1
      from public.perfis student_profile
      join public.turmas classroom on classroom.id = student_profile.turma_id
     where student_profile.id = project_owner_id
       and student_profile.role = 'student'
       and classroom.professor_id = current_user_id
  ) then
    raise exception 'Você não tem permissão para excluir este projeto.' using errcode = '42501';
  end if;

  delete from public.projetos
   where id = p_project_id
  returning id into deleted_project_id;

  if deleted_project_id is null then
    raise exception 'O projeto não pôde ser excluído.' using errcode = 'P0001';
  end if;

  return deleted_project_id;
end;
$$;


ALTER FUNCTION "public"."delete_project"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_student_user"("p_student_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  -- 1. Apaga os projetos
  DELETE FROM public.projects WHERE student_id = p_student_id;

  -- 2. Remove da turma
  DELETE FROM public.classroom_students WHERE student_id = p_student_id;

  -- 3. Apaga o perfil
  DELETE FROM public.profiles WHERE id = p_student_id;

  -- 4. Apaga a conta de login
  DELETE FROM auth.users WHERE id = p_student_id;
END;
$$;


ALTER FUNCTION "public"."delete_student_user"("p_student_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."encerrar_escola"("p_escola_id" "uuid", "p_actor_id" "text", "p_actor_nome" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_escola_nome  TEXT;
  v_turmas_count INT;
  v_alunos_count INT;
BEGIN
  SELECT nome INTO v_escola_nome FROM escolas WHERE id = p_escola_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escola não encontrada';
  END IF;

  -- Contar impacto
  SELECT COUNT(*) INTO v_turmas_count
  FROM turmas WHERE escola_id = p_escola_id AND entity_status != 'ENCERRADO';

  SELECT COUNT(*) INTO v_alunos_count
  FROM perfis p
  JOIN turmas t ON p.turma_id = t.id
  WHERE t.escola_id = p_escola_id AND p.access_status != 'ENCERRADO';

  -- 1. Bloquear alunos no Supabase Auth (feito via API, não aqui)
  -- 2. Encerrar alunos
  UPDATE perfis SET
    access_status  = 'ENCERRADO',
    entity_status  = 'ENCERRADO',
    closed_at      = NOW(),
    temp_senha     = NULL,
    must_change_senha = FALSE
  WHERE turma_id IN (SELECT id FROM turmas WHERE escola_id = p_escola_id)
    AND role = 'student';

  -- 3. Encerrar turmas
  UPDATE turmas SET
    entity_status = 'ENCERRADO',
    closed_at     = NOW()
  WHERE escola_id = p_escola_id;

  -- 4. Encerrar escola
  UPDATE escolas SET
    entity_status = 'ENCERRADO',
    closed_at     = NOW(),
    closed_by     = p_actor_id,
    status        = 'encerrado'
  WHERE id = p_escola_id;

  -- 5. Registrar auditoria
  INSERT INTO audit_log (actor_id, actor_nome, action, entity_type, entity_id, entity_nome, payload)
  VALUES (
    p_actor_id, p_actor_nome,
    'ESCOLA_ENCERRADA', 'escola', p_escola_id, v_escola_nome,
    jsonb_build_object(
      'turmas_afetadas', v_turmas_count,
      'alunos_afetados', v_alunos_count
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'turmasAfetadas', v_turmas_count,
    'alunosAfetados', v_alunos_count
  );
END;
$$;


ALTER FUNCTION "public"."encerrar_escola"("p_escola_id" "uuid", "p_actor_id" "text", "p_actor_nome" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_backoffice_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT COALESCE(public.backoffice_actor_type() = 'admin', false);
$$;


ALTER FUNCTION "public"."is_backoffice_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."professor_turma_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT id
  FROM   public.turmas
  WHERE  professor_id = public.backoffice_actor_id();
$$;


ALTER FUNCTION "public"."professor_turma_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."projetos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dono_id" "uuid" NOT NULL,
    "turma_id" "uuid" NOT NULL,
    "nome" "text" DEFAULT 'Novo Projeto'::"text" NOT NULL,
    "workspace_data" "jsonb" DEFAULT '{}'::"jsonb",
    "target_board" "text" DEFAULT 'uno'::"text" NOT NULL,
    "tipo" "text" DEFAULT 'livre'::"text" NOT NULL,
    "projeto_original_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "descricao" "text" DEFAULT ''::"text",
    "shared_from" "uuid",
    CONSTRAINT "projetos_tipo_check" CHECK (("tipo" = ANY (ARRAY['livre'::"text", 'template_professor'::"text", 'submissao_desafio'::"text"])))
);


ALTER TABLE "public"."projetos" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."share_project"("p_source_project_id" "uuid", "p_target_user_ids" "uuid"[], "p_target_turma_id" "uuid", "p_new_name" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."projetos"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  current_user_id uuid := auth.uid();
  source_project public.projetos%rowtype;
  unique_target_ids uuid[];
  student_count integer;
  copy_name text;
  now_at timestamptz := now();
begin
  if current_user_id is null then
    raise exception 'Sessão não encontrada.' using errcode = '42501';
  end if;

  if p_target_user_ids is null or cardinality(p_target_user_ids) = 0 then
    raise exception 'Selecione pelo menos um aluno.' using errcode = '22023';
  end if;

  select array_agg(distinct target_id)
    into unique_target_ids
    from unnest(p_target_user_ids) as targets(target_id);

  if not exists (
    select 1
      from public.perfis teacher_profile
     where teacher_profile.id = current_user_id
       and teacher_profile.role = 'teacher'
  ) then
    raise exception 'Apenas professores podem compartilhar projetos.' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.turmas classroom
     where classroom.id = p_target_turma_id
       and classroom.professor_id = current_user_id
  ) then
    raise exception 'A turma selecionada não pertence ao professor.' using errcode = '42501';
  end if;

  select project.*
    into source_project
    from public.projetos project
   where project.id = p_source_project_id
     and project.dono_id = current_user_id;

  if not found then
    raise exception 'Projeto de origem não encontrado.' using errcode = 'P0002';
  end if;

  select count(*)
    into student_count
    from public.perfis student_profile
   where student_profile.id = any(unique_target_ids)
     and student_profile.turma_id = p_target_turma_id
     and student_profile.role = 'student';

  if student_count <> cardinality(unique_target_ids) then
    raise exception 'Um ou mais alunos não pertencem à turma selecionada.' using errcode = '42501';
  end if;

  copy_name := coalesce(nullif(trim(p_new_name), ''), '[Compartilhado] ' || source_project.nome);

  return query
  insert into public.projetos (
    dono_id,
    turma_id,
    nome,
    descricao,
    target_board,
    workspace_data,
    shared_from,
    created_at,
    updated_at
  )
  select
    target_id,
    p_target_turma_id,
    copy_name,
    coalesce(source_project.descricao, ''),
    source_project.target_board,
    source_project.workspace_data,
    p_source_project_id,
    now_at,
    now_at
    from unnest(unique_target_ids) as targets(target_id)
  returning *;
end;
$$;


ALTER FUNCTION "public"."share_project"("p_source_project_id" "uuid", "p_target_user_ids" "uuid"[], "p_target_turma_id" "uuid", "p_new_name" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_id" "text" NOT NULL,
    "actor_nome" "text" NOT NULL,
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "entity_nome" "text" NOT NULL,
    "payload" "jsonb",
    "ip_address" "text"
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_log" IS 'Log imutável de ações administrativas críticas';



CREATE TABLE IF NOT EXISTS "public"."avaliacoes_submissao" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "desafio_id" "uuid" NOT NULL,
    "projeto_submetido_id" "uuid" NOT NULL,
    "avaliador_id" "uuid" NOT NULL,
    "nota" numeric,
    "feedback_professor" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."avaliacoes_submissao" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backoffice_admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "login" "text" NOT NULL,
    "senha" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."backoffice_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backoffice_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "actor_type" "text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '08:00:00'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "backoffice_sessions_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['admin'::"text", 'teacher'::"text"])))
);


ALTER TABLE "public"."backoffice_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."backoffice_sessions" IS 'Sessões ativas do backoffice (administradores e professores).';



CREATE TABLE IF NOT EXISTS "public"."biblioteca_anexos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "publicacao_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "provider" "text",
    "titulo" "text",
    "descricao" "text",
    "ordem" integer DEFAULT 0 NOT NULL,
    "pode_baixar" boolean DEFAULT true NOT NULL,
    "mime_type" "text",
    "tamanho_bytes" bigint,
    "largura" integer,
    "altura" integer,
    "quantidade_paginas" integer,
    "storage_path" "text",
    "thumbnail_path" "text",
    "original_path" "text",
    "external_url" "text",
    "external_id" "text",
    "status" "text" DEFAULT 'ready'::"text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "biblioteca_anexos_altura_check" CHECK ((("altura" IS NULL) OR ("altura" > 0))),
    CONSTRAINT "biblioteca_anexos_largura_check" CHECK ((("largura" IS NULL) OR ("largura" > 0))),
    CONSTRAINT "biblioteca_anexos_metadata_length_check" CHECK (((("titulo" IS NULL) OR ("char_length"("titulo") <= 180)) AND (("descricao" IS NULL) OR ("char_length"("descricao") <= 500)))),
    CONSTRAINT "biblioteca_anexos_ordem_check" CHECK (("ordem" >= 0)),
    CONSTRAINT "biblioteca_anexos_quantidade_paginas_check" CHECK ((("quantidade_paginas" IS NULL) OR ("quantidade_paginas" > 0))),
    CONSTRAINT "biblioteca_anexos_status_check" CHECK (("status" = ANY (ARRAY['uploading'::"text", 'ready'::"text", 'failed'::"text"]))),
    CONSTRAINT "biblioteca_anexos_tamanho_bytes_check" CHECK ((("tamanho_bytes" IS NULL) OR ("tamanho_bytes" >= 0))),
    CONSTRAINT "biblioteca_anexos_tipo_check" CHECK (("tipo" = ANY (ARRAY['image'::"text", 'pdf'::"text", 'youtube'::"text", 'link'::"text"]))),
    CONSTRAINT "biblioteca_anexos_tipo_payload_check" CHECK (((("tipo" = ANY (ARRAY['image'::"text", 'pdf'::"text"])) AND ("storage_path" IS NOT NULL)) OR (("tipo" = 'youtube'::"text") AND ("provider" = 'youtube'::"text") AND ("external_id" ~ '^[A-Za-z0-9_-]{11}$'::"text") AND ("external_url" ~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}$'::"text")) OR (("tipo" = 'link'::"text") AND ("external_url" ~* '^https?://[^[:space:]]+$'::"text"))))
);


ALTER TABLE "public"."biblioteca_anexos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."biblioteca_publicacao_turmas" (
    "publicacao_id" "uuid" NOT NULL,
    "turma_id" "uuid" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."biblioteca_publicacao_turmas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."biblioteca_publicacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "autor_id" "uuid" NOT NULL,
    "autor_nome" "text" DEFAULT 'Professor'::"text" NOT NULL,
    "titulo" "text" NOT NULL,
    "conteudo_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "conteudo_texto" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "capa_anexo_id" "uuid",
    "publicado_em" timestamp with time zone,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "excluido_em" timestamp with time zone,
    CONSTRAINT "biblioteca_publicacoes_autor_nome_check" CHECK ((("char_length"("btrim"("autor_nome")) >= 1) AND ("char_length"("btrim"("autor_nome")) <= 120))),
    CONSTRAINT "biblioteca_publicacoes_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"]))),
    CONSTRAINT "biblioteca_publicacoes_titulo_check" CHECK ((("char_length"("btrim"("titulo")) >= 1) AND ("char_length"("btrim"("titulo")) <= 180)))
);


ALTER TABLE "public"."biblioteca_publicacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chamada_presencas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chamada_id" "uuid" NOT NULL,
    "aluno_id" "uuid" NOT NULL,
    "presente" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."chamada_presencas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chamadas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "professor_id" "uuid" NOT NULL,
    "turma_id" "uuid" NOT NULL,
    "cronograma_id" "uuid",
    "data_aula" "date" NOT NULL,
    "horario_inicio" time without time zone NOT NULL,
    "horario_fim" time without time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chamadas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cronograma_aulas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "professor_id" "uuid" NOT NULL,
    "turma_id" "uuid" NOT NULL,
    "dia_semana" "text" NOT NULL,
    "horario_inicio" time without time zone NOT NULL,
    "horario_fim" time without time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tipo" "text" DEFAULT 'AULA'::"text" NOT NULL,
    "data_inicio" "date",
    "data_fim" "date",
    "criado_por" "text" DEFAULT 'ADMIN'::"text" NOT NULL,
    CONSTRAINT "cronograma_aulas_criado_por_check" CHECK (("criado_por" = ANY (ARRAY['ADMIN'::"text", 'PROFESSOR'::"text"]))),
    CONSTRAINT "cronograma_aulas_dia_semana_check" CHECK (("dia_semana" = ANY (ARRAY['SEGUNDA'::"text", 'TERÇA'::"text", 'QUARTA'::"text", 'QUINTA'::"text", 'SEXTA'::"text", 'SÁBADO'::"text"]))),
    CONSTRAINT "cronograma_aulas_tipo_check" CHECK (("tipo" = ANY (ARRAY['AULA'::"text", 'REUNIÃO'::"text", 'AULA_SUBSTITUTA'::"text"])))
);


ALTER TABLE "public"."cronograma_aulas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."desafios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "turma_id" "uuid" NOT NULL,
    "criador_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "descricao" "text",
    "criterios_aceitacao" "text",
    "data_limite" timestamp with time zone,
    "status" "text" DEFAULT 'aberto'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "desafios_status_check" CHECK (("status" = ANY (ARRAY['aberto'::"text", 'encerrado'::"text", 'em_votacao'::"text"])))
);


ALTER TABLE "public"."desafios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."diario_aulas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "professor_id" "uuid" NOT NULL,
    "turma_id" "uuid" NOT NULL,
    "data_aula" "date" NOT NULL,
    "titulo" "text" DEFAULT ''::"text" NOT NULL,
    "conteudo" "text" DEFAULT ''::"text" NOT NULL,
    "observacoes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."diario_aulas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."escola_professores" (
    "professor_id" "uuid" NOT NULL,
    "escola_id" "uuid" NOT NULL
);


ALTER TABLE "public"."escola_professores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."escolas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "tipo" character varying(10) DEFAULT 'PUBLICA'::character varying,
    "entity_status" "public"."entity_status" DEFAULT 'ATIVO'::"public"."entity_status" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deactivated_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "closed_by" "text",
    CONSTRAINT "escolas_status_check" CHECK (("status" = ANY (ARRAY['ativo'::"text", 'suspenso'::"text", 'cancelado'::"text"]))),
    CONSTRAINT "escolas_tipo_check" CHECK ((("tipo")::"text" = ANY ((ARRAY['PUBLICA'::character varying, 'PRIVADA'::character varying])::"text"[])))
);


ALTER TABLE "public"."escolas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."membros_turma" (
    "turma_id" "uuid" NOT NULL,
    "utilizador_id" "uuid" NOT NULL
);


ALTER TABLE "public"."membros_turma" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."perfis" (
    "id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "turma_id" "uuid",
    "email" "text",
    "senha" "text",
    "access_status" "public"."access_status" DEFAULT 'ATIVO'::"public"."access_status" NOT NULL,
    "entity_status" "public"."entity_status" DEFAULT 'ATIVO'::"public"."entity_status" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deactivated_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "blocked_at" timestamp with time zone,
    "blocked_reason" "text",
    "temp_senha" "text",
    "temp_senha_expiry" timestamp with time zone,
    "must_change_senha" boolean DEFAULT false NOT NULL,
    CONSTRAINT "perfis_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'teacher'::"text", 'student'::"text"])))
);


ALTER TABLE "public"."perfis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projeto_colaboradores" (
    "projeto_id" "uuid" NOT NULL,
    "utilizador_id" "uuid" NOT NULL,
    "permissao" "text" DEFAULT 'leitura'::"text" NOT NULL,
    CONSTRAINT "projeto_colaboradores_permissao_check" CHECK (("permissao" = ANY (ARRAY['leitura'::"text", 'edicao'::"text"])))
);


ALTER TABLE "public"."projeto_colaboradores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."turmas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "escola_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "ano_letivo" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "professor_id" "uuid",
    "entity_status" "public"."entity_status" DEFAULT 'ATIVO'::"public"."entity_status" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deactivated_at" timestamp with time zone,
    "closed_at" timestamp with time zone
);


ALTER TABLE "public"."turmas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_sessions" (
    "user_id" "uuid" NOT NULL,
    "session_token" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_sessions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_alunos" WITH ("security_invoker"='true') AS
 SELECT "p"."id",
    "p"."nome",
    "p"."email",
    NULL::"text" AS "senha",
    "p"."role",
    "p"."turma_id",
    "p"."entity_status",
    "p"."access_status",
    "p"."blocked_at",
    "p"."blocked_reason",
    "p"."must_change_senha",
    "p"."temp_senha_expiry",
    "p"."created_at",
    "p"."updated_at",
    COALESCE("t"."nome", 'Sem Turma'::"text") AS "turma_nome",
    COALESCE("e"."nome", 'Sem Escola'::"text") AS "escola_nome",
    "t"."entity_status" AS "turma_status",
    "e"."entity_status" AS "escola_status"
   FROM (("public"."perfis" "p"
     LEFT JOIN "public"."turmas" "t" ON (("p"."turma_id" = "t"."id")))
     LEFT JOIN "public"."escolas" "e" ON (("t"."escola_id" = "e"."id")))
  WHERE ("p"."role" = 'student'::"text");


ALTER VIEW "public"."v_alunos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_registro_horas" AS
SELECT
    NULL::"uuid" AS "chamada_id",
    NULL::"uuid" AS "professor_id",
    NULL::"text" AS "professor_nome",
    NULL::"uuid" AS "turma_id",
    NULL::"text" AS "turma_nome",
    NULL::"uuid" AS "escola_id",
    NULL::"text" AS "escola_nome",
    NULL::character varying AS "escola_tipo",
    NULL::"date" AS "data_aula",
    NULL::integer AS "mes",
    NULL::integer AS "ano",
    NULL::"text" AS "horario_inicio",
    NULL::"text" AS "horario_fim",
    NULL::"text" AS "tipo_aula",
    NULL::numeric AS "horas_ministradas",
    NULL::bigint AS "total_alunos",
    NULL::bigint AS "total_presentes",
    NULL::bigint AS "total_ausentes";


ALTER VIEW "public"."v_registro_horas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_horas_por_professor" WITH ("security_invoker"='true') AS
 SELECT "professor_id",
    "professor_nome",
    "ano",
    "mes",
    "escola_id",
    "escola_nome",
    "escola_tipo",
    COALESCE("sum"("horas_ministradas") FILTER (WHERE (("tipo_aula" = 'AULA'::"text") AND (("escola_tipo")::"text" = 'PUBLICA'::"text"))), (0)::numeric) AS "horas_aula_publica",
    COALESCE("sum"("horas_ministradas") FILTER (WHERE (("tipo_aula" = 'AULA'::"text") AND (("escola_tipo")::"text" = 'PRIVADA'::"text"))), (0)::numeric) AS "horas_aula_privada",
    COALESCE("sum"("horas_ministradas") FILTER (WHERE ("tipo_aula" = ANY (ARRAY['REUNIÃO'::"text", 'AULA_SUBSTITUTA'::"text"]))), (0)::numeric) AS "horas_outras",
    COALESCE("sum"("horas_ministradas"), (0)::numeric) AS "horas_total",
    "count"(*) AS "total_aulas"
   FROM "public"."v_registro_horas"
  GROUP BY "professor_id", "professor_nome", "ano", "mes", "escola_id", "escola_nome", "escola_tipo";


ALTER VIEW "public"."v_horas_por_professor" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_turmas_backoffice" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"text" AS "nome",
    NULL::"text" AS "ano_letivo",
    NULL::"uuid" AS "professor_id",
    NULL::"text" AS "professor_nome",
    NULL::"uuid" AS "escola_id",
    NULL::"text" AS "escola_nome",
    NULL::bigint AS "total_alunos",
    NULL::timestamp with time zone AS "created_at";


ALTER VIEW "public"."v_turmas_backoffice" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."avaliacoes_submissao"
    ADD CONSTRAINT "avaliacoes_submissao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."backoffice_admins"
    ADD CONSTRAINT "backoffice_admins_login_key" UNIQUE ("login");



ALTER TABLE ONLY "public"."backoffice_admins"
    ADD CONSTRAINT "backoffice_admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."backoffice_sessions"
    ADD CONSTRAINT "backoffice_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."backoffice_sessions"
    ADD CONSTRAINT "backoffice_sessions_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."biblioteca_anexos"
    ADD CONSTRAINT "biblioteca_anexos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."biblioteca_publicacao_turmas"
    ADD CONSTRAINT "biblioteca_publicacao_turmas_pkey" PRIMARY KEY ("publicacao_id", "turma_id");



ALTER TABLE ONLY "public"."biblioteca_publicacoes"
    ADD CONSTRAINT "biblioteca_publicacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chamada_presencas"
    ADD CONSTRAINT "chamada_presencas_chamada_aluno_unique" UNIQUE ("chamada_id", "aluno_id");



ALTER TABLE ONLY "public"."chamada_presencas"
    ADD CONSTRAINT "chamada_presencas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chamada_presencas"
    ADD CONSTRAINT "chamada_presencas_unico" UNIQUE ("chamada_id", "aluno_id");



ALTER TABLE ONLY "public"."chamadas"
    ADD CONSTRAINT "chamadas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chamadas"
    ADD CONSTRAINT "chamadas_unico" UNIQUE ("professor_id", "turma_id", "data_aula");



ALTER TABLE ONLY "public"."cronograma_aulas"
    ADD CONSTRAINT "cronograma_aulas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."desafios"
    ADD CONSTRAINT "desafios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diario_aulas"
    ADD CONSTRAINT "diario_aulas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escola_professores"
    ADD CONSTRAINT "escola_professores_pkey" PRIMARY KEY ("professor_id", "escola_id");



ALTER TABLE ONLY "public"."escolas"
    ADD CONSTRAINT "escolas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."membros_turma"
    ADD CONSTRAINT "membros_turma_pkey" PRIMARY KEY ("turma_id", "utilizador_id");



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projeto_colaboradores"
    ADD CONSTRAINT "projeto_colaboradores_pkey" PRIMARY KEY ("projeto_id", "utilizador_id");



ALTER TABLE ONLY "public"."projetos"
    ADD CONSTRAINT "projetos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."turmas"
    ADD CONSTRAINT "turmas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "biblioteca_anexos_publicacao_ordem_idx" ON "public"."biblioteca_anexos" USING "btree" ("publicacao_id", "ordem", "id");



CREATE INDEX "biblioteca_publicacao_turmas_turma_idx" ON "public"."biblioteca_publicacao_turmas" USING "btree" ("turma_id", "publicacao_id");



CREATE INDEX "biblioteca_publicacoes_autor_idx" ON "public"."biblioteca_publicacoes" USING "btree" ("autor_id", "criado_em" DESC) WHERE ("excluido_em" IS NULL);



CREATE INDEX "biblioteca_publicacoes_capa_anexo_idx" ON "public"."biblioteca_publicacoes" USING "btree" ("capa_anexo_id");



CREATE INDEX "biblioteca_publicacoes_feed_idx" ON "public"."biblioteca_publicacoes" USING "btree" ("status", "publicado_em" DESC, "id" DESC) WHERE ("excluido_em" IS NULL);



CREATE INDEX "idx_audit_log_actor" ON "public"."audit_log" USING "btree" ("actor_id");



CREATE INDEX "idx_audit_log_created" ON "public"."audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_log_entity" ON "public"."audit_log" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_backoffice_sessions_expires" ON "public"."backoffice_sessions" USING "btree" ("expires_at");



CREATE INDEX "idx_backoffice_sessions_token" ON "public"."backoffice_sessions" USING "btree" ("token_hash");



CREATE INDEX "idx_chamadas_data" ON "public"."chamadas" USING "btree" ("professor_id", "data_aula");



CREATE INDEX "idx_chamadas_professor" ON "public"."chamadas" USING "btree" ("professor_id");



CREATE INDEX "idx_cronograma_datas" ON "public"."cronograma_aulas" USING "btree" ("professor_id", "tipo", "data_inicio", "data_fim");



CREATE INDEX "idx_cronograma_professor" ON "public"."cronograma_aulas" USING "btree" ("professor_id");



CREATE UNIQUE INDEX "idx_cronograma_regular_unico" ON "public"."cronograma_aulas" USING "btree" ("professor_id", "turma_id", "dia_semana") WHERE ("tipo" = 'AULA'::"text");



CREATE INDEX "idx_cronograma_turma" ON "public"."cronograma_aulas" USING "btree" ("turma_id");



CREATE INDEX "idx_diario_data" ON "public"."diario_aulas" USING "btree" ("data_aula" DESC);



CREATE INDEX "idx_diario_professor" ON "public"."diario_aulas" USING "btree" ("professor_id");



CREATE INDEX "idx_diario_turma" ON "public"."diario_aulas" USING "btree" ("turma_id");



CREATE INDEX "idx_escolas_status" ON "public"."escolas" USING "btree" ("entity_status");



CREATE INDEX "idx_perfis_access_status" ON "public"."perfis" USING "btree" ("access_status") WHERE ("role" = 'student'::"text");



CREATE INDEX "idx_presencas_chamada" ON "public"."chamada_presencas" USING "btree" ("chamada_id");



CREATE INDEX "idx_projetos_dono_id" ON "public"."projetos" USING "btree" ("dono_id");



CREATE INDEX "idx_projetos_updated_at" ON "public"."projetos" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_turmas_status" ON "public"."turmas" USING "btree" ("entity_status");



CREATE INDEX "idx_user_sessions_user_updated" ON "public"."user_sessions" USING "btree" ("user_id", "updated_at" DESC);



CREATE UNIQUE INDEX "perfis_email_unique" ON "public"."perfis" USING "btree" ("email");



CREATE INDEX "perfis_student_turma_nome_idx" ON "public"."perfis" USING "btree" ("turma_id", "nome") WHERE ("role" = 'student'::"text");



CREATE INDEX "projetos_dono_updated_at_idx" ON "public"."projetos" USING "btree" ("dono_id", "updated_at" DESC);



CREATE INDEX "projetos_shared_from_idx" ON "public"."projetos" USING "btree" ("shared_from");



CREATE INDEX "turmas_professor_created_at_idx" ON "public"."turmas" USING "btree" ("professor_id", "created_at" DESC);



CREATE OR REPLACE VIEW "public"."v_registro_horas" WITH ("security_invoker"='true') AS
 SELECT "c"."id" AS "chamada_id",
    "c"."professor_id",
    "pf"."nome" AS "professor_nome",
    "c"."turma_id",
    "t"."nome" AS "turma_nome",
    "e"."id" AS "escola_id",
    "e"."nome" AS "escola_nome",
    COALESCE("e"."tipo", 'PUBLICA'::character varying) AS "escola_tipo",
    "c"."data_aula",
    (EXTRACT(month FROM "c"."data_aula"))::integer AS "mes",
    (EXTRACT(year FROM "c"."data_aula"))::integer AS "ano",
    "to_char"(("c"."horario_inicio")::interval, 'HH24:MI'::"text") AS "horario_inicio",
    "to_char"(("c"."horario_fim")::interval, 'HH24:MI'::"text") AS "horario_fim",
    COALESCE("ca"."tipo", 'AULA'::"text") AS "tipo_aula",
    "round"((EXTRACT(epoch FROM ("c"."horario_fim" - "c"."horario_inicio")) / 3600.0), 4) AS "horas_ministradas",
    "count"("cp"."id") AS "total_alunos",
    "count"("cp"."id") FILTER (WHERE ("cp"."presente" = true)) AS "total_presentes",
    "count"("cp"."id") FILTER (WHERE ("cp"."presente" = false)) AS "total_ausentes"
   FROM ((((("public"."chamadas" "c"
     JOIN "public"."perfis" "pf" ON (("pf"."id" = "c"."professor_id")))
     JOIN "public"."turmas" "t" ON (("t"."id" = "c"."turma_id")))
     JOIN "public"."escolas" "e" ON (("e"."id" = "t"."escola_id")))
     LEFT JOIN "public"."cronograma_aulas" "ca" ON (("ca"."id" = "c"."cronograma_id")))
     LEFT JOIN "public"."chamada_presencas" "cp" ON (("cp"."chamada_id" = "c"."id")))
  GROUP BY "c"."id", "pf"."nome", "t"."nome", "e"."id", "e"."nome", "e"."tipo", "ca"."tipo";



CREATE OR REPLACE VIEW "public"."v_turmas_backoffice" WITH ("security_invoker"='true') AS
 SELECT "t"."id",
    "t"."nome",
    "t"."ano_letivo",
    "t"."professor_id",
    "p"."nome" AS "professor_nome",
    "e"."id" AS "escola_id",
    "e"."nome" AS "escola_nome",
    "count"("mt"."utilizador_id") FILTER (WHERE ("pf"."role" = 'student'::"text")) AS "total_alunos",
    "t"."created_at"
   FROM (((("public"."turmas" "t"
     LEFT JOIN "public"."perfis" "p" ON (("p"."id" = "t"."professor_id")))
     LEFT JOIN "public"."escolas" "e" ON (("e"."id" = "t"."escola_id")))
     LEFT JOIN "public"."membros_turma" "mt" ON (("mt"."turma_id" = "t"."id")))
     LEFT JOIN "public"."perfis" "pf" ON (("pf"."id" = "mt"."utilizador_id")))
  GROUP BY "t"."id", "p"."nome", "e"."id", "e"."nome";



CREATE OR REPLACE TRIGGER "trg_diario_updated_at" BEFORE UPDATE ON "public"."diario_aulas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_escolas_updated" BEFORE UPDATE ON "public"."escolas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_perfis_updated" BEFORE UPDATE ON "public"."perfis" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_turmas_updated" BEFORE UPDATE ON "public"."turmas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."avaliacoes_submissao"
    ADD CONSTRAINT "avaliacoes_submissao_avaliador_id_fkey" FOREIGN KEY ("avaliador_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."avaliacoes_submissao"
    ADD CONSTRAINT "avaliacoes_submissao_desafio_id_fkey" FOREIGN KEY ("desafio_id") REFERENCES "public"."desafios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."avaliacoes_submissao"
    ADD CONSTRAINT "avaliacoes_submissao_projeto_submetido_id_fkey" FOREIGN KEY ("projeto_submetido_id") REFERENCES "public"."projetos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."biblioteca_anexos"
    ADD CONSTRAINT "biblioteca_anexos_publicacao_id_fkey" FOREIGN KEY ("publicacao_id") REFERENCES "public"."biblioteca_publicacoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."biblioteca_publicacao_turmas"
    ADD CONSTRAINT "biblioteca_publicacao_turmas_publicacao_id_fkey" FOREIGN KEY ("publicacao_id") REFERENCES "public"."biblioteca_publicacoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."biblioteca_publicacao_turmas"
    ADD CONSTRAINT "biblioteca_publicacao_turmas_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."biblioteca_publicacoes"
    ADD CONSTRAINT "biblioteca_publicacoes_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."biblioteca_publicacoes"
    ADD CONSTRAINT "biblioteca_publicacoes_capa_fk" FOREIGN KEY ("capa_anexo_id") REFERENCES "public"."biblioteca_anexos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chamada_presencas"
    ADD CONSTRAINT "chamada_presencas_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chamada_presencas"
    ADD CONSTRAINT "chamada_presencas_chamada_id_fkey" FOREIGN KEY ("chamada_id") REFERENCES "public"."chamadas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chamadas"
    ADD CONSTRAINT "chamadas_cronograma_id_fkey" FOREIGN KEY ("cronograma_id") REFERENCES "public"."cronograma_aulas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chamadas"
    ADD CONSTRAINT "chamadas_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chamadas"
    ADD CONSTRAINT "chamadas_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cronograma_aulas"
    ADD CONSTRAINT "cronograma_aulas_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cronograma_aulas"
    ADD CONSTRAINT "cronograma_aulas_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."desafios"
    ADD CONSTRAINT "desafios_criador_id_fkey" FOREIGN KEY ("criador_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."desafios"
    ADD CONSTRAINT "desafios_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."diario_aulas"
    ADD CONSTRAINT "diario_aulas_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."diario_aulas"
    ADD CONSTRAINT "diario_aulas_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."escola_professores"
    ADD CONSTRAINT "escola_professores_escola_id_fkey" FOREIGN KEY ("escola_id") REFERENCES "public"."escolas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."escola_professores"
    ADD CONSTRAINT "escola_professores_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."membros_turma"
    ADD CONSTRAINT "membros_turma_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."membros_turma"
    ADD CONSTRAINT "membros_turma_utilizador_id_fkey" FOREIGN KEY ("utilizador_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projeto_colaboradores"
    ADD CONSTRAINT "projeto_colaboradores_projeto_id_fkey" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projeto_colaboradores"
    ADD CONSTRAINT "projeto_colaboradores_utilizador_id_fkey" FOREIGN KEY ("utilizador_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projetos"
    ADD CONSTRAINT "projetos_dono_id_fkey" FOREIGN KEY ("dono_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projetos"
    ADD CONSTRAINT "projetos_projeto_original_id_fkey" FOREIGN KEY ("projeto_original_id") REFERENCES "public"."projetos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projetos"
    ADD CONSTRAINT "projetos_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."turmas"
    ADD CONSTRAINT "turmas_escola_id_fkey" FOREIGN KEY ("escola_id") REFERENCES "public"."escolas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."turmas"
    ADD CONSTRAINT "turmas_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Aluno gerencia seus projetos" ON "public"."projetos" USING (((( SELECT "auth"."uid"() AS "uid") = "dono_id") AND (EXISTS ( SELECT 1
   FROM "public"."perfis" "owner_profile"
  WHERE (("owner_profile"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("owner_profile"."role" = 'student'::"text")))))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "dono_id") AND (EXISTS ( SELECT 1
   FROM "public"."perfis" "owner_profile"
  WHERE (("owner_profile"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("owner_profile"."role" = 'student'::"text") AND ("owner_profile"."turma_id" = "projetos"."turma_id"))))));



CREATE POLICY "Professor lê perfis da sua turma" ON "public"."perfis" FOR SELECT USING (("turma_id" IN ( SELECT "turmas"."id"
   FROM "public"."turmas"
  WHERE ("turmas"."professor_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Professor lê projetos da sua turma" ON "public"."projetos" FOR SELECT USING (("turma_id" IN ( SELECT "turmas"."id"
   FROM "public"."turmas"
  WHERE ("turmas"."professor_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Professor lê suas turmas" ON "public"."turmas" FOR SELECT USING (("professor_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Usuário lê seu próprio perfil" ON "public"."perfis" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_data_api_deny" ON "public"."audit_log" USING (false) WITH CHECK (false);



ALTER TABLE "public"."avaliacoes_submissao" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "avaliacoes_submissao_data_api_deny" ON "public"."avaliacoes_submissao" USING (false) WITH CHECK (false);



ALTER TABLE "public"."backoffice_admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "backoffice_admins_data_api_deny" ON "public"."backoffice_admins" USING (false) WITH CHECK (false);



ALTER TABLE "public"."backoffice_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "backoffice_sessions_data_api_deny" ON "public"."backoffice_sessions" USING (false) WITH CHECK (false);



ALTER TABLE "public"."biblioteca_anexos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "biblioteca_anexos_delete" ON "public"."biblioteca_anexos" FOR DELETE TO "authenticated" USING ("private"."biblioteca_can_manage_publicacao"("publicacao_id"));



CREATE POLICY "biblioteca_anexos_insert" ON "public"."biblioteca_anexos" FOR INSERT TO "authenticated" WITH CHECK (("private"."biblioteca_can_manage_publicacao"("publicacao_id") AND (("tipo" = ANY (ARRAY['youtube'::"text", 'link'::"text"])) OR ((("storage_path" IS NULL) OR (("storage"."foldername"("storage_path"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")) AND (("thumbnail_path" IS NULL) OR (("storage"."foldername"("thumbnail_path"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")) AND (("original_path" IS NULL) OR (("storage"."foldername"("original_path"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text"))))));



CREATE POLICY "biblioteca_anexos_select" ON "public"."biblioteca_anexos" FOR SELECT TO "authenticated" USING ("private"."biblioteca_can_read_publicacao"("publicacao_id"));



CREATE POLICY "biblioteca_anexos_update" ON "public"."biblioteca_anexos" FOR UPDATE TO "authenticated" USING ("private"."biblioteca_can_manage_publicacao"("publicacao_id")) WITH CHECK (("private"."biblioteca_can_manage_publicacao"("publicacao_id") AND (("tipo" = ANY (ARRAY['youtube'::"text", 'link'::"text"])) OR ((("storage_path" IS NULL) OR (("storage"."foldername"("storage_path"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")) AND (("thumbnail_path" IS NULL) OR (("storage"."foldername"("thumbnail_path"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")) AND (("original_path" IS NULL) OR (("storage"."foldername"("original_path"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text"))))));



ALTER TABLE "public"."biblioteca_publicacao_turmas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "biblioteca_publicacao_turmas_delete" ON "public"."biblioteca_publicacao_turmas" FOR DELETE TO "authenticated" USING ("private"."biblioteca_can_manage_publicacao"("publicacao_id"));



CREATE POLICY "biblioteca_publicacao_turmas_insert" ON "public"."biblioteca_publicacao_turmas" FOR INSERT TO "authenticated" WITH CHECK (("private"."biblioteca_can_manage_publicacao"("publicacao_id") AND "private"."biblioteca_can_manage_turma"("turma_id")));



CREATE POLICY "biblioteca_publicacao_turmas_select" ON "public"."biblioteca_publicacao_turmas" FOR SELECT TO "authenticated" USING ("private"."biblioteca_can_read_publicacao"("publicacao_id"));



ALTER TABLE "public"."biblioteca_publicacoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "biblioteca_publicacoes_delete" ON "public"."biblioteca_publicacoes" FOR DELETE TO "authenticated" USING ("private"."biblioteca_can_manage_publicacao"("id"));



CREATE POLICY "biblioteca_publicacoes_insert" ON "public"."biblioteca_publicacoes" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("autor_id" = ( SELECT "auth"."uid"() AS "uid")) AND (( SELECT "private"."current_profile_role"() AS "current_profile_role") = 'teacher'::"text")));



CREATE POLICY "biblioteca_publicacoes_select" ON "public"."biblioteca_publicacoes" FOR SELECT TO "authenticated" USING ("private"."biblioteca_can_read_publicacao"("id"));



CREATE POLICY "biblioteca_publicacoes_update" ON "public"."biblioteca_publicacoes" FOR UPDATE TO "authenticated" USING ("private"."biblioteca_can_manage_publicacao"("id")) WITH CHECK ((("autor_id" = ( SELECT "auth"."uid"() AS "uid")) AND (( SELECT "private"."current_profile_role"() AS "current_profile_role") = 'teacher'::"text")));



ALTER TABLE "public"."chamada_presencas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chamada_presencas_app_admin" ON "public"."chamada_presencas" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'admin'::"text")))));



CREATE POLICY "chamada_presencas_student_select" ON "public"."chamada_presencas" FOR SELECT TO "authenticated" USING (("aluno_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "chamada_presencas_teacher_manage" ON "public"."chamada_presencas" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."chamadas" "c"
  WHERE (("c"."id" = "chamada_presencas"."chamada_id") AND ("c"."professor_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."chamadas" "c"
  WHERE (("c"."id" = "chamada_presencas"."chamada_id") AND ("c"."professor_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."chamadas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chamadas_app_admin" ON "public"."chamadas" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'admin'::"text")))));



CREATE POLICY "chamadas_student_select" ON "public"."chamadas" FOR SELECT TO "authenticated" USING (("turma_id" = ( SELECT "p"."turma_id"
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'student'::"text")))));



CREATE POLICY "chamadas_teacher_manage" ON "public"."chamadas" TO "authenticated" USING (("professor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("professor_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "cronograma_app_admin" ON "public"."cronograma_aulas" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'admin'::"text")))));



ALTER TABLE "public"."cronograma_aulas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cronograma_student_select" ON "public"."cronograma_aulas" FOR SELECT TO "authenticated" USING (("turma_id" = ( SELECT "p"."turma_id"
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'student'::"text")))));



CREATE POLICY "cronograma_teacher_manage" ON "public"."cronograma_aulas" TO "authenticated" USING (("professor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("professor_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."desafios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "desafios_data_api_deny" ON "public"."desafios" USING (false) WITH CHECK (false);



CREATE POLICY "diario_app_admin" ON "public"."diario_aulas" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'admin'::"text")))));



ALTER TABLE "public"."diario_aulas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "diario_student_select" ON "public"."diario_aulas" FOR SELECT TO "authenticated" USING (("turma_id" = ( SELECT "p"."turma_id"
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'student'::"text")))));



CREATE POLICY "diario_teacher_manage" ON "public"."diario_aulas" TO "authenticated" USING (("professor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("professor_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."escola_professores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "escola_professores_data_api_deny" ON "public"."escola_professores" USING (false) WITH CHECK (false);



ALTER TABLE "public"."escolas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "escolas_app_admin" ON "public"."escolas" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'admin'::"text")))));



CREATE POLICY "escolas_member_select" ON "public"."escolas" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND (("p"."role" = 'admin'::"text") OR (EXISTS ( SELECT 1
           FROM "public"."turmas" "t"
          WHERE (("t"."id" = "p"."turma_id") AND ("t"."escola_id" = "escolas"."id")))) OR (EXISTS ( SELECT 1
           FROM "public"."turmas" "t"
          WHERE (("t"."professor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("t"."escola_id" = "escolas"."id")))))))));



ALTER TABLE "public"."membros_turma" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "membros_turma_data_api_deny" ON "public"."membros_turma" USING (false) WITH CHECK (false);



ALTER TABLE "public"."perfis" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projeto_colaboradores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projeto_colaboradores_data_api_deny" ON "public"."projeto_colaboradores" USING (false) WITH CHECK (false);



ALTER TABLE "public"."projetos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teacher_manages_class_projects" ON "public"."projetos" USING (((( SELECT "auth"."uid"() AS "uid") = "dono_id") OR (EXISTS ( SELECT 1
   FROM ("public"."turmas" "classroom"
     JOIN "public"."perfis" "student_profile" ON (("student_profile"."turma_id" = "classroom"."id")))
  WHERE (("classroom"."professor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("student_profile"."id" = "projetos"."dono_id")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."turmas" "classroom"
  WHERE (("classroom"."id" = "projetos"."turma_id") AND ("classroom"."professor_id" = ( SELECT "auth"."uid"() AS "uid"))))) AND ((( SELECT "auth"."uid"() AS "uid") = "dono_id") OR (EXISTS ( SELECT 1
   FROM ("public"."turmas" "classroom"
     JOIN "public"."perfis" "student_profile" ON (("student_profile"."turma_id" = "classroom"."id")))
  WHERE (("classroom"."professor_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("student_profile"."id" = "projetos"."dono_id")))))));



ALTER TABLE "public"."turmas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "turmas_app_admin" ON "public"."turmas" TO "authenticated" USING (("private"."current_profile_role"() = 'admin'::"text")) WITH CHECK (("private"."current_profile_role"() = 'admin'::"text"));



CREATE POLICY "turmas_student_select" ON "public"."turmas" FOR SELECT TO "authenticated" USING ((("private"."current_profile_role"() = 'student'::"text") AND ("id" = "private"."current_profile_turma_id"())));



ALTER TABLE "public"."user_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_sessions_self" ON "public"."user_sessions" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "user_sessions_teacher_read" ON "public"."user_sessions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."perfis"
  WHERE (("perfis"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("perfis"."role" = 'teacher'::"text")))));



GRANT USAGE ON SCHEMA "private" TO "authenticated";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "private"."biblioteca_can_manage_publicacao"("p_publicacao_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."biblioteca_can_manage_publicacao"("p_publicacao_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."biblioteca_can_manage_turma"("p_turma_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."biblioteca_can_manage_turma"("p_turma_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."biblioteca_can_read_publicacao"("p_publicacao_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."biblioteca_can_read_publicacao"("p_publicacao_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."current_profile_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."current_profile_role"() TO "authenticated";



REVOKE ALL ON FUNCTION "private"."current_profile_turma_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."current_profile_turma_id"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."apagar_utilizador"("user_id_to_delete" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apagar_utilizador"("user_id_to_delete" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."backoffice_actor_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backoffice_actor_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."backoffice_actor_type"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backoffice_actor_type"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_backoffice_sessions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_backoffice_sessions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_project"("p_project_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_project"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_project"("p_project_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_student_user"("p_student_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_student_user"("p_student_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."encerrar_escola"("p_escola_id" "uuid", "p_actor_id" "text", "p_actor_nome" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."encerrar_escola"("p_escola_id" "uuid", "p_actor_id" "text", "p_actor_nome" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."encerrar_escola"("p_escola_id" "uuid", "p_actor_id" "text", "p_actor_nome" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_backoffice_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_backoffice_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."professor_turma_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."professor_turma_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."projetos" TO "anon";
GRANT ALL ON TABLE "public"."projetos" TO "authenticated";
GRANT ALL ON TABLE "public"."projetos" TO "service_role";



REVOKE ALL ON FUNCTION "public"."share_project"("p_source_project_id" "uuid", "p_target_user_ids" "uuid"[], "p_target_turma_id" "uuid", "p_new_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."share_project"("p_source_project_id" "uuid", "p_target_user_ids" "uuid"[], "p_target_turma_id" "uuid", "p_new_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."share_project"("p_source_project_id" "uuid", "p_target_user_ids" "uuid"[], "p_target_turma_id" "uuid", "p_new_name" "text") TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."avaliacoes_submissao" TO "anon";
GRANT ALL ON TABLE "public"."avaliacoes_submissao" TO "authenticated";
GRANT ALL ON TABLE "public"."avaliacoes_submissao" TO "service_role";



GRANT ALL ON TABLE "public"."backoffice_admins" TO "service_role";



GRANT ALL ON TABLE "public"."backoffice_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."biblioteca_anexos" TO "anon";
GRANT ALL ON TABLE "public"."biblioteca_anexos" TO "authenticated";
GRANT ALL ON TABLE "public"."biblioteca_anexos" TO "service_role";



GRANT ALL ON TABLE "public"."biblioteca_publicacao_turmas" TO "anon";
GRANT ALL ON TABLE "public"."biblioteca_publicacao_turmas" TO "authenticated";
GRANT ALL ON TABLE "public"."biblioteca_publicacao_turmas" TO "service_role";



GRANT ALL ON TABLE "public"."biblioteca_publicacoes" TO "anon";
GRANT ALL ON TABLE "public"."biblioteca_publicacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."biblioteca_publicacoes" TO "service_role";



GRANT ALL ON TABLE "public"."chamada_presencas" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."chamada_presencas" TO "authenticated";



GRANT ALL ON TABLE "public"."chamadas" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."chamadas" TO "authenticated";



GRANT ALL ON TABLE "public"."cronograma_aulas" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."cronograma_aulas" TO "authenticated";



GRANT ALL ON TABLE "public"."desafios" TO "anon";
GRANT ALL ON TABLE "public"."desafios" TO "authenticated";
GRANT ALL ON TABLE "public"."desafios" TO "service_role";



GRANT ALL ON TABLE "public"."diario_aulas" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."diario_aulas" TO "authenticated";



GRANT ALL ON TABLE "public"."escola_professores" TO "anon";
GRANT ALL ON TABLE "public"."escola_professores" TO "authenticated";
GRANT ALL ON TABLE "public"."escola_professores" TO "service_role";



GRANT ALL ON TABLE "public"."escolas" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."escolas" TO "authenticated";



GRANT ALL ON TABLE "public"."membros_turma" TO "anon";
GRANT ALL ON TABLE "public"."membros_turma" TO "authenticated";
GRANT ALL ON TABLE "public"."membros_turma" TO "service_role";



GRANT ALL ON TABLE "public"."perfis" TO "anon";
GRANT ALL ON TABLE "public"."perfis" TO "authenticated";
GRANT ALL ON TABLE "public"."perfis" TO "service_role";



GRANT ALL ON TABLE "public"."projeto_colaboradores" TO "service_role";



GRANT ALL ON TABLE "public"."turmas" TO "anon";
GRANT ALL ON TABLE "public"."turmas" TO "authenticated";
GRANT ALL ON TABLE "public"."turmas" TO "service_role";



GRANT ALL ON TABLE "public"."user_sessions" TO "anon";
GRANT ALL ON TABLE "public"."user_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."v_alunos" TO "service_role";



GRANT ALL ON TABLE "public"."v_registro_horas" TO "service_role";



GRANT ALL ON TABLE "public"."v_horas_por_professor" TO "service_role";



GRANT ALL ON TABLE "public"."v_turmas_backoffice" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
