import { CategoryCode, FacilityCode, facilities } from "../config/facilities";
import { TransactionBreakdownItem } from "../types/transaction.types";

export type BuildTransactionInput = {
  facilityCode: FacilityCode;
  quantities: Partial<Record<CategoryCode, number>>;
};

export type BuildTransactionResult = {
  facilityCode: FacilityCode;
  facilityName: string;
  breakdown: TransactionBreakdownItem[];
  totalUnits: number;
  amountDue: number;
  isBulk: boolean;
};

export function buildTransactionDetails(
  input: BuildTransactionInput
): BuildTransactionResult {
  const facility = facilities.find((item) => item.code === input.facilityCode);

  if (!facility) {
    throw new Error(`Invalid facility code: ${input.facilityCode}`);
  }

  const allowedCategoryCodes = new Set(facility.categories.map((item) => item.code));

  const breakdown: TransactionBreakdownItem[] = [];

  for (const [rawCategoryCode, rawQuantity] of Object.entries(input.quantities)) {
    const categoryCode = rawCategoryCode as CategoryCode;
    const quantity = rawQuantity ?? 0;

    if (!Number.isFinite(quantity)) {
      throw new Error(`Invalid quantity for category '${categoryCode}'.`);
    }

    if (quantity < 0) {
      throw new Error(`Negative quantity is not allowed for category '${categoryCode}'.`);
    }

    if (quantity === 0) {
      continue;
    }

    if (!allowedCategoryCodes.has(categoryCode)) {
      throw new Error(
        `Category '${categoryCode}' is not allowed for facility '${facility.code}' (${facility.name}).`
      );
    }

    const category = facility.categories.find((item) => item.code === categoryCode);

    if (!category) {
      throw new Error(
        `Invalid category '${categoryCode}' for facility '${facility.code}' (${facility.name}).`
      );
    }

    breakdown.push({
      categoryCode: category.code,
      categoryLabel: category.label,
      quantity,
      unitPrice: category.price,
      subtotal: quantity * category.price,
    });
  }

  if (breakdown.length === 0) {
    throw new Error("At least one category quantity must be greater than zero.");
  }

  const totalUnits = breakdown.reduce((sum, item) => sum + item.quantity, 0);
  const amountDue = breakdown.reduce((sum, item) => sum + item.subtotal, 0);

  return {
    facilityCode: facility.code,
    facilityName: facility.name,
    breakdown,
    totalUnits,
    amountDue,
    isBulk: totalUnits > 1,
  };
}
