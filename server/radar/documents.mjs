// Download + extração de texto de documentos oficiais, com cache no banco (document_cache).
// PDF → texto com unpdf (pdf.js, sem dependências nativas). PDF inválido/protegido → FAILED, sem texto.
import { createHash } from 'node:crypto';

export class ParseError extends Error { constructor(message) { super(message); this.name = 'ParseError'; } }

export async function pdfToText(buffer) {
  const head = Buffer.from(buffer).subarray(0, 1024).toString('latin1');
  if (!head.includes('%PDF-')) throw new ParseError('O arquivo não é um PDF válido.');
  const { getDocumentProxy, extractText } = await import('unpdf');
  let pdf;
  try { pdf = await getDocumentProxy(new Uint8Array(buffer), { verbosity: 0 }); }
  catch (e) { throw new ParseError(`PDF ilegível: ${e.message}`); }
  try {
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const joined = text.join('\n');
    if (joined.replace(/\s/g, '').length < 50) throw new ParseError('PDF sem camada de texto (provavelmente digitalizado). Requer verificação manual.');
    return { pages: totalPages, text: joined };
  } finally { await pdf.destroy?.().catch?.(() => {}); }
}

export const sha256 = buf => createHash('sha256').update(buf).digest('hex');

export function createDocumentStore(db, fetcher, { log = () => {} } = {}) {
  return {
    // `immutable`: a URL muda quando o conteúdo muda (ex.: ?v= ou carimbo no nome) → reutiliza o cache sem nova requisição.
    async get(url, { kind = 'pdf', immutable = false, accept } = {}) {
      const cached = (await db.query('SELECT * FROM document_cache WHERE url = $1', [url])).rows[0];
      if (cached && immutable && cached.parse_status === 'PARSED') return { ...view(cached), fromCache: true };
      const r = await fetcher.get(url, { etag: cached?.etag, lastModified: cached?.last_modified, accept: accept || (kind === 'pdf' ? 'application/pdf' : '*/*') });
      if (r.notModified && cached) return { ...view(cached), fromCache: true };
      const hash = sha256(r.body);
      if (cached && cached.content_hash === hash && cached.parse_status === 'PARSED') {
        await db.query('UPDATE document_cache SET fetched_at = now(), etag = $2, last_modified = $3 WHERE url = $1', [url, r.headers.etag || null, r.headers['last-modified'] || null]);
        return { ...view(cached), fromCache: true };
      }
      let text = null, status = 'PARSED', error = null;
      try { text = kind === 'pdf' ? (await pdfToText(r.body)).text : r.body.toString('utf8'); }
      catch (e) { status = 'FAILED'; error = e.message; log(`documento não interpretado: ${url} — ${e.message}`); }
      const row = { url, etag: r.headers.etag || null, last_modified: r.headers['last-modified'] || null, content_type: r.headers['content-type'] || null, content_hash: hash, byte_size: r.body.length, text, parse_status: status, parse_error: error };
      await db.query(`INSERT INTO document_cache (url, etag, last_modified, content_type, content_hash, byte_size, text, parse_status, parse_error, fetched_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
        ON CONFLICT (url) DO UPDATE SET etag = EXCLUDED.etag, last_modified = EXCLUDED.last_modified, content_type = EXCLUDED.content_type, content_hash = EXCLUDED.content_hash,
          byte_size = EXCLUDED.byte_size, text = EXCLUDED.text, parse_status = EXCLUDED.parse_status, parse_error = EXCLUDED.parse_error, fetched_at = now()`,
        [row.url, row.etag, row.last_modified, row.content_type, row.content_hash, row.byte_size, row.text, row.parse_status, row.parse_error]);
      return { ...view(row), fromCache: false, changed: !!cached && cached.content_hash !== hash };
    }
  };
}

const view = r => ({ url: r.url, text: r.text, contentHash: r.content_hash, contentType: r.content_type, byteSize: r.byte_size, parseStatus: r.parse_status, parseError: r.parse_error, fetchedAt: r.fetched_at ? new Date(r.fetched_at).toISOString() : new Date().toISOString() });
