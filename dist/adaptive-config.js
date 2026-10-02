// Parâmetros do motor adaptativo V1. Todos os pesos, limiares e intervalos ficam aqui
// para permitir balanceamento posterior sem alterar as regras. Ver MOTOR_ADAPTATIVO.md.
export const ADAPTIVE_CONFIG = deepFreeze({
  modelVersion: 1,
  // Domínio = acurácia ponderada por recência, suavizada por uma evidência a priori neutra.
  mastery: {
    priorWeight: 3,            // peso da evidência neutra: 1 acerto isolado resulta em 62,5%, não 100%
    priorMean: 0.5,            // ponto neutro quando não há dados
    halfLifeDays: 30,          // uma resposta de 30 dias atrás vale metade de uma resposta de hoje
    sequenceDecay: 0.9,        // cada resposta mais antiga do mesmo assunto vale 10% menos
    recurrentPenalty: 0.08,    // desconto enquanto houver erro recorrente ativo
    reviewBonusPerSuccess: 0.02, // revisão validada por questões
    reviewBonusMax: 0.06,
    confidenceK: 5             // confiança dos dados = evidência / (evidência + K)
  },
  states: {
    minAnswers: 3,             // abaixo disso: INICIANDO
    fragileBelow: 0.55,
    consistentFrom: 0.75,
    minAnswersConsistent: 5
  },
  recent: { window: 5, recentErrorDays: 7 },
  // Erro recorrente: pelo menos minErrors erros entre as últimas `window` respostas do assunto,
  // considerando apenas respostas dos últimos maxAgeDays dias.
  recurrence: { window: 5, minErrors: 3, maxAgeDays: 30 },
  trend: { minAnswers: 6, minPrevious: 3, previousWindow: 10, threshold: 0.2 },
  reviews: {
    intervalsDays: [1, 3, 7, 14, 30], // degraus da revisão espaçada
    recurrentDueDays: 0,       // erro recorrente: revisão disponível no mesmo dia
    createOnErrorsInWindow: 2, // 2 erros na janela recente: revisão "Erro recente"
    lapseStepDrop: 2,          // novo erro: recua 2 degraus
    successAccuracy: 0.67,     // revisão bem-sucedida: >= 67% de acerto nas questões do assunto
    minQuestionsToResolve: 2,  // em sessão mista, mínimo de questões do assunto para validar a revisão
    maxActive: 8               // teto de pendências automáticas não recorrentes
  },
  priority: {
    weights: {
      masteryGap: 40,          // (1 - domínio) × 40
      recentErrors: 20,        // taxa de erro nas últimas respostas × 20
      recurrent: 25,
      reviewDueToday: 15,
      reviewOverdue: 20,
      overduePerDay: 2,
      overdueMax: 30,
      staleness: 10,           // tempo sem praticar, saturando em staleAfterDays
      lowEvidence: 10          // (1 - confiança dos dados) × 10
    },
    staleAfterDays: 14,
    levels: { high: 50, medium: 30 },
    belowOthersMargin: 0.1,
    // Preparado para o futuro: fatores multiplicativos neutros (1) nesta versão.
    relevance: { examRelevance: { enabled: false }, specialtyRelevance: { enabled: false } }
  },
  session: {
    defaultSize: 10,
    directedSize: 3,
    simuladoSize: 10,
    minAnswersForPersonalization: 8,
    // Proporções de referência de uma sessão de 30 questões; escaladas para o tamanho real.
    quotas: { review: 8, high: 12, development: 6, maintenance: 4 },
    maxTopicShare: 0.4         // nenhum assunto ocupa mais de 40% da sessão quando há alternativas
  }
});

export function mergeConfig(overrides = {}, base = ADAPTIVE_CONFIG) {
  const out = {};
  for (const [k, v] of Object.entries(base)) {
    const o = overrides[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? mergeConfig(o || {}, v) : (o === undefined ? v : o);
  }
  return deepFreeze(out);
}

function deepFreeze(obj) {
  for (const v of Object.values(obj)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(obj);
}
