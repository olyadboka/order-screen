import { Decimal, money, money2 } from "./money";

export type Band = "SAND" | "RED" | "BLOCKED";
export type Role = "ADVISER" | "OWNER";

export const RATE_FLOOR = 8000;
export const BAND_SAND_MAX = 3;
export const BAND_RED_MAX = 5;

export interface LineInput {
  productId: string;
  productName: string;
  unitPriceUsd: Decimal.Value;
  quantity: number;
  discountUsd: Decimal.Value;
  ownerApproved?: boolean;
}

export interface LineResult {
  productId: string;
  productName: string;
  unitPriceUsd: number;
  quantity: number;
  discountUsd: number;
  grossUsd: number;
  discountPct: number;
  band: Band;
  netUsd: number;
  ownerApproved: boolean;
}

export type LineErrorCode =
  | "INVALID_QUANTITY"
  | "NEGATIVE_DISCOUNT"
  | "DISCOUNT_EXCEEDS_LINE"
  | "LINE_REQUIRES_APPROVAL"
  | "ADVISER_CANNOT_APPROVE";

export type OrderErrorCode = "RATE_BELOW_FLOOR" | "NO_LINES";

export interface ValidationError {
  code: LineErrorCode | OrderErrorCode;
  lineIndex?: number;
  message: string;
}

export interface ComputedOrder {
  lines: LineResult[];
  totalUsd: number;
  totalSdg: number;
  rate: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  order: ComputedOrder;
  status: 200 | 400 | 403;
}

export function classifyBand(exactPct: Decimal): Band {
  if (exactPct.lte(BAND_SAND_MAX)) return "SAND";
  if (exactPct.lte(BAND_RED_MAX)) return "RED";
  return "BLOCKED";
}

export function computeLine(input: LineInput): LineResult {
  const unitPrice = new Decimal(input.unitPriceUsd);
  const gross = unitPrice.times(input.quantity);
  const discount = new Decimal(input.discountUsd);
  const exactPct = gross.isZero() ? new Decimal(0) : discount.div(gross).times(100);

  return {
    productId: input.productId,
    productName: input.productName,
    unitPriceUsd: money2(unitPrice),
    quantity: input.quantity,
    discountUsd: money2(discount),
    grossUsd: money2(gross),
    discountPct: exactPct.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    band: classifyBand(exactPct),
    netUsd: money2(gross.minus(discount)),
    ownerApproved: Boolean(input.ownerApproved),
  };
}

export interface ValidateArgs {
  lines: LineInput[];
  rate: Decimal.Value;
  role: Role;
}

export function validateOrder({ lines, rate, role }: ValidateArgs): ValidationResult {
  const errors: ValidationError[] = [];
  const rateDec = new Decimal(rate);

  if (rateDec.lt(RATE_FLOOR)) {
    errors.push({
      code: "RATE_BELOW_FLOOR",
      message: `Exchange rate must be at least ${RATE_FLOOR} SDG per dollar.`,
    });
  }

  if (lines.length === 0) {
    errors.push({ code: "NO_LINES", message: "An order needs at least one line." });
  }

  const results: LineResult[] = [];
  let totalUsd = new Decimal(0);

  lines.forEach((line, index) => {
    const result = computeLine(line);
    results.push(result);
    totalUsd = totalUsd.plus(result.netUsd);

    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      errors.push({ code: "INVALID_QUANTITY", lineIndex: index, message: "Quantity must be a positive whole number." });
    }

    const discount = new Decimal(line.discountUsd);
    if (discount.lt(0)) {
      errors.push({ code: "NEGATIVE_DISCOUNT", lineIndex: index, message: "Discount cannot be negative." });
    } else if (discount.gt(result.grossUsd)) {
      errors.push({ code: "DISCOUNT_EXCEEDS_LINE", lineIndex: index, message: "Discount cannot exceed the line value." });
    }

    if (result.band === "BLOCKED") {
      if (!result.ownerApproved) {
        errors.push({
          code: "LINE_REQUIRES_APPROVAL",
          lineIndex: index,
          message: `Line ${index + 1} discount is ${result.discountPct}% (> ${BAND_RED_MAX}%) and requires owner approval.`,
        });
      } else if (role !== "OWNER") {
        errors.push({
          code: "ADVISER_CANNOT_APPROVE",
          lineIndex: index,
          message: "Only an owner can approve a line above the discount limit.",
        });
      }
    }
  });

  const hasAuthError = errors.some(
    (e) => e.code === "LINE_REQUIRES_APPROVAL" || e.code === "ADVISER_CANNOT_APPROVE"
  );
  const status: 200 | 400 | 403 = errors.length === 0 ? 200 : hasAuthError ? 403 : 400;

  return {
    ok: errors.length === 0,
    errors,
    status,
    order: {
      lines: results,
      totalUsd: money2(totalUsd),
      totalSdg: money(totalUsd.times(rateDec)).toNumber(),
      rate: money2(rateDec),
    },
  };
}
