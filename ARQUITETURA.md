# Arquitetura — MedAI V1 funcional

```
Navegador (dist/)                                   Servidor Node.js (server/)                         Banco
┌────────────────────────────┐   REST /api   ┌──────────────────────────────────────┐   SQL    ┌──────────────────┐
│ app.js (telas, eventos)    │ ────────────→ │ app.mjs (rotas, CSRF, limites, erros)│ ───────→ │ PostgreSQL       │
│ api-client.js (fila)       │ ←──────────── │ auth-service    (contas, sessões)    │          │ (PGlite em dev)  │
│ motor (dist/*.js) só p/    │  estado JSON  │ study-service   (comandos do motor)──┼─┐        │ migrations 001+  │
│   exibir plano/foco        │               │ radar-service   (consulta do Radar)  │ │        └──────────────────┘
└────────────────────────────┘               │ state-repository (estado ⇄ tabelas)  │ │                 ↑
                                             └──────────────────────────────────────┘ │                 │
              motor adaptativo (dist/profile-model, knowledge-model, review-scheduler, adaptive-engine)│
                         funções puras, as MESMAS no navegador e no servidor  ←───────┘                 │
                                                                                                         │
  Ingestão externa (server/radar/, npm run update-notices ou agendada no servidor) ─────────────────────┘
   fontes oficiais → fetcher (robots, TLS) → documents (PDF/HTML + cache) → extract/validate → store
```

## Fronteiras

| Camada | Arquivos | Responsabilidade |
|---|---|---|
| Frontend | `dist/app.js`, `dist/api-client.js`, `dist/onboarding-view.js`, `dist/style.css`, `dist/specialties.js` | Telas e eventos. Lê o estado da API e envia ações. Não é a fonte dos dados pessoais. |
| Motor adaptativo | `dist/adaptive-config.js`, `knowledge-model.js`, `review-scheduler.js`, `adaptive-engine.js`, `profile-model.js` | Regras puras, sem DOM nem armazenamento. Executam no servidor (autoritativo) e no navegador (exibição). |
| Conteúdo | `dist/taxonomy.js`, `dist/question-bank.js`, `content/initial-question-bank.mjs` | Taxonomia (configuração) e registro do banco, que começa vazio e é preenchido a partir do banco de dados (com proveniência). O conteúdo provisório vive no seed. |
| Backend/API | `server/app.mjs`, `server/http/`, `server/services/`, `server/auth/`, `server/repositories/` | Autenticação, validação, comandos e persistência |
| Banco | `server/db/` | Adaptador PostgreSQL/PGlite, migrations versionadas, seeds de produção e de desenvolvimento |
| Ingestão externa | `server/radar/` | Coletores por fonte e pipeline do Radar |

## Fluxo de uma resposta

1. O navegador envia `POST /api/sessions/current/answers {index, choice}` pela fila de mutações.
2. `study-service` trava o perfil (`FOR UPDATE`) e carrega o estado. O conhecimento é recalculado a partir dos eventos.
3. `recordAnswer` (motor) gera a tentativa, recalcula o domínio e atualiza as revisões.
4. `state-repository.saveState` insere a tentativa, faz upsert das revisões e da sessão e atualiza `topic_mastery`, tudo numa transação.
5. O novo estado volta à tela, sem recarregar.

## Dados por origem

| Origem | Onde | Aparece na experiência real? |
|---|---|---|
| Ações do usuário | `question_attempts`, `reviews`, `study_sessions`, `content_reviews`, `study_goals` | Sim |
| Derivado | `topic_mastery` (regenerável) | Sim |
| Conteúdo provisório | `questions` (`PROVISIONAL`) | Sim, sempre identificado ("Banco inicial · revisão médica pendente") |
| Dados externos oficiais | Tabelas do Radar, com evidência e URL | Sim, com "Fonte oficial ↗" e "Não informado" quando ausente |
| Fixtures de teste/DEMO | `tests/fixtures/` | **Não**: nunca são carregados pela aplicação |

O antigo `dist/profile-repository.js` (localStorage) continua apenas para os testes de migração e não é usado pela aplicação. A importação do navegador é feita pelo servidor (`POST /api/import/local`).

## Decisões e limites

- Monólito pequeno (sem microserviços). Para escalar: mais instâncias atrás de um proxy com PostgreSQL compartilhado. O limite de taxa e a trava por usuário teriam de ir para um armazenamento comum (o `FOR UPDATE` já protege entre processos).
- Fuso para "hoje" (revisões, inscrições): `TZ` (padrão `America/Sao_Paulo`). O navegador exibe no fuso local.
- Detalhes: `BACKEND.md`, `RADAR_EDITAIS.md`, `DATA_SOURCES.md`, `MOTOR_ADAPTATIVO.md`.
