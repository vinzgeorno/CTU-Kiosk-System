#!/bin/bash

PROJECT_ROOT="/home/ctukiosk/Desktop/Kiosk-System/CTU-Kiosk-System"

cd "$PROJECT_ROOT" || exit 1

# Start kiosk services in background
./start-kiosk.sh >/tmp/ctu-kiosk-startup.log 2>&1 &

# Start browser launcher in background
./launch-browser.sh >/tmp/ctu-kiosk-browser-startup.log 2>&1 &
