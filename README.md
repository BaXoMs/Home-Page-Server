# ⚡ Home-Page-Server · Control Center & Homelab Infrastructure

Centro de comando, telemetría y observabilidad unificada para infraestructura propia. Integra el nodo perimetral edge **Raspberry Pi 4 (`NodeR`)** con el hipervisor de cómputo y virtualización **Proxmox VE (`jj`)**, el router **TP-Link Archer C50** y el catálogo de proyectos y aplicaciones personales.

---

## 🏛️ Arquitectura Modular Multi-Pantalla

Diseñado como una Single Page Application (SPA) responsiva dividida en **6 vistas dedicadas**:

1. **📊 Tráfico & Resumen de Red (Dashboard Principal)**:
   * Recibe con telemetría de ancho de banda en tiempo real (Download / Upload Mbps con curvas Bézier interactivas).
   * Estado resumido de salud de **Proxmox (`jj`)** y **Raspberry Pi (`NodeR`)**.
2. **🖧 Servidor Proxmox VE (`jj`)**:
   * Telemetría de hardware (Intel Core i5-8400, 16 GB RAM, almacenamiento).
   * Tabla interactiva de Máquinas Virtuales (QEMU) y Contenedores (LXC) con sus IDs (`200 coolify`, `102 opnsense`, `107 Nessus-Scanner`, `106 Ollama-Qwen`, `100 PopOs`, etc.), estado operativo y asignación de recursos.
   * **Visor de Consola Integrada**: Abre la consola de Proxmox en un marco interno dentro del dashboard.
3. **🛡️ Red & Router TP-Link Archer C50**:
   * Control y acceso al panel de gestión del router principal (`192.168.0.1`).
   * Estado del escáner Tenable Nessus (VM 107 en Proxmox).
   * Información de bandas WiFi (2.4 GHz / 5 GHz) y rango DHCP.
4. **🍓 Raspberry Pi 4 (`NodeR`) — Nodo Edge 24/7**:
   * Métricas de hardware de bajo consumo (~5W): Cortex-A72, 4 GB RAM + 2 GB Swap, 256 GB SSD.
   * Cuadrícula de servicios Docker locales (`AdGuard Home :8088`, `Nginx Proxy Manager :81`, `Portainer :9000`, `Uptime Kuma :3001`, `Vaultwarden :8080`, `Watchtower`).
5. **💼 Mis Proyectos & Aplicaciones (Dev Hub)**:
   * Catálogo de aplicaciones propias listas para alojarse en la Raspberry Pi 24/7 (evitando encender Proxmox innecesariamente):
     * **ReceApp**: Sistema de recetas y costeo (React / TypeScript / FastAPI).
     * **AppFinanzas**: Gestión presupuestaria y finanzas personales.
     * **Terreno Store**: Plataforma e-commerce / catálogo de productos.
     * **Aplicación Desk Linux**: Herramientas y scripts nativos de automatización.
6. **🌐 Directorio de Accesos**:
   * Tabla consolidada de accesos rápidos por Tailscale (remoto) y Red Local (LAN).

---

## 🖥️ Visor de Consola Integrada (Embedded Workspace)

El dashboard cuenta con un modal de trabajo integrado (`#modal-workspace`) que permite visualizar los paneles de administración directamente sin cambiar de pestaña, con botón de recarga rápida y enlace alternativo para navegadores que restringen cabeceras `X-Frame-Options`.

---

## 🚀 Despliegue con Docker Compose

```bash
docker compose up -d --build
```
El panel queda disponible en el puerto **`3005`**:
* Por Tailscale: `http://100.120.34.14:3005`
* Por Red Local: `http://192.168.0.200:3005`

---

## 🗺️ Mapa de Infraestructura y Servicios

| Servicio | Servidor Físico / Nodo | IP Tailscale | IP Red Local | Puerto |
| :--- | :--- | :--- | :--- | :--- |
| **Home-Page-Server** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:3005` |
| **Router TP-Link Archer C50** | Gateway Físico | — | `192.168.0.1` | `:80` |
| **Consola Proxmox** | `jj` | `100.77.123.25` | `192.168.0.104` | `:8006` |
| **Coolify PaaS** | `jj` (LXC 200) | `100.120.169.85` | `192.168.0.112` | `:8000` |
| **Portainer CE** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:9000` |
| **AdGuard Home** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:8088` / `:53` |
| **Nginx Proxy Mgr** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:81` |
| **Uptime Kuma** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:3001` |
| **Vaultwarden** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:8080` |
| **Tenable Nessus** | `jj` (VM 107) | `100.77.123.25` | `192.168.0.104` | `:8834` |
