import { EventEmitter } from "events";
import * as mqtt from "mqtt";
import { HardwarePaymentEvent, HardwareStatusEvent } from "./hardware.types";

type AnyRecord = Record<string, unknown>;

export class MqttListenerService extends EventEmitter {
	private client: mqtt.MqttClient | null = null;

	constructor(
		private readonly brokerUrl: string,
		private readonly paymentTopic: string,
		private readonly statusTopic?: string
	) {
		super();
	}

	connect(): void {
		if (this.client) {
			return;
		}

		this.client = mqtt.connect(this.brokerUrl);

		this.client.on("connect", () => {
			this.client?.subscribe(this.paymentTopic);

			if (this.statusTopic) {
				this.client?.subscribe(this.statusTopic);
			}

			this.emitStatus({
				status: "connected",
				source: "system",
				message: "Connected to MQTT broker.",
				timestamp: new Date().toISOString(),
			});
		});

		this.client.on("message", (topic: string, payload: Buffer) => {
			this.handleMessage(topic, payload);
		});

		this.client.on("error", (error: Error) => {
			this.emitStatus({
				status: "error",
				source: "system",
				message: `MQTT error: ${error.message}`,
				timestamp: new Date().toISOString(),
			});
		});
	}

	disconnect(): void {
		if (!this.client) {
			return;
		}

		this.client.end(true);
		this.client = null;
	}

	private handleMessage(topic: string, payload: Buffer): void {
		const parsed = this.parseJson(payload);

		if (!parsed) {
			return;
		}

		if (topic === this.paymentTopic) {
			const paymentEvent = this.toPaymentEvent(parsed);
			if (paymentEvent) {
				this.emit("payment", paymentEvent);
			}
			return;
		}

		if (this.statusTopic && topic === this.statusTopic) {
			const statusEvent = this.toStatusEvent(parsed);
			if (statusEvent) {
				this.emitStatus(statusEvent);
			}
		}
	}

	private parseJson(payload: Buffer): AnyRecord | null {
		try {
			const raw = JSON.parse(payload.toString("utf8")) as unknown;

			if (!raw || typeof raw !== "object") {
				return null;
			}

			return raw as AnyRecord;
		} catch {
			return null;
		}
	}

	private toPaymentEvent(data: AnyRecord): HardwarePaymentEvent | null {
		const source = data.source;
		const amount = data.amount;
		const pulseCount = data.pulseCount;
		const timestamp = data.timestamp;

		if (source !== "coin" && source !== "bill") {
			return null;
		}

		if (typeof amount !== "number" || !Number.isFinite(amount)) {
			return null;
		}

		if (typeof pulseCount !== "number" || !Number.isFinite(pulseCount)) {
			return null;
		}

		if (typeof timestamp !== "string") {
			return null;
		}

		return {
			source,
			amount,
			pulseCount,
			timestamp,
		};
	}

	private toStatusEvent(data: AnyRecord): HardwareStatusEvent | null {
		const status = data.status;
		const source = data.source;
		const message = data.message;
		const timestamp = data.timestamp;

		if (status !== "connected" && status !== "disconnected" && status !== "error") {
			return null;
		}

		if (source !== "coin" && source !== "bill" && source !== "system") {
			return null;
		}

		if (typeof message !== "string") {
			return null;
		}

		if (typeof timestamp !== "string") {
			return null;
		}

		return {
			status,
			source,
			message,
			timestamp,
		};
	}

	private emitStatus(event: HardwareStatusEvent): void {
		this.emit("status", event);
	}
}
