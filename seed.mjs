import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Seed only the published demo fixtures, never a presenter's browser data.
export function buildSeed() {
  const app = readFileSync(new URL('./dist/app.js', import.meta.url), 'utf8');
  const films = readFileSync(new URL('./dist/films.js', import.meta.url), 'utf8');
  const prefix = app.slice(0, app.indexOf('let db;'));
  return JSON.parse(JSON.stringify(vm.runInNewContext(prefix + '\n' + films + '\napplyFilmData(seed())')));
}
