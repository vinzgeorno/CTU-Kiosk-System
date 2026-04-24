#!/bin/bash

sleep 18

for i in {1..30}; do
  if curl -s http://localhost:5173/ >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

chromium --kiosk --app=http://localhost:5173/ \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --password-store=basic \
  --no-first-run \
  --overscroll-history-navigation=0 \
  --disable-pinch >/tmp/ctu-kiosk-browser.log 2>&1
