import Fastify from "fastify";
import cors from "@fastify/cors";
import { MqttListenerService } from "./hardware/mqtt-listener.service";
import { env } from "./config/env";
import { paymentSessionStore } from "./hardware/shared-payment-session";
import healthRoutes from "./routes/health.routes";
import transactionRoutes from "./routes/transaction.routes";
import { ApplyPaymentEventService } from "./services/apply-payment-event.service";
import { PaymentEventsRepository } from "./db/payment-events.repository";

const app = Fastify();

const paymentEventsRepository = new PaymentEventsRepository();

const applyPaymentEventService = new ApplyPaymentEventService(
	paymentSessionStore,
	paymentEventsRepository
);

const mqttBrokerUrl = env.MQTT_BROKER_URL;
const mqttPaymentTopic = env.MQTT_PAYMENT_TOPIC;
const mqttStatusTopic = env.MQTT_STATUS_TOPIC;

const mqttListener = new MqttListenerService(
	mqttBrokerUrl,
	mqttPaymentTopic,
	mqttStatusTopic
);

mqttListener.on("payment", (event) => {
	const result = applyPaymentEventService.apply(event);
	console.log(
		`[MQTT payment] source=${event.source} amount=${event.amount} result=${result.message}`
	);
});

mqttListener.on("status", (event) => {
	console.log(
		`[MQTT status] status=${event.status} source=${event.source} message=${event.message}`
	);
});

mqttListener.connect();

app.register(cors, {
	origin: "http://localhost:5173",
	methods: ["GET", "POST", "PATCH"],
});

app.register(healthRoutes);
app.register(transactionRoutes);

export default app;
