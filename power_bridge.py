#!/usr/bin/env python3
"""
Power Bridge Daemon for Home-Page-Server
Hardware Power Management & Safe Shutdown Bridge
Runs on Raspberry Pi host (NodeR) on port 3006
"""
import http.server
import socketserver
import json
import os
import subprocess
import threading
import time
import secrets

PORT = 3006
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.join(BASE_DIR, ".power_token")

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
                "server_time": time.time()
            })
        elif path in ("/api/power/token", "/token"):
            # Allow local origin (127.0.0.1 or docker subnet 172.x or tailscale) to obtain active token for dashboard
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
                time.sleep(3) # allow HTTP response to flush cleanly to browser
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
        else:
            self._send_json(404, {"error": "Endpoint not found"})

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

if __name__ == "__main__":
    server = ThreadedHTTPServer(("0.0.0.0", PORT), PowerBridgeHandler)
    print(f"[PowerBridge] Listening on 0.0.0.0:{PORT}...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[PowerBridge] Stopped.")
