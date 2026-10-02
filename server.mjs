import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8'};
const allowed=['index.html','style.css','app.js','specialties.js','profile-model.js','profile-repository.js','onboarding-view.js','demo-data.js','adaptive-config.js','knowledge-model.js','review-scheduler.js','adaptive-engine.js'];
http.createServer(async(req,res)=>{const p=new URL(req.url,'http://localhost').pathname;const file=p==='/'?'index.html':p.slice(1);if(!allowed.includes(file)){res.writeHead(404);res.end('Not found');return}try{res.writeHead(200,{'Content-Type':types[file.split('.').pop()]});res.end(await readFile(fileURLToPath(new URL('./dist/'+file,import.meta.url))))}catch{res.writeHead(500);res.end('Could not load file')}}).listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('MedAI: http://127.0.0.1:'+(Number(process.env.PORT)||4173)));
