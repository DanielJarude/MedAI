# Fontes de dados do MedAI V1

Todas as fontes abaixo foram acessadas e verificadas em **01–02/10/2026**. A coleta usa o User-Agent `MedAI-Radar/1.0` (configure `RADAR_CONTACT` para incluir um contato), respeita o `robots.txt`, espera pelo menos 1,5 s entre requisições ao mesmo host e mantém a verificação TLS ativa. Nenhuma fonte exige login, e nenhum CAPTCHA ou proteção anti-robô é contornado.

Busca externa (APIs de pesquisa web) **não é usada** nesta versão. As fontes foram descobertas por pesquisa manual. `SEARCH_PROVIDER` e `SEARCH_API_KEY` ficam reservados em `.env.example` para uma versão futura, com a chave mantida só no servidor.

## Fontes integradas automaticamente

### 1. ENARE — Exame Nacional de Residência

| | |
|---|---|
| Organização | HU Brasil — Hospitais Universitários Federais (antiga EBSERH), com organização da FGV Conhecimento |
| Descoberta | https://www.gov.br/hubrasil/pt-br/ensino-e-pesquisa/exame-nacional-de-residencia-enare (página oficial; o link do portal da edição é lido dela) |
| Portal da edição | https://enare2026.conhecimento.fgv.br/ (o host muda por edição; se o gov.br falhar, usa o portal configurado e registra isso) |
| Tipo | HTML (Next.js) + JSON + PDF |
| Método | `/publicacoes/`: a lista de publicações vem embutida na página (`self.__next_f`), lida sem executar JavaScript. `/vagas/medica-acesso-direto/` e `/vagas/medica-pre-requisito/`: link para as tabelas oficiais `/data/tabelas/*.json`. Editais e cronogramas em `/docs/*.pdf`, com camada de texto. |
| Dados utilizados | Período de inscrição (no edital, conferido com o cronograma), taxa (edital), data da prova objetiva (cronograma), data de publicação (lista oficial), programas por instituição, cidade, UF, especialidade, duração e requisito, com vagas totais e por modalidade (tabela JSON), além de todos os documentos (editais, retificações, anexos, resultados e comunicados) |
| Não obtido | Ano de ingresso: o edital fala em "edição 2026/2027" sem declarar o ano de ingresso, por isso o campo fica "não informado". Pré-requisito único da trilha com pré-requisito: varia por programa e aparece na lista de programas. |
| Atualização da fonte | A lista de publicações é atualizada com frequência (o sitemap marca `daily`). A tabela de vagas mostra "Atualizado em: 31 de agosto de 2026". |
| Limitações | O servidor da FGV não envia o certificado intermediário. O MedAI inclui o intermediário público **GeoTrust TLS RSA CA G1** (DigiCert; `server/radar/certs/`; SHA-256 `C0:6E:30:7F:…:23:0E`; válido até 02/11/2027), e a cadeia continua validada até a raiz DigiCert Global Root G2. Links do tipo "link" (consultas individuais em sistemas com login) não são coletados. |
| robots.txt | `User-agent: * / Allow: /`. No gov.br, só `/ebserh/*?` e páginas de formulário/busca são proibidas. |

### 2. FUVEST — Residência Médica FMUSP

| | |
|---|---|
| Organização | Fundação Universitária para o Vestibular (FUVEST) · COREME da Faculdade de Medicina da USP |
| URL | https://www.fuvest.br/residencia-medica/ · feed https://www.fuvest.br/feed/ |
| Tipo | HTML (WordPress) + RSS + PDF |
| Método | Página oficial → links `wp-content/uploads/rmAAAA-*.pdf` do ciclo mais recente. O edital (PDF de 63 páginas, ~8,6 MB, com camada de texto) é baixado com requisição condicional e cache. O feed RSS só registra a publicação mais recente sobre o processo. |
| Dados utilizados | Período de inscrição, taxa, data da prova da 1ª fase, ano de ingresso ("exclusivamente para ingresso em 2027"), data de publicação (texto do link oficial) e a tabela de 115 programas com vagas **previstas** (o total é a soma da coluna "Total geral de vagas previstas"; cada linha só é aceita se bolsas MIS + SES = total) |
| Não obtido | Pré-requisito por programa (a tabela de pré-requisitos é outra seção do edital e não é cruzada nesta versão). Total geral oficial: o edital não publica um. |
| Limitações | A API REST do WordPress responde 401 e não é usada. O homepage carrega reCAPTCHA apenas para formulários, e nenhum formulário é acessado. |
| robots.txt | Restringe apenas `/wp-admin/`. |

### 3. AREMG — PSU-MG (Processo Seletivo Unificado de Minas Gerais)

| | |
|---|---|
| Organização | Associação de Residência Médica de Minas Gerais (AREMG). Cada edital é de responsabilidade da instituição que o publica (aviso da própria AREMG). |
| URL | https://www.aremg.org.br/processos-atuais |
| Tipo | HTML + JSON + PDF |
| Método | Na página oficial, os blocos `link-categoria` e `link-categoria-edital` com "PSU MG AAAA" dão os IDs. Os mesmos endpoints públicos chamados pelo `js/geral.js` do site retornam as listas: `ajaxCarregaProcesso.ajax.php?id=…` (notícias do processo) e `ajaxCarregaCategoriaEdital.ajax.php?id=…&tipo=1` (editais por instituição, hospedados em `www.galaxcms.com.br`). As respostas vêm em windows-1252. Cada edital é um PDF com texto. |
| Dados utilizados | Por instituição: data de publicação, período de inscrição, data da prova escrita, taxa ("por programa inscrito"), ano de início das atividades e cidade (quando o endereço traz "/MG" ou "– Minas Gerais"). Notícias do processo, inclusive retificações. |
| Resultado da coleta (02/10/2026) | 96 editais: datas e taxa extraídas em 93. Os 3 restantes usam outro layout e ficam como "não informado". |
| Não obtido | Vagas por programa: as tabelas variam muito entre hospitais, então ficam como "não informado" e o usuário é orientado ao edital. O conteúdo da "Retificação Nº 1 aos Editais" não é interpretado: os processos exibem um aviso de que a retificação existe e pode alterar os dados. |
| robots.txt | aremg.org.br: inexistente (404 = sem restrições). galaxcms.com.br: só diretivas de sinalização de conteúdo, sem Disallow. |

## Fontes verificadas que exigem ingestão/verificação manual

| Fonte | URL | Motivo |
|---|---|---|
| CNRM / MEC | https://www.gov.br/mec/pt-br/residencia-medica | Painel Power BI, calendário em imagem e documentos; não há dataset aberto de processos. O SisCNRM responde com desafio Cloudflare (não contornado). |
| dados.gov.br | https://dados.gov.br/ | A API CKAN responde 401 e exige token. |
| Vunesp (SUS-SP e outros) | https://www.vunesp.com.br/ | 403 Akamai, inclusive no robots.txt. |
| COMVEST — Unicamp | https://www.comvest.unicamp.br/ | robots.txt `Disallow: /`. |

Não verificados: Santa Casa SP, Hospital das Forças Armadas, SES-SP (página de residência), Einstein (403 no robots.txt) e INCA (secundariamente informado como integrante do ENARE, sem verificação oficial).

## Conteúdo médico

| Fonte | Tipo | Status |
|---|---|---|
| MedAI — banco inicial (`content/initial-question-bank.mjs`) | 27 questões autorais com redação assistida por IA | **PROVISIONAL**: sem revisão médica humana; sem atribuição a prova ou banca |
| OMS — Hypertension fact sheet | https://www.who.int/news-room/fact-sheets/detail/hypertension | Referência citada em 3 questões de hipertensão. Não é a origem das questões. |

Incidência de assuntos por prova: **nenhum dataset confiável integrado**, por isso `examRelevance` permanece neutro.
