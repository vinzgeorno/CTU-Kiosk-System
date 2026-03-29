"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SummaryReportPrinterService = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
class SummaryReportPrinterService {
    constructor(pythonScriptPath) {
        const defaultScriptPath = path_1.default.join(__dirname, "print_summary_report.py");
        this.scriptPath = pythonScriptPath ?? env_1.env.PRINT_SCRIPT_PATH ?? defaultScriptPath;
    }
    async printReport(data) {
        return new Promise((resolve, reject) => {
            const payload = JSON.stringify(data);
            const pythonCommand = env_1.env.PYTHON_CMD;
            const child = (0, child_process_1.spawn)(pythonCommand, [this.scriptPath, payload]);
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", (chunk) => {
                stdout += chunk.toString();
            });
            child.stderr.on("data", (chunk) => {
                stderr += chunk.toString();
            });
            child.on("error", (error) => {
                reject(new Error(`Failed to start summary report printer script: ${error.message}`));
            });
            child.on("close", (code) => {
                const trimmedStdout = stdout.trim();
                const trimmedStderr = stderr.trim();
                if (code !== 0) {
                    reject(new Error(`Summary report printer script exited with code ${code}. ${trimmedStderr || "No error output from script."}`));
                    return;
                }
                if (!trimmedStdout) {
                    resolve({ success: true, rawOutput: "" });
                    return;
                }
                try {
                    resolve(JSON.parse(trimmedStdout));
                }
                catch {
                    resolve({ success: true, rawOutput: trimmedStdout });
                }
            });
        });
    }
}
exports.SummaryReportPrinterService = SummaryReportPrinterService;
