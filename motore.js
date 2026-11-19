/* Adubação Brasil – motor de cálculo (navegador e Node para testes).
   Métodos de referência; os coeficientes estão em /dados e devem ser validados por engenheiro agrônomo. */
(function (root) {
  'use strict';

  // Análise de solo (unidades SP: mmolc/dm3) -> SB, CTC, V%, m%
  function analise(a) {
    const SB = a.K + a.Ca + a.Mg;
    const CTC = SB + a.HAl;
    const V = CTC > 0 ? 100 * SB / CTC : 0;
    const m = (SB + (a.Al || 0)) > 0 ? 100 * (a.Al || 0) / (SB + (a.Al || 0)) : 0;
    return { SB, CTC, V, m };
  }

  // Calagem – método da saturação por bases: NC (t/ha) = CTC (V2 - V1) / (10 PRNT) × fator de profundidade
  function calagem(ctc, v1, v2, prnt, profundidadeCm) {
    const f = (profundidadeCm || 20) / 20;
    const nc = Math.max(0, ctc * (v2 - v1) / (10 * prnt)) * f;
    return nc;
  }

  function classe(valor, limites) {
    let i = 0;
    while (i < limites.length && valor > limites[i]) i++;
    return i; // 0 = muito baixo ... 4 = muito alto
  }

  // Produtividade em t/ha
  function toneladas(cult, prod) { return prod * cult.kg_por_unidade / 1000; }

  function nitrogenio(cult, tha, opc) {
    const r = cult.n_regra;
    if (r.fixacao_biologica) return { dose: 0, nota: 'Soja: N via fixação biológica (inoculação). Não se recomenda N mineral.' };
    if (r.cana_planta_kg_ha !== undefined) {
      const d = opc.canaPlanta ? r.cana_planta_kg_ha : Math.min(r.max, Math.max(r.min, r.soca_kg_N_por_t * tha));
      return { dose: d, nota: opc.canaPlanta ? 'Cana-planta' : 'Cana-soca: proporcional à produtividade esperada' };
    }
    let d = r.kg_N_por_t * tha - (opc.sojaAnterior ? r.credito_soja_anterior : 0);
    d = Math.min(r.max, Math.max(r.min, d));
    return { dose: d, nota: opc.sojaAnterior ? 'Descontado crédito da soja anterior' : '' };
  }

  // P e K por balanço: exportação × produtividade × fator da classe de teor
  function fosforoPotassio(cult, tha, interp, P, K) {
    const cp = classe(P, interp.P_resina_mg_dm3[cult.classes_p]);
    const ck = classe(K, interp.K_mmolc_dm3);
    return {
      classeP: interp.classes[cp], classeK: interp.classes[ck],
      P2O5: cult.exportacao_kg_t.P2O5 * tha * interp.fator_dose[cp],
      K2O: cult.exportacao_kg_t.K2O * tha * interp.fator_dose[ck]
    };
  }

  function vigorSimulado(lon, lat, s) {
    const a = Math.sin(lon * 900 + s) * Math.cos(lat * 1100 - s * 0.7);
    const b = Math.sin(lon * 2300 + lat * 1700 + s * 1.3) * 0.35;
    return Math.max(0, Math.min(1, 0.55 + 0.3 * a + 0.15 * b + Math.sin(lon * 91733 + lat * 47911) * 0.08));
  }

  const api = { analise, calagem, classe, toneladas, nitrogenio, fosforoPotassio, vigorSimulado };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AB = api;
})(typeof window !== 'undefined' ? window : globalThis);
