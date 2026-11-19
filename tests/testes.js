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
console.log(`\n${n} testes aprovados`);
