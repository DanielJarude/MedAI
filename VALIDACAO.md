# Validação — onboarding e perfil de preparação

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
