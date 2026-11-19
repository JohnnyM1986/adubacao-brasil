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


  // ETo FAO-56 Penman-Monteith (Allen et al., 1998), valores médios mensais.
  // tmax, tmin, tmean °C; rh %; u2 m/s; rs MJ/m²/dia; lat graus; z altitude m; mes 1..12
  function eto(o) {
    const P = 101.3 * Math.pow((293 - 0.0065 * (o.z || 0)) / 293, 5.26), gam = 0.000665 * P;
    const es = t => 0.6108 * Math.exp(17.27 * t / (t + 237.3));
    const esm = (es(o.tmax) + es(o.tmin)) / 2, ea = esm * o.rh / 100;
    const D = 4098 * es(o.tmean) / Math.pow(o.tmean + 237.3, 2);
    const J = Math.round(30.4 * o.mes - 15), phi = o.lat * Math.PI / 180;
    const dr = 1 + 0.033 * Math.cos(2 * Math.PI * J / 365), d = 0.409 * Math.sin(2 * Math.PI * J / 365 - 1.39);
    const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(d))));
    const Ra = 24 * 60 / Math.PI * 0.0820 * dr * (ws * Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.sin(ws));
    const Rso = (0.75 + 2e-5 * (o.z || 0)) * Ra, Rns = 0.77 * o.rs;
    const sig = 4.903e-9, rel = Math.min(1, o.rs / Rso);
    const Rnl = sig * (Math.pow(o.tmax + 273.16, 4) + Math.pow(o.tmin + 273.16, 4)) / 2 * (0.34 - 0.14 * Math.sqrt(ea)) * (1.35 * rel - 0.35);
    const Rn = Rns - Rnl;
    return Math.max(0, (0.408 * D * Rn + gam * 900 / (o.tmean + 273) * o.u2 * (esm - ea)) / (D + gam * (1 + 0.34 * o.u2)));
  }

  // Balanço hídrico climatológico (Thornthwaite & Mather, 1955), mensal, CAD em mm.
  function balancoHidrico(P, ETP, CAD) {
    const n = 12; let arm = CAD;
    // iteração até estabilizar o armazenamento inicial (ano típico, ciclo fechado)
    let res = [];
    for (let volta = 0; volta < 6; volta++) {
      let negAc = arm < CAD ? CAD * Math.log(arm / CAD) : 0; res = [];
      for (let i = 0; i < n; i++) {
        const pe = P[i] - ETP[i]; const armAnt = arm;
        if (pe < 0) { negAc += pe; arm = CAD * Math.exp(negAc / CAD); }
        else { arm = Math.min(CAD, arm + pe); negAc = arm < CAD ? CAD * Math.log(arm / CAD) : 0; }
        const alt = arm - armAnt;
        const etr = pe < 0 ? P[i] - alt : ETP[i];
        res.push({ P: P[i], ETP: ETP[i], ARM: arm, ETR: etr, DEF: Math.max(0, ETP[i] - etr), EXC: pe > 0 ? Math.max(0, pe - alt) : 0 });
      }
    }
    return res;
  }

  const api = { eto, balancoHidrico, analise, calagem, classe, toneladas, nitrogenio, fosforoPotassio, vigorSimulado };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AB = api;
})(typeof window !== 'undefined' ? window : globalThis);
