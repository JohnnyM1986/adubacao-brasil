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
  // Leitura de arquivos: KML / KMZ (Google Earth), Shapefile .zip, GeoJSON
  function primeiroPoligono(gj) {
    const fs = gj.type === 'FeatureCollection' ? gj.features : [gj.type === 'Feature' ? gj : { geometry: gj }];
    for (const f of fs) {
      const g = f && f.geometry; if (!g) continue;
      if (g.type === 'Polygon') return g.coordinates[0];
      if (g.type === 'MultiPolygon') return g.coordinates[0][0];
    }
    return null;
  }
  async function lerArquivo(file) {
    const nome = file.name.toLowerCase();
    if (nome.endsWith('.kml')) return toGeoJSON.kml(new DOMParser().parseFromString(await file.text(), 'text/xml'));
    if (nome.endsWith('.kmz')) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const kml = Object.keys(zip.files).find(n => n.toLowerCase().endsWith('.kml'));
      if (!kml) throw new Error('KMZ sem KML');
      return toGeoJSON.kml(new DOMParser().parseFromString(await zip.file(kml).async('string'), 'text/xml'));
    }
    if (nome.endsWith('.zip')) { const r = await shp(await file.arrayBuffer()); return Array.isArray(r) ? r[0] : r; }
    return JSON.parse(await file.text());
  }
  $('#fGeo').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const anel = primeiroPoligono(await lerArquivo(f));
      if (!anel) throw new Error('sem polígono');
      definir(anel.slice(0, -1).map(c => [c[0], c[1]]));
      toast('Talhão carregado de ' + f.name + ' ✔');
    } catch (err) { toast('Não encontrei um polígono no arquivo (use KML, KMZ, Shapefile .zip ou GeoJSON)'); }
    e.target.value = '';
  };
  function definir(c) {
    S.pol = turf.polygon([[...c, c[0]]]); S.ha = turf.area(S.pol) / 1e4; S.cent = turf.centroid(S.pol).geometry.coordinates; S.clima = null;
    [linha, camada].forEach(l => l && mapa.removeLayer(l)); vert = [];
    camada = L.geoJSON(S.pol, { style: { color: '#0f3d22', weight: 3, fillOpacity: .15 } }).addTo(mapa);
    setTimeout(() => { mapa.invalidateSize(); mapa.fitBounds(camada.getBounds(), { maxZoom: 16 }); }, 60);
    $('#estado').textContent = 'Talhão definido';
    $('#infoTalhao').innerHTML = `<div class="ok">Área: <b>${S.ha.toFixed(1)} ha</b> · Centro: ${S.cent[1].toFixed(4)}, ${S.cent[0].toFixed(4)}</div>` +
      `<div style="font-size:12px;color:#5a665d;margin-top:4px">📚 <b>Fonte:</b> área geodésica calculada com Turf.js sobre o polígono desenhado ou carregado; imagem de satélite © Esri, Maxar, Earthstar Geographics.</div>`;
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
  function recomendar() {
    if (!S.pol) { $('#res').innerHTML = '<div class="aviso">Defina primeiro o talhão (passo 1).</div>'; return; }
    const c = cultura(), k = $('#cultura').value, s = solo();
    const tha = AB.toneladas(c, num('prod'));
    const nc = AB.calagem(s.CTC, s.V, c.v2, num('prnt'), +$('#prof').value);
    const n = AB.nitrogenio(c, tha, { sojaAnterior: $('#sojaAnt').checked, canaPlanta: $('#ciclo').value === 'planta' });
    const pk = AB.fosforoPotassio(c, tha, INTERP, num('P'), num('K'));
    S.res = { c, k, s, tha, nc, n, pk };
    $('#res').innerHTML = `
      <div class="cards">
        <div class="card cal"><div class="k">Calcário (PRNT ${num('prnt')}%)</div><div class="v">${nc.toFixed(1)}</div><div class="u">t/ha · ${(nc * S.ha).toFixed(0)} t no talhão</div><small>V% de ${s.V.toFixed(0)}% para ${c.v2}%</small>${fonte('calagem')}</div>
        <div class="card"><div class="k">Nitrogênio (N)</div><div class="v">${n.dose.toFixed(0)}</div><div class="u">kg/ha</div><small>${n.nota}</small>${fonte('balanco')}</div>
        <div class="card"><div class="k">Fósforo (P₂O₅)</div><div class="v">${pk.P2O5.toFixed(0)}</div><div class="u">kg/ha</div><small>P resina ${num('P')} mg/dm³: <b>${pk.classeP}</b></small>${fonte('classes')}${fonte('balanco')}</div>
        <div class="card"><div class="k">Potássio (K₂O)</div><div class="v">${pk.K2O.toFixed(0)}</div><div class="u">kg/ha</div><small>K ${num('K')} mmolc/dm³: <b>${pk.classeK}</b></small>${fonte('classes')}${fonte('balanco')}</div>
      </div>
      <div class="ok" style="margin-top:10px">Total para o talhão (${S.ha.toFixed(1)} ha): <b>${(nc * S.ha).toFixed(1)} t</b> de calcário · <b>${(n.dose * S.ha).toFixed(0)} kg</b> N · <b>${(pk.P2O5 * S.ha).toFixed(0)} kg</b> P₂O₅ · <b>${(pk.K2O * S.ha).toFixed(0)} kg</b> K₂O<br><small>💰 Custo, escolha dos adubos comerciais (ureia, MAP, KCl…) e dose economicamente ótima: <b>versão Pro</b>.</small></div>
      <div class="aviso">Recomendação média para todo o talhão, com base em métodos de referência. Confirme com um engenheiro agrônomo antes de aplicar.</div>`;
  }

  // ---------- relatório (PDF via impressão) ----------
  function svgTalhao() {
    const ring = S.pol.geometry.coordinates[0], xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const k = Math.cos(S.cent[1] * Math.PI / 180), w = (maxx - minx) * k, h = maxy - miny, sc = 150 / Math.max(w, h);
    const pts = ring.map(p => `${(10 + (p[0] - minx) * k * sc).toFixed(1)},${(10 + (maxy - p[1]) * sc).toFixed(1)}`).join(' ');
    return `<svg width="170" height="170" viewBox="0 0 170 170"><polygon points="${pts}" fill="#e7f2ea" stroke="#1f6b3a" stroke-width="2"/></svg>`;
  }
  $('#bRelatorio').onclick = () => {
    if (!S.pol) return toast('Defina primeiro o talhão');
    recomendar(); const R = S.res; if (!R) return;
    const hoje = new Date().toLocaleDateString('pt-BR');
    let clima = '<tr><td colspan="2">Não consultado (abra o passo 4 – Clima antes de gerar o relatório).</td></tr>';
    if (S.clima) { const p = S.clima.properties.parameter, d = [31,28,31,30,31,30,31,31,30,31,30,31], M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
      clima = `<tr><td>Chuva média anual</td><td>${M.reduce((a, m, i) => a + p.PRECTOTCORR[m] * d[i], 0).toFixed(0)} mm</td></tr><tr><td>Temperatura média anual</td><td>${p.T2M.ANN.toFixed(1)} °C</td></tr>`; }
    $('#relatorio').innerHTML = `
      <div class="top"><div><h1>🌱 Relatório de calagem e adubação</h1><div>Adubação Brasil · versão gratuita (beta) · ${hoje}</div></div>${svgTalhao()}</div>
      <h2>Talhão</h2><table><tr><td>Área</td><td>${S.ha.toFixed(1)} ha</td></tr><tr><td>Centro (lat, lon)</td><td>${S.cent[1].toFixed(5)}, ${S.cent[0].toFixed(5)}</td></tr></table>
      <div class="f">Fonte: área geodésica calculada sobre o polígono (Turf.js).</div>
      <h2>Cultura</h2><table><tr><td>Cultura</td><td>${R.c.nome}</td></tr><tr><td>Produtividade esperada</td><td>${num('prod')} ${R.c.unidade} (${R.tha.toFixed(1)} t/ha)</td></tr>
        ${R.k === 'milho' ? `<tr><td>Soja na safra anterior</td><td>${$('#sojaAnt').checked ? 'sim' : 'não'}</td></tr>` : ''}${R.k === 'cana' ? `<tr><td>Ciclo</td><td>${$('#ciclo').value === 'planta' ? 'cana-planta' : 'cana-soca'}</td></tr>` : ''}</table>
      <h2>Análise de solo (0–20 cm)</h2><table><tr><th>pH CaCl₂</th><th>M.O. g/dm³</th><th>P resina mg/dm³</th><th>K</th><th>Ca</th><th>Mg</th><th>H+Al</th><th>Al</th></tr>
        <tr><td>${num('ph')}</td><td>${num('mo')}</td><td>${num('P')}</td><td>${num('K')}</td><td>${num('Ca')}</td><td>${num('Mg')}</td><td>${num('HAl')}</td><td>${num('Al')}</td></tr></table>
      <div>SB ${R.s.SB.toFixed(1)} · CTC ${R.s.CTC.toFixed(1)} mmolc/dm³ · V% ${R.s.V.toFixed(0)}% · m% ${R.s.m.toFixed(0)}%</div><div class="f">Fonte: ${FONTE.soloCalc}</div>
      <h2>Clima do local</h2><table>${clima}</table><div class="f">Fonte: ${FONTE.clima}</div>
      <h2>Recomendação</h2><table><tr><th>Insumo</th><th>Dose</th><th>Total no talhão</th><th>Fonte / método</th></tr>
        <tr><td>Calcário (PRNT ${num('prnt')}%, ${$('#prof').value} cm)</td><td>${R.nc.toFixed(1)} t/ha</td><td>${(R.nc * S.ha).toFixed(1)} t</td><td class="f">${FONTE.calagem} V% ${R.s.V.toFixed(0)}% → ${R.c.v2}%.</td></tr>
        <tr><td>Nitrogênio (N)</td><td>${R.n.dose.toFixed(0)} kg/ha</td><td>${(R.n.dose * S.ha).toFixed(0)} kg</td><td class="f">${R.n.nota ? R.n.nota + '. ' : ''}${FONTE.balanco}</td></tr>
        <tr><td>Fósforo (P₂O₅)</td><td>${R.pk.P2O5.toFixed(0)} kg/ha</td><td>${(R.pk.P2O5 * S.ha).toFixed(0)} kg</td><td class="f">Teor ${R.pk.classeP}. ${FONTE.classes} ${FONTE.balanco}</td></tr>
        <tr><td>Potássio (K₂O)</td><td>${R.pk.K2O.toFixed(0)} kg/ha</td><td>${(R.pk.K2O * S.ha).toFixed(0)} kg</td><td class="f">Teor ${R.pk.classeK}. ${FONTE.classes} ${FONTE.balanco}</td></tr></table>
      <div class="avisoR"><b>Aviso:</b> recomendação média para todo o talhão, gerada por ferramenta de apoio em versão beta com métodos de referência. Deve ser confirmada por um engenheiro agrônomo antes da aplicação.</div>
      <div class="f" style="margin-top:8px">Gerado em johnnym1986.github.io/adubacao-brasil · Versão Pro: mapas de satélite, taxa variável, leitura do laudo, vários talhões.</div>`;
    setTimeout(() => window.print(), 150);
  };


  // ---------- exportar KML / KMZ ----------
  function baixar(nome, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); }
  function textoKml() {
    recomendar(); const R = S.res;
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const desc = R ? `${R.c.nome} – ${num('prod')} ${R.c.unidade}\nCalcário: ${R.nc.toFixed(1)} t/ha\nN: ${R.n.dose.toFixed(0)} kg/ha · P2O5: ${R.pk.P2O5.toFixed(0)} kg/ha · K2O: ${R.pk.K2O.toFixed(0)} kg/ha\nÁrea: ${S.ha.toFixed(1)} ha\nAdubação Brasil (beta) – confirmar com engenheiro agrônomo.` : '';
    const coords = S.pol.geometry.coordinates[0].map(c => `${c[0].toFixed(7)},${c[1].toFixed(7)},0`).join(' ');
    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Talhão – Adubação Brasil</name>
<Style id="t"><LineStyle><color>ff3a6b1f</color><width>3</width></LineStyle><PolyStyle><color>553a6b1f</color></PolyStyle></Style>
<Placemark><name>Talhão (${S.ha.toFixed(1)} ha)</name><description>${esc(desc)}</description><styleUrl>#t</styleUrl>
<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
  }
  $('#bKml').onclick = () => { if (!S.pol) return toast('Defina primeiro o talhão'); baixar('talhao.kml', new Blob([textoKml()], { type: 'application/vnd.google-earth.kml+xml' })); };
  $('#bKmz').onclick = async () => {
    if (!S.pol) return toast('Defina primeiro o talhão');
    const z = new JSZip(); z.file('doc.kml', textoKml());
    baixar('talhao.kmz', await z.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz' }));
  };

  // ---------- salvar / abrir ----------
  $('#bSalvar').onclick = () => {
    if (!S.pol) return toast('Defina primeiro o talhão');
    const campos = ['cultura', 'prod', 'ciclo', 'ph', 'mo', 'P', 'K', 'Ca', 'Mg', 'HAl', 'Al', 'prnt', 'prof'];
    const dados = { versao: '0.1', salvo_em: new Date().toISOString(), talhao: S.pol, sojaAnterior: $('#sojaAnt').checked };
    campos.forEach(c => dados[c] = $('#' + c).value);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
    a.download = 'projeto_talhao.json'; document.body.appendChild(a); a.click(); a.remove();
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

  $('#verPro').onclick = e => { e.preventDefault(); ir(passos.findIndex(p => p.id === 'p-pro')); };
  ir(0);
})();
