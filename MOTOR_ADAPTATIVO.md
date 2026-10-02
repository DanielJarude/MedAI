# Motor adaptativo V1

Primeira versão do modelo individual de aprendizagem do MedAI. É **determinística, transparente e testável**: não usa IA generativa, aleatoriedade nem dados externos. Todos os números abaixo ficam em `dist/adaptive-config.js` e podem ser alterados sem mudar o código das regras (`mergeConfig()` permite sobrescrever qualquer parâmetro, inclusive em testes).

```
QUESTÃO → RESULTADO → ASSUNTO → DOMÍNIO → LACUNA → REVISÃO → PRIORIDADE → PRÓXIMA SESSÃO
         recordAnswer   knowledge-model     review-scheduler   adaptive-engine
```

Princípio: **Pratique → Compreenda → Retome.** O domínio só é comprovado por desempenho posterior em questões.

## V1 funcional — onde o motor roda e o que é persistido

O algoritmo, os pesos e os limiares **não mudaram** nesta etapa: os 20 testes do motor passam sem alteração nas asserções. Mudou só onde ele roda e o que é persistido.

- **Servidor (autoritativo)**: cada ação (iniciar sessão, responder, avançar, concluir, "Compreendi", salvar para revisão) executa as mesmas funções de `profile-model.js`/`adaptive-engine.js` sobre o estado carregado do banco. O resultado é gravado em tabelas.
- **Eventos persistidos**:
  - tentativas: `question_attempts`, com o registro completo da resposta;
  - sessões: `study_sessions`, com o estado de execução para retomada;
  - revisões: `reviews`, com histórico;
  - "Compreendi": `content_reviews`.
- **Derivado**: o domínio, os estados, as tendências e a recorrência são recalculados a partir dos eventos a cada carga. O snapshot fica em `topic_mastery` para consulta e auditoria. As prioridades são calculadas na hora (não persistidas), porque dependem do relógio.
- **Navegador**: usa o mesmo motor só para exibir o plano sugerido, o Foco de hoje e as explicações.
- **Banco de questões**: `question-bank.js` começa vazio e é carregado do banco de dados (`/api/questions` no navegador, tabela `questions` no servidor). Ordem estável pela coluna `position`.
- **`examRelevance` / `specialtyRelevance`**: continuam **neutros (1)**. Não há dataset confiável de incidência de assuntos por prova, e a especialidade desejada só personaliza o Radar (ordenação), não o estudo.

## 1. Modelo de conhecimento (`knowledge-model.js`)

Hierarquia: **grande área → assunto → subassunto** (`TAXONOMY` em `taxonomy.js`, gravada também na tabela `topics`). Chaves estáveis por slug: `clinica-medica`, `clinica-medica/cardiologia`, `clinica-medica/cardiologia/insuficiencia-cardiaca`. Uma resposta com assunto fora da taxonomia cria o nó automaticamente.

A **unidade de estudo** (prioridade, revisão, sessão) é o **assunto** (ex.: Cardiologia). Área e subassunto são agregações para leitura e detalhamento.

Métricas por nó (`buildKnowledge`, persistidas em `state.knowledge.nodes`):

| Campo | Significado |
|---|---|
| questionsAnswered, correctAnswers, incorrectAnswers, accuracy | Contagens brutas |
| recentAccuracy, recentCount, recentErrors | Últimas 5 respostas do nó |
| previousAccuracy | Até 10 respostas anteriores à janela recente |
| currentMastery | Domínio (seção 2), 0–1 |
| dataConfidence, evidence | Confiança dos dados (seção 2) |
| state | SEM DADOS / INICIANDO / FRÁGIL / EM DESENVOLVIMENTO / CONSISTENTE |
| trend, trendDelta | MELHORANDO / ESTÁVEL / PRECISA DE ATENÇÃO / DADOS INSUFICIENTES |
| recurrentError, recurrentErrors, recurrentWindow, recurrentErrorDetectedAt | Erro recorrente (seção 4) |
| regression | Era consistente e voltou a errar |
| recentError | Última resposta foi erro, há até 7 dias |
| lastInteractionAt, lastCorrectAt, lastIncorrectAt | Datas |
| consecutiveCorrect, consecutiveIncorrect | Sequência atual |
| reviewCount, successfulReviews, nextReviewAt | Revisões do assunto |
| contentReviewedAt | Último “Compreendi” (não altera domínio) |

O snapshot é **derivado**: pode ser reconstruído a qualquer momento a partir de `answers`, `reviews` e `contentReviews`. Fonte única de verdade = eventos. Só entram respostas com `source: 'user'`.

## 2. Fórmula de domínio

Para as respostas de um nó em ordem cronológica, a resposta *k* posições atrás da mais recente (k = 0 para a última), com idade *d* dias, recebe peso:

```
w = 0,5^(d / 30)  ×  0,9^k
     └ meia-vida 30 dias   └ decaimento por sequência
```

```
acurácia ponderada = (Σ w·acerto + 0,5 × 3) / (Σ w + 3)
domínio            = acurácia ponderada + bônus de revisão − penalidade de recorrência   (limitado a 0–1)
bônus de revisão   = min(0,06; 0,02 × revisões concluídas com sucesso)
penalidade         = 0,08 enquanto houver erro recorrente ativo
confiança dos dados = Σ w / (Σ w + 5)
```

- A **evidência neutra** (3 respostas virtuais a 50%) evita extremos: 1 acerto isolado gera 62,5%, não 100%.
- O decaimento por sequência faz o resultado recente pesar mais mesmo quando tudo aconteceu no mesmo dia. Exemplo da especificação: 4 erros seguidos de 6 acertos → tendência MELHORANDO, sem erro recorrente.
- O decaimento temporal faz um assunto sem prática voltar lentamente ao neutro (esquecimento), o que eleva sua prioridade.
- Teto prático: com todos os acertos recentes, o domínio fica perto de 88% (até ~94% com bônus de revisão). **Nunca 100%.** É uma métrica interna de preparação, não uma probabilidade de aprovação.

Estados:

| Estado | Regra |
|---|---|
| SEM DADOS | 0 respostas |
| INICIANDO | 1–2 respostas (a interface mostra “Iniciando · N questões”, sem percentual nem barra) |
| FRÁGIL | domínio < 55% **ou** erro recorrente ativo |
| CONSISTENTE | domínio ≥ 75% **e** ≥ 5 respostas |
| EM DESENVOLVIMENTO | demais casos |

Tendência (a partir de 6 respostas, com ≥ 3 anteriores à janela): Δ = acerto das últimas 5 − acerto das até 10 anteriores. Δ ≥ +20 p.p.: ↑ MELHORANDO; Δ ≤ −20 p.p.: ↓ PRECISA DE ATENÇÃO; senão, → ESTÁVEL.

## 3. “Compreendi” não significa “dominei”

O botão **Compreendi a explicação** grava `contentReviews` (conteúdo revisado). Isso aparece no assunto como “Conteúdo revisado em…”, mas **não altera domínio, estado nem prioridade**. A recuperação só é validada por acertos posteriores.

## 4. Erro isolado × erro recorrente

**Erro recorrente**: ≥ 3 erros entre as últimas 5 respostas do assunto, considerando apenas respostas dos últimos 30 dias (`recurrence`). A data em que o estado começou fica em `recurrentErrorDetectedAt`. O estado é desativado sozinho quando a condição deixa de valer.

**Erro isolado**: 1 erro na janela. Ajusta a prioridade (fator “erros recentes”), registra no caderno de erros e **não cria revisão**.

## 5. Revisões e espaçamento (`review-scheduler.js`)

Cada revisão: `id, topicKey, topic, area, reason, priority, createdAt, dueAt (próxima data), origin (motor | aluno | migração), source, status (pending | done), step, intervalDays, completedAt, outcome, accuracy, history[]`.

Estado exibido: **CONCLUÍDA** (done), **ATRASADA** (vencida antes de hoje), **PARA HOJE**, **PENDENTE** (futura).

Criação após um erro (no máximo **uma revisão ativa por assunto**):

| Condição | Motivo | Prioridade | Disponível |
|---|---|---|---|
| erro recorrente | Erros recorrentes | alta | hoje |
| 2 erros na janela de 5 | Erro recente | média | em 1 dia |
| estado FRÁGIL | Domínio frágil | média | em 1 dia |
| 1 erro | — (não cria) | — | — |
| “Adicionar à revisão” | Salva por você | média | hoje |

Além disso, existe um teto de 8 revisões automáticas ativas não recorrentes, para não sobrecarregar o aluno.

Intervalos (`reviews.intervalsDays`): **1 → 3 → 7 → 14 → 30 dias**.

- **Conclusão:** ao terminar uma sessão, cada revisão vencida com ≥ 2 questões do assunto nessa sessão é avaliada. A revisão direcionada também conta, mesmo antes do vencimento. Só são avaliadas revisões criadas **antes** do início da sessão, para que os erros que criaram uma revisão não a reprovem na mesma sessão.
- **Sucesso** (≥ 67% de acerto): a revisão é marcada CONCLUÍDA e uma “Revisão programada” é criada no degrau seguinte (intervalo maior). Depois de 30 dias, o assunto sai do ciclo e segue na manutenção.
- **Falha:** CONCLUÍDA com resultado “lapse” e nova revisão 2 degraus abaixo (intervalo menor).
- **Novo erro antes da data:** a revisão pendente recua 2 degraus e é antecipada. Se o erro tornar o assunto recorrente, a revisão vai para “Erros recorrentes” e fica disponível hoje.

## 6. Prioridade (`topicPriority`, `computePriorities`)

```
score = (lacunaDeDomínio + errosRecentes + recorrência + revisão + tempoSemPrática + poucaEvidência)
        × examRelevance × specialtyRelevance          (limitado a 0–100)
```

| Fator | Cálculo (pesos em `priority.weights`) |
|---|---|
| lacuna de domínio | (1 − domínio) × 40; sem dados usa domínio neutro 0,5 |
| erros recentes | (erros nas últimas 5 / respostas na janela) × 20 |
| recorrência | +25 se erro recorrente |
| revisão | +15 se vence hoje; +20 +2/dia de atraso (máx. 30) se atrasada |
| tempo sem prática | min(1, dias desde a última resposta / 14) × 10 |
| pouca evidência | (1 − confiança dos dados) × 10 |
| examRelevance, specialtyRelevance | **neutros (1) nesta versão**; preparados em `priority.relevance` |

Níveis: alta ≥ 50, média ≥ 30, baixa < 30. A função devolve `priorityScore`, `priorityReason`, `reasonCode`, `reasons[]` e `factors` (todos os componentes, para auditoria).

Para ativar relevância no futuro: `priority.relevance.examRelevance.enabled = true` e passar `providers.examRelevance = node => multiplicador`. Sem dados confiáveis de incidência por prova, os fatores permanecem desligados.

## 7. Explicabilidade (`explainReasons`)

Motivos em ordem de importância (o primeiro é o `priorityReason`):

1. “Você errou 3 das últimas 5 questões deste assunto.” (recorrente)
2. “Esta revisão está vencida.”
3. “Revisão programada para hoje (…).”
4. “Seu desempenho era consistente, mas houve 2 erros recentes.” (regressão)
5. “Erros recentes neste assunto: 2 das últimas 5 questões.”
6. “Seu desempenho neste tema está abaixo dos demais.” (frágil e ≥ 10 p.p. abaixo da média dos outros assuntos com dados) ou “Domínio ainda frágil: …”
7. “Você ainda não respondeu…” / “Você respondeu apenas 2 questões deste assunto.”
8. “Sem praticar este assunto há N dias.”
9. “Você acertou N questões seguidas; seu desempenho recente melhorou.” (recuperação)
10. “Desempenho consistente; questões de manutenção…”

Esses textos aparecem no Foco de hoje, na Sessão (“Por que estas questões?” e “Por que esta questão?”) e na página de cada assunto (“Por que isso está sendo recomendado?”).

## 8. Sessão adaptativa (`buildSessionPlan`)

- **Menos de 8 respostas pessoais:** sessão inicial equilibrada (rodízio entre as 5 grandes áreas e seus assuntos, priorizando questões nunca respondidas), com a mensagem “Estamos conhecendo seu desempenho…”.
- **Com histórico:** cotas de referência para 30 questões (8 revisão, 12 prioridade alta, 6 desenvolvimento, 4 manutenção), escaladas pelo método do maior resto. Para 10 questões: 3 / 4 / 2 / 1.
  - revisão = assuntos com revisão vencida ou para hoje;
  - prioridade alta = erro recorrente ou nível alto (um assunto pode estar nos dois grupos);
  - desenvolvimento = frágil, em desenvolvimento, iniciando ou sem dados;
  - manutenção = consistente.
- Ordem de preenchimento: revisões → alta → desenvolvimento → manutenção. A cota não usada passa para o grupo seguinte; as sobras vão primeiro para assuntos em desenvolvimento ou manutenção (diversidade).
- **Diversidade mínima:** nenhum assunto ocupa mais de 40% da sessão quando há alternativas. Dentro do grupo, os assuntos se alternam.
- Escolha da questão dentro do assunto: (revisão/alta) erros ainda não recuperados primeiro → nunca respondidas → respondidas há mais tempo.
- Revisão direcionada: 3 questões do assunto. Mini-simulado: 10 questões equilibradas, sem personalização. Os dois entram no histórico.

## 9. Caderno de erros (`errorNotebook`)

Uma entrada por questão errada: questão, assunto, datas, quantidade de erros, última resposta dada, resposta correta, explicação e total de erros no assunto. Um acerto posterior **não apaga** o erro: registra `recoveredAt` (“Recuperada em…”). Fica dentro de **Revisões**.

## 10. Contexto do tutor (`buildTutorContext`)

`TutorContext` (JSDoc em `adaptive-engine.js`): assunto, questão, resposta do aluno, domínio do assunto, erros recentes e principais lacunas. `provider: 'demo'`. A tela do tutor mostra esse contexto. **Nenhuma API é chamada.**

## Limitações atuais

- Banco pequeno (27 questões autorais em 9 assuntos): as sessões repetem questões após poucas rodadas. Uma questão repetida mede em parte memória da alternativa, não só domínio.
- Pesos escolhidos por bom senso e validados apenas com perfis simulados; **não há calibração estatística** com alunos reais.
- Sem dificuldade por questão, sem modelagem de chute e sem tempo de resposta na fórmula (o tempo é registrado, mas ainda não usado).
- Respostas migradas da v1 sem data contam no total, mas não no domínio recente.
- Prioridade por assunto, não por subassunto.

## Pontos preparados para evolução

- `examRelevance` / `specialtyRelevance` desligados, com interface pronta.
- `modelVersion` no snapshot e `schemaVersion` no estado, para recalcular depois de mudar a fórmula.
- Repositório isolado para troca por API/backend.
- `TutorContext` estável para um tutor real.
- Taxonomia extensível e chaves estáveis por assunto.
