# 🌱 Adubação Brasil – versão gratuita (beta)

Ferramenta gratuita de recomendação de **calagem e adubação** para **milho, soja e cana-de-açúcar** no Brasil. Funciona no celular, sem cadastro e sem servidor: os dados do produtor ficam no aparelho dele.

👉 **Abrir:** https://johnnym1986.github.io/adubacao-brasil/ · **Como usar:** https://johnnym1986.github.io/adubacao-brasil/como-usar.html

## O que faz
1. Desenho do talhão no mapa ou arquivo KML/KMZ (Google Earth), Shapefile .zip ou GeoJSON, com cálculo da área
2. Cultura e produtividade esperada (sc/ha ou t/ha)
3. Análise de solo (padrão SP) → SB, CTC, V%, m%
4. Clima do local (NASA POWER, médias de longo prazo)
5. Resultado: necessidade de calcário (saturação por bases, V2 editável) e interpretação dos teores de P e K (classes oficiais SP) — **cada resultado mostra a sua fonte**
   - Por escolha, a versão gratuita **não mostra doses de N, P₂O₅ e K₂O**: só resultados de métodos oficiais. As funções de dose em `motore.js` ficam reservadas para quando houver tabelas oficiais validadas.
6. Relatório em PDF (impressão do navegador → Salvar como PDF)

## Fontes e métodos
| Item | Fonte |
|---|---|
| Calagem | Método da saturação por bases – Recomendações de Adubação e Calagem para o Estado de São Paulo (IAC, Boletim 100) |
| Classes de P resina e K | Estado de São Paulo (IAC, Boletim 100) |
| Clima | NASA POWER – https://power.larc.nasa.gov |
| Mapa | © OpenStreetMap |

⚠️ V2 por cultura (milho 70%, soja e cana 60%) é valor de referência editável pelo usuário. Resultados **devem ser confirmados por engenheiro agrônomo**.

## Estrutura
- `index.html`, `app.js` – interface (pt-BR)
- `motore.js` – motor de cálculo (testado: `node tests/testes.js`)
- `dados/` – parâmetros das culturas e classes de interpretação
- `vendor/` – Leaflet (BSD-2), Turf.js (MIT), Chart.js (MIT), JSZip (MIT), toGeoJSON (BSD-2), shpjs (MIT)

## Próximos passos (versão Pro)
Satélite Sentinel-2 real e zonas de manejo · taxa variável (Shapefile/ISOBUS) · leitura do laudo por foto/PDF · vários talhões · todos os estados · preços e escolha de adubos comerciais.
