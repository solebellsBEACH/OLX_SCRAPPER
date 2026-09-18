#!/usr/bin/env bash
#
# setup.sh — instala dependências e builda a extensão OLX Workspace (tudo
# dentro dela: coleta, IA e o painel completo, sem proxy nem dev server
# separados).
#
# Ordem importa: o build da extensão (webpack) limpa extension/build/ antes de
# gerar os arquivos; o painel (Vite) tem que ser buildado DEPOIS, direto em
# extension/build/panel/.
#
# Uso:
#   ./setup.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR/extension"
WEB_DIR="$SCRIPT_DIR/web"
BUILD_DIR="$EXT_DIR/build"

echo "==> OLX Workspace — setup"

command -v node >/dev/null 2>&1 || { echo "ERRO: Node.js não encontrado (precisa de 18+)." >&2; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "ERRO: npm não encontrado." >&2; exit 1; }
echo "==> Node $(node --version) / npm $(npm --version)"

echo "==> [extension] npm install"
( cd "$EXT_DIR" && npm install --no-audit --no-fund )
echo "==> [extension] typecheck"
( cd "$EXT_DIR" && npm run typecheck )
echo "==> [extension] build (webpack)"
( cd "$EXT_DIR" && npm run build )

echo "==> [web] npm install"
( cd "$WEB_DIR" && npm install --no-audit --no-fund )
echo "==> [web] typecheck"
( cd "$WEB_DIR" && npx tsc -b )
echo "==> [web] build do painel (vite) -> extension/build/panel"
( cd "$WEB_DIR" && npm run build )

echo
echo "==> Pronto. Tudo roda dentro da extensão — nenhum servidor local é necessário."
echo "    1. chrome://extensions"
echo "    2. Ative o 'Modo do desenvolvedor'"
echo "    3. 'Carregar sem compactação' -> $BUILD_DIR"
echo "    4. Cadastre um provedor de IA no painel (aba 'Config') antes de analisar anúncios."
echo "    5. Abra o painel completo pelo botão no popup da extensão."
