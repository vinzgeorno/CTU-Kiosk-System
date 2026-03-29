"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MqttListenerService = void 0;
const events_1 = require("events");
const mqtt = __importStar(require("mqtt"));
class MqttListenerService extends events_1.EventEmitter {
    constructor(brokerUrl, paymentTopic, statusTopic) {
        super();
        this.brokerUrl = brokerUrl;
        this.paymentTopic = paymentTopic;
        this.statusTopic = statusTopic;
        this.client = null;
    }
    connect() {
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
        this.client.on("message", (topic, payload) => {
            this.handleMessage(topic, payload);
        });
        this.client.on("error", (error) => {
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
    disconnect() {
        if (!this.client) {
            return;
        }
        this.client.end(true);
        this.client = null;
    }
    handleMessage(topic, payload) {
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
    parseJson(payload) {
        try {
            const raw = JSON.parse(payload.toString("utf8"));
            if (!raw || typeof raw !== "object") {
                return null;
            }
            return raw;
        }
        catch {
            return null;
        }
    }
    toCoinPaymentEvent(data) {
        const amount = this.toFiniteNumber(data.value);
        if (amount === null) {
            return null;
        }
        return {
            source: "coin",
            amount,
            pulseCount: this.toOptionalFiniteNumber(data.pulses) ?? 0,
            timestamp: typeof data.timestamp === "string"
                ? data.timestamp
                : new Date().toISOString(),
        };
    }
    toBillPaymentEvent(data) {
        const amount = this.toFiniteNumber(data.amount);
        if (amount === null) {
            return null;
        }
        return {
            source: "bill",
            amount,
            pulseCount: this.toOptionalFiniteNumber(data.pulses) ?? 0,
            timestamp: typeof data.timestamp === "string"
                ? data.timestamp
                : new Date().toISOString(),
        };
    }
    toFiniteNumber(value) {
        if (typeof value !== "number" || !Number.isFinite(value)) {
            return null;
        }
        return value;
    }
    toOptionalFiniteNumber(value) {
        if (value === undefined || value === null) {
            return null;
        }
        return this.toFiniteNumber(value);
    }
    toStatusEvent(data) {
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
    emitStatus(event) {
        this.emit("status", event);
    }
}
exports.MqttListenerService = MqttListenerService;
