# MedAI — preparação para residência médica

Protótipo com onboarding guiado, perfil estruturado e, a partir da v1.2, um **motor adaptativo determinístico**: as respostas do aluno geram um modelo individual de domínio por área e assunto, revisões espaçadas, prioridades explicadas e sessões personalizadas. A identidade visual, as telas e o ciclo Pratique → Compreenda → Retome foram preservados.

## Executar

Requer Node.js 20 ou superior. Não há dependências para instalar.

```sh
npm start
```

Abra http://127.0.0.1:4173 e mantenha o terminal aberto (`PORT=xxxx npm start` usa outra porta). Os arquivos usam módulos JavaScript: abra pelo servidor HTTP, não clicando diretamente no HTML.

```sh
npm run check   # sintaxe de todos os módulos e do servidor
npm test        # 30 testes: motor adaptativo, perfil, migração e persistência
```

## Estrutura

- `dist/index.html`: entrada e favicon SVG embutido.
- `dist/style.css`: identidade visual e layouts responsivos.
- `dist/app.js`: navegação, telas e coordenação dos eventos (sem regras de negócio).
- `dist/onboarding-view.js`: três etapas do onboarding e o formulário de Minha meta.
- `dist/profile-model.js`: validação, perfil, sessões, registro de respostas, migrações v1/v2 → v3.
- `dist/profile-repository.js`: único acesso ao armazenamento local; reset de dados pessoais.
- `dist/adaptive-config.js`: **todos os pesos, limiares e intervalos do motor**.
- `dist/knowledge-model.js`: domínio, estados, tendência, erro recorrente e caderno de erros.
- `dist/review-scheduler.js`: fila de revisão e espaçamento.
- `dist/adaptive-engine.js`: prioridade, explicações, Foco de hoje, montagem de sessão e contexto do tutor.
- `dist/demo-data.js`: taxonomia, questões autorais demonstrativas e indicadores DEMO, isolados do histórico do aluno.
- `dist/specialties.js`: busca por especialidade com navegação por teclado.
- `server.mjs`: servidor HTTP estático com lista explícita de arquivos permitidos.
- `tests/adaptive.test.mjs`, `tests/profile.test.mjs`: testes automatizados; `tests/fixtures/profiles.mjs`: perfis simulados A/B/C (apenas para testes).
- `MOTOR_ADAPTATIVO.md`: fórmulas, pesos e algoritmos. `ARQUITETURA.md`, `VALIDACAO.md` e `RELATORIO.md`: documentação das etapas.

## Onboarding

1. Sua meta: nome, prova, ano e especialidade opcional.
2. Sua rotina: horas semanais e data-meta.
3. Seu plano: resumo e confirmação CRIAR MEU PLANO.

Até a confirmação, o menu mostra o bloqueio e explica o motivo ao ser clicado. O rascunho fica salvo entre etapas e recarregamentos. Minha meta altera o objetivo sem apagar o progresso.

## Motor adaptativo (resumo)

- Cada resposta registra questão, área, assunto, subassunto, alternativa escolhida, correta, acerto, horário, sessão, tempo de resposta e tentativa.
- O domínio por assunto é uma acurácia ponderada por recência e suavizada. Com poucas respostas, aparece “Iniciando”, nunca 100%.
- 3 erros entre as últimas 5 respostas de um assunto caracterizam **erro recorrente**: o assunto entra na revisão do mesmo dia e sobe na prioridade. Um erro isolado não cria revisão.
- Revisões espaçadas de 1 → 3 → 7 → 14 → 30 dias. Um novo erro encurta o intervalo.
- Sessões: equilibradas até 8 respostas; depois, revisões → prioridades altas → desenvolvimento → manutenção, com no máximo 40% por assunto.
- Toda recomendação mostra o porquê (“Você errou 3 das últimas 5 questões deste assunto.”).

Detalhes completos em `MOTOR_ADAPTATIVO.md`.

## Persistência e limites

Um perfil por navegador/origem em `localStorage`:

- `medai-v3`: **dados pessoais** (perfil, onboarding, respostas, revisões, sessões, conteúdo revisado e snapshot do modelo de conhecimento), com `schemaVersion: 3`.
- `medai-app`: **configuração da aplicação** (entrada demonstrativa, plano simulado, último assunto aberto).
- Dados DEMO não são gravados: ficam em `demo-data.js`.

Dados de `medai-v2` ou `medai-v1` são migrados uma única vez, e a chave antiga permanece intacta como cópia. Não há sincronização entre aparelhos, autenticação real ou banco remoto.

**Reset para testes:** Minha meta → Área de desenvolvimento → “Resetar dados pessoais…”, com confirmação digitando RESETAR. Apaga apenas `medai-v3` (substituído por um perfil vazio). Plano demo e cópias antigas são mantidos, e essas cópias não são reimportadas.

O banco executável tem **27 questões autorais de fundamentos**, em 9 assuntos das 5 grandes áreas. É simplificado e sem revisão médica formal: não é um banco de provas nem conteúdo para decisões clínicas. Referência das questões de hipertensão: https://www.who.int/news-room/fact-sheets/detail/hypertension.

Tutor com respostas pré-definidas (contexto preparado para um tutor futuro, sem IA). Assinatura e preços fictícios. Não há IA, pagamentos reais, Radar de Editais ou previsão de aprovação.

Para hospedagem estática, publique `dist/`. As rotas usam fragmentos de URL.
