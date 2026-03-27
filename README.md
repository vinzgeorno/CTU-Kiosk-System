# CTU Kiosk System

## Project overview

A small kiosk system for CTU: Node backend, React + Vite frontend, and Python printing helper for a thermal printer.

## Backend setup

- From repo root:

```bash
npm install
npm run dev
```

- Backend uses environment variables (see below).

## Frontend setup

- From the `frontend` folder:

```bash
cd frontend
npm install
npm run dev
```

- Frontend reads the API base URL from `VITE_API_BASE_URL`.

## Environment variables

Backend:

- `PORT` — server port
- `PYTHON_CMD` — python executable (e.g. `python3`)
- `PRINT_SCRIPT_PATH` — path to the print script on the Pi
- `MQTT_BROKER_URL` — MQTT broker address
- `MQTT_PAYMENT_TOPIC` — topic for payment events
- `MQTT_STATUS_TOPIC` — topic for status updates

Frontend:

- `VITE_API_BASE_URL` — base URL for backend API (e.g. `http://localhost:3000`)

## Running the system

1. Start the backend (from repo root):

```bash
npm install
npm run dev
```

2. Start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Note: Ensure `PRINT_SCRIPT_PATH` and `PYTHON_CMD` match the Raspberry Pi environment where the thermal printer is connected.
