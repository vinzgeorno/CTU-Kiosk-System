import Fastify from "fastify";
import cors from "@fastify/cors";
import { MqttListenerService } from "./hardware/mqtt-listener.service";
import { env } from "./config/env";
import { PaymentSessionStore } from "./hardware/payment-session.store";
import healthRoutes from "./routes/health.routes";
import transactionRoutes from "./routes/transaction.routes";
import { ApplyPaymentEventService } from "./services/apply-payment-event.service";

const app = Fastify();

const paymentSessionStore = new PaymentSessionStore();
const applyPaymentEventService = new ApplyPaymentEventService(paymentSessionStore);

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
