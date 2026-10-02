# Radar de Residências e Editais — V1

## Pipeline

```
FONTE OFICIAL ─→ COLETA ─────────→ PARSE ──────────→ EXTRAÇÃO ────────→ VALIDAÇÃO ──→ BANCO ─────→ API ──────→ INTERFACE
(sources/*.mjs)  fetcher.mjs        documents.mjs      extract.mjs          extract.mjs     store.mjs     radar-service  #radar / #processo
                 robots, TLS,       PDF→texto (unpdf)   valor + evidência    coerência       dedup,        filtros,       "Fonte oficial ↗",
                 intervalo, cache   HTML/JSON/RSS       + confiança          entre campos    histórico     evidências     Acompanhar
```

- `server/radar/fetcher.mjs`: GET com User-Agent identificado, `robots.txt` (4xx = sem restrições; 5xx ou erro = não coletar), intervalo mínimo por host, limite de 30 MB, timeout, redirecionamento https→http recusado, ETag/Last-Modified, TLS sempre verificado. 401/403/429 viram erro da fonte e não há nova tentativa disfarçada.
- `server/radar/documents.mjs`: baixa e extrai o texto, com cache em `document_cache` (hash SHA-256). Um PDF inválido, protegido ou sem camada de texto recebe `parse_status = FAILED` e não gera texto.
- `server/radar/extract.mjs`: `extractField` procura padrões em ordem de especificidade.
  - Um único valor → **ACCEPTED**, com o trecho do documento como evidência.
  - Valores diferentes → **NEEDS_REVIEW**, sem valor (os candidatos ficam registrados).
  - Nada encontrado → **NOT_FOUND**, valor NULL.
- `validateFields`: ano fora de 2024–2035, início depois do fim, prova antes das inscrições ou taxa fora de R$ 10 a R$ 5.000 levam o campo para NEEDS_REVIEW.
- `server/radar/store.mjs`: grava tudo numa transação.

## Modelo

| Tabela | Conteúdo |
|---|---|
| `notice_sources` | Fonte oficial, método de acesso, `automated`, último status (OK, UNAVAILABLE, ERROR) e último erro |
| `institutions` | Nome, sigla, UF e cidade (NULL quando a fonte não informa) |
| `selection_processes` | Um processo por (fonte, chave externa). Campos opcionais: ano de ingresso, tipo, pré-requisito, total de vagas, período de inscrição, prova, etapas, taxa (centavos), URL oficial, URL do edital, publicação, `review_status`, `registration_state`, `last_verified_at`, `removed_at`, `process_group` |
| `notices` | Documentos do processo (EDITAL, RETIFICACAO, ANEXO, RESULTADO, COMUNICADO), identificados por `doc_key` (URL sem parâmetro de versão), com hash, tamanho e estado do parse |
| `residency_programs` | Programa/especialidade, instituição, cidade/UF, duração, requisito, vagas (NULL = não informado) e evidência |
| `extracted_fields` | Para cada campo crítico: valor, trecho do documento, URL, método, confiança e status |
| `process_changes` | Histórico de mudanças |
| `ingestion_runs` | Cada execução: status, estatísticas e erros |
| `document_cache` | Documentos baixados e o texto extraído |
| `tracked_processes` | "Minhas residências" do usuário |

## Detecção de alterações (somente eventos observados)

| Evento | Quando |
|---|---|
| `NOVO_PROCESSO` | Primeira vez que o processo aparece na fonte |
| `NOVO_EDITAL` | Documento novo num processo já conhecido |
| `EDITAL_RETIFICADO` | Documento novo do tipo retificação, ou edital com o mesmo `doc_key` e conteúdo/URL diferentes |
| `RESULTADO_PUBLICADO` | Documento novo do tipo resultado |
| `DATA_ALTERADA` / `CAMPO_ALTERADO` | Valor aceito diferente do anterior (antigo e novo ficam guardados) |
| `INSCRICOES_ABERTAS` / `INSCRICOES_ENCERRADAS` | Mudança, entre duas coletas, do estado derivado das datas publicadas |
| `REMOVIDO_DA_FONTE` | O processo ou documento sumiu de uma listagem completa. É marcado, nunca apagado. |

Nenhuma alteração é simulada. A primeira coleta registra só `NOVO_PROCESSO`.

Estado das inscrições (`registration_state`):
- **OPEN**: hoje está entre as duas datas publicadas;
- **UPCOMING**: antes do início;
- **CLOSED**: depois do fim;
- **UNKNOWN**: sem datas, ou com apenas uma delas. Com só uma data, nunca é exibido "inscrições abertas".

## Falhas

- Fonte fora do ar ou HTTP 5xx/404: `last_status = UNAVAILABLE`, `ingestion_runs.status = ERROR`. Os dados existentes são mantidos com a data da última verificação, e a interface mostra "fonte indisponível na última tentativa".
- Página sem a estrutura esperada: erro explícito ("Nenhum documento…"), sem dado parcial inventado.
- PDF inválido: o processo vai para NEEDS_REVIEW e os campos daquele documento ficam NOT_FOUND. Outros documentos oficiais (ex.: o cronograma) continuam valendo.
- Uma fonte falhar não interrompe as outras.

## Execução

```sh
npm run update-notices                     # todas as fontes automáticas
npm run update-notices -- enare            # só uma fonte (ids: enare, fuvest-rm-fmusp, aremg-psu-mg)
RADAR_AREMG_MAX=5 npm run update-notices   # limita os editais da AREMG (testes)
```

A primeira coleta completa leva alguns minutos, porque são 96 PDFs da AREMG com 1,5 s de intervalo. As seguintes reutilizam o cache.

Com PGlite, o banco aceita **um processo por vez**: pare o servidor antes de rodar o comando, ou use `RADAR_UPDATE_INTERVAL_HOURS=24` para o servidor atualizar sozinho (uma trava `data/pglite.lock` impede o acesso duplo). Com PostgreSQL, o comando pode rodar a qualquer momento (cron, agendador da nuvem).

## Interface

- **Radar de residências** (`#radar`)
  - Filtros: especialidade, instituição (nome ou sigla), estado (UF da instituição ou dos programas), ano de ingresso e "só inscrições abertas".
  - A especialidade definida no onboarding só **reordena**: os processos que a citam aparecem primeiro, com o aviso de que isso não confirma vagas nem pré-requisitos.
  - Processos da mesma família (PSU-MG, um edital por instituição) aparecem agrupados numa tabela.
- **Detalhe** (`#processo`): todos os campos ("Não informado" quando ausente), programas por especialidade, tabela de evidências (trecho do documento, situação e link), documentos, histórico de alterações e **VER FONTE OFICIAL**.
- **Minhas residências** (`#residencias`): processos acompanhados. O MedAI não faz inscrições.

## Como adicionar uma fonte

1. Verifique o acesso: `robots.txt`, termos, login, anti-robô. Se houver bloqueio, cadastre a fonte em `sources/manual.mjs`.
2. Crie `server/radar/sources/<id>.mjs` exportando `source` e `collect(ctx)`, que devolve `{ processes, complete }`. Cada campo deve vir de `extractField`/`accepted`/`notFound` com `sourceUrl`.
3. Registre a fonte em `sources/index.mjs` e adicione fixtures (trechos do documento oficial com URL e data) e testes em `tests/radar.test.mjs`.
