#!/usr/bin/env python3
"""
Combined Coin & Bill Acceptor Script for Raspberry Pi (MQTT Edition)
Mirrors test.py logic with MQTT publishing for real-time frontend sync
- Coin Acceptor: GPIO 27
- Bill Acceptor: GPIO 26
"""

import RPi.GPIO as GPIO
import time
import signal
import sys
import json
import requests
import paho.mqtt.client as mqtt
import os
import subprocess
from datetime import datetime

# ── Pin assignments ───────────────────────────────────────────────
COIN_PIN = 27
BILL_PIN = 26
SERVO_PIN = 17  # PWM-capable GPIO pin for servo control (can also use GPIO 18)

# ── MQTT config ───────────────────────────────────────────────────
BROKER = 'localhost'  # or IP of your MQTT broker
PORT = 1883
TOPIC_BILL = 'ctu-kiosk/payment/bill'
TOPIC_COIN = 'ctu-kiosk/payment/coin'
TOPIC_DISPENSE = 'ctu-kiosk/payment/dispense'

# ── Backend HTTP config ───────────────────────────────────────────
BACKEND_INSERT_URL = os.getenv("BACKEND_INSERT_URL", "http://localhost:3000/payment-session/insert")

# ── Servo config (Change Dispenser) ────────────────────────────────
SERVO_REST_ANGLE = 0       # Rest position (no dispensing)
SERVO_PUSH_ANGLE = 100      # Push position (dispenses coin)
SERVO_MOVE_DELAY = 0.2     # 300ms for servo movement
SERVO_DWELL_TIME = 0.5     # 500ms to let coin drop before returning (NEW)
SERVO_COIN_GAP = 0.75       # 500ms gap between coins
SERVO_PWM_FREQ = 50        # PWM frequency for servo (50 Hz standard)
servo_pwm = None           # Will be initialized on-demand when dispense is needed
servo_initialized = False  # Track if servo has been initialized

# ── Shared state ──────────────────────────────────────────────────
credit = 0
last_publish_time = 0

# ── Coin config ───────────────────────────────────────────────────
coin_pulse_count = 0
coin_last_pulse_time = 0.0
COIN_GAP_TIMEOUT = 0.5   # 500ms gap = end of coin pulse burst
COIN_DEBOUNCE_MS = 50
COIN_MIN_PULSE_WIDTH = 0.02  # 20ms minimum pulse width to filter noise

PULSE_TO_VALUE = {
    1: 1,      # 1 pulse = ₱1
    5: 5,      # 5 pulses = ₱5
    10: 10,    # 10 pulses = ₱10
    20: 20,    # 20 pulses = ₱20
    4: 5,      # 4 pulses = ₱5 gj(old 5 PHP coin variant)
    6: 5,      # 6 pulses = ₱5 (old 5 PHP coin variant)
    9: 10,     # 9 pulses = ₱10 (old 10 PHP coin variant)
    11: 10,    # 11 pulses = ₱10 (old 10 PHP coin variant)
    19: 20,    # 19 pulses = ₱20 (old 20 PHP coin variant)
    21: 20     # 21 pulses = ₱20 (old 20 PHP coin variant)
}

# ── Bill config ───────────────────────────────────────────────────
bill_pulse_count = 0
bill_last_pulse_time = 0.0
BILL_DONE_TIMEOUT = 1.5    # 1500ms gap = end of bill pulse burst (increased to capture all pulses from slow bill acceptors)
BILL_DEBOUNCE_MS = 40      # 40ms debounce - balances noise filtering with pulse capture (bills come faster than 80ms)
BILL_MIN_PULSE_WIDTH = 0.02  # 20ms minimum pulse width to filter noise

# Bill denominations and their typical pulse counts (for rounding to closest value)
BILL_DENOMINATIONS = {
    10: 1,      # ₱10 = 1 pulse
    20: 2,      # ₱20 = 2 pulses
    50: 5,      # ₱50 = 5 pulses
    100: 10     # ₱100 = 10 pulses
}

# ── DEBUG: Track all pulses received ───────────────────────────────
pulse_log = []
MAX_PULSE_LOG = 100


def debug_print_pulses(source, pulse_count, value=None):
    """Debug function to print pulses received from actual components to terminal"""
    timestamp = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
    
    if value:
        log_entry = f"[{timestamp}] [DEBUG] {source}: {pulse_count} pulses → ₱{value}"
    else:
        log_entry = f"[{timestamp}] [DEBUG] {source}: Real pulse detected! Count: {pulse_count}"
    
    print(log_entry)
    pulse_log.append(log_entry)
    
    # Keep only last 100 entries
    if len(pulse_log) > MAX_PULSE_LOG:
        pulse_log.pop(0)


# ── Servo Control Functions ────────────────────────────────────────

def angle_to_pwm(angle):
    """Convert servo angle (0-180) to PWM duty cycle (2-12%)"""
    # Standard servo: 1ms pulse = 0°, 1.5ms pulse = 90°, 2ms pulse = 180°
    # PWM: 2-12% duty at 50Hz = 1-2ms pulse width
    duty_cycle = 2.0 + (angle / 180.0) * 10.0
    return duty_cycle


def set_servo_angle(angle):
    """Set servo to specified angle (0-180)"""
    global servo_pwm
    if servo_pwm is None:
        print("⚠️  Servo not initialized")
        return
    
    duty = angle_to_pwm(angle)
    try:
        servo_pwm.ChangeDutyCycle(duty)
        time.sleep(0.05)  # Small delay for PWM update to take effect
        print(f"🔧 Servo angle set to {angle}° (PWM duty: {duty:.1f}%)")
    except Exception as e:
        print(f"❌ Error setting servo angle: {e}")


def initialize_servo():
    """Initialize servo GPIO - called only when dispense is needed"""
    global servo_pwm, servo_initialized
    
    if servo_initialized:
        print("ℹ️  Servo already initialized, skipping...")
        return True
    
    try:
        print("\n🔧 [SERVO] Initializing on-demand for dispense operation...")
        
        # Setup GPIO for servo
        try:
            GPIO.setup(SERVO_PIN, GPIO.OUT, initial=GPIO.LOW)
        except RuntimeError:
            # Already configured
            pass
        
        time.sleep(0.2)
        
        # Initialize PWM directly at REST position (no unnecessary movement!)
        time.sleep(0.5)  # Extra stabilization before PWM creation
        servo_pwm = GPIO.PWM(SERVO_PIN, SERVO_PWM_FREQ)
        rest_duty = angle_to_pwm(SERVO_REST_ANGLE)
        servo_pwm.ChangeDutyCycle(rest_duty)  # Set duty before starting
        servo_pwm.start(rest_duty)  # Start directly at rest, no intermediate steps
        time.sleep(0.5)  # Extra stabilization after PWM starts
        
        servo_initialized = True
        print(f"✅ [SERVO] Initialized at rest position on GPIO {SERVO_PIN}\n")
        return True
        
    except Exception as e:
        print(f"❌ [SERVO] Initialization failed: {e}\n")
        return False


def cleanup_servo():
    """Clean up servo GPIO - called after dispense is complete"""
    global servo_pwm, servo_initialized
    
    try:
        if servo_pwm is not None:
            servo_pwm.stop()
            servo_pwm = None
        servo_initialized = False
        print("✅ [SERVO] Cleaned up and released GPIO\n")
    except Exception as e:
        print(f"⚠️  [SERVO] Cleanup error: {e}\n")


def push_coin():
    """Dispense a single coin"""
    global servo_pwm
    if servo_pwm is None:
        print("⚠️  Servo not initialized, skipping coin dispense")
        return
    
    # Push
    print(f"    → Pushing to {SERVO_PUSH_ANGLE}°")
    set_servo_angle(SERVO_PUSH_ANGLE)
    time.sleep(SERVO_MOVE_DELAY)
    
    # Dwell - let coin drop before returning
    print(f"    → Dwelling for {SERVO_DWELL_TIME}s (coin drops)")
    time.sleep(SERVO_DWELL_TIME)
    
    # Return to rest
    print(f"    → Returning to {SERVO_REST_ANGLE}°")
    set_servo_angle(SERVO_REST_ANGLE)
    time.sleep(SERVO_MOVE_DELAY)
    
    print("💰 Coin dispensed")


def dispense_coins(num_coins):
    """Dispense specified number of 5PHP coins"""
    if num_coins <= 0:
        print("⚠️  Invalid coin count")
        return False
    
    change_amount = num_coins * 5  # Each coin is ₱5
    print(f"\n🎯 === AUTO-DISPENSE: {num_coins} × ₱5 coins (Total: ₱{change_amount}) ===")
    print(f"📋 Plan: Initialize servo → Loop {num_coins} times → Each push_coin() does 1 push")
    
    try:
        # Initialize servo only when needed
        if not initialize_servo():
            print("❌ Failed to initialize servo")
            return False
        
        print(f"🔄 Starting dispense loop with {num_coins} iterations...")
        
        for i in range(num_coins):
            print(f"[{i+1}/{num_coins}] Dispensing ₱5 coin...")
            push_coin()
            if i < num_coins - 1:
                time.sleep(SERVO_COIN_GAP)
        
        print(f"✅ Successfully dispensed ₱{change_amount} as change")
        
        # Clean up servo after dispensing
        cleanup_servo()
        return True
        
    except Exception as e:
        print(f"❌ Dispense failed: {e}")
        cleanup_servo()
        return False


def debug_print_pulses(source, pulse_count, value=None):
    """Debug function to print pulses received from actual components to terminal"""
    timestamp = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
    
    if value:
        log_entry = f"[{timestamp}] [DEBUG] {source}: {pulse_count} pulses → ₱{value}"
    else:
        log_entry = f"[{timestamp}] [DEBUG] {source}: Real pulse detected! Count: {pulse_count}"
    
    print(log_entry)
    pulse_log.append(log_entry)
    
    # Keep only last 100 entries
    if len(pulse_log) > MAX_PULSE_LOG:
        pulse_log.pop(0)


# ── MQTT Callbacks ────────────────────────────────────────────────

def on_connect(client, userdata, flags, reason_code, properties=None):
    """On successful MQTT connection"""
    print(f"✅ [MQTT] Connected to broker at {BROKER}:{PORT}, reason_code: {reason_code}")
    if reason_code == 0:
        client.subscribe(TOPIC_DISPENSE)
        print(f"📡 [MQTT] Subscribed to {TOPIC_DISPENSE}")
    else:
        print(f"❌ [MQTT] Connection failed with code {reason_code}")


def on_message(client, userdata, msg):
    """Handle incoming MQTT messages"""
    if msg.topic == TOPIC_DISPENSE:
        try:
            data = json.loads(msg.payload.decode())
            amount = data.get('amount', 0)
            print(f"📨 [MQTT] Dispense command received: ₱{amount}")
            
            # Calculate number of 5PHP coins
            # Only 5PHP coins are used (all transactions end in 5 or 0)
            if amount % 5 == 0:
                num_coins = int(amount / 5)
                if num_coins > 0:
                    print(f"💰 Change calculation: ₱{amount} = {num_coins} × ₱5 coins")
                    dispense_coins(num_coins)
                else:
                    print("⚠️  No change to dispense")
            else:
                print(f"❌ [DISPENSE] Invalid change amount: ₱{amount} (not divisible by 5)")
        except json.JSONDecodeError:
            print(f"❌ [MQTT] Invalid JSON in dispense message")
        except Exception as e:
            print(f"❌ [MQTT] Error processing dispense: {e}")


def on_disconnect(client, userdata, disconnect_flags, reason_code, properties=None):
    """On MQTT disconnect"""
    print(f"🔌 [MQTT] Disconnected with reason code {reason_code}")
    if reason_code != 0:
        print(f"❌ [MQTT] Unexpected disconnection, attempting to reconnect...")


# ── GPIO Callbacks ────────────────────────────────────────────────

def coin_pulse_callback(channel):
    """Real coin detector callback - detects pulses from actual hardware"""
    global coin_pulse_count, coin_last_pulse_time, credit
    now = time.time()
    time_since_last = now - coin_last_pulse_time
    
    if coin_pulse_count == 0:
        # First pulse - always accept
        coin_pulse_count = 1
        coin_last_pulse_time = now
    elif time_since_last > (COIN_DEBOUNCE_MS / 1000.0):
        # Subsequent pulses - check debounce timing
        coin_pulse_count += 1
        coin_last_pulse_time = now


def bill_pulse_callback(channel):
    """Real bill detector callback - detects pulses from actual hardware"""
    global bill_pulse_count, bill_last_pulse_time, credit
    now = time.time()
    time_since_last = now - bill_last_pulse_time
    
    if bill_pulse_count == 0:
        # First pulse - always accept
        bill_pulse_count = 1
        bill_last_pulse_time = now
    elif time_since_last > (BILL_DEBOUNCE_MS / 1000.0):
        # Subsequent pulses - check debounce timing
        bill_pulse_count += 1
        bill_last_pulse_time = now


# ── Process & Publish Events ──────────────────────────────────────

def publish_coin_event(mqtt_client, pulses):
    """Publish coin event to MQTT"""
    global credit
    value = PULSE_TO_VALUE.get(pulses)
    
    if value is None:
        timestamp = time.strftime('%H:%M:%S', time.localtime())
        print(f"\n❌ [{timestamp}] COIN REJECTED: {pulses} pulses not in mapping")
        print(f"   Available mappings: {PULSE_TO_VALUE}\n")
        return
    
    credit += value
    timestamp = time.strftime('%H:%M:%S', time.localtime())
    print(f"\n✅ [{timestamp}] COIN COMPLETE: {pulses} pulses → ₱{value} (Total: ₱{credit})\n")
    send_payment_to_backend(value)
    
    payload = json.dumps({
        "pulses": pulses,
        "value": value,
        "totalCredit": credit,
        "timestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        "gpioPin": COIN_PIN
    })
    
    mqtt_client.publish(TOPIC_COIN, payload)


def round_bill_pulses_to_value(pulses):
    """Round pulse count to the closest valid bill denomination"""
    # Find the denomination with the closest typical pulse count
    closest_value = min(
        BILL_DENOMINATIONS.keys(),
        key=lambda denom: abs(BILL_DENOMINATIONS[denom] - pulses)
    )
    return closest_value


def publish_bill_event(mqtt_client, pulses):
    """Publish bill event to MQTT with automatic pulse-to-denomination rounding"""
    global credit
    added = round_bill_pulses_to_value(pulses)
    
    if added is None:
        timestamp = time.strftime('%H:%M:%S', time.localtime())
        print(f"\n❌ [{timestamp}] BILL REJECTED: {pulses} pulses failed rounding")
        return
    
    credit += added
    timestamp = time.strftime('%H:%M:%S', time.localtime())
    print(f"\n✅ [{timestamp}] BILL COMPLETE: {pulses} pulses → ₱{added} (Total: ₱{credit})\n")
    send_payment_to_backend(added)
    
    payload = json.dumps({
        "pulses": pulses,
        "amount": added,
        "totalCredit": credit,
        "timestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        "gpioPin": BILL_PIN
    })
    
    mqtt_client.publish(TOPIC_BILL, payload)


def send_payment_to_backend(amount):
    """Send finalized payment amount to backend for real-time session updates."""
    try:
        response = requests.post(
            BACKEND_INSERT_URL,
            json={"amount": amount},
            timeout=2,
        )
        response.raise_for_status()
        print(f"🌐 [HTTP] Inserted payment amount ₱{amount}")
    except Exception as e:
        print(f"⚠️  [HTTP] Insert failed for ₱{amount}: {e}")


# ── Main Processing Loop ──────────────────────────────────────────

def process_payment_events(mqtt_client):
    """Main loop to process coin/bill bursts"""
    global coin_pulse_count, bill_pulse_count
    global coin_last_pulse_time, bill_last_pulse_time
    
    now = time.time()
    
    # Process coin burst
    if coin_pulse_count > 0 and (now - coin_last_pulse_time) > COIN_GAP_TIMEOUT:
        pulses = coin_pulse_count
        coin_pulse_count = 0
        publish_coin_event(mqtt_client, pulses)
    
    # Process bill burst
    if bill_pulse_count > 0 and (now - bill_last_pulse_time) > BILL_DONE_TIMEOUT:
        pulses = bill_pulse_count
        bill_pulse_count = 0
        publish_bill_event(mqtt_client, pulses)


# ── Main ──────────────────────────────────────────────────────────

def main():
    global coin_pulse_count, bill_pulse_count, credit
    
    print("\n" + "="*60)
    print("🚀 CTU-Kiosk Payment Hardware (MQTT Bridge) Starting...")
    print("="*60)
    print(f"💰 Coin → GPIO {COIN_PIN} | 💵 Bill → GPIO {BILL_PIN}")
    print(f"📡 MQTT Broker: {BROKER}:{PORT}")
    print(f"💰 Coin pulse map: {PULSE_TO_VALUE}")
    print(f"💵 Bill denominations: {BILL_DENOMINATIONS}")
    print(f"   Timeout: {BILL_DONE_TIMEOUT}s | Debounce: {BILL_DEBOUNCE_MS}ms")
    print(f"   (Bills auto-round to closest denomination)\n")
    
    # Setup GPIO with comprehensive error handling
    gpio_available = False
    try:
        # Clean up any previous GPIO setup - use shell command for more aggressive cleanup
        try:
            import subprocess
            subprocess.run(['gpio', 'reset'], check=False, capture_output=True)
        except:
            pass
        
        try:
            GPIO.cleanup()
        except:
            pass
        
        # Small delay after cleanup to let GPIO settle
        time.sleep(0.5)
        
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(COIN_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        GPIO.setup(BILL_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        # NOTE: Servo GPIO will be initialized on-demand when dispense is needed
        
        print("✅ Payment hardware GPIO initialized (coin & bill detectors)")
        print("ℹ️  Servo GPIO will be initialized only when change needs to be dispensed\n")
        
        # Add GPIO event detection
        try:
            GPIO.add_event_detect(COIN_PIN, GPIO.FALLING,
                                callback=coin_pulse_callback,
                                bouncetime=COIN_DEBOUNCE_MS)
            GPIO.add_event_detect(BILL_PIN, GPIO.RISING,
                                callback=bill_pulse_callback,
                                bouncetime=BILL_DEBOUNCE_MS)
            gpio_available = True
            print("✅ GPIO edge detection enabled - Real Hardware Mode\n")
        except Exception as e:
            print(f"⚠️  Edge detection failed: {e}")
            print("   Possible causes:")
            print("   - GPIO pins already in use by another process")
            print("   - Permission denied (run with sudo or add user to gpio group)")
            print("   - GPIO not available on this system")
            print("   Falling back to MQTT Simulator Mode\n")
            gpio_available = False
            
    except Exception as e:
        print(f"⚠️  GPIO initialization failed: {e}")
        print("   Running in MQTT Simulator Mode (no GPIO hardware)\n")
        gpio_available = False
    
    # Setup MQTT
    mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message
    mqtt_client.on_disconnect = on_disconnect
    
    try:
        mqtt_client.connect(BROKER, PORT, 60)
        mqtt_client.loop_start()
        
        if gpio_available:
            print("✅ Coin & Bill Acceptor Ready... (Press CTRL+C to exit)")
            print(f"📋 All pulses logged. Type 'show_logs' to debug.\n")
        else:
            print("✅ MQTT Service Running in Simulator Mode... (Press CTRL+C to exit)")
            print(f"📋 Simulated pulses logged.\n")
        
        last_debug_time = time.time()
        
        while True:
            now = time.time()
            
            # Process payment events
            process_payment_events(mqtt_client)
            
            # Debug every 2s
            if now - last_debug_time > 2.0:
                if gpio_available:
                    try:
                        coin_state = GPIO.input(COIN_PIN)
                        bill_state = GPIO.input(BILL_PIN)
                        print(f"[GPIO] COIN GPIO{COIN_PIN}={coin_state} (pulses={coin_pulse_count}) | "
                              f"BILL GPIO{BILL_PIN}={bill_state} (pulses={bill_pulse_count}) | "
                              f"Credit=₱{credit}", flush=True)
                    except:
                        print(f"[GPIO] Error reading pins (pulses COIN={coin_pulse_count}, BILL={bill_pulse_count}, Credit=₱{credit})", flush=True)
                else:
                    print(f"[SIMULATOR] COIN (pulses={coin_pulse_count}) | "
                          f"BILL (pulses={bill_pulse_count}) | "
                          f"Credit=₱{credit}", flush=True)
                last_debug_time = now
            
            time.sleep(0.01)
    
    except KeyboardInterrupt:
        print("\n\n🛑 Stopping...")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if gpio_available:
            try:
                # Stop servo PWM
                if servo_pwm is not None:
                    servo_pwm.stop()
                    print("✅ Servo PWM stopped")
                
                GPIO.cleanup()
                print("✅ GPIO cleaned up")
            except:
                pass
        mqtt_client.loop_stop()
        mqtt_client.disconnect()
        print("✅ Cleanup complete")


if __name__ == "__main__":
    main()