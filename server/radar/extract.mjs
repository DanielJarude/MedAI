// Extração de campos de editais (texto de PDF/HTML) com evidência e nível de confiança.
// Regra central: um campo só é ACEITO quando o documento traz UM valor inequívoco. Valores divergentes
// → NEEDS_REVIEW (sem valor). Nada encontrado → NOT_FOUND (sem valor). Nunca há valor estimado.

export const STATUS = Object.freeze({ ACCEPTED: 'ACCEPTED', NEEDS_REVIEW: 'NEEDS_REVIEW', NOT_FOUND: 'NOT_FOUND' });
const MONTHS = { janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

export const normalizeSpace = t => String(t || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n');
export const flat = t => normalizeSpace(t).replace(/\n/g, ' ');

export function isoDate(y, m, d) {
  y = Number(y); m = Number(m); d = Number(d);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null; // 31/02 etc.
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// "06/10/2026", "6 de outubro de 2026", "06 de outubro de 2026 (domingo)"
export function parseDate(s) {
  let m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return isoDate(m[3], m[2], m[1]);
  m = /(\d{1,2})º?\s+de\s+([a-zçã]+)\s+de\s+(\d{4})/i.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) return isoDate(m[3], MONTHS[m[2].toLowerCase()], m[1]);
  return null;
}

// "06/10 a 15/10/2026", "15/06 a 29/06/2026", "06/10/2026 a 15/10/2026", "06 de outubro de 2026 ... ao dia 26 de outubro de 2026"
export function parseRange(s) {
  const t = flat(s);
  let m = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:a|até|-|–)\s*(?:\S+\s+de\s+)?(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (m) { const start = isoDate(m[3] || m[6], m[2], m[1]), end = isoDate(m[6], m[5], m[4]); return start && end ? { start, end } : null; }
  const dates = [...t.matchAll(/(\d{1,2})º?\s+de\s+([a-zçã]+)\s+de\s+(\d{4})/gi)].map(x => MONTHS[x[2].toLowerCase()] ? isoDate(x[3], MONTHS[x[2].toLowerCase()], x[1]) : null);
  if (dates.length >= 2 && dates[0] && dates[1]) return { start: dates[0], end: dates[1] };
  return null;
}

// "R$ 620,00" → 62000 (centavos)
export function parseMoney(s) {
  const m = /R\$\s*([\d.]{1,7}),(\d{2})/.exec(s);
  if (!m) return null;
  return Number(m[1].replace(/\./g, '')) * 100 + Number(m[2]);
}

const evidenceOf = (text, index, length, pad = 40) => flat(text.slice(Math.max(0, index - pad), index + length + pad)).trim().slice(0, 320);

/**
 * Procura um campo com uma lista de padrões. Cada padrão: { re: RegExp (global), parse: match => valor|null, confidence }.
 * Retorna { status, value, evidence, confidence, candidates }.
 */
export function extractField(text, patterns) {
  const found = [];
  for (const p of patterns) {
    const re = new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g');
    for (const m of text.matchAll(re)) {
      const value = p.parse(m);
      if (value === null || value === undefined) continue;
      found.push({ value, evidence: evidenceOf(text, m.index, m[0].length, p.pad ?? 0), confidence: p.confidence ?? 0.9 });
    }
    if (found.length && p.stopOnMatch !== false) break; // padrões em ordem de especificidade
  }
  if (!found.length) return { status: STATUS.NOT_FOUND, value: null, evidence: null, confidence: 0, candidates: [] };
  const distinct = [...new Map(found.map(f => [JSON.stringify(f.value), f])).values()];
  if (distinct.length > 1) return { status: STATUS.NEEDS_REVIEW, value: null, evidence: distinct.map(d => d.evidence).join(' | ').slice(0, 600), confidence: 0.3, candidates: distinct.map(d => d.value) };
  return { status: STATUS.ACCEPTED, value: distinct[0].value, evidence: distinct[0].evidence, confidence: Math.max(...found.map(f => f.confidence)), candidates: [distinct[0].value] };
}

export const accepted = (value, evidence, confidence = 1) => ({ status: STATUS.ACCEPTED, value, evidence, confidence, candidates: [value] });
export const notFound = () => ({ status: STATUS.NOT_FOUND, value: null, evidence: null, confidence: 0, candidates: [] });
export const needsReview = (evidence, candidates = []) => ({ status: STATUS.NEEDS_REVIEW, value: null, evidence, confidence: 0.3, candidates });

// VALIDAR: regras de coerência entre campos. Um campo incoerente vira NEEDS_REVIEW (sem valor).
export function validateFields(fields, { minYear = 2024, maxYear = 2035 } = {}) {
  const f = { ...fields }, original = { ...fields };
  const ok = k => original[k]?.status === STATUS.ACCEPTED; // regras avaliadas sobre os valores originais
  const flag = (k, why) => { if (f[k]) f[k] = { ...needsReview(`${f[k].evidence || ''} [validação: ${why}]`.trim(), f[k].candidates), method: f[k].method, sourceUrl: f[k].sourceUrl, noticeKey: f[k].noticeKey }; };
  for (const k of ['registration_start', 'registration_end', 'exam_date', 'published_at']) {
    if (ok(k)) { const y = Number(String(original[k].value).slice(0, 4)); if (y < minYear || y > maxYear) flag(k, 'ano fora do intervalo esperado'); }
  }
  if (ok('registration_start') && ok('registration_end') && original.registration_start.value > original.registration_end.value) { flag('registration_start', 'início depois do fim'); flag('registration_end', 'início depois do fim'); }
  if (ok('exam_date') && ok('registration_start') && original.exam_date.value < original.registration_start.value) flag('exam_date', 'prova antes do início das inscrições');
  if (ok('fee') && (original.fee.value < 1000 || original.fee.value > 500000)) flag('fee', 'valor fora do intervalo plausível');
  if (ok('total_vacancies') && (!Number.isInteger(original.total_vacancies.value) || original.total_vacancies.value < 0)) flag('total_vacancies', 'número inválido');
  return f;
}
