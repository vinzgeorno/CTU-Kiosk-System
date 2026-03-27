export type HardwareSource = "coin" | "bill";

export type HardwarePaymentEvent = {
	source: HardwareSource;
	amount: number;
	pulseCount: number;
	timestamp: string;
};

export type HardwareStatusEvent = {
	status: "connected" | "disconnected" | "error";
	source: HardwareSource | "system";
	message: string;
	timestamp: string;
};
