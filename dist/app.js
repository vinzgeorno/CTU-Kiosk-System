"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const mqtt_listener_service_1 = require("./hardware/mqtt-listener.service");
const env_1 = require("./config/env");
const shared_payment_session_1 = require("./hardware/shared-payment-session");
const health_routes_1 = __importDefault(require("./routes/health.routes"));
const transaction_routes_1 = __importDefault(require("./routes/transaction.routes"));
const apply_payment_event_service_1 = require("./services/apply-payment-event.service");
const payment_events_repository_1 = require("./db/payment-events.repository");
const app = (0, fastify_1.default)();
const paymentEventsRepository = new payment_events_repository_1.PaymentEventsRepository();
const applyPaymentEventService = new apply_payment_event_service_1.ApplyPaymentEventService(shared_payment_session_1.paymentSessionStore, paymentEventsRepository);
const mqttBrokerUrl = env_1.env.MQTT_BROKER_URL;
const mqttPaymentTopic = env_1.env.MQTT_PAYMENT_TOPIC;
const mqttStatusTopic = env_1.env.MQTT_STATUS_TOPIC;
const mqttListener = new mqtt_listener_service_1.MqttListenerService(mqttBrokerUrl, mqttPaymentTopic, mqttStatusTopic);
mqttListener.on("payment", (event) => {
    console.log(`[MQTT payment] source=${event.source} amount=${event.amount}`);
});
mqttListener.on("status", (event) => {
    console.log(`[MQTT status] status=${event.status} source=${event.source} message=${event.message}`);
});
mqttListener.connect();
app.register(cors_1.default, {
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PATCH"],
});
app.register(health_routes_1.default);
app.register(transaction_routes_1.default);
exports.default = app;
