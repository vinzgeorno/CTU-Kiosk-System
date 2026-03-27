import Fastify from "fastify";
import healthRoutes from "./routes/health.routes";
import transactionRoutes from "./routes/transaction.routes";

const app = Fastify();

app.register(healthRoutes);
app.register(transactionRoutes);

export default app;
