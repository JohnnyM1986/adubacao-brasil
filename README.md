# 🌱 Adubação Brasil – versão gratuita (beta)

Ferramenta gratuita de recomendação de **calagem e adubação** para **milho, soja e cana-de-açúcar** no Brasil. Funciona no celular, sem cadastro e sem servidor: os dados do produtor ficam no aparelho dele.

👉 **Abrir:** https://johnnym1986.github.io/adubacao-brasil/ · **Como usar:** https://johnnym1986.github.io/adubacao-brasil/como-usar.html

## O que faz
1. Desenho do talhão no mapa ou arquivo KML/KMZ (Google Earth), Shapefile .zip ou GeoJSON, com cálculo da área
2. Cultura e produtividade esperada (sc/ha ou t/ha)
3. Análise de solo (padrão SP) → SB, CTC, V%, m%
4. Clima do local (NASA POWER, médias de longo prazo)
5. Recomendação: calcário (saturação por bases), N, P₂O₅, K₂O — **cada resultado mostra a sua fonte**
6. Relatório em PDF (impressão do navegador → Salvar como PDF)

## Fontes e métodos
| Item | Fonte |
|---|---|
| Calagem | Método da saturação por bases – Recomendações de Adubação e Calagem para o Estado de São Paulo (IAC, Boletim 100) |
| Classes de P resina e K | Estado de São Paulo (IAC, Boletim 100) |
| Doses de N, P₂O₅, K₂O | Método de balanço (exportação × produtividade × fator da classe); coeficientes de referência em `dados/culturas.json` |
| Clima | NASA POWER – https://power.larc.nasa.gov |
| Mapa | © OpenStreetMap |

⚠️ Valores de referência para versão beta: **devem ser validados por engenheiro agrônomo** antes de uso real.

## Estrutura
- `index.html`, `app.js` – interface (pt-BR)
- `motore.js` – motor de cálculo (testado: `node tests/testes.js`)
- `dados/` – parâmetros das culturas e classes de interpretação
- `vendor/` – Leaflet (BSD-2), Turf.js (MIT), Chart.js (MIT), JSZip (MIT), toGeoJSON (BSD-2), shpjs (MIT)

## Próximos passos (versão Pro)
Satélite Sentinel-2 real e zonas de manejo · taxa variável (Shapefile/ISOBUS) · leitura do laudo por foto/PDF · vários talhões · todos os estados · preços e escolha de adubos comerciais.
