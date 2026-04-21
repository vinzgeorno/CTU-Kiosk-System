export const facilities = [
    {
        code: "BG",
        name: "Basketball Gym/Kadasig Gym",
        type: "age_based",
        categories: [
            { code: "kid", price: 10 },
            { code: "adult", price: 20 },
        ],
    },
    {
        code: "BT",
        name: "Badminton/Tennis Court",
        type: "membership_based",
        categories: [
            { code: "club_member", price: 10 },
            { code: "non_club_member", price: 20 },
        ],
    },
    {
        code: "SP",
        name: "Swimming Pool",
        type: "special_category_based",
        categories: [
            { code: "kid", price: 50 },
            { code: "adult", price: 100 },
            { code: "ctu_student", price: 50 },
        ],
    },
    {
        code: "OV",
        name: "Oval",
        type: "age_based",
        categories: [
            { code: "kid", price: 10 },
            { code: "adult", price: 20 },
        ],
    },
    {
        code: "WE",
        name: "Water Essence",
        type: "quantity_based",
        categories: [
            { code: "resident", price: 10 },
            { code: "non_resident", price: 15 },
        ],
    },
];
