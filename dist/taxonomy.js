// Taxonomia de estudo: grande área → assunto → subassunto. Configuração do produto (não é desempenho
// nem conteúdo médico). O seed de produção grava esta mesma árvore na tabela `topics`.
export const slug = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Extensível: respostas com assuntos fora desta lista criam nós automaticamente no modelo de conhecimento.
export const TAXONOMY = [
  ['Clínica Médica', [['Cardiologia', ['Hipertensão arterial', 'Insuficiência cardíaca', 'Síndrome coronariana aguda']], ['Nefrologia', ['Lesão renal aguda', 'Doença renal crônica']]]],
  ['Cirurgia', [['Trauma', ['Atendimento inicial']], ['Abdome agudo', ['Apendicite aguda']]]],
  ['Ginecologia e Obstetrícia', [['Obstetrícia', ['Pré-eclâmpsia', 'Pré-natal']]]],
  ['Pediatria', [['Neonatologia', ['Sala de parto']], ['Puericultura', ['Aleitamento e crescimento']]]],
  ['Medicina Preventiva', [['Epidemiologia', ['Medidas e testes diagnósticos']], ['SUS', ['Princípios e legislação']]]]
].map(([area, topics]) => {
  const areaKey = slug(area);
  return { key: areaKey, label: area, topics: topics.map(([topic, subs]) => {
    const topicKey = `${areaKey}/${slug(topic)}`;
    return { key: topicKey, label: topic, subtopics: subs.map(s => ({ key: `${topicKey}/${slug(s)}`, label: s })) };
  }) };
});

export const SUBTOPIC_INDEX = new Map(TAXONOMY.flatMap(a => a.topics.flatMap(t => t.subtopics.map(s => [s.label, { area: a, topic: t, sub: s }]))));

// Posiciona uma questão crua (com `subtopic`) na taxonomia, devolvendo chaves e rótulos estáveis.
export function placeQuestion(raw) {
  const hit = SUBTOPIC_INDEX.get(raw.subtopic);
  if (!hit) throw new Error(`Subassunto fora da taxonomia: ${raw.subtopic}`);
  const { area, topic, sub } = hit;
  return { ...raw, areaKey: area.key, area: area.label, topicKey: topic.key, topic: topic.label, subtopicKey: sub.key, subtopic: sub.label };
}
