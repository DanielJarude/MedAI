-- Radar: identidade estável de documentos, cache de documentos baixados, programas por instituição
-- (processos nacionais como o ENARE) e agrupamento de processos de uma mesma família (ex.: PSU-MG por hospital).

ALTER TABLE selection_processes ADD COLUMN process_group text;          -- ex.: "PSU-MG 2027"
ALTER TABLE selection_processes ADD COLUMN registration_note text;      -- horário/observação publicada junto ao período

ALTER TABLE notices ADD COLUMN doc_key text;                            -- identidade estável (URL sem parâmetro de versão)
UPDATE notices SET doc_key = url WHERE doc_key IS NULL;
ALTER TABLE notices ALTER COLUMN doc_key SET NOT NULL;
ALTER TABLE notices DROP CONSTRAINT notices_process_id_url_key;
ALTER TABLE notices ADD CONSTRAINT notices_process_doc_key UNIQUE (process_id, doc_key);
ALTER TABLE notices ADD COLUMN removed_at timestamptz;

ALTER TABLE residency_programs ADD COLUMN program_key text;
ALTER TABLE residency_programs ADD COLUMN institution_name text;
ALTER TABLE residency_programs ADD COLUMN uf text;
ALTER TABLE residency_programs ADD COLUMN city text;
ALTER TABLE residency_programs ADD COLUMN duration text;
ALTER TABLE residency_programs ADD COLUMN details jsonb;               -- colunas adicionais publicadas (ex.: vagas por modalidade)
UPDATE residency_programs SET program_key = specialty || '|' || coalesce(program_type, '') WHERE program_key IS NULL;
ALTER TABLE residency_programs ALTER COLUMN program_key SET NOT NULL;
ALTER TABLE residency_programs DROP CONSTRAINT residency_programs_process_id_specialty_program_type_key;
ALTER TABLE residency_programs ADD CONSTRAINT residency_programs_process_key UNIQUE (process_id, program_key);
CREATE INDEX residency_programs_specialty ON residency_programs(specialty_id);
CREATE INDEX residency_programs_uf ON residency_programs(uf);

-- Cache de documentos oficiais já baixados: evita baixar de novo o mesmo arquivo e permite requisições condicionais.
CREATE TABLE document_cache (
  url           text PRIMARY KEY,
  etag          text,
  last_modified text,
  content_type  text,
  content_hash  text NOT NULL,
  byte_size     integer NOT NULL,
  text          text,                                   -- texto extraído (PDF/HTML); NULL se não extraído
  parse_status  text NOT NULL,                          -- PARSED | FAILED | NOT_PARSED
  parse_error   text,
  fetched_at    timestamptz NOT NULL DEFAULT now()
);
