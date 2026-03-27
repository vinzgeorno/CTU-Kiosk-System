#!/home/ctukiosk/Documents/Capstone/CTU-Kiosk/escpos-env/bin/python3
"""
ESC/POS Thermal Printer Helper
Called by Node.js backend to print tickets
Usage: python3 print_ticket.py <json_data>
"""

import sys
import json
import io
from escpos.printer import Usb
from PIL import Image
import qrcode

def print_ticket(data):
    """Print ticket to thermal printer"""
    
    try:
        # Winbond Electronics printer
        printer = Usb(0x0416, 0x5011)
        
        # Extract data
        facility = data.get('facility', 'UNKNOWN')
        age = data.get('age', 'N/A')
        ticket_number = data.get('ticketNumber', '')
        original_price = float(data.get('originalPrice', 0))
        discount_price = float(data.get('discountPrice', 0))
        has_discount = data.get('hasDiscount', False)
        transaction_id = data.get('transactionId', '')
        change_given = float(data.get('changeGiven', 0))
        ticket_type = data.get('ticketType', 'solo')
        number_of_people = data.get('numberOfPeople', 1)
        
        # Compact layout to save paper
        printer.set(align='center')
        
        # Print ticket header
        printer.text('BUILDING ACCESS\n')
        printer.text('VISITOR PASS\n')
        printer.text('=' * 32 + '\n')
        
        # Info section (compact)
        printer.text(f'FACILITY: {facility[:18].upper()}\n')
        printer.text(f'AGE: {age}\n')
        printer.text(f'PERSONS: {number_of_people}\n')  # Added: Number of people
        printer.text(f'TICKET: {ticket_number}\n')
        
        # Price section
        if has_discount:
            printer.text(f'Original: P{original_price:.2f}\n')
            printer.text(f'PAY: P{discount_price:.2f}\n')
        else:
            printer.text(f'PAY: P{discount_price:.2f}\n')
        
        # Always include change (0 if no change)
        printer.text(f'CHANGE: P{change_given:.2f}\n')
        
        printer.text('Valid: 11:59 PM\n')
        printer.text('=' * 32 + '\n')
        printer.text(f'ID: {transaction_id}\n')
        
        # Generate and print smaller QR code (120px)
        try:
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_M,
                box_size=5,  # Reduced from 8
                border=1,
            )
            qr.add_data(transaction_id)
            qr.make(fit=True)
            
            qr_img = qr.make_image(fill_color="black", back_color="white")
            qr_img = qr_img.resize((120, 120), Image.Resampling.LANCZOS)
            printer.image(qr_img, high_density_vertical=True, high_density_horizontal=True)
        except Exception as e:
            print(f"Warning: Could not print QR code: {e}", file=sys.stderr)
            printer.text('QR: [N/A]\n')
        
        # Compact footer
        printer.text('\nKeep with you\n')
        
        # Reset text settings and cut paper
        printer.set(align='center')
        try:
            printer.cut()
        except:
            pass
        
        printer.close()
        
        print(json.dumps({
            'success': True,
            'message': 'Ticket printed successfully',
            'transactionId': transaction_id
        }))
        
        return True
        
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e)
        }), file=sys.stderr)
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    if len(sys.argv) > 1:
        try:
            data = json.loads(sys.argv[1])
            success = print_ticket(data)
            sys.exit(0 if success else 1)
        except json.JSONDecodeError as e:
            print(json.dumps({
                'success': False,
                'error': f'Invalid JSON: {e}'
            }), file=sys.stderr)
            sys.exit(1)
    else:
        print(json.dumps({
            'success': False,
            'error': 'No ticket data provided'
        }), file=sys.stderr)
        sys.exit(1)
