/* Adubação Brasil – interface (pt-BR). */
(async function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const carregar = async f => (await fetch('dados/' + f)).json();
  const [CULT, INTERP] = await Promise.all(['culturas.json', 'interpretacao_sp.json'].map(carregar));

  // Fontes mostradas junto a cada resultado
  const FONTE = {
    calagem: 'Método da saturação por bases: NC = CTC × (V2 − V1) / (10 × PRNT), adotado nas Recomendações de Adubação e Calagem para o Estado de São Paulo (IAC, Boletim 100).',
    classes: 'Classes de teor de P resina e K trocável e produção relativa esperada, Estado de São Paulo (IAC, Boletim 100).',
    balanco: 'Dose estimada por exportação da cultura × produtividade × fator da classe de teor (método de balanço; coeficientes de referência em dados/culturas.json).',
    soloCalc: 'SB = K + Ca + Mg; CTC = SB + (H+Al); V% = 100·SB/CTC (definições padrão da análise de solo).',
    clima: 'NASA POWER (Prediction Of Worldwide Energy Resources), comunidade Agroclimatologia, climatologia de longo prazo. https://power.larc.nasa.gov',
    balanco_h: 'Evapotranspiração de referência FAO-56 Penman-Monteith (Allen et al., 1998) com dados NASA POWER; balanço hídrico climatológico de Thornthwaite & Mather (1955), CAD 100 mm.',
    previsao: 'Weather data by Open-Meteo.com (CC BY 4.0), modelos meteorológicos nacionais. https://open-meteo.com',
    altitude: 'Modelo digital de elevação de 90 m via Open-Meteo Elevation API (CC BY 4.0). Declividade estimada por plano ajustado aos pontos amostrados.',
  };
  const fonte = (k, extra) => `<div style="font-size:12px;color:#5a665d;margin-top:4px">📚 <b>Fonte:</b> ${FONTE[k]}${extra ? ' ' + extra : ''}</div>`;

  const S = { pol: null, ha: 0, cent: null, clima: null, alt: null, prev: null };

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
  const mapa = L.map('mapa').setView([-21.33, -48.10], 11);
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
  $('#bExemplo').onclick = () => definir([[-48.1030, -21.3270], [-48.0962, -21.3272], [-48.0960, -21.3335], [-48.1028, -21.3333]]);
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
    S.pol = turf.polygon([[...c, c[0]]]); S.ha = turf.area(S.pol) / 1e4; S.cent = turf.centroid(S.pol).geometry.coordinates; S.clima = null; S.alt = null; S.prev = null;
    [linha, camada].forEach(l => l && mapa.removeLayer(l)); vert = [];
    camada = L.geoJSON(S.pol, { style: { color: '#0f3d22', weight: 3, fillOpacity: .15 } }).addTo(mapa);
    setTimeout(() => { mapa.invalidateSize(); mapa.fitBounds(camada.getBounds(), { maxZoom: 16 }); }, 60);
    $('#estado').textContent = 'Talhão definido';
    $('#infoTalhao').innerHTML = `<div class="ok">Área: <b>${S.ha.toFixed(1)} ha</b> · Centro: ${S.cent[1].toFixed(4)}, ${S.cent[0].toFixed(4)}</div>` +
      `<div style="font-size:12px;color:#5a665d;margin-top:4px">📚 <b>Fonte:</b> área geodésica calculada com Turf.js sobre o polígono desenhado ou carregado; imagem de satélite © Esri, Maxar, Earthstar Geographics.</div><div id="infoAlt" class="nota" style="margin-top:8px">⛰️ Calculando altitude…</div>`;
    altitude();
  }
  async function altitude() {
    try {
      const bb = turf.bbox(S.pol), passo = Math.max((bb[2] - bb[0]), (bb[3] - bb[1])) / 6;
      let pts = turf.pointGrid(bb, passo, { units: 'degrees', mask: S.pol }).features.map(f => f.geometry.coordinates);
      pts = pts.concat(S.pol.geometry.coordinates[0].slice(0, -1), [S.cent]).slice(0, 100);
      const u = `https://api.open-meteo.com/v1/elevation?latitude=${pts.map(p => p[1].toFixed(5)).join(',')}&longitude=${pts.map(p => p[0].toFixed(5)).join(',')}`;
      const r = await fetch(u); if (!r.ok) throw new Error(r.status);
      const z = (await r.json()).elevation;
      // plano z = a·x + b·y + c (x, y em metros)
      const lat0 = S.cent[1] * Math.PI / 180, X = pts.map(p => (p[0] - S.cent[0]) * 111320 * Math.cos(lat0)), Y = pts.map(p => (p[1] - S.cent[1]) * 110540);
      const n = z.length, sx = X.reduce((a, b) => a + b, 0), sy = Y.reduce((a, b) => a + b, 0), sz = z.reduce((a, b) => a + b, 0);
      let sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
      for (let i = 0; i < n; i++) { const x = X[i] - sx / n, y = Y[i] - sy / n, w = z[i] - sz / n; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * w; syz += y * w; }
      const det = sxx * syy - sxy * sxy, a = det ? (sxz * syy - syz * sxy) / det : 0, b = det ? (syz * sxx - sxz * sxy) / det : 0;
      const decl = 100 * Math.sqrt(a * a + b * b), zmin = Math.min(...z), zmax = Math.max(...z);
      S.alt = { media: sz / n, zmin, zmax, decl };
      const pequeno = S.ha < 20 ? ' <small>(talhão pequeno para um modelo de 90 m: valores aproximados)</small>' : '';
      $('#infoAlt').innerHTML = `⛰️ Altitude média <b>${(sz / n).toFixed(0)} m</b> (de ${zmin.toFixed(0)} a ${zmax.toFixed(0)} m) · Declividade média estimada <b>${decl.toFixed(1)}%</b>${pequeno}` + fonte('altitude');
    } catch (e) { $('#infoAlt').textContent = '⛰️ Altitude não disponível agora.'; }
  }

  // ---------- cultura ----------
  function cultura() { return CULT[$('#cultura').value]; }
  function atualizaCultura() {
    const c = cultura(), k = $('#cultura').value;
    $('#un').textContent = c.unidade; $('#prod').value = c.produtividade_padrao;
    $('#cSoja').hidden = true; $('#cCana').hidden = true;
    $('#prof').value = k === 'cana' ? '40' : '20';
    $('#v2').value = c.v2;
  }
  $('#cultura').onchange = atualizaCultura; atualizaCultura();

  // ---------- solo ----------
  const num = id => +$('#' + id).value || 0;
  // conversão para mmolc/dm³
  const fCat = () => $('#uCat').value === 'cmolc' ? 10 : 1;
  const Kmmolc = () => { const u = $('#uK').value, v = num('K'); return u === 'cmolc' ? v * 10 : u === 'mg' ? v / 39.1 : v; };
  const unK = () => ({ mmolc: 'mmolc/dm³', cmolc: 'cmolc/dm³', mg: 'mg/dm³' })[$('#uK').value];
  const resina = () => $('#extr').value === 'resina';
  function rotulos() {
    $('#lP').textContent = (resina() ? 'P resina' : 'P Mehlich-1') + ' (mg/dm³)';
    $('#lK').textContent = 'K (' + unK() + ')';
    document.querySelectorAll('.lCat').forEach(l => l.textContent = l.dataset.n + ' (' + ($('#uCat').value === 'cmolc' ? 'cmolc/dm³' : 'mmolc/dm³') + ')');
    atualizaSolo();
  }
  ['#extr', '#uCat', '#uK'].forEach(id => $(id).onchange = rotulos);
  function solo() { const f = fCat(); return AB.analise({ K: Kmmolc(), Ca: num('Ca') * f, Mg: num('Mg') * f, HAl: num('HAl') * f, Al: num('Al') * f }); }
  function atualizaSolo() {
    const s = solo();
    $('#calcSolo').innerHTML = `SB <b>${s.SB.toFixed(1)}</b> · CTC <b>${s.CTC.toFixed(1)}</b> mmolc/dm³ (= ${(s.CTC / 10).toFixed(2)} cmolc/dm³) · V% <b>${s.V.toFixed(0)}%</b> · m% <b>${s.m.toFixed(0)}%</b>` + fonte('soloCalc', 'Conversões: 1 cmolc = 10 mmolc; K: 1 mmolc/dm³ = 39,1 mg/dm³.');
  }
  document.querySelectorAll('#p-solo input').forEach(i => i.oninput = atualizaSolo);

  // ---------- clima (NASA POWER) ----------
  let gClima = null;
  async function clima() {
    if (!S.cent) { $('#infoClima').innerHTML = '<div class="aviso">Defina primeiro o talhão (passo 1).</div>'; return; }
    if (!S.clima) {
      $('#infoClima').textContent = 'Buscando dados da NASA POWER…';
      try {
        const u = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=PRECTOTCORR,T2M,T2M_MAX,T2M_MIN,RH2M,WS2M,ALLSKY_SFC_SW_DWN&community=AG&longitude=${S.cent[0].toFixed(3)}&latitude=${S.cent[1].toFixed(3)}&format=JSON`;
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
    balanco(p, M, dias, chuva);
    previsao();
  }
  let gBal = null;
  function balanco(p, M, dias, chuva) {
    try {
      const etp = M.map((m, i) => AB.eto({ tmax: p.T2M_MAX[m], tmin: p.T2M_MIN[m], tmean: p.T2M[m], rh: p.RH2M[m], u2: p.WS2M[m], rs: p.ALLSKY_SFC_SW_DWN[m], lat: S.cent[1], z: S.alt ? S.alt.media : 0, mes: i + 1 }) * dias[i]);
      const b = AB.balancoHidrico(chuva, etp, 100); S.bal = b;
      const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
      const defAno = b.reduce((a, m) => a + m.DEF, 0), excAno = b.reduce((a, m) => a + m.EXC, 0);
      const secos = b.map((m, i) => m.DEF > 10 ? nomes[i] : null).filter(Boolean);
      $('#infoBal').innerHTML = `ETo anual <b>${etp.reduce((a, x) => a + x, 0).toFixed(0)} mm</b> · Deficiência hídrica anual <b>${defAno.toFixed(0)} mm</b> · Excedente <b>${excAno.toFixed(0)} mm</b><br>Meses com deficiência (> 10 mm): <b>${secos.length ? secos.join(', ') : 'nenhum'}</b>` + fonte('balanco_h');
      if (gBal) gBal.destroy();
      gBal = new Chart($('#gBal'), { data: { labels: nomes, datasets: [
        { type: 'line', label: 'Chuva (mm)', data: chuva, borderColor: '#5b9bd5', pointRadius: 2 },
        { type: 'line', label: 'ETo (mm)', data: etp, borderColor: '#d9822b', pointRadius: 2 },
        { type: 'bar', label: 'Deficiência (mm)', data: b.map(m => -m.DEF), backgroundColor: '#c0392b' },
        { type: 'bar', label: 'Excedente (mm)', data: b.map(m => m.EXC), backgroundColor: '#7fb3d5' }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { title: { display: true, text: 'mm' } } } } });
    } catch (e) { $('#infoBal').textContent = 'Balanço hídrico não disponível para este local.'; }
  }
  async function previsao() {
    try {
      if (!S.prev) {
        const u = `https://api.open-meteo.com/v1/forecast?latitude=${S.cent[1].toFixed(4)}&longitude=${S.cent[0].toFixed(4)}&daily=precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min,wind_speed_10m_max&timezone=auto&forecast_days=7`;
        const r = await fetch(u); if (!r.ok) throw new Error(r.status); S.prev = (await r.json()).daily;
      }
      const d = S.prev, sem = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
      const linhas = d.time.map((t, i) => { const dt = new Date(t + 'T12:00'); const seco = d.precipitation_sum[i] < 1;
        return `<tr class="${seco ? 'seco' : ''}"><td>${sem[dt.getDay()]} ${dt.getDate()}/${dt.getMonth() + 1}</td><td>${d.precipitation_sum[i].toFixed(1)} mm</td><td>${d.precipitation_probability_max[i] ?? '–'}%</td><td>${d.temperature_2m_min[i].toFixed(0)}–${d.temperature_2m_max[i].toFixed(0)} °C</td><td>${d.wind_speed_10m_max[i].toFixed(0)} km/h</td></tr>`; }).join('');
      $('#previsao').innerHTML = `<table class="prev"><tr><th>Dia</th><th>Chuva</th><th>Prob.</th><th>Temp.</th><th>Vento máx.</th></tr>${linhas}</table><small>Dias em verde: sem chuva prevista (&lt; 1 mm).</small>` + fonte('previsao');
    } catch (e) { $('#previsao').textContent = 'Previsão não disponível agora.'; }
  }

  // ---------- recomendação ----------
  const PR = ['até 70%', '71–90%', '91–100%', 'cerca de 100%', 'cerca de 100%'];
  const LEITURA = ['resposta à adubação muito provável', 'resposta à adubação provável', 'adubação de manutenção', 'resposta pequena à adubação', 'resposta improvável à adubação'];
  function recomendar() {
    if (!S.pol) { $('#res').innerHTML = '<div class="aviso">Defina primeiro o talhão (passo 1).</div>'; return; }
    const c = cultura(), k = $('#cultura').value, s = solo(), v2 = num('v2') || c.v2;
    const nc = AB.calagem(s.CTC, s.V, v2, num('prnt'), +$('#prof').value);
    const res = resina(), iP = res ? AB.classe(num('P'), INTERP.P_resina_mg_dm3[c.classes_p]) : null, iK = res ? AB.classe(Kmmolc(), INTERP.K_mmolc_dm3) : null;
    S.res = { c, k, s, v2, nc, iP, iK, res };
    const nota = k === 'soja' ? '<div class="ok" style="margin-top:10px">🌱 <b>Soja:</b> o nitrogênio vem da fixação biológica (inoculação das sementes); adubação nitrogenada mineral normalmente não é recomendada.' + fonteTxt('Embrapa Soja – Tecnologias de produção de soja.') + '</div>' : '';
    $('#res').innerHTML = `
      <div class="cards">
        <div class="card cal"><div class="k">Calcário (PRNT ${num('prnt')}%, ${$('#prof').value} cm)</div><div class="v">${nc.toFixed(1)}</div><div class="u">t/ha · ${(nc * S.ha).toFixed(1)} t no talhão</div><small>V% de ${s.V.toFixed(0)}% para ${v2}%</small>${fonte('calagem')}</div>
        ${res ? `<div class="card"><div class="k">Fósforo (P resina)</div><div class="v" style="font-size:24px">${INTERP.classes[iP]}</div><div class="u">${num('P')} mg/dm³</div><small>Produção relativa sem adubação: ${PR[iP]} · ${LEITURA[iP]}</small>${fonte('classes')}</div>
        <div class="card"><div class="k">Potássio (K trocável)</div><div class="v" style="font-size:24px">${INTERP.classes[iK]}</div><div class="u">${Kmmolc().toFixed(2)} mmolc/dm³</div><small>Produção relativa sem adubação: ${PR[iK]} · ${LEITURA[iK]}</small>${fonte('classes')}</div>`
        : `<div class="card"><div class="k">Fósforo e potássio (Mehlich-1)</div><div class="u" style="margin-top:6px">As classes de interpretação para Mehlich-1 dependem do estado e do teor de argila. Consulte seu engenheiro agrônomo ou a <b>versão Pro</b>.</div><small>A ferramenta gratuita interpreta apenas laudos com P e K extraídos por resina (padrão do Estado de São Paulo).</small></div>`}
      </div>${nota}
      <div class="aviso" style="margin-top:10px">As <b>doses de N, P₂O₅ e K₂O</b> dependem das tabelas oficiais de cada estado: consulte seu engenheiro agrônomo ou a <b>versão Pro</b>. Mostramos aqui apenas resultados de métodos oficiais.</div>`;
  }
  function fonteTxt(t) { return `<div style="font-size:12px;color:#5a665d;margin-top:4px">📚 <b>Fonte:</b> ${t}</div>`; }

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
    let clima = '<tr><td colspan="2">Não consultado: abra o passo 4 – Clima antes de gerar o relatório para incluir gráficos e previsão.</td></tr>';
    if (S.clima) { const p = S.clima.properties.parameter, d = [31,28,31,30,31,30,31,31,30,31,30,31], M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
      clima = (S.bal ? `<tr><td>Deficiência hídrica anual</td><td>${S.bal.reduce((a, m) => a + m.DEF, 0).toFixed(0)} mm</td></tr>` : '') + `<tr><td>Chuva média anual</td><td>${M.reduce((a, m, i) => a + p.PRECTOTCORR[m] * d[i], 0).toFixed(0)} mm</td></tr><tr><td>Temperatura média anual</td><td>${p.T2M.ANN.toFixed(1)} °C</td></tr>`; }
    $('#relatorio').innerHTML = `
      <div class="top"><div><h1>🌱 Relatório de calagem e fertilidade do solo</h1><div>Adubação Brasil · versão gratuita (beta) · ${hoje}</div></div>${svgTalhao()}</div>
      <h2>Talhão</h2><table><tr><td>Área</td><td>${S.ha.toFixed(1)} ha</td></tr><tr><td>Centro (lat, lon)</td><td>${S.cent[1].toFixed(5)}, ${S.cent[0].toFixed(5)}</td></tr></table>
      ${S.alt ? `<table><tr><td>Altitude média</td><td>${S.alt.media.toFixed(0)} m (${S.alt.zmin.toFixed(0)}–${S.alt.zmax.toFixed(0)} m)</td></tr><tr><td>Declividade média estimada</td><td>${S.alt.decl.toFixed(1)}%</td></tr></table>` : ''}
      <div class="f">Fonte: área geodésica calculada sobre o polígono (Turf.js).${S.alt ? ' ' + FONTE.altitude : ''}</div>
      <h2>Cultura</h2><table><tr><td>Cultura</td><td>${R.c.nome}</td></tr><tr><td>Produtividade esperada</td><td>${num('prod')} ${R.c.unidade} (${AB.toneladas(R.c, num('prod')).toFixed(1)} t/ha)</td></tr>
</table>
      <h2>Análise de solo (0–20 cm)</h2><div class="f">Extrator de P e K: ${resina() ? 'resina' : 'Mehlich-1'} · K em ${unK()} · Ca, Mg, H+Al, Al em ${$('#uCat').value === 'cmolc' ? 'cmolc/dm³' : 'mmolc/dm³'}</div><table><tr><th>pH CaCl₂</th><th>M.O. g/dm³</th><th>P mg/dm³</th><th>K</th><th>Ca</th><th>Mg</th><th>H+Al</th><th>Al</th></tr>
        <tr><td>${num('ph')}</td><td>${num('mo')}</td><td>${num('P')}</td><td>${num('K')}</td><td>${num('Ca')}</td><td>${num('Mg')}</td><td>${num('HAl')}</td><td>${num('Al')}</td></tr></table>
      <div>SB ${R.s.SB.toFixed(1)} · CTC ${R.s.CTC.toFixed(1)} mmolc/dm³ · V% ${R.s.V.toFixed(0)}% · m% ${R.s.m.toFixed(0)}%</div><div class="f">Fonte: ${FONTE.soloCalc}</div>
      <h2>Clima do local</h2><table>${clima}</table>
      ${gClima ? `<div style="display:flex;gap:8px;margin-top:6px"><div style="flex:1"><div class="f"><b>Chuva e temperatura médias mensais</b></div><img src="${gClima.toBase64Image('image/png', 1)}" style="width:100%"></div>${gBal ? `<div style="flex:1"><div class="f"><b>Balanço hídrico (mm/mês)</b></div><img src="${gBal.toBase64Image('image/png', 1)}" style="width:100%"></div>` : ''}</div>` : ''}
      <div class="f">Fonte: ${FONTE.clima}${S.bal ? ' ' + FONTE.balanco_h : ''}</div>
      ${S.prev ? `<h2>Previsão do tempo (gerada em ${hoje})</h2><table><tr><th>Dia</th><th>Chuva</th><th>Prob.</th><th>Temp. mín–máx</th><th>Vento máx.</th></tr>${S.prev.time.map((t, i) => `<tr><td>${t.split('-').reverse().slice(0, 2).join('/')}</td><td>${S.prev.precipitation_sum[i].toFixed(1)} mm</td><td>${S.prev.precipitation_probability_max[i] ?? '–'}%</td><td>${S.prev.temperature_2m_min[i].toFixed(0)}–${S.prev.temperature_2m_max[i].toFixed(0)} °C</td><td>${S.prev.wind_speed_10m_max[i].toFixed(0)} km/h</td></tr>`).join('')}</table><div class="f">Fonte: ${FONTE.previsao}</div>` : ''}
      <h2>Resultado</h2><table><tr><th>Item</th><th>Resultado</th><th>Fonte / método</th></tr>
        <tr><td>Calcário (PRNT ${num('prnt')}%, ${$('#prof').value} cm)</td><td>${R.nc.toFixed(1)} t/ha · ${(R.nc * S.ha).toFixed(1)} t no talhão<br>V% ${R.s.V.toFixed(0)}% → ${R.v2}%</td><td class="f">${FONTE.calagem}</td></tr>
        ${R.res ? `<tr><td>Fósforo (P resina ${num('P')} mg/dm³)</td><td>Teor ${INTERP.classes[R.iP]} · produção relativa sem adubação ${PR[R.iP]}</td><td class="f">${FONTE.classes}</td></tr>
        <tr><td>Potássio (K ${Kmmolc().toFixed(2)} mmolc/dm³)</td><td>Teor ${INTERP.classes[R.iK]} · produção relativa sem adubação ${PR[R.iK]}</td><td class="f">${FONTE.classes}</td></tr>`
        : `<tr><td>Fósforo e potássio (Mehlich-1)</td><td>Interpretação não incluída na versão gratuita</td><td class="f">Classes para Mehlich-1 dependem do estado e do teor de argila: consultar o engenheiro agrônomo.</td></tr>`}
        ${R.k === 'soja' ? '<tr><td>Nitrogênio</td><td>Fixação biológica (inoculação); N mineral normalmente não recomendado</td><td class="f">Embrapa Soja – Tecnologias de produção de soja.</td></tr>' : ''}</table>
      <div class="f">Doses de N, P₂O₅ e K₂O: conforme tabela oficial do estado, definidas pelo engenheiro agrônomo.</div>
      <div class="avisoR"><b>Aviso:</b> resultados médios para todo o talhão, obtidos com métodos oficiais por ferramenta de apoio em versão beta. Devem ser confirmados por um engenheiro agrônomo antes da aplicação.</div>
      <div class="f" style="margin-top:8px">Gerado em johnnym1986.github.io/adubacao-brasil · Versão Pro (ZARC, doses NPK oficiais, satélite, taxa variável): fale com Giacomo (A&G), +593 98 264 3523 (WhatsApp).</div>`;
    setTimeout(() => window.print(), 150);
  };


  // ---------- exportar KML / KMZ ----------
  function baixar(nome, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); }
  function textoKml() {
    recomendar(); const R = S.res;
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const desc = R ? `${R.c.nome}\nCalcário: ${R.nc.toFixed(1)} t/ha (V% ${R.s.V.toFixed(0)} → ${R.v2})${R.res ? `\nP resina: ${INTERP.classes[R.iP]} · K: ${INTERP.classes[R.iK]}` : ''}\nÁrea: ${S.ha.toFixed(1)} ha\nAdubação Brasil (beta) – confirmar com engenheiro agrônomo.` : '';
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
    const campos = ['cultura', 'prod', 'v2', 'extr', 'uCat', 'uK', 'ph', 'mo', 'P', 'K', 'Ca', 'Mg', 'HAl', 'Al', 'prnt', 'prof'];
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
      $('#sojaAnt').checked = !!d.sojaAnterior; rotulos();
      definir(d.talhao.geometry.coordinates[0].slice(0, -1)); recomendar(); toast('Talhão aberto ✔');
    } catch { toast('Arquivo inválido'); }
  };

  $('#verPro').onclick = e => { e.preventDefault(); ir(passos.findIndex(p => p.id === 'p-pro')); };
  ir(0);
})();
