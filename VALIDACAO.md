# Validação — MedAI V1 funcional (1.3.0)

Executada em 02/10/2026, branch `feature/functional-v1`.

## Baseline antes das alterações

`npm test`: 30/30 aprovados. `npm run check`: OK. O estado de partida (Motor Adaptativo V1 e v2 reconstruída, ainda não commitados) foi registrado no commit `87167d6`.

## Testes automatizados — `npm test`: **60 aprovados, 0 falhas**

| Arquivo | Testes | Cobertura |
|---|---|---|
| `tests/adaptive.test.mjs` | 20 | Motor adaptativo (cenários A–M e demais), **sem mudança nas asserções**. Só o import passou para `tests/fixtures/demo-data.mjs`. |
| `tests/profile.test.mjs` | 10 | Perfil, validação, sessões, migrações v1/v2 e repositório local, **sem mudança nas asserções** |
| `tests/backend.test.mjs` | 11 | Ver lista abaixo |
| `tests/radar.test.mjs` | 19 | Ver lista abaixo |

### Backend e integração (`tests/backend.test.mjs`)

- Conta: cadastro, hash scrypt, cookie HttpOnly/SameSite, token guardado só como hash, login errado, e-mail duplicado, saída.
- Segurança: anti-CSRF, 401 sem sessão, JSON inválido sem stack trace, arquivos estáticos restritos a `dist/`, cabeçalho CSP.
- **Usuário sem histórico**: estado vazio, nenhum DEMO, nenhum domínio inventado.
- **Fluxo completo**: onboarding → backend → 1ª sessão → tentativas e `topic_mastery` → 2ª sessão personalizada → erro recorrente → revisão para hoje → revisão direcionada bem-sucedida → prioridade menor.
  - "Compreendi" não altera o domínio.
  - Sair e entrar novamente, e reiniciar o servidor sobre o mesmo banco, preservam 23 respostas.
  - Minha meta preserva o histórico.
- Resposta repetida ou de aba desatualizada não duplica. A sessão é retomada depois de recarregar.
- Simulado: iniciar, responder, finalizar e registrar as tentativas com `simulation_id`. O simulado não é rotulado como oficial.
- Proveniência: questões `PROVISIONAL` sem atribuição a prova. O trigger bloqueia `MEDICALLY_REVIEWED` sem revisão humana.
- Importação local:
  - v1 é importada;
  - a repetição não duplica;
  - conta com histórico → 409;
  - JSON inválido não grava nada.
- Reset de estudo mantém a conta e Minhas residências. Exportação sem senha. A exclusão de conta exige a senha e remove tudo.
- **Banco indisponível** → 503 com mensagem compreensível, sem detalhes internos. Recupera sozinho quando o banco volta.

### Radar (`tests/radar.test.mjs`)

- Datas, períodos e valores em formatos de edital. Data impossível (31/02) é recusada.
- **Campo ausente** → NOT_FOUND/NULL. **Documento ambíguo** → NEEDS_REVIEW sem valor.
- Validação de coerência entre campos (início × fim, prova × inscrições, taxa plausível).
- Extração com **trechos reais** dos documentos oficiais (ENARE edital e cronograma, FUVEST, AREMG; `tests/fixtures/radar/`):
  - o período de inscrição da FUVEST não é confundido com o período de isenção;
  - linhas da tabela com retorno das Forças Armadas, nome quebrado e "1ano" são lidas;
  - linhas vizinhas nunca se misturam.
- Tabela de vagas: total só quando todas as linhas têm número. **Processo sem vagas informadas → NULL**, nunca 0.
- HTML Next.js, RSS, links e robots.txt. **PDF inválido** e PDF corrompido são recusados.
- Fetcher: robots.txt que proíbe impede a coleta; **HTTP 500/403** viram erro da fonte.
- Coletores de ponta a ponta com transporte simulado:
  - ENARE: descoberta → publicações → PDFs → JSON. Cada campo aponta para uma URL oficial e a identidade do documento ignora `?v=`;
  - ENARE com edital ilegível;
  - FUVEST: página → edital → programas;
  - FUVEST: página sem documentos;
  - AREMG: categorias → JSON em windows-1252 → um processo por edital, com aviso da retificação.
- Armazenamento:
  - idempotente (**sem duplicação**);
  - **mudança de data** gera `DATA_ALTERADA`, com valores antigo e novo;
  - retificação gera `EDITAL_RETIFICADO`;
  - **documento removido** gera `REMOVIDO_DA_FONTE`;
  - processo que sumiu é marcado, e o Radar fica sem resultados.
- Transição de estado das inscrições gera `INSCRICOES_ABERTAS`. Com uma só data, nunca "aberta".
- **Fonte fora do ar (503)**: dados preservados, status UNAVAILABLE, execução registrada como ERROR.
- API do Radar:
  - filtros por especialidade, UF (inclusive dos programas) e abertas;
  - detalhe com evidência e URL oficial;
  - ausências chegam como NULL.

`npm run check`: sintaxe OK em 45 arquivos.

## Banco real

- **PGlite** (dev/testes): todos os testes acima.
- **PostgreSQL 16 (Docker)**: migrations 001 e 002, seed, fluxo de estudo pela API (cadastro → onboarding → 10 respostas → domínio → recarga → simulado) e coleta real do Radar (ENARE, FUVEST e 5 editais da AREMG).

## Coleta real das fontes oficiais (02/10/2026)

| Fonte | Resultado |
|---|---|
| ENARE | 2 processos (acesso direto e pré-requisito) |
| FUVEST | 1 processo |
| AREMG | 96 processos (editais de instituições) |

**ENARE**
- Acesso direto: inscrições de 15/06 a 05/07/2026 (edital confere com o cronograma), taxa R$ 330,00, prova 13/09/2026, 6.019 vagas em 1.241 programas.
- Pré-requisito: inscrições até 15/07/2026, 2.276 vagas em 970 programas.

**FUVEST**
- Inscrições de 06/10 a 26/10/2026, taxa R$ 620,00, prova 06/12/2026, ingresso 2027.
- 864 vagas previstas em 115 programas.

**AREMG**
- Datas e taxa extraídas de 93 dos 96 editais; 3 ficam "não informado".
- Vagas não extraídas.

Uma nova coleta não gerou duplicação nem alterações falsas. Numa das execuções, o robots.txt do gov.br não respondeu. O coletor ENARE usou o portal configurado e registrou isso na nota do processo; na execução seguinte, a descoberta pelo gov.br funcionou.

## Navegador (Chromium headless/Playwright, `npm start` sobre uma cópia do banco com os dados reais do Radar)

**36/36 verificações aprovadas.** O único erro de console é o 422 provocado de propósito (senha curta recusada).

**Desktop 1366×900, conta nova do zero**
1. Entrada → cadastro com senha curta recusada → onboarding. O menu fica bloqueado com explicação.
2. O rascunho persiste no servidor depois de recarregar.
3. Dashboard sem histórico: sem DEMO, sem Assinatura.
4. Desempenho mostra "Dados insuficientes".
5. 1ª sessão (10 questões, com origem/validação exibida) → resultado.
6. Recarregar mantém 10 respostas. A 2ª sessão é personalizada.
7. Revisões e caderno de erros com dados reais. Mapa de domínio com dados.
8. Simulado identificado como banco inicial, com correção apenas ao finalizar. É possível consultar a correção de um simulado anterior.
9. Tutor marcado como EXPERIMENTAL.

**Radar (desktop)**
1. ENARE, FUVEST e PSU-MG aparecem; a especialidade é destacada sem esconder os demais.
2. "Não informado" aparece nos editais da PSU-MG sem dado.
3. "Inscrições abertas": os 2 resultados (editais com inscrições de 02/10 a 15/10/2026) têm hoje dentro do período publicado.
4. Filtro sem correspondência → "Nenhum processo encontrado", com o aviso de cobertura limitada.
5. Filtro por instituição.
6. Detalhe com o trecho do edital como evidência. "VER FONTE OFICIAL" abre https://www.fuvest.br/residencia-medica/ (HTTP 200).
7. Acompanhar → Minhas residências.
8. ENARE: programas da especialidade desejada (Cirurgia Geral).

**Reentrada**: sair e entrar preserva as 31 respostas.

**Mobile 390×844**: todas as telas e o detalhe do processo sem rolagem horizontal.

**Dados antigos no navegador (`medai-v1`)**: a oferta de importação aparece. A importação mantém a cópia local, a oferta não reaparece e as respostas entram no histórico.

## Auditoria de dados

Busca em `dist/` (código servido ao navegador) e nos seeds por vagas, datas, taxas, instituições, estatísticas e DEMO literais:

- **Frontend**: nenhum valor literal. `DEMO_INDICATORS` e os perfis simulados ficam só em `tests/fixtures/`.
- **Seed de produção**: só taxonomia, questões PROVISIONAL, o simulado e o cadastro das fontes e das instituições responsáveis (ENARE/HU Brasil e FMUSP).
- **Radar**: todo processo, data, taxa e vaga vem de uma coleta com evidência e URL. `examRelevance` continua neutro.

## Problemas encontrados e corrigidos nesta validação

1. FUVEST: o primeiro padrão de inscrição também casava com o período de isenção (23–24/09), e o campo foi para NEEDS_REVIEW. Padrão especificado e teste adicionado.
2. AREMG: com a flag `i`, `[^R]` também excluía o "r" minúsculo de "valor", e a taxa não era encontrada. Corrigido.
3. FUVEST: linhas com 4 números finais, nomes em duas linhas e "1ano" eram descartadas, e uma junção de linhas chegou a misturar dois programas. Parser refeito, sem junção com linha que começa com outro código.
4. "Cirurgia Geral – Programa Avançado" era tratada como Cirurgia Geral. O identificador agora usa o nome completo.
5. Validação: depois de marcar um campo, a regra seguinte deixava de ser checada. As regras passaram a usar os valores originais.
6. Radar exibia a lista anterior enquanto um novo filtro carregava. Corrigido.
7. Mobile: o cartão do detalhe crescia até a largura da tabela de programas. Corrigido com `min-width: 0` nos itens da grade.
8. A barra de domínio vazia herdava `padding: 45px` da classe `.empty` (já existia na versão anterior). Corrigido.

## Limites da verificação

Não houve homologação em vários navegadores, auditoria completa de acessibilidade, teste de carga, validação clínica das questões nem revisão jurídica (LGPD). A concorrência entre abas foi testada pela API (índice desatualizado não duplica), não com duas abas reais simultâneas.

---

# Etapa anterior — motor adaptativo V1 (1.2.0)

## Testes automatizados — `npm test` (Node 20, `node --test tests/`)

**30 aprovados, 0 falhas.**

`tests/adaptive.test.mjs`, com os cenários obrigatórios usando os perfis simulados de `tests/fixtures/profiles.mjs` (A novo aluno, B com lacunas em Cardiologia/Nefrologia, C em recuperação em Obstetrícia). Esses perfis passam pelo mesmo pipeline do app e nunca são carregados pela aplicação.

| | Cenário | Resultado |
|---|---|---|
| A | Novo usuário → sessão equilibrada (5 áreas, ≤ 2 por assunto, sem repetição) e Foco de hoje com mensagem de primeira sessão | ✔ |
| B | Erros repetidos em Cardiologia → prioridade sobe mais de 30 pontos, vai para “alta” e para o topo; no Perfil B, Cardiologia e Nefrologia lideram | ✔ |
| C | Recuperação → domínio sobe mais de 25 p.p., tendência MELHORANDO, sai de FRÁGIL, motivo “recuperação”; 4 erros + 6 acertos no mesmo dia também reconhecidos | ✔ |
| D | 1 erro em 10 → sem revisão, prioridade < 30 | ✔ |
| E | Erros recorrentes → revisão “Erros recorrentes”, alta, PARA HOJE, única por assunto, não reprovada na própria sessão | ✔ |
| F | Revisão bem-sucedida → intervalos 0 → 3 → 7 dias | ✔ |
| G | Novo erro após revisão → 7 → 1 dia e data antecipada; revisão com erros também reduz | ✔ |
| H | Revisão vencida → fator de revisão > 0, prioridade maior, motivo “Esta revisão está vencida.”, abre a sessão | ✔ |
| I | 1 acerto → “Iniciando”, domínio < 70%, sem tendência; 40 acertos < 100% | ✔ |
| J | Respostas e revisões `source: demo` e DEMO_INDICATORS não entram em nenhuma métrica pessoal | ✔ |
| K | Salvar e recarregar (repositório) → respostas, revisões, perfil e snapshot preservados | ✔ |
| L | Editar Minha meta → respostas, revisões, sessões e conhecimento idênticos | ✔ |
| M | Reset → só `medai-v3` volta a vazio; `medai-app`, `medai-v1` e chaves de terceiros intactas; sem reimportação | ✔ |

Testes adicionais do motor: “Compreendi” não altera domínio; caderno de erros preserva o erro e registra recuperação; cotas, diversidade (≤ 40% por assunto) e determinismo da sessão personalizada; mensagens de explicação (incluindo regressão “era consistente, mas…”); pesos alteráveis via `mergeConfig` e relevância neutra/ativável; contexto do tutor; registro completo da resposta e não duplicação.

`tests/profile.test.mjs` (reconstrução dos 9 testes da etapa anterior, mais v2 → v3): perfil novo vazio e bloqueado; validação por etapa, limites e datas; respostas únicas e agregados; revisão correta resolve a pendência; retomada e interrupção de sessão; meta preserva histórico; migração v1 → v3 sem importar números fictícios; migração v2 → v3; rascunho, perfil e backup v1; JSON inválido, schema mais novo, armazenamento bloqueado ou cheio sem apagamento silencioso.

`npm run check`: sintaxe de todos os módulos e do servidor, aprovada.

## Fluxo no navegador

Chromium headless (Playwright) contra `npm start`, em perfis de navegador limpos. **47/47 verificações aprovadas, sem erros de console ou de página.**

Desktop 1366×900, usuário novo:
1. Entrada → onboarding etapa 1. Clique no menu bloqueado: mensagem e permanência na etapa.
2. Busca “cirurgia ge” → Cirurgia Geral; recarregar preserva nome e especialidade.
3. Etapa 2 com data em 2028: erro no campo; correção → etapa 3 com resumo; recarregar mantém a etapa 3.
4. CRIAR MEU PLANO → Visão Geral; recarregar não volta ao onboarding. Foco de hoje: “Faça sua primeira sessão…”. Métricas zeradas, sem números DEMO.
5. Sessão inicial equilibrada com a explicação “Estamos conhecendo seu desempenho…”. Dez questões, errando Cardiologia/Nefrologia e usando “Compreendi” uma vez.
6. Segunda sessão personalizada: 7 de 10 questões em Cardiologia/Nefrologia; aviso “Erro recorrente em Cardiologia: a revisão foi antecipada para hoje.”
7. Tutor demonstrativo com contexto preparado; resposta à “Analise meu erro”.
8. Foco de hoje lista Cardiologia e Nefrologia com motivo; mapa de domínio real com estados; exemplo DEMO DATA separado; página do assunto com “Por que isso está sendo recomendado?”.
9. Revisões: fila com motivo, estado e data; caderno de erros. Revisão direcionada 100% correta → “concluída com sucesso… Próxima revisão em…”; caderno mostra “Recuperada em…”.
10. Recarregar preserva as 23 respostas. Minha meta (22 h, Pediatria) salva sem alterar o histórico. Mini-simulado inicia com 10 questões.
11. Reset: “apagar” é recusado sem apagar nada; “RESETAR” apaga só os dados pessoais (entrada demo mantida) e volta à etapa 1.

Mobile 390×844: usuário novo completo e uma sessão. Visão geral, Sessão, Desempenho, Revisões, Minha meta, Simulados, Assinatura, Assunto e Questão sem rolagem horizontal do documento (scrollWidth = clientWidth = 390). O menu mobile mantém sua rolagem horizontal intencional.

Migração: um perfil `medai-v1` semeado abre direto o dashboard, importa 2 respostas e mantém a chave v1. Um registro `medai-v3` corrompido abre a tela de recuperação e não é sobrescrito.

## Limites da verificação

Não é homologação em todos os navegadores/dispositivos, auditoria completa de acessibilidade ou validação clínica/editorial das questões. Os pesos do motor foram verificados quanto a coerência e comportamento esperado com perfis simulados, sem calibração com alunos reais. A migração v2 foi testada com dados sintéticos. Concorrência entre abas não foi testada.

---

# Etapa anterior — onboarding e perfil de preparação (v2)

> Registro histórico. O código correspondente não estava no repositório e foi reconstruído nesta etapa; os testes atuais substituem os listados abaixo.


## Testes automatizados

9 testes passaram com `node --test tests/profile.test.mjs`:

- Novo perfil vazio e bloqueio antes da confirmação.
- Validação de campos, limites e datas incompatíveis.
- Respostas únicas, agregados por assunto e histórico de sessão.
- Remoção de pendência após revisão totalmente correta.
- Retomada de sessão e registro de interrupção ao iniciar outra.
- Edição da meta sem apagar histórico.
- Migração v1 → v2 sem importar métricas fictícias como ações reais.
- Persistência de rascunho e perfil, mantendo backup v1.
- Dados inválidos/armazenamento indisponível sem apagamento silencioso.

Sintaxe dos módulos, especialidades e servidor verificada com Node.

## Fluxo pelo navegador

Executado em ambiente de teste separado do perfil online:

1. Entrada de novo usuário e preenchimento da meta, incluindo busca de Cirurgia Geral.
2. Clique no menu bloqueado: mensagem explicativa e dados preservados.
3. Recarregamento da etapa inicial: nome e especialidade mantidos.
4. Etapa Sua rotina com data incompatível: erro visível no formulário.
5. Correção da data, resumo e recarregamento na etapa 3.
6. Criar plano e recarregar: dashboard aberto, onboarding não reaparece.
7. Sessão com erro e dois acertos, correção e tutor contextual.
8. Desempenho mostra 3 respostas, 2 acertos, 1 erro e 67%, separados dos exemplos.
9. Revisão com três acertos: pendência removida.
10. Mini-simulado, pausa e retomada.
11. Minha meta: alteração de carga semanal para 16h e especialidade para Pediatria; salvar retorna ao dashboard.
12. Recarregamento preserva meta e 6 respostas, 5 acertos e 1 erro.
13. Detalhe do tema mantém mapa ilustrativo separado das tentativas pessoais.
14. Perfil antigo de outro endereço local é migrado e abre o dashboard diretamente.

Layout inspecionado em desktop e viewport mobile de 390 × 844. Na configuração mobile testada, clientWidth e scrollWidth foram 375px: sem transbordamento horizontal do documento. O menu mobile mantém sua rolagem horizontal intencional. Não foram capturados erros de console durante o fluxo.

## Limites da verificação

Não é homologação em todos os navegadores/dispositivos, auditoria completa de acessibilidade ou validação clínica. Falhas de armazenamento e migração foram verificadas também com adaptadores de memória/erro, sem apagar dados do usuário. Não foi testada concorrência entre abas: ainda não há sincronização ou resolução de conflitos entre elas.
