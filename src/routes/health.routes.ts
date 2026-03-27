export default async function healthRoutes(fastify: any) {
  fastify.get("/health", async () => {
    return {
      success: true,
      message: "Kiosk backend is running",
      timestamp: new Date().toISOString(),
    };
  });
}
