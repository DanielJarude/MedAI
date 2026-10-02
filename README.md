# MedAI — preparação para residência médica (V1 funcional)

Estudo adaptativo com conta, progresso salvo no servidor e um Radar de processos seletivos alimentado por fontes oficiais. Ciclo **Pratique → Compreenda → Retome**, identidade visual e Motor Adaptativo V1 preservados.

## Executar localmente

Requer **Node.js 20+** e Git. Não é preciso instalar banco: em desenvolvimento, o MedAI usa o PostgreSQL embutido (PGlite) em `./data/pglite`.

```sh
git clone https://github.com/DanielJarude/MedAI.git
cd MedAI
git checkout feature/functional-v1
npm ci                      # instala as dependências (pg, PGlite, unpdf)
cp .env.example .env        # opcional: os padrões funcionam sem .env
npm run setup               # cria o banco, aplica as migrations e o seed de produção
npm run update-notices      # coleta o Radar nas fontes oficiais (alguns minutos na 1ª vez)
npm start                   # http://127.0.0.1:4173
```

Abra http://127.0.0.1:4173, clique em **Criar conta** e siga o onboarding.

- `npm start` também aplica migrations e o seed automaticamente. Sem `update-notices`, o Radar só mostra que ainda não há processos coletados.
- Com PGlite, **pare o servidor antes de `npm run update-notices`** (o banco local aceita um processo por vez). Outra opção: `RADAR_UPDATE_INTERVAL_HOURS=24 npm start` atualiza dentro do servidor.

### Com PostgreSQL

```sh
# exemplo com Docker
docker run -d --name medai-pg -e POSTGRES_PASSWORD=troque -e POSTGRES_DB=medai -p 5432:5432 postgres:16
# no .env
DATABASE_URL=postgres://postgres:troque@localhost:5432/medai
npm run setup && npm run update-notices && npm start
```

Em produção, use `NODE_ENV=production` (que exige `DATABASE_URL` e ativa o cookie `Secure`) atrás de HTTPS.

## Comandos

| Comando | O que faz |
|---|---|
| `npm start` | Servidor (frontend + API) |
| `npm run setup` / `npm run db:migrate` / `npm run db:seed` | Banco: migrations e seed de produção |
| `npm run db:seed:dev` | Conta local de desenvolvimento (`DEV_USER_EMAIL`/`DEV_USER_PASSWORD`), sem histórico |
| `npm run update-notices [fonte…]` | Atualiza o Radar (`enare`, `fuvest-rm-fmusp`, `aremg-psu-mg`) |
| `npm test` | 60 testes: motor, perfil, backend/integração e Radar |
| `npm run check` | Sintaxe de todos os módulos |

## O que a V1 faz

- **Conta** com e-mail e senha (scrypt, cookie HttpOnly). O progresso acompanha o usuário em qualquer navegador.
- **Onboarding e Minha meta** salvos no servidor (rascunho entre etapas incluído).
- **Sessão de estudo** de ponta a ponta: o servidor monta o plano adaptativo e registra cada tentativa. Em seguida vêm a correção e a explicação, o domínio é recalculado, a revisão é avaliada e a próxima sessão é personalizada.
- **Revisões** espaçadas e caderno de erros com dados reais. A revisão direcionada realimenta o motor.
- **Desempenho**: só métricas sustentadas pelo histórico. Sem histórico, aparece "Dados insuficientes".
- **Simulados**: "Simulado MedAI — banco inicial", com correção ao finalizar, histórico e consulta de erros.
- **Radar de residências**: ENARE 2026/2027, Residência Médica FMUSP 2027 (FUVEST) e PSU-MG 2027 (AREMG), coletados das fontes oficiais.
  - Filtros por especialidade, instituição, estado, ano e inscrições abertas.
  - Evidência de cada dado e link para a fonte oficial. Dados ausentes aparecem como "Não informado".
- **Minhas residências**: processos acompanhados.
- **Importação** do progresso antigo salvo no navegador, sem apagar a cópia local.
- **Privacidade**: exportar meus dados, apagar dados de estudo e excluir a conta.

## O que ainda é provisório ou experimental

- **Banco de questões**: 27 questões autorais de fundamentos, com redação assistida por IA e **sem revisão médica** (status `PROVISIONAL`, exibido em cada questão). Não são questões de prova.
- **Tutor**: experimental, com respostas pré-definidas e sem IA. O contexto (questão, resposta, domínio, erros, lacunas) já é preparado.
- **Pesos do motor**: definidos por bom senso, sem calibração com alunos reais. Não há incidência de assuntos por prova (`examRelevance` neutro).
- **Radar**:
  - cobre só as três fontes integradas;
  - vagas por programa da PSU-MG não são extraídas;
  - os 3 editais da PSU-MG com layout diferente aparecem como "não informado".
- Não há assinatura, pagamento, inscrição automática nem notificações.

## Documentação

`ARQUITETURA.md` (visão geral) · `BACKEND.md` (API, banco, autenticação, privacidade) · `RADAR_EDITAIS.md` (pipeline do Radar) · `DATA_SOURCES.md` (cada fonte oficial) · `MOTOR_ADAPTATIVO.md` (fórmulas) · `VALIDACAO.md` (testes) · `RELATORIO.md` (histórico das etapas).
