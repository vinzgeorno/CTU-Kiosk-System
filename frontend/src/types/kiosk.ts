import { FacilityCode, CategoryCode } from "../data/facilities";

export type CategorySelectionMap = Partial<Record<CategoryCode, number>>;

export type KioskSelectionState = {
  facilityCode: FacilityCode | null;
  quantities: CategorySelectionMap;
};
