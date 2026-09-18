#!/usr/bin/env node
/**
 * Valida o pacote em extension/build/ contra requisitos comuns de publicação
 * na Chrome Web Store (Manifest V3): manifest, ícones, código remoto e chaves expostas.
 * Uso: node scripts/validate-store-readiness.js
 */
const fs = require("fs");
const path = require("path");

const BUILD_DIR = path.resolve(__dirname, "..", "build");
const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

if (!fs.existsSync(BUILD_DIR)) {
  fail(`Diretório de build não encontrado: ${BUILD_DIR}. Rode "npm run build" antes de validar.`);
  report();
  process.exit(1);
}

const manifestPath = path.join(BUILD_DIR, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  fail("build/manifest.json não encontrado.");
  report();
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

// --- Manifest V3 básico ---
if (manifest.manifest_version !== 3) {
  fail(`manifest_version deve ser 3 (encontrado: ${manifest.manifest_version}).`);
}
if (!manifest.name || !manifest.version || !manifest.description) {
  fail("manifest.json precisa de name, version e description.");
}
if (manifest.background && Array.isArray(manifest.background.scripts)) {
  fail('background.scripts (Manifest V2) encontrado — Manifest V3 exige "service_worker".');
}

// --- Ícones ---
const requiredSizes = ["16", "32", "48", "128"];
if (!manifest.icons) {
  fail('Campo "icons" ausente no manifest — obrigatório para publicação na loja.');
} else {
  for (const size of requiredSizes) {
    const iconRel = manifest.icons[size];
    if (!iconRel) {
      warn(`Ícone de tamanho ${size}x${size} não declarado em manifest.icons.`);
      continue;
    }
    const iconPath = path.join(BUILD_DIR, iconRel);
    if (!fs.existsSync(iconPath)) {
      fail(`Ícone declarado mas ausente no build: ${iconRel}`);
    }
  }
}
if (!manifest.action || !manifest.action.default_icon) {
  warn('action.default_icon ausente — a toolbar usará um ícone genérico.');
}

// --- CSP / código remoto ---
const csp = manifest.content_security_policy;
if (csp && JSON.stringify(csp).includes("unsafe-eval")) {
  fail("content_security_policy permite unsafe-eval — proibido no Manifest V3.");
}

// --- Varredura dos bundles JS ---
const jsFiles = fs.readdirSync(BUILD_DIR).filter((f) => f.endsWith(".js"));

const forbiddenPatterns = [
  { re: /\beval\s*\(/, msg: "uso de eval()" },
  { re: /new\s+Function\s*\(/, msg: "uso de new Function()" },
  { re: /importScripts\s*\(\s*["']https?:\/\//, msg: "importScripts() carregando script remoto" },
  { re: /document\.write\s*\(/, msg: "uso de document.write()" },
];

// Chaves de API acidentalmente embutidas no bundle.
const secretPatterns = [
  { re: /sk-[A-Za-z0-9]{20,}/, msg: "possível chave da OpenAI/DeepSeek hardcoded (padrão sk-...)" },
  { re: /AIza[0-9A-Za-z_-]{35}/, msg: "possível chave de API do Google hardcoded (padrão AIza...)" },
];

for (const file of jsFiles) {
  const content = fs.readFileSync(path.join(BUILD_DIR, file), "utf8");
  for (const { re, msg } of forbiddenPatterns) {
    if (re.test(content)) {
      fail(`${file}: ${msg} — não permitido no Manifest V3.`);
    }
  }
  for (const { re, msg } of secretPatterns) {
    if (re.test(content)) {
      fail(`${file}: ${msg}. Chaves de API devem ser fornecidas pelo usuário via storage, nunca embutidas no bundle.`);
    }
  }
}

// --- Permissões amplas (apenas aviso, exige justificativa manual no formulário da loja) ---
const hostPermissions = manifest.host_permissions || [];
const broadHosts = hostPermissions.filter((h) => h === "<all_urls>" || h === "*://*/*");
if (broadHosts.length > 0) {
  warn(`host_permissions muito amplo (${broadHosts.join(", ")}) — a revisão da loja pede justificativa extra.`);
}

function report() {
  if (warnings.length > 0) {
    console.warn("\nAvisos:");
    for (const w of warnings) console.warn(`  - ${w}`);
  }
  if (errors.length > 0) {
    console.error("\nFalhas de validação para publicação na Chrome Web Store:");
    for (const e of errors) console.error(`  - ${e}`);
  } else {
    console.log("\nOK: build/ passou nas validações de publicação na Chrome Web Store.");
  }
}

report();
process.exit(errors.length > 0 ? 1 : 0);
