import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export function money(value: Decimal.Value): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function money2(value: Decimal.Value): number {
  return money(value).toNumber();
}

export function fmtMoney(value: Decimal.Value): string {
  return money(value).toFixed(2);
}
