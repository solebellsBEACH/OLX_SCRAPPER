#!/usr/bin/env bash
#
# setup.sh — prepara o OLX Workspace e abre os terminais de trabalho.
#
# O que faz:
#   1. Instala dependências da extensão e faz o build inicial (terminal atual).
#   2. Abre 3 terminais separados:
#        [1] proxy DeepSeek         -> proxy/     npm start
#        [2] webpack --watch        -> extension/ npm run dev
#        [3] painel / health-check  -> aguarda o proxy e mostra como carregar
#
# Uso:
#   ./setup.sh                 # build + abre os 3 terminais
#   ./setup.sh --no-terminals  # só instala e faz o build (modo headless/CI)
#   ./setup.sh --dev           # igual ao padrão (mantido por compatibilidade)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR/extension"
PROXY_DIR="$SCRIPT_DIR/proxy"
BUILD_DIR="$EXT_DIR/build"

OPEN_TERMINALS=1
[[ "${1:-}" == "--no-terminals" ]] && OPEN_TERMINALS=0

# ----------------------------------------------------------------------------
# Abre um comando num novo terminal gráfico; cai para background com log se
# não houver terminal/serviço gráfico disponível.
# ----------------------------------------------------------------------------
open_terminal() {
  local title="$1" workdir="$2" cmd="$3" slug="$4"
  local hold="echo; echo \"[$title] encerrado. ENTER para fechar.\"; read -r _"
  local full="cd '$workdir' && ${cmd}; ${hold}"

  if [[ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
    echo "!! Sem ambiente gráfico — rodando '$title' em background (log: $workdir/$slug.log)"
    ( cd "$workdir" && nohup bash -lc "$cmd" >"$slug.log" 2>&1 & )
    return
  fi

  if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal --title="$title" -- bash -lc "$full" &
  elif command -v konsole >/dev/null 2>&1; then
    konsole -p tabtitle="$title" -e bash -lc "$full" &
  elif command -v xfce4-terminal >/dev/null 2>&1; then
    xfce4-terminal --title="$title" --command="bash -lc '$full'" &
  elif command -v tilix >/dev/null 2>&1; then
    tilix --title="$title" -e "bash -lc '$full'" &
  elif command -v x-terminal-emulator >/dev/null 2>&1; then
    x-terminal-emulator -T "$title" -e bash -lc "$full" &
  elif command -v xterm >/dev/null 2>&1; then
    xterm -T "$title" -e bash -lc "$full" &
  else
    echo "!! Nenhum terminal gráfico encontrado — rodando '$title' em background (log: $workdir/$slug.log)"
    ( cd "$workdir" && nohup bash -lc "$cmd" >"$slug.log" 2>&1 & )
  fi
}

echo "==> OLX Workspace — setup"

command -v node >/dev/null 2>&1 || { echo "ERRO: Node.js não encontrado (precisa de 18+)." >&2; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "ERRO: npm não encontrado." >&2; exit 1; }
echo "==> Node $(node --version) / npm $(npm --version)"

# --- proxy/.env ---
if [[ ! -f "$PROXY_DIR/.env" ]]; then
  cp "$PROXY_DIR/.env.example" "$PROXY_DIR/.env"
  echo "==> Criado proxy/.env — edite e coloque sua DEEPSEEK_API_KEY"
fi
if ! grep -q '^DEEPSEEK_API_KEY=sk-' "$PROXY_DIR/.env"; then
  echo "!! AVISO: proxy/.env ainda sem DEEPSEEK_API_KEY válida."
fi

# --- extensão: instala + build inicial ---
echo "==> [extension] npm install"
( cd "$EXT_DIR" && npm install --no-audit --no-fund )
echo "==> [extension] typecheck"
( cd "$EXT_DIR" && npm run typecheck )
echo "==> [extension] build inicial"
( cd "$EXT_DIR" && npm run build )

if [[ "$OPEN_TERMINALS" -eq 0 ]]; then
  echo "==> Pronto (modo --no-terminals). Carregue $BUILD_DIR em chrome://extensions"
  exit 0
fi

# --- painel: espera o proxy subir e mostra as instruções ---
PANEL_CMD=$(cat <<PANEL
echo '=== OLX Workspace — painel ==='
printf 'Aguardando o proxy em http://localhost:8787 ... '
for i in \$(seq 1 30); do
  if curl -sf http://localhost:8787/health >/dev/null 2>&1; then echo 'OK'; break; fi
  sleep 1
done
curl -s http://localhost:8787/health; echo
echo
echo 'Carregue a extensão no Chrome:'
echo '  1. chrome://extensions'
echo '  2. Ative o "Modo do desenvolvedor"'
echo '  3. "Carregar sem compactação" -> $BUILD_DIR'
echo
echo 'Depois: abra uma página do OLX, clique no popup -> "Executar Análise".'
echo 'Os dados das sections e a análise DeepSeek aparecem no console (F12) da página.'
PANEL
)

echo "==> Abrindo terminais..."
open_terminal "OLX · Proxy DeepSeek"        "$PROXY_DIR" "npm start"      "proxy"
open_terminal "OLX · webpack --watch"       "$EXT_DIR"   "npm run dev"    "extension-watch"
open_terminal "OLX · Painel"                "$SCRIPT_DIR" "$PANEL_CMD"    "panel"

echo "==> Terminais abertos: proxy, watch e painel."
echo "==> Extensão pronta para carregar em: $BUILD_DIR"
