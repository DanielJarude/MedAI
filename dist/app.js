// Coordenação da interface: rotas, telas e eventos. Regras ficam nos módulos de modelo/motor.
import { ADAPTIVE_CONFIG } from './adaptive-config.js';
import { QUESTIONS, QUESTION_BY_ID, TAXONOMY, DEMO_INDICATORS } from './demo-data.js';
import { DAY, MASTERY_STATES, TRENDS, toMs, isPersonal, childrenOf, errorNotebook } from './knowledge-model.js';
import { reviewStatus, REVIEW_STATUS, startOfDay } from './review-scheduler.js';
import { BUCKETS, buildSessionPlan, directedPlan, simuladoPlan, computePriorities, todayFocus, buildTutorContext, masteryLabel, trendLabel, personalAnswerCount } from './adaptive-engine.js';
import { saveDraft, validateGoal, confirmProfile, updateProfile, startSession, markShown, currentQuestion, currentResponse, currentItem, recordAnswer, advanceSession, finishSession, markContentReviewed, saveForReview, refreshKnowledge } from './profile-model.js';
import { createRepository } from './profile-repository.js';
import { esc, onboardingView, metaForm } from './onboarding-view.js';

const root = document.querySelector('#app');
const brand = '<div class="brand"><b class="mark">⌁</b><div>Med<span>AI</span></div></div>';
const nav = [['dashboard', 'Visão geral', '◫'], ['sessao', 'Sessão de estudo', '▤'], ['desempenho', 'Desempenho', '▥'], ['revisoes', 'Revisões', '↻'], ['simulados', 'Simulados', '▧'], ['meta', 'Minha meta', '◎'], ['assinatura', 'Assinatura', '◇']];
const LETTERS = 'ABCD';
const now = () => Date.now();
const pct = x => Math.round(x * 100);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fmtDate = x => x ? new Date(toMs(x)).toLocaleDateString('pt-BR') : '—';

function browserStorage() {
  try { const s = window.localStorage; s.getItem('medai-v3'); return s; }
  catch (error) { return { getItem() { throw error; }, setItem() { throw error; }, removeItem() { throw error; } }; }
}
const repo = createRepository(browserStorage());
const loaded = repo.load(now());
let fatal = loaded.status === 'error' ? loaded : null;
let state = loaded.state, app = loaded.app;
let selected = null, messages = [], formErrors = {}, resetOpen = false, lastFeedback = null, unsaved = false;

function persist() {
  const r = repo.save(state);
  unsaved = !r.ok;
  if (!r.ok) toast('O navegador não permitiu salvar seu progresso. Ele continua nesta aba.', true);
  return r.ok;
}
function persistApp() { if (!repo.saveApp(app).ok) toast('Não foi possível salvar a preferência da demonstração.'); }
function go(route) { location.hash = route; }
function toast(text, retry = false) {
  const el = document.querySelector('#toast');
  el.innerHTML = esc(text) + (retry ? ' <button class="link toast-action" data-action="retry-save">Tentar novamente</button>' : '');
  el.classList.add('show'); clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.remove('show'), retry ? 8000 : 3800);
}
const button = (label, route, kind = '') => `<a class="btn ${kind}" href="#${route}">${label}</a>`;
const head = (title, sub, action = '') => `<div class="page-head"><div><h1>${title}</h1><p class="muted">${sub}</p></div>${action}</div>`;
const stateClass = s => ({ [MASTERY_STATES.CONSISTENT]: 'ok', [MASTERY_STATES.DEVELOPING]: '', [MASTERY_STATES.FRAGILE]: 'amber', [MASTERY_STATES.STARTING]: 'grey', [MASTERY_STATES.NONE]: 'grey' })[s] ?? '';
const trendClass = t => ({ [TRENDS.UP]: 'up', [TRENDS.DOWN]: 'down', [TRENDS.STABLE]: 'flat' })[t] || 'none';
// Com poucos dados (INICIANDO) a barra fica neutra para não sugerir uma certeza inexistente.
const masteryBar = node => node.questionsAnswered && node.currentMastery !== null && node.state !== MASTERY_STATES.STARTING ? `<div class="bar" role="img" aria-label="Domínio ${pct(node.currentMastery)}%"><span style="width:${pct(node.currentMastery)}%"></span></div>` : '<div class="bar empty" aria-hidden="true"></div>';
const displayName = () => state?.profile?.name || state?.onboarding?.draft?.name || 'Estudante';
const personalAnswers = () => state.answers.filter(isPersonal);
const knowledge = () => state.knowledge;

// ---------- Estrutura ----------
function shell(content, route) {
  const locked = !state.profile;
  return `<aside>${brand}<div class="nav-caption">SUA PREPARAÇÃO</div><nav>${nav.map(([id, label, icon]) => `<a href="#${id}" class="${route === id ? 'active' : ''} ${locked ? 'locked' : ''}" ${route === id ? 'aria-current="page"' : ''} ${locked ? 'aria-disabled="true" data-locked="1"' : ''}><span class="nav-icon">${icon}</span>${label}${locked ? '<span class="lock" aria-hidden="true">🔒</span>' : ''}</a>`).join('')}</nav><div class="nav-bottom"><div class="notice small">Um passo por dia.<br>Uma residência no horizonte.</div></div><div class="profile"><div class="avatar">${esc(displayName().slice(0, 2).toUpperCase())}</div><div><strong class="small">${esc(displayName())}</strong><br><button class="link" data-action="logout">Sair da demonstração</button></div></div></aside><div class="workspace"><header class="topbar"><span>Seu caminho até a residência</span><div class="top-meta"><span>${state.profile ? `${esc(state.profile.exam)} · ${esc(state.profile.year)}` : 'Configuração inicial'}</span><span class="pill">VERSÃO DEMONSTRATIVA</span></div></header><main>${unsaved ? '<div class="notice warn">Há alterações ainda não salvas neste navegador. <button class="link" data-action="retry-save">Tentar salvar novamente</button></div>' : ''}${content}<footer class="footer"><span>MedAI · Aprender. Conectar. Evoluir.</span><span>Questões autorais demonstrativas · Conteúdo educacional, sem uso clínico.</span></footer></main></div>`;
}

function recoveryPage() {
  const why = fatal.reason === 'storage' ? 'O navegador bloqueou o acesso ao armazenamento local (modo privado ou permissões).' : fatal.reason === 'newer' ? `Os dados foram gravados por uma versão mais nova do MedAI (schema ${esc(fatal.schemaVersion)}).` : 'O registro local não pôde ser lido (formato inválido).';
  return `<div class="auth"><section class="auth-story">${brand}<div><div class="eyebrow" style="color:#8dded4">RECUPERAÇÃO</div><h1>Seus dados foram<br>preservados.</h1><p>Nada foi apagado ou sobrescrito.</p></div><small>MedAI</small></section><section class="auth-form"><div class="form-wrap"><span class="eyebrow">NÃO FOI POSSÍVEL CARREGAR</span><h1 style="margin-top:20px">Vamos tentar de novo?</h1><p class="muted">${why}</p><div class="notice">O MedAI não grava nada enquanto esta tela estiver aberta, para não substituir o registro original.</div><button class="btn full" data-action="reload">Tentar novamente</button></div></section></div>`;
}

function login() {
  return `<div class="auth"><section class="auth-story">${brand}<div><div class="eyebrow" style="color:#8dded4">PREPARAÇÃO PARA RESIDÊNCIA</div><h1>Conhecimento que<br>se transforma<br>em conquista.</h1><p>Questões, revisão e uma visão clara do que estudar a seguir.</p></div><small>MedAI · Seu próximo capítulo começa aqui.</small></section><section class="auth-form"><div class="form-wrap"><span class="eyebrow">BEM-VINDO AO MEDAI</span><h1 style="margin-top:20px">Vamos estudar?</h1><p class="muted">Explore sua preparação em uma conta demonstrativa.</p><form id="login"><label class="field">Como podemos chamar você?<input name="name" required maxlength="35" placeholder="Seu primeiro nome" autocomplete="given-name" value="${esc(state.onboarding.draft.name || state.profile?.name || '')}"></label><button class="btn full" type="submit">Entrar na demonstração</button></form><div class="notice">Sem senha ou cadastro real. Use um nome fictício. Seu progresso fica apenas neste navegador.</div><p class="muted small">Conteúdo de exemplo para explorar a experiência. Não substitui material de referência ou orientação clínica.</p></div></section></div>`;
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

function focusBlock() {
  const f = todayFocus(state, knowledge(), now());
  if (!f.items.length) return `<div class="empty compact"><p class="muted">${esc(f.message)}</p></div>`;
  return `${f.message ? `<p class="muted small">${esc(f.message)}</p>` : ''}<ol class="focus-list">${f.items.map((p, i) => `<li><span class="task-number">${i + 1}</span><div class="task-content"><a class="focus-topic" href="#tema" data-topic="${esc(p.topicKey)}">${esc(p.topic)}</a> <span class="pill ${p.level === 'alta' ? 'amber' : 'grey'}">Prioridade ${p.level}</span><p>${esc(p.priorityReason)}${p.reasons[1] ? ` · ${esc(p.reasons[1].label)}` : ''}</p></div></li>`).join('')}</ol>`;
}

function dashboard() {
  const answers = personalAnswers(), correct = answers.filter(a => a.correct).length;
  const weekStart = startOfDay(now()) - ((new Date().getDay() + 6) % 7) * DAY;
  const thisWeek = answers.filter(a => toMs(a.at) >= weekStart).length;
  const pending = state.reviews.filter(r => r.source === 'user' && r.status === 'pending');
  const dueToday = pending.filter(r => reviewStatus(r, now()) !== REVIEW_STATUS.PENDING).length;
  const plan = sessionActive() ? null : currentPlan();
  const items = plan ? plan.items : state.session.items;
  const priorityTopics = new Set(items.filter(i => i.bucket === 'review' || i.bucket === 'high').map(i => i.topicKey));
  const focusNames = [...new Set(items.filter(i => priorityTopics.has(i.topicKey)).map(i => QUESTION_BY_ID.get(i.questionId).topic))];
  const heroText = sessionActive() ? `Sessão em andamento: questão ${state.session.index + 1} de ${state.session.items.length}.` : plan.personalized ? (focusNames.length ? `Hoje, vamos fortalecer ${focusNames.slice(0, 2).join(' e ')}, com revisão e manutenção dos demais assuntos.` : 'Hoje, uma sessão para desenvolver assuntos em evolução e manter os consistentes.') : plan.message;
  const st = streak(), j = journey(), days = activeDays(), monday = weekStart;
  return head(`Seu próximo passo, ${esc(displayName())}.`, 'Consistência hoje. Mais confiança no dia da prova.', st ? `<span class="pill amber">${plural(st, 'dia', 'dias')} de constância</span>` : '')
    + `<div class="grid cols"><section class="card session-hero"><span class="pill">${sessionActive() ? 'EM ANDAMENTO' : plan.personalized ? 'SELECIONADA PARA VOCÊ' : 'MAPEAMENTO INICIAL'}</span><h2>Seu conhecimento merece<br>uma direção.</h2><p class="muted">${esc(heroText)}</p><div class="session-stats"><div><strong>${items.length}</strong><span>questões selecionadas</span></div><div><strong>${minutesFor(items.length)} min</strong><span>de estudo focado</span></div><div><strong>${priorityTopics.size || new Set(items.map(i => i.topicKey)).size}</strong><span>${priorityTopics.size ? 'temas prioritários' : 'assuntos variados'}</span></div></div><button class="btn" data-action="start">${sessionActive() ? 'Continuar minha sessão' : 'INICIAR SESSÃO RECOMENDADA'}</button></section>`
    + `<section class="card"><div class="row"><h2>Sua próxima conquista</h2><span>◎</span></div><p class="muted small">${esc(state.profile.exam)} · ${esc(state.profile.year)}</p><div class="row"><div><strong style="font-size:2.8rem;font-weight:600">${daysUntil()}</strong><p class="muted small">dias até sua data-meta</p></div><div class="ring" style="background:conic-gradient(#0c8a89 0 ${Math.round(j * 360)}deg,#e8eff2 ${Math.round(j * 360)}deg)"><div><strong>${pct(j)}%</strong><small>do caminho</small></div></div></div><div class="bar"><span style="width:${pct(j)}%"></span></div><p class="muted small" style="margin:15px 0 0">Tempo decorrido desde a criação do plano até a data-meta estimada por você, sem vínculo com edital.</p></section></div>`
    + `<div class="grid metrics">${[['Questões respondidas', answers.length.toLocaleString('pt-BR'), answers.length ? `+ ${thisWeek} nesta semana` : 'Seu histórico começa aqui'], ['Taxa de acerto', answers.length ? pct(correct / answers.length) + '%' : '—', answers.length ? `${correct} acertos · ${answers.length - correct} erros` : 'Sem respostas ainda'], ['Tempo em questões', studyTime(), `Meta: ${state.profile.hours}h por semana`], ['Revisões pendentes', String(pending.length), pending.length ? `${dueToday} para hoje ou atrasadas` : 'Nenhuma pendência']].map(([l, v, d], i) => `<div class="card metric"><span class="muted small">${l}</span><strong>${v}</strong><p class="${i === 0 && answers.length ? 'delta' : ''}">${d}</p></div>`).join('')}</div>`
    + `<div class="grid cols"><section class="card"><div class="row section-title"><h2 style="margin:0">Seu domínio por área</h2><a class="link" href="#desempenho">Explorar mapa</a></div>${TAXONOMY.map(a => { const n = knowledge().nodes[a.key]; return `<div class="area"><div class="row"><span>${esc(a.label)}</span><strong class="small">${esc(masteryLabel(n))}</strong></div>${masteryBar(n)}</div>`; }).join('')}<p class="small muted" style="margin-bottom:0">Domínio = métrica interna de preparação calculada com suas respostas neste navegador. Não é probabilidade de aprovação.</p></section>`
    + `<section class="card"><div class="row"><h2>Foco de hoje</h2><span class="pill">${state.profile.hours} h/sem</span></div>${focusBlock()}<div class="week" aria-label="Dias com prática nesta semana">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => { const day = monday + i * DAY, done = days.has(day), future = day > startOfDay(now()); return `<div class="day ${future ? 'future' : ''}">${d}<i>${done ? '✓' : '·'}</i></div>`; }).join('')}</div><div class="actions" style="margin-top:6px"><button class="btn teal" data-action="start">${sessionActive() ? 'Continuar sessão' : 'INICIAR SESSÃO RECOMENDADA'}</button><a href="#revisoes" class="link" style="align-self:center">Ver minhas revisões</a></div></section></div>`;
}

// ---------- Sessão ----------
function sessionPage() {
  if (sessionActive()) {
    const s = state.session;
    return head('Seu estudo de hoje', 'Um ciclo curto: praticar, compreender e revisar.') + `<section class="card" style="max-width:850px"><span class="eyebrow">${esc(s.mode)}</span><h2 style="font-size:1.65rem;margin-top:20px">Sessão em andamento</h2><p class="muted">Você respondeu ${Object.keys(s.responses).length} de ${s.items.length} questões. Seu progresso está salvo.</p><div class="bar"><span style="width:${Object.keys(s.responses).length / s.items.length * 100}%"></span></div><div class="actions"><button class="btn teal" data-action="start">Continuar sessão</button><button class="btn secondary" data-action="restart">Iniciar nova sessão recomendada</button></div><p class="muted small">Iniciar outra sessão registra esta como interrompida; as respostas já dadas permanecem no histórico.</p></section>`;
  }
  const plan = currentPlan();
  const comp = Object.entries(plan.composition).map(([b, n]) => `<span class="chip">${n} · ${esc(BUCKETS[b])}</span>`).join('');
  const why = plan.personalized
    ? `<h2>Por que estas questões?</h2>${(plan.priorities || []).slice(0, 4).map(p => `<div class="task"><span class="task-number">${p.priorityScore}</span><div class="task-content"><strong class="small">${esc(p.topic)}</strong> <span class="pill ${p.level === 'alta' ? 'amber' : 'grey'}">${p.level}</span><p>${esc(p.priorityReason)}</p></div></div>`).join('')}<p class="muted small">Pontuação de 0 a 100 calculada por regras transparentes: domínio, erros recentes, erros recorrentes, revisões vencidas, tempo sem prática e volume de dados.</p>`
    : `<h2>Como a personalização começa</h2><p class="muted">Primeiro precisamos conhecer seu desempenho. Esta sessão alterna as cinco grandes áreas.</p><ul class="checklist"><li>Após ${ADAPTIVE_CONFIG.session.minAnswersForPersonalization} respostas, as sessões passam a priorizar suas lacunas</li><li>Erros recorrentes viram revisões espaçadas</li><li>Domínio só sobe com acertos posteriores</li></ul>`;
  return head('Seu estudo de hoje', 'Um ciclo curto: praticar, compreender e revisar.') + `<div class="grid cols"><section class="card"><span class="eyebrow">${plan.personalized ? 'SESSÃO PERSONALIZADA' : 'SESSÃO INICIAL EQUILIBRADA'}</span><h2 style="font-size:1.65rem;margin-top:20px">${plan.personalized ? 'Montada a partir do seu desempenho' : 'Vamos mapear seu ponto de partida'}</h2>${plan.message ? `<div class="notice">${esc(plan.message)}</div>` : ''}<div class="chips">${comp}</div><p class="muted small">Adaptado ao ritmo de ${state.profile.hours} horas semanais. Reserve cerca de ${minutesFor(plan.items.length)} minutos para este bloco de ${plan.items.length} questões.</p>${plan.items.map((it, i) => { const q = QUESTION_BY_ID.get(it.questionId); return `<div class="task"><span class="task-number">${String(i + 1).padStart(2, '0')}</span><div class="task-content"><strong>${esc(q.title)}</strong><p>${esc(q.area)} · ${esc(q.topic)} · ${esc(BUCKETS[it.bucket])}</p></div></div>`; }).join('')}<div class="actions"><button class="btn teal" data-action="start">Iniciar ${plan.items.length} questões</button>${button('Explorar meu mapa', 'desempenho', 'secondary')}</div></section><section class="card" style="align-self:start">${why}</section></div>`;
}

function questionPage(correction = false) {
  if (!state.session) return sessionPage();
  if (state.session.done) return resultPage();
  const s = state.session, q = currentQuestion(state), r = currentResponse(state), item = currentItem(state);
  const a = r?.choice;
  if (correction && a === undefined) correction = false;
  const answered = a !== undefined, last = s.index === s.items.length - 1;
  const node = knowledge().nodes[q.topicKey];
  const fb = answered && lastFeedback?.answerId === r.answerId ? lastFeedback : null;
  return head(correction ? 'Entenda o raciocínio' : 'Uma questão de cada vez', `Questão ${s.index + 1} de ${s.items.length} · ${esc(q.area)} · ${esc(q.topic)}`, button('Pausar e voltar', 'sessao', 'secondary'))
    + `<div class="grid question-layout"><section class="card"><div class="row"><span class="pill">${esc(q.subtopic)}</span><span class="muted small">Autoral · Demonstrativa</span></div><p class="question">${esc(q.stem)}</p><div class="answers">${q.options.map((o, i) => `<button class="answer ${answered ? (i === q.correct ? 'correct' : i === a ? 'wrong' : '') : (selected === i ? 'selected' : '')}" data-answer="${i}" ${answered ? 'disabled' : ''} aria-pressed="${(answered ? a : selected) === i}"><span class="letter">${LETTERS[i]}</span><span>${esc(o)}${answered && i === q.correct ? ' ✓' : ''}</span></button>`).join('')}</div>`
    + (answered ? `<div class="explanation"><span class="pill ${a !== q.correct ? 'amber' : ''}">${a === q.correct ? 'Resposta correta' : 'Vamos fortalecer este conceito'}</span>${fb?.note ? `<div class="notice">${esc(fb.note)}</div>` : ''}<h2 style="margin-top:22px">Explicação</h2><p>${esc(q.explain)}</p><h3>${a === q.correct ? 'O que consolidar' : 'Análise do seu erro'}</h3><p>${esc(q.analysis[a])} ${esc(q.key)}</p><details><summary>Análise de todas as alternativas</summary><ul>${q.analysis.map((x, i) => `<li><strong>${LETTERS[i]}.</strong> ${esc(x)}</li>`).join('')}</ul></details><p class="small muted" style="margin-top:18px">${q.ref ? `Referência educacional: <a class="link" href="${esc(q.ref)}" target="_blank" rel="noopener">OMS · Hypertension</a>. ` : ''}Questões autorais, não reproduzidas de prova. Confira sempre em material de referência.</p><div class="actions"><button class="btn teal" data-action="next">${last ? 'Concluir sessão' : 'Próxima questão'}</button>${button('Conversar com o tutor', 'tutor', 'secondary')}<button class="btn secondary" data-action="understood">Compreendi a explicação</button><button class="link" data-action="review">Adicionar à revisão</button></div></div>`
      : `<div class="actions"><button class="btn teal" data-action="confirm" ${selected === null ? 'disabled' : ''}>Confirmar resposta</button><span class="small muted" style="align-self:center">Selecione uma alternativa para continuar.</span></div>`)
    + `</section><section class="card" style="align-self:start"><span class="eyebrow">SEU BLOCO DE ESTUDO</span><h2 style="margin-top:20px">${esc(s.mode)}</h2><div class="bar"><span style="width:${Object.keys(s.responses).length / s.items.length * 100}%"></span></div><p class="muted small" style="margin-top:12px">${Object.keys(s.responses).length} de ${s.items.length} questões respondidas</p><div class="notice"><strong>Por que esta questão?</strong><br>${esc(BUCKETS[item.bucket])}: ${esc(item.reason)}</div><p class="small"><strong>${esc(q.topic)}:</strong> <span class="muted">${esc(masteryLabel(node))}</span></p><p class="muted small">Exemplo simplificado para estudo. Não use este conteúdo para decisões clínicas.</p></section></div>`;
}

// ---------- Tutor (demonstrativo) ----------
function tutorContext() { const q = currentQuestion(state); return buildTutorContext(state, knowledge(), q, currentResponse(state)?.choice, now(), QUESTION_BY_ID); }
function tutorPage() {
  if (!state.session || state.session.done) return head('Tutor de estudo', 'Abra uma questão para conversar sobre o contexto.', button('Ir à sessão', 'sessao'));
  const q = currentQuestion(state), ctx = tutorContext();
  if (!messages.length) messages = [{ role: 'bot', text: `Vamos revisar “${q.title}”. Posso explicar o conceito, comentar as alternativas ou resumir o ponto-chave. As respostas são pré-definidas para esta questão.` }];
  const m = ctx.topicMastery;
  return head('Uma dúvida. Um novo entendimento.', 'Tutor contextual · Respostas simuladas, sem IA real.', button('Voltar à questão', currentResponse(state) !== undefined ? 'correcao' : 'questao', 'secondary'))
    + `<div class="grid cols"><section class="card"><div class="row"><h2>Tutor MedAI</h2><span class="pill">SIMULADO</span></div><div class="chat" aria-live="polite">${messages.map(x => `<div class="bubble ${x.role === 'user' ? 'user' : ''}">${esc(x.text)}</div>`).join('')}</div><div class="actions">${['Explique o conceito', 'Analise meu erro', 'Resuma para revisar'].map(x => `<button class="btn secondary" data-prompt="${x}">${x}</button>`).join('')}</div><form class="chat-form" id="chat" style="margin-top:22px"><input name="message" required maxlength="300" aria-label="Sua dúvida sobre a questão" placeholder="Escreva sua dúvida sobre esta questão"><button class="btn" type="submit">Enviar</button></form></section>`
    + `<section class="card" style="align-self:start"><span class="eyebrow">QUESTÃO EM CONTEXTO</span><h2 style="margin-top:20px">${esc(q.title)}</h2><p class="muted small">${esc(q.stem)}</p><button class="link" data-action="review">Guardar para revisar</button><details><summary class="small">Contexto preparado para o tutor futuro</summary><ul class="context-list small"><li><strong>Assunto:</strong> ${esc(ctx.topic.area)} › ${esc(ctx.topic.label)} › ${esc(ctx.topic.subtopic)}</li><li><strong>Sua resposta:</strong> ${ctx.studentAnswer ? `${LETTERS[ctx.studentAnswer.choice]} · ${ctx.studentAnswer.correct ? 'correta' : 'incorreta'}` : 'ainda não respondida'}</li><li><strong>Domínio do assunto:</strong> ${m.questionsAnswered ? `${pct(m.value)}% · ${esc(m.state.toLowerCase())} (${plural(m.questionsAnswered, 'questão', 'questões')})` : 'sem dados'}</li><li><strong>Erros recentes:</strong> ${ctx.recentErrors.length ? ctx.recentErrors.map(e => esc(e.title)).join('; ') : 'nenhum'}</li><li><strong>Principais lacunas:</strong> ${ctx.mainGaps.length ? ctx.mainGaps.map(g => esc(g.topic)).join(', ') : 'ainda não identificadas'}</li></ul><p class="muted small">Nesta versão, nada é enviado a serviços externos. A estrutura está pronta para um tutor real em etapa futura.</p></details></section></div>`;
}
function chatSend(text) {
  messages.push({ role: 'user', text });
  const q = currentQuestion(state), r = currentResponse(state), ctx = tutorContext();
  const topicNote = ctx.recentErrors.length > 1 ? ` Observação: você tem ${ctx.recentErrors.length} erros recentes em ${ctx.topic.label}; vale revisar o conceito central antes da próxima questão.` : '';
  const response = r === undefined ? 'Para preservar sua tentativa, responda à questão primeiro. Observe o conceito central e compare cada alternativa com os dados fornecidos.'
    : /erro|alternativa/i.test(text) ? q.analysis[r.choice] + ' ' + q.key + topicNote
    : /resum/i.test(text) ? q.key
    : /conceito|explique/i.test(text) ? q.explain + ' ' + q.key
    : 'Este tutor é uma simulação limitada ao contexto atual. Para esta questão: ' + q.key;
  messages.push({ role: 'bot', text: response });
  render();
  const chat = document.querySelector('.chat'); chat.scrollTop = chat.scrollHeight;
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
  return head('Veja o que você sabe.', 'Do panorama geral ao conceito que merece sua atenção.', '<span class="pill">Seus dados neste navegador</span>')
    + `<div class="grid cols"><section class="card"><div class="row"><h2>Mapa de domínio</h2><span class="small muted">Área / assunto / subassunto</span></div>${answers.length ? '' : '<div class="notice">Dados insuficientes. Responda sua primeira sessão para começarmos a mapear seus pontos fortes e lacunas.</div>'}${map}<p class="muted small">Domínio é uma métrica interna de preparação, ponderada por recência. Com poucas respostas, o MedAI indica “Iniciando” em vez de um percentual definitivo. Tendência aparece a partir de ${ADAPTIVE_CONFIG.trend.minAnswers} respostas no assunto.</p></section>`
    + `<section class="card" style="align-self:start"><h2>Seu aprendizado deixa marcas</h2><p class="muted small">Sua prática real · últimas 12 semanas</p><div class="heatmap real" aria-label="Atividade de estudo nas últimas 12 semanas">${heatmap()}</div><div class="row small muted"><span>Menos prática</span><span>Mais prática</span></div><div class="summary compact"><div><span class="muted small">Respondidas</span><strong>${answers.length}</strong></div><div><span class="muted small">Acerto geral</span><strong>${answers.length ? pct(correct / answers.length) + '%' : '—'}</strong></div><div><span class="muted small">Revisões concluídas</span><strong>${state.reviews.filter(r => r.status === 'done').length}</strong></div></div>${button('Ver caderno de erros', 'revisoes', 'secondary')}</section></div>`
    + `<details class="card demo-example"><summary>Exemplo ilustrativo de um aluno fictício <span class="pill grey">${DEMO_INDICATORS.label}</span></summary><p class="muted small">Estes números são exemplos de interface. Não fazem parte do seu desempenho e não entram em nenhum cálculo.</p>${DEMO_INDICATORS.areas.map(([n, v]) => `<div class="area"><div class="row"><span>${n}</span><strong>${v}% <span class="muted small">exemplo</span></strong></div><div class="bar demo"><span style="width:${v}%"></span></div></div>`).join('')}</details>`;
}

function topicPage() {
  const k = knowledge();
  const key = app.ui.topicKey && k.nodes[app.ui.topicKey]?.level === 'topic' ? app.ui.topicKey : TAXONOMY[0].topics[0].key;
  const t = k.nodes[key];
  const p = computePriorities(k, state.reviews, now()).find(x => x.topicKey === key);
  const history = personalAnswers().filter(a => a.topicKey === key).slice(-8).reverse();
  const hasQuestions = QUESTIONS.some(q => q.topicKey === key);
  const facts = [['Respondidas', t.questionsAnswered], ['Acertos', t.correctAnswers], ['Erros', t.incorrectAnswers], ['Recente', t.recentAccuracy === null ? '—' : `${pct(t.recentAccuracy)}% (últimas ${t.recentCount})`], ['Tendência', trendLabel(t)], ['Confiança dos dados', t.questionsAnswered ? pct(t.dataConfidence) + '%' : '—'], ['Última prática', fmtDate(t.lastInteractionAt)], ['Próxima revisão', fmtDate(t.nextReviewAt)]];
  return head(esc(t.label), `${esc(t.area)} / ${esc(t.label)}`, button('Voltar ao mapa', 'desempenho', 'secondary'))
    + `<div class="grid cols"><section class="card"><div class="row"><div><span class="eyebrow">DOMÍNIO DO ASSUNTO</span><h2 style="font-size:2.8rem;margin:15px 0">${t.questionsAnswered && t.state !== MASTERY_STATES.STARTING ? pct(t.currentMastery) + '%' : '—'}</h2></div><span class="pill ${stateClass(t.state)}">${esc(t.state)}</span></div>${masteryBar(t)}<p class="muted small">${t.questionsAnswered ? `Baseado em ${plural(t.questionsAnswered, 'questão respondida', 'questões respondidas')} por você.${t.recurrentError ? ` Erro recorrente detectado em ${fmtDate(t.recurrentErrorDetectedAt)}.` : ''}${t.contentReviewedAt ? ` Conteúdo revisado em ${fmtDate(t.contentReviewedAt)} (não altera o domínio).` : ''}` : 'Ainda sem respostas neste assunto.'}</p><div class="facts">${facts.map(([l, v]) => `<div><span class="muted small">${l}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`
    + `<h2 style="margin-top:30px">Subassuntos</h2>${childrenOf(k, key).map(s => `<div class="subtopic"><span>${esc(s.label)}</span><span class="muted small">${s.questionsAnswered ? `${s.correctAnswers}/${s.questionsAnswered} acertos · ${esc(masteryLabel(s))}` : 'Sem dados'}</span></div>`).join('')}`
    + `<h2 style="margin-top:30px">Histórico de aprendizagem</h2>${history.length ? history.map(a => `<div class="task"><span class="task-number">${a.correct ? '✓' : '↻'}</span><div><strong>${esc(QUESTION_BY_ID.get(a.questionId)?.title || a.questionId)}</strong><p>${fmtDate(a.at)} · ${a.correct ? 'Acerto' : 'Erro'}${a.isReview ? ' · em revisão' : ''}</p></div></div>`).join('') : '<p class="muted">Nenhuma tentativa registrada neste assunto.</p>'}</section>`
    + `<section class="card" style="align-self:start"><h2>Próximo passo recomendado</h2><p><span class="pill ${p.level === 'alta' ? 'amber' : 'grey'}">Prioridade ${p.level} · ${p.priorityScore}/100</span></p><h3>Por que isso está sendo recomendado?</h3><ul class="reasons">${p.reasons.map(r => `<li>${esc(r.text)}</li>`).join('')}</ul>${hasQuestions ? `<button class="btn teal" data-action="directed" data-topic-key="${esc(key)}">Iniciar revisão direcionada</button>` : '<div class="notice">O banco demonstrativo ainda não tem questões deste assunto.</div>'}<p class="muted small">Revisão direcionada: ${ADAPTIVE_CONFIG.session.directedSize} questões deste assunto, priorizando as que você errou.</p></section></div>`;
}

// ---------- Revisões e caderno de erros ----------
const statusClass = s => ({ [REVIEW_STATUS.OVERDUE]: 'amber', [REVIEW_STATUS.TODAY]: '', [REVIEW_STATUS.PENDING]: 'grey', [REVIEW_STATUS.DONE]: 'ok' })[s];
function reviewRow(r) {
  const st = reviewStatus(r, now());
  return `<div class="task"><span class="task-number">↻</span><div class="task-content"><strong>${esc(r.topic)}</strong> <span class="pill ${statusClass(st)}">${st}</span><p>${esc(r.reason)} · Prioridade ${esc(r.priority)} · Criada em ${fmtDate(r.createdAt)} · ${st === REVIEW_STATUS.DONE ? `Concluída em ${fmtDate(r.completedAt)} (${pct(r.accuracy)}%)` : `Recomendada para ${fmtDate(r.dueAt)}`} · Origem: ${esc(r.origin)}</p></div>${st === REVIEW_STATUS.DONE ? '' : `<button class="btn secondary" data-action="directed" data-topic-key="${esc(r.topicKey)}">${st === REVIEW_STATUS.PENDING ? 'Antecipar' : 'Revisar'}</button>`}</div>`;
}
function notebook() {
  const entries = errorNotebook(state, QUESTION_BY_ID);
  if (!entries.length) return '<div class="empty compact"><p class="muted">Nenhum erro registrado ainda. Questões que você errar aparecem aqui, com a explicação.</p></div>';
  return entries.map(e => { const q = e.question; return `<details class="notebook"><summary><span class="nb-head"><strong>${esc(e.title)}</strong><span class="pill ${e.recoveredAt ? 'ok' : 'amber'}">${e.recoveredAt ? `Recuperada em ${fmtDate(e.recoveredAt)}` : 'Ainda não recuperada'}</span></span><span class="muted small">${esc(e.area)} · ${esc(e.topic)} · último erro em ${fmtDate(e.lastErrorAt)} · ${plural(e.errorCount, 'erro nesta questão', 'erros nesta questão')} · ${plural(e.topicErrorCount, 'erro no assunto', 'erros no assunto')}</span></summary>${q ? `<p class="small">${esc(q.stem)}</p><p class="small"><strong>Sua resposta:</strong> ${e.lastChoice === null || e.lastChoice === undefined ? 'não registrada (dado migrado)' : `${LETTERS[e.lastChoice]}. ${esc(q.options[e.lastChoice])}`}<br><strong>Resposta correta:</strong> ${LETTERS[q.correct]}. ${esc(q.options[q.correct])}</p><p class="small muted">${esc(q.explain)}</p>` : ''}</details>`; }).join('');
}
function reviewsPage() {
  const mine = state.reviews.filter(r => r.source === 'user');
  const active = mine.filter(r => r.status === 'pending').sort((a, b) => toMs(a.dueAt) - toMs(b.dueAt));
  const done = mine.filter(r => r.status === 'done').sort((a, b) => toMs(b.completedAt) - toMs(a.completedAt)).slice(0, 5);
  const iv = ADAPTIVE_CONFIG.reviews.intervalsDays;
  return head('Revisar é fazer permanecer.', 'Seus erros e conceitos salvos voltam para um novo encontro.')
    + `<div class="grid cols"><section class="card"><div class="row"><h2>Fila de revisão</h2><span class="pill">${plural(active.length, 'assunto', 'assuntos')}</span></div>${active.length ? active.map(reviewRow).join('') : `<div class="empty"><h2>Revisões em dia</h2><p class="muted">Erros recorrentes, erros recentes e domínio frágil aparecerão aqui.</p>${button('Praticar novamente', 'sessao')}</div>`}${done.length ? `<h3 style="margin-top:26px">Concluídas recentemente</h3>${done.map(reviewRow).join('')}` : ''}${state.demo.legacyReviews.length ? `<p class="muted small">Itens de exemplo da versão anterior, sem evidência de erro seu: ${state.demo.legacyReviews.map(esc).join(', ')} <span class="pill grey">DEMO</span>. Não entram na fila.</p>` : ''}</section>`
    + `<section class="card" style="align-self:start"><h2>Como a fila funciona</h2><ul class="reasons small"><li>Um erro isolado não cria revisão; só ajusta a prioridade.</li><li>${ADAPTIVE_CONFIG.reviews.createOnErrorsInWindow} erros entre as últimas ${ADAPTIVE_CONFIG.recent.window} questões do assunto: “Erro recente”.</li><li>${ADAPTIVE_CONFIG.recurrence.minErrors} ou mais: “Erros recorrentes”, disponível hoje.</li><li>Revisão com ${pct(ADAPTIVE_CONFIG.reviews.successAccuracy)}% de acerto ou mais amplia o intervalo: ${iv.join(' → ')} dias.</li><li>Novo erro reduz o intervalo.</li><li>No máximo uma revisão ativa por assunto.</li></ul></section></div>`
    + `<section class="card" style="margin-top:22px"><div class="row"><h2>Caderno de erros</h2><span class="muted small">Histórico preservado, inclusive após acertar</span></div>${notebook()}</section>`;
}

// ---------- Demais telas ----------
function plansPage() {
  return head('Mais espaço para evoluir.', 'Compare os planos ilustrativos. Nenhuma cobrança será realizada.') + `<div class="grid plans">${[['Essencial', 'Grátis', ['Sessões adaptativas com o banco demonstrativo', 'Mapa de domínio', 'Revisões locais']], ['Completo', 'R$ 89 / mês', ['Todos os recursos da demonstração', 'Tutor contextual simulado', 'Experiência de plano completo']]].map(([name, price, items]) => `<section class="card ${name === 'Completo' ? 'plan-highlight' : ''}"><div class="row"><h2>${name}</h2>${app.plan === name ? '<span class="pill">SEU PLANO DEMO</span>' : ''}</div><div class="plan-price">${price}</div><ul class="checklist">${items.map(x => `<li>${x}</li>`).join('')}</ul><button class="btn ${name === 'Essencial' ? 'secondary' : 'teal'} full" data-plan="${name}" ${app.plan === name ? 'disabled' : ''}>${app.plan === name ? 'Plano selecionado' : 'Simular plano ' + name}</button></section>`).join('')}</div><div class="notice">Preços fictícios para validar a interface. Nenhum cartão, pagamento ou assinatura real.</div>`;
}
function mockPage() {
  const n = Math.min(ADAPTIVE_CONFIG.session.simuladoSize, QUESTIONS.length);
  return head('Treine o ritmo da prova.', 'Uma versão reduzida para experimentar o fluxo de simulado.') + `<section class="card" style="max-width:780px"><span class="eyebrow">SIMULADO DEMONSTRATIVO 01</span><h2 style="font-size:1.6rem;margin-top:18px">Fundamentos das cinco grandes áreas</h2><p class="muted">${n} questões autorais · Correção ao responder · Sem cronômetro obrigatório</p><div class="notice">Distribuição equilibrada entre áreas, sem personalização. Suas respostas entram no seu histórico pessoal e no mapa de domínio. Não representa a distribuição de uma prova de residência.</div><button class="btn teal" data-action="mock">Iniciar mini-simulado</button></section>`;
}
function resultPage() {
  const s = state.session;
  if (!s?.done) return sessionPage();
  const rows = s.items.map((it, i) => ({ q: QUESTION_BY_ID.get(it.questionId), r: s.responses[i] }));
  const hits = rows.filter(x => x.r && x.r.choice === x.q.correct).length;
  const topics = [...new Set(rows.map(x => x.q.topicKey))].map(key => knowledge().nodes[key]);
  return head('Mais um passo construído.', 'Sua sessão foi concluída e o progresso foi salvo neste navegador.')
    + `<section class="card" style="max-width:850px"><span class="pill">SESSÃO CONCLUÍDA</span><h2 style="font-size:3rem;margin:22px 0">${hits} de ${rows.length} acertos</h2><p class="muted">${hits === rows.length ? 'Você consolidou os fundamentos deste bloco.' : 'Os assuntos que precisam de atenção influenciam sua próxima sessão.'}</p>${(s.resolvedReviews || []).map(r => `<div class="notice">${r.success ? `Revisão de ${esc(r.topic)} concluída com sucesso.${r.nextDueAt ? ` Próxima revisão em ${fmtDate(r.nextDueAt)}.` : ' Assunto consolidado no ciclo de revisões.'}` : `Revisão de ${esc(r.topic)} com erros: intervalo reduzido, nova revisão em ${fmtDate(r.nextDueAt)}.`}</div>`).join('')}${rows.map(x => `<div class="task"><span class="task-number">${x.r?.choice === x.q.correct ? '✓' : '↻'}</span><div><strong>${esc(x.q.title)}</strong><p>${esc(x.q.topic)} · ${x.r?.choice === x.q.correct ? 'Acerto' : 'Erro registrado no caderno'}</p></div></div>`).join('')}<h3 style="margin-top:24px">Seu mapa agora</h3>${topics.map(t => `<div class="subtopic"><span>${esc(t.label)}</span><span class="muted small">${esc(masteryLabel(t))} · ${esc(trendLabel(t))}</span></div>`).join('')}<div class="actions">${button('Ver minhas revisões', 'revisoes')}${button('Explorar desempenho', 'desempenho', 'secondary')}${button('Voltar à visão geral', 'dashboard', 'secondary')}</div></section>`;
}
function metaPage() {
  const p = { ...state.profile, ...(formErrors.__draft || {}) };
  return head('Minha meta', 'Seu objetivo orienta o ritmo da preparação.') + `<div class="grid cols">${metaForm(p, formErrors)}<section class="card danger-zone" style="align-self:start"><span class="eyebrow">ÁREA DE DESENVOLVIMENTO</span><h2 style="margin-top:16px">Resetar dados pessoais locais</h2><p class="muted small">Para testar o onboarding e o motor adaptativo do zero. Apaga <strong>somente</strong> neste navegador: perfil e meta, rascunho do onboarding, respostas, revisões, sessões, caderno de erros e mapa de domínio.</p><p class="muted small">Mantém: seleção de plano demonstrativo, entrada na demonstração e cópias de versões antigas (medai-v1/medai-v2), que não são reimportadas.</p>${resetOpen ? `<form id="reset" class="reset-confirm"><label class="field">Digite RESETAR para confirmar<input name="confirm" autocomplete="off" required aria-describedby="reset-help"></label><span id="reset-help" class="muted small">Esta ação não pode ser desfeita.</span><div class="actions"><button class="btn danger" type="submit">Apagar meus dados pessoais</button><button class="btn secondary" type="button" data-action="reset-cancel">Cancelar</button></div></form>` : '<button class="btn secondary" data-action="reset-open">Resetar dados pessoais…</button>'}</section></div>`;
}

// ---------- Render ----------
function render() {
  let route = location.hash.slice(1) || 'dashboard';
  if (fatal) { root.innerHTML = recoveryPage(); return; }
  if (!app.logged) { root.innerHTML = login(); return; }
  if (!state.profile) route = 'onboarding';
  if (route === 'questao' && sessionActive() && currentResponse(state) === undefined) { const next = markShown(state, now()); if (next !== state) { state = next; persist(); } }
  const views = { dashboard, onboarding: () => onboardingView(state.onboarding, formErrors), meta: metaPage, sessao: sessionPage, questao: questionPage, correcao: () => questionPage(true), tutor: tutorPage, desempenho: performance, tema: topicPage, revisoes: reviewsPage, assinatura: plansPage, simulados: mockPage, resultado: resultPage };
  root.innerHTML = shell(views[route] ? views[route]() : head('Página não encontrada', 'Volte à sua preparação.', button('Ir à visão geral', 'dashboard')), route);
  window.scrollTo(0, 0);
}

function begin(plan, mode) {
  state = startSession(state, plan, mode, now());
  selected = null; messages = []; lastFeedback = null;
  persist(); go('questao'); render();
}
function startRecommended(force = false) {
  if (!force && sessionActive()) { go(currentResponse(state) !== undefined ? 'correcao' : 'questao'); render(); return; }
  const plan = currentPlan();
  begin(plan, plan.personalized ? 'Sessão personalizada' : 'Sessão inicial equilibrada');
}

function onboardingData(form) { const d = Object.fromEntries(new FormData(form)); for (const k of ['year', 'hours']) if (k in d) d[k] = d[k] === '' ? '' : Number(d[k]); return d; }

document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'login') { e.preventDefault(); const name = String(new FormData(f).get('name') || '').trim() || 'Estudante'; app = { ...app, logged: true }; persistApp(); if (!state.profile) { state = saveDraft(state, { name }); persist(); } render(); return; }
  if (f.id === 'onboarding') {
    e.preventDefault();
    const step = Number(f.dataset.step), data = onboardingData(f);
    if (step < 3) {
      const draft = { ...state.onboarding.draft, ...data }, errors = validateGoal(draft, now(), step);
      state = saveDraft(state, data, Object.keys(errors).length ? step : step + 1); persist();
      formErrors = errors; render();
      if (Object.keys(errors).length) document.querySelector('[aria-invalid=true]')?.focus();
      return;
    }
    const { state: next, errors } = confirmProfile(state, now());
    if (Object.keys(errors).length) { formErrors = errors; state = saveDraft(state, {}, errors.name || errors.exam || errors.year || errors.specialty ? 1 : 2); persist(); render(); return; }
    const prev = state; state = next;
    if (!persist()) { state = prev; render(); return; }
    formErrors = {}; go('dashboard'); render(); toast('Seu plano de estudo foi criado.');
    return;
  }
  if (f.id === 'profile') {
    e.preventDefault();
    const data = onboardingData(f), { state: next, errors } = updateProfile(state, data, now());
    if (Object.keys(errors).length) { formErrors = { ...errors, __draft: data }; render(); document.querySelector('[aria-invalid=true]')?.focus(); return; }
    const prev = state; state = next;
    if (!persist()) { state = prev; render(); return; }
    formErrors = {}; go('dashboard'); render(); toast('Sua meta foi atualizada. Seu histórico foi mantido.');
    return;
  }
  if (f.id === 'reset') {
    e.preventDefault();
    if (String(new FormData(f).get('confirm')).trim().toUpperCase() !== 'RESETAR') { toast('Digite RESETAR para confirmar. Nada foi apagado.'); return; }
    const r = repo.resetPersonalData(now());
    if (!r.ok) { toast('Não foi possível resetar: o navegador bloqueou a gravação. Nada foi alterado.'); return; }
    state = r.state; resetOpen = false; formErrors = {}; selected = null; messages = []; unsaved = false;
    go('onboarding'); render(); toast('Dados pessoais locais apagados. Configure um novo perfil.');
    return;
  }
  if (f.id === 'chat') { e.preventDefault(); const text = String(new FormData(f).get('message') || '').trim(); if (text) chatSend(text); }
});

// Rascunho do onboarding salvo a cada alteração de campo, preservado entre etapas e recarregamentos.
document.addEventListener('change', e => {
  const f = e.target.closest('#onboarding');
  if (f) { state = saveDraft(state, onboardingData(f)); persist(); }
});

document.addEventListener('click', e => {
  const lockedLink = e.target.closest('[data-locked]');
  if (lockedLink) { e.preventDefault(); toast(`Conclua a configuração inicial (etapa ${state.onboarding.step} de 3) para liberar esta área. O que você já preencheu está salvo.`); return; }
  const el = e.target.closest('[data-action],[data-answer],[data-prompt],[data-topic],[data-plan]');
  if (!el) return;
  if (el.dataset.answer !== undefined) { if (currentResponse(state) !== undefined) return; selected = Number(el.dataset.answer); render(); return; }
  if (el.dataset.prompt) { chatSend(el.dataset.prompt); return; }
  if (el.dataset.topic !== undefined) { e.preventDefault(); app = { ...app, ui: { ...app.ui, topicKey: el.dataset.topic } }; persistApp(); go('tema'); render(); return; }
  if (el.dataset.plan) { app = { ...app, plan: el.dataset.plan }; persistApp(); render(); toast('Plano ' + app.plan + ' ativado somente na simulação.'); return; }
  switch (el.dataset.action) {
    case 'reload': location.reload(); break;
    case 'retry-save': if (persist()) { toast('Progresso salvo.'); render(); } break;
    case 'logout': app = { ...app, logged: false }; persistApp(); render(); break;
    case 'onb-back': { const f = document.querySelector('#onboarding'); state = saveDraft(state, onboardingData(f), Math.max(1, state.onboarding.step - 1)); persist(); formErrors = {}; render(); break; }
    case 'start': startRecommended(); break;
    case 'restart': startRecommended(true); break;
    case 'directed': { const key = el.dataset.topicKey; const plan = directedPlan(state, QUESTIONS, key); if (!plan.items.length) { toast('Ainda não há questões deste assunto no banco demonstrativo.'); break; } begin(plan, `Revisão direcionada · ${knowledge().nodes[key].label}`); break; }
    case 'mock': begin(simuladoPlan(state, QUESTIONS), 'Mini-simulado'); break;
    case 'confirm': {
      if (selected === null || currentResponse(state) !== undefined) return;
      const res = recordAnswer(state, selected, now());
      if (res.duplicate) return;
      state = res.state;
      const node = knowledge().nodes[res.answer.topicKey], ch = res.reviewChange;
      const note = ch?.type === 'created' ? `${res.answer.topic} entrou na sua fila de revisão: ${ch.review.reason.toLowerCase()} (${ch.review.history[0].detail}).`
        : ch?.type === 'escalated' ? `Erro recorrente em ${res.answer.topic}: a revisão foi antecipada para hoje.`
        : ch?.type === 'shortened' ? `Novo erro em ${res.answer.topic}: o intervalo da próxima revisão foi reduzido.`
        : !res.answer.correct && node.questionsAnswered > 1 && !node.recurrentError ? `Erro registrado no caderno. ${node.recentErrors > 1 ? '' : 'Por ser um erro isolado, ele ajusta a prioridade sem criar revisão.'}` : '';
      lastFeedback = { answerId: res.answer.id, note };
      selected = null; persist(); go('correcao'); render(); break;
    }
    case 'next':
      if (currentResponse(state) === undefined) return;
      if (state.session.index === state.session.items.length - 1) { state = finishSession(state, now()).state; persist(); go('resultado'); }
      else { state = advanceSession(state); selected = null; messages = []; persist(); go('questao'); }
      render(); break;
    case 'understood': { const q = currentQuestion(state); state = markContentReviewed(state, q.id, now()); persist(); toast('Marcado como conteúdo revisado. Seu domínio só muda quando você acertar questões deste assunto depois.'); break; }
    case 'review': { const q = currentQuestion(state); const r = saveForReview(state, q.id, now()); state = r.state; persist(); toast(r.created ? 'Assunto salvo na sua fila de revisão.' : 'Este assunto já está na sua fila de revisão.'); break; }
    case 'reset-open': resetOpen = true; render(); document.querySelector('#reset input')?.focus(); break;
    case 'reset-cancel': resetOpen = false; render(); break;
  }
});

if (document.modelContext?.registerTool) { try { Promise.resolve(document.modelContext.registerTool({ name: 'navigate_medai', title: 'Abrir área do MedAI', description: 'Navega para uma área da demonstração sem responder questões ou alterar o progresso.', inputSchema: { type: 'object', properties: { page: { type: 'string', enum: nav.map(n => n[0]) } }, required: ['page'], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: async input => { if (!input || !nav.some(n => n[0] === input.page)) throw Error('Página inválida'); if (!app.logged || !state.profile) throw Error('Conclua a entrada e o onboarding primeiro'); go(input.page); render(); return { page: input.page }; } })).catch(() => {}); } catch {} }

window.addEventListener('hashchange', () => { selected = null; if (location.hash !== '#meta') { formErrors = {}; resetOpen = false; } render(); });
if (!fatal && loaded.status === 'migrated') { state = refreshKnowledge(state, now()); setTimeout(() => toast(`Seus dados de ${loaded.from} foram migrados. A cópia antiga foi preservada.`), 50); }
render();
