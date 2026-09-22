# OLX Workspace

> **Status atual:** funcional em ambiente de desenvolvimento (carregado como extensão sem
> compactação). Listagem + categorização por IA + análise da página do anúncio + persistência
> estão implementados e testados manualmente. **Tudo roda dentro da extensão** — sem proxy
> Node nem dev server separado; ver o histórico de atualizações mais recente abaixo.

Este arquivo é a **fonte da verdade** sobre o projeto. **Toda alteração relevante deve ser
registrada aqui** (seção [Histórico de atualizações](#histórico-de-atualizações)) explicando o
que mudou e por quê.

---

## O que é

**OLX Workspace** é uma **extensão do Chrome (Manifest V3, TypeScript)** para garimpar anúncios
de **carros** no OLX com apoio de IA (vários provedores — OpenAI, DeepSeek, Gemini, Groq, Mistral, xAI, OpenRouter ou endpoint próprio —, cadastrados em Config no painel). Ela:

1. Lê os cards de uma página de listagem do OLX (`https://www.olx.com.br/...`) — ou **varre
   várias páginas** da paginação de uma vez ("Varrer páginas").
2. Manda esses dados para o **provedor de IA ativo** (DeepSeek ou OpenAI, chamado **direto do
   service worker da extensão** — sem servidor intermediário) e recebe cada anúncio
   **categorizado**: tipo, marca, modelo, versão, ano, motor, combustível, câmbio, portas,
   carroceria. **Só carros de passeio ficam** — moto, caminhão, ônibus, van, náutica, etc. são
   descartados pelo campo `tipo` (não vão para a lista nem para a base).
3. Mostra tudo numa **janela separada** da extensão, em **lista paginada (5 por página)**, com
   **seleção por checkbox**.
4. Para os itens selecionados, **navega a própria aba do OLX** até a página de cada anúncio,
   **extrai os dados/HTML** da página de detalhe e **grava na base da extensão**
   (`chrome.storage.local`), indexado pelo id do anúncio.
5. Um **painel completo** (React), aberto como página da própria extensão a partir do botão
   "🗂️ Abrir painel" no popup, mostra dashboard, listagem, comparador e configuração da IA.

Todo o log de diagnóstico sai no **console da janela da extensão** (não no console do OLX).

---

## Arquitetura

```
┌─────────────────────┐        ┌───────────────────────┐        ┌───────────────────┐
│  Janela da extensão │  msg   │  Service worker       │  fetch │  DeepSeek/OpenAI  │
│  (popup.html?tab=1) │ ─────▶ │  (background.ts)      │ ─────▶ │  API direta       │
│  lista + seleção    │ ◀───── │  orquestra tudo       │ ◀───── │                   │
└─────────────────────┘        └──────────┬────────────┘        └───────────────────┘
        │ "Abrir painel"                  │ scripting.executeScript
        ▼                                 ▼
┌─────────────────────┐        ┌──────────────────────┐
│  panel/index.html   │  msg   │  content.ts          │
│  (React, chrome-    │ ─────▶ │  (aba do OLX)        │
│  extension://...)   │ ◀───── │  só extrai dados     │
└─────────────────────┘        └──────────────────────┘

chrome.storage.local guarda tudo: a base de anúncios (`olx.db`) e a config/chaves de IA
(`olx.aiConfig`). Sem servidor local, sem arquivo em disco além do bundle da extensão.
```

- **`extension/`** — a extensão. Bundle gerado por webpack (+ o painel, por Vite) em
  `extension/build/` (é essa pasta que se carrega no Chrome).
  - `src/manifest.json` — MV3. Permissões: `activeTab`, `scripting`, `storage`,
    `unlimitedStorage`. Hosts: `https://*.olx.com.br/*` (os anúncios ficam em subdomínios
    regionais, ex. `es.olx.com.br`), `https://api.deepseek.com/*` e `https://api.openai.com/*`.
    Sem `default_popup` — clicar no ícone abre uma **janela** (`chrome.windows.create`).
  - `src/background.ts`, `src/content.ts`, `src/popup.ts` — **entry points finos** do webpack
    (só um `import "./<pasta>/index"`); a implementação de cada um vive numa pasta de mesmo nome
    ao lado, dividida por responsabilidade (ver abaixo). Isso mantém os três bundles do
    `webpack.config.js` (`background`, `content`, `popup`) intactos.
  - `src/background/` — service worker. Abre a janela (`panel.ts`), orquestra as ações
    (`actions/analyze.ts`, `actions/crawl-listing.ts`, `actions/analyze-selected.ts`,
    `actions/load-pending.ts`, `actions/auto-scroll.ts`), chama a IA direto
    (`ai-client.ts`, `ai-config.ts`, `ai-categorize.ts`), lê/grava a base em
    `chrome.storage.local` (`store.ts`, `db.ts`), navega a aba do OLX (`tabs.ts`) e despacha as
    mensagens do popup **e do painel** (`message-router.ts`).
  - `src/content/` — injetado sob demanda na aba do OLX. **Não usa `console.*`**; só extrai:
    - `listing-extractor.ts` (`extractSections()`) — cards da listagem (título, preço, preço
      antigo, **km**, **cor**, local, data, imagem, nº de fotos, `details[]`).
    - `ad-page-extractor.ts` (`extractAdPage()`) — página do anúncio (título, preço, descrição,
      `properties[]`, imagens, `ld+json`, `htmlLength`). Tenta ler o estado interno do OLX
      (`initial-data` / `__PRELOADED_STATE__`, `deepFindAd`) e cai para `<h1>` / `meta` / JSON-LD.
    - `scroll.ts` (`scrollAutomatic()`) — scroll suave até o fim (~3 s); progresso via mensagem.
    - `card-marking.ts` / `auto-mark.ts` — borda verde/amarela + score direto nos cards do OLX.
  - `src/popup/` — UI da janela: `dom.ts` (refs dos elementos), `state.ts` (estado mutável
    compartilhado), `render/` (lista paginada, badges, tabs), `actions/` (um módulo por botão,
    incluindo `open-panel.ts` que abre o painel completo numa aba), e **todo o log**
    (`logging.ts`, `console.table` etc.) no console desta janela.
  - `public/popup.html`, `styles/popup.css` — marcação e estilo (minimalistas).
  - `build/panel/` — build do painel React (`web/`), gerado pelo Vite **direto nessa pasta**
    (não versionado). Aberto via `chrome.runtime.getURL("panel/index.html")`.
- **`web/`** — código-fonte do painel (Vite + React + TypeScript). Builda para
  `extension/build/panel/`, não roda mais como dev server separado (ver "Como rodar").
- **`setup.sh`** (raiz) — instala deps da extensão e do painel e faz o **build de tudo**, na
  ordem certa (webpack antes do Vite, porque o webpack limpa `extension/build/`).

---

## Como rodar

Pré-requisitos: **Node ≥ 18.17** e **Google Chrome**.

Não tem mais proxy nem dev server: **tudo roda dentro da extensão**. `./setup.sh` builda a
extensão (webpack) e o painel (Vite) na ordem certa, direto em `extension/build/`.

### Rápido

```bash
./setup.sh
```

Isso instala as deps da **extensão** e do **painel (`web/`)** e builda os dois, nessa ordem
(o build do webpack limpa `extension/build/`, então o painel precisa ser buildado depois).
Ao final:

1. `chrome://extensions`
2. Ativar **Modo do desenvolvedor**
3. **Carregar sem compactação** → selecionar `extension/build/`
4. No popup da extensão, clique em **🗂️ Abrir painel** e configure a chave de IA na aba
   **IA** (DeepSeek ou OpenAI — fica salva em `chrome.storage.local`, dentro da extensão).

### Manual

```bash
# 1. Extensão
cd extension
npm install
npm run build               # ou: npm run dev  (webpack --watch, pra iterar no background/content/popup)

# 2. Painel — DEPOIS do build da extensão (webpack limpa extension/build/)
cd web
npm install
npm run build                # gera extension/build/panel/
```

Carregar `extension/build/` em `chrome://extensions` como acima.

> Iterando no painel: `cd web && npm run dev` sobe um dev server Vite comum
> (`http://localhost:5173`) pra iterar na UI mais rápido, mas nesse modo `chrome.runtime` não
> existe (não é uma página da extensão) — as chamadas à API falham. Pra testar de verdade,
> rode `npm run build` e abra pelo popup.

### Painel completo (`web/`)

App **Vite + React + TypeScript** que builda para `extension/build/panel/` e roda como
**página da própria extensão** (`chrome-extension://.../panel/index.html`, aberta pelo botão
"🗂️ Abrir painel" no popup). Fala com o background via `chrome.runtime.sendMessage` — sem
HTTP, sem proxy (`web/src/lib/api.ts`). Usa `HashRouter` (não `BrowserRouter`) porque uma
página de extensão não tem servidor pra resolver rotas profundas no F5.

Páginas: **Dashboard** (totais, distribuição por marca/ano, preço médio/mediano, quedas de
preço, status da IA), **Listagem** (tabela paginada com ordenação por coluna, filtros
persistentes na querystring — marca, ano, faixa de preço/km, busca — e seleção múltipla),
**Detalhe** (`/anuncio/:id`: galeria + dados da IA + properties + descrição, "Reanalisar" e
"Remover do DB"), **Comparador** (`/comparador?ids=…`: 2 a 4 anúncios lado a lado, opcionais
em matriz), **Config** (provedores de IA — vários, com select de modelo e teste —, JSON cru, exportar CSV/JSON, **importar um `db.json` antigo**, limpar DB).

### Usar

1. Clique no ícone da extensão → abre a **janela** do OLX Workspace.
2. Deixe **uma aba do OLX** aberta numa página de listagem de carros — a URL precisa conter
   `carros-vans-e-utilitarios` (categoria "Autos e peças › Carros, vans e utilitários") **ou**
   ser uma busca nacional `olx.com.br/brasil?q=...` cujo termo pesquisado seja reconhecido como
   carro (marca/modelo/palavra-chave de veículo). Fora disso a extensão não faz nada.
3. **📊 Executar Análise** → lê só a página atual e mostra a lista (log no console da janela).
   Ou **📚 Varrer páginas** (campo "até N" + "rolar cada página" + "pular os que já estão no
   DB" + "salvar no DB") → percorre a paginação do OLX (`?o=2`, `?o=3`, …) a partir da página
   atual. O nº efetivo de páginas é `min("até N", páginas que a paginação do OLX mostra, 10)`
   — nunca varre mais que 10 nem além da última página real. Extrai as `section` de cada uma,
   **ignora anúncios repetidos** (mesmo id em outra
   página) e, se marcado, os que **já estão na base**, categoriza na IA ativa em lotes,
   **grava os novos na base** (registro raso, sem visitar a página) e devolve a lista
   acumulada. Para sozinho quando a página não traz nada novo; ao final volta a aba para onde
   você estava. O painel mostra os registros já na próxima vez que a aba ganhar foco.
4. Marque itens (ou **"selecionar todas (N)"** — pega todas as páginas da lista e ignora os
   já analisados) → **🔎 Analisar selecionados** → a aba do OLX navega por cada anúncio, os
   dados são extraídos, categorizados e gravados na base. Anúncio que já tem os dados da
   página é **pulado** (badge `✔ analisado`); a aba volta para a listagem no fim.
5. **🗃️ Ver DB** mostra a base salva; **limpar DB** zera.

> Depois de qualquer mudança no código: `npm run build` (ou deixe o `dev` rodando) **e**
> recarregue a extensão em `chrome://extensions` (botão ↻) — MV3 não recarrega o service
> worker sozinho.

---

## Estrutura de pastas

```
OLX_SCRAPPER/
├── README.md               ← este arquivo (status + histórico)
├── setup.sh                ← instala tudo, builda extensão + painel (nessa ordem)
├── db.json                 ← histórico/backup de uma versão anterior (não versionado);
│                             importável pelo painel em DB/Config, não é mais lido em runtime
├── extension/
│   ├── src/
│   │   ├── manifest.json
│   │   ├── background.ts    ← service worker / orquestrador
│   │   ├── content.ts       ← extração na aba do OLX (sem console)
│   │   ├── popup.ts         ← UI + logs no console da extensão
│   │   └── background/
│   │       ├── store.ts      ← base em chrome.storage.local (substitui db.json)
│   │       ├── ai-config.ts  ← config/chaves dos provedores de IA (chrome.storage.local)
│   │       └── ai-client.ts  ← chama DeepSeek/OpenAI direto (substitui proxy/server.mjs)
│   ├── public/popup.html
│   ├── styles/popup.css
│   ├── webpack.config.js
│   ├── tsconfig.json        ← strict
│   └── build/               ← bundle final (carregar esta pasta no Chrome)
│       └── panel/            ← build do web/, gerado pelo Vite (não versionado)
└── web/                     ← painel completo (Vite + React + TS) — builda pra extension/build/panel/
    ├── index.html
    ├── vite.config.ts       ← alias @, base relativo, outDir = ../extension/build/panel
    ├── tailwind.config.js   ← tokens neutros, escala de espaço travada
    └── src/
        ├── types.ts         ← shape do registro salvo pela extensão (fonte única)
        ├── lib/
        │   ├── api.ts       ← camada única que fala com o background (chrome.runtime.sendMessage)
        │   ├── rows.ts      ← achata Db → AdRow[] + agregados + oportunidade
        │   ├── format.ts    ← parse/format de preço, km, data
        │   ├── useDb.ts     ← lê a base da extensão (loading/vazio/erro) + status da IA
        │   ├── useFilters.ts← filtros ⇄ querystring
        │   └── exporters.ts ← CSV / JSON
        ├── components/
        │   ├── Layout.tsx   ← sidebar + header
        │   ├── data-table/  ← tabela (TanStack) no padrão openstatus
        │   └── ui/          ← button, input, select, badge, checkbox
        └── pages/           ← Dashboard, Listing, Detail, Compare, Ai, Config
```

---

## Decisões de projeto

- **Tudo dentro da extensão, sem proxy nem dev server** (mudança de 2026-09-16): a chave de
  IA fica em `chrome.storage.local`, só acessível pelo próprio perfil do Chrome — nunca sai
  da máquina do usuário nem trafega por um servidor local. O service worker MV3 pode chamar
  DeepSeek/OpenAI direto porque `host_permissions` cobre as duas APIs.
- **`chrome.storage.local` em vez de `db.json`**: elimina a dependência de um processo Node
  escrevendo em disco. Em troca, o dado não é mais versionável/inspecionável fora do Chrome
  por padrão — por isso o painel tem exportar **e** importar `db.json` (DB/Config), pra quem
  quer um backup em arquivo ou está migrando de uma instalação com a versão antiga (proxy).
- **Painel como página da própria extensão** (`chrome-extension://.../panel/index.html`), não
  mais um dev server Vite à parte: abre pelo botão do popup, sem precisar de outro processo
  rodando. Usa `HashRouter` (não `BrowserRouter`) porque não há servidor pra resolver rotas
  profundas no F5 de uma página de extensão.
- **Janela separada** (`chrome.windows.create`) em vez de popup de toolbar: não fecha ao
  clicar fora; cabe a lista paginada.
- **Reutiliza a aba do OLX** nas análises de detalhe (`chrome.tabs.update`), não abre abas
  novas; ao final volta para a listagem.
- **`content.ts` sem `console.*`:** todo diagnóstico sai no console **da extensão**.
- **Sem dependências de runtime na extensão** (só `chrome.storage`/`fetch`, nativos do
  browser). Dev deps só o toolchain (webpack, ts-loader, typescript, copy-webpack-plugin) e,
  pro painel, React/Vite/Tailwind.

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
  tipos não-carro fica em `NAO_CARRO` em `background/constants.ts`.
- A base agora vive em `chrome.storage.local` (com `unlimitedStorage`), então **desinstalar a
  extensão apaga os dados** — exporte pelo painel (DB/Config → "db.json cru") antes de
  desinstalar/trocar de máquina, e reimporte depois pelo botão "Importar db.json".

---

## Histórico de atualizações

> Formato: mais recente no topo. Cada entrada diz **o que** mudou e **por quê**.

### 2026-09-22 (3) — Aviso "Nenhuma IA configurada" atualiza sozinho

- O toast "Nenhuma IA configurada" só reavaliava no `window.addEventListener("focus", ...)` do popup — como a Config de IA é feita no painel (aba/janela separada), configurar lá não focava a janela do popup, então o aviso só sumia depois de um refresh manual. Agora `ai-missing.ts` também escuta `chrome.storage.onChanged` na chave `olx.aiConfig` e reavalia na hora em que a config muda, venha de onde vier. Só typecheck + build.

### 2026-09-22 (2) — Tutorial guiado no popup + quantidade na análise rápida

- **Tutorial guiado**: botão "🎓 Tutorial" no cabeçalho do popup roda um tour em 5 passos (spotlight sobre o elemento + card com explicação, Voltar/Próximo/Pular) cobrindo o alternador Iniciante/Avançado, os dois tipos de ação, a quantidade a analisar, o botão de começar e o "Abrir painel". Vem **habilitado por padrão** (`tourAuto: true` em `prefs.ts`) e dispara sozinho na primeira vez que a extensão é aberta; depois disso só volta pelo botão (`popup/tour.ts`).
- **Quantidade na análise rápida**: Modo Iniciante ganhou um campo "Quantidade a analisar" (1–50, **padrão 5** na primeira vez) que limita quantos cards do topo da página entram na "Analisar esta página" — antes analisava todos os cards da página sem opção de limite. `quickAnalyze` no background agora aceita um `limit` opcional (`background/actions/quick-analyze.ts`); o Modo Avançado continua sem limite (chamada sem `limit` = analisa tudo, comportamento inalterado). Só typecheck + build.

### 2026-09-22 — Redireciona para busca de carros em página incompatível

- Ao clicar no ícone da extensão numa aba que não é uma página de carros do OLX (`isCarrosOlxUrl`), a aba ativa é navegada para `https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios` antes de abrir o painel (`background/panel.ts`). Evita abrir o popup "solto" sem uma listagem válida pra operar. Só typecheck.

### 2026-09-21 (5) — Modo Iniciante: removido "Mostrar opções"

- Saíram os checkboxes Análise rápida / Rolar automaticamente / Destacar anúncios. Valores fixos: **análise rápida ligada, destaque ligado, rolagem automática desligada** (constantes em `popup/beginner.ts`). O campo "Páginas para varrer" continua, num card próprio que só aparece em "Varrer páginas". Prefs antigas no localStorage são ignoradas. Só typecheck.

### 2026-09-21 (4) — Comparador: rola até a análise da IA

- Ao clicar em comparar com IA / métricas, a página rola suavemente até "Análise complementar da IA" (e de novo quando o resultado chega); respeita `prefers-reduced-motion`. Só typecheck.

### 2026-09-21 (3) — Popup: itens mais fáceis de selecionar

- Checkbox maior (22 px) com área de clique estendida até a borda do card, e o **card inteiro** agora alterna a seleção ao clicar (o link "Ver no OLX" continua abrindo normalmente). Só typecheck; não conferi no navegador.

### 2026-09-21 (2) — `production.sh`: pacote para a Chrome Web Store

- Novo `production.sh` (raiz): build limpo (extensão → painel), `validate:store` e gera `dist/olx-workspace-<versão>.zip` (versão lida do manifest, sem `.map`). Pré-requisito: `zip`. `dist/` entrou no `.gitignore`.

### 2026-09-21 (1) — Correções: outliers na média, marcas válidas, análise no topo, limpar sem dados

- **Média sem outliers** (`web/src/lib/rows.ts`): preços com 100% ou mais de variação (acima ou abaixo) da mediana do grupo não entram na média de mercado nem na média do Dashboard.
- **Select de Marca validado** (`web/src/lib/brands.ts`): só aparecem marcas de carro conhecidas; lixo de outras categorias do OLX some do filtro.
- **Análise e métricas no topo** da página do anúncio (`Detail.tsx`): o resumo vem antes da galeria.
- **"Remover sem dados"** na Listagem: apaga (com confirmação) anúncios sem preço, km e ano.

### 2026-09-18 (14) — Animações simples de movimento no painel

- **Troca de página:** conteúdo entra com fade + leve subida (`Layout.tsx`, chaveado por rota); menu
  lateral desliza da esquerda ao abrir.
- **Entrada em sequência (`.stagger`):** cards-resumo e listas do Dashboard e cards da Listagem
  aparecem um após o outro (40 ms de intervalo).
- **Hover:** cards do Dashboard sobem 2 px (`.lift`); botões afundam ao clicar (`active:scale-95`).
- **Modal e menu de ajuda:** entram com zoom leve; banner de "sem IA" e caixas do Modo aprendizado
  deslizam de cima.
- **Acessibilidade:** `prefers-reduced-motion` desliga todas (regra global em `index.css`).
- Keyframes em `tailwind.config.js` (`popIn`, `slideDown`, `slideInLeft`). Não conferi no navegador.

### 2026-09-18 (13) — Menu lateral fixo no scroll

O `<aside>` do painel (`Layout.tsx`) agora é `sticky top-0 h-screen` a partir de `md`: fica parado
enquanto o conteúdo rola, com rolagem própria se a janela for baixa. No celular a barra de
navegação continua no fluxo normal (rola junto com a página).

### 2026-09-18 (12) — Dark mode no painel

Botão de tema no menu lateral que alterna **Sistema → Claro → Escuro** (`olx.theme` em
`localStorage`; "Sistema" acompanha o SO em tempo real). O popup da extensão já seguia o tema do
sistema (`prefers-color-scheme` em `popup.css`) e não mudou.

- Cores do painel viraram variáveis CSS em canais RGB (`index.css`), com os valores escuros em
  `:root[data-theme="dark"]`; `tailwind.config.js` só referencia as variáveis. Cores hexadecimais
  fixas dos componentes (badges, alertas, botões, filtros) viraram tokens (`ok-bg`, `warn-border`,
  `accent-hover`…).
- `lib/theme.tsx` aplica o tema já na importação (antes do 1º render, sem piscar);
  `components/ThemeToggle.tsx` é o botão.
- Ao criar cor nova, use token — hex fixo em classe quebraria o modo escuro.
- Só typecheck + build + `validate:store`; **não conferi o visual no navegador**, então vale
  olhar contraste em cada tela.

### 2026-09-18 (11) — Modo aprendizado no painel

Interruptor **"Modo aprendizado"** no menu lateral do painel (lembrado em `localStorage`,
`olx.learningMode`). Ligado, cada tela ganha caixas explicativas; desligado, nada muda.

- `lib/learning.tsx` (contexto) e `components/learning/Learn.tsx` (`LearnNote`, `LearnPage`,
  `LearningToggle`).
- **Por tela:** o que ela é, o que dá pra fazer e como ler — Dashboard, Listagem, Anúncio,
  Comparador e Config. Notas menores explicam cada card/lista do Dashboard, os detalhes expandidos
  da Listagem, a conta do score no Anúncio (base 50, ajustes de preço de -30 a +30, condição da IA
  de -5 a +10, rótulos, confiança), as especificações da IA e o resumo do Comparador.
- Os números citados vêm das constantes de `lib/rows.ts` e do `Dashboard.tsx`; se essas mudarem, os
  textos precisam ser atualizados junto.
- Só typecheck + build + `validate:store`; não abri no navegador.

### 2026-09-18 (10) — Vários provedores de IA, com modelos em select, dentro de Config

O sistema só funciona com IA, então agora ele **avisa quando não há nenhuma configurada** e a
configuração deixou de ser fixa em DeepSeek/OpenAI.

- **Multi-provedor.** `ai-config.ts` guarda uma **lista** de provedores (`olx.aiConfig` =
  `{ activeId, providers[] }`), podendo cadastrar vários (inclusive dois do mesmo tipo). Um é o
  ativo; as análises usam o ativo. Não há migração do formato antigo (a base foi zerada).
- **Catálogo com modelos reais** (`ai-presets.ts`): OpenAI, DeepSeek, Google Gemini, Groq, Mistral,
  xAI, OpenRouter (dá acesso a Claude etc.) e "Outro (compatível com OpenAI)" para endpoint
  próprio (Ollama, LM Studio…). Cada um tem um **select de modelos** + opção "Outro modelo
  (digitar)". Só entraram modelos de chat sem raciocínio obrigatório, porque a chamada usa
  `temperature: 0`. Isso também corrige o modelo padrão do DeepSeek (`deepseek-flash` não existe;
  agora `deepseek-chat`).
- **Onde configurar:** página **Config** do painel (`web/src/components/config/AiProviders.tsx`).
  A antiga aba "IA" (`pages/Ai.tsx`, rota `/ia`) foi removida; o item "DB / Config" virou "Config".
- **Aviso de "sem IA":** banner global no painel (`AiMissingBanner`), aviso no popup
  (`popup/ai-missing.ts`, abre Config ao clicar), status no menu lateral e erro claro
  `AI_NOT_CONFIGURED` do background.
- **Mensagens do background:** `setAiProvider` (agora por `providerId`), `saveAiProvider` e
  `removeAiProvider` substituem `updateAiProviderConfig`. `getAiConfig` devolve também o catálogo.
- **Manifest:** `host_permissions` cobre os provedores do catálogo; `optional_host_permissions`
  permite pedir acesso a um endpoint próprio na hora de salvar.
- Não testado no Chrome com chaves reais: só typecheck + build + `validate:store`. As listas de
  modelos refletem o que eu sabia de cada API; se algum sumir do provedor, use "Outro modelo".

### 2026-09-18 (9) — Exigência de busca de carros só no "Analisar página"

`getActiveOlxTab` ganhou a opção `requireCarSearch`. O erro "Abra uma página de busca de carros do
OLX…" agora vale só para **Analisar página** e **Análise rápida** (páginas abertas pelo usuário).
As demais ações (varrer páginas, analisar selecionados, indicadores, rolagem), em que a própria
extensão navega/abre páginas do OLX, aceitam qualquer aba do OLX.

### 2026-09-18 (8) — Painel web: usabilidade da Listagem, ajuda e responsividade

Refactor de usabilidade do painel (`web/`), adaptado à stack existente (React + Tailwind, sem Zustand:
os filtros já vivem na querystring).

- **Listagem**: tabela reduzida a 5 colunas (Veículo, Ano, Km, Preço, Status) + seleção e ▶; 2ª linha
  com descrição/oportunidade/alertas; clicar expande os detalhes inline (`components/results/*`).
  Abaixo de 1024px vira grid de cards (foto 16/9, preço grande, botão "Ver detalhes" 100% width).
- **Filtros**: busca larga (44px, 16px, sugestões via datalist), chips removíveis, "Limpar tudo",
  "N anúncios encontrados (Filtrou: -X)" (verde/cinza), mensagem de zero resultados, fade ao mudar a lista.
  No mobile os filtros avançados ficam recolhidos atrás do botão "Filtros".
- **Paginação** (`common/Pagination.tsx`) acima e abaixo, botões de 44px, janela de páginas, "Mostrando X–Y de Z",
  scroll ao topo ao trocar de página.
- **Cores** (`lib/colors.ts`): verde/amarelo/laranja/cinza derivados do `priceStatus` (limiar ±5%), sempre com
  ícone + texto (`StatusBadge`).
- **Ajuda**: tooltips `?` (Status, Oportunidade, Alertas, Mercado, Local), botão flutuante de ajuda (tour, cores,
  filtros, FAQ), onboarding de 3 telas (preferência em localStorage), breadcrumb em todas as páginas.
- **Layout**: menu lateral vira barra horizontal < 768px; Input/Select com 44px e 16px no mobile.
- Removidos `data-table/{data-table,pagination,toolbar}.tsx` (só a Listagem usava).
- **Não feito**: Comparador redesenhado, modo escuro, Zustand/React Query, testes automatizados,
  Storybook, drawer de filtros (usa painel recolhível), item "Contato" do menu de ajuda (sem canal definido).

### 2026-09-18 (7) — Toast de análise pendente

- Ao abrir o popup (e ao fim de cada operação) a extensão lê o DB; se houver carros só com o
  rascunho da listagem, aparece um toast "N carros com análise pendente" (`src/popup/pending-toast.ts`).
  Clicar abre um diálogo "Deseja fazer a análise detalhada de N carros agora?"; confirmando, roda o
  "Analisar selecionados" em todos (Modo Iniciante usa o spinner/cancelar dele; Avançado usa a barra
  de status). O toast some enquanto uma operação roda.
- `analyzeTargets()` extraído de `actions/analyze-selected.ts` para reuso.
- Limitação: a "Análise rápida" não grava no DB, então só conta como pendente o que veio de
  "Analisar página"/"Varrer páginas" (rascunho raso).

### 2026-09-18 (6) — Indicadores ativados por padrão

- No Avançado o botão já abre como "Ocultar indicadores" (estado inicial `indicatorsShown = true`),
  refletindo que a página marca os cards sozinha. Limitação: se você ocultou numa sessão anterior
  e reabriu o popup, o rótulo volta a "Ocultar" mesmo com a página oculta (clique duas vezes).

### 2026-09-18 (5) — Ajustes de botões no Avançado

- Removido o botão "Auto-scroll" do Avançado (a rolagem segue como opção "Rolar automaticamente" no
  Iniciante e "Rolar cada página" na varredura). "Exibir indicadores" e "Carregar pendentes do DB"
  foram para a aba ⚙️ Config; a aba "Analisar página" ficou com "Analisar página" + "Análise rápida".

### 2026-09-18 (4) — Aba "Config" no Modo Avançado

- Os textos explicativos (indicadores, análise rápida, rascunho no DB) saíram da aba
  "Analisar página" e foram para uma nova aba **⚙️ Config** ("Como funciona"). Só muda a UI.

### 2026-09-18 (3) — Cancelar operação em andamento

- Botão **✋ Cancelar** no Modo Iniciante (durante a análise) e **Cancelar operação** no
  Avançado (aparece enquanto os botões estão travados). Manda `cancel` ao background.
- Cancelamento cooperativo: `background/cancel.ts` (`beginOperation`/`throwIfCancelled`/
  `CancelledError`). Checagens entre páginas da varredura, entre anúncios do "Analisar
  selecionados" e entre lotes da IA; a chamada à IA em curso é abortada (`AbortSignal.any`).
  A rolagem para via `stopScroll` no content script.
- Ao cancelar, a aba volta à página original e o roteador responde `{ ok: false, cancelled: true }`
  (o popup mostra "cancelada", não erro). Varrer/Analisar página **descartam** o resultado
  parcial; "Analisar selecionados" mantém o que já foi salvo no DB.
- "Análise rápida" não tem cancelamento (é instantânea).

### 2026-09-18 (2) — Popup com Modo Iniciante / Avançado

- **Modo Iniciante (padrão)** no popup: 1) escolher "Analisar esta página" ou "Varrer todas as
  páginas"; 2) opções recolhidas ("Análise rápida", "Rolar automaticamente", "Destacar
  anúncios", nº de páginas na varredura) com tooltip `?`; 3) "🚀 Começar análise" com spinner,
  mensagem de sucesso/erro e link "Abrir painel de resultados". Linha "N anúncios serão
  analisados" atualizada a cada 5 s / ao focar a janela (lê os cards da aba da OLX).
- **Modo Avançado** = a interface anterior inteira (abas, seleção, Ver/Importar DB), só
  escondida/mostrada; alternar não perde estado. O resultado do Iniciante também aparece na
  lista do Avançado.
- Preferências (modo, ação, opções) em `localStorage` — `src/popup/prefs.ts`.
- Jargão trocado nos textos do Iniciante e em parte do Avançado (sem "IA"/"heurística"/"DB").
- Arquivos novos: `src/popup/{beginner,mode,prefs}.ts`; alterados `popup.html`, `dom.ts`,
  `index.ts`, `popup.css`.
- **Decisão:** mantido TypeScript vanilla (o popup não é React e o CLAUDE.MD veda nova lib de
  estado). Fica de fora: persistir a seleção do Avançado (a lista de itens não é persistida) e
  contagem em tempo real durante a execução.

### 2026-09-18

- **Preparação para publicação na Chrome Web Store.** Pedido: publicar a extensão na loja.
  Adicionados ícones (`extension/src/icons/icon{16,32,48,128}.png`, gerados a partir de
  `logo.png` na raiz — versão final sem o logotipo "OLX", pra evitar rejeição por uso de marca
  de terceiro) referenciados em `manifest.json` (`icons` e
  `action.default_icon`) e copiados no build pelo `webpack.config.js`. Criado
  `extension/scripts/validate-store-readiness.js` (`npm run validate:store`), que roda contra
  `extension/build/` e falha se: `manifest_version` não for 3, faltar `icons`/ícone declarado
  ausente do disco, `content_security_policy` tiver `unsafe-eval`, os bundles usarem
  `eval()`/`new Function()`/`importScripts()` remoto/`document.write()` (proibidos no
  Manifest V3), ou houver padrão de chave de API (OpenAI/DeepSeek `sk-...`, Google `AIza...`)
  hardcoded no bundle — chave deve vir do usuário via `chrome.storage`, nunca embutida. Também
  passou a checar `build/panel/index.html` (o painel React, buildado por `web/` via Vite):
  como o build da extensão (webpack, `clean: true`) apaga `extension/build/` inteiro, buildar só
  `extension/` sem buildar `web/` **depois** derruba o painel ("Abrir painel" quebra em
  produção com `ERR_FILE_NOT_FOUND`) — foi o que aconteceu ao rodar `npm run build` isolado na
  extensão; corrigido rebuildando `web/` na ordem certa (ver `setup.sh`). Novo workflow
  `.github/workflows/extension-validate.yml`: em toda mudança em `extension/**` ou `web/**`
  (push/PR), builda extensão → builda painel **nessa ordem** → `validate:store`, pra pegar essa
  e outras regressões de compliance antes de gerar o pacote pra loja.
- **Botão "⚡ Análise rápida" — score sem IA, só com os dados do card.** Pedido: varrer os
  carros da página e dar um score usando só o que já está no componente do card (o
  `<section class="olx-adcard">`), sem chamar a IA. Novo `background/quick-score.ts`
  (`quickCategorize(card)`): lê `ano` do título (regex por ano de 4 dígitos), `motor`,
  `carroceria`, `combustível` e `câmbio` dos `details[]` (mesmos `aria-label` que o
  `listing-extractor.ts` já lê pra achar km/cor — ex.: `aria-label="Motor 1.5"`,
  `aria-label="Carro tipo SUV"`), e calcula um score 0-100 puramente aritmético a partir de
  km ÷ idade (mesma lógica de "km suspeita" que a IA já usa em `ai-client.ts`, só que sem
  pedir pra IA calcular). Novo `background/actions/quick-analyze.ts` (ação `quickAnalyze`,
  roteada em `message-router.ts`) extrai os cards, categoriza local e pinta na página
  (`markCards`) com um **novo status "quick"**: borda azul tracejada + badge `⚡score`,
  distinto do verde (IA, "done") e amarelo (pendente). `content/card-marking.ts` ganhou uma
  prioridade de status (`pending < quick < done`) pra o auto-mark (que roda a cada mutação da
  página, lendo só o DB) não apagar um badge "quick" recém-pintado nem um "done" da IA. Botão
  novo em `popup.html` (ao lado de "Analisar página"), lista de resultados no popup também
  mostra o badge `⚡ rápido (sem IA)` (`item-row.ts`). Marca/modelo/versão continuam vazios —
  isso ainda exige IA ("Analisar página"/"Analisar selecionados"); a análise rápida é só uma
  triagem instantânea de km/ano pra decidir o que vale a pena mandar pra IA depois.
- **Indicador de carregamento na própria página do OLX.** Pedido: mostrar que a extensão está
  trabalhando direto na aba do OLX, não só no log da janela do popup. Novo módulo
  `extension/src/content/loading-overlay.ts` (`showLoading(text)` / `hideLoading()`): pinta um
  badge fixo no canto superior direito da página (spinner + texto, mesmo estilo visual dos
  badges de score já existentes — sem shadow DOM, `<style>` injetado em `document.head`). Duas
  novas ações de content script (`showLoading`/`hideLoading`, `content/types.ts` +
  `content/message-router.ts`) e um helper no background
  (`extension/src/background/loading.ts`: `setPageLoading()`/`clearPageLoading()`, best-effort —
  ignora se a aba já navegou e o content script ainda não recarregou). Ligado em
  `actions/analyze.ts` ("Analisando anúncios..."), `actions/crawl-listing.ts` (texto por página
  durante a varredura + "Categorizando N anúncio(s)..." depois de voltar pra listagem original)
  e `actions/analyze-selected.ts` (texto por anúncio, alternando "Analisando..." /
  "Categorizando..."), sempre limpo em `finally` para não ficar preso na tela se algo falhar.
- **Aceita busca nacional `olx.com.br/brasil?q=...`, além da categoria de carros.** Pedido:
  aceitar URLs como `https://www.olx.com.br/brasil?q=ford%20ka`, mas **bloquear** se a busca
  não for de carro. `isCarrosOlxUrl()` (`extension/src/background/tabs.ts`) agora também aceita
  URLs com path `/brasil` **se** o `q=` contiver marca/palavra-chave de veículo reconhecida
  (nova função `isCarSearchQuery()` + set `CAR_SEARCH_KEYWORDS` em
  `extension/src/background/constants.ts` — fiat, ford, volkswagen, "carro", "suv", etc.,
  comparação sem acento/caixa). Busca nacional sem `q` ou com termo não reconhecido como carro
  continua bloqueada, com a mesma mensagem de erro atualizada. **Limitação:** o
  `content_scripts` declarativo do `manifest.json` (auto-mark de indicadores ao abrir a página)
  ainda só casa `*carros-vans-e-utilitarios*` — não dá pra filtrar por `q=` num match pattern
  declarativo — então em páginas `/brasil?q=...` os indicadores só aparecem clicando "Exibir
  indicadores"; as ações principais (Executar Análise, Varrer páginas, Analisar selecionados)
  funcionam normalmente, pois injetam o content script via `chrome.scripting.executeScript`.

### 2026-09-17

- **Popup ganhou o botão "⬆️ Importar DB"** para carregar um `db.json` exportado (como o da raiz
  do repo) direto na base da extensão (`chrome.storage.local`). Por quê: o `db.json` antigo
  (usado quando ainda existia o proxy Node) precisava ser migrado para a base atual da extensão
  sem passar por servidor nenhum.
  - `extension/public/popup.html` / `extension/src/popup/dom.ts`: novo `<input type="file">`
    (`importDbInput`) escondido, disparado pelo botão `importDbBtn`.
  - `extension/src/popup/actions/db-view.ts`: lê o arquivo escolhido, faz `JSON.parse` e chama
    a ação `importDb` (já existente em `message-router.ts` → `store.dbImport`), que faz merge
    por id sem apagar o que já está salvo.

### 2026-09-16 (2)

- **Tudo passou a rodar dentro da extensão** — removidos `proxy/` (servidor Node) e o dev
  server separado do painel. Por quê: o usuário pediu que a extensão fosse autocontida, sem
  precisar manter processos externos rodando só pra usá-la.
  - `extension/src/background/store.ts` (novo) guarda a base em `chrome.storage.local`
    (`olx.db`), substituindo `db.json` + as rotas `GET/POST/DELETE /db` do proxy.
  - `extension/src/background/ai-config.ts` (novo) guarda a config/chaves dos provedores de
    IA (DeepSeek/OpenAI) em `chrome.storage.local` (`olx.aiConfig`), substituindo `proxy/.env`.
  - `extension/src/background/ai-client.ts` (novo) chama a API do provedor ativo direto do
    service worker (`fetch`), portando os prompts e o tratamento de erro de
    `proxy/server.mjs` (`callAi`, `buildPrompt`, `buildComparePrompt`, `buildMetricsPrompt`).
  - `message-router.ts` ganhou as ações `getAiConfig`, `setAiProvider`,
    `updateAiProviderConfig`, `aiAnalyze`, `aiCompare`, `aiMetrics`, `importDb`, `removeRecord`
    — o painel agora fala com o background por `chrome.runtime.sendMessage`, não HTTP.
  - `manifest.json`: `host_permissions` trocou `http://localhost:8787/*` por
    `https://api.deepseek.com/*` e `https://api.openai.com/*`; ganhou `storage` e
    `unlimitedStorage`.
  - `web/` (painel) builda direto em `extension/build/panel/` (Vite, `base: "./"`) e abre como
    página da extensão pelo botão "🗂️ Abrir painel" no popup (`extension/src/popup/actions/open-panel.ts`).
    `web/src/lib/api.ts` e `img.ts` não falam mais HTTP com um proxy; `main.tsx` trocou
    `createBrowserRouter` por `createHashRouter` (página de extensão não tem servidor pra
    resolver rotas no F5).
  - `web/src/pages/Config.tsx` trocou o campo "endpoint do proxy" por um botão "Importar
    db.json" (merge por id), pra trazer dados de uma instalação com a versão antiga.
  - `db.json` da raiz **não foi apagado** (fica como backup/histórico) mas deixou de ser lido
    em runtime; `setup.sh` não abre mais terminais, só instala e builda (webpack → depois
    Vite, porque o build da extensão limpa `extension/build/`).

### 2026-09-16

- **Refatoração de `extension/src`** para arquitetura escalável: cada entry point
  (`background.ts`, `content.ts`, `popup.ts`) virou um bootstrap fino (`import "./<pasta>/index"`)
  e a implementação foi dividida em pastas de mesmo nome (`background/`, `content/`, `popup/`),
  organizadas por responsabilidade (`actions/`, `render/`, `db.ts`, `tabs.ts`, `state.ts`,
  etc. — ver seção [Arquitetura](#arquitetura)). Motivo: os três arquivos tinham crescido para
  ~600–1050 linhas cada, misturando tipos, extração de DOM, chamadas de IA, persistência e UI
  num único módulo, dificultando manutenção. Nenhum comportamento mudou; os três bundles do
  `webpack.config.js` continuam apontando para os mesmos entry points e o `npm run build`
  gera os mesmos três arquivos (`background.js`, `content.js`, `popup.js`).

### 2026-09-14

- **Campo pra digitar a quantidade a selecionar**, na toolbar de seleção (ao lado de
  "selecionar todas"). Depois de "Carregar pendentes do DB" trazer centenas de itens de uma
  vez, "selecionar todas" seleciona tudo — sem opção de processar aos poucos. Novo input
  numérico + botão "Selecionar quantidade": seleciona só os N primeiros pendentes (entre os
  que ainda não foram analisados a fundo), pra rodar "Analisar selecionados" em lotes
  menores em vez de mandar tudo de uma vez. `popup.ts` limita o `max` do input ao total de
  pendentes atual.
- **"Analisar página" não perde mais o que categorizou ao fechar a extensão.** Antes, o
  resultado do "Analisar página" (categorização rasa da listagem — marca/modelo/ano/score)
  só existia na memória da janela do popup; fechando a janela sem rodar "Analisar
  selecionados" em cima, esse trabalho ia pro lixo. Agora `analyze()` em `background.ts`
  grava um rascunho raso (`itemToRecord()`, mesma função que o "Varrer páginas" já usava) de
  cada carro **novo** no `db.json` ao final da análise — nunca sobrescreve quem já está no DB
  (raso ou completo). Status do botão passa a mostrar quantos foram salvos.
  Novo botão **"📥 Carregar pendentes do DB"**: lê o `db.json` inteiro, filtra os registros
  ainda `shallow` (rasos — passaram pela listagem mas não pela página do anúncio) de
  **qualquer sessão anterior** e devolve pra lista do popup (`loadPending()` +
  `recordToItem()` em `background.ts`, rota `"loadPending"`) — dá pra selecionar e rodar
  "Analisar selecionados" neles na hora, mesmo numa janela nova da extensão, porque
  `analyzeSelected()` já navega pela `url` salva no registro (não depende da página de
  listagem onde foram vistos originalmente).
- **Corrigido: aba do OLX travando com a extensão ativa.** O `MutationObserver` do auto-mark
  (adicionado na feature "indicadores aparecem sozinhos ao abrir a página", acima) tinha dois
  problemas que juntos causavam trava em listagens grandes:
  1. A cada mutação do DOM ele rodava `extractSections()` **completo** — parseia título,
     preço, km, cor, local, data e nº de fotos de TODO card na página (~8 querySelectorAll por
     card) — só pra descobrir os ids ainda sem marcação. Depois de um "Varrer páginas"/scroll
     longo (centenas de cards acumulados), isso repetia a cada ~1s, pra sempre.
  2. Pior: inserir o próprio badge de score (`markCards()` faz `section.appendChild(badge)`)
     É uma mutação do DOM — que dispara o MESMO observer de novo, criando um ciclo que nunca
     silencia sozinho.
  Corrigido com: `collectPendingIds()`, uma varredura BARATA que só lê o id de cada
  `section.olx-adcard` (via o link, com fallback pro atributo já tagueado) sem parsear mais
  nada — substitui o `extractSections()` completo dentro do loop do auto-mark (que continua
  completo só quando de fato chamado via "Analisar página"/"Exibir indicadores", ações
  pontuais do usuário, não em loop). E `isOwnMutation()`, que ignora lotes de mutação onde
  todo nó adicionado/removido é o próprio `.olxw-score-badge`, quebrando o ciclo do item 2.
  Intervalo do throttle subiu de 1s pra 1.5s como margem extra.
- **Alerta de "km suspeita" (km muito baixa pra idade do carro) via IA.** O prompt em
  `proxy/server.mjs` (`buildPrompt()`, usado por `/analyze` — listagem, deep analyze e o
  backfill de score) ganhou os campos `kmSuspeito`/`kmSuspeitoMotivo`. A IA recebe o ano
  atual real (`new Date().getFullYear()`, calculado no servidor — não deixo a IA "adivinhar"
  o ano de hoje) e agora também o `km` numérico de cada anúncio como campo estruturado (antes
  só ia embutido em texto solto dentro de `details`); ela calcula km/ano de uso e marca
  `kmSuspeito: true` quando a média é muito baixa pra um carro de passeio comum
  (bem abaixo de ~3.000 km/ano) — indício de odômetro voltado, sinistro rodado escondido ou
  km real maior que o anunciado. Carros muito novos (0-1 ano) ou sem `km`/`ano` suficientes
  ficam `null` (a IA foi instruída a não inventar). Km muito ALTA pra idade não entra aqui —
  isso já pesa no `score` de condição existente; este campo é só pra km anormalmente BAIXA.
  Testado com casos reais: 8.000km/10 anos → `kmSuspeito: true` com motivo "800 km/ano";
  95.000km/10 anos → `null`.
  Surfaced em 3 lugares: **popup da extensão** (badge vermelho "⚠️ km suspeita" em
  `renderItem()`, tooltip com o motivo), **Listagem** do painel web (badge amarelo ao lado
  do modelo/versão) e **Detalhe** do anúncio (banner de aviso acima da ficha da categoria).
  Tipo `kmSuspeito`/`kmSuspeitoMotivo` adicionado em `AdCategoria` (web) e `Categoria`
  (extensão).
- **Comparador (`web/`) ganhou 2 botões com IA: "Comparar com IA" e "Exibir métricas".**
  Duas rotas novas no proxy — `POST /compare` e `POST /metrics` — reaproveitando a mesma
  infra multi-provedor do `/analyze`; extraí o fetch/timeout/tratamento de erro de
  `handleAnalyze()` pra um helper `callAi(messages, {label})` compartilhado pelas três rotas
  (evita triplicar ~50 linhas de tratamento de erro HTTP/timeout).
  - **"Comparar com IA"**: manda os dados já conhecidos dos carros selecionados (marca,
    modelo, versão, ano, km, preço, score de condição se houver) e pede um **ranking** do
    melhor pro pior custo-benefício, com 1-2 frases de justificativa por carro — exatamente
    "o carro X é melhor pois..., seguido dos outros". Renderizado como lista ordenada, o 1º
    colocado destacado (borda + fundo verde clarinho).
  - **"Exibir métricas"**: pede à IA consumo médio cidade/estrada em **gasolina e álcool**,
    **potência (cv)** e **peso (kg)** — a partir do conhecimento geral dela sobre aquela
    marca/modelo/versão/ano (não vem do anúncio, que não traz ficha técnica). Os resultados
    entram como linhas extras na própria tabela de comparação (Consumo cidade/estrada
    gasolina/álcool, Potência, Peso, Obs. da IA), lado a lado com preço/km/ano que já
    existiam. O prompt pede explicitamente `null` em vez de inventar número quando a IA não
    tem confiança na versão exata.
  - **A comparação em si (a tabela) continua 100% sem IA** — os botões são opt-in; "quero
    poder usar a IA ou não" foi interpretado como: a tabela estática de sempre não muda em
    nada, a IA só entra se o usuário clicar em um dos dois botões nesta sessão.
  - `web/src/lib/api.ts` ganhou `compareCars()`/`carMetrics()` (tipo `CompareCarInput`
    resume o carro pro prompt, sem reenviar o registro inteiro) e `web/src/types.ts` ganhou
    `CompareRankingItem`/`CarMetric` + o campo `score`/`scoreMotivo` em `AdCategoria` (pra
    reaproveitar o score de condição — feature registrada mais acima neste histórico — como
    sinal no ranking).
- **"Exibir indicadores" virou um toggle: ativado mostra "Ocultar indicadores".** Clicar de
  novo remove a borda/score pintados na página do OLX e **pausa** o auto-mark (senão a
  marcação reapareceria sozinha ~1s depois, já que o `MutationObserver` do content script
  continua rodando). `content.ts` ganhou a flag `indicatorsHidden` (module-level): setada em
  `hideIndicators()` — que limpa `data-olxw-status` e remove os badges de todo
  `section.olx-adcard` — e checada no início de `autoMarkVisibleCards()`; volta a `false`
  sempre que `markCards()` roda de novo (auto-mark, "Analisar página" ou "Exibir
  indicadores"), então a próxima marcação (automática ou manual) já reativa sozinha. Nova
  rota `hideIndicators` no `background.ts`/roteador, e `popup.ts` troca o rótulo do botão
  (`setIndicatorsButtonLabel()`) — "Analisar página" também sincroniza pra "Ocultar
  indicadores" já que ele pinta a página como efeito colateral.
- **Botão "Exibir indicadores"** na aba "Analisar página" do popup. Cobre o caso em que a
  extensão foi recarregada (ou a aba do OLX já estava aberta antes de instalar/atualizar) e o
  `content_scripts` declarativo do manifest não rodou nela — o auto-mark só dispara em
  NAVEGAÇÕES novas depois de carregado. O botão força: injeta o content script na aba atual
  (`chrome.scripting.executeScript`, funciona mesmo sem o `content_scripts` ter rodado),
  extrai os cards e chama `checkKnown()` — mesma rota do auto-mark, só lê o `db.json`, **sem
  IA**. Nova função `showIndicators()` em `background.ts`, roteada pela action
  `"showIndicators"`; status final no popup resume quantos ficaram verde/amarelo.
- **Indicadores aparecem sozinhos ao abrir a página do OLX** (antes só apareciam depois de
  clicar em "Analisar página"). `manifest.json` ganhou um `content_scripts` declarativo
  (`matches: https://*.olx.com.br/*carros-vans-e-utilitarios*`, `document_idle`) — o
  `content.js` agora roda automaticamente em toda página de carros, sem precisar de
  `chrome.scripting.executeScript` do background primeiro. Ao carregar, `content.ts` chama
  `autoMarkVisibleCards()`: extrai os cards visíveis, manda os ids ainda sem marcação pro
  background (`action: "checkKnown"`, nova rota — só lê o `db.json` local, **sem IA, sem
  custo**) e pinta a borda verde/amarela + score de volta com `markCards()`. Um
  `MutationObserver` no `document.body` reagenda essa checagem (throttle de ~1s, não debounce
  puro, pra não ficar esperando a página parar de mutar pra sempre) — cobre scroll infinito e
  troca de filtro carregando cards novos. `background.ts` ganhou `checkKnown(ids)`, que nunca
  lança (proxy fora do ar → lista vazia, tenta nas próximas mutações). O clique em "Analisar
  página" continua sendo o único jeito de rodar a categorização por IA de fato (isso teria
  custo); a auto-marcação só reflete o que já está salvo no DB.
- **Popup em 2 abas ("Varrer páginas" / "Analisar página") + borda e score direto nos
  cards do OLX.** `extension/public/popup.html` ganhou um seletor de abas (`.tabs`); a
  varredura de paginação foi pra `#panelCrawl` e o botão "Analisar página" (antes "Executar
  análise") + Auto-scroll foram pra `#panelAnalyze` — a lista de resultados/toolbar/DB
  continuam compartilhados abaixo, então tanto "Varrer" quanto "Analisar" alimentam a mesma
  lista. `popup.ts` faz a troca (`showTab()`) e agora também pinta cada item da lista com
  `border-left` verde (`.item.done`) ou amarelo (`.item.pending`) e mostra um badge
  "Score N" (verde/laranja/vermelho por faixa) quando o item já foi analisado a fundo e tem
  `categoria.score`.
  **A mesma marcação agora aparece direto na página do OLX**, não só no popup — pedido do
  item 5 do `prompt.md` ("Na UI do OLX add um componente com o score"). `content.ts` tagueia
  cada `section.olx-adcard` com `data-olxw-id` na extração e ganhou a ação `markCards`, que
  aplica `outline` verde/amarelo + um badge de score (canto superior direito) direto no card
  real do OLX — `background.ts` chama isso ao fim de `analyze()` (a ação por trás do botão
  "Analisar página"), então qualquer carro na tela — novo ou **já analisado antes** — fica
  marcado assim que a tela é analisada, sem precisar re-selecionar nada.
  **Score de condição do carro (0-100):** o prompt da IA (`proxy/server.mjs`) ganhou os
  campos `score` e `scoreMotivo` no JSON pedido, com instruções de quando estimar e quando
  responder `null` (sem inventar nota sem sinal nenhum no anúncio). `analyzeSelected()`
  grava o score que vier junto da categoria, como sempre fazia. Pra carros que já estavam no
  `db.json` **antes** dessa feature (sem `score` salvo), `analyze()` agora chama
  `backfillScores()`: pega a `description`/`properties` já salvas no registro (sem navegar
  de novo até o anúncio) e pede só o score pra IA, gravando de volta no registro — é assim
  que "carros já analisados" ganham o selo mesmo sem re-analisar a fundo.
  **Limitação conhecida:** a marcação na página do OLX é aplicada nos elementos DOM reais no
  momento do "Analisar página"; se o React do OLX re-renderizar aquele trecho da listagem
  (troca de filtro, nova página carregada por scroll infinito antes de re-analisar, etc.), a
  marcação pode sumir até a próxima análise — não há `MutationObserver` reaplicando sozinho.
- **Segundo provedor de IA: OpenAI, alternável com o DeepSeek.** O proxy agora guarda a
  config de **cada provedor separadamente** (`providers.deepseek` / `providers.openai`,
  prefixos de env `DEEPSEEK_*` / `OPENAI_*`) e um `AI_PROVIDER` diz qual está **ativo** — é o
  que `/analyze` (e portanto a extensão) usa de fato. `GET /config` devolve os dois blocos +
  o ativo; `POST /config` aceita `{ provider }` pra trocar o ativo e/ou `{ deepseek: {...} }` /
  `{ openai: {...} }` pra editar um provedor específico sem trocar o ativo — tudo persistido em
  `proxy/.env`. Na aba **IA** (`web/src/pages/Ai.tsx`) isso virou duas abas (DeepSeek/OpenAI):
  clicar numa torna esse provedor o ativo (mostra um selo "ativo"); o formulário abaixo edita a
  config de qualquer uma das duas independentemente; "Testar IA" sempre testa o **ativo**.
  DeepSeek e OpenAI usam o mesmo formato de request (`chat/completions` estilo OpenAI), então
  o `handleAnalyze()` não precisou de lógica por provedor além de trocar `apiUrl`/`model`/
  `apiKey`/`timeoutMs`.
- **Corrigido `DEEPSEEK_MODEL`: era `DeepSeek-V4.1-Flash`, que a API rejeitava** (`"The
  supported API model names are deepseek-flash, deepseek-v4-pro..."`). Trocado para
  `deepseek-flash` (default em `server.mjs` e `.env.example`, e no `.env` local). **Atenção:**
  ao testar `deepseek-flash` via `/analyze` a chamada upstream ficou lenta (bem acima de 60s)
  e em uma tentativa devolveu HTTP 200 com corpo vazio — parece questão da própria API/conta
  DeepSeek, não do proxy (a OpenAI, testada com o mesmo código, respondeu normal e rápido).
  Vale confirmar na sua conta DeepSeek se `deepseek-flash` está liberado nesse plano.
- **Nova aba "IA" no painel (`web/`)**, para configurar e testar a IA sem mexer em arquivo.
  Novo par de rotas no proxy: `GET /config` devolve a config atual (apiUrl, model, timeoutMs,
  hasKey, `keyPreview` com a chave mascarada) e `POST /config` atualiza `apiUrl`/`model`/
  `timeoutMs`/`apiKey` em runtime **e** grava em `proxy/.env` (`persistEnv()` reescreve só as
  linhas `DEEPSEEK_*`, preservando o resto do arquivo; campos vazios/omitidos mantêm o valor
  atual, então dá pra trocar o modelo sem reenviar a chave). Não precisa reiniciar o proxy — as
  variáveis viraram `let` em vez de `const`. A página `web/src/pages/Ai.tsx` traz o formulário
  de config + o botão "Testar IA" (que antes vivia em DB/Config — removido de lá pra não
  duplicar). Novo item no menu lateral (`Layout.tsx`) e rota `/ia` (`main.tsx`).
- **Modelo padrão trocado de `deepseek-chat` para `DeepSeek-V4.1-Flash`.** Atualizado o valor
  default em `proxy/server.mjs` (fallback quando `DEEPSEEK_MODEL` não está definido) e em
  `proxy/.env.example`; `proxy/.env` local também ajustado. Não requer mudança de código além
  da variável — o proxy só repassa `MODEL` no corpo da chamada à API.

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
