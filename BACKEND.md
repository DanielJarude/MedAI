# Backend V1

## Decisão

O projeto era um frontend em JavaScript puro (módulos ES) servido por um `server.mjs` sem dependências. O backend continua nessa linha: é pequeno, fácil de rodar e de migrar depois.

- **Node.js 20+**, `node:http` e um roteador próprio (`server/http/http-utils.mjs`), sem framework.
- **PostgreSQL** em produção (driver `pg`). Em desenvolvimento e testes, **PGlite**: o próprio PostgreSQL 17 compilado para WebAssembly, que dispensa instalação. O SQL é o mesmo nos dois (`DATABASE_URL=postgres://…` ou `pglite:./data/pglite`). Validado nesta etapa com PGlite e com PostgreSQL 16 em Docker.
- O **motor adaptativo roda no servidor**, com as mesmas funções puras de `dist/` (sem cópia nem reescrita). Cada comando segue a sequência: trava o perfil do usuário → carrega o estado do banco → aplica a função do motor → grava apenas as diferenças → devolve o novo estado. O navegador usa o mesmo motor só para exibir dados (plano sugerido, Foco de hoje).
- Dependências: `pg`, `@electric-sql/pglite` e `unpdf` (texto de PDF, JS puro).

```
dist/            frontend (estático) + motor adaptativo (funções puras, usadas também pelo servidor)
content/         banco inicial de questões (seed de produção, PROVISIONAL)
server/
  index.mjs      configuração → banco (migrations + seed) → HTTP
  app.mjs        rotas da API + arquivos estáticos
  http/          roteador, JSON com limite, cookies, cabeçalhos de segurança, limite de taxa
  auth/          senhas (scrypt)
  services/      auth, estudo (comandos do motor), radar (consulta)
  repositories/  estado do motor ⇄ tabelas
  db/            adaptador pg/PGlite, migrations versionadas, seeds
  radar/         coleta, extração, validação, armazenamento, coletores por fonte
```

## Identidade

- Conta com **e-mail + senha**.
  - Senha com **scrypt** (N=16384, r=8, p=1, salt de 16 bytes), comparada em tempo constante. Mínimo de 10 caracteres.
  - Sessão: token aleatório de 32 bytes num **cookie HttpOnly, SameSite=Lax** (`Secure` em produção ou com `COOKIE_SECURE=true`). O banco guarda apenas o **SHA-256** do token. Expira em `SESSION_DAYS` (30).
- **CSRF**: toda mutação exige o cabeçalho `X-MedAI-Request: 1`, que um formulário de outro site não consegue enviar. Não há CORS.
- **Limites de taxa** (em memória): 20 tentativas de login/cadastro a cada 15 min por IP; 600 requisições/min por IP na API.
- Limitações conhecidas:
  - não há recuperação de senha por e-mail nem verificação do e-mail;
  - o cadastro revela se um e-mail já existe;
  - os limites de taxa valem por processo, e com vários servidores seria preciso um armazenamento compartilhado.

## Endpoints

| Método | Rota | Uso |
|---|---|---|
| POST | `/api/auth/register` · `/api/auth/login` · `/api/auth/logout` | Conta e sessão |
| GET | `/api/auth/me` | Usuário atual (ou `null`) |
| GET | `/api/questions` | Banco ativo com proveniência |
| GET | `/api/state` | Estado completo do estudante (perfil, eventos, sessão atual, domínio) |
| PUT | `/api/onboarding` | Rascunho e etapa do onboarding |
| POST | `/api/onboarding/confirm` | Cria a meta (StudyGoal) |
| PUT | `/api/profile` | Minha meta (preserva o histórico) |
| POST | `/api/sessions` | `{type: recommended \| directed \| simulado, topicKey?}`: o servidor monta o plano |
| POST | `/api/sessions/current/shown` · `/answers` · `/advance` · `/finish` | Exibição, resposta `{index, choice}` (idempotente por índice), avanço e conclusão |
| POST | `/api/content-reviews` | "Compreendi a explicação" (não altera o domínio) |
| POST | `/api/reviews` | Adicionar o assunto à revisão |
| POST | `/api/import/local` | Importa o progresso do localStorage `{key, raw}` |
| POST | `/api/me/reset` | `{confirm: "RESETAR"}`: apaga os dados de estudo (mantém a conta e Minhas residências) |
| GET | `/api/me/export` | Exportação dos meus dados (JSON) |
| POST | `/api/me/delete` | `{confirm: "EXCLUIR", password}`: exclui a conta e todos os dados (cascade) |
| GET | `/api/radar/processes` | Filtros `specialty`, `institution`, `uf`, `year`, `open=1` |
| GET | `/api/radar/processes/:id` | Detalhe com programas, documentos, evidências e histórico |
| GET | `/api/radar/sources` | Fontes e último status |
| GET/POST/DELETE | `/api/radar/tracked[/:id]` | Minhas residências |
| GET | `/api/health` | Estado do banco |

Erros: `{error}` com mensagem em português.
- 401: sem sessão. 403: anti-CSRF. 409: conflito de estado. 422: validação (`errors` por campo). 429: limite de taxa.
- **503**: banco indisponível (`code: DB_UNAVAILABLE`).
- 500: genérico.

Nenhuma resposta traz stack trace ou detalhes internos.

## Banco e migrations

`server/db/migrations/NNN_nome.sql`, aplicadas em ordem, cada uma numa transação, com registro em `schema_migrations`.
- `001_initial`: identidade, perfil/meta, conteúdo com proveniência, eventos de estudo, simulados e Radar.
- `002_radar_pipeline`: identidade de documentos, programas por instituição, agrupamento e cache de documentos.

| Entidade pedida | Tabela |
|---|---|
| User | `users`, `auth_sessions` |
| StudentProfile | `student_profiles` (onboarding, sessão atual, metadados) |
| StudyGoal | `study_goals` |
| Topic | `topics` (área → assunto → subassunto) |
| Question / QuestionSource | `questions` (+ `validation_status`, `last_verified_at`, referências), `question_sources`, `question_reviews` |
| QuestionAttempt | `question_attempts` (colunas consultáveis + registro completo do motor em `data`) |
| StudySession | `study_sessions` (registro + estado de execução para retomada) |
| TopicMastery | `topic_mastery` (snapshot derivado, regenerável a partir dos eventos) |
| Review | `reviews` (com `history`) |
| Simulation / SimulationAttempt | `simulations` + `study_sessions` com `kind = 'simulado'` e `simulation_id`, sem duplicar a entidade de sessão |
| ResidencyProgram, SelectionProcess, Notice, NoticeSource, TrackedProcess | `residency_programs`, `selection_processes`, `notices`, `notice_sources`, `tracked_processes` (ver RADAR_EDITAIS.md) |

Um trigger impede `MEDICALLY_REVIEWED` sem uma revisão humana aprovada em `question_reviews`.

Concorrência: comandos do mesmo usuário são serializados no processo e protegidos por `SELECT … FOR UPDATE` no PostgreSQL. No navegador, as mutações passam por uma fila. Uma resposta de uma aba desatualizada (índice diferente) é ignorada sem duplicar.

## Seeds

- **Produção** (`npm run db:seed`, executado automaticamente ao iniciar): taxonomia, 27 questões **PROVISIONAL**, o "Simulado MedAI — banco inicial" e o cadastro das fontes do Radar (com as instituições responsáveis). Não cria usuários, desempenho, editais, datas nem vagas. É idempotente e não altera o `validation_status` de questões existentes.
- **Desenvolvimento** (`npm run db:seed:dev`, recusado com `NODE_ENV=production`): cria só uma conta local, a partir de `DEV_USER_EMAIL`/`DEV_USER_PASSWORD`, sem histórico.
- **Testes**: `tests/fixtures/` (perfis simulados A/B/C, indicadores DEMO, trechos de documentos oficiais). Nunca são carregados pela aplicação.

## Migração do localStorage

Ao entrar, o navegador procura `medai-v3`, `medai-v2` ou `medai-v1`. Se houver meta ou respostas, a Visão geral oferece **"Importar para minha conta"**.

- O servidor revalida campo a campo, usa as migrações v1/v2 já existentes e grava numa transação.
- Para evitar duplicação, a importação só é aceita em **conta sem histórico** (409 caso contrário). A impressão SHA-256 do conteúdo impede importar duas vezes.
- Se a conta já tiver meta, a meta da conta prevalece.
- Uma sessão local em andamento é registrada como interrompida.
- **Os dados do navegador nunca são apagados.** A chave `medai-import` só marca o que já foi importado ou recusado.

## Privacidade (LGPD — base)

- Dados armazenados: e-mail, hash da senha, data do último login, nome de exibição, meta (prova, ano, especialidade, horas, data-meta), eventos de estudo e processos acompanhados.
- Não são coletados documentos pessoais, dados de pacientes, endereço ou telefone.
- O usuário pode exportar (`/api/me/export`), apagar os dados de estudo ou excluir a conta.
- Segredos só no servidor (`.env`, ignorado pelo Git). O frontend não tem credenciais.
- Pendências para uso público: política de privacidade e termos, encarregado (DPO), retenção de logs, criptografia e backup do banco em repouso (responsabilidade da hospedagem).
