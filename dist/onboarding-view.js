// Renderização do objetivo: onboarding em três etapas e edição em Minha meta.
import { EXAMS } from './profile-model.js';

export const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const STEPS = ['Sua meta', 'Sua rotina', 'Seu plano'];
const err = (errors, f) => errors[f] ? `<span class="field-error" id="err-${f}">${esc(errors[f])}</span>` : '';
const aria = (errors, f) => errors[f] ? `aria-invalid="true" aria-describedby="err-${f}"` : '';

function goalFields(p, errors) {
  return `<label class="field">Nome de exibição<input name="name" required maxlength="35" value="${esc(p.name)}" autocomplete="given-name" ${aria(errors, 'name')}>${err(errors, 'name')}</label>
<div class="form-row"><label class="field">Prova-alvo<select name="exam" ${aria(errors, 'exam')}>${EXAMS.map(x => `<option ${p.exam === x ? 'selected' : ''}>${x}</option>`).join('')}</select>${err(errors, 'exam')}</label><label class="field">Ano da prova<input type="number" name="year" min="2026" max="2040" value="${esc(p.year)}" required ${aria(errors, 'year')}>${err(errors, 'year')}</label></div>
<label class="field">Especialidade desejada <span class="muted">Opcional</span><span class="combo"><input name="specialty" maxlength="80" value="${esc(p.specialty)}" placeholder="Pesquise uma especialidade" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="specialty-options" aria-describedby="specialty-help"><span id="specialty-options" class="specialty-options" role="listbox" aria-label="Especialidades" hidden></span></span><span id="specialty-help" class="muted small" style="font-weight:400">Seu objetivo de formação. A oferta de vagas e os pré-requisitos dependem do edital.</span>${err(errors, 'specialty')}</label>`;
}
function routineFields(p, errors) {
  return `<div class="form-row"><label class="field">Horas de estudo por semana<input type="number" name="hours" min="1" max="80" required value="${esc(p.hours)}" ${aria(errors, 'hours')}>${err(errors, 'hours')}</label><label class="field">Data-meta estimada<input type="date" name="date" required value="${esc(p.date)}" ${aria(errors, 'date')}>${err(errors, 'date')}</label></div><p class="muted small">Escolha uma data para sua contagem regressiva. Não representa uma data oficial de prova.</p>`;
}

export function stepper(step) {
  return `<ol class="stepper" aria-label="Etapas da configuração">${STEPS.map((s, i) => `<li class="${i + 1 === step ? 'current' : i + 1 < step ? 'done' : ''}" ${i + 1 === step ? 'aria-current="step"' : ''}><span>${i + 1 < step ? '✓' : i + 1}</span>${s}</li>`).join('')}</ol>`;
}

export function onboardingView(onboarding, errors = {}) {
  const step = onboarding.step, d = { exam: 'ENARE', year: 2027, hours: 12, date: '2027-10-17', specialty: '', ...onboarding.draft };
  const body = step === 1 ? goalFields(d, errors)
    : step === 2 ? routineFields(d, errors)
    : `<div class="summary"><div><span class="muted small">Nome</span><strong>${esc(d.name)}</strong></div><div><span class="muted small">Prova-alvo</span><strong>${esc(d.exam)} · ${esc(d.year)}</strong></div><div><span class="muted small">Especialidade</span><strong>${esc(d.specialty || 'Ainda não decidi')}</strong></div><div><span class="muted small">Rotina</span><strong>${esc(d.hours)} h por semana</strong></div><div><span class="muted small">Data-meta</span><strong>${esc(String(d.date).split('-').reverse().join('/'))}</strong></div></div><div class="notice">Seu histórico começa vazio. O MedAI passa a personalizar as sessões conforme você responde questões.</div>`;
  const actions = `<div class="actions">${step > 1 ? '<button class="btn secondary" type="button" data-action="onb-back">Voltar</button>' : ''}<button class="btn teal" type="submit">${step === 3 ? 'CRIAR MEU PLANO' : 'Continuar'}</button></div>`;
  return `<div class="page-head"><div><h1>Uma preparação com a sua direção.</h1><p class="muted">Personalize seu ponto de partida. Você poderá ajustar tudo depois em Minha meta.</p></div></div>
<div class="grid cols"><section class="card">${stepper(step)}<span class="eyebrow">ETAPA ${step} DE 3 · ${STEPS[step - 1].toUpperCase()}</span><form id="onboarding" data-step="${step}" novalidate>${body}${actions}</form></section>
<section class="card" style="align-self:start"><h2>Seu plano começa por aqui</h2><div class="task"><span class="task-number">01</span><div><strong>Pratique</strong><p>Questões para identificar suas lacunas.</p></div></div><div class="task"><span class="task-number">02</span><div><strong>Compreenda</strong><p>Explicações e tutor contextual.</p></div></div><div class="task"><span class="task-number">03</span><div><strong>Retome</strong><p>Erros recorrentes voltam como revisão espaçada.</p></div></div><div class="notice">O motor adaptativo usa regras determinísticas e um pequeno banco autoral de questões demonstrativas.</div></section></div>`;
}

export function metaForm(profile, errors = {}) {
  return `<section class="card"><span class="eyebrow">SEU OBJETIVO</span><form id="profile" novalidate>${goalFields(profile, errors)}${routineFields(profile, errors)}<button class="btn teal" type="submit">Salvar minha meta</button></form><p class="muted small" style="margin-bottom:0">Alterar a meta não apaga respostas, revisões, sessões nem o mapa de domínio.</p></section>`;
}
