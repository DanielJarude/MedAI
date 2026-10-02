# Validação — motor adaptativo V1 (1.2.0)

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
