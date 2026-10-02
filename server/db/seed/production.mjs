// SEED DE PRODUÇÃO: apenas taxonomia, configuração e o banco inicial de questões PROVISÓRIO
// (identificado como tal). Não cria usuários, desempenho, editais, datas nem vagas.
// Idempotente: pode ser executado várias vezes. Fontes do Radar são cadastradas pelo registro de coletores.
import { TAXONOMY, placeQuestion } from '../../../dist/taxonomy.js';
import { INITIAL_QUESTIONS, INITIAL_BANK_VERSION } from '../../../content/initial-question-bank.mjs';
import { NOTICE_SOURCES } from '../../radar/sources/index.mjs';

export const INITIAL_SOURCE_ID = 'medai-banco-inicial';
export const INITIAL_SIMULATION_ID = 'medai-banco-inicial-01';

export async function seedProduction(db, { log = () => {} } = {}) {
  await db.tx(async tx => {
    for (const a of TAXONOMY) {
      await upsertTopic(tx, a.key, 'area', a.label, null);
      for (const t of a.topics) {
        await upsertTopic(tx, t.key, 'topic', t.label, a.key);
        for (const s of t.subtopics) await upsertTopic(tx, s.key, 'subtopic', s.label, t.key);
      }
    }
    const p = INITIAL_QUESTIONS[0].provenance;
    await tx.query(`INSERT INTO question_sources (id, source_type, source_name, source_url, source_date, exam_attribution, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (id) DO UPDATE SET source_type = EXCLUDED.source_type, source_name = EXCLUDED.source_name, notes = EXCLUDED.notes`,
      [INITIAL_SOURCE_ID, p.sourceType, p.sourceName, null, null, null, p.notes]);
    for (const [position, raw] of INITIAL_QUESTIONS.entries()) {
      const q = placeQuestion(raw), pv = raw.provenance;
      // Não rebaixa nem promove o status de validação de uma questão já existente: isso é decisão editorial.
      await tx.query(`INSERT INTO questions (id, source_id, area_key, topic_key, subtopic_key, title, stem, options, correct_index, explanation, analysis, key_point, question_references, validation_status, last_verified_at, content_version, position)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, stem = EXCLUDED.stem, options = EXCLUDED.options, correct_index = EXCLUDED.correct_index,
          explanation = EXCLUDED.explanation, analysis = EXCLUDED.analysis, key_point = EXCLUDED.key_point, question_references = EXCLUDED.question_references,
          content_version = EXCLUDED.content_version, position = EXCLUDED.position, updated_at = now()
        WHERE questions.content_version < EXCLUDED.content_version`,
        [q.id, INITIAL_SOURCE_ID, q.areaKey, q.topicKey, q.subtopicKey, q.title, q.stem, JSON.stringify(q.options), q.correct, q.explain, JSON.stringify(q.analysis), q.key, JSON.stringify(pv.references || []), pv.validationStatus, pv.lastVerifiedAt, INITIAL_BANK_VERSION, position]);
    }
    await tx.query(`INSERT INTO simulations (id, title, description, size, composition, content_note, official)
      VALUES ($1,$2,$3,$4,$5,$6,false)
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, size = EXCLUDED.size, content_note = EXCLUDED.content_note`,
      [INITIAL_SIMULATION_ID, 'Simulado MedAI — banco inicial', 'Fundamentos das cinco grandes áreas, com distribuição equilibrada entre áreas. Correção apenas ao finalizar.', 10, 'balanced-areas',
        'Banco inicial em validação: questões autorais provisórias, sem revisão médica. Não representa a distribuição de nenhuma prova de residência.']);
    for (const s of NOTICE_SOURCES) {
      await tx.query(`INSERT INTO notice_sources (id, name, organization, url, source_type, access_method, automated, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, organization = EXCLUDED.organization, url = EXCLUDED.url, source_type = EXCLUDED.source_type,
          access_method = EXCLUDED.access_method, automated = EXCLUDED.automated, notes = EXCLUDED.notes`,
        [s.id, s.name, s.organization, s.url, s.sourceType, s.accessMethod, s.automated, s.notes || null]);
      if (s.institution) {
        const i = s.institution;
        await tx.query(`INSERT INTO institutions (id, name, acronym, uf, city, official_url) VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, acronym = EXCLUDED.acronym, uf = EXCLUDED.uf, city = EXCLUDED.city, official_url = EXCLUDED.official_url`,
          [i.id, i.name, i.acronym || null, i.uf || null, i.city || null, i.officialUrl || null]);
      }
    }
  });
  log(`seed de produção: taxonomia, ${INITIAL_QUESTIONS.length} questões provisórias, 1 simulado, ${NOTICE_SOURCES.length} fontes do Radar`);
}

function upsertTopic(tx, key, level, label, parent) {
  return tx.query('INSERT INTO topics (key, level, label, parent_key) VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, parent_key = EXCLUDED.parent_key', [key, level, label, parent]);
}
