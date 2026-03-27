import "dotenv/config";
import app from "./app";

const port = parseInt(process.env.PORT ?? "3000", 10) || 3000;

export async function start() {
  try {
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`Server listening on port ${port}`);
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
