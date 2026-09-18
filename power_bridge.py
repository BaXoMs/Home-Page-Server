#!/usr/bin/env python3
"""
Power Bridge Daemon for Home-Page-Server
Hardware Power Management & Eco Sleep Scheduler
Runs on Raspberry Pi host (NodeR) on port 3006
"""
import http.server
import socketserver
import json
import os
import subprocess
import threading
import time
import datetime
import secrets

PORT = 3006
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.join(BASE_DIR, ".power_token")

# Critical containers that must NEVER be paused (DNS, Web Portal, Proxy)
CRITICAL_ALWAYS_ON = {"homepage-server", "adguardhome", "nginx-proxy-manager"}

# Eco Sleep State
eco_state = {
    "auto_schedule": True,
    "current_mode": "day",
    "paused_containers": [],
    "last_switch": time.time()
}

def get_or_create_token():
    if os.path.exists(TOKEN_FILE):
        try:
            with open(TOKEN_FILE, "r") as f:
                token = f.read().strip()
                if len(token) >= 32:
                    return token
        except Exception:
            pass
    token = secrets.token_hex(32)
    with open(TOKEN_FILE, "w") as f:
        f.write(token)
    try:
        os.chmod(TOKEN_FILE, 0o600)
    except Exception:
        pass
    return token

AUTH_TOKEN = get_or_create_token()
print(f"[PowerBridge] Server started. Token: {AUTH_TOKEN[:8]}... (saved in {TOKEN_FILE})")

def get_running_containers():
    try:
        res = subprocess.run(
            ["docker", "ps", "--format", "{{.Names}}"],
            capture_output=True, text=True, timeout=5
        )
        if res.returncode == 0:
            return set(line.strip() for line in res.stdout.splitlines() if line.strip())
    except Exception as e:
        print(f"[PowerBridge] Error getting running containers: {e}")
    return set()

def get_paused_containers():
    try:
        res = subprocess.run(
            ["docker", "ps", "--filter", "status=paused", "--format", "{{.Names}}"],
            capture_output=True, text=True, timeout=5
        )
        if res.returncode == 0:
            return set(line.strip() for line in res.stdout.splitlines() if line.strip())
    except Exception as e:
        print(f"[PowerBridge] Error getting paused containers: {e}")
    return set()

def apply_night_mode():
    """Pause non-critical containers to save CPU and enter Eco Sleep"""
    running = get_running_containers()
    to_pause = [c for c in running if c not in CRITICAL_ALWAYS_ON]
    paused_now = []
    for c in to_pause:
        try:
            res = subprocess.run(["docker", "pause", c], capture_output=True, text=True, timeout=5)
            if res.returncode == 0:
                paused_now.append(c)
                print(f"[PowerBridge-Eco] Paused: {c}")
        except Exception as e:
            print(f"[PowerBridge-Eco] Failed to pause {c}: {e}")

    eco_state["current_mode"] = "night"
    eco_state["paused_containers"] = list(get_paused_containers())
    eco_state["last_switch"] = time.time()
    return paused_now

def apply_day_mode():
    """Unpause all paused containers and restore full daytime operations"""
    paused = get_paused_containers()
    unpaused_now = []
    for c in paused:
        try:
            res = subprocess.run(["docker", "unpause", c], capture_output=True, text=True, timeout=5)
            if res.returncode == 0:
                unpaused_now.append(c)
                print(f"[PowerBridge-Eco] Unpaused: {c}")
        except Exception as e:
            print(f"[PowerBridge-Eco] Failed to unpause {c}: {e}")

    eco_state["current_mode"] = "day"
    eco_state["paused_containers"] = []
    eco_state["last_switch"] = time.time()
    return unpaused_now

def is_night_hour():
    """Returns True if current local hour is between 23:00 and 11:00"""
    now = datetime.datetime.now()
    hour = now.hour
    return hour >= 23 or hour < 11

def eco_scheduler_loop():
    """Automatic background reconciliation loop for 23:00 - 11:00 Eco Sleep"""
    print("[PowerBridge-Eco] Scheduler thread initialized. Window: 23:00 to 11:00.")
    while True:
        try:
            if eco_state.get("auto_schedule", True):
                should_be_night = is_night_hour()
                current_mode = eco_state.get("current_mode", "day")

                if should_be_night and current_mode != "night":
                    print("[PowerBridge-Eco] 23:00 reached: Transitioning to Night Mode (Eco Sleep)...")
                    apply_night_mode()
                elif not should_be_night and current_mode != "day":
                    print("[PowerBridge-Eco] 11:00 reached: Transitioning to Day Mode (Active)...")
                    apply_day_mode()
        except Exception as e:
            print(f"[PowerBridge-Eco] Scheduler loop exception: {e}")
        time.sleep(30)

# Start background Eco scheduler
threading.Thread(target=eco_scheduler_loop, daemon=True).start()

class PowerBridgeHandler(http.server.BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send_json(200, {"ok": True})

    def _verify_auth(self):
        auth = self.headers.get("Authorization", "").strip()
        expected = f"Bearer {AUTH_TOKEN}"
        return auth == expected

    def do_GET(self):
        path = self.path.split("?")[0].rstrip("/")
        if path in ("/api/power/status", "/status"):
            # Ping Proxmox over Tailscale
            proxmox_up = False
            try:
                res = subprocess.run(
                    ["ping", "-c", "1", "-W", "2", "100.77.123.25"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                proxmox_up = (res.returncode == 0)
            except Exception:
                pass

            self._send_json(200, {
                "status": "online",
                "proxmox_node": "jj",
                "proxmox_ip": "100.77.123.25",
                "proxmox_reachable": proxmox_up,
                "rpi_node": "NodeR",
                "server_time": time.time(),
                "eco": {
                    "mode": eco_state["current_mode"],
                    "is_night_window": is_night_hour(),
                    "schedule": "23:00 a 11:00",
                    "paused_count": len(get_paused_containers())
                }
            })
        elif path in ("/api/power/eco/status", "/eco/status"):
            self._send_json(200, {
                "auto_schedule": eco_state["auto_schedule"],
                "schedule": "23:00 a 11:00",
                "current_mode": eco_state["current_mode"],
                "is_night_window": is_night_hour(),
                "paused_containers": list(get_paused_containers()),
                "always_on": list(CRITICAL_ALWAYS_ON)
            })
        elif path in ("/api/power/token", "/token"):
            client_ip = self.client_address[0]
            if (client_ip in ("127.0.0.1", "localhost") or 
                client_ip.startswith("172.") or 
                client_ip.startswith("100.") or
                client_ip.startswith("192.168.")):
                self._send_json(200, {"token": AUTH_TOKEN})
            else:
                self._send_json(403, {"error": "Forbidden: Non-local client"})
        else:
            self._send_json(404, {"error": "Endpoint not found"})

    def do_POST(self):
        path = self.path.split("?")[0].rstrip("/")
        if not self._verify_auth():
            self._send_json(401, {"error": "Unauthorized: Invalid or missing Bearer token"})
            return

        content_len = int(self.headers.get('Content-Length', 0))
        body_data = {}
        if content_len > 0:
            try:
                body_data = json.loads(self.rfile.read(content_len).decode('utf-8'))
            except Exception:
                pass

        if path in ("/api/power/proxmox", "/proxmox"):
            print("[PowerBridge] INCOMING SHUTDOWN REQUEST FOR PROXMOX VE (jj)")
            def dispatch_proxmox_shutdown():
                time.sleep(1)
                ssh_key = os.path.expanduser("~/.ssh/id_proxmox_shutdown")
                cmd = [
                    "ssh",
                    "-o", "StrictHostKeyChecking=no",
                    "-o", "ConnectTimeout=8",
                    "-o", "BatchMode=yes",
                    "-i", ssh_key,
                    "root@100.77.123.25"
                ]
                try:
                    res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
                    print(f"[PowerBridge] Proxmox SSH poweroff dispatched: code={res.returncode}, out={res.stdout}, err={res.stderr}")
                except Exception as e:
                    print(f"[PowerBridge] Error triggering Proxmox shutdown: {e}")

            threading.Thread(target=dispatch_proxmox_shutdown, daemon=True).start()
            self._send_json(200, {
                "success": True,
                "target": "Proxmox VE (jj)",
                "message": "Orden de apagado enviada con éxito. Proxmox VE detendrá las VMs y se apagará en unos instantes."
            })

        elif path in ("/api/power/rpi", "/rpi"):
            challenge = body_data.get("challenge", "").strip().upper()
            if challenge != "APAGAR":
                self._send_json(400, {"error": "Desafío de seguridad incorrecto. Debes enviar 'APAGAR'."})
                return

            print("[PowerBridge] INCOMING SHUTDOWN REQUEST FOR RASPBERRY PI (NodeR)")
            def dispatch_rpi_shutdown():
                time.sleep(3)
                cmd = [
                    "docker", "run", "--rm", "--privileged", "--pid=host",
                    "alpine", "nsenter", "-t", "1", "-m", "-u", "-i", "-n", "-p", "/sbin/poweroff"
                ]
                try:
                    subprocess.run(cmd, timeout=10)
                except Exception as e:
                    print(f"[PowerBridge] Error triggering RPi poweroff: {e}")

            threading.Thread(target=dispatch_rpi_shutdown, daemon=True).start()
            self._send_json(200, {
                "success": True,
                "target": "Raspberry Pi (NodeR)",
                "message": "Raspberry Pi (NodeR) apagándose de forma ordenada. La conexión se cerrará en breve."
            })

        elif path in ("/api/power/eco/toggle", "/eco/toggle"):
            # Manually toggle between Night and Day mode
            target_mode = body_data.get("mode")
            if not target_mode:
                target_mode = "night" if eco_state["current_mode"] == "day" else "day"

            if target_mode == "night":
                changed = apply_night_mode()
                msg = f"Modo Noche activado. Se pausaron {len(changed)} contenedores."
            else:
                changed = apply_day_mode()
                msg = f"Modo Día activado. Se reactivaron {len(changed)} contenedores."

            self._send_json(200, {
                "success": True,
                "current_mode": eco_state["current_mode"],
                "message": msg,
                "paused_containers": list(get_paused_containers())
            })

        elif path in ("/api/power/eco/night", "/eco/night"):
            changed = apply_night_mode()
            self._send_json(200, {
                "success": True,
                "current_mode": "night",
                "message": f"Modo Noche activado. {len(changed)} contenedores en pausa.",
                "paused_containers": changed
            })

        elif path in ("/api/power/eco/day", "/eco/day"):
            changed = apply_day_mode()
            self._send_json(200, {
                "success": True,
                "current_mode": "day",
                "message": f"Modo Día activado. {len(changed)} contenedores activos.",
                "unpaused_containers": changed
            })

        else:
            self._send_json(404, {"error": "Endpoint not found"})

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

if __name__ == "__main__":
    server = ThreadedHTTPServer(("0.0.0.0", PORT), PowerBridgeHandler)
    print(f"[PowerBridge] Listening on 0.0.0.0:{PORT} with Eco Scheduler (23:00 - 11:00)...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[PowerBridge] Stopped.")
