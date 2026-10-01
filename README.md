# MedAI — preparação para residência médica

Evolução do protótipo existente, com onboarding guiado, perfil estruturado e progresso local separado dos exemplos. A identidade visual, as telas e o ciclo Pratique → Compreenda → Retome foram preservados.

## Executar

Requer Node.js 20 ou superior. Não há dependências para instalar.

```sh
npm start
```

Abra http://127.0.0.1:4173 e mantenha o terminal aberto. O endereço local só responde enquanto o servidor estiver em execução. Os arquivos agora usam módulos JavaScript: abra pelo servidor HTTP, não clicando diretamente no HTML.

```sh
npm run check
npm test
```

## Estrutura

- dist/index.html: entrada e favicon SVG embutido.
- dist/style.css: identidade visual e layouts responsivos.
- dist/app.js: navegação, telas existentes e coordenação dos eventos.
- dist/onboarding-view.js: três passos e edição da meta.
- dist/profile-model.js: validação, perfil de preparação, respostas, sessões, revisões e migração v1 → v2.
- dist/profile-repository.js: acesso ao armazenamento local, isolado das regras e das telas.
- dist/demo-data.js: questões autorais e indicadores fictícios, sem mistura com o histórico do aluno.
- dist/specialties.js: busca por especialidade, incluindo navegação por teclado.
- server.mjs: servidor HTTP estático, com lista explícita de arquivos permitidos.
- tests/profile.test.mjs: testes das regras, persistência e migração.
- .openai/hosting.json: identidade do Site e diretório de publicação.
- ARQUITETURA.md, VALIDACAO.md, RELATORIO.md: documentação desta etapa.

## Onboarding

1. Sua meta: nome, prova, ano e especialidade opcional.
2. Sua rotina: horas semanais e data-meta.
3. Seu plano: resumo e confirmação CRIAR MEU PLANO.

Até a confirmação, o menu indica bloqueio e explica o motivo ao ser acionado. O rascunho fica salvo entre etapas e recarregamentos. O formulário valida nome, ano, horas e compatibilidade da data com o ano. Confirmar libera o dashboard. Minha meta altera o objetivo sem apagar o progresso.

## Persistência e limites

Um perfil por navegador/origem, guardado em localStorage sob medai-v2. Dados antigos de medai-v1 são migrados uma vez; a chave antiga permanece intacta como cópia de recuperação. Uma origem diferente (outro domínio, localhost ou 127.0.0.1) possui armazenamento separado. Não há sincronização entre aparelhos, autenticação real, banco de dados remoto ou garantia de recuperação se o usuário limpar o navegador.

No perfil novo, respostas, acertos, erros, assuntos, revisões e sessões começam vazios. O painel “Sua prática neste navegador” contém apenas ações feitas no aplicativo. Mapa de domínio, atividade semanal e indicadores com selo DEMO DATA continuam ilustrativos. O catálogo de especialidades é um objetivo de formação, não uma lista de vagas abertas.

O banco executável contém três questões autorais de fundamentos de hipertensão. Referência educacional: https://www.who.int/news-room/fact-sheets/detail/hypertension. Não é um banco completo de provas, nem conteúdo para decisões clínicas.

Tutor com respostas pré-definidas; mini-simulado utiliza as mesmas três questões; assinatura e preços são fictícios. Não há IA, pagamentos reais ou adaptação médica por especialidade.

Para hospedagem estática, publique dist/. Rotas utilizam fragmentos de URL. A publicação Sites não atualiza automaticamente um repositório GitHub criado separadamente.
