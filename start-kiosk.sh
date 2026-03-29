#!/bin/bash
set -e

PROJECT_ROOT="/home/ctukiosk/Desktop/Kiosk-System/CTU-Kiosk-System"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
VENV_PY="/home/ctukiosk/Desktop/Kiosk-System/CTU-Kiosk-System/escpos-env/bin/python3"

export PORT=3000
export PYTHON_CMD="$VENV_PY"
export PRINT_SCRIPT_PATH="$PROJECT_ROOT/src/printing/print_ticket.py"
export BACKEND_INSERT_URL="http://localhost:3000/payment-session/insert"
export MQTT_BROKER_URL="mqtt://localhost:1883"
export MQTT_PAYMENT_TOPIC="ctu-kiosk/payment"
export MQTT_STATUS_TOPIC="ctu-kiosk/status"
export DISPLAY=:0
export XAUTHORITY=/home/ctukiosk/.Xauthority

# Kill old instances if they exist
pkill -f "ts-node src/server.ts" || true
pkill -f "vite" || true
pkill -f "payment_gpio_mqtt.py" || true
pkill -f "chromium" || true

sleep 2

# Start backend
cd "$PROJECT_ROOT"
/usr/bin/nohup /usr/bin/npm run dev > /tmp/ctu-kiosk-backend.log 2>&1 &

sleep 5

# Start frontend
cd "$FRONTEND_DIR"
/usr/bin/nohup /usr/bin/npm run dev -- --host 0.0.0.0 > /tmp/ctu-kiosk-frontend.log 2>&1 &

sleep 8

# Start GPIO/payment bridge
cd "$PROJECT_ROOT"
/usr/bin/nohup "$VENV_PY" scripts/payment_gpio_mqtt.py > /tmp/ctu-kiosk-gpio.log 2>&1 &

sleep 3

# Start Chromium in kiosk mode
/usr/bin/chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --password-store=basic \
  http://localhost:5173/ > /tmp/ctu-kiosk-browser.log 2>&1 &

wait

#chmod +x /home/ctukiosk/Desktop/Kiosk-System/start-kiosk.sh