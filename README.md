# OLX Workspace

> **Status atual:** funcional em ambiente de desenvolvimento (carregado como extensão sem
> compactação). Listagem + categorização por IA + análise da página do anúncio + persistência
> em `db.json` estão implementados e testados manualmente.

Este arquivo é a **fonte da verdade** sobre o projeto. **Toda alteração relevante deve ser
registrada aqui** (seção [Histórico de atualizações](#histórico-de-atualizações)) explicando o
que mudou e por quê.

---

## O que é

**OLX Workspace** é uma **extensão do Chrome (Manifest V3, TypeScript)** para garimpar anúncios
de **carros** no OLX com apoio de IA (**DeepSeek**). Ela:

1. Lê os cards de uma página de listagem do OLX (`https://www.olx.com.br/...`) — ou **varre
   várias páginas** da paginação de uma vez ("Varrer páginas").
2. Manda esses dados para a **DeepSeek** (via um **proxy local** que guarda a chave) e recebe
   cada anúncio **categorizado**: tipo, marca, modelo, versão, ano, motor, combustível, câmbio,
   portas, carroceria. **Só carros de passeio ficam** — moto, caminhão, ônibus, van, náutica,
   etc. são descartados pelo campo `tipo` (não vão para a lista nem para o `db.json`).
3. Mostra tudo numa **janela separada** da extensão, em **lista paginada (5 por página)**, com
   **seleção por checkbox**.
4. Para os itens selecionados, **navega a própria aba do OLX** até a página de cada anúncio,
   **extrai os dados/HTML** da página de detalhe e **grava no arquivo `db.json`** (na raiz do
   projeto), indexado pelo id do anúncio.

Todo o log de diagnóstico sai no **console da janela da extensão** (não no console do OLX).

---

## Arquitetura

```
┌─────────────────────┐        ┌──────────────────────┐        ┌───────────────────┐
│  Janela da extensão │  msg   │  Service worker      │  HTTP  │  Proxy local      │
│  (popup.html?tab=1) │ ─────▶ │  (background.ts)     │ ─────▶ │  proxy/server.mjs │
│  lista + seleção    │ ◀───── │  orquestra tudo      │ ◀───── │  Node, sem deps   │
└─────────────────────┘        └──────────┬───────────┘        └─────────┬─────────┘
                                          │ scripting.executeScript      │
                                          ▼                              ▼
                                 ┌──────────────────┐          ┌───────────────────┐
                                 │  content.ts      │          │  DeepSeek API     │
                                 │  (aba do OLX)    │          │  db.json (raiz)   │
                                 │  só extrai dados │          └───────────────────┘
                                 └──────────────────┘
```

- **`extension/`** — a extensão. Bundle gerado por webpack em `extension/build/` (é essa pasta
  que se carrega no Chrome).
  - `src/manifest.json` — MV3. Permissões: `activeTab`, `scripting`. Hosts: `https://*.olx.com.br/*`
    (os anúncios ficam em subdomínios regionais, ex. `es.olx.com.br`) e `http://localhost:8787/*`
    (o proxy). Sem `default_popup` — clicar no ícone abre uma **janela** (`chrome.windows.create`).
  - `src/background.ts` — service worker. Abre a janela, orquestra as ações, fala com o proxy,
    lê/grava o `db.json` (via proxy), navega a aba do OLX nas análises de detalhe.
  - `src/content.ts` — injetado sob demanda na aba do OLX. **Não usa `console.*`**; só extrai:
    - `extractSections()` — cards da listagem (título, preço, preço antigo, **km**, **cor**,
      local, data, imagem, nº de fotos, `details[]`).
    - `extractAdPage()` — página do anúncio (título, preço, descrição, `properties[]`, imagens,
      `ld+json`, `htmlLength`). Tenta ler o estado interno do OLX (`initial-data` /
      `__PRELOADED_STATE__`, `deepFindAd`) e cai para `<h1>` / `meta` / JSON-LD.
    - `scrollAutomatic()` — scroll suave até o fim (~3 s); progresso via mensagem.
  - `src/popup.ts` — UI da janela: lista paginada, seleção, paginação, "Ver DB", e **todo o
    log** (`console.table` etc.) no console desta janela.
  - `public/popup.html`, `styles/popup.css` — marcação e estilo (minimalistas).
- **`proxy/`** — servidor Node (HTTP puro, **sem dependências**, Node ≥ 18.17).
  - `server.mjs` — guarda a chave DeepSeek e expõe:
    - `GET  /health` — status + `dbPath`.
    - `POST /analyze` — recebe `{ sections: [...] }`, chama a DeepSeek em modo JSON e devolve
      `{ ok, categorias, raw, usage }`.
    - `GET  /db` — conteúdo de `db.json`.
    - `POST /db` — `{ id, record }` | `{ records:[...] }` | `{ db:{...} }`; faz **merge por id**,
      grava `db.json` (escrita atômica via `.tmp` + rename), devolve `{ ok, db }`.
    - `DELETE /db` — zera `db.json`.
    - `GET  /img?u=<url>` — baixa a imagem (`https://*.olx.com.br`) no servidor e
      devolve os bytes. O painel usa isso porque `img.olx.com.br` costuma ser
      barrado no navegador (adblock / proteção anti-rastreio / DNS).
  - `.env` — `DEEPSEEK_API_KEY`, `DEEPSEEK_API_URL`, `DEEPSEEK_MODEL`, `PROXY_PORT`.
    **Não versionado** (`.gitignore`). `.env.example` é o modelo.
- **`db.json`** (raiz) — o "banco". Mapa `{ [idDoAnuncio]: registro }`. Cada registro tem
  `id`, `url`, `detail` (dados da página), `categoria` (IA), `htmlLength`, `analyzedAt`,
  `savedAt`. **Não versionado.**
- **`setup.sh`** (raiz) — instala deps da extensão, faz o build e **abre 3 terminais**
  (proxy, `webpack --watch`, painel com health-check). `--no-terminals` para modo headless.

---

## Como rodar

Pré-requisitos: **Node ≥ 18.17** e **Google Chrome**.

### Rápido

```bash
./setup.sh
```

Isso instala as deps da **extensão** e do **painel (`web/`)**, faz o build da extensão e abre
3 terminais: **proxy** (`proxy/ npm start`), **webpack --watch** (`extension/ npm run dev`) e
**painel Vite** (`web/ npm run dev`, em `http://localhost:5173`, depois de esperar o proxy).
`./setup.sh --no-terminals` só instala/typecheck (headless/CI). Depois, no Chrome:

1. `chrome://extensions`
2. Ativar **Modo do desenvolvedor**
3. **Carregar sem compactação** → selecionar `extension/build/`

### Manual

```bash
# 1. Proxy (deixe rodando num terminal)
cd proxy
cp .env.example .env        # e coloque sua DEEPSEEK_API_KEY
npm start

# 2. Extensão (noutro terminal)
cd extension
npm install
npm run build               # ou: npm run dev  (webpack --watch)
```

Carregar `extension/build/` em `chrome://extensions` como acima.

### Painel de análise (`web/`)

App **Vite + React + TypeScript** que roda ao lado do proxy e é o **painel de análise** do
garimpo (a extensão continua sendo só o coletor). Lê tudo pelo proxy (`GET /db`,
`POST /analyze`, `DELETE /db`, `GET /img?u=` para as fotos).

```bash
cd web
npm install
npm run dev          # http://localhost:5173  (proxy precisa estar de pé em :8787)
```

Páginas: **Dashboard** (totais, distribuição por marca/ano, preço médio/mediano, quedas de
preço, status do proxy), **Listagem** (tabela paginada com ordenação por coluna, filtros
persistentes na querystring — marca, ano, faixa de preço/km, busca — e seleção múltipla),
**Detalhe** (`/anuncio/:id`: galeria + dados da IA + properties + descrição, "Reanalisar" e
"Remover do DB"), **Comparador** (`/comparador?ids=…`: 2 a 4 anúncios lado a lado, opcionais
em matriz) e **DB / Config** (JSON cru, exportar CSV/JSON, limpar DB, endpoint do proxy
configurável, testar DeepSeek). Endpoint do proxy guardado em `localStorage` (`olx.proxyUrl`).

### Usar

1. Clique no ícone da extensão → abre a **janela** do OLX Workspace.
2. Deixe **uma aba do OLX** aberta numa página de listagem de carros — a URL precisa conter
   `carros-vans-e-utilitarios` (categoria "Autos e peças › Carros, vans e utilitários"). Fora
   dessa categoria a extensão não faz nada.
3. **📊 Executar Análise** → lê só a página atual e mostra a lista (log no console da janela).
   Ou **📚 Varrer páginas** (campo "até N" + "rolar cada página" + "pular os que já estão no
   DB" + "salvar no DB") → percorre a paginação do OLX (`?o=2`, `?o=3`, …) a partir da página
   atual. O nº efetivo de páginas é `min("até N", páginas que a paginação do OLX mostra, 10)`
   — nunca varre mais que 10 nem além da última página real. Extrai as `section` de cada uma,
   **ignora anúncios repetidos** (mesmo id em outra
   página) e, se marcado, os que **já estão no `db.json`**, categoriza no DeepSeek em lotes,
   **grava os novos no `db.json`** (registro raso, sem visitar a página) e devolve a lista
   acumulada. Para sozinho quando a página não traz nada novo; ao final volta a aba para onde
   você estava. O painel `web/` mostra os registros já na próxima vez que a aba ganhar foco.
4. Marque itens (ou **"selecionar todas (N)"** — pega todas as páginas da lista e ignora os
   já analisados) → **🔎 Analisar selecionados** → a aba do OLX navega por cada anúncio, os
   dados são extraídos, categorizados e gravados em `db.json`. Anúncio que já tem os dados da
   página é **pulado** (badge `✔ analisado`); a aba volta para a listagem no fim.
5. **🗃️ Ver DB** mostra o `db.json`; **limpar DB** zera.

> Depois de qualquer mudança no código: `npm run build` (ou deixe o `dev` rodando) **e**
> recarregue a extensão em `chrome://extensions` (botão ↻) — MV3 não recarrega o service
> worker sozinho.

---

## Estrutura de pastas

```
OLX_SCRAPPER/
├── README.md               ← este arquivo (status + histórico)
├── setup.sh                ← instala tudo, builda a extensão, abre 3 terminais
│                             (proxy, webpack --watch, painel Vite)
├── db.json                 ← "banco" JSON (gerado, não versionado)
├── proxy/
│   ├── server.mjs          ← proxy DeepSeek + API do db.json
│   ├── .env / .env.example ← chave DeepSeek (não versionado)
│   └── package.json
├── extension/
│   ├── src/
│   │   ├── manifest.json
│   │   ├── background.ts    ← service worker / orquestrador
│   │   ├── content.ts       ← extração na aba do OLX (sem console)
│   │   └── popup.ts         ← UI + logs no console da extensão
│   ├── public/popup.html
│   ├── styles/popup.css
│   ├── webpack.config.js
│   ├── tsconfig.json        ← strict
│   └── build/               ← bundle (carregar esta pasta no Chrome)
└── web/                     ← painel de análise (Vite + React + TS)
    ├── index.html
    ├── vite.config.ts       ← alias @, dev-proxy /proxy → :8787
    ├── tailwind.config.js   ← tokens neutros, escala de espaço travada
    └── src/
        ├── types.ts         ← shape do registro do db.json (fonte única)
        ├── lib/
        │   ├── api.ts       ← camada única que fala com o proxy
        │   ├── rows.ts      ← achata Db → AdRow[] + agregados + oportunidade
        │   ├── format.ts    ← parse/format de preço, km, data
        │   ├── useDb.ts     ← fetch do /db + /health (loading/vazio/erro)
        │   ├── useFilters.ts← filtros ⇄ querystring
        │   └── exporters.ts ← CSV / JSON
        ├── components/
        │   ├── Layout.tsx   ← sidebar + header
        │   ├── data-table/  ← tabela (TanStack) no padrão openstatus
        │   └── ui/          ← button, input, select, badge, checkbox
        └── pages/           ← Dashboard, Listing, Detail, Compare, Config
```

---

## Decisões de projeto

- **Proxy local em vez de chamar a DeepSeek direto da extensão:** a chave nunca entra no
  bundle nem trafega pelo navegador. O proxy também é quem escreve em disco (`db.json`) —
  uma extensão não grava arquivos arbitrários.
- **`db.json` na raiz, escrito pelo proxy** (não `chrome.storage`): dado fica versionável/
  inspecionável fora do Chrome, num arquivo único.
- **Janela separada** (`chrome.windows.create`) em vez de popup de toolbar: não fecha ao
  clicar fora; cabe a lista paginada.
- **Reutiliza a aba do OLX** nas análises de detalhe (`chrome.tabs.update`), não abre abas
  novas; ao final volta para a listagem.
- **`content.ts` sem `console.*`:** todo diagnóstico sai no console **da extensão**.
- **Sem dependências de runtime** (nem na extensão, nem no proxy). Dev deps só o toolchain
  (webpack, ts-loader, typescript, copy-webpack-plugin).

---

## Limitações conhecidas / a fazer

- `extractAdPage()` depende da estrutura interna do OLX (`initial-data` / `__PRELOADED_STATE__`);
  se o OLX mudar o markup, cai no fallback (menos campos). Ajustar seletores conforme dumps
  reais do `detail` no `db.json`.
- O service worker MV3 pode ser encerrado em lotes muito longos de "Analisar selecionados".
- Sem testes automatizados ainda.
- Categorização assume **veículos**; outras categorias do OLX não foram tratadas.
- O recorte "só carros" depende do campo `tipo` que a **IA** infere. Se ela errar o `tipo`
  (ou não devolver), o filtro é permissivo: **sem `tipo` => trata como carro**. A lista de
  tipos não-carro fica em `NAO_CARRO` no `background.ts`.

---

## Histórico de atualizações

> Formato: mais recente no topo. Cada entrada diz **o que** mudou e **por quê**.

### 2026-09-10

- **Imagens do anúncio não renderizavam no painel.** As URLs `https://img.olx.com.br/...`
  são válidas, mas o navegador frequentemente não as carrega (adblock, proteção
  anti-rastreio, filtro de DNS). Nova rota no proxy — `GET /img?u=<url>` — baixa a imagem
  no servidor (aceita só `https://*.olx.com.br`) e devolve os bytes com CORS liberado. No
  `web/`, `lib/img.ts` (`proxiedImg()` + `imgFallback()`) reescreve as `src` das imagens
  para passar pelo `localhost`; usado na galeria do `Detail` e nos thumbs do `Compare`.
  `onError` tenta a URL original uma vez e depois esconde a `<img>`.
  **Requer reiniciar o proxy** (`cd proxy && npm start`) para a rota existir.

- **UI da janela redesenhada.** `popup.html` + `popup.css` reescritos: layout em cartões,
  paleta com variáveis CSS (+ modo escuro via `prefers-color-scheme`), botões com hierarquia
  (primário roxo × secundário), cabeçalho com marca, opções da varredura empilhadas e
  legíveis, `#status` só aparece quando há texto (banner com borda de destaque). Fix: a
  toolbar de seleção e a paginação agora **ficam escondidas até rodar uma análise**
  (`[hidden] { display: none !important }`) — antes apareciam vazias no primeiro load.
  Nenhum `id` mudou; `popup.ts` não foi tocado.

- **Extensão restrita a CARROS.** Pedido: "que a extensão se limite à análise somente de
  carros". O prompt do proxy (`buildPrompt`) agora pede um campo `tipo` por anúncio
  (`"carro"`, `"moto"`, `"caminhao"`, `"onibus"`, `"van"`, `"nautica"`, `"outro"`). No
  `background.ts`, novo helper `isCarro()` + set `NAO_CARRO`: `analyze`, `crawlListing` e
  `analyzeSelected` descartam o que não é carro — não entra na lista, não é gravado no
  `db.json` e sai da seleção. Filtro **permissivo**: anúncio sem `tipo` conhecido continua
  tratado como carro. A janela mostra a contagem de "não-carro(s) ocultado(s)/ignorado(s)".
- **Só age na categoria de carros.** `getActiveOlxTab()` agora exige que a URL da aba do OLX
  contenha `carros-vans-e-utilitarios` (regex `OLX_CARROS_RE` + `isCarrosOlxUrl()`). Fora
  dessa categoria, todas as ações (`analyze`, `autoScroll`, `crawlListing`, `analyzeSelected`)
  falham com "Abra uma página de carros do OLX (URL com 'carros-vans-e-utilitarios')".
- **"Varrer páginas" respeita a paginação real do OLX.** Nova ação de content
  `extractPagination`: lê o widget de paginação (`[class*="Pagination"][class*="wrapper"]`,
  com fallback por `a[href*='o=']`) e devolve o maior `?o=N` — inclusive o do link "Última
  página". No `crawlListing`, o nº de páginas varridas passa a ser
  `min(pedido_do_usuário, páginas_disponíveis_a_partir_da_atual, 10)` — teto rígido
  `CRAWL_MAX_PAGES = 10`. A janela mostra "paginação: N página(s)" no resumo.

- **"Selecionar todas" + não refazer o que já foi feito.** Na toolbar da janela: botão
  **"selecionar todas (N)"** marca todos os itens da varredura (todas as páginas da lista de
  uma vez), **pulando os já analisados**; N = quantos ainda faltam. Botão **"limpar seleção"**.
  `mergeItems` passou a marcar cada item com `inDb` (existe no `db.json`) e `deepAnalyzed`
  (existe **e** não é raso — já passou pelo "Analisar selecionados"); o badge da linha mostra
  `✔ analisado` ou `🗃️ no DB (raso)`. `analyzeSelected` agora lê o `db.json` no início e
  **ignora os `targets` já analisados** (a menos que `force`), devolvendo `skipped[]`; ao
  final tira da seleção o que foi salvo/pulado. Assim dá pra "selecionar todas" e rodar em
  lote sem reprocessar anúncio já feito.
- **"Varrer páginas" na extensão.** Nova ação `crawlListing` no `background.ts`: a partir da
  listagem aberta, percorre a paginação do OLX pelo query param `o` (`?o=2`, `?o=3`, …) até
  `N` páginas, roda em cada uma o mesmo processo do "Executar Análise" (opcional auto-scroll
  curto + `extractSections`) e categoriza no DeepSeek **em lotes de 20** (`categorizeInChunks`)
  para não estourar o prompt/JSON. Para cedo se a página vier vazia ou só com ids repetidos;
  ao final devolve a aba para a URL original. UI: botão **📚 Varrer páginas** + input "até N"
  + checkbox "rolar cada página"; progresso por página no `#status`. `content.ts` passou a
  aceitar `duration` no `autoScroll`.
- **Varredura não repete anúncio.** Dupla validação no `crawlListing`: (1) `Set` de ids já
  vistos **nesta varredura** — a paginação do OLX repete cards entre páginas, então esses são
  descartados (e a varredura para se uma página inteira só tem repetidos); (2) `db.json` é
  lido **uma vez** no início e, com o checkbox **"pular os que já estão no DB"** (padrão
  ligado), anúncios já analisados não voltam pra IA nem pra lista. O resultado informa
  `newCount` / `skipped` / `duplicates` e o `#status` mostra "N novos · M já no DB · K
  repetidos".
- **Varredura grava no `db.json`.** Antes o "Varrer páginas" só mostrava a lista na janela da
  extensão — o painel `web/` não via nada porque nada era persistido. Agora, com o checkbox
  **"salvar no DB"** (padrão ligado), cada anúncio novo vira um registro **raso** (`source:
  "listing"`, `shallow: true`) montado a partir do card da listagem (sem visitar a página):
  `detail` com título, preço, preço antigo, km, local, `properties` e a 1ª imagem, mais a
  `categoria` da IA. Gravação em **lotes de 40** `{ records:[…] }` (`dbUpsertMany`). Só grava
  ids que ainda não existem, pra não sobrescrever um registro completo com o raso.
  `analyzeSelected` continua enriquecendo o mesmo id depois (merge). O painel (`useDb`) passou
  a **recarregar ao focar a aba**, então a varredura aparece sem F5. O `#status` diz
  explicitamente `N salvos no DB` ou `NÃO salvo no DB: <motivo>` — resultado sem nenhum dos
  dois = extensão desatualizada no Chrome (recarregue em `chrome://extensions` **e**
  feche/reabra a janela do OLX Workspace).
- **`setup.sh` sobe o painel também.** Passou a instalar as deps de `web/` + `tsc -b` e o
  terceiro terminal ("OLX · Painel (Vite)") agora espera o proxy e roda `npm run dev`
  (`http://localhost:5173`) em vez de só imprimir instruções. `--no-terminals` cobre o
  install/typecheck do `web/`. Adicionado `@types/node` ao `web/` (usado no `vite.config.ts`).

### 2026-09-09

- **Painel de análise `web/` (Vite + React + TS).** App separado que roda ao lado do proxy e
  vira o painel do garimpo; a extensão fica só como coletor. Camada de API única
  (`src/lib/api.ts`) falando com o proxy, tipos do registro reaproveitados de `src/types.ts`,
  filtros persistidos na querystring e estados reais (loading / vazio / "Proxy offline").
  Cinco páginas: Dashboard, Listagem (tabela TanStack no padrão openstatus — header clicável,
  paginação, toolbar de filtros, seleção múltipla), Detalhe (galeria + IA + properties +
  descrição, reanalisar / remover), Comparador (2–4 lado a lado) e DB/Config (JSON cru,
  export CSV/JSON, limpar DB, endpoint configurável, testar DeepSeek). Estilo de ferramenta
  interna: fundo neutro, um acento, borda de 1px, sem sombra/gradiente, escala de espaço
  travada, `tabular-nums`. Destaque de oportunidade quando o preço fica abaixo da média do
  mesmo marca+modelo+ano (grupo com 2+ anúncios). Sem autenticação.
  `web/src/lib/api.ts` também expõe `removeRecord(id)` (o proxy não tem DELETE por id: lê,
  remove do mapa e regrava via `POST /db { db }`).
- **README criado.** Passa a ser o documento de status do projeto; toda atualização futura
  deve ser registrada nesta seção.
- **`ensureProxy()` no background.** `analyze` e `analyzeSelected` checam `GET /health` antes
  de começar; se o proxy estiver off, a mensagem passa a ser
  *"Proxy offline em http://localhost:8787. Rode: cd proxy && npm start"* em vez de
  `Failed to fetch`.
- **Logs movidos para o console da extensão.** `content.ts` deixou de usar `console.*`;
  `extractSections`/`extractAdPage` só retornam dados. `background` devolve `categorias`/`raw`
  ao popup, que faz `console.table` na própria janela. Scroll reporta progresso por mensagem.
- **"Analisar selecionados" reutiliza a aba do OLX.** Em vez de abrir/fechar uma aba por
  anúncio, navega a aba existente (`chrome.tabs.update` + espera carregar) e, no fim, volta
  para a listagem original.
- **DB passou de `chrome.storage.local` para `db.json` na raiz**, escrito pelo proxy. Novas
  rotas no proxy: `GET/POST/DELETE /db` (merge por id, escrita atômica). Removida a permissão
  `storage` do manifest.
- **Seleção + análise de detalhe + persistência.** Checkbox por item na lista, botão
  "Analisar selecionados", ação `analyzeSelected` no background, `extractAdPage()` no content,
  badges de estado (⏳/✔/✖) e botões "Ver DB" / "limpar DB" no popup.
- **Listagem paginada (5 por página)** na janela da extensão, com miniatura, linha da IA,
  metadados, preço e link, além de "‹ Anterior / Próxima ›".
- **Categorização por IA.** O proxy passou a pedir JSON estrito (`response_format:
  json_object`, `temperature: 0`) e devolve `categorias[]` (tipo/marca/modelo/versão/ano/motor/
  combustível/câmbio/portas/carroceria). Antes era uma análise de mercado em texto livre.
- **Captura de `km` e `cor`** como campos próprios do `AdCard` (além de continuarem em
  `details[]`), com `km` numérico.
- **Ícone abre em janela do Chrome.** Removido `default_popup`; `chrome.action.onClicked` abre
  `popup.html?tab=1` via `chrome.windows.create` (antes era aba, antes disso popup de toolbar).
- **Proxy DeepSeek + `setup.sh`.** Criado `proxy/server.mjs` (Node sem deps) com a chave em
  `proxy/.env`; a chave saiu de dentro da extensão. `setup.sh` passou a abrir vários terminais.
- **Estrutura movida para `extension/`** e adicionado `setup.sh` na raiz.
- **Versão inicial.** Extensão MV3 + TypeScript strict + webpack. Popup com 2 botões:
  "Executar Análise" (extraía todo o HTML da página) e "Auto-scroll".
