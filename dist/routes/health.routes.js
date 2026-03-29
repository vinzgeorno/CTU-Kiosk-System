"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = healthRoutes;
async function healthRoutes(fastify) {
    fastify.get("/health", async () => {
        return {
            success: true,
            message: "Kiosk backend is running",
            timestamp: new Date().toISOString(),
        };
    });
}
