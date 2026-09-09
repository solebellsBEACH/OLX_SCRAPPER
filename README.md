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
de veículos no OLX com apoio de IA (**DeepSeek**). Ela:

1. Lê os cards de uma página de listagem do OLX (`https://www.olx.com.br/...`).
2. Manda esses dados para a **DeepSeek** (via um **proxy local** que guarda a chave) e recebe
   cada anúncio **categorizado**: marca, modelo, versão, ano, motor, combustível, câmbio,
   portas, carroceria.
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

Isso instala, builda e abre os terminais. Depois, no Chrome:

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

### Usar

1. Clique no ícone da extensão → abre a **janela** do OLX Workspace.
2. Deixe **uma aba do OLX** aberta numa página de listagem de veículos.
3. **📊 Executar Análise** → a lista paginada aparece (e o log no console da janela).
4. Marque itens → **🔎 Analisar selecionados** → a aba do OLX navega por cada anúncio, os
   dados são extraídos, categorizados e gravados em `db.json`. A aba volta para a listagem.
5. **🗃️ Ver DB** mostra o `db.json`; **limpar DB** zera.

> Depois de qualquer mudança no código: `npm run build` (ou deixe o `dev` rodando) **e**
> recarregue a extensão em `chrome://extensions` (botão ↻) — MV3 não recarrega o service
> worker sozinho.

---

## Estrutura de pastas

```
OLX_SCRAPPER/
├── README.md               ← este arquivo (status + histórico)
├── setup.sh                ← build + abre 3 terminais
├── db.json                 ← "banco" JSON (gerado, não versionado)
├── proxy/
│   ├── server.mjs          ← proxy DeepSeek + API do db.json
│   ├── .env / .env.example ← chave DeepSeek (não versionado)
│   └── package.json
└── extension/
    ├── src/
    │   ├── manifest.json
    │   ├── background.ts    ← service worker / orquestrador
    │   ├── content.ts       ← extração na aba do OLX (sem console)
    │   └── popup.ts         ← UI + logs no console da extensão
    ├── public/popup.html
    ├── styles/popup.css
    ├── webpack.config.js
    ├── tsconfig.json        ← strict
    └── build/               ← bundle (carregar esta pasta no Chrome)
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

---

## Histórico de atualizações

> Formato: mais recente no topo. Cada entrada diz **o que** mudou e **por quê**.

### 2026-09-09

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
  json_object`, `temperature: 0`) e devolve `categorias[]` (marca/modelo/versão/ano/motor/
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
