# MedAI — evolução do onboarding e perfil de preparação

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
