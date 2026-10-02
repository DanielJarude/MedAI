// Coordenação da interface: rotas, telas e eventos. Regras ficam nos módulos de modelo/motor;
// os dados pessoais vêm da API (servidor + banco). O navegador não é mais a fonte do progresso.
import { ADAPTIVE_CONFIG } from './adaptive-config.js';
import { QUESTIONS, QUESTION_BY_ID, loadQuestionBank } from './question-bank.js';
import { TAXONOMY } from './taxonomy.js';
import { DAY, MASTERY_STATES, TRENDS, toMs, isPersonal, childrenOf, errorNotebook } from './knowledge-model.js';
import { reviewStatus, REVIEW_STATUS, startOfDay } from './review-scheduler.js';
import { BUCKETS, buildSessionPlan, computePriorities, todayFocus, buildTutorContext, masteryLabel, trendLabel } from './adaptive-engine.js';
import { validateGoal, currentQuestion, currentResponse, currentItem } from './profile-model.js';
import { api, ApiError, findLocalProgress, markLocalProgress } from './api-client.js';
import { esc, onboardingView, metaForm } from './onboarding-view.js';

const root = document.querySelector('#app');
const brand = '<div class="brand"><b class="mark">⌁</b><div>Med<span>AI</span></div></div>';
const nav = [['dashboard', 'Visão geral', '◫'], ['sessao', 'Sessão de estudo', '▤'], ['desempenho', 'Desempenho', '▥'], ['revisoes', 'Revisões', '↻'], ['simulados', 'Simulados', '▧'], ['radar', 'Radar de residências', '⌖'], ['residencias', 'Minhas residências', '☆'], ['meta', 'Minha meta', '◎']];
const LETTERS = 'ABCD';
const NA = '<span class="na">Não informado</span>';
const now = () => Date.now();
const pct = x => Math.round(x * 100);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fmtDate = x => x ? new Date(toMs(x)).toLocaleDateString('pt-BR') : '—';
const fmtDay = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : null; // datas de edital: sem conversão de fuso
const money = c => c === null || c === undefined ? null : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ---------- Estado da interface ----------
let phase = 'loading';                 // loading | auth | ready | error
let user = null, state = null, bootError = null;
let selected = null, messages = [], formErrors = {}, resetOpen = false, deleteOpen = false, lastFeedback = null;
let authMode = 'login', authErrors = {}, authMessage = '';
let busy = false, offline = false, shownRequested = null;
let localOffer = null;                 // progresso antigo encontrado no localStorage
let radar = { filters: { specialty: '', uf: '', institution: '', open: false, year: '' }, data: null, loading: false, error: null, key: null };
let tracked = { data: null, loading: false, error: null };
let processView = { id: null, data: null, loading: false, error: null };
const ui = loadUi();

function loadUi() { try { return JSON.parse(window.localStorage.getItem('medai-ui') || '{}'); } catch { return {}; } }
function saveUi(patch) { Object.assign(ui, patch); try { window.localStorage.setItem('medai-ui', JSON.stringify(ui)); } catch { /* preferência só desta aba */ } }

function go(route) { if (location.hash !== '#' + route) location.hash = route; else render(); }
function toast(text, kind = '') {
  const el = document.querySelector('#toast');
  el.textContent = text; el.className = 'show ' + kind;
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => { el.className = ''; }, 5200);
}
const button = (label, route, kind = '') => `<a class="btn ${kind}" href="#${route}">${label}</a>`;
const head = (title, sub, action = '') => `<div class="page-head"><div><h1>${title}</h1><p class="muted">${sub}</p></div>${action}</div>`;
const stateClass = s => ({ [MASTERY_STATES.CONSISTENT]: 'ok', [MASTERY_STATES.DEVELOPING]: '', [MASTERY_STATES.FRAGILE]: 'amber', [MASTERY_STATES.STARTING]: 'grey', [MASTERY_STATES.NONE]: 'grey' })[s] ?? '';
const trendClass = t => ({ [TRENDS.UP]: 'up', [TRENDS.DOWN]: 'down', [TRENDS.STABLE]: 'flat' })[t] || 'none';
// Com poucos dados (INICIANDO) a barra fica neutra para não sugerir uma certeza inexistente.
const masteryBar = node => node.questionsAnswered && node.currentMastery !== null && node.state !== MASTERY_STATES.STARTING ? `<div class="bar" role="img" aria-label="Domínio ${pct(node.currentMastery)}%"><span style="width:${pct(node.currentMastery)}%"></span></div>` : '<div class="bar empty" aria-hidden="true"></div>';
const displayName = () => state?.profile?.name || state?.onboarding?.draft?.name || user?.email?.split('@')[0] || 'Estudante';
const personalAnswers = () => state.answers.filter(isPersonal);
const knowledge = () => state.knowledge;
const VALIDATION = { PROVISIONAL: 'Provisória · revisão médica pendente', SOURCE_VERIFIED: 'Fonte verificada · revisão médica pendente', MEDICAL_REVIEW_REQUIRED: 'Revisão médica necessária', MEDICALLY_REVIEWED: 'Revisada por profissional de saúde' };

// ---------- Comunicação com o servidor ----------
function handleError(e) {
  if (e instanceof ApiError && e.status === 401) { phase = 'auth'; user = null; authMessage = 'Sua sessão expirou. Entre novamente para continuar.'; render(); return; }
  if (e instanceof ApiError && e.offline) { offline = true; toast(e.message, 'warn'); return; }
  if (e instanceof ApiError && e.data?.errors) formErrors = { ...formErrors, ...e.data.errors };
  toast(e instanceof ApiError ? e.message : 'Ocorreu um erro inesperado. Tente novamente.', 'warn');
  if (!(e instanceof ApiError)) console.error(e);
}

// Executa uma ação no servidor, aplica o estado devolvido e redesenha. Ignora cliques enquanto houver ação em curso.
async function run(call, after) {
  if (busy) return null;
  busy = true; document.body.classList.add('busy');
  try {
    const r = await call();
    offline = false;
    if (r?.state) state = r.state;
    if (after) await after(r);
    return r;
  } catch (e) { handleError(e); return null; }
  finally { busy = false; document.body.classList.remove('busy'); render(); }
}

async function loadAccount() {
  const [q, s] = await Promise.all([api.questions(), api.state()]);
  loadQuestionBank(q.questions);
  state = s.state;
  localOffer = await findLocalProgress().catch(() => null);
  if (localOffer && s.localImport?.fingerprint === localOffer.fingerprint) { markLocalProgress(localOffer.fingerprint, 'imported'); localOffer.imported = true; }
}

async function boot() {
  phase = 'loading'; render();
  try {
    const me = await api.me();
    user = me.user;
    if (!user) { phase = 'auth'; render(); return; }
    await loadAccount();
    phase = 'ready'; offline = false;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { phase = 'auth'; }
    else { phase = 'error'; bootError = e instanceof ApiError ? e.message : 'Não foi possível iniciar o MedAI.'; }
  }
  render();
}

// ---------- Estrutura ----------
function shell(content, route) {
  const locked = !state.profile;
  return `<aside>${brand}<div class="nav-caption">SUA PREPARAÇÃO</div><nav>${nav.map(([id, label, icon]) => `<a href="#${id}" class="${route === id ? 'active' : ''} ${locked ? 'locked' : ''}" ${route === id ? 'aria-current="page"' : ''} ${locked ? 'aria-disabled="true" data-locked="1"' : ''}><span class="nav-icon">${icon}</span>${label}${locked ? '<span class="lock" aria-hidden="true">🔒</span>' : ''}</a>`).join('')}</nav><div class="nav-bottom"><div class="notice small">Um passo por dia.<br>Uma residência no horizonte.</div></div><div class="profile"><div class="avatar">${esc(displayName().slice(0, 2).toUpperCase())}</div><div><strong class="small">${esc(displayName())}</strong><br><button class="link" data-action="logout">Sair</button></div></div></aside><div class="workspace"><header class="topbar"><span>Seu caminho até a residência</span><div class="top-meta"><span>${state.profile ? `${esc(state.profile.exam)} · ${esc(state.profile.year)}` : 'Configuração inicial'}</span><span class="pill grey" title="${esc(user.email)}">Conta: ${esc(user.email)}</span></div></header><main>${offline ? '<div class="notice warn">Sem conexão com o servidor do MedAI. A última ação pode não ter sido salva. <button class="link" data-action="reload-state">Tentar novamente</button></div>' : ''}${content}<footer class="footer"><span>MedAI · Aprender. Conectar. Evoluir.</span><span>Banco inicial de questões em validação · Conteúdo educacional, sem uso clínico.</span></footer></main></div>`;
}

function loadingPage() { return `<div class="auth"><section class="auth-story">${brand}<div><h1>Carregando sua<br>preparação…</h1></div><small>MedAI</small></section><section class="auth-form"><div class="form-wrap"><p class="muted" role="status">Conectando ao servidor do MedAI…</p></div></section></div>`; }

function errorPage() {
  return `<div class="auth"><section class="auth-story">${brand}<div><div class="eyebrow" style="color:#8dded4">SERVIDOR INDISPONÍVEL</div><h1>Seus dados estão<br>preservados.</h1><p>Nada foi apagado. O progresso fica salvo na sua conta.</p></div><small>MedAI</small></section><section class="auth-form"><div class="form-wrap"><span class="eyebrow">NÃO FOI POSSÍVEL CARREGAR</span><h1 style="margin-top:20px">Vamos tentar de novo?</h1><p class="muted">${esc(bootError)}</p><button class="btn full" data-action="reboot">Tentar novamente</button></div></section></div>`;
}

function authPage() {
  const register = authMode === 'register';
  const err = f => authErrors[f] ? `<span class="field-error" id="auth-err-${f}">${esc(authErrors[f])}</span>` : '';
  const aria = f => authErrors[f] ? `aria-invalid="true" aria-describedby="auth-err-${f}"` : '';
  return `<div class="auth"><section class="auth-story">${brand}<div><div class="eyebrow" style="color:#8dded4">PREPARAÇÃO PARA RESIDÊNCIA</div><h1>Conhecimento que<br>se transforma<br>em conquista.</h1><p>Questões, revisão, uma visão clara do que estudar a seguir e o radar dos processos seletivos.</p></div><small>MedAI · Seu próximo capítulo começa aqui.</small></section><section class="auth-form"><div class="form-wrap"><span class="eyebrow">${register ? 'CRIAR CONTA' : 'BEM-VINDO DE VOLTA'}</span><h1 style="margin-top:20px">${register ? 'Comece sua preparação.' : 'Vamos estudar?'}</h1><p class="muted">${register ? 'Seu progresso fica salvo na sua conta e acompanha você em qualquer navegador.' : 'Entre para continuar de onde parou.'}</p>${authMessage ? `<div class="notice warn">${esc(authMessage)}</div>` : ''}<form id="auth" novalidate><label class="field">E-mail<input type="email" name="email" required maxlength="254" autocomplete="email" ${aria('email')}>${err('email')}</label><label class="field">Senha<input type="password" name="password" required minlength="${register ? 10 : 1}" maxlength="200" autocomplete="${register ? 'new-password' : 'current-password'}" ${aria('password')}>${register ? '<span class="muted small" style="font-weight:400">Pelo menos 10 caracteres.</span>' : ''}${err('password')}</label><button class="btn full" type="submit">${register ? 'Criar minha conta' : 'Entrar'}</button></form><p class="small" style="margin-top:18px">${register ? 'Já tem conta?' : 'Ainda não tem conta?'} <button class="link" data-action="auth-toggle">${register ? 'Entrar' : 'Criar conta'}</button></p><p class="muted small">Guardamos apenas e-mail, senha protegida por hash, sua meta de estudo e suas respostas. Não informe dados de pacientes. Conteúdo educacional: não substitui material de referência ou orientação clínica.</p></div></section></div>`;
}

// ---------- Importação do progresso antigo do navegador ----------
function importBanner() {
  if (!localOffer || localOffer.imported || localOffer.dismissed) return '';
  const what = [localOffer.profile ? 'sua meta' : null, localOffer.answers ? plural(localOffer.answers, 'resposta', 'respostas') : null].filter(Boolean).join(' e ');
  return `<section class="card import-card"><span class="eyebrow">PROGRESSO ENCONTRADO NESTE NAVEGADOR</span><h2 style="margin-top:14px">Levar seu histórico para a conta?</h2><p class="muted small">Encontramos ${esc(what)} salvos neste navegador por uma versão anterior do MedAI (${esc(localOffer.key)}). A importação copia esses dados para a sua conta; a cópia do navegador continua intacta. Para evitar duplicação, só é feita em contas ainda sem histórico.</p><div class="actions"><button class="btn teal" data-action="import-local">Importar para minha conta</button><button class="btn secondary" data-action="import-dismiss">Agora não</button></div></section>`;
}

// ---------- Visão geral ----------
function activeDays() { return new Set(personalAnswers().map(a => startOfDay(a.at)).filter(Number.isFinite)); }
function streak() {
  const days = activeDays(); let d = startOfDay(now()), n = 0;
  if (!days.has(d)) d -= DAY;
  while (days.has(d)) { n++; d -= DAY; }
  return n;
}
function daysUntil() { return Math.max(0, Math.ceil((new Date(state.profile.date + 'T12:00:00') - new Date()) / DAY)); }
function journey() {
  const start = toMs(state.profile.completedAt || state.meta.createdAt), end = new Date(state.profile.date + 'T12:00:00').getTime();
  return end > start ? Math.min(1, Math.max(0, (now() - start) / (end - start))) : 0;
}
function studyTime() {
  const ms = personalAnswers().reduce((s, a) => s + Math.min(a.responseMs || 0, 10 * 60000), 0);
  if (!ms) return '—';
  const min = Math.round(ms / 60000);
  if (min < 1) return '< 1 min';
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}`;
}
function currentPlan() { return buildSessionPlan(state, knowledge(), QUESTIONS, now()); }
const sessionActive = () => state.session && !state.session.done;
const minutesFor = n => Math.round(n * 2.5);
const noBank = () => !QUESTIONS.length;

function focusBlock() {
  const f = todayFocus(state, knowledge(), now());
  if (!f.items.length) return `<div class="empty compact"><p class="muted">${esc(f.message)}</p></div>`;
  return `${f.message ? `<p class="muted small">${esc(f.message)}</p>` : ''}<ol class="focus-list">${f.items.map((p, i) => `<li><span class="task-number">${i + 1}</span><div class="task-content"><a class="focus-topic" href="#tema" data-topic="${esc(p.topicKey)}">${esc(p.topic)}</a> <span class="pill ${p.level === 'alta' ? 'amber' : 'grey'}">Prioridade ${p.level}</span><p>${esc(p.priorityReason)}${p.reasons[1] ? ` · ${esc(p.reasons[1].label)}` : ''}</p></div></li>`).join('')}</ol>`;
}

function dashboard() {
  if (noBank()) return head(`Seu próximo passo, ${esc(displayName())}.`, 'Consistência hoje. Mais confiança no dia da prova.') + '<div class="notice warn">O banco de questões não está disponível no momento. Tente novamente em instantes.</div>';
  const answers = personalAnswers(), correct = answers.filter(a => a.correct).length;
  const weekStart = startOfDay(now()) - ((new Date().getDay() + 6) % 7) * DAY;
  const thisWeek = answers.filter(a => toMs(a.at) >= weekStart).length;
  const pending = state.reviews.filter(r => r.source === 'user' && r.status === 'pending');
  const dueToday = pending.filter(r => reviewStatus(r, now()) !== REVIEW_STATUS.PENDING).length;
  const plan = sessionActive() ? null : currentPlan();
  const items = plan ? plan.items : state.session.items;
  const priorityTopics = new Set(items.filter(i => i.bucket === 'review' || i.bucket === 'high').map(i => i.topicKey));
  const focusNames = [...new Set(items.filter(i => priorityTopics.has(i.topicKey)).map(i => QUESTION_BY_ID.get(i.questionId)?.topic).filter(Boolean))];
  const heroText = sessionActive() ? `Sessão em andamento: questão ${state.session.index + 1} de ${state.session.items.length}.` : plan.personalized ? (focusNames.length ? `Hoje, vamos fortalecer ${focusNames.slice(0, 2).join(' e ')}, com revisão e manutenção dos demais assuntos.` : 'Hoje, uma sessão para desenvolver assuntos em evolução e manter os consistentes.') : plan.message;
  const st = streak(), j = journey(), days = activeDays(), monday = weekStart;
  return head(`Seu próximo passo, ${esc(displayName())}.`, 'Consistência hoje. Mais confiança no dia da prova.', st ? `<span class="pill amber">${plural(st, 'dia', 'dias')} de constância</span>` : '')
    + importBanner()
    + `<div class="grid cols"><section class="card session-hero"><span class="pill">${sessionActive() ? 'EM ANDAMENTO' : plan.personalized ? 'SELECIONADA PARA VOCÊ' : 'MAPEAMENTO INICIAL'}</span><h2>Seu conhecimento merece<br>uma direção.</h2><p class="muted">${esc(heroText)}</p><div class="session-stats"><div><strong>${items.length}</strong><span>questões selecionadas</span></div><div><strong>${minutesFor(items.length)} min</strong><span>de estudo focado</span></div><div><strong>${priorityTopics.size || new Set(items.map(i => i.topicKey)).size}</strong><span>${priorityTopics.size ? 'temas prioritários' : 'assuntos variados'}</span></div></div><button class="btn" data-action="start">${sessionActive() ? 'Continuar minha sessão' : 'INICIAR SESSÃO RECOMENDADA'}</button></section>`
    + `<section class="card"><div class="row"><h2>Sua próxima conquista</h2><span>◎</span></div><p class="muted small">${esc(state.profile.exam)} · ${esc(state.profile.year)}</p><div class="row"><div><strong style="font-size:2.8rem;font-weight:600">${daysUntil()}</strong><p class="muted small">dias até sua data-meta</p></div><div class="ring" style="background:conic-gradient(#0c8a89 0 ${Math.round(j * 360)}deg,#e8eff2 ${Math.round(j * 360)}deg)"><div><strong>${pct(j)}%</strong><small>do caminho</small></div></div></div><div class="bar"><span style="width:${pct(j)}%"></span></div><p class="muted small" style="margin:15px 0 0">Tempo decorrido desde a criação do plano até a data-meta estimada por você. Não é a data oficial de uma prova: consulte o Radar e o edital.</p></section></div>`
    + `<div class="grid metrics">${[['Questões respondidas', answers.length.toLocaleString('pt-BR'), answers.length ? `+ ${thisWeek} nesta semana` : 'Seu histórico começa aqui'], ['Taxa de acerto', answers.length ? pct(correct / answers.length) + '%' : '—', answers.length ? `${correct} acertos · ${answers.length - correct} erros` : 'Sem respostas ainda'], ['Tempo em questões', studyTime(), `Meta: ${state.profile.hours}h por semana`], ['Revisões pendentes', String(pending.length), pending.length ? `${dueToday} para hoje ou atrasadas` : 'Nenhuma pendência']].map(([l, v, d], i) => `<div class="card metric"><span class="muted small">${l}</span><strong>${v}</strong><p class="${i === 0 && answers.length ? 'delta' : ''}">${d}</p></div>`).join('')}</div>`
    + `<div class="grid cols"><section class="card"><div class="row section-title"><h2 style="margin:0">Seu domínio por área</h2><a class="link" href="#desempenho">Explorar mapa</a></div>${TAXONOMY.map(a => { const n = knowledge().nodes[a.key]; return `<div class="area"><div class="row"><span>${esc(a.label)}</span><strong class="small">${esc(masteryLabel(n))}</strong></div>${masteryBar(n)}</div>`; }).join('')}<p class="small muted" style="margin-bottom:0">Domínio = métrica interna de preparação calculada com as suas respostas. Não é probabilidade de aprovação.</p></section>`
    + `<section class="card"><div class="row"><h2>Foco de hoje</h2><span class="pill">${state.profile.hours} h/sem</span></div>${focusBlock()}<div class="week" aria-label="Dias com prática nesta semana">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => { const day = monday + i * DAY, done = days.has(day), future = day > startOfDay(now()); return `<div class="day ${future ? 'future' : ''}">${d}<i>${done ? '✓' : '·'}</i></div>`; }).join('')}</div><div class="actions" style="margin-top:6px"><button class="btn teal" data-action="start">${sessionActive() ? 'Continuar sessão' : 'INICIAR SESSÃO RECOMENDADA'}</button><a href="#revisoes" class="link" style="align-self:center">Ver minhas revisões</a></div></section></div>`;
}

// ---------- Sessão ----------
function sessionPage() {
  if (noBank()) return head('Seu estudo de hoje', 'Um ciclo curto: praticar, compreender e revisar.') + '<div class="notice warn">O banco de questões não está disponível no momento.</div>';
  if (sessionActive()) {
    const s = state.session;
    return head('Seu estudo de hoje', 'Um ciclo curto: praticar, compreender e revisar.') + `<section class="card" style="max-width:850px"><span class="eyebrow">${esc(s.mode)}</span><h2 style="font-size:1.65rem;margin-top:20px">Sessão em andamento</h2><p class="muted">Você respondeu ${Object.keys(s.responses).length} de ${s.items.length} questões. Seu progresso está salvo na sua conta.</p><div class="bar"><span style="width:${Object.keys(s.responses).length / s.items.length * 100}%"></span></div><div class="actions"><button class="btn teal" data-action="start">Continuar sessão</button><button class="btn secondary" data-action="restart">Iniciar nova sessão recomendada</button></div><p class="muted small">Iniciar outra sessão registra esta como interrompida; as respostas já dadas permanecem no histórico.</p></section>`;
  }
  const plan = currentPlan();
  const comp = Object.entries(plan.composition).map(([b, n]) => `<span class="chip">${n} · ${esc(BUCKETS[b])}</span>`).join('');
  const why = plan.personalized
    ? `<h2>Por que estas questões?</h2>${(plan.priorities || []).slice(0, 4).map(p => `<div class="task"><span class="task-number">${p.priorityScore}</span><div class="task-content"><strong class="small">${esc(p.topic)}</strong> <span class="pill ${p.level === 'alta' ? 'amber' : 'grey'}">${p.level}</span><p>${esc(p.priorityReason)}</p></div></div>`).join('')}<p class="muted small">Pontuação de 0 a 100 calculada por regras transparentes: domínio, erros recentes, erros recorrentes, revisões vencidas, tempo sem prática e volume de dados. A incidência de assuntos por prova não é usada: ainda não há base de dados confiável para isso.</p>`
    : `<h2>Como a personalização começa</h2><p class="muted">Primeiro precisamos conhecer seu desempenho. Esta sessão alterna as cinco grandes áreas.</p><ul class="checklist"><li>Após ${ADAPTIVE_CONFIG.session.minAnswersForPersonalization} respostas, as sessões passam a priorizar suas lacunas</li><li>Erros recorrentes viram revisões espaçadas</li><li>Domínio só sobe com acertos posteriores</li></ul>`;
  return head('Seu estudo de hoje', 'Um ciclo curto: praticar, compreender e revisar.') + `<div class="grid cols"><section class="card"><span class="eyebrow">${plan.personalized ? 'SESSÃO PERSONALIZADA' : 'SESSÃO INICIAL EQUILIBRADA'}</span><h2 style="font-size:1.65rem;margin-top:20px">${plan.personalized ? 'Montada a partir do seu desempenho' : 'Vamos mapear seu ponto de partida'}</h2>${plan.message ? `<div class="notice">${esc(plan.message)}</div>` : ''}<div class="chips">${comp}</div><p class="muted small">Adaptado ao ritmo de ${state.profile.hours} horas semanais. Reserve cerca de ${minutesFor(plan.items.length)} minutos para este bloco de ${plan.items.length} questões.</p>${plan.items.map((it, i) => { const q = QUESTION_BY_ID.get(it.questionId); return `<div class="task"><span class="task-number">${String(i + 1).padStart(2, '0')}</span><div class="task-content"><strong>${esc(q.title)}</strong><p>${esc(q.area)} · ${esc(q.topic)} · ${esc(BUCKETS[it.bucket])}</p></div></div>`; }).join('')}<div class="actions"><button class="btn teal" data-action="start">Iniciar ${plan.items.length} questões</button>${button('Explorar meu mapa', 'desempenho', 'secondary')}</div><p class="muted small">Banco inicial em validação: questões autorais provisórias, com revisão médica pendente.</p></section><section class="card" style="align-self:start">${why}</section></div>`;
}

function provenanceNote(q) {
  const p = q.provenance || {};
  return `<details class="provenance"><summary class="small">Origem desta questão · <strong>${esc(VALIDATION[p.validationStatus] || 'Status não informado')}</strong></summary><ul class="context-list small"><li><strong>Fonte:</strong> ${esc(p.sourceName || 'Não informada')}</li><li><strong>Atribuição a prova:</strong> ${p.examAttribution ? esc(p.examAttribution) : 'nenhuma (questão não pertence a uma prova oficial)'}</li><li><strong>Última verificação:</strong> ${p.lastVerifiedAt ? fmtDate(p.lastVerifiedAt) : 'ainda não verificada'}</li>${(p.references || []).map(r => `<li><strong>Referência:</strong> <a class="link" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.label)}</a></li>`).join('')}${p.notes ? `<li>${esc(p.notes)}</li>` : ''}</ul></details>`;
}

function questionPage(correction = false) {
  if (!state.session) return sessionPage();
  if (state.session.done) return resultPage();
  const s = state.session, q = currentQuestion(state), r = currentResponse(state), item = currentItem(state);
  if (!q) return head('Questão indisponível', 'Esta questão não está mais ativa no banco.', button('Voltar à sessão', 'sessao', 'secondary')) + '<div class="notice warn">A questão foi retirada do banco. Inicie uma nova sessão; suas respostas anteriores continuam no histórico.</div>';
  const exam = s.kind === 'simulado';
  const a = r?.choice;
  if ((correction || exam) && a === undefined) correction = false;
  if (exam) correction = false;
  const answered = a !== undefined, last = s.index === s.items.length - 1;
  const node = knowledge().nodes[q.topicKey];
  const fb = answered && lastFeedback?.answerId === r.answerId ? lastFeedback : null;
  const reveal = answered && !exam;
  const answerClass = i => reveal ? (i === q.correct ? 'correct' : i === a ? 'wrong' : '') : answered ? (i === a ? 'selected' : '') : (selected === i ? 'selected' : '');
  const examActions = `<div class="notice">Resposta registrada. No simulado, a correção aparece ao finalizar.</div><div class="actions">${last ? '<button class="btn teal" data-action="finish">Finalizar simulado</button>' : '<button class="btn teal" data-action="next">Próxima questão</button>'}</div>`;
  return head(correction ? 'Entenda o raciocínio' : exam ? 'Simulado MedAI — banco inicial' : 'Uma questão de cada vez', `Questão ${s.index + 1} de ${s.items.length} · ${esc(q.area)} · ${esc(q.topic)}`, button('Pausar e voltar', exam ? 'simulados' : 'sessao', 'secondary'))
    + `<div class="grid question-layout"><section class="card"><div class="row"><span class="pill">${esc(q.subtopic)}</span><span class="muted small">Banco inicial · ${esc((VALIDATION[q.provenance?.validationStatus] || '').split(' · ')[0] || 'Provisória')}</span></div><p class="question">${esc(q.stem)}</p><div class="answers">${q.options.map((o, i) => `<button class="answer ${answerClass(i)}" data-answer="${i}" ${answered ? 'disabled' : ''} aria-pressed="${(answered ? a : selected) === i}"><span class="letter">${LETTERS[i]}</span><span>${esc(o)}${reveal && i === q.correct ? ' ✓' : ''}</span></button>`).join('')}</div>`
    + (answered && exam ? examActions
      : answered ? `<div class="explanation"><span class="pill ${a !== q.correct ? 'amber' : ''}">${a === q.correct ? 'Resposta correta' : 'Vamos fortalecer este conceito'}</span>${fb?.note ? `<div class="notice">${esc(fb.note)}</div>` : ''}<h2 style="margin-top:22px">Explicação</h2><p>${esc(q.explain)}</p><h3>${a === q.correct ? 'O que consolidar' : 'Análise do seu erro'}</h3><p>${esc(q.analysis[a])} ${esc(q.key)}</p><details><summary>Análise de todas as alternativas</summary><ul>${q.analysis.map((x, i) => `<li><strong>${LETTERS[i]}.</strong> ${esc(x)}</li>`).join('')}</ul></details>${provenanceNote(q)}<p class="small muted" style="margin-top:12px">Questão autoral, não reproduzida de prova. Confira sempre em material de referência.</p><div class="actions"><button class="btn teal" data-action="${last ? 'finish' : 'next'}">${last ? 'Concluir sessão' : 'Próxima questão'}</button>${button('Conversar com o tutor', 'tutor', 'secondary')}<button class="btn secondary" data-action="understood">Compreendi a explicação</button><button class="link" data-action="review">Adicionar à revisão</button></div></div>`
      : `<div class="actions"><button class="btn teal" data-action="confirm" ${selected === null ? 'disabled' : ''}>Confirmar resposta</button><span class="small muted" style="align-self:center">Selecione uma alternativa para continuar.</span></div>`)
    + `</section><section class="card" style="align-self:start"><span class="eyebrow">${exam ? 'SIMULADO' : 'SEU BLOCO DE ESTUDO'}</span><h2 style="margin-top:20px">${esc(s.mode)}</h2><div class="bar"><span style="width:${Object.keys(s.responses).length / s.items.length * 100}%"></span></div><p class="muted small" style="margin-top:12px">${Object.keys(s.responses).length} de ${s.items.length} questões respondidas</p>${exam ? '<div class="notice">Distribuição equilibrada entre as cinco grandes áreas. Não representa a distribuição de nenhuma prova oficial.</div>' : `<div class="notice"><strong>Por que esta questão?</strong><br>${esc(BUCKETS[item.bucket])}: ${esc(item.reason)}</div><p class="small"><strong>${esc(q.topic)}:</strong> <span class="muted">${esc(masteryLabel(node))}</span></p>`}<p class="muted small">Exemplo simplificado para estudo. Não use este conteúdo para decisões clínicas.</p></section></div>`;
}

// ---------- Tutor (experimental, sem IA) ----------
function tutorContext() { const q = currentQuestion(state); return buildTutorContext(state, knowledge(), q, currentResponse(state)?.choice, now(), QUESTION_BY_ID); }
function tutorPage() {
  if (!state.session || state.session.done || !currentQuestion(state)) return head('Tutor de estudo', 'Abra uma questão para conversar sobre o contexto.', button('Ir à sessão', 'sessao'));
  if (state.session.kind === 'simulado') return head('Tutor de estudo', 'O tutor fica disponível depois do simulado, na correção.', button('Voltar ao simulado', 'questao'));
  const q = currentQuestion(state), ctx = tutorContext();
  if (!messages.length) messages = [{ role: 'bot', text: `Vamos revisar “${q.title}”. Posso explicar o conceito, comentar as alternativas ou resumir o ponto-chave. As respostas são pré-definidas para esta questão.` }];
  const m = ctx.topicMastery;
  return head('Uma dúvida. Um novo entendimento.', 'Tutor contextual experimental · Respostas pré-definidas, sem IA.', button('Voltar à questão', currentResponse(state) !== undefined ? 'correcao' : 'questao', 'secondary'))
    + `<div class="grid cols"><section class="card"><div class="row"><h2>Tutor MedAI</h2><span class="pill amber">EXPERIMENTAL</span></div><div class="chat" aria-live="polite">${messages.map(x => `<div class="bubble ${x.role === 'user' ? 'user' : ''}">${esc(x.text)}</div>`).join('')}</div><div class="actions">${['Explique o conceito', 'Analise meu erro', 'Resuma para revisar'].map(x => `<button class="btn secondary" data-prompt="${x}">${x}</button>`).join('')}</div><form class="chat-form" id="chat" style="margin-top:22px"><input name="message" required maxlength="300" aria-label="Sua dúvida sobre a questão" placeholder="Escreva sua dúvida sobre esta questão"><button class="btn" type="submit">Enviar</button></form><p class="muted small">O tutor trata apenas do conteúdo da questão. Não use para orientar o cuidado de pacientes reais.</p></section>`
    + `<section class="card" style="align-self:start"><span class="eyebrow">QUESTÃO EM CONTEXTO</span><h2 style="margin-top:20px">${esc(q.title)}</h2><p class="muted small">${esc(q.stem)}</p><button class="link" data-action="review">Guardar para revisar</button><details><summary class="small">Contexto preparado para o tutor futuro</summary><ul class="context-list small"><li><strong>Assunto:</strong> ${esc(ctx.topic.area)} › ${esc(ctx.topic.label)} › ${esc(ctx.topic.subtopic)}</li><li><strong>Sua resposta:</strong> ${ctx.studentAnswer ? `${LETTERS[ctx.studentAnswer.choice]} · ${ctx.studentAnswer.correct ? 'correta' : 'incorreta'}` : 'ainda não respondida'}</li><li><strong>Domínio do assunto:</strong> ${m.questionsAnswered ? `${pct(m.value)}% · ${esc(m.state.toLowerCase())} (${plural(m.questionsAnswered, 'questão', 'questões')})` : 'sem dados'}</li><li><strong>Erros recentes:</strong> ${ctx.recentErrors.length ? ctx.recentErrors.map(e => esc(e.title)).join('; ') : 'nenhum'}</li><li><strong>Principais lacunas:</strong> ${ctx.mainGaps.length ? ctx.mainGaps.map(g => esc(g.topic)).join(', ') : 'ainda não identificadas'}</li></ul><p class="muted small">Nada é enviado a serviços externos. A estrutura está pronta para um tutor real em etapa futura.</p></details></section></div>`;
}
function chatSend(text) {
  messages.push({ role: 'user', text });
  const q = currentQuestion(state), r = currentResponse(state), ctx = tutorContext();
  const topicNote = ctx.recentErrors.length > 1 ? ` Observação: você tem ${ctx.recentErrors.length} erros recentes em ${ctx.topic.label}; vale revisar o conceito central antes da próxima questão.` : '';
  const response = r === undefined ? 'Para preservar sua tentativa, responda à questão primeiro. Observe o conceito central e compare cada alternativa com os dados fornecidos.'
    : /erro|alternativa/i.test(text) ? q.analysis[r.choice] + ' ' + q.key + topicNote
    : /resum/i.test(text) ? q.key
    : /conceito|explique/i.test(text) ? q.explain + ' ' + q.key
    : 'Este tutor experimental responde apenas com o conteúdo desta questão. Ponto-chave: ' + q.key;
  messages.push({ role: 'bot', text: response });
  render();
  const chat = document.querySelector('.chat'); if (chat) chat.scrollTop = chat.scrollHeight;
}

// ---------- Desempenho ----------
function heatmap() {
  const counts = new Map();
  for (const a of personalAnswers()) { const d = startOfDay(a.at); if (Number.isFinite(d)) counts.set(d, (counts.get(d) || 0) + 1); }
  const today = startOfDay(now()), start = today - 83 * DAY;
  return Array.from({ length: 84 }, (_, i) => { const d = start + i * DAY, n = counts.get(d) || 0; return `<span class="l${n === 0 ? 0 : n < 4 ? 1 : n < 8 ? 2 : 3}" title="${fmtDate(d)}: ${plural(n, 'questão', 'questões')}"></span>`; }).join('');
}
function topicRow(t) {
  return `<a class="topic topic-metrics" href="#tema" data-topic="${esc(t.key)}"><span class="tm-name"><strong>${esc(t.label)}</strong><span class="muted small">${esc(masteryLabel(t))}</span></span><span class="tm-cell"><b>${t.questionsAnswered}</b><small>respondidas</small></span><span class="tm-cell"><b>${t.correctAnswers}</b><small>acertos</small></span><span class="tm-cell"><b>${t.incorrectAnswers}</b><small>erros</small></span><span class="tm-cell"><b>${t.recentAccuracy === null ? '—' : pct(t.recentAccuracy) + '%'}</b><small>recente</small></span><span class="trend ${trendClass(t.trend)}">${trendLabel(t)}</span></a>`;
}
function performance() {
  const k = knowledge(), answers = personalAnswers(), correct = answers.filter(a => a.correct).length;
  const areas = TAXONOMY.map(a => k.nodes[a.key]).concat(Object.values(k.nodes).filter(n => n.level === 'area' && !TAXONOMY.some(t => t.key === n.key) && n.questionsAnswered));
  const map = areas.map(area => {
    const topics = childrenOf(k, area.key);
    return `<details ${area.questionsAnswered ? 'open' : ''}><summary><span class="map-row"><span class="map-name">${esc(area.label)}</span><span class="map-bar">${masteryBar(area)}</span><span class="pill ${stateClass(area.state)}">${area.questionsAnswered ? (area.state === MASTERY_STATES.STARTING ? 'Poucos dados' : esc(area.state)) : '— Sem dados'}</span></span></summary><div class="topics">${topics.map(t => topicRow(t) + (t.questionsAnswered ? `<div class="subtopics">${childrenOf(k, t.key).filter(s => s.questionsAnswered).map(s => `<div class="subtopic"><span>${esc(s.label)}</span><span class="muted small">${s.correctAnswers}/${s.questionsAnswered} acertos · ${esc(masteryLabel(s))}</span></div>`).join('')}</div>` : '')).join('')}</div></details>`;
  }).join('');
  const done = state.reviews.filter(r => r.status === 'done').length;
  return head('Veja o que você sabe.', 'Do panorama geral ao conceito que merece sua atenção.', '<span class="pill">Seus dados na sua conta</span>')
    + `<div class="grid cols"><section class="card"><div class="row"><h2>Mapa de domínio</h2><span class="small muted">Área / assunto / subassunto</span></div>${answers.length ? '' : '<div class="notice">Dados insuficientes. Responda sua primeira sessão para começarmos a mapear seus pontos fortes e lacunas.</div>'}${map}<p class="muted small">Domínio é uma métrica interna de preparação, ponderada por recência. Com poucas respostas, o MedAI indica “Iniciando” em vez de um percentual definitivo. Tendência aparece a partir de ${ADAPTIVE_CONFIG.trend.minAnswers} respostas no assunto.</p></section>`
    + `<section class="card" style="align-self:start"><h2>Seu aprendizado deixa marcas</h2><p class="muted small">Sua prática real · últimas 12 semanas</p>${answers.length ? `<div class="heatmap real" aria-label="Atividade de estudo nas últimas 12 semanas">${heatmap()}</div><div class="row small muted"><span>Menos prática</span><span>Mais prática</span></div>` : '<p class="muted">Dados insuficientes.</p>'}<div class="summary compact"><div><span class="muted small">Respondidas</span><strong>${answers.length}</strong></div><div><span class="muted small">Acerto geral</span><strong>${answers.length ? pct(correct / answers.length) + '%' : '—'}</strong></div><div><span class="muted small">Revisões concluídas</span><strong>${done}</strong></div></div>${simuladoHistory(true)}${button('Ver caderno de erros', 'revisoes', 'secondary')}</section></div>`;
}

function topicPage() {
  const k = knowledge();
  const key = ui.topicKey && k.nodes[ui.topicKey]?.level === 'topic' ? ui.topicKey : TAXONOMY[0].topics[0].key;
  const t = k.nodes[key];
  const p = computePriorities(k, state.reviews, now()).find(x => x.topicKey === key);
  const history = personalAnswers().filter(a => a.topicKey === key).slice(-8).reverse();
  const hasQuestions = QUESTIONS.some(q => q.topicKey === key);
  const facts = [['Respondidas', t.questionsAnswered], ['Acertos', t.correctAnswers], ['Erros', t.incorrectAnswers], ['Recente', t.recentAccuracy === null ? '—' : `${pct(t.recentAccuracy)}% (últimas ${t.recentCount})`], ['Tendência', trendLabel(t)], ['Confiança dos dados', t.questionsAnswered ? pct(t.dataConfidence) + '%' : '—'], ['Última prática', fmtDate(t.lastInteractionAt)], ['Próxima revisão', fmtDate(t.nextReviewAt)]];
  return head(esc(t.label), `${esc(t.area)} / ${esc(t.label)}`, button('Voltar ao mapa', 'desempenho', 'secondary'))
    + `<div class="grid cols"><section class="card"><div class="row"><div><span class="eyebrow">DOMÍNIO DO ASSUNTO</span><h2 style="font-size:2.8rem;margin:15px 0">${t.questionsAnswered && t.state !== MASTERY_STATES.STARTING ? pct(t.currentMastery) + '%' : '—'}</h2></div><span class="pill ${stateClass(t.state)}">${esc(t.state)}</span></div>${masteryBar(t)}<p class="muted small">${t.questionsAnswered ? `Baseado em ${plural(t.questionsAnswered, 'questão respondida', 'questões respondidas')} por você.${t.recurrentError ? ` Erro recorrente detectado em ${fmtDate(t.recurrentErrorDetectedAt)}.` : ''}${t.contentReviewedAt ? ` Conteúdo revisado em ${fmtDate(t.contentReviewedAt)} (não altera o domínio).` : ''}` : 'Ainda sem respostas neste assunto.'}</p><div class="facts">${facts.map(([l, v]) => `<div><span class="muted small">${l}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`
    + `<h2 style="margin-top:30px">Subassuntos</h2>${childrenOf(k, key).map(s => `<div class="subtopic"><span>${esc(s.label)}</span><span class="muted small">${s.questionsAnswered ? `${s.correctAnswers}/${s.questionsAnswered} acertos · ${esc(masteryLabel(s))}` : 'Sem dados'}</span></div>`).join('')}`
    + `<h2 style="margin-top:30px">Histórico de aprendizagem</h2>${history.length ? history.map(a => `<div class="task"><span class="task-number">${a.correct ? '✓' : '↻'}</span><div><strong>${esc(QUESTION_BY_ID.get(a.questionId)?.title || a.questionId)}</strong><p>${fmtDate(a.at)} · ${a.correct ? 'Acerto' : 'Erro'}${a.isReview ? ' · em revisão' : ''}</p></div></div>`).join('') : '<p class="muted">Nenhuma tentativa registrada neste assunto.</p>'}</section>`
    + `<section class="card" style="align-self:start"><h2>Próximo passo recomendado</h2><p><span class="pill ${p.level === 'alta' ? 'amber' : 'grey'}">Prioridade ${p.level} · ${p.priorityScore}/100</span></p><h3>Por que isso está sendo recomendado?</h3><ul class="reasons">${p.reasons.map(r => `<li>${esc(r.text)}</li>`).join('')}</ul>${hasQuestions ? `<button class="btn teal" data-action="directed" data-topic-key="${esc(key)}">Iniciar revisão direcionada</button>` : '<div class="notice">O banco inicial ainda não tem questões deste assunto.</div>'}<p class="muted small">Revisão direcionada: ${ADAPTIVE_CONFIG.session.directedSize} questões deste assunto, priorizando as que você errou.</p></section></div>`;
}

// ---------- Revisões e caderno de erros ----------
const statusClass = s => ({ [REVIEW_STATUS.OVERDUE]: 'amber', [REVIEW_STATUS.TODAY]: '', [REVIEW_STATUS.PENDING]: 'grey', [REVIEW_STATUS.DONE]: 'ok' })[s];
function reviewRow(r) {
  const st = reviewStatus(r, now());
  return `<div class="task"><span class="task-number">↻</span><div class="task-content"><strong>${esc(r.topic)}</strong> <span class="pill ${statusClass(st)}">${st}</span><p>${esc(r.reason)} · Prioridade ${esc(r.priority)} · Criada em ${fmtDate(r.createdAt)} · ${st === REVIEW_STATUS.DONE ? `Concluída em ${fmtDate(r.completedAt)} (${r.accuracy === null || r.accuracy === undefined ? '—' : pct(r.accuracy) + '%'})` : `Recomendada para ${fmtDate(r.dueAt)}`} · Origem: ${esc(r.origin)}</p></div>${st === REVIEW_STATUS.DONE ? '' : `<button class="btn secondary" data-action="directed" data-topic-key="${esc(r.topicKey)}">${st === REVIEW_STATUS.PENDING ? 'Antecipar' : 'Revisar'}</button>`}</div>`;
}
function notebook() {
  const entries = errorNotebook(state, QUESTION_BY_ID);
  if (!entries.length) return '<div class="empty compact"><p class="muted">Nenhum erro registrado ainda. Questões que você errar aparecem aqui, com a explicação.</p></div>';
  return entries.map(e => { const q = e.question; return `<details class="notebook"><summary><span class="nb-head"><strong>${esc(e.title)}</strong><span class="pill ${e.recoveredAt ? 'ok' : 'amber'}">${e.recoveredAt ? `Recuperada em ${fmtDate(e.recoveredAt)}` : 'Ainda não recuperada'}</span></span><span class="muted small">${esc(e.area)} · ${esc(e.topic)} · último erro em ${fmtDate(e.lastErrorAt)} · ${plural(e.errorCount, 'erro nesta questão', 'erros nesta questão')} · ${plural(e.topicErrorCount, 'erro no assunto', 'erros no assunto')}</span></summary>${q ? `<p class="small">${esc(q.stem)}</p><p class="small"><strong>Sua resposta:</strong> ${e.lastChoice === null || e.lastChoice === undefined ? 'não registrada (dado migrado)' : `${LETTERS[e.lastChoice]}. ${esc(q.options[e.lastChoice])}`}<br><strong>Resposta correta:</strong> ${LETTERS[q.correct]}. ${esc(q.options[q.correct])}</p><p class="small muted">${esc(q.explain)}</p>` : '<p class="small muted">Questão não está mais no banco ativo.</p>'}</details>`; }).join('');
}
function reviewsPage() {
  const mine = state.reviews.filter(r => r.source === 'user');
  const active = mine.filter(r => r.status === 'pending').sort((a, b) => toMs(a.dueAt) - toMs(b.dueAt));
  const done = mine.filter(r => r.status === 'done').sort((a, b) => toMs(b.completedAt) - toMs(a.completedAt)).slice(0, 5);
  const iv = ADAPTIVE_CONFIG.reviews.intervalsDays;
  return head('Revisar é fazer permanecer.', 'Seus erros e conceitos salvos voltam para um novo encontro.')
    + `<div class="grid cols"><section class="card"><div class="row"><h2>Fila de revisão</h2><span class="pill">${plural(active.length, 'assunto', 'assuntos')}</span></div>${active.length ? active.map(reviewRow).join('') : `<div class="empty"><h2>Revisões em dia</h2><p class="muted">Erros recorrentes, erros recentes e domínio frágil aparecerão aqui.</p>${button('Praticar novamente', 'sessao')}</div>`}${done.length ? `<h3 style="margin-top:26px">Concluídas recentemente</h3>${done.map(reviewRow).join('')}` : ''}${state.demo.legacyReviews.length ? `<p class="muted small">Itens importados de uma versão antiga, sem evidência de erro seu: ${state.demo.legacyReviews.map(esc).join(', ')}. Não entram na fila.</p>` : ''}</section>`
    + `<section class="card" style="align-self:start"><h2>Como a fila funciona</h2><ul class="reasons small"><li>Um erro isolado não cria revisão; só ajusta a prioridade.</li><li>${ADAPTIVE_CONFIG.reviews.createOnErrorsInWindow} erros entre as últimas ${ADAPTIVE_CONFIG.recent.window} questões do assunto: “Erro recente”.</li><li>${ADAPTIVE_CONFIG.recurrence.minErrors} ou mais: “Erros recorrentes”, disponível hoje.</li><li>Revisão com ${pct(ADAPTIVE_CONFIG.reviews.successAccuracy)}% de acerto ou mais amplia o intervalo: ${iv.join(' → ')} dias.</li><li>Novo erro reduz o intervalo.</li><li>“Compreendi a explicação” não conclui revisão: só acertos posteriores comprovam o domínio.</li><li>No máximo uma revisão ativa por assunto.</li></ul></section></div>`
    + `<section class="card" style="margin-top:22px"><div class="row"><h2>Caderno de erros</h2><span class="muted small">Histórico preservado, inclusive após acertar</span></div>${notebook()}</section>`;
}

// ---------- Simulados ----------
function sessionScore(sessionId) {
  const list = personalAnswers().filter(a => a.sessionId === sessionId);
  return { total: list.length, correct: list.filter(a => a.correct).length, answers: list };
}
function simuladoHistory(compact = false) {
  const sims = state.studySessions.filter(s => s.kind === 'simulado').slice().reverse();
  if (!sims.length) return compact ? '' : '<p class="muted">Você ainda não fez simulados.</p>';
  const rows = sims.slice(0, compact ? 3 : 20).map(s => { const sc = sessionScore(s.id); return `<div class="task"><span class="task-number">▧</span><div class="task-content"><strong>${fmtDate(s.startedAt)} · ${s.status}</strong><p>${sc.total ? `${sc.correct} de ${sc.total} acertos (${pct(sc.correct / sc.total)}%)` : 'Nenhuma resposta registrada'}</p></div>${sc.total && s.status === 'concluída' ? `<button class="btn secondary" data-action="sim-review" data-session="${esc(s.id)}">Ver correção</button>` : ''}</div>`; }).join('');
  return compact ? `<h3 style="margin-top:22px">Últimos simulados</h3>${rows}` : rows;
}
function simuladosPage() {
  const n = Math.min(ADAPTIVE_CONFIG.session.simuladoSize, QUESTIONS.length);
  const running = sessionActive() && state.session.kind === 'simulado';
  return head('Treine o ritmo da prova.', 'Simulado com correção ao final, registrado no seu histórico.') + `<div class="grid cols"><section class="card"><span class="eyebrow">SIMULADO MEDAI — BANCO INICIAL</span><h2 style="font-size:1.6rem;margin-top:18px">Fundamentos das cinco grandes áreas</h2><p class="muted">${n} questões · Correção ao finalizar · Sem cronômetro obrigatório</p><div class="notice">Banco inicial em validação: questões autorais provisórias, com revisão médica pendente. Não é um simulado oficial e não representa a distribuição de nenhuma prova de residência. Suas respostas entram no histórico e no mapa de domínio.</div>${noBank() ? '<div class="notice warn">O banco de questões não está disponível no momento.</div>' : running ? '<button class="btn teal" data-action="start">Continuar simulado em andamento</button>' : '<button class="btn teal" data-action="mock">Iniciar simulado</button>'}</section><section class="card" style="align-self:start"><h2>Seus simulados</h2>${simuladoHistory()}</section></div>`;
}
function correctionList(rows) {
  return rows.map(({ q, choice }) => {
    if (!q) return '<div class="task"><span class="task-number">?</span><div><strong>Questão fora do banco ativo</strong></div></div>';
    const ok = choice === q.correct;
    return `<details class="notebook"><summary><span class="nb-head"><strong>${ok ? '✓' : '↻'} ${esc(q.title)}</strong><span class="pill ${ok ? 'ok' : 'amber'}">${ok ? 'Acerto' : 'Erro'}</span></span><span class="muted small">${esc(q.area)} · ${esc(q.topic)}</span></summary><p class="small">${esc(q.stem)}</p><p class="small"><strong>Sua resposta:</strong> ${Number.isInteger(choice) ? `${LETTERS[choice]}. ${esc(q.options[choice])}` : 'não registrada'}<br><strong>Resposta correta:</strong> ${LETTERS[q.correct]}. ${esc(q.options[q.correct])}</p><p class="small muted">${esc(q.explain)}</p>${Number.isInteger(choice) && !ok ? `<p class="small"><strong>Por que não:</strong> ${esc(q.analysis[choice])}</p>` : ''}</details>`;
  }).join('');
}
function simReviewPage() {
  const s = state.studySessions.find(x => x.id === ui.simSession);
  if (!s) return head('Correção do simulado', 'Simulado não encontrado.', button('Voltar', 'simulados', 'secondary'));
  const sc = sessionScore(s.id);
  return head('Correção do simulado', `Realizado em ${fmtDate(s.startedAt)}.`, button('Voltar aos simulados', 'simulados', 'secondary')) + `<section class="card" style="max-width:900px"><h2 style="font-size:2.4rem;margin:10px 0 20px">${sc.correct} de ${sc.total} acertos</h2>${correctionList(sc.answers.map(a => ({ q: QUESTION_BY_ID.get(a.questionId), choice: a.choice })))}</section>`;
}

function resultPage() {
  const s = state.session;
  if (!s?.done) return sessionPage();
  const rows = s.items.map((it, i) => ({ q: QUESTION_BY_ID.get(it.questionId), r: s.responses[i] }));
  const hits = rows.filter(x => x.q && x.r && x.r.choice === x.q.correct).length;
  const topics = [...new Set(rows.filter(x => x.q).map(x => x.q.topicKey))].map(key => knowledge().nodes[key]).filter(Boolean);
  const exam = s.kind === 'simulado';
  return head(exam ? 'Simulado finalizado.' : 'Mais um passo construído.', exam ? 'Confira a correção de cada questão. O resultado foi salvo na sua conta.' : 'Sua sessão foi concluída e o progresso foi salvo na sua conta.')
    + `<section class="card" style="max-width:900px"><span class="pill">${exam ? 'SIMULADO MEDAI — BANCO INICIAL' : 'SESSÃO CONCLUÍDA'}</span><h2 style="font-size:3rem;margin:22px 0">${hits} de ${rows.length} acertos</h2><p class="muted">${hits === rows.length ? 'Você consolidou os fundamentos deste bloco.' : 'Os assuntos que precisam de atenção influenciam sua próxima sessão.'}</p>${(s.resolvedReviews || []).map(r => `<div class="notice">${r.success ? `Revisão de ${esc(r.topic)} concluída com sucesso.${r.nextDueAt ? ` Próxima revisão em ${fmtDate(r.nextDueAt)}.` : ' Assunto consolidado no ciclo de revisões.'}` : `Revisão de ${esc(r.topic)} com erros: intervalo reduzido, nova revisão em ${fmtDate(r.nextDueAt)}.`}</div>`).join('')}`
    + (exam ? `<h3 style="margin-top:24px">Correção</h3>${correctionList(rows.map(x => ({ q: x.q, choice: x.r?.choice })))}` : rows.map(x => `<div class="task"><span class="task-number">${x.q && x.r?.choice === x.q.correct ? '✓' : '↻'}</span><div><strong>${esc(x.q?.title || 'Questão fora do banco ativo')}</strong><p>${esc(x.q?.topic || '')} · ${x.q && x.r?.choice === x.q.correct ? 'Acerto' : 'Erro registrado no caderno'}</p></div></div>`).join(''))
    + `<h3 style="margin-top:24px">Seu mapa agora</h3>${topics.map(t => `<div class="subtopic"><span>${esc(t.label)}</span><span class="muted small">${esc(masteryLabel(t))} · ${esc(trendLabel(t))}</span></div>`).join('')}<div class="actions">${button('Ver minhas revisões', 'revisoes')}${button('Explorar desempenho', 'desempenho', 'secondary')}${button('Voltar à visão geral', 'dashboard', 'secondary')}</div></section>`;
}

// ---------- Radar de residências ----------
const REG_LABEL = { OPEN: ['Inscrições abertas', 'ok'], UPCOMING: ['Inscrições ainda não abertas', 'grey'], CLOSED: ['Inscrições encerradas', 'grey'], UNKNOWN: ['Período de inscrição não informado', 'grey'] };
const val = (v, fmt = x => esc(x)) => v === null || v === undefined || v === '' ? NA : fmt(v);
function period(p) {
  if (!p.registrationStart && !p.registrationEnd) return NA;
  return `${p.registrationStart ? fmtDay(p.registrationStart) : NA} – ${p.registrationEnd ? fmtDay(p.registrationEnd) : NA}`;
}
function vacancyText(p) {
  if (p.totalVacancies !== null && p.totalVacancies !== undefined) return `${p.totalVacancies.toLocaleString('pt-BR')} vagas (soma da tabela oficial)`;
  return null;
}
function preferredNote(p) {
  const x = p.preferredProgram;
  if (!x) return '';
  return `<div class="notice small">Cita <strong>${esc(x.specialty)}</strong> em ${plural(x.programs, 'programa', 'programas')}${x.vacancies !== null && x.vacancies !== undefined ? ` · ${x.vacancies} vaga(s) informada(s)` : ' · vagas: não informado'}. Pré-requisitos não confirmados: confira o edital.</div>`;
}
const trackButton = p => p.tracked ? `<button class="btn" data-action="untrack" data-id="${esc(p.id)}">✓ Acompanhando</button>` : `<button class="btn teal" data-action="track" data-id="${esc(p.id)}">ACOMPANHAR</button>`;
function processCard(p) {
  const [reg, cls] = REG_LABEL[p.registrationState] || REG_LABEL.UNKNOWN;
  return `<article class="card process-card"><div class="row" style="align-items:flex-start"><div><span class="eyebrow">${esc(p.institution?.acronym || p.source.organization.split(' (')[0])}</span><h2 style="margin:12px 0 4px">${esc(p.name)}</h2><p class="muted small" style="margin:0">${val(p.institution?.name)}${p.institution?.uf ? ` · ${esc(p.institution.city ? p.institution.city + '/' : '')}${esc(p.institution.uf)}` : ''}</p></div><span class="pill ${cls}">${reg}</span></div>`
    + `${p.reviewStatus === 'NEEDS_REVIEW' ? '<div class="notice warn small">Alguns dados deste processo precisam de verificação manual. Confira no edital.</div>' : ''}${preferredNote(p)}`
    + `<dl class="process-facts"><div><dt>Inscrições</dt><dd>${period(p)}</dd></div><div><dt>Prova</dt><dd>${val(p.examDate, fmtDay)}</dd></div><div><dt>Vagas</dt><dd>${vacancyText(p) ? esc(vacancyText(p)) : NA}</dd></div><div><dt>Taxa</dt><dd>${val(p.feeCents, money)}</dd></div></dl>`
    + `${p.programSummary ? `<p class="muted small">${plural(p.programSummary.programs, 'programa listado', 'programas listados')} em ${plural(p.programSummary.specialties, 'especialidade', 'especialidades')}.</p>` : ''}`
    + `<p class="muted small">Fonte: ${esc(p.source.name)} · Última verificação: ${p.lastVerifiedAt ? fmtDate(p.lastVerifiedAt) : 'não verificada'}</p>`
    + `<div class="actions"><a class="btn secondary" href="${esc(p.noticeUrl || p.officialUrl)}" target="_blank" rel="noopener noreferrer">Fonte oficial ↗</a><button class="btn secondary" data-action="process" data-id="${esc(p.id)}">Detalhes e evidências</button>${trackButton(p)}</div></article>`;
}
// Processos de uma mesma família (ex.: PSU-MG, um edital por instituição) aparecem agrupados.
function groupCard(name, list) {
  const pref = list.filter(p => p.preferredProgram).length;
  return `<article class="card process-card"><div class="row"><div><span class="eyebrow">${esc(list[0].source.organization.split(' (')[0])}</span><h2 style="margin:12px 0 4px">${esc(name)}</h2><p class="muted small" style="margin:0">${plural(list.length, 'edital de instituição', 'editais de instituições')} · cada linha usa os dados do edital da própria instituição</p></div></div>${list[0].statusNote ? `<div class="notice warn small">${esc(list[0].statusNote)}</div>` : ''}${pref ? `<div class="notice small">${plural(pref, 'instituição cita', 'instituições citam')} sua especialidade.</div>` : ''}<details ${list.length <= 4 ? 'open' : ''}><summary class="small">Ver instituições</summary><div class="table-wrap"><table class="data-table"><thead><tr><th>Instituição</th><th>Inscrições</th><th>Prova</th><th>Taxa</th><th></th></tr></thead><tbody>${list.map(p => `<tr><td><strong>${esc(p.institution?.name || p.name)}</strong>${p.institution?.city ? `<br><span class="muted small">${esc(p.institution.city)}/${esc(p.institution.uf)}</span>` : ''}${p.reviewStatus === 'NEEDS_REVIEW' ? '<br><span class="pill amber">verificar</span>' : ''}</td><td>${period(p)}</td><td>${val(p.examDate, fmtDay)}</td><td>${val(p.feeCents, money)}</td><td class="nowrap"><button class="link" data-action="process" data-id="${esc(p.id)}">Detalhes</button> · <a class="link" href="${esc(p.noticeUrl || p.officialUrl)}" target="_blank" rel="noopener noreferrer">Edital ↗</a> · <button class="link" data-action="${p.tracked ? 'untrack' : 'track'}" data-id="${esc(p.id)}">${p.tracked ? '✓ Acompanhando' : 'Acompanhar'}</button></td></tr>`).join('')}</tbody></table></div></details></article>`;
}
function processList(items) {
  const out = [], groups = new Map();
  for (const p of items) {
    if (!p.group) { out.push(processCard(p)); continue; }
    if (!groups.has(p.group)) { groups.set(p.group, []); out.push(() => groupCard(p.group, groups.get(p.group))); }
    groups.get(p.group).push(p);
  }
  return out.map(x => typeof x === 'function' ? x() : x).join('');
}
function radarKey() { return JSON.stringify(radar.filters); }
function loadRadar() {
  const key = radarKey();
  if (radar.loading || radar.key === key) return;
  radar.loading = true; radar.error = null;
  api.radar(radar.filters).then(d => { radar.data = d; radar.key = key; offline = false; }).catch(e => { radar.error = e.message; radar.key = key; if (e.status === 401) handleError(e); }).finally(() => { radar.loading = false; if (location.hash === '#radar') render(); });
}
function radarPage() {
  loadRadar();
  const f = radar.filters, d = radar.data;
  const sources = d?.sources || [];
  const filters = `<form id="radar-filters" class="radar-filters"><label class="field">Especialidade<input name="specialty" maxlength="80" value="${esc(f.specialty)}" placeholder="Ex.: Cirurgia Geral"></label><label class="field">Instituição<input name="institution" maxlength="80" value="${esc(f.institution)}" placeholder="Nome ou sigla"></label><label class="field">Estado<select name="uf"><option value="">Todos</option>${(d?.filters.ufs || []).map(u => `<option ${f.uf === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label><label class="field">Ano<select name="year"><option value="">Todos</option>${(d?.filters.years || []).map(y => `<option ${String(f.year) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}</select></label><label class="check"><input type="checkbox" name="open" ${f.open ? 'checked' : ''}> Só inscrições abertas</label><div class="actions" style="margin:0"><button class="btn teal" type="submit">Filtrar</button><button class="btn secondary" type="button" data-action="radar-clear">Limpar</button></div></form>`;
  const list = radar.error ? `<div class="notice warn">${esc(radar.error)} <button class="link" data-action="radar-retry">Tentar novamente</button></div>`
    : !d ? '<p class="muted" role="status">Carregando processos…</p>'
    : d.items.length ? processList(d.items)
    : `<div class="empty"><h2>Nenhum processo encontrado</h2><p class="muted">${Object.values(f).some(Boolean) ? 'Nenhum processo coletado corresponde aos filtros. Isso não significa que não existam processos: o Radar mostra apenas as fontes já integradas.' : 'Ainda não há processos coletados das fontes integradas.'}</p></div>`;
  return head('Radar de residências', 'Processos seletivos de fontes oficiais, com link para o documento de origem.', '<a class="btn secondary" href="#residencias">Minhas residências</a>')
    + `${d?.personalization ? `<div class="notice">${esc(d.personalization.note)}</div>` : state.profile?.specialty ? '' : '<div class="notice">Defina uma especialidade em Minha meta para destacar os processos que a citam.</div>'}`
    + `<div class="grid cols radar-layout"><div><section class="card">${filters}</section><div class="process-list">${list}</div></div><section class="card" style="align-self:start"><h2>Fontes integradas</h2>${sources.length ? sources.map(s => `<div class="task"><span class="task-number">${s.automated ? '⟳' : '✎'}</span><div class="task-content"><strong class="small">${esc(s.name)}</strong><p>${esc(s.organization)} · ${s.automated ? 'coleta automática' : 'verificação manual'} · ${s.lastCheckedAt ? `verificada em ${fmtDate(s.lastCheckedAt)}` : 'ainda não verificada'}${s.lastStatus && s.lastStatus !== 'OK' ? ` · <span class="na">${esc(s.lastStatus === 'UNAVAILABLE' ? 'fonte indisponível na última tentativa' : 'erro na última coleta')}</span>` : ''}</p><a class="link small" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Abrir fonte ↗</a></div></div>`).join('') : '<p class="muted small">Nenhuma fonte cadastrada.</p>'}<p class="muted small">O Radar não cobre todos os processos do país. Dados ausentes no documento oficial aparecem como “não informado”. Datas e vagas podem mudar por retificação: confirme sempre no edital antes de se inscrever. O MedAI não faz inscrições.</p></section></div>`;
}

function loadProcess(id) {
  if (processView.id === id && (processView.data || processView.loading || processView.error)) return;
  processView = { id, data: null, loading: true, error: null, specialty: null };
  api.radarDetail(id).then(d => { processView.data = d; }).catch(e => { processView.error = e.message; }).finally(() => { processView.loading = false; if (location.hash === '#processo') render(); });
}
const FIELD_LABEL = { registration_start: 'Início das inscrições', registration_end: 'Fim das inscrições', exam_date: 'Data da prova', fee: 'Taxa de inscrição', total_vacancies: 'Total de vagas', prerequisite: 'Pré-requisito', published_at: 'Publicação', stages: 'Etapas', year: 'Ano' };
const CHANGE_LABEL = { NOVO_PROCESSO: 'Processo identificado', NOVO_EDITAL: 'Novo documento', EDITAL_RETIFICADO: 'Edital retificado', INSCRICOES_ABERTAS: 'Inscrições abertas', INSCRICOES_ENCERRADAS: 'Inscrições encerradas', DATA_ALTERADA: 'Data alterada', CAMPO_ALTERADO: 'Dado alterado', RESULTADO_PUBLICADO: 'Resultado publicado', REMOVIDO_DA_FONTE: 'Não aparece mais na fonte' };
function programsBlock(p) {
  if (!p.programs.length) return `<p class="muted">Lista de programas e vagas: ${NA}. Consulte o edital.</p>`;
  const sel = processView.specialty ?? (state.profile?.specialtyId && p.specialtySummary.some(s => s.specialtyId === state.profile.specialtyId) ? state.profile.specialtyId : p.specialtySummary[0].specialtyId);
  const rows = p.programs.filter(x => x.specialtyId === sel);
  return `<label class="field" style="max-width:420px">Especialidade<select data-change="program-specialty">${p.specialtySummary.map(s => `<option value="${esc(s.specialtyId)}" ${s.specialtyId === sel ? 'selected' : ''}>${esc(s.specialty)} · ${plural(s.programs, 'programa', 'programas')}${s.vacancies !== null ? ` · ${s.vacancies} vagas` : ''}</option>`).join('')}</select></label><div class="table-wrap"><table class="data-table"><thead><tr><th>Programa / instituição</th><th>Local</th><th>Duração</th><th>Requisito</th><th>Vagas</th></tr></thead><tbody>${rows.map(x => `<tr><td>${esc(x.specialty)}${x.institution ? `<br><span class="muted small">${esc(x.institution)}</span>` : ''}</td><td>${x.city || x.uf ? esc([x.city, x.uf].filter(Boolean).join('/')) : NA}</td><td>${val(x.duration)}</td><td>${val(x.prerequisite)}</td><td>${x.vacancies === null || x.vacancies === undefined ? NA : x.vacancies}</td></tr>`).join('')}</tbody></table></div><p class="muted small">Lista conforme o documento oficial. A presença de uma especialidade não confirma que você atende aos pré-requisitos.</p>`;
}
function processPage() {
  const id = ui.processId;
  if (!id) return head('Processo seletivo', 'Escolha um processo no Radar.', button('Abrir Radar', 'radar'));
  loadProcess(id);
  if (processView.error) return head('Processo seletivo', esc(processView.error), button('Voltar ao Radar', 'radar', 'secondary'));
  const p = processView.data;
  if (!p) return head('Processo seletivo', 'Carregando…', button('Voltar ao Radar', 'radar', 'secondary'));
  const [reg, cls] = REG_LABEL[p.registrationState] || REG_LABEL.UNKNOWN;
  const fieldsRows = p.fields.length ? p.fields.map(f => `<tr><td>${esc(FIELD_LABEL[f.field] || f.field)}</td><td>${f.status === 'ACCEPTED' ? '<span class="pill ok">aceito</span>' : f.status === 'NEEDS_REVIEW' ? '<span class="pill amber">verificação manual</span>' : '<span class="pill grey">não encontrado</span>'}</td><td class="evidence">${f.evidence ? `“${esc(f.evidence)}”` : '—'}</td><td><a class="link" href="${esc(f.sourceUrl)}" target="_blank" rel="noopener noreferrer">documento ↗</a></td></tr>`).join('') : '';
  return head(esc(p.name), `${val(p.institution?.name)}${p.institution?.uf ? ` · ${esc(p.institution.uf)}` : ''}`, button('Voltar ao Radar', 'radar', 'secondary'))
    + `<div class="grid cols"><section class="card"><div class="row"><span class="pill ${cls}">${reg}</span>${p.reviewStatus === 'NEEDS_REVIEW' ? '<span class="pill amber">Dados em verificação</span>' : ''}</div><dl class="process-facts wide"><div><dt>Instituição</dt><dd>${val(p.institution?.name)}</dd></div><div><dt>Ano</dt><dd>${val(p.year)}</dd></div><div><dt>Tipo</dt><dd>${val(p.type)}</dd></div><div><dt>Inscrições</dt><dd>${period(p)}</dd></div><div><dt>Prova</dt><dd>${val(p.examDate, fmtDay)}</dd></div><div><dt>Taxa</dt><dd>${val(p.feeCents, money)}</dd></div><div><dt>Vagas</dt><dd>${vacancyText(p) ? esc(vacancyText(p)) : NA}</dd></div><div><dt>Publicação</dt><dd>${val(p.publishedAt, fmtDay)}</dd></div><div><dt>Pré-requisito</dt><dd>${p.prerequisite ? esc(p.prerequisite) : p.fields.find(f => f.field === 'prerequisite' && /varia/i.test(f.evidence || '')) ? 'Varia por programa (ver lista)' : NA}</dd></div><div><dt>Etapas</dt><dd>${Array.isArray(p.stages) && p.stages.length ? esc(p.stages.join(' · ')) : NA}</dd></div></dl>`
    + `<h2 style="margin-top:26px">Programas e especialidades</h2>${programsBlock(p)}`
    + `${fieldsRows ? `<h2 style="margin-top:26px">Evidências da extração</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>Dado</th><th>Situação</th><th>Trecho do documento</th><th>Origem</th></tr></thead><tbody>${fieldsRows}</tbody></table></div>` : ''}</section>`
    + `<section class="card" style="align-self:start"><h2>Fonte oficial</h2><p class="small">${esc(p.source.name)} · ${esc(p.source.organization)}</p><p class="muted small">Última verificação: ${p.lastVerifiedAt ? fmtDate(p.lastVerifiedAt) : 'não verificada'}</p><div class="actions"><a class="btn teal" href="${esc(p.officialUrl)}" target="_blank" rel="noopener noreferrer">VER FONTE OFICIAL ↗</a>${p.tracked ? `<button class="btn secondary" data-action="untrack" data-id="${esc(p.id)}">Deixar de acompanhar</button>` : `<button class="btn" data-action="track" data-id="${esc(p.id)}">ACOMPANHAR</button>`}</div><h3 style="margin-top:22px">Documentos</h3>${p.notices.length ? p.notices.map(n => `<div class="task"><span class="task-number">⎙</span><div class="task-content"><a class="link small" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)} ↗</a><p>${esc(n.kind)}${n.publishedAt ? ` · ${fmtDay(n.publishedAt)}` : ''}</p></div></div>`).join('') : `<p class="muted small">Documentos: ${NA}</p>`}<h3 style="margin-top:22px">Histórico de alterações</h3>${p.changes.length ? p.changes.map(c => `<div class="subtopic"><span>${esc(CHANGE_LABEL[c.type] || c.type)}${c.field ? ` · ${esc(FIELD_LABEL[c.field] || c.field)}` : ''}</span><span class="muted small">${fmtDate(c.detectedAt)}${c.detail ? ` · ${esc(c.detail)}` : ''}</span></div>`).join('') : '<p class="muted small">Nenhuma alteração registrada.</p>'}<p class="muted small">O MedAI não faz inscrições. Confirme datas, vagas e requisitos no edital.</p></section></div>`;
}

function loadTracked(force = false) {
  if (tracked.loading || (tracked.data && !force)) return;
  tracked.loading = true; tracked.error = null;
  api.tracked().then(d => { tracked.data = d; }).catch(e => { tracked.error = e.message; }).finally(() => { tracked.loading = false; if (location.hash === '#residencias') render(); });
}
function trackedPage() {
  loadTracked();
  const d = tracked.data;
  const body = tracked.error ? `<div class="notice warn">${esc(tracked.error)}</div>` : !d ? '<p class="muted" role="status">Carregando…</p>' : d.items.length ? processList(d.items) : `<div class="empty"><h2>Nenhum processo acompanhado</h2><p class="muted">Use o Radar para acompanhar processos seletivos do seu interesse.</p>${button('Abrir Radar', 'radar')}</div>`;
  return head('Minhas residências', 'Os processos que você acompanha, com datas e situação conforme a fonte oficial.', button('Abrir Radar', 'radar', 'secondary')) + `<div class="process-list narrow">${body}</div>`;
}

// ---------- Minha meta e dados ----------
function metaPage() {
  const p = { ...state.profile, ...(formErrors.__draft || {}) };
  return head('Minha meta', 'Seu objetivo orienta o ritmo da preparação.') + `<div class="grid cols">${metaForm(p, formErrors)}<div style="display:grid;gap:22px;align-self:start"><section class="card"><span class="eyebrow">SEUS DADOS</span><h2 style="margin-top:16px">Privacidade</h2><p class="muted small">Guardamos: e-mail, senha protegida por hash (scrypt), sua meta de estudo, respostas, sessões, revisões, o mapa de domínio calculado e os processos que você acompanha. Não coletamos documentos pessoais nem dados de pacientes.</p><div class="actions"><a class="btn secondary" href="/api/me/export" download="medai-meus-dados.json">Baixar meus dados (JSON)</a></div></section>`
    + `<section class="card danger-zone"><span class="eyebrow">RECOMEÇAR</span><h2 style="margin-top:16px">Apagar meus dados de estudo</h2><p class="muted small">Apaga meta, respostas, revisões, sessões, caderno de erros e mapa de domínio. Mantém sua conta e Minhas residências. Dados antigos salvos neste navegador não são reimportados automaticamente.</p>${resetOpen ? `<form id="reset" class="reset-confirm"><label class="field">Digite RESETAR para confirmar<input name="confirm" autocomplete="off" required aria-describedby="reset-help"></label><span id="reset-help" class="muted small">Esta ação não pode ser desfeita.</span><div class="actions"><button class="btn danger" type="submit">Apagar meus dados de estudo</button><button class="btn secondary" type="button" data-action="reset-cancel">Cancelar</button></div></form>` : '<button class="btn secondary" data-action="reset-open">Apagar dados de estudo…</button>'}`
    + `<h2 style="margin-top:26px">Excluir minha conta</h2><p class="muted small">Exclui definitivamente a conta e todos os dados associados.</p>${deleteOpen ? `<form id="delete-account" class="reset-confirm"><label class="field">Digite EXCLUIR<input name="confirm" autocomplete="off" required></label><label class="field">Sua senha<input type="password" name="password" autocomplete="current-password" required></label><div class="actions"><button class="btn danger" type="submit">Excluir conta</button><button class="btn secondary" type="button" data-action="delete-cancel">Cancelar</button></div></form>` : '<button class="btn secondary" data-action="delete-open">Excluir conta…</button>'}</section></div></div>`;
}

// ---------- Render ----------
function render() {
  if (phase === 'loading') { root.innerHTML = loadingPage(); return; }
  if (phase === 'error') { root.innerHTML = errorPage(); return; }
  if (phase === 'auth') { root.innerHTML = authPage(); return; }
  let route = location.hash.slice(1) || 'dashboard';
  if (!state.profile) route = 'onboarding';
  if (route === 'questao' && sessionActive() && currentResponse(state) === undefined && !state.session.shownAt[state.session.index]) {
    const key = state.session.id + ':' + state.session.index;
    if (shownRequested !== key) { shownRequested = key; api.markShown().then(r => { if (r?.state) state = r.state; }).catch(() => {}); }
  }
  const views = { dashboard, onboarding: () => onboardingView(state.onboarding, formErrors), meta: metaPage, sessao: sessionPage, questao: questionPage, correcao: () => questionPage(true), tutor: tutorPage, desempenho: performance, tema: topicPage, revisoes: reviewsPage, simulados: simuladosPage, 'simulado-correcao': simReviewPage, resultado: resultPage, radar: radarPage, processo: processPage, residencias: trackedPage };
  const prevScroll = window.scrollY;
  root.innerHTML = shell(views[route] ? views[route]() : head('Página não encontrada', 'Volte à sua preparação.', button('Ir à visão geral', 'dashboard')), route);
  if (render.lastRoute !== route) window.scrollTo(0, 0); else window.scrollTo(0, prevScroll);
  render.lastRoute = route;
}

function startSession(type, topicKey) {
  return run(() => api.startSession(type, topicKey), () => { selected = null; messages = []; lastFeedback = null; go('questao'); });
}
function startRecommended(force = false) {
  if (!force && sessionActive()) { go(currentResponse(state) !== undefined && state.session.kind !== 'simulado' ? 'correcao' : 'questao'); return; }
  startSession('recommended');
}

function onboardingData(form) { const d = Object.fromEntries(new FormData(form)); for (const k of ['year', 'hours']) if (k in d) d[k] = d[k] === '' ? '' : Number(d[k]); return d; }

document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'auth') {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    authErrors = {}; authMessage = '';
    if (busy) return;
    busy = true;
    (authMode === 'register' ? api.register(d.email, d.password) : api.login(d.email, d.password))
      .then(async r => { user = r.user; await loadAccount(); phase = 'ready'; go('dashboard'); })
      .catch(err => { authErrors = err.data?.errors || {}; authMessage = err.message; })
      .finally(() => { busy = false; render(); if (Object.keys(authErrors).length) document.querySelector('#auth [aria-invalid=true]')?.focus(); });
    return;
  }
  if (f.id === 'onboarding') {
    e.preventDefault();
    const step = Number(f.dataset.step), data = onboardingData(f);
    if (step < 3) {
      const draft = { ...state.onboarding.draft, ...data }, errors = validateGoal(draft, now(), step);
      formErrors = errors;
      run(() => api.saveDraft(Object.keys(errors).length ? step : step + 1, data), () => { if (Object.keys(errors).length) setTimeout(() => document.querySelector('[aria-invalid=true]')?.focus()); });
      return;
    }
    run(() => api.confirmProfile(), () => { formErrors = {}; go('dashboard'); toast('Seu plano de estudo foi criado.'); }).then(r => {
      if (!r && Object.keys(formErrors).length) run(() => api.saveDraft(formErrors.name || formErrors.exam || formErrors.year || formErrors.specialty ? 1 : 2, {}));
    });
    return;
  }
  if (f.id === 'profile') {
    e.preventDefault();
    const data = onboardingData(f), errors = validateGoal(data, now());
    if (Object.keys(errors).length) { formErrors = { ...errors, __draft: data }; render(); document.querySelector('[aria-invalid=true]')?.focus(); return; }
    run(() => api.updateProfile(data), () => { formErrors = {}; radar.key = null; go('dashboard'); toast('Sua meta foi atualizada. Seu histórico foi mantido.'); });
    return;
  }
  if (f.id === 'reset') {
    e.preventDefault();
    const confirm = String(new FormData(f).get('confirm')).trim().toUpperCase();
    if (confirm !== 'RESETAR') { toast('Digite RESETAR para confirmar. Nada foi apagado.'); return; }
    run(() => api.reset(confirm), () => { resetOpen = false; formErrors = {}; selected = null; messages = []; go('onboarding'); toast('Seus dados de estudo foram apagados. Configure um novo objetivo.'); });
    return;
  }
  if (f.id === 'delete-account') {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    run(() => api.deleteAccount(d.confirm, d.password), () => { deleteOpen = false; user = null; state = null; phase = 'auth'; authMessage = 'Sua conta foi excluída.'; go('dashboard'); });
    return;
  }
  if (f.id === 'radar-filters') {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    radar.filters = { specialty: d.specialty || '', institution: d.institution || '', uf: d.uf || '', year: d.year || '', open: !!d.open };
    render();
    return;
  }
  if (f.id === 'chat') { e.preventDefault(); const text = String(new FormData(f).get('message') || '').trim(); if (text) chatSend(text); }
});

// Rascunho do onboarding salvo no servidor a cada alteração de campo.
document.addEventListener('change', e => {
  if (e.target.dataset.change === 'program-specialty') { processView.specialty = e.target.value; render(); return; }
  const f = e.target.closest('#onboarding');
  if (f) api.saveDraft(state.onboarding.step, onboardingData(f)).then(r => { if (r?.state) state = { ...r.state, onboarding: { ...r.state.onboarding } }; offline = false; }).catch(err => { if (err.offline) { offline = true; render(); } });
});

function refreshRadarViews() { radar.key = null; tracked.data = null; processView = { id: null, data: null, loading: false, error: null }; }

document.addEventListener('click', e => {
  const lockedLink = e.target.closest('[data-locked]');
  if (lockedLink) { e.preventDefault(); toast(`Conclua a configuração inicial (etapa ${state.onboarding.step} de 3) para liberar esta área. O que você já preencheu está salvo.`); return; }
  const el = e.target.closest('[data-action],[data-answer],[data-prompt],[data-topic]');
  if (!el) return;
  if (el.dataset.answer !== undefined) { if (currentResponse(state) !== undefined || busy) return; selected = Number(el.dataset.answer); render(); return; }
  if (el.dataset.prompt) { chatSend(el.dataset.prompt); return; }
  if (el.dataset.topic !== undefined) { e.preventDefault(); saveUi({ topicKey: el.dataset.topic }); go('tema'); return; }
  switch (el.dataset.action) {
    case 'reboot': boot(); break;
    case 'reload-state': run(() => api.state(), () => { offline = false; }); break;
    case 'auth-toggle': authMode = authMode === 'login' ? 'register' : 'login'; authErrors = {}; authMessage = ''; render(); break;
    case 'logout': api.logout().catch(() => {}).finally(() => { user = null; state = null; phase = 'auth'; authMessage = ''; refreshRadarViews(); render(); }); break;
    case 'onb-back': { const f = document.querySelector('#onboarding'); formErrors = {}; run(() => api.saveDraft(Math.max(1, state.onboarding.step - 1), onboardingData(f))); break; }
    case 'start': startRecommended(); break;
    case 'restart': startRecommended(true); break;
    case 'directed': startSession('directed', el.dataset.topicKey); break;
    case 'mock': startSession('simulado'); break;
    case 'confirm': {
      if (selected === null || currentResponse(state) !== undefined) return;
      const s = state.session, choice = selected;
      run(() => api.answer(s.index, choice), r => {
        if (r.duplicate) return;
        const node = knowledge().nodes[r.answer.topicKey], ch = r.reviewChange;
        const note = ch?.type === 'created' ? `${r.answer.topic} entrou na sua fila de revisão: ${ch.reason.toLowerCase()} (${ch.detail}).`
          : ch?.type === 'escalated' ? `Erro recorrente em ${r.answer.topic}: a revisão foi antecipada para hoje.`
          : ch?.type === 'shortened' ? `Novo erro em ${r.answer.topic}: o intervalo da próxima revisão foi reduzido.`
          : !r.answer.correct && node.questionsAnswered > 1 && !node.recurrentError ? `Erro registrado no caderno. ${node.recentErrors > 1 ? '' : 'Por ser um erro isolado, ele ajusta a prioridade sem criar revisão.'}` : '';
        lastFeedback = { answerId: r.answer.id, note };
        selected = null;
        if (state.session.kind !== 'simulado') go('correcao');
      });
      break;
    }
    case 'next': {
      if (currentResponse(state) === undefined) return;
      const index = state.session.index;
      run(() => api.advance(index), () => { selected = null; messages = []; go('questao'); });
      break;
    }
    case 'finish': run(() => api.finish(), () => { go('resultado'); }); break;
    case 'understood': { const q = currentQuestion(state); run(() => api.contentReviewed(q.id), () => toast('Marcado como conteúdo revisado. Seu domínio só muda quando você acertar questões deste assunto depois.')); break; }
    case 'review': { const q = currentQuestion(state); run(() => api.saveForReview(q.id), r => toast(r.created ? 'Assunto salvo na sua fila de revisão.' : 'Este assunto já está na sua fila de revisão.')); break; }
    case 'sim-review': saveUi({ simSession: el.dataset.session }); go('simulado-correcao'); break;
    case 'import-local': {
      const offer = localOffer;
      run(() => api.importLocal(offer.key, offer.raw), r => {
        markLocalProgress(offer.fingerprint, 'imported'); localOffer = { ...offer, imported: true };
        toast(r.import.status === 'already-imported' ? 'Estes dados já tinham sido importados para sua conta.' : `Importação concluída: ${plural(r.import.answers, 'resposta', 'respostas')}. A cópia do navegador foi mantida.`);
      });
      break;
    }
    case 'import-dismiss': markLocalProgress(localOffer.fingerprint, 'dismissed'); localOffer = { ...localOffer, dismissed: true }; render(); toast('Tudo bem. Os dados continuam salvos neste navegador.'); break;
    case 'reset-open': resetOpen = true; render(); document.querySelector('#reset input')?.focus(); break;
    case 'reset-cancel': resetOpen = false; render(); break;
    case 'delete-open': deleteOpen = true; render(); document.querySelector('#delete-account input')?.focus(); break;
    case 'delete-cancel': deleteOpen = false; render(); break;
    case 'radar-clear': radar.filters = { specialty: '', uf: '', institution: '', open: false, year: '' }; render(); break;
    case 'radar-retry': radar.key = null; render(); break;
    case 'process': saveUi({ processId: el.dataset.id }); processView = { id: null, data: null, loading: false, error: null }; go('processo'); break;
    case 'track': case 'untrack': {
      const id = el.dataset.id, on = el.dataset.action === 'track';
      run(() => on ? api.track(id, state.profile?.specialty || null) : api.untrack(id), d => {
        tracked.data = d; radar.key = null; processView = { id: null, data: null, loading: false, error: null };
        toast(on ? 'Processo adicionado a Minhas residências.' : 'Processo removido de Minhas residências.');
      });
      break;
    }
  }
});

if (document.modelContext?.registerTool) { try { Promise.resolve(document.modelContext.registerTool({ name: 'navigate_medai', title: 'Abrir área do MedAI', description: 'Navega para uma área do MedAI sem responder questões ou alterar o progresso.', inputSchema: { type: 'object', properties: { page: { type: 'string', enum: nav.map(n => n[0]) } }, required: ['page'], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: async input => { if (!input || !nav.some(n => n[0] === input.page)) throw Error('Página inválida'); if (phase !== 'ready' || !state.profile) throw Error('Entre na conta e conclua o onboarding primeiro'); go(input.page); return { page: input.page }; } })).catch(() => {}); } catch {} }

window.addEventListener('hashchange', () => { selected = null; if (location.hash !== '#meta') { formErrors = {}; resetOpen = false; deleteOpen = false; } render(); });
boot();
