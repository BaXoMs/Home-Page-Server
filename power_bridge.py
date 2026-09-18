#!/usr/bin/env python3
"""
Power Bridge Daemon for Home-Page-Server
Hardware Power Management, User Security Hierarchy & Eco Sleep Scheduler
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
import hashlib
import urllib.request
import urllib.parse
import ssl

PORT = 3006
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.join(BASE_DIR, ".power_token")
USERS_DB_FILE = os.path.join(BASE_DIR, "users_db.json")

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
ACTIVE_SESSIONS = {}
print(f"[PowerBridge] Server started. Token: {AUTH_TOKEN[:8]}... (saved in {TOKEN_FILE})")

# ---------------------------------------------------------
# User Hierarchy Database & Security
# BaXoMs is the sole Root user; secondary users are Operadores/Visores
# ---------------------------------------------------------

def hash_pw(pw, salt=None):
    if not salt:
        salt = secrets.token_hex(8)
    h = hashlib.sha256((pw + salt).encode("utf-8")).hexdigest()
    return f"{salt}${h}"

def verify_pw(pw, stored_hash):
    if not stored_hash or "$" not in stored_hash:
        return False
    salt, expected = stored_hash.split("$", 1)
    return hashlib.sha256((pw + salt).encode("utf-8")).hexdigest() == expected

def load_users():
    if os.path.exists(USERS_DB_FILE):
        try:
            with open(USERS_DB_FILE, "r") as f:
                data = json.load(f)
                if "baxoms" in data and data["baxoms"].get("role") == "root":
                    # Ensure must_change_password flag is tracked
                    if "must_change_password" not in data["baxoms"]:
                        data["baxoms"]["must_change_password"] = bool(data["baxoms"].get("fallback_pw"))
                    return data
        except Exception as e:
            print(f"[UsersDB] Warning reading users_db.json: {e}")

    # Initialize default: BaXoMs is the sole root user
    users = {
        "baxoms": {
            "username": "BaXoMs",
            "role": "root",
            "password_hash": hash_pw("EmM29Sm26"),
            "fallback_pw": "grace26",
            "must_change_password": True,
            "created_at": "2026-09-17 00:00"
        }
    }
    save_users(users)
    return users

def save_users(users):
    try:
        with open(USERS_DB_FILE, "w") as f:
            json.dump(users, f, indent=2)
        os.chmod(USERS_DB_FILE, 0o600)
    except Exception as e:
        print(f"[UsersDB] Error saving users_db.json: {e}")

# Initialize users DB at startup
load_users()

# ---------------------------------------------------------
# Docker Container & Eco Sleep Management
# ---------------------------------------------------------

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
    last_enforced_window = None
    while True:
        try:
            if eco_state.get("auto_schedule", True):
                current_window = "night" if is_night_hour() else "day"

                if current_window != last_enforced_window:
                    if current_window == "night":
                        print("[PowerBridge-Eco] Window transition: Entering Night Mode (Eco Sleep 23:00-11:00)...")
                        apply_night_mode()
                    else:
                        print("[PowerBridge-Eco] Window transition: Entering Day Mode (Active 11:00-23:00)...")
                        apply_day_mode()
                    last_enforced_window = current_window
        except Exception as e:
            print(f"[PowerBridge-Eco] Scheduler loop exception: {e}")
        time.sleep(30)

# Start background Eco scheduler
threading.Thread(target=eco_scheduler_loop, daemon=True).start()

# ---------------------------------------------------------
# HTTP API Request Handler
# ---------------------------------------------------------

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

    def _get_current_session(self):
        auth = self.headers.get("Authorization", "").strip()
        expected = f"Bearer {AUTH_TOKEN}"
        if auth == expected:
            return {"username": "BaXoMs", "role": "root"}
        token = auth.replace("Bearer ", "").strip()
        if token in ACTIVE_SESSIONS and ACTIVE_SESSIONS[token]["expires"] > time.time():
            return ACTIVE_SESSIONS[token]
        return None

    def _verify_auth(self):
        return self._get_current_session() is not None

    def _verify_root(self):
        sess = self._get_current_session()
        return sess is not None and sess.get("role") == "root"

    def do_GET(self):
        path = self.path.split("?")[0].rstrip("/")
        if path in ("/api/power/status", "/status"):
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

        elif path in ("/api/power/auth/session", "/auth/session"):
            sess = self._get_current_session()
            if sess:
                self._send_json(200, {
                    "authenticated": True,
                    "username": sess["username"],
                    "role": sess["role"]
                })
            else:
                self._send_json(200, {"authenticated": False})

        elif path in ("/api/power/users", "/users"):
            if not self._verify_root():
                self._send_json(403, {"error": "Acceso denegado: Solo BaXoMs (root) puede listar y administrar usuarios"})
                return
            users = load_users()
            user_list = [
                {
                    "username": u["username"],
                    "role": u["role"],
                    "created_at": u.get("created_at", "")
                }
                for u in users.values()
            ]
            self._send_json(200, {"users": user_list})

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
                self._send_json(403, {"error": "Token endpoint only available locally"})

        else:
            self._send_json(404, {"error": "Endpoint not found"})

    def do_POST(self):
        path = self.path.split("?")[0].rstrip("/")
        content_length = int(self.headers.get("Content-Length", 0))
        body_data = {}
        if content_length > 0:
            try:
                body_raw = self.rfile.read(content_length)
                body_data = json.loads(body_raw.decode("utf-8"))
            except Exception as e:
                self._send_json(400, {"error": f"Invalid JSON payload: {e}"})
                return

        # ---------------------------------------------------------
        # Public Auth Login Endpoint
        # ---------------------------------------------------------
        if path in ("/api/power/auth/login", "/auth/login"):
            username = body_data.get("username", "").strip()
            password = body_data.get("password", "").strip()

            if not username or not password:
                self._send_json(400, {"error": "Usuario y contraseña requeridos"})
                return

            # Explicit rule: no generic user 'root'. BaXoMs is the sole root user!
            if username.lower() == "root":
                self._send_json(403, {
                    "error": "El usuario 'root' no está habilitado. BaXoMs es el único usuario root del sistema."
                })
                return

            users = load_users()
            user_key = username.lower()
            user = users.get(user_key)
            auth_valid = False

            if user:
                if verify_pw(password, user.get("password_hash")):
                    auth_valid = True
                elif user.get("fallback_pw") and password in (user.get("fallback_pw"), "EmM29Sm26", "grace26"):
                    auth_valid = True

            # If user is BaXoMs, also allow Proxmox VE PAM check if reachable
            if not auth_valid and user_key == "baxoms":
                try:
                    ctx = ssl.create_default_context()
                    ctx.check_hostname = False
                    ctx.verify_mode = ssl.CERT_NONE
                    login_payload = urllib.parse.urlencode({
                        "username": "root@pam",
                        "password": password
                    }).encode("utf-8")
                    req = urllib.request.Request(
                        "https://100.77.123.25:8006/api2/json/access/ticket",
                        data=login_payload,
                        headers={"Content-Type": "application/x-www-form-urlencoded"}
                    )
                    with urllib.request.urlopen(req, timeout=3, context=ctx) as r:
                        if r.status == 200:
                            auth_valid = True
                except Exception:
                    pass

            if auth_valid and user:
                sess_token = secrets.token_hex(32)
                role = user["role"]
                ACTIVE_SESSIONS[sess_token] = {
                    "username": user["username"],
                    "role": role,
                    "created": time.time(),
                    "expires": time.time() + (86400 * 7)
                }
                must_change = user.get("must_change_password", False) or bool(user.get("fallback_pw"))
                self._send_json(200, {
                    "success": True,
                    "token": sess_token,
                    "username": user["username"],
                    "role": role,
                    "must_change_password": must_change,
                    "message": f"Sesión iniciada correctamente como {user['username']}"
                })
            else:
                self._send_json(401, {"error": "Credenciales inválidas"})
            return

        elif path in ("/api/power/auth/logout", "/auth/logout"):
            auth = self.headers.get("Authorization", "").replace("Bearer ", "").strip()
            if auth in ACTIVE_SESSIONS:
                del ACTIVE_SESSIONS[auth]
            self._send_json(200, {"success": True, "message": "Sesión cerrada correctamente"})
            return

        # ---------------------------------------------------------
        # Change Password Endpoint (Mandatory & Self-Service)
        # ---------------------------------------------------------
        elif path in ("/api/power/auth/change-password", "/auth/change-password"):
            sess = self._get_current_session()
            if not sess:
                self._send_json(401, {"error": "Sesión no autenticada"})
                return

            current_u_key = sess["username"].lower()
            old_p = body_data.get("old_password", "").strip()
            new_p = body_data.get("new_password", "").strip()
            confirm_p = body_data.get("confirm_password", "").strip()

            if not old_p or not new_p:
                self._send_json(400, {"error": "Debés ingresar la contraseña actual y la nueva contraseña"})
                return

            if new_p != confirm_p:
                self._send_json(400, {"error": "La nueva contraseña y su confirmación no coinciden"})
                return

            if len(new_p) < 6:
                self._send_json(400, {"error": "La nueva contraseña debe contener al menos 6 caracteres"})
                return

            users = load_users()
            user = users.get(current_u_key)
            if not user:
                self._send_json(404, {"error": "Usuario no encontrado"})
                return

            # Verify old password
            old_valid = False
            if verify_pw(old_p, user.get("password_hash")):
                old_valid = True
            elif user.get("fallback_pw") and old_p == user.get("fallback_pw"):
                old_valid = True
            elif user.get("role") == "root" and old_p in ("EmM29Sm26", "grace26"):
                old_valid = True

            if not old_valid:
                self._send_json(400, {"error": "La contraseña actual ingresada es incorrecta"})
                return

            if new_p in ("grace26", "EmM29Sm26", old_p):
                self._send_json(400, {"error": "La nueva contraseña no puede ser igual a una contraseña anterior o por defecto"})
                return

            # Update password hash, wipe fallback_pw, and clear must_change_password
            user["password_hash"] = hash_pw(new_p)
            if "fallback_pw" in user:
                del user["fallback_pw"]
            user["must_change_password"] = False
            user["updated_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

            save_users(users)
            print(f"[UsersDB] Password successfully updated for user {user['username']}. Fallback removed.")
            self._send_json(200, {
                "success": True,
                "message": "Contraseña actualizada exitosamente. Ya podés acceder a todas las funciones."
            })
            return

        # ---------------------------------------------------------
        # User Management (Exclusive to BaXoMs Root)
        # ---------------------------------------------------------
        elif path in ("/api/power/users", "/users"):
            if not self._verify_root():
                self._send_json(403, {"error": "Acceso denegado: Solo BaXoMs (root) tiene permisos para crear usuarios"})
                return

            new_u = body_data.get("username", "").strip()
            new_p = body_data.get("password", "").strip()
            new_role = body_data.get("role", "operador").strip().lower()

            if not new_u or not new_p:
                self._send_json(400, {"error": "Nombre de usuario y contraseña requeridos"})
                return

            if new_u.lower() in ("root", "baxoms"):
                self._send_json(400, {"error": "El usuario BaXoMs es exclusivo del sistema y no se puede duplicar"})
                return

            if new_role not in ("operador", "visor"):
                self._send_json(400, {"error": "Rol inválido. Los roles permitidos son 'operador' o 'visor'"})
                return

            users = load_users()
            users[new_u.lower()] = {
                "username": new_u,
                "role": new_role,
                "password_hash": hash_pw(new_p),
                "must_change_password": True,
                "created_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
            }
            save_users(users)
            self._send_json(200, {
                "success": True,
                "message": f"Usuario '{new_u}' creado con éxito con rol de {new_role}"
            })
            return

        elif path in ("/api/power/users/delete", "/users/delete"):
            if not self._verify_root():
                self._send_json(403, {"error": "Acceso denegado: Solo BaXoMs (root) tiene permisos para eliminar usuarios"})
                return

            target_u = body_data.get("username", "").strip().lower()
            if target_u in ("baxoms", "root"):
                self._send_json(400, {"error": "Operación prohibida: No se puede eliminar a BaXoMs (Root)"})
                return

            users = load_users()
            if target_u in users:
                deleted_name = users[target_u]["username"]
                del users[target_u]
                save_users(users)
                self._send_json(200, {"success": True, "message": f"Usuario '{deleted_name}' eliminado correctamente"})
            else:
                self._send_json(404, {"error": "Usuario no encontrado"})
            return

        # ---------------------------------------------------------
        # Proxmox VM & Container Power Controls (Start / Stop)
        # ---------------------------------------------------------
        elif path in ("/api/power/vm/start", "/vm/start"):
            sess = self._get_current_session()
            if not sess or sess.get("role") not in ("root", "operador"):
                self._send_json(403, {"error": "Permisos insuficientes: Solo BaXoMs u Operadores pueden encender VMs"})
                return

            vmid = body_data.get("vmid")
            vm_type = body_data.get("type", "qemu").lower()
            if not vmid:
                self._send_json(400, {"error": "Parámetro 'vmid' requerido"})
                return

            # Check if Proxmox host is reachable
            res_ping = subprocess.run(["ping", "-c", "1", "-W", "2", "100.77.123.25"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if res_ping.returncode != 0:
                self._send_json(400, {
                    "error": "El servidor Proxmox VE (jj) está apagado o fuera de línea. Primero encendé el hipervisor."
                })
                return

            ssh_key = os.path.expanduser("~/.ssh/id_proxmox_shutdown")
            subcmd = f"pct start {vmid}" if vm_type == "lxc" else f"qm start {vmid}"
            cmd = [
                "ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=8",
                "-o", "BatchMode=yes", "-i", ssh_key, "root@100.77.123.25", subcmd
            ]
            try:
                p = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
                if p.returncode == 0:
                    self._send_json(200, {
                        "success": True,
                        "vmid": vmid,
                        "message": f"Orden de encendido enviada exitosamente a VM/LXC {vmid}"
                    })
                else:
                    self._send_json(500, {
                        "error": f"Error ejecutando '{subcmd}' en Proxmox: {p.stderr.strip() or p.stdout.strip()}"
                    })
            except Exception as e:
                self._send_json(500, {"error": f"Error de comunicación SSH con Proxmox: {e}"})
            return

        elif path in ("/api/power/vm/stop", "/vm/stop"):
            sess = self._get_current_session()
            if not sess or sess.get("role") not in ("root", "operador"):
                self._send_json(403, {"error": "Permisos insuficientes: Solo BaXoMs u Operadores pueden apagar VMs"})
                return

            vmid = body_data.get("vmid")
            vm_type = body_data.get("type", "qemu").lower()
            if not vmid:
                self._send_json(400, {"error": "Parámetro 'vmid' requerido"})
                return

            # Check if Proxmox host is reachable
            res_ping = subprocess.run(["ping", "-c", "1", "-W", "2", "100.77.123.25"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if res_ping.returncode != 0:
                self._send_json(400, {
                    "error": "El servidor Proxmox VE (jj) está apagado. No hay máquinas en ejecución."
                })
                return

            ssh_key = os.path.expanduser("~/.ssh/id_proxmox_shutdown")
            subcmd = f"pct shutdown {vmid}" if vm_type == "lxc" else f"qm shutdown {vmid}"
            cmd = [
                "ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=8",
                "-o", "BatchMode=yes", "-i", ssh_key, "root@100.77.123.25", subcmd
            ]
            try:
                p = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
                if p.returncode == 0:
                    self._send_json(200, {
                        "success": True,
                        "vmid": vmid,
                        "message": f"Orden de apagado ACPI enviada a VM/LXC {vmid}"
                    })
                else:
                    self._send_json(500, {
                        "error": f"Error ejecutando '{subcmd}' en Proxmox: {p.stderr.strip() or p.stdout.strip()}"
                    })
            except Exception as e:
                self._send_json(500, {"error": f"Error de comunicación SSH con Proxmox: {e}"})
            return

        # ---------------------------------------------------------
        # Hardware Power Control & Eco (Strictly BaXoMs Root Only)
        # ---------------------------------------------------------
        if not self._verify_root():
            self._send_json(403, {
                "error": "Acceso denegado: Solo BaXoMs (Root) tiene autorización para controlar energía y hardware"
            })
            return

        if path in ("/api/power/proxmox", "/proxmox"):
            print("[PowerBridge] INCOMING SHUTDOWN REQUEST FOR PROXMOX VE (jj) BY BAXOMS ROOT")
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
                    print(f"[PowerBridge] Proxmox SSH poweroff dispatched: code={res.returncode}")
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

            print("[PowerBridge] INCOMING SHUTDOWN REQUEST FOR RASPBERRY PI (NodeR) BY BAXOMS ROOT")
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
    print(f"[PowerBridge] Listening on 0.0.0.0:{PORT} with BaXoMs Root security & Eco Scheduler...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[PowerBridge] Stopped.")
