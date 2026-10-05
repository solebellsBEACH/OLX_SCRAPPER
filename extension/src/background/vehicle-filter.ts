import { NAO_CARRO } from "./constants";

/** Normaliza o `tipo` da categoria (minúsculo, sem espaços nas pontas). */
function tipoVeiculo(cat: unknown): string | null {
  const raw =
    cat && typeof cat === "object" && typeof (cat as Record<string, unknown>).tipo === "string"
      ? ((cat as Record<string, unknown>).tipo as string)
      : "";
  const t = raw.toLowerCase().trim();
  return t || null;
}

/** É carro de passeio? Sem `tipo` conhecido => assume que sim (não descarta à toa). */
export function isCarro(cat: unknown): boolean {
  const t = tipoVeiculo(cat);
  return !t || !NAO_CARRO.has(t);
}
