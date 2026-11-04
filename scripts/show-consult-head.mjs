import { readFileSync } from 'node:fs';

const t = readFileSync('apps/core-service/src/consultations/consultations.module.ts', 'utf8');
console.log(t.split('\n').slice(0, 20).join('\n'));
console.log('---ctor---');
const i = t.indexOf('export class ConsultationsController');
console.log(t.slice(i, i + 400));
console.log('---module---');
console.log(t.slice(t.lastIndexOf('@Module')));
