// Registro do banco de questões em uso. Começa VAZIO: o navegador o preenche com GET /api/questions e
// o servidor com a tabela `questions`. Nenhum conteúdo é embutido aqui, para que a interface só mostre
// o que veio do banco de dados (com proveniência). Os módulos do motor leem este registro.
export const QUESTIONS = [];
export const QUESTION_BY_ID = new Map();

// Índices 0–2 do banco v1 (hipertensão), usados apenas na migração de dados antigos do navegador.
export const LEGACY_QUESTION_IDS = ['has-01', 'has-02', 'has-03'];

const freeze = q => Object.freeze({ ...q, options: Object.freeze([...q.options]), analysis: Object.freeze([...q.analysis]), provenance: Object.freeze({ ...(q.provenance || {}) }) });

// Substitui o conteúdo do registro mantendo as mesmas referências (QUESTIONS e QUESTION_BY_ID).
export function loadQuestionBank(list) {
  QUESTIONS.length = 0; QUESTION_BY_ID.clear();
  for (const q of list) { const f = freeze(q); QUESTIONS.push(f); QUESTION_BY_ID.set(f.id, f); }
  return QUESTIONS.length;
}
