import { describe, expect, it } from "vitest";
import { isCarro } from "./vehicle-filter";

describe("isCarro", () => {
  it("keeps a listing categorized as carro", () => {
    expect(isCarro({ tipo: "carro" })).toBe(true);
    expect(isCarro({ tipo: "Carro" })).toBe(true);
  });

  it("discards known non-car types", () => {
    expect(isCarro({ tipo: "moto" })).toBe(false);
    expect(isCarro({ tipo: "caminhão" })).toBe(false);
    expect(isCarro({ tipo: "  ônibus  " })).toBe(false);
  });

  it("is permissive when tipo is missing or unrecognized (default: treat as car)", () => {
    expect(isCarro({})).toBe(true);
    expect(isCarro(null)).toBe(true);
    expect(isCarro(undefined)).toBe(true);
    expect(isCarro({ tipo: "" })).toBe(true);
    expect(isCarro({ tipo: "algo-novo-que-a-ia-inventou" })).toBe(true);
  });
});
