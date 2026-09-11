# ⚡ NodeR · Fireman Dashboard & SOC/NOC Ecosystem

Centro de comando, telemetría y observabilidad unificada para el Homelab y entorno **Fireman**, diseñado para correr en el nodo edge **Raspberry Pi 4 (`NodeR`)** y conectar con el hipervisor **Proxmox VE (`jj`)**, **Wazuh SOC** y **Tenable Nessus**.

---

## 📸 Diseño de Pantalla Única

El dashboard implementa una interfaz de alta fidelidad, modo oscuro profundo (`#060911`), acentos cian/verde/coral y sin scroll vertical en monitores de control:

1. **KPIs Ejecutivos (Top)**:
   - **Proxmox**: Estado en tiempo real (`online`).
   - **Alertas Wazuh (24h)**: Contador de eventos de seguridad (`37`).
   - **Vulns Nessus**: Criticidad de vulnerabilidades activas (`12 crit`).
   - **Uptime NodeR**: Disponibilidad del nodo edge (`99.8%`).
2. **Telemetría y Analítica (Mid)**:
   - **Tráfico de Red por VLANs (últimas 12h)**: Curvas Bézier fluidas con gradientes para `CORP + Servers` y `BYOD + CCTV`.
   - **Vulns por VLAN**: Gráfico de barras categorizado (`V10`, `V20`, `V40`, `V50`).
3. **Lanzadera de Servicios (Bottom)**:
   - Accesos directos y diagnóstico a **Proxmox**, **Wazuh**, **Nessus**, **Watchtower** y **CCTV/IoT**.

---

## 🚀 Opción 1: Aplicación Web Dedicada (Recomendada)

Construida con HTML5 moderno, CSS3 con tokens de diseño custom y JavaScript Vanilla optimizado con gráficos vectoriales SVG interactivos.

### Características:
- **Consumo mínimo de memoria**: Menos de **25 MB de RAM** en la Raspberry Pi.
- **Docker Ready**: Imagen Alpine Nginx ultra liviana.
- **Sin paso de compilación pesado**: Se ejecuta al instante.

### Despliegue con Docker Compose:
```bash
docker compose up -d --build
```
El servicio quedará escuchando en el puerto **`3005`** (`http://100.120.34.14:3005` o `http://192.168.0.200:3005`).

---

## 📦 Opción 2: Stack Declarativo con `gethomepage`

Si preferís la suite comunitaria de [Homepage](https://gethomepage.dev), tenés los archivos listos en la carpeta `homepage-yaml/`:

```bash
cd homepage-yaml
docker compose up -d
```
Incluye:
- `settings.yaml`: Configuración de temas y layout por filas.
- `services.yaml`: Todos los servicios del homelab mapeados a sus IPs de Tailscale y LAN.
- `widgets.yaml`: Monitoreo de CPU, RAM, disco y uptime.
- `docker.yaml`: Integración directa con el socket de Docker local `/var/run/docker.sock`.
- `custom.css`: Tema oscuro cian adaptado al diseño Fireman.

---

## 📱 Aplicación Móvil con Expo Go (`fireman-dashboard-mobile`)

Ubicada en la carpeta `fireman-dashboard-mobile/`.

### Características:
- **Autenticación Biométrica**: Bloqueo con Face ID / Touch ID / Huella dactilar mediante `expo-local-authentication`.
- **Contenedor WebView Fluido**: Carga el dashboard a pantalla completa con soporte de Pull-to-Refresh y navegación por gestos.
- **Selector Rápido de Servidor**: Modal nativo para alternar entre IP de Tailscale (`100.120.34.14:3005`) e IP de Red Local (`192.168.0.200:3005`).

### Cómo ejecutar en el celular:
```bash
cd fireman-dashboard-mobile
npm install
npx expo start
```
Abrí la app **Expo Go** en tu smartphone (Android o iOS) y escaneá el código QR que aparece en la terminal.

---

## 🗺️ Mapa de Infraestructura y Conectividad

| Servicio | Host | IP Tailscale | IP Red Local | Puerto |
| :--- | :--- | :--- | :--- | :--- |
| **Fireman Dashboard** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:3005` |
| **Proxmox VE** | `jj` | `100.77.123.25` | `192.168.0.104` | `:8006` |
| **Wazuh SOC** | Red Core | — | `10.10.60.88` | `:443` |
| **Tenable Nessus** | `jj` (VM 107) | — | `10.10.60.88` | `:8834` |
| **Portainer** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:9000` |
| **AdGuard Home** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:3000` |
| **Uptime Kuma** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:3001` |
| **Vaultwarden** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:8080` |
| **Nginx Proxy Mgr** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:81` |
