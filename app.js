/* Adubação Brasil – interface (pt-BR). */
(async function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const carregar = async f => (await fetch('dados/' + f)).json();
  const [CULT, INTERP] = await Promise.all(['culturas.json', 'interpretacao_sp.json'].map(carregar));

  // Fontes mostradas junto a cada resultado
  const FONTE = {
    calagem: 'Método da saturação por bases – Recomendações de Adubação e Calagem para o Estado de São Paulo (IAC, Boletim 100). V2 da cultura: valor de referência a conferir.',
    classes: 'Classes de teor de P resina e K trocável do Estado de São Paulo (IAC, Boletim 100).',
    balanco: 'Dose estimada por exportação da cultura × produtividade × fator da classe de teor (método de balanço; coeficientes de referência em dados/culturas.json).',
    soloCalc: 'SB = K + Ca + Mg; CTC = SB + (H+Al); V% = 100·SB/CTC (definições padrão da análise de solo).',
    clima: 'NASA POWER (Prediction Of Worldwide Energy Resources), comunidade Agroclimatologia, climatologia de longo prazo. https://power.larc.nasa.gov',
  };
  const fonte = (k, extra) => `<div style="font-size:12px;color:#5a665d;margin-top:4px">📚 <b>Fonte:</b> ${FONTE[k]}${extra ? ' ' + extra : ''}</div>`;

  const S = { pol: null, ha: 0, cent: null, clima: null };

  // ---------- navegação ----------
  const passos = [...document.querySelectorAll('section.passo')];
  passos.forEach((p, i) => { const b = document.createElement('button'); b.textContent = p.dataset.t; if (p.id === 'p-pro') b.className = 'pro'; b.onclick = () => ir(i); $('#nav').appendChild(b); });
  function ir(i) {
    passos.forEach((p, j) => p.hidden = j !== i);
    [...$('#nav').children].forEach((b, j) => b.classList.toggle('on', j === i));
    const id = passos[i].id;
    if (id === 'p-talhao') setTimeout(() => mapa.invalidateSize(), 60);
    if (id === 'p-solo') atualizaSolo();
    if (id === 'p-clima') clima();
    if (id === 'p-res') recomendar();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => ir(+b.dataset.ir));
  const toast = t => { $('#toast').textContent = t; $('#toast').hidden = false; setTimeout(() => $('#toast').hidden = true, 2600); };

  // ---------- mapa ----------
  const sat = () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagens © Esri, Maxar, Earthstar Geographics' });
  const osm = () => L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
  const base = () => sat();
  const mapa = L.map('mapa').setView([-12.62, -55.52], 12);
  const camSat = sat().addTo(mapa);
  L.control.layers({ 'Satélite': camSat, 'Mapa': osm() }, null, { position: 'topright' }).addTo(mapa);
  let vert = [], linha = null, camada = null;
  mapa.on('click', e => {
    if (S.pol) return;
    vert.push([e.latlng.lat, e.latlng.lng]);
    if (linha) mapa.removeLayer(linha);
    linha = L.polyline(vert, { color: '#1f6b3a', dashArray: '4' }).addTo(mapa);
    $('#estado').textContent = vert.length + ' vértices – toque em "Fechar polígono" ao terminar';
  });
  $('#bFechar').onclick = () => vert.length >= 3 ? definir(vert.map(v => [v[1], v[0]])) : toast('Marque pelo menos 3 pontos');
  $('#bLimpar').onclick = () => { vert = []; S.pol = null; S.clima = null; [linha, camada].forEach(l => l && mapa.removeLayer(l)); $('#infoTalhao').innerHTML = ''; $('#estado').textContent = 'Toque no mapa para começar'; };
  $('#bExemplo').onclick = () => definir([[-55.5230, -12.6170], [-55.5165, -12.6172], [-55.5163, -12.6235], [-55.5228, -12.6233]]);
  $('#fGeo').onchange = async e => {
    try { const g = JSON.parse(await e.target.files[0].text()); const f = g.type === 'FeatureCollection' ? g.features[0] : g.type === 'Feature' ? g : { geometry: g };
      definir(f.geometry.coordinates[0].slice(0, -1)); } catch { toast('Arquivo inválido: use um GeoJSON com polígono'); }
  };
  function definir(c) {
    S.pol = turf.polygon([[...c, c[0]]]); S.ha = turf.area(S.pol) / 1e4; S.cent = turf.centroid(S.pol).geometry.coordinates; S.clima = null;
    [linha, camada].forEach(l => l && mapa.removeLayer(l)); vert = [];
    camada = L.geoJSON(S.pol, { style: { color: '#0f3d22', weight: 3, fillOpacity: .15 } }).addTo(mapa);
    setTimeout(() => { mapa.invalidateSize(); mapa.fitBounds(camada.getBounds(), { maxZoom: 16 }); }, 60);
    $('#estado').textContent = 'Talhão definido';
    $('#infoTalhao').innerHTML = `<div class="ok">Área: <b>${S.ha.toFixed(1)} ha</b> · Centro: ${S.cent[1].toFixed(4)}, ${S.cent[0].toFixed(4)}</div>` +
      `<div style="font-size:12px;color:#5a665d;margin-top:4px">📚 <b>Fonte:</b> área geodésica calculada com Turf.js sobre o polígono desenhado; imagem de satélite © Esri, Maxar, Earthstar Geographics.</div>`;
  }

  // ---------- cultura ----------
  function cultura() { return CULT[$('#cultura').value]; }
  function atualizaCultura() {
    const c = cultura(), k = $('#cultura').value;
    $('#un').textContent = c.unidade; $('#prod').value = c.produtividade_padrao;
    $('#cSoja').hidden = k !== 'milho'; $('#cCana').hidden = k !== 'cana';
    $('#prof').value = k === 'cana' ? '40' : '20';
  }
  $('#cultura').onchange = atualizaCultura; atualizaCultura();

  // ---------- solo ----------
  const num = id => +$('#' + id).value || 0;
  function solo() { return AB.analise({ K: num('K'), Ca: num('Ca'), Mg: num('Mg'), HAl: num('HAl'), Al: num('Al') }); }
  function atualizaSolo() {
    const s = solo();
    $('#calcSolo').innerHTML = `SB <b>${s.SB.toFixed(1)}</b> · CTC <b>${s.CTC.toFixed(1)}</b> mmolc/dm³ · V% <b>${s.V.toFixed(0)}%</b> · m% <b>${s.m.toFixed(0)}%</b>` + fonte('soloCalc');
  }
  document.querySelectorAll('#p-solo input').forEach(i => i.oninput = atualizaSolo);

  // ---------- clima (NASA POWER) ----------
  let gClima = null;
  async function clima() {
    if (!S.cent) { $('#infoClima').innerHTML = '<div class="aviso">Defina primeiro o talhão (passo 1).</div>'; return; }
    if (!S.clima) {
      $('#infoClima').textContent = 'Buscando dados da NASA POWER…';
      try {
        const u = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=PRECTOTCORR,T2M&community=AG&longitude=${S.cent[0].toFixed(3)}&latitude=${S.cent[1].toFixed(3)}&format=JSON`;
        const r = await fetch(u); if (!r.ok) throw new Error(r.status);
        S.clima = await r.json();
      } catch (e) { $('#infoClima').innerHTML = '<div class="aviso">Não foi possível acessar a NASA POWER agora. Tente de novo mais tarde.</div>'; return; }
    }
    const p = S.clima.properties.parameter, M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], dias = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const chuva = M.map((m, i) => p.PRECTOTCORR[m] * dias[i]), temp = M.map(m => p.T2M[m]);
    const anual = chuva.reduce((a, b) => a + b, 0);
    const per = S.clima.header && S.clima.header.start && S.clima.header.end ? `Período: ${S.clima.header.start}–${S.clima.header.end}.` : '';
    $('#infoClima').innerHTML = `Chuva média anual <b>${anual.toFixed(0)} mm</b> · Temperatura média <b>${p.T2M.ANN.toFixed(1)} °C</b>` + fonte('clima', per);
    if (gClima) gClima.destroy();
    gClima = new Chart($('#gClima'), { data: { labels: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'], datasets: [
      { type: 'bar', label: 'Chuva (mm/mês)', data: chuva, backgroundColor: '#5b9bd5', yAxisID: 'y' },
      { type: 'line', label: 'Temperatura (°C)', data: temp, borderColor: '#d9822b', pointRadius: 2, yAxisID: 'y2' }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'bottom' } },
        scales: { y: { title: { display: true, text: 'mm' } }, y2: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '°C' } } } } });
  }

  // ---------- recomendação ----------
  let mapaVig = null, camVig = null;
  function recomendar() {
    if (!S.pol) { $('#res').innerHTML = '<div class="aviso">Defina primeiro o talhão (passo 1).</div>'; return; }
    const c = cultura(), k = $('#cultura').value, s = solo();
    const tha = AB.toneladas(c, num('prod'));
    const nc = AB.calagem(s.CTC, s.V, c.v2, num('prnt'), +$('#prof').value);
    const n = AB.nitrogenio(c, tha, { sojaAnterior: $('#sojaAnt').checked, canaPlanta: $('#ciclo').value === 'planta' });
    const pk = AB.fosforoPotassio(c, tha, INTERP, num('P'), num('K'));
    $('#res').innerHTML = `
      <div class="cards">
        <div class="card cal"><div class="k">Calcário (PRNT ${num('prnt')}%)</div><div class="v">${nc.toFixed(1)}</div><div class="u">t/ha · ${(nc * S.ha).toFixed(0)} t no talhão</div><small>V% de ${s.V.toFixed(0)}% para ${c.v2}%</small>${fonte('calagem')}</div>
        <div class="card"><div class="k">Nitrogênio (N)</div><div class="v">${n.dose.toFixed(0)}</div><div class="u">kg/ha</div><small>${n.nota}</small>${fonte('balanco')}</div>
        <div class="card"><div class="k">Fósforo (P₂O₅)</div><div class="v">${pk.P2O5.toFixed(0)}</div><div class="u">kg/ha</div><small>P resina ${num('P')} mg/dm³: <b>${pk.classeP}</b></small>${fonte('classes')}${fonte('balanco')}</div>
        <div class="card"><div class="k">Potássio (K₂O)</div><div class="v">${pk.K2O.toFixed(0)}</div><div class="u">kg/ha</div><small>K ${num('K')} mmolc/dm³: <b>${pk.classeK}</b></small>${fonte('classes')}${fonte('balanco')}</div>
      </div>
      <div class="ok" style="margin-top:10px">Total para o talhão (${S.ha.toFixed(1)} ha): <b>${(nc * S.ha).toFixed(1)} t</b> de calcário · <b>${(n.dose * S.ha).toFixed(0)} kg</b> N · <b>${(pk.P2O5 * S.ha).toFixed(0)} kg</b> P₂O₅ · <b>${(pk.K2O * S.ha).toFixed(0)} kg</b> K₂O<br><small>💰 Custo, escolha dos adubos comerciais (ureia, MAP, KCl…) e dose economicamente ótima: <b>versão Pro</b>.</small></div>
      <div class="aviso">Recomendação média para todo o talhão, com base em métodos de referência. Confirme com um engenheiro agrônomo antes de aplicar.</div>`;
    vigor();
  }
  function vigor() {
    if (!mapaVig) { mapaVig = L.map('mapaVig', { zoomControl: false }); base().addTo(mapaVig); }
    if (camVig) mapaVig.removeLayer(camVig);
    const bb = turf.bbox(S.pol), lado = Math.max(20, Math.sqrt(S.ha * 1e4 / 900));
    const g = turf.squareGrid(bb, lado / 1000, { units: 'kilometers', mask: S.pol });
    const vals = g.features.map(f => { const c = turf.centroid(f).geometry.coordinates; return f.properties.v = AB.vigorSimulado(c[0], c[1], 3); });
    const o = [...vals].sort((a, b) => a - b), t1 = o[Math.floor(o.length / 3)], t2 = o[Math.floor(2 * o.length / 3)];
    const cor = v => v < t1 ? '#d9a441' : v < t2 ? '#8fbf5a' : '#2e7d32';
    camVig = L.geoJSON(g, { style: f => ({ stroke: false, fillColor: cor(f.properties.v), fillOpacity: .85 }) }).addTo(mapaVig);
    setTimeout(() => { mapaVig.invalidateSize(); mapaVig.fitBounds(camVig.getBounds()); }, 80);
  }

  // ---------- salvar / abrir ----------
  $('#bSalvar').onclick = () => {
    if (!S.pol) return toast('Defina primeiro o talhão');
    const campos = ['cultura', 'prod', 'ciclo', 'ph', 'mo', 'P', 'K', 'Ca', 'Mg', 'HAl', 'Al', 'prnt', 'prof'];
    const dados = { versao: '0.1', salvo_em: new Date().toISOString(), talhao: S.pol, sojaAnterior: $('#sojaAnt').checked };
    campos.forEach(c => dados[c] = $('#' + c).value);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
    a.download = 'meu_talhao.json'; document.body.appendChild(a); a.click(); a.remove();
  };
  $('#fTalhao').onchange = async e => {
    try {
      const d = JSON.parse(await e.target.files[0].text());
      $('#cultura').value = d.cultura; atualizaCultura();
      Object.keys(d).forEach(k => { const el = document.getElementById(k); if (el && typeof d[k] === 'string') el.value = d[k]; });
      $('#sojaAnt').checked = !!d.sojaAnterior;
      definir(d.talhao.geometry.coordinates[0].slice(0, -1)); recomendar(); toast('Talhão aberto ✔');
    } catch { toast('Arquivo inválido'); }
  };

  ir(0);
})();
