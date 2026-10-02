# MedAI — V1 funcional (versão 1.3.0)

## Ponto de partida

Branch `main` com o Motor Adaptativo V1 e a v2 reconstruída ainda não commitados (30/30 testes). Esse estado foi registrado no primeiro commit da branch `feature/functional-v1`. A implementação foi interrompida uma vez por queda de conexão e retomada do estado salvo no workspace, sem perda de trabalho.

## O que foi feito

- **Backend** Node.js (`node:http`, sem framework) com API REST.
- **Banco** PostgreSQL (produção) e PGlite (desenvolvimento/testes), com o mesmo SQL e migrations versionadas.
- **Contas** com e-mail e senha (scrypt) e sessão em cookie HttpOnly.
- **Motor adaptativo no servidor**, com as mesmas funções puras (algoritmo e pesos inalterados).
- Persistência de perfil, meta, tentativas, sessões, revisões, "Compreendi" e snapshot de domínio.
- **Importação** do localStorage, sem apagar a cópia local.
- **Proveniência do conteúdo**: `validation_status` e um trigger que impede `MEDICALLY_REVIEWED` sem revisão humana.
- **Simulado** com correção ao final e histórico.
- **Radar de Residências** com 3 integrações oficiais reais de ponta a ponta, e **Minhas residências**.
- Removidos da navegação: Assinatura, planos e preços. Removidos da experiência: os indicadores DEMO.
- Testes: de 30 para 60. Validação no navegador: 36 verificações.
- Documentação: `BACKEND.md`, `DATA_SOURCES.md` e `RADAR_EDITAIS.md`, além da atualização dos demais documentos.

## Classificação dos sistemas

| Sistema | Classificação |
|---|---|
| Conta, sessão e identidade | **REAL E FUNCIONAL** (sem recuperação de senha nem verificação de e-mail) |
| Onboarding, Minha meta, persistência no servidor | **REAL E FUNCIONAL** |
| Motor adaptativo: domínio, recorrência, prioridades, revisões espaçadas, sessões personalizadas | **REAL E FUNCIONAL**, com pesos ainda não calibrados com alunos reais |
| Sessão de estudo, Revisões, Desempenho, caderno de erros | **FUNCIONAL COM CONTEÚDO PROVISÓRIO** (banco de 27 questões PROVISIONAL) |
| Simulados | **FUNCIONAL COM CONTEÚDO PROVISÓRIO** ("Simulado MedAI — banco inicial", não oficial) |
| Radar — ENARE, FUVEST, AREMG; Minhas residências | **REAL E FUNCIONAL** (cobertura limitada a 3 fontes; vagas da PSU-MG não extraídas) |
| Detecção de alterações do Radar | **REAL E FUNCIONAL** nos eventos observáveis. Nada é simulado. |
| Importação do localStorage | **REAL E FUNCIONAL** (em conta sem histórico) |
| Tutor | **EXPERIMENTAL** (respostas pré-definidas, sem IA) |
| Relevância por prova/especialidade no estudo, tutor com IA, busca externa, fontes manuais (CNRM, Vunesp, COMVEST, dados.gov.br) | **PREPARADO PARA FUTURO** |

## Limitações conhecidas

- Banco de questões pequeno e **sem revisão médica**: as questões se repetem após poucas sessões.
- Sem recuperação de senha, sem verificação de e-mail e sem 2FA. O cadastro revela se um e-mail já existe.
- Limites de taxa e trava por usuário valem por processo; para várias instâncias, seria preciso armazenamento compartilhado.
- PGlite aceita um processo por vez. Em produção, use PostgreSQL.
- Radar:
  - a retificação da PSU-MG não é interpretada (há um aviso exibido);
  - não há pré-requisito por programa na FUVEST;
  - não há ano de ingresso declarado no ENARE;
  - 3 editais da PSU-MG com layout diferente ficam "não informado".
- Um ajuste do parser pode gerar registros "Informação publicada" no histórico na coleta seguinte, sem mudança na fonte. Ainda não há versão de extrator para separar os dois casos.
- Não houve calibração dos pesos, revisão jurídica da LGPD, teste de carga nem auditoria completa de acessibilidade.

Problemas encontrados e corrigidos: ver `VALIDACAO.md`.

## Recomendações para a próxima etapa (não iniciada)

1. Revisão médica humana do banco inicial (via `question_reviews`) e sua ampliação com fontes rastreáveis.
2. Recuperação de senha por e-mail e verificação de e-mail antes de abrir ao público. Política de privacidade e termos.
3. Hospedagem com PostgreSQL gerenciado, HTTPS e `update-notices` agendado (cron diário).
4. Radar: interpretar retificações, extrair vagas da PSU-MG por layout e avaliar novas fontes oficiais uma a uma.
5. Piloto com poucos alunos para calibrar os pesos do motor.

---

# Etapa anterior — Motor adaptativo V1 (versão 1.2.0)

## Ponto de partida encontrado

O repositório não correspondia à documentação da etapa anterior. Continha só `dist/app.js` **v1** (onboarding em tela única, chave `medai-v1`, métricas DEMO somadas às respostas reais) e os documentos/`package.json`/`server.mjs` da v2. Os arquivos `profile-model.js`, `profile-repository.js`, `onboarding-view.js`, `demo-data.js` e `tests/profile.test.mjs` não existiam, e `npm test`/`npm run check` falhavam. Por decisão do responsável, a v2 foi **reconstruída a partir da documentação** e o motor adaptativo foi implementado sobre ela.

## Alterações realizadas

- **v2 reconstruída:** onboarding em 3 etapas com rascunho persistido e menu bloqueado com explicação; módulos de modelo/repositório/visão; separação entre dados pessoais e DEMO; migração conservadora; tela de recuperação.
- **Modelo de conhecimento** por área → assunto → subassunto, com todas as métricas pedidas (contagens, acerto recente, domínio, confiança, datas, sequências, revisões, próxima revisão).
- **Registro completo de cada resposta:** questão, assunto, subassunto, alternativa, correta, acerto, horário, sessão, tempo de resposta, tentativa e revisão.
- **Domínio** ponderado por recência e suavizado. Estados SEM DADOS / INICIANDO / FRÁGIL / EM DESENVOLVIMENTO / CONSISTENTE. Tendência ↑ → ↓.
- **Erro recorrente** (≥ 3 erros nas últimas 5 respostas do assunto, em 30 dias), registrado no assunto com data de detecção.
- **Revisões** com motivo, prioridade, criação, próxima data, origem e estado (PENDENTE / PARA HOJE / ATRASADA / CONCLUÍDA). Espaçamento 1 → 3 → 7 → 14 → 30 dias; uma revisão ativa por assunto; erro isolado não cria revisão.
- **Prioridade central** (0–100) com motivo explicado e fatores auditáveis. Relevância por prova e especialidade preparadas, mas neutras.
- **Sessão adaptativa:** equilibrada para alunos novos; com histórico, cotas de revisão, prioridade alta, desenvolvimento e manutenção, com teto de 40% por assunto.
- **Visão Geral:** bloco **Foco de hoje** com CTA **INICIAR SESSÃO RECOMENDADA**. Métricas, constância, semana e anel de progresso passaram a usar dados reais (antes, fictícios).
- **Desempenho:** mapa de domínio real, expansível por área → assunto → subassunto, com respondidas, acertos, erros, desempenho recente, domínio e tendência, além de mapa de atividade real. O exemplo DEMO ficou recolhido e sinalizado.
- **Página do assunto:** métricas, “Por que isso está sendo recomendado?”, histórico e revisão direcionada.
- **Caderno de erros** (em Revisões): histórico preservado e recuperação registrada.
- **“Compreendi a explicação”:** marca conteúdo revisado, sem alterar domínio.
- **Tutor demonstrativo** com `TutorContext` (assunto, questão, resposta, domínio, erros recentes, lacunas) exibido na tela, sem API.
- **Persistência:** `schemaVersion: 3`, chaves separadas para dados pessoais (`medai-v3`) e configuração (`medai-app`), migração de v1 e v2.
- **Reset de dados pessoais** em Minha meta → Área de desenvolvimento, com confirmação digitando RESETAR.
- **Banco demonstrativo** ampliado de 3 para 27 questões autorais de fundamentos (9 assuntos, 5 áreas). As 3 originais foram mantidas sem alteração.

## Arquivos

Novos: `dist/adaptive-config.js`, `dist/knowledge-model.js`, `dist/review-scheduler.js`, `dist/adaptive-engine.js`, `dist/profile-model.js`, `dist/profile-repository.js`, `dist/onboarding-view.js`, `dist/demo-data.js`, `tests/adaptive.test.mjs`, `tests/profile.test.mjs`, `tests/fixtures/profiles.mjs`, `MOTOR_ADAPTATIVO.md`.

Modificados: `dist/app.js` (reescrito como módulo, preservando todas as telas), `dist/index.html` (script `type=module`), `dist/style.css` (só acréscimos ao final, mesma paleta), `server.mjs` (novos arquivos permitidos, `PORT` opcional), `package.json` (1.2.0, check e test de todos os módulos), `README.md`, `ARQUITETURA.md`, `RELATORIO.md`, `VALIDACAO.md`.

Não alterados: `dist/specialties.js`. A modificação pendente no git é só de fim de linha (CRLF), anterior a esta etapa.

## Testes

- `npm test`: **30/30 aprovados** (20 do motor, incluindo os cenários A–M, e 10 de perfil/persistência/migração).
- `npm run check`: sintaxe de todos os módulos e do servidor, aprovada.
- Navegador (Chromium headless, desktop 1366×900 e mobile 390×844): **47/47 verificações aprovadas**, sem erros de console. Detalhes em `VALIDACAO.md`.

## Fórmulas e algoritmos (resumo; detalhes em `MOTOR_ADAPTATIVO.md`)

- **Domínio:** peso `0,5^(dias/30) × 0,9^posição`; `(Σw·acerto + 1,5) / (Σw + 3)` + até 6 p.p. por revisões bem-sucedidas − 8 p.p. com erro recorrente. 1 acerto = 62,5%; teto prático ≈ 88%.
- **Erro recorrente:** ≥ 3 erros entre as últimas 5 respostas do assunto, nos últimos 30 dias.
- **Prioridade:** (1−domínio)×40 + taxa de erro recente×20 + 25 (recorrente) + 15/20+ (revisão hoje/atrasada) + até 10 (tempo sem prática) + até 10 (poucos dados), × relevâncias neutras.
- **Revisão:** criada por recorrência (hoje), 2 erros recentes ou domínio frágil (1 dia). Sucesso ≥ 67% sobe um degrau; falha ou novo erro recua dois.

## Persistência

`localStorage` do navegador: `medai-v3` (pessoal, versionado), `medai-app` (configuração). `medai-v1`/`medai-v2` ficam intactas como cópias. O DEMO fica só no código. O snapshot de conhecimento é persistido e regenerável a partir dos eventos.

## Classificação das funcionalidades

**REAIS** (funcionam com as ações do aluno, persistidas neste navegador): onboarding e Minha meta; registro de respostas; modelo de domínio; estados e tendências; erro recorrente; fila de revisão e espaçamento; prioridade e explicações; Foco de hoje; sessão adaptativa, revisão direcionada e mini-simulado; mapa de domínio e atividade; caderno de erros; “Compreendi”; migração; reset; tela de recuperação.

**DEMONSTRATIVAS:** banco de 27 questões autorais simplificadas; tutor com respostas pré-definidas; entrada sem autenticação; assinatura e preços; exemplo “aluno fictício” (DEMO DATA) em Desempenho.

**PREPARADAS PARA O FUTURO** (estrutura pronta, desativada): `examRelevance` e `specialtyRelevance`; `TutorContext` para um tutor com IA; repositório substituível por API/backend; `modelVersion` e `schemaVersion` para recalcular ou migrar; taxonomia extensível.

## Limitações conhecidas

- Banco pequeno: questões se repetem após poucas sessões, e a repetição mede parcialmente memória.
- Pesos definidos por bom senso, sem calibração com alunos reais.
- Conteúdo autoral sem revisão médica formal.
- Sem dificuldade por questão e sem uso do tempo de resposta na fórmula.
- Sem concorrência entre abas, sincronização ou identidade real.
- A migração v2 foi testada só com dados sintéticos do schema documentado; nenhum registro v2 real estava disponível.
- O link publicado é uma origem nova: dados de outros endereços (localhost ou o Site anterior) não são levados.

## Regressões e problemas encontrados

1. `npm test` e `npm run check` falhavam no repositório recebido (arquivos ausentes). Corrigido com a reconstrução.
2. Uma revisão criada durante a sessão era “reprovada” ao final da mesma sessão pelos erros que a criaram. Corrigido: só revisões anteriores ao início da sessão são avaliadas.
3. A escalada para “Erros recorrentes” antecipava a data sem atualizar `intervalDays`. Corrigido.
4. Assuntos com revisão vencida e erro recorrente não ocupavam a cota de “prioridade alta”. Corrigido: um assunto pode estar nos dois grupos.
5. A lista de especialidades empurrava o layout e, ao fechar no clique, deslocava o botão “Salvar minha meta” para fora do cursor. O clique se perdia (problema já existente na v1). Corrigido com lista sobreposta.
6. Barras de domínio apareciam preenchidas para assuntos “Iniciando”. Agora ficam neutras.

## Recomendações técnicas para a próxima etapa

1. Ampliar o banco e fazer revisão editorial e médica antes de qualquer piloto, idealmente com dificuldade e subassunto validados por questão.
2. Rodar um piloto com poucos alunos, exportar os eventos anonimizados e calibrar pesos e limiares (`adaptive-config.js`) com dados reais.
3. Evitar repetir a mesma questão dentro de N dias quando houver alternativas, e registrar se o aluno já viu a explicação antes da nova tentativa.
4. Definir identidade e persistência remota, substituindo apenas `profile-repository.js`.
5. Só depois disso, considerar fatores de relevância por prova, com fonte de dados confiável.

---

# Etapa anterior — onboarding e perfil de preparação (v2)


## O que mudou

- Configuração em três etapas: Sua meta → Sua rotina → Seu plano, com resumo antes de confirmar.
- Menu bloqueado de forma visível, mensagem explicativa ao clicar e manutenção do rascunho. URLs diretas também respeitam a configuração inicial.
- Progresso por etapa, validação no formulário, botões Voltar/Continuar e CTA CRIAR MEU PLANO.
- Confirmação libera a Visão Geral e permanece após recarregar. Minha meta edita o perfil sem reiniciar respostas, revisões ou sessões.
- Especialidade com identificador e rótulo dentro do objetivo estruturado.
- Registro de tentativas, alternativas, temas, acertos, erros, origem do conteúdo, sessões e revisões. Indicadores pessoais são calculados só a partir dessas ações.
- Exemplos visuais preservados e sinalizados como demonstrativos; seus números não se somam ao desempenho pessoal.
- Migração conservadora dos dados antigos, com cópia v1 preservada e sem inventar informações ausentes.

## Auditoria

| Área | Situação atual | Persistência |
|---|---|---|
| Entrada | Nome de exibição; sem autenticação real | Local |
| Onboarding e Minha meta | Funcionais, com validação e edição | Perfil e rascunho no navegador |
| Questões e correção | Funcionais, três questões autorais demonstrativas | Alternativas, resultado e tema locais |
| Desempenho pessoal | Contagem, acertos, erros e taxa derivados das ações | Respostas persistidas localmente |
| Mapa de domínio e gráfico de atividade | Exemplos visuais; navegação funcional | Valores de exemplo no código |
| Sessões e mini-simulado | Fluxo funcional, mesmo banco fixo de três questões | Sessão corrente e histórico locais |
| Revisões | Fila funcional por erro ou salvamento; regra simples | Pendências locais; exemplo separado |
| Tutor | Respostas pré-definidas contextuais, sem IA | Conversa temporária |
| Assinatura | Seleção de plano simulada; sem cobrança | Escolha local |
| Banco de dados / conta real | Não implementados | Não há persistência remota do aluno |

## Onde os dados ficam

`localStorage`, chave `medai-v2`, um perfil por origem/navegador. `medai-v1` é mantida como backup da migração. Fechar e reabrir preserva os dados quando o navegador permite armazenamento; trocar aparelho ou limpar os dados não preserva. A separação em modelo, repositório e interface prepara uma integração futura com API/banco sem reconstruir as telas.

## Arquivos

Modificados: `dist/app.js`, `dist/index.html`, `dist/style.css`, `dist/specialties.js`, `server.mjs`, `package.json`, `README.md`, `VALIDACAO.md`.

Novos: `dist/profile-model.js`, `dist/profile-repository.js`, `dist/onboarding-view.js`, `dist/demo-data.js`, `tests/profile.test.mjs`, `ARQUITETURA.md`, `RELATORIO.md`.

## Problemas encontrados e resolvidos

1. Redirecionamento silencioso ao onboarding parecia travamento e recriava o formulário ao navegar. Agora há bloqueio explícito e rascunho persistido.
2. Métricas fictícias eram somadas às respostas observadas. Agora são conjuntos separados.
3. A v1 não registrava histórico completo de sessões nem alternativa escolhida em cada tentativa antiga. A migração usa valores desconhecidos/nulos e documenta a limitação.
4. A fila antiga misturava uma revisão pré-carregada com ações do usuário. Dados ambíguos são preservados no compartimento demonstrativo, sem criar uma pendência pessoal sem evidência.
5. Falhas de salvamento não devem parecer sucesso: confirmação/edição só liberam após persistir; outras ações exibem aviso e permitem tentar novamente.

## Próxima etapa recomendada

Validar o novo onboarding com estudantes e definir um catálogo versionado de provas/especialidades. Depois, em etapa aprovada separadamente, conectar o repositório a autenticação e persistência remota. Conteúdo e regras adaptativas exigem revisão editorial e médica antes de uso real.

Nenhum radar de editais, busca contínua, inscrição, pagamento real, rede social ou novo módulo foi implementado. GitHub e Sites continuam destinos independentes; esta entrega atualiza o Site.
