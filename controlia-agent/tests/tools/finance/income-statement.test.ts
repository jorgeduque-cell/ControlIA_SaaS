import { describe, it, expect } from "vitest";
import { incomeStatementTool } from "../../../src/tools/finance/income-statement.js";
import { createTestContext } from "../../setup.js";

describe("incomeStatementTool", () => {
  it("should calculate income statement math correctly", async () => {
    const result = await incomeStatementTool.execute(
      { periodo: "mes", año: 2026, incluirDetalle: true },
      { context: createTestContext() }
    );

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    const d = result.data!;

    // Verify raw math from mock data
    const expectedIngresos = 12_500_000 + 8_700_000 + 500_000; // 21_700_000
    const expectedCostos = 11_574_000 + 8_055_600 + 450_000 + 150_000; // 21_229_600
    const expectedGastos = 800_000 + 150_000 + 1_200_000 + 200_000 + 50_000 + 100_000; // 2_500_000

    expect(d.totalIngresos).toBe(expectedIngresos);
    expect(d.totalCostos).toBe(expectedCostos);
    expect(d.utilidadBruta).toBe(expectedIngresos - expectedCostos);
    expect(d.totalGastos).toBe(expectedGastos);
    expect(d.utilidadOperativa).toBe(d.utilidadBruta - expectedGastos);

    // Margen bruto = utilidadBruta / totalIngresos * 100
    expect(d.margenBruto).toBeCloseTo((d.utilidadBruta / expectedIngresos) * 100, 1);

    // Impuestos = 25% of utilidadOperativa if positive
    const expectedImpuestos = d.utilidadOperativa > 0 ? d.utilidadOperativa * 0.25 : 0;
    expect(d.impuestos).toBe(expectedImpuestos);
    expect(d.utilidadNeta).toBe(d.utilidadOperativa - expectedImpuestos);
  });
});
