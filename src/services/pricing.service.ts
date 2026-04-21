import { CategoryCode, FacilityCode, facilities } from "../config/facilities";

export type PriceSelectionResult = {
  facilityCode: FacilityCode;
  facilityName: string;
  categoryCode: CategoryCode;
  categoryLabel: string;
  unitPrice: number;
};

export function getPriceSelection(
  facilityCode: FacilityCode,
  categoryCode: CategoryCode
): PriceSelectionResult {
  const facility = facilities.find((item) => item.code === facilityCode);

  if (!facility) {
    throw new Error(`Invalid facility code: ${facilityCode}`);
  }

  const category = facility.categories.find((item) => item.code === categoryCode);

  if (!category) {
    throw new Error(
      `Invalid category code '${categoryCode}' for facility '${facility.code}' (${facility.name})`
    );
  }

  return {
    facilityCode: facility.code,
    facilityName: facility.name,
    categoryCode: category.code,
    categoryLabel: category.label,
    unitPrice: category.price,
  };
}
