#!/home/ctukiosk/Documents/Capstone/CTU-Kiosk/escpos-env/bin/python3
"""
ESC/POS Thermal Printer Helper
Called by Node.js backend to print tickets
Usage: python3 print_ticket.py <json_data>
"""

import sys
import json
from datetime import datetime
from escpos.printer import Usb
from PIL import Image
import qrcode


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


def format_created_at(value):
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


def print_ticket(data):
    """Print ticket to thermal printer"""

    try:
        # Winbond Electronics printer
        printer = Usb(0x0416, 0x5011)

        # Extract data
        facility_name = str(data.get("facilityName") or data.get("facilityCode") or "")
        ticket_label = str(data.get("ticketLabel") or "")
        total_units = to_int(data.get("totalUnits"), default=0)
        amount_due = to_float(data.get("amountDue"), default=0.0)
        amount_paid = to_float(data.get("amountPaid"), default=0.0)
        breakdown = data.get("breakdown") if isinstance(data.get("breakdown"), list) else []
        created_at_raw = data.get("createdAt")
        created_at = format_created_at(created_at_raw)

        if total_units <= 0 and breakdown:
            total_units = sum(to_int(item.get("quantity"), default=0) for item in breakdown)

        # Compact layout to save paper
        printer.set(align="center")

        # Print ticket header
        printer.text("BUILDING ACCESS\n")
        printer.text("VISITOR PASS\n")
        printer.text("=" * 32 + "\n")

        # Info section
        if facility_name:
            printer.text(f"FACILITY: {facility_name}\n")
        if ticket_label:
            printer.text(f"TICKET: {ticket_label}\n")
        printer.text("-" * 32 + "\n")

        # Breakdown section
        printer.set(align="left")
        for item in breakdown:
            category_label = str(item.get("categoryLabel") or "Item")
            quantity = to_int(item.get("quantity"), default=0)
            subtotal = to_float(item.get("subtotal"), default=0.0)
            printer.text(f"{category_label} x{quantity} = {subtotal:.2f}\n")

        printer.text("-" * 32 + "\n")
        printer.text(f"TOTAL UNITS: {total_units}\n")
        printer.text(f"AMOUNT DUE : {amount_due:.2f}\n")
        printer.text(f"AMOUNT PAID: {amount_paid:.2f}\n")
        printer.text(f"TIME: {created_at}\n")

        printer.set(align="center")

        # Generate and print compact QR code
        try:
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_M,
                box_size=5,
                border=1,
            )
            qr.add_data(ticket_label)
            qr.make(fit=True)

            qr_img = qr.make_image(fill_color="black", back_color="white")
            qr_img = qr_img.resize((120, 120), Image.Resampling.LANCZOS)
            printer.image(qr_img, high_density_vertical=True, high_density_horizontal=True)
        except Exception as e:
            print(f"Warning: Could not print QR code: {e}", file=sys.stderr)
            printer.text("QR: [N/A]\n")

        # Compact footer
        printer.text("\nKeep with you\n")

        # Reset text settings and cut paper
        printer.set(align="center")
        try:
            printer.cut()
        except Exception:
            pass

        printer.close()

        print(json.dumps({
            "success": True,
            "message": "Ticket printed successfully",
            "ticketLabel": ticket_label
        }))

        return True

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }), file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) > 1:
        try:
            data = json.loads(sys.argv[1])
            success = print_ticket(data)
            sys.exit(0 if success else 1)
        except json.JSONDecodeError as e:
            print(json.dumps({
                "success": False,
                "error": f"Invalid JSON: {e}"
            }), file=sys.stderr)
            sys.exit(1)
    else:
        print(json.dumps({
            "success": False,
            "error": "No ticket data provided"
        }), file=sys.stderr)
        sys.exit(1)
