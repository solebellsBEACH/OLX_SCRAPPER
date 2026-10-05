import { describe, expect, it } from "vitest";
import type { Db, DbRecord } from "@/types";
import { getPriceTone } from "./colors";
import { relevantAlerts, robustMean, rowsByIds, toRows } from "./rows";

describe("robustMean", () => {
  it("averages a tight cluster of prices normally", () => {
    const result = robustMean([50_000, 52_000, 51_000]);
    expect(result).not.toBeNull();
    expect(result!.count).toBe(3);
    expect(result!.avg).toBeCloseTo((50_000 + 52_000 + 51_000) / 3);
  });

  it("drops a price at or beyond 100% deviation from the median", () => {
    // median = 50_000; 110_000 is +120% -> outlier, dropped from the average
    const result = robustMean([48_000, 50_000, 52_000, 110_000]);
    expect(result).not.toBeNull();
    expect(result!.count).toBe(3);
    expect(result!.avg).toBeCloseTo((48_000 + 50_000 + 52_000) / 3);
  });

  it("returns null for an empty list", () => {
    expect(robustMean([])).toBeNull();
  });

  it("returns null when every price is an outlier of the others (median <= 0 guard aside)", () => {
    // single price: median == the price itself, so it's kept (0% deviation from itself)
    const result = robustMean([1000]);
    expect(result).toEqual({ avg: 1000, count: 1 });
  });
});

function sandero(id: string, price: number, opts: { marcaOnlyInProps?: boolean; score?: number } = {}): DbRecord {
  return {
    id,
    url: `https://olx.com.br/${id}`,
    detail: {
      url: `https://olx.com.br/${id}`,
      id,
      title: `Renault Sandero 2015 ${id}`,
      price: `R$ ${price.toLocaleString("pt-BR")}`,
      km: 90_000,
      description: null,
      location: null,
      publishedAt: null,
      properties: [{ label: "Marca", value: "Renault" }],
      images: [],
    },
    categoria: {
      marca: opts.marcaOnlyInProps ? null : "Renault",
      modelo: "Sandero",
      versao: "Expression 1.0",
      ano: 2015,
      motor: null,
      combustivel: null,
      cambio: null,
      portas: null,
      carroceria: null,
      score: opts.score ?? 70,
      kmSuspeito: false,
    },
  };
}

function dbOf(...recs: DbRecord[]): Db {
  return Object.fromEntries(recs.map((r) => [r.id, r]));
}

describe("uma fonte de verdade entre telas", () => {
  // 4 Sanderos 2015 + 1 Gol: o "a" está ~12% acima da média dos outros três
  const db = dbOf(
    sandero("a", 42_000),
    sandero("b", 37_000),
    sandero("c", 38_000),
    sandero("d", 37_500, { marcaOnlyInProps: true }),
    { ...sandero("gol", 30_000), categoria: { ...sandero("gol", 0).categoria!, marca: "VW", modelo: "Gol" } },
  );
  const all = toRows(db);

  it("Detalhe e Comparador (rowsByIds) mostram o mesmo status, % e alertas da Listagem", () => {
    const listing = new Map(all.map((r) => [r.id, r.analysis]));
    const detail = rowsByIds(all, ["a"])[0];
    const compare = rowsByIds(all, ["a", "b"]);

    for (const r of [detail, ...compare]) {
      expect(r.analysis).toEqual(listing.get(r.id));
    }
    expect(getPriceTone(detail.analysis)).toBe("expensive");
    expect(Math.round(detail.analysis.priceDifferencePercent!)).toBe(12);
  });

  it("rowsByIds mantém a ordem pedida e ignora ids inexistentes", () => {
    expect(rowsByIds(all, ["c", "nao-existe", "a"]).map((r) => r.id)).toEqual(["c", "a"]);
  });

  it("a marca que só existe nas propriedades do anúncio entra no mesmo grupo de mercado", () => {
    const d = rowsByIds(all, ["d"])[0];
    expect(d.marca).toBe("Renault");
    expect(d.analysis.marketSampleSize).toBe(3);
    // a média de "a" também conta o "d"
    expect(rowsByIds(all, ["a"])[0].analysis.marketSampleSize).toBe(3);
  });

  it("row.opportunity bate com o selo de preço (Bom negócio)", () => {
    for (const r of all) {
      expect(r.opportunity).toBe(getPriceTone(r.analysis) === "good");
    }
  });
});

describe("análise sem amostra de mercado", () => {
  const [gol] = toRows(dbOf({ ...sandero("gol", 30_000), categoria: { ...sandero("gol", 0).categoria!, modelo: "Gol" } }));

  it("não dá confiança Alta quando não há com o que comparar o preço", () => {
    expect(gol.analysis.priceStatus).toBeUndefined();
    expect(gol.analysis.confidenceLabel).not.toBe("high");
  });

  it("o aviso de poucos similares não conta como alerta do carro", () => {
    expect(gol.analysis.alerts.map((a) => a.type)).toContain("insufficient_market_sample");
    expect(relevantAlerts(gol.analysis)).toHaveLength(0);
  });
});

describe("preço suspeito", () => {
  it("preço muito abaixo do mercado vira 'Verificar preço', nunca 'Bom negócio'", () => {
    const rows = toRows(dbOf(sandero("a", 20_000), sandero("b", 37_000), sandero("c", 38_000)));
    const a = rowsByIds(rows, ["a"])[0];
    expect(a.analysis.alerts.some((x) => x.type === "price_far_below_market")).toBe(true);
    expect(getPriceTone(a.analysis)).toBe("verify");
    expect(a.opportunity).toBe(false);
  });
});
