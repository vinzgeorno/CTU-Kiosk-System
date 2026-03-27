import Fastify from "fastify";
import cors from "@fastify/cors";
import healthRoutes from "./routes/health.routes";
import transactionRoutes from "./routes/transaction.routes";

const app = Fastify();

app.register(cors, {
	origin: "http://localhost:5173",
	methods: ["GET", "POST", "PATCH"],
});

app.register(healthRoutes);
app.register(transactionRoutes);

export default app;
