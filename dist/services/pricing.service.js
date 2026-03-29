"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPriceSelection = getPriceSelection;
const facilities_1 = require("./src/config/facilities");
function getPriceSelection(facilityCode, categoryCode) {
    const facility = facilities_1.facilities.find((item) => item.code === facilityCode);
    if (!facility) {
        throw new Error(`Invalid facility code: ${facilityCode}`);
    }
    const category = facility.categories.find((item) => item.code === categoryCode);
    if (!category) {
        throw new Error(`Invalid category code '${categoryCode}' for facility '${facility.code}' (${facility.name})`);
    }
    return {
        facilityCode: facility.code,
        facilityName: facility.name,
        categoryCode: category.code,
        categoryLabel: category.label,
        unitPrice: category.price,
    };
}
