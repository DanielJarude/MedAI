// Perfis simulados APENAS PARA TESTES. Não são carregados pela aplicação.
// As respostas passam pelo mesmo pipeline do app (recordAnswer/finishSession), com relógio controlado.
import { QUESTION_BY_ID } from './demo-data.mjs';
import { createInitialState, confirmProfile, saveDraft, startSession, recordAnswer, advanceSession, finishSession } from '../../dist/profile-model.js';

export const DAY = 86400000;
// Meio-dia local fixo para que limites de "hoje" não dependam do horário da execução.
export const NOW = new Date(2026, 9, 1, 12, 0, 0).getTime();
export const GOAL = { name: 'Teste', exam: 'ENARE', year: 2027, specialty: 'Cardiologia', hours: 12, date: '2027-10-17' };

export function withProfile(now = NOW) {
  let s = createInitialState(now);
  s = saveDraft(s, GOAL, 3);
  return confirmProfile(s, now).state;
}

// Executa uma sessão com as questões e acertos indicados. entries: [questionId, correct][]
export function runSession(state, entries, at, { kind = 'adaptive', mode = 'Sessão personalizada', topicKey = null, bucket = 'adaptive' } = {}) {
  const plan = { kind, topicKey, personalized: true, items: entries.map(([questionId]) => ({ questionId, topicKey: QUESTION_BY_ID.get(questionId).topicKey, bucket, reason: 'teste' })) };
  let s = startSession(state, plan, mode, at);
  entries.forEach(([qid, correct], i) => {
    const q = QUESTION_BY_ID.get(qid);
    const choice = correct ? q.correct : (q.correct + 1) % q.options.length;
    s = recordAnswer(s, choice, at + i * 60000).state;
    s = advanceSession(s);
  });
  return finishSession(s, at + entries.length * 60000).state;
}

export const profileA = () => withProfile();

// Bom desempenho geral; erros recorrentes em Cardiologia e Nefrologia.
export function profileB() {
  let s = withProfile(NOW - 12 * DAY);
  s = runSession(s, [['tr-01', 1], ['tr-02', 1], ['aa-01', 1], ['aa-02', 1], ['neo-01', 1], ['neo-02', 1], ['pu-01', 1], ['pu-02', 1]], NOW - 10 * DAY);
  s = runSession(s, [['ep-01', 1], ['ep-02', 1], ['sus-01', 1], ['sus-02', 1], ['pe-01', 1], ['pe-02', 1], ['pn-01', 1], ['pn-02', 1]], NOW - 8 * DAY);
  s = runSession(s, [['has-01', 1], ['lra-01', 1], ['tr-01', 1], ['neo-01', 1], ['ep-01', 1], ['pe-01', 1]], NOW - 6 * DAY);
  s = runSession(s, [['ic-01', 0], ['ic-02', 0], ['lra-02', 0], ['drc-01', 0], ['sca-02', 1], ['drc-02', 1]], NOW - 3 * DAY);
  s = runSession(s, [['sca-01', 0], ['ic-01', 0], ['lra-01', 0], ['pu-01', 1], ['sus-01', 1]], NOW - 1 * DAY);
  return s;
}

// Histórico antigo ruim em Obstetrícia, seguido de melhora recente.
export function profileC() {
  let s = withProfile(NOW - 70 * DAY);
  s = runSession(s, [['pe-01', 0], ['pe-02', 0], ['pn-01', 1], ['pn-02', 0], ['tr-01', 1], ['ep-01', 1]], NOW - 60 * DAY);
  s = runSession(s, [['pe-01', 0], ['pn-02', 0], ['neo-01', 1], ['has-01', 1]], NOW - 55 * DAY);
  return s;
}
export function profileCRecovered() {
  let s = profileC();
  s = runSession(s, [['pe-01', 1], ['pe-02', 1], ['pn-01', 1]], NOW - 2 * DAY);
  s = runSession(s, [['pn-02', 1], ['pe-01', 1], ['pe-02', 1]], NOW - 1 * DAY);
  return s;
}
