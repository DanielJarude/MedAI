// Registro das fontes do Radar. Coletores automáticos declaram a fonte oficial e collect(ctx).
// Fontes sem automação razoável (bloqueio anti-robô, login, robots.txt restritivo) entram como manuais.
import * as enare from './enare.mjs';
import * as fuvest from './fuvest.mjs';
import * as aremg from './aremg.mjs';
import { MANUAL_SOURCES } from './manual.mjs';

export const COLLECTORS = [enare, fuvest, aremg, ...MANUAL_SOURCES.map(source => ({ source }))];
export const NOTICE_SOURCES = COLLECTORS.map(c => c.source);
