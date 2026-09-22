import { describe, expect, it } from "vitest";
import { isCarBrand } from "./brands";

describe("isCarBrand", () => {
  it("accepts known brands regardless of accent/case", () => {
    expect(isCarBrand("Volkswagen")).toBe(true);
    expect(isCarBrand("citroën")).toBe(true);
    expect(isCarBrand("CITROEN")).toBe(true);
    expect(isCarBrand("chevrolet")).toBe(true);
  });

  it("rejects junk that isn't a car brand", () => {
    expect(isCarBrand("Pneu Aro 15")).toBe(false);
    expect(isCarBrand("Apartamento")).toBe(false);
  });

  it("rejects null/undefined/empty input", () => {
    expect(isCarBrand(null)).toBe(false);
    expect(isCarBrand(undefined)).toBe(false);
    expect(isCarBrand("")).toBe(false);
  });
});
