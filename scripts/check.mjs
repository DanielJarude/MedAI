// Verifica a sintaxe de todos os módulos do frontend, do servidor e dos testes.
import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const files = [];
const walk = d => { for (const f of readdirSync(d)) { const p = `${d}/${f}`; if (statSync(p).isDirectory()) walk(p); else if (/\.(m?js)$/.test(f)) files.push(p); } };
['dist', 'server', 'content', 'tests', 'scripts'].forEach(walk);
files.push('server.mjs');
for (const f of files) execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' });
console.log(`Sintaxe OK em ${files.length} arquivos.`);
