# Perfil de preparação e persistência

## Fronteiras

`app.js` coordena interface e ações. `profile-model.js` possui funções de domínio sem acesso ao DOM nem armazenamento. `profile-repository.js` é o adaptador de persistência. `demo-data.js` mantém os exemplos editoriais isolados. `onboarding-view.js` renderiza o mesmo objetivo no onboarding e em Minha meta.

Não foi introduzido backend nesta etapa. Para integrar um banco posteriormente, substituir o adaptador por uma API autenticada, tornando carregamento e gravação assíncronos na camada de coordenação. As regras de validação, respostas, resumos e componentes de tela permanecem reutilizáveis. Não conectar o navegador diretamente a credenciais de banco.

## Estado persistido — schemaVersion 2

- `profile`: name, exam, year, specialty, specialtyId, hours, date, completedAt, updatedAt.
- `onboarding`: step e draft; confirmar cria o perfil e limpa o rascunho.
- `answers`: id, sessionId, questionId, topicId, topic, area, q, choice, correct, at, source e contentSource.
- `reviews`: topicId, topic, reason, createdAt e source.
- `studySessions`: id, mode, status, startedAt, completedAt, questionIds, source e contentSource; sessões interrompidas também são mantidas.
- `session`: cursor e respostas da sessão atual, usada para retomada.
- `logged`, `plan`, `topicIndex`: estado da demonstração, sem autenticação ou cobrança reais.
- `demo.legacyReviews`: dados antigos cuja origem não podia ser distinguida de um exemplo pré-carregado.

`preparationProfile(state)` monta uma visão estruturada: goal, studiedTopics, answeredQuestions, correct, errors, performanceByTopic, pendingReviews e sessionHistory. Os totais são derivados dos eventos, evitando dois contadores persistidos que poderiam divergir.

Especialidade possui identificador normalizado e rótulo legível. “Ainda não decidi” ou vazio tem ID nulo. Identificadores não são códigos oficiais CNRM; devem receber correspondência com um catálogo versionado antes de uma integração externa.

## Origem dos dados

`source: user` significa ação observada no navegador; `contentSource: demo` indica que a questão respondida é demonstrativa. Isso não transforma indicadores fictícios em resultados do aluno. Não há registros inventados para novos usuários.

Valores agregados e percentuais do mapa de exemplo permanecem no catálogo DEMO DATA e não entram em `preparationProfile`. Não existe estimativa clínica validada de domínio ou tempo real de estudo.

## Migração conservadora

`medai-v2` é lido primeiro. Na ausência, `medai-v1` é migrado e preservado intacto. Perfil completo e respostas válidas são importados; não se inventam alternativa escolhida, vínculo de sessão nem data que a v1 não guardava (campos nulos). A última sessão conhecida é preservada, sem fabricar sessões anteriores. Filas v1 eram pré-carregadas com um tema: itens sem evidência de erro ficam no compartimento demonstrativo, não nas pendências reais. Erro observado com tema ainda presente na fila antiga é importado como pendência.

Falhas de leitura ou JSON inválido exibem uma tela de recuperação, sem apagar/sobrescrever o registro original. Falhas de gravação mantêm o estado em memória e oferecem nova tentativa; confirmação inicial e edição de meta só anunciam sucesso após salvar.

## Ciclo

1. **Pratique:** cria sessão e registra alternativa, correção, tema e horário; repetição do clique não duplica a resposta.
2. **Compreenda:** explicação e tutor usam a questão e a tentativa corrente. Conversas continuam temporárias e simuladas.
3. **Retome:** erro ou ação explícita adiciona tema à fila. Revisão direcionada totalmente correta remove a pendência. Regra simples demonstrativa, sem algoritmo adaptativo complexo.

## Limites técnicos

Um perfil local compartilhado entre abas da mesma origem; não há controle de concorrência entre abas. Dados do navegador podem ser removidos pelo usuário. Nenhuma identidade autenticada está ligada aos registros. Metas e respostas não sincronizam com Github ou outro aparelho. Antes de uso com alunos reais, implementar identidade, persistência remota, estratégia de concorrência e revisão editorial do conteúdo.
