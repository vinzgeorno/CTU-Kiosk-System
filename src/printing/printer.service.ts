import { spawn } from "child_process";
import path from "path";
import { env } from "../config/env";
import { PrintableTicketData } from "./printer.types";

export class PrinterService {
	private readonly scriptPath: string;

	constructor(pythonScriptPath?: string) {
		const defaultScriptPath = path.join(__dirname, "print_ticket.py");
		this.scriptPath = env.PRINT_SCRIPT_PATH
			? env.PRINT_SCRIPT_PATH
			: pythonScriptPath ?? defaultScriptPath;
	}

	async printTicket(data: PrintableTicketData): Promise<any> {
		return new Promise((resolve, reject) => {
			const payload = JSON.stringify(data);
			const pythonCommand = env.PYTHON_CMD;
			const child = spawn(pythonCommand, [this.scriptPath, payload]);

			let stdout = "";
			let stderr = "";

			child.stdout.on("data", (chunk: Buffer | string) => {
				stdout += chunk.toString();
			});

			child.stderr.on("data", (chunk: Buffer | string) => {
				stderr += chunk.toString();
			});

			child.on("error", (error) => {
				reject(new Error(`Failed to start printer script: ${error.message}`));
			});

			child.on("close", (code) => {
				const trimmedStdout = stdout.trim();
				const trimmedStderr = stderr.trim();

				if (code !== 0) {
					reject(
						new Error(
							`Printer script exited with code ${code}. ${
								trimmedStderr || "No error output from script."
							}`
						)
					);
					return;
				}

				if (!trimmedStdout) {
					resolve({ success: true, rawOutput: "" });
					return;
				}

				try {
					resolve(JSON.parse(trimmedStdout));
				} catch {
					resolve({ success: true, rawOutput: trimmedStdout });
				}
			});
		});
	}
}
