# ⚡ Home-Page-Server · Control Center & Homelab Infrastructure

Centro de comando, telemetría y observabilidad unificada para infraestructura propia. Integra el nodo perimetral edge **Raspberry Pi 4 (`NodeR`)** con el hipervisor de cómputo y virtualización **Proxmox VE (`jj`)**.

---

## 🏛️ Arquitectura Multi-Pantalla

El sistema está diseñado como una aplicación web modular (SPA) dividida en 4 áreas funcionales para evitar pantallas saturadas:

1. **📊 Tráfico & Resumen de Red (Dashboard Principal)**:
   * Recibe con telemetría de ancho de banda en tiempo real (Download / Upload Mbps, picos y latencia).
   * Estado resumido de salud de **Proxmox (`jj`)** y **Raspberry Pi (`NodeR`)**.
2. **🖧 Servidor Proxmox VE (`jj`)**:
   * Telemetría de hardware (Intel Core i5-8400, 16 GB RAM, almacenamiento).
   * Tabla interactiva de Máquinas Virtuales (QEMU) y Contenedores (LXC) con sus IDs (`200 coolify`, `102 opnsense`, `107 Nessus-Scanner`, `106 Ollama-Qwen`, `100 PopOs`, etc.), estado operativo y asignación de recursos.
3. **🍓 Raspberry Pi 4 (`NodeR`)**:
   * Estado de recursos del nodo edge (Cortex-A72, 4 GB RAM + 2 GB Swap, 256 GB SSD).
   * Cuadrícula de servicios Docker locales (`AdGuard Home`, `Nginx Proxy Manager`, `Portainer`, `Uptime Kuma`, `Vaultwarden`, `Watchtower`).
4. **🌐 Directorio de Servicios Web**:
   * Tabla consolidada de accesos rápidos por Tailscale (remoto seguro) y Red Local (LAN).

---

## 🚀 Despliegue con Docker Compose

```bash
docker compose up -d --build
```
El panel queda disponible en el puerto **`3005`**:
* Por Tailscale: `http://100.120.34.14:3005`
* Por Red Local: `http://192.168.0.200:3005`

---

## 🗺️ Mapa de Infraestructura

| Servicio | Servidor Físico | IP Tailscale | IP Red Local | Puerto |
| :--- | :--- | :--- | :--- | :--- |
| **Home-Page-Server** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:3005` |
| **Consola Proxmox** | `jj` | `100.77.123.25` | `192.168.0.104` | `:8006` |
| **Coolify PaaS** | `jj` (LXC 200) | `100.120.169.85` | `192.168.0.112` | `:8000` |
| **n8n Automation** | `jj` (LXC 200) | `100.120.169.85` | `192.168.0.112` | `:5678` |
| **Portainer CE** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:9000` |
| **AdGuard Home** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:3000` |
| **Nginx Proxy Mgr** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:81` |
| **Uptime Kuma** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:3001` |
| **Vaultwarden** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:8080` |
