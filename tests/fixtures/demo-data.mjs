// FIXTURE DE TESTE. Carrega o banco inicial no registro (como o servidor faz a partir do banco de dados)
// e expõe os indicadores fictícios usados para provar que DEMO nunca entra nas métricas pessoais.
// Não é importado pela aplicação.
import { INITIAL_QUESTIONS } from '../../content/initial-question-bank.mjs';
import { placeQuestion } from '../../dist/taxonomy.js';
import { QUESTIONS, QUESTION_BY_ID, LEGACY_QUESTION_IDS, loadQuestionBank } from '../../dist/question-bank.js';
export { TAXONOMY, slug } from '../../dist/taxonomy.js';

loadQuestionBank(INITIAL_QUESTIONS.map(placeQuestion));
export { QUESTIONS, QUESTION_BY_ID, LEGACY_QUESTION_IDS };

// DEMO DATA: indicadores ilustrativos de um aluno fictício (apenas testes).
export const DEMO_INDICATORS = Object.freeze({
  label: 'DEMO DATA',
  totalQuestions: 1248,
  correct: 899,
  areas: [['Clínica Médica', 68], ['Cirurgia', 74], ['Pediatria', 81], ['Ginecologia e Obstetrícia', 62], ['Medicina Preventiva', 85]]
});
