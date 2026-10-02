// Registro das fontes do Radar. Cada coletor declara a fonte oficial, o método de acesso e a função collect().
// Fontes sem automação razoável entram com automated:false (ingestão/verificação manual).
export const COLLECTORS = [];
export const NOTICE_SOURCES = COLLECTORS.map(c => c.source);
