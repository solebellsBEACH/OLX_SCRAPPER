#!/usr/bin/env bash
#
# production.sh — gera o pacote (.zip) da extensão OLX Workspace para envio à
# Chrome Web Store.
#
# Faz build limpo (extensão via webpack, depois painel via Vite — nessa ordem,
# pois o webpack limpa extension/build/), roda o validate:store e zipa o
# conteúdo de extension/build/ em dist/olx-workspace-<versão>.zip.
#
# Uso:
#   ./production.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR/extension"
WEB_DIR="$SCRIPT_DIR/web"
BUILD_DIR="$EXT_DIR/build"
DIST_DIR="$SCRIPT_DIR/dist"

echo "==> OLX Workspace — build de produção"

command -v node >/dev/null 2>&1 || { echo "ERRO: Node.js não encontrado (precisa de 18+)." >&2; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "ERRO: npm não encontrado." >&2; exit 1; }
command -v zip  >/dev/null 2>&1 || { echo "ERRO: zip não encontrado (instale com apt install zip)." >&2; exit 1; }

echo "==> [extension] npm ci"
( cd "$EXT_DIR" && if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi )
echo "==> [extension] typecheck"
( cd "$EXT_DIR" && npm run typecheck )
echo "==> [extension] build (webpack, production)"
( cd "$EXT_DIR" && npm run build )

echo "==> [web] npm ci"
( cd "$WEB_DIR" && if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi )
echo "==> [web] typecheck"
( cd "$WEB_DIR" && npx tsc -b )
echo "==> [web] build do painel (vite) -> extension/build/panel"
( cd "$WEB_DIR" && npm run build )

echo "==> Validando requisitos da Chrome Web Store"
( cd "$EXT_DIR" && npm run validate:store )

VERSION="$(node -p "require('$BUILD_DIR/manifest.json').version")"
ZIP_PATH="$DIST_DIR/olx-workspace-$VERSION.zip"

mkdir -p "$DIST_DIR"
rm -f "$ZIP_PATH"
echo "==> Gerando $ZIP_PATH"
( cd "$BUILD_DIR" && zip -qr "$ZIP_PATH" . -x "*.map" -x "*.DS_Store" )

echo
echo "==> Pronto: $ZIP_PATH ($(du -h "$ZIP_PATH" | cut -f1))"
echo "    Envie este .zip em https://chrome.google.com/webstore/devconsole"
echo "    (lembre de subir a versão no manifest antes de cada novo envio)."
