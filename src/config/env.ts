const isWindows = process.platform === "win32";

export const env = {
	PORT: Number(process.env.PORT ?? 3000),
	PYTHON_CMD: process.env.PYTHON_CMD ?? (isWindows ? "python" : "python3"),
	PRINT_SCRIPT_PATH: process.env.PRINT_SCRIPT_PATH ?? "",
	MQTT_BROKER_URL: process.env.MQTT_BROKER_URL ?? "mqtt://localhost:1883",
	MQTT_PAYMENT_TOPIC: process.env.MQTT_PAYMENT_TOPIC ?? "kiosk/payment",
	MQTT_STATUS_TOPIC: process.env.MQTT_STATUS_TOPIC ?? "kiosk/status",
} as const;

