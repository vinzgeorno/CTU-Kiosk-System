import "dotenv/config";
import app from "./app";
import { env } from "./config/env";

const port = env.PORT;

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
