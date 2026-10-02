// Fontes oficiais verificadas em 01/10/2026 que NÃO são coletadas automaticamente. Ficam cadastradas para
// verificação/ingestão manual, com o motivo. Nenhum processo é criado a partir delas sem documento oficial.
export const MANUAL_SOURCES = [
  { id: 'cnrm-mec', name: 'CNRM — Comissão Nacional de Residência Médica (MEC)', organization: 'Ministério da Educação', url: 'https://www.gov.br/mec/pt-br/residencia-medica', sourceType: 'HTML', accessMethod: 'Manual', automated: false,
    notes: 'Publica painel Power BI, calendário em imagem e documentos; não há conjunto de dados aberto de processos seletivos. O SisCNRM (siscnrm.mec.gov.br) responde com desafio anti-robô (Cloudflare), que o MedAI não contorna.' },
  { id: 'dados-gov-br', name: 'Portal de Dados Abertos (dados.gov.br)', organization: 'Governo Federal', url: 'https://dados.gov.br/', sourceType: 'API', accessMethod: 'Manual (API exige token)', automated: false,
    notes: 'A API CKAN respondeu 401 e exige token de acesso. Nenhum conjunto de dados de processos seletivos de residência foi integrado.' },
  { id: 'vunesp', name: 'Fundação Vunesp (organizadora de SUS-SP e outros processos)', organization: 'Fundação para o Vestibular da UNESP', url: 'https://www.vunesp.com.br/', sourceType: 'HTML', accessMethod: 'Manual', automated: false,
    notes: 'O site respondeu 403 (proteção Akamai) inclusive ao robots.txt. Não contornado.' },
  { id: 'comvest-unicamp', name: 'COMVEST — Unicamp', organization: 'Universidade Estadual de Campinas', url: 'https://www.comvest.unicamp.br/', sourceType: 'HTML', accessMethod: 'Manual', automated: false,
    notes: 'robots.txt com “Disallow: /”: a coleta automática não é permitida.' }
];
