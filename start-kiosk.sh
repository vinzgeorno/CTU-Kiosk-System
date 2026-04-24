#!/bin/bash
set -e

PROJECT_ROOT="/home/ctukiosk/Desktop/Kiosk-System/CTU-Kiosk-System"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

export PORT=3000
export PYTHON_CMD="$PROJECT_ROOT/escpos-env/bin/python3"
export PRINT_SCRIPT_PATH="$PROJECT_ROOT/src/printing/print_ticket.py"
export SUMMARY_PRINT_SCRIPT_PATH="$PROJECT_ROOT/src/printing/print_summary_report.py"
export BACKEND_INSERT_URL="http://localhost:3000/payment-session/insert"
export MQTT_BROKER_URL="mqtt://localhost:1883"
export MQTT_PAYMENT_TOPIC="ctu-kiosk/payment"
export MQTT_STATUS_TOPIC="ctu-kiosk/status"
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Stop old processes first
sudo pkill -f "ts-node src/server.ts" || true
sudo pkill -f "vite" || true
sudo pkill -f "/home/ctukiosk/Desktop/Kiosk-System/CTU-Kiosk-System/scripts/payment_gpio_mqtt.py" || true

sleep 3

# Clear logs
rm -f /tmp/ctu-kiosk-backend.log
rm -f /tmp/ctu-kiosk-frontend.log
rm -f /tmp/ctu-kiosk-gpio.log

# Start backend
cd "$PROJECT_ROOT" || exit 1
nohup npm run dev > /tmp/ctu-kiosk-backend.log 2>&1 &

sleep 8

# Start frontend
cd "$FRONTEND_DIR" || exit 1
nohup npm run dev -- --host 0.0.0.0 > /tmp/ctu-kiosk-frontend.log 2>&1 &

sleep 10

# Start GPIO/payment bridge using the exact working command
cd "$PROJECT_ROOT" || exit 1
nohup sudo -n -u root /usr/bin/python3 scripts/payment_gpio_mqtt.py > /tmp/ctu-kiosk-gpio.log 2>&1 &

echo "CTU Kiosk services started."
echo "Backend log:  /tmp/ctu-kiosk-backend.log"
echo "Frontend log: /tmp/ctu-kiosk-frontend.log"
echo "GPIO log:     /tmp/ctu-kiosk-gpio.log"

wait