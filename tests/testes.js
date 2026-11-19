// node tests/testes.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const AB = require('../motore.js');
const J = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dados', f), 'utf8'));
const C = J('culturas.json'), I = J('interpretacao_sp.json');
let n = 0; const t = (nome, f) => { f(); n++; console.log('OK  ' + nome); };

t('V% e CTC corretos (exemplo de aula ESALQ: K 2,6 Ca 34 Mg 21 H+Al 52)', () => {
  const r = AB.analise({ K: 2.6, Ca: 34, Mg: 21, HAl: 52, Al: 3 });
  assert(Math.abs(r.SB - 57.6) < 1e-9 && Math.abs(r.CTC - 109.6) < 1e-9 && Math.abs(r.V - 52.55) < 0.01);
});
t('calagem: CTC 80, V1 40 -> V2 70, PRNT 80 = 3,0 t/ha', () => {
  assert(Math.abs(AB.calagem(80, 40, 70, 80, 20) - 3.0) < 1e-9);
});
t('calagem nula se V1 >= V2', () => assert(AB.calagem(80, 75, 70, 80) === 0));
t('profundidade 40 cm dobra a dose', () => assert(Math.abs(AB.calagem(80, 40, 70, 80, 40) - 6.0) < 1e-9));
t('classes de K (SP)', () => {
  assert(AB.classe(0.5, I.K_mmolc_dm3) === 0 && AB.classe(2.0, I.K_mmolc_dm3) === 2 && AB.classe(7, I.K_mmolc_dm3) === 4);
});
t('soja não recebe N', () => assert(AB.nitrogenio(C.soja, 3.9, {}).dose === 0));
t('milho após soja recebe menos N', () => {
  assert(AB.nitrogenio(C.milho, 9.6, { sojaAnterior: true }).dose < AB.nitrogenio(C.milho, 9.6, {}).dose);
});
t('P muito alto -> dose de P2O5 zero', () => {
  assert(AB.fosforoPotassio(C.milho, 9.6, I, 120, 2).P2O5 === 0);
});
t('sc/ha -> t/ha', () => assert(Math.abs(AB.toneladas(C.soja, 65) - 3.9) < 1e-9));
t('ETo FAO-56: exemplo 17 de Allen et al. (1998), Bangkok, abril = 5,72 mm/dia (±0,25)', () => {
  const es = t => 0.6108 * Math.exp(17.27 * t / (t + 237.3)), esm = (es(34.8) + es(25.6)) / 2;
  const e = AB.eto({ tmax: 34.8, tmin: 25.6, tmean: 30.2, rh: 100 * 2.85 / esm, u2: 2, rs: 22.65, lat: 13.73, z: 2, mes: 4 });
  assert(Math.abs(e - 5.72) < 0.25, e);
});
t('balanço hídrico: chuva >> ETP => sem deficit; meses secos => deficit', () => {
  const P = [250,200,180,80,40,15,10,10,40,120,180,240], E = Array(12).fill(120);
  const b = AB.balancoHidrico(P, E, 100);
  assert(b[0].DEF === 0 && b[7].DEF > 50 && b.every(m => m.ARM <= 100.0001 && m.ARM >= 0));
  const somaP = P.reduce((a, x) => a + x), somaETR = b.reduce((a, m) => a + m.ETR, 0), somaEXC = b.reduce((a, m) => a + m.EXC, 0);
  assert(Math.abs(somaP - somaETR - somaEXC) < 1, 'fechamento do balanço');
});
console.log(`\n${n} testes aprovados`);
