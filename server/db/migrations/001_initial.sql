-- MedAI V1 — schema inicial. PostgreSQL 15+ (produção) e PGlite (desenvolvimento/testes).
-- Convenções: ids de domínio gerados pela aplicação (text) quando o motor adaptativo já os cria;
-- datas em timestamptz; campos externos (Radar) sempre anuláveis: ausência = NULL, nunca um valor inventado.

-- ============ Identidade ============
CREATE TABLE users (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE,              -- normalizado em minúsculas
  password_hash text NOT NULL,                     -- scrypt (salt + parâmetros no próprio valor)
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE auth_sessions (
  token_hash   text PRIMARY KEY,                   -- SHA-256 do token; o token só existe no cookie
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);

-- ============ Perfil do estudante e objetivo ============
CREATE TABLE student_profiles (
  user_id            text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name       text,
  onboarding_step    smallint NOT NULL DEFAULT 1,
  onboarding_draft   jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_session_id text,
  legacy             jsonb NOT NULL DEFAULT '{}'::jsonb,  -- itens antigos sem evidência (ex.: demo.legacyReviews)
  meta               jsonb NOT NULL DEFAULT '{}'::jsonb,  -- createdAt, migratedFrom, migratedAt
  local_import       jsonb,                               -- registro da importação do navegador (impressão digital, contagens)
  state_version      integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE study_goals (
  user_id       text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  exam          text NOT NULL,
  year          integer,
  specialty     text NOT NULL DEFAULT '',
  specialty_id  text,
  hours         integer,
  target_date   date,
  completed_at  timestamptz,
  updated_at    timestamptz
);

-- ============ Conteúdo: taxonomia e questões com proveniência ============
CREATE TABLE topics (
  key        text PRIMARY KEY,                      -- clinica-medica/cardiologia/...
  level      text NOT NULL CHECK (level IN ('area', 'topic', 'subtopic')),
  label      text NOT NULL,
  parent_key text REFERENCES topics(key)
);

CREATE TABLE question_sources (
  id                text PRIMARY KEY,
  source_type       text NOT NULL,                  -- AI_ASSISTED_AUTHORED, OFFICIAL_EXAM, AUTHORED, ...
  source_name       text NOT NULL,
  source_url        text,
  source_date       date,
  exam_attribution  text,                           -- só com evidência; NULL = não atribuída a prova alguma
  notes             text
);

CREATE TABLE questions (
  id                text PRIMARY KEY,
  source_id         text NOT NULL REFERENCES question_sources(id),
  area_key          text NOT NULL REFERENCES topics(key),
  topic_key         text NOT NULL REFERENCES topics(key),
  subtopic_key      text REFERENCES topics(key),
  title             text NOT NULL,
  stem              text NOT NULL,
  options           jsonb NOT NULL,
  correct_index     smallint NOT NULL,
  explanation       text NOT NULL,
  analysis          jsonb NOT NULL,
  key_point         text NOT NULL,
  question_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_status text NOT NULL DEFAULT 'PROVISIONAL'
    CHECK (validation_status IN ('PROVISIONAL', 'SOURCE_VERIFIED', 'MEDICAL_REVIEW_REQUIRED', 'MEDICALLY_REVIEWED')),
  last_verified_at  timestamptz,
  active            boolean NOT NULL DEFAULT true,
  position          integer NOT NULL DEFAULT 0,          -- ordem estável do banco (o motor percorre o banco em ordem)
  content_version   integer NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Revisão médica humana. MEDICALLY_REVIEWED só é aceito se houver um registro aprovado aqui (ver trigger).
CREATE TABLE question_reviews (
  id           bigserial PRIMARY KEY,
  question_id  text NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  reviewer     text NOT NULL,
  credentials  text,
  decision     text NOT NULL CHECK (decision IN ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED')),
  notes        text,
  reviewed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION questions_require_human_review() RETURNS trigger AS $$
BEGIN
  IF NEW.validation_status = 'MEDICALLY_REVIEWED' AND NOT EXISTS (
    SELECT 1 FROM question_reviews r WHERE r.question_id = NEW.id AND r.decision = 'APPROVED'
  ) THEN
    RAISE EXCEPTION 'MEDICALLY_REVIEWED exige revisão humana aprovada em question_reviews (questão %)', NEW.id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER questions_human_review BEFORE INSERT OR UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION questions_require_human_review();

-- ============ Simulados ============
CREATE TABLE simulations (
  id            text PRIMARY KEY,
  title         text NOT NULL,                      -- ex.: "Simulado MedAI — banco inicial"
  description   text NOT NULL,
  size          integer NOT NULL,
  composition   text NOT NULL,                      -- regra de montagem (ex.: balanced-areas)
  content_note  text NOT NULL,                      -- aviso de conteúdo provisório
  official      boolean NOT NULL DEFAULT false,     -- só true com base oficial documentada
  active        boolean NOT NULL DEFAULT true
);

-- ============ Eventos do estudo (alimentam o motor adaptativo) ============
-- Uma sessão de estudo; simulados são sessões com kind = 'simulado' e simulation_id preenchido.
CREATE TABLE study_sessions (
  seq           bigserial,                          -- ordem de inserção (o motor depende da ordem dos eventos)
  id            text NOT NULL,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode          text,
  kind          text NOT NULL,
  status        text NOT NULL,                      -- em andamento | concluída | interrompida
  simulation_id text REFERENCES simulations(id),
  started_at    timestamptz,
  completed_at  timestamptz,
  question_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  record        jsonb NOT NULL,                     -- registro completo (studySessions[] do motor)
  runtime       jsonb,                              -- estado de execução (itens, índice, respostas) para retomada
  PRIMARY KEY (user_id, id)
);

CREATE TABLE question_attempts (
  seq           bigserial,                          -- ordem de inserção (o motor depende da ordem dos eventos)
  id             text NOT NULL,
  user_id        text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id     text,
  question_id    text,                              -- pode não existir mais no banco (dado migrado)
  topic_key      text,
  correct        boolean NOT NULL,
  choice         smallint,
  answered_at    timestamptz,                       -- NULL em respostas migradas sem horário
  response_ms    integer,
  is_review      boolean NOT NULL DEFAULT false,
  source         text NOT NULL DEFAULT 'user',
  data           jsonb NOT NULL,                    -- registro completo (answers[] do motor)
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX question_attempts_topic ON question_attempts(user_id, topic_key);

CREATE TABLE content_reviews (
  seq           bigserial,                          -- ordem de inserção (o motor depende da ordem dos eventos)
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  session_id  text NOT NULL DEFAULT '',
  at          timestamptz NOT NULL,
  data        jsonb NOT NULL,
  PRIMARY KEY (user_id, question_id, session_id)
);

CREATE TABLE reviews (
  seq           bigserial,                          -- ordem de inserção (o motor depende da ordem dos eventos)
  id          text NOT NULL,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_key   text NOT NULL,
  status      text NOT NULL,                        -- pending | done
  reason      text NOT NULL,
  priority    text NOT NULL,
  due_at      timestamptz,
  created_at  timestamptz,
  completed_at timestamptz,
  data        jsonb NOT NULL,                       -- registro completo, inclusive history[]
  PRIMARY KEY (user_id, id)
);
CREATE INDEX reviews_pending ON reviews(user_id, status, due_at);

-- Snapshot derivado do modelo de conhecimento (regenerável a partir dos eventos).
CREATE TABLE topic_mastery (
  user_id        text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_key       text NOT NULL,
  level          text NOT NULL,
  mastery        double precision,
  state          text NOT NULL,
  trend          text,
  questions_answered integer NOT NULL DEFAULT 0,
  model_version  integer NOT NULL,
  computed_at    timestamptz NOT NULL,
  metrics        jsonb NOT NULL,
  PRIMARY KEY (user_id, node_key)
);

-- ============ Radar de residências e editais ============
CREATE TABLE notice_sources (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  organization    text NOT NULL,
  url             text NOT NULL,
  source_type     text NOT NULL,                    -- API | RSS | HTML | PDF
  access_method   text NOT NULL,
  automated       boolean NOT NULL,                 -- false = ingestão/verificação manual
  notes           text,
  last_checked_at timestamptz,
  last_status     text,                             -- OK | ERROR | UNAVAILABLE | NOT_MODIFIED
  last_error      text
);

CREATE TABLE institutions (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  acronym      text,
  uf           text,                                -- NULL quando não informado pela fonte
  city         text,
  official_url text
);

CREATE TABLE selection_processes (
  id                  text PRIMARY KEY,
  source_id           text NOT NULL REFERENCES notice_sources(id),
  institution_id      text REFERENCES institutions(id),
  external_key        text NOT NULL,                -- chave estável da fonte, evita duplicação
  name                text NOT NULL,
  year                integer,
  process_type        text,
  prerequisite        text,
  total_vacancies     integer,
  registration_start  date,
  registration_end    date,
  exam_date           date,
  stages              jsonb,
  fee_cents           integer,
  official_url        text NOT NULL,
  notice_url          text,
  published_at        date,
  status_note         text,                         -- situação textual publicada pela fonte, se houver
  review_status       text NOT NULL DEFAULT 'OK' CHECK (review_status IN ('OK', 'NEEDS_REVIEW')),
  registration_state  text,                         -- último estado derivado das datas (para detectar mudança)
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_verified_at    timestamptz,
  removed_at          timestamptz,                  -- deixou de aparecer na fonte
  UNIQUE (source_id, external_key)
);

-- Documento oficial (edital, retificação, resultado...) de um processo.
CREATE TABLE notices (
  id             bigserial PRIMARY KEY,
  process_id     text NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  kind           text NOT NULL,                     -- EDITAL | RETIFICACAO | RESULTADO | OUTRO
  title          text NOT NULL,
  url            text NOT NULL,
  published_at   date,
  content_type   text,
  content_hash   text,
  byte_size      integer,
  fetched_at     timestamptz,
  parse_status   text,                              -- PARSED | NOT_PARSED | FAILED
  parse_error    text,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (process_id, url)
);

-- Vagas por programa/especialidade quando o documento informa.
CREATE TABLE residency_programs (
  id            bigserial PRIMARY KEY,
  process_id    text NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  specialty     text NOT NULL,
  specialty_id  text,
  program_type  text,                               -- acesso direto, pré-requisito...
  prerequisite  text,
  vacancies     integer,                            -- NULL = não informado
  evidence      text,
  notice_id     bigint REFERENCES notices(id) ON DELETE SET NULL,
  UNIQUE (process_id, specialty, program_type)
);

-- Evidência de cada campo crítico extraído (auditoria).
CREATE TABLE extracted_fields (
  id          bigserial PRIMARY KEY,
  process_id  text NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  notice_id   bigint REFERENCES notices(id) ON DELETE SET NULL,
  field       text NOT NULL,
  value       jsonb,
  evidence    text,
  source_url  text NOT NULL,
  method      text NOT NULL,                        -- html-text, pdf-text, api-json, manual
  confidence  double precision NOT NULL,
  status      text NOT NULL CHECK (status IN ('ACCEPTED', 'NEEDS_REVIEW', 'NOT_FOUND')),
  extracted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (process_id, field)
);

CREATE TABLE process_changes (
  id           bigserial PRIMARY KEY,
  process_id   text NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  change_type  text NOT NULL,                       -- NOVO_PROCESSO, NOVO_EDITAL, EDITAL_RETIFICADO, INSCRICOES_ABERTAS, ...
  field        text,
  old_value    jsonb,
  new_value    jsonb,
  detail       text,
  detected_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX process_changes_process ON process_changes(process_id, detected_at);

CREATE TABLE ingestion_runs (
  id          bigserial PRIMARY KEY,
  source_id   text REFERENCES notice_sources(id),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status      text NOT NULL DEFAULT 'RUNNING',      -- RUNNING | OK | PARTIAL | ERROR
  stats       jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors      jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE tracked_processes (
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  process_id  text NOT NULL REFERENCES selection_processes(id) ON DELETE CASCADE,
  specialty   text,                                 -- especialidade de interesse dentro do processo (opcional)
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, process_id)
);
