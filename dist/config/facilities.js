"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.facilities = void 0;
exports.facilities = [
    {
        code: "BG",
        name: "Basketball Gym/Kadasig Gym",
        type: "age_based",
        categories: [
            { code: "kid", label: "Kid", price: 10 },
            { code: "adult", label: "Adult", price: 20 },
        ],
    },
    {
        code: "BT",
        name: "Badminton/Tennis Court",
        type: "membership_based",
        categories: [
            { code: "club_member", label: "Club Member", price: 10 },
            { code: "non_club_member", label: "Non-Club Member", price: 20 },
        ],
    },
    {
        code: "SP",
        name: "Swimming Pool",
        type: "special_category_based",
        categories: [
            { code: "kid", label: "Kid", price: 50 },
            { code: "adult", label: "Adult", price: 100 },
            { code: "ctu_student", label: "CTU Student", price: 50 },
        ],
    },
    {
        code: "OV",
        name: "Oval",
        type: "age_based",
        categories: [
            { code: "kid", label: "Kid", price: 10 },
            { code: "adult", label: "Adult", price: 20 },
        ],
    },
    {
        code: "WE",
        name: "Water Essence",
        type: "quantity_based",
        categories: [
            { code: "resident", label: "Resident", price: 10 },
            { code: "non_resident", label: "Non-Resident", price: 15 },
        ],
    },
];
