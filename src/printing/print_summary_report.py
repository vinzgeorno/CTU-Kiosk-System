#!/home/ctukiosk/Documents/Capstone/CTU-Kiosk/escpos-env/bin/python3
"""
ESC/POS Thermal Printer Helper
Called by Node.js backend to print facility summary reports
Usage: python3 print_summary_report.py <json_data>
"""

import sys
import json
from datetime import datetime
from escpos.printer import Usb


LINE_WIDTH = 32


def to_float(value, default=0.0):
	try:
		if value is None:
			return default
		return float(value)
	except (TypeError, ValueError):
		return default


def to_int(value, default=0):
	try:
		if value is None:
			return default
		return int(value)
	except (TypeError, ValueError):
		return default


def format_datetime(value):
	if not value:
		return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

	if not isinstance(value, str):
		return str(value)

	try:
		normalized = value.replace("Z", "+00:00")
		parsed = datetime.fromisoformat(normalized)
		return parsed.strftime("%Y-%m-%d %H:%M:%S")
	except ValueError:
		return value


def safe_text(value, default="-"):
	if value is None:
		return default

	text = str(value).strip()
	return text if text else default


def print_wrapped(printer, text, prefix=""):
	content = safe_text(text, default="")
	if not content:
		return

	available_width = max(LINE_WIDTH - len(prefix), 8)
	start = 0

	while start < len(content):
		chunk = content[start:start + available_width]
		if start == 0:
			printer.text(f"{prefix}{chunk}\n")
		else:
			printer.text(f"{' ' * len(prefix)}{chunk}\n")
		start += available_width


def build_ticket_range(row):
	first_ticket = safe_text(row.get("first_ticket_label"))
	last_ticket = safe_text(row.get("last_ticket_label"))

	if first_ticket == "-" and last_ticket == "-":
		return "-"

	if first_ticket == last_ticket:
		return first_ticket

	return f"{first_ticket} to {last_ticket}"


def print_summary_report(data):
	try:
		printer = Usb(0x0416, 0x5011)

		report_title = safe_text(data.get("reportTitle"), default="Summary Report")
		start_at = format_datetime(data.get("startAt"))
		end_at = format_datetime(data.get("endAt"))
		generated_at = format_datetime(data.get("generatedAt"))
		rows = data.get("rows") if isinstance(data.get("rows"), list) else []
		grand_total_amount = to_float(data.get("grandTotalAmount"), default=0.0)
		grand_total_units = to_int(data.get("grandTotalUnits"), default=0)
		grand_transaction_count = to_int(data.get("grandTransactionCount"), default=0)

		printer.set(align="center")
		printer.text("CTU KIOSK\n")
		printer.text("SUMMARY REPORT\n")
		printer.text("=" * LINE_WIDTH + "\n")
		printer.text(f"{report_title}\n")
		printer.text("-" * LINE_WIDTH + "\n")

		printer.set(align="left")
		printer.text(f"Period From: {start_at}\n")
		printer.text(f"Period To  : {end_at}\n")
		printer.text("=" * LINE_WIDTH + "\n")

		if not rows:
			printer.text("No report rows found\n")
			printer.text("=" * LINE_WIDTH + "\n")
		else:
			for row in rows:
				facility_code = safe_text(row.get("facility_code"))
				facility_name = safe_text(row.get("facility_name"))
				transaction_count = to_int(row.get("transaction_count"), default=0)
				total_units = to_int(row.get("total_units"), default=0)
				total_amount = to_float(row.get("total_amount"), default=0.0)
				ticket_range = build_ticket_range(row)

				print_wrapped(printer, f"{facility_code} - {facility_name}")
				print_wrapped(printer, ticket_range, prefix="Tickets: ")
				printer.text(f"Txn Count: {transaction_count}\n")
				printer.text(f"Total Uts: {total_units}\n")
				printer.text(f"Total Amt: {total_amount:.2f}\n")
				printer.text("-" * LINE_WIDTH + "\n")

		printer.text("GRAND TOTALS\n")
		printer.text(f"Transactions: {grand_transaction_count}\n")
		printer.text(f"Total Units : {grand_total_units}\n")
		printer.text(f"Total Amount: {grand_total_amount:.2f}\n")
		printer.text("=" * LINE_WIDTH + "\n")
		printer.text(f"Generated: {generated_at}\n")

		printer.set(align="center")
		printer.text("\nEnd of report\n")

		try:
			printer.cut()
		except Exception:
			pass

		printer.close()

		print(json.dumps({
			"success": True,
			"message": "Summary report printed successfully",
			"reportTitle": report_title,
		}))

		return True

	except Exception as error:
		print(json.dumps({
			"success": False,
			"error": str(error),
		}), file=sys.stderr)
		return False


if __name__ == "__main__":
	if len(sys.argv) > 1:
		try:
			payload = json.loads(sys.argv[1])
			success = print_summary_report(payload)
			sys.exit(0 if success else 1)
		except json.JSONDecodeError as error:
			print(json.dumps({
				"success": False,
				"error": f"Invalid JSON: {error}",
			}), file=sys.stderr)
			sys.exit(1)
	else:
		print(json.dumps({
			"success": False,
			"error": "No summary report data provided",
		}), file=sys.stderr)
		sys.exit(1)
