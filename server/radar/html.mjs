// Utilidades de leitura de HTML sem dependências (as páginas oficiais usadas têm estrutura simples).

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decodeEntities = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m);
export const stripTags = html => decodeEntities(String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

// Links <a href="...">texto</a>, com URL absoluta.
export function links(html, base) {
  const out = [];
  for (const m of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(m[1])?.[1];
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) continue;
    let url; try { url = new URL(decodeEntities(href), base).href; } catch { continue; }
    out.push({ url, text: stripTags(m[2]).replace(/\s+/g, ' ').trim(), attrs: m[1] });
  }
  return out;
}

// Páginas Next.js (App Router) embutem os dados em self.__next_f.push([1,"..."]). Junta os trechos
// e devolve os objetos JSON que têm todas as chaves pedidas. Não executa JavaScript.
export function nextFlightObjects(html, requiredKeys) {
  let payload = '';
  for (const m of String(html).matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try { payload += JSON.parse(m[1]); } catch { /* trecho não textual */ }
  }
  const out = [], marker = '{"' + requiredKeys[0] + '":';
  let from = 0;
  while ((from = payload.indexOf(marker, from)) !== -1) {
    const end = matchBrace(payload, from);
    if (end < 0) break;
    try { const obj = JSON.parse(payload.slice(from, end + 1)); if (requiredKeys.every(k => k in obj)) out.push(obj); } catch { /* objeto parcial */ }
    from = end + 1;
  }
  return out;
}

function matchBrace(s, start) {
  let depth = 0, inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

// RSS 2.0: itens com título, link, data e categorias.
export function rssItems(xml) {
  return [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m => {
    const tag = t => { const r = new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`, 'i').exec(m[0]); return r ? decodeEntities(r[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')).trim() : null; };
    return { title: tag('title'), link: tag('link'), pubDate: tag('pubDate'), categories: [...m[0].matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map(c => decodeEntities(c[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')).trim()) };
  });
}
