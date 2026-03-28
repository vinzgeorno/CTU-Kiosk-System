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
		const paymentBaseTopic = this.paymentTopic.replace(/\/+$/, "");
		const coinTopic = `${paymentBaseTopic}/coin`;
		const billTopic = `${paymentBaseTopic}/bill`;

		this.client.on("connect", () => {
			this.client?.subscribe(coinTopic);
			this.client?.subscribe(billTopic);

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

		this.client.on("close", () => {
			this.emitStatus({
				status: "disconnected",
				source: "system",
				message: "Disconnected from MQTT broker.",
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

		const paymentBaseTopic = this.paymentTopic.replace(/\/+$/, "");
		const coinTopic = `${paymentBaseTopic}/coin`;
		const billTopic = `${paymentBaseTopic}/bill`;

		if (topic === coinTopic) {
			const paymentEvent = this.toCoinPaymentEvent(parsed);
			if (paymentEvent) {
				this.emit("payment", paymentEvent);
			}
			return;
		}

		if (topic === billTopic) {
			const paymentEvent = this.toBillPaymentEvent(parsed);
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

	private toCoinPaymentEvent(data: AnyRecord): HardwarePaymentEvent | null {
		const amount = this.toFiniteNumber(data.value);
		if (amount === null) {
			return null;
		}

		return {
			source: "coin",
			amount,
			pulseCount: this.toOptionalFiniteNumber(data.pulses) ?? 0,
			timestamp:
				typeof data.timestamp === "string"
					? data.timestamp
					: new Date().toISOString(),
		};
	}

	private toBillPaymentEvent(data: AnyRecord): HardwarePaymentEvent | null {
		const amount = this.toFiniteNumber(data.amount);
		if (amount === null) {
			return null;
		}

		return {
			source: "bill",
			amount,
			pulseCount: this.toOptionalFiniteNumber(data.pulses) ?? 0,
			timestamp:
				typeof data.timestamp === "string"
					? data.timestamp
					: new Date().toISOString(),
		};
	}

	private toFiniteNumber(value: unknown): number | null {
		if (typeof value !== "number" || !Number.isFinite(value)) {
			return null;
		}

		return value;
	}

	private toOptionalFiniteNumber(value: unknown): number | null {
		if (value === undefined || value === null) {
			return null;
		}

		return this.toFiniteNumber(value);
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
