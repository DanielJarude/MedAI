# Arquitetura — perfil de preparação, persistência e motor adaptativo

## Fronteiras

```
app.js (telas e eventos)
  ├─ onboarding-view.js      renderização do objetivo
  ├─ profile-model.js        regras do perfil, sessões, respostas, migrações  ─┐ funções puras
  ├─ adaptive-engine.js      prioridade, explicação, sessão, contexto do tutor │ sem DOM e
  ├─ review-scheduler.js     fila de revisão e espaçamento                     │ sem storage
  ├─ knowledge-model.js      domínio, estados, tendência, caderno de erros     │
  ├─ adaptive-config.js      pesos e limiares                                  ┘
  ├─ demo-data.js            taxonomia, questões e indicadores DEMO
  └─ profile-repository.js   único módulo que acessa o armazenamento
```

Todas as funções de regra recebem o estado e um `now` explícito e devolvem um novo estado, o que deixa os testes determinísticos. `app.js` não contém regras de domínio: chama o modelo, persiste pelo repositório e renderiza.

Não há backend nesta etapa. Para integrar um banco depois, substitua `profile-repository.js` por um adaptador de API autenticada (carregamento e gravação assíncronos na camada de coordenação). Modelo, motor e telas permanecem. Não conecte o navegador diretamente a credenciais de banco.

## Estado persistido

### `medai-v3` — dados pessoais (`schemaVersion: 3`)

- `profile`: name, exam, year, specialty, specialtyId, hours, date, completedAt, updatedAt.
- `onboarding`: step (1–3) e draft; confirmar cria o perfil e limpa o rascunho.
- `answers[]`: id, sessionId, mode, bucket, questionId, areaKey/area, topicKey/topic, subtopicKey/subtopic, choice, correctChoice, correct, at, responseMs, attempt, isReview, source (`user`), contentSource (`demo`), migratedFrom (quando migrada).
- `reviews[]`: id, topicKey, topic, areaKey, area, reason, priority, origin, source, status, createdAt, dueAt, step, intervalDays, completedAt, outcome, accuracy, history[].
- `contentReviews[]`: registros de “Compreendi a explicação” (questionId, sessionId, chaves do assunto, at).
- `studySessions[]`: id, mode, kind, status (em andamento | concluída | interrompida), startedAt, completedAt, questionIds, source, contentSource.
- `session`: sessão atual (itens planejados com motivo, índice, respostas, horários de exibição) para retomada.
- `knowledge`: snapshot derivado `{ modelVersion, computedAt, nodes }`. É recalculado ao carregar e a cada resposta, e pode ser regenerado a partir dos eventos.
- `demo.legacyReviews`: itens antigos sem evidência de erro do aluno (exibidos como DEMO, fora da fila).
- `meta`: createdAt, migratedFrom, migratedAt.

### `medai-app` — configuração da aplicação

`schemaVersion`, `logged` (entrada demonstrativa), `plan` (assinatura simulada), `ui.topicKey`. Preservada no reset de dados pessoais.

### Dados DEMO

`demo-data.js` (`QUESTIONS`, `TAXONOMY`, `DEMO_INDICATORS`). Nunca são gravados nem somados ao histórico. O modelo de conhecimento filtra `source === 'user'`.

## Origem dos dados

`source: user` significa ação observada no navegador. `contentSource: demo` indica que a questão respondida pertence ao banco demonstrativo. Isso não transforma indicadores fictícios em resultados do aluno. O perfil novo começa com histórico vazio.

## Migração conservadora

Ordem de leitura: `medai-v3` → `medai-v2` → `medai-v1`. A migração ocorre uma vez, e a chave antiga permanece intacta.

- **v1 → v3:** perfil e respostas `{q, correct, at}` mapeadas para `has-01..03`. Alternativa, sessão e tempo desconhecidos ficam `null`. Fila antiga: só vira revisão real se houver erro observado no tema; o restante vai para `demo.legacyReviews`. `logged` e `plan` vão para `medai-app`.
- **v2 → v3:** segue o schema documentado da etapa anterior. Respostas com `source: demo` são descartadas. Questões desconhecidas são mapeadas pelo índice antigo ou pelo rótulo do tema. Revisões `source: user` são convertidas (uma por assunto). Sessões em andamento viram “interrompida”.
- Falhas de leitura, JSON inválido ou schema mais novo abrem a tela de recuperação **sem gravar nada**. Falhas de gravação mantêm o estado em memória e mostram “Tentar novamente”. Confirmar o perfil, editar a meta e resetar só anunciam sucesso depois de salvar.

> Nota desta etapa: o código da v2 descrito na documentação anterior não estava no repositório, que só continha `app.js` v1 e os documentos. A v2 foi **reconstruída a partir desta documentação** e evoluída para v3. A migração v2 foi implementada pelo schema documentado e testada com dados sintéticos, nunca com um registro v2 real.

## Ciclo

1. **Pratique:** `recordAnswer` registra a resposta (clique repetido não duplica), recalcula o conhecimento e atualiza a fila (`updateReviewsAfterAnswer`).
2. **Compreenda:** explicação, análise das alternativas, tutor demonstrativo com `TutorContext`. “Compreendi” marca conteúdo revisado sem alterar domínio.
3. **Retome:** `finishSession` valida as revisões vencidas com as respostas da sessão e reagenda (`resolveReviewsAfterSession`). A próxima sessão é montada por `buildSessionPlan`.

## Limites técnicos

Um perfil local compartilhado entre abas da mesma origem, sem controle de concorrência. Dados podem ser apagados pelo usuário do navegador. Nenhuma identidade autenticada. Antes de uso com alunos reais: identidade, persistência remota, estratégia de concorrência, revisão editorial e médica do conteúdo e calibração dos pesos com dados reais.
