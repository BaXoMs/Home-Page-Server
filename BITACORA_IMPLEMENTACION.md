# 📋 Bitácora Completa de Implementación y Auditoría de Infraestructura
**Proyecto**: Home-Page-Server & Homelab Architecture  
**Fecha de corte**: Septiembre 2026  
**Responsable Técnico**: Senior Systems Architect & DevSecOps  

---

## 1. 🎯 Objetivos y Alcance

El trabajo consistió en desmantelar las simulaciones ficticias previas (antiguo mockup "Fireman" con VLANs y alertas inventadas) y construir una **plataforma real de observabilidad, control y gestión de infraestructura propia**, combinando hardware físico, virtualización, contenedores y proyectos en desarrollo.

### Principios Fundamentales Aplicados
1. **Verdad en la Telemetría**: Cero datos simulados o engañosos. Cada IP, puerto, máquina virtual y contenedor refleja la topología física y lógica activa.
2. **Eficiencia Energética (Edge vs Compute)**:
   - **Nodo Edge 24/7 (`NodeR` - Raspberry Pi 4, ~5W)**: Resuelve DNS (AdGuard), proxy inverso (NPM), panel unificado (Home-Page-Server), monitoreo liviano (Uptime Kuma, Watchtower) y alojamiento de proyectos personales livianos (`ReceApp`, `AppFinanzas`).
   - **Hipervisor On-Demand (`jj` - Proxmox VE, ~50W)**: Encendido cuando se requiere cómputo pesado: LLMs con aceleración GPU (Ollama + GTX 1650 Super), entornos virtualizados anidados (macOS Docker-OSX) y escaneos profundos de seguridad (Tenable Nessus VM 107).
3. **No a la Inmediatez / Solidez en la Base**: Configuración adecuada del kernel Linux (Swapiness, resolv.conf, drivers VFIO) antes de montar servicios de capa superior.

---

## 2. 🖧 Auditoría y Configuración de Servidores Físicos

### A. Hipervisor Proxmox VE (`jj`)
* **Hardware**: Intel Core i5-8400 (6 Cores / 6 Threads), 16 GB DDR4 RAM, NVIDIA GeForce GTX 1650 SUPER.
* **Acceso**: `root@100.77.123.25` (Tailscale) / `192.168.0.104` (LAN).
* **Acciones Ejecutadas**:
  1. **Auditoría de API Token**: Se verificó el token de auditoría de solo lectura `homepage-monitor@pve!fireman-token` con rol `PVEAuditor` para consumo seguro de métricas.
  2. **Creación y aprovisionamiento de VM 107 (`Nessus-Scanner`)**:
     - 2 vCPUs, 4096 MB RAM (con memoria dinámica `balloon: 2048`), 32 GB de disco virtual.
     - ISO de Ubuntu 22.04 montada y lista para despliegue de Tenable Nessus (`:8834`).
  3. **Auditoría de VM 106 (`Ollama-Qwen`) & Docker macOS**:
     - **Passthrough PCIe**: Se confirmó el aislamiento de la GPU física (`0000:01:00.0` y `0000:01:00.1`) con `vfio-pci` para aceleración directa de inferencia en modelos de IA.
     - **Virtualización Anidada**: Configurado con `cpu: host` indispensable para ejecutar contenedores QEMU/KVM de macOS (`Docker-OSX`).
     - **Regla de exclusión mutua**: No encender VM 100 (`PopOs`) y VM 106 simultáneamente si ambas reclaman la misma GPU física.
  4. **LXC 200 (`coolify`)**:
     - Contenedor Coolify PaaS (`:8000`) con motor Traefik interno, n8n (`:5678`), PostgreSQL y Redis.

---

### B. Nodo Edge Raspberry Pi 4 Model B (`NodeR`)
* **Hardware**: Broadcom BCM2711 Cortex-A72 (4 Cores), 4 GB LPDDR4, 256 GB SSD.
* **Acceso**: `admin@100.120.34.14` (Tailscale) / `192.168.0.200` (LAN).
* **Acciones Ejecutadas**:
  1. **Configuración de SWAP Persistente**:
     - Se crearon **2 GB de Swap** en `/swapfile` para proteger el nodo contra OOM (Out Of Memory) por picos de Docker.
     - Se optimizó el kernel con `vm.swappiness = 10` persistente en `/etc/sysctl.d/99-swappiness.conf`.
  2. **Estabilidad de DNS Perimetral**:
     - Se corrigió `/etc/resolv.conf` agregando servidores upstream (`1.1.1.1` y `8.8.8.8`) evitando que la Pi pierda resolución cuando AdGuard se reinicia.
  3. **Corrección de Puerto de AdGuard Home**:
     - Se descubrió que el puerto `3000` correspondía únicamente al asistente de configuración inicial (reseteando conexiones).
     - El portal web real y activo se diagnosticó y enlazó al puerto **`8088`** (`http://192.168.0.200:8088`).
  4. **Seguridad y Actualizaciones Automáticas**:
     - Despliegue de **Watchtower** en modo monitor/auditoría (`monitor-only`) para detectar imágenes desactualizadas sin romper servicios en producción.
     - Script automatizado de escaneo de vulnerabilidades con **Tenable Trivy** en `/home/admin/watchtower/trivy-scan.sh`.

---

## 3. 💻 Desarrollo del Nuevo Home-Page-Server

Se reescribió por completo la aplicación web ubicada en `/home/baxoms/Documentos/BaXoMs-Workflow/Home-Page-Server`:

### Componentes y Estructura
* **`index.html`**:
  - Arquitectura Single Page Application (SPA) con selector de 6 pantallas:
    1. **Tráfico & Resumen**: Telemetría de red con curvas Bézier interactivas en SVG, métricas de ancho de banda y widget con el estado detallado de VMs y contenedores.
    2. **Proxmox VE (`jj`)**: Vista de host, recursos consumidos, tabla de todas las VMs/LXCs (100 a 200) y consola embebida.
    3. **Red & Seguridad (Router Archer C50 + Nessus)**: Panel del router (`192.168.0.1`), bandas WiFi 2.4/5 GHz y estado del escáner Tenable Nessus.
    4. **Raspberry Pi (`NodeR`)**: Métricas de consumo de energía (~5W), swap, estado de contenedores Docker (`AdGuard`, `NPM`, `Portainer`, `Uptime Kuma`, `Vaultwarden`, `Watchtower`).
    5. **Mis Proyectos (Dev Hub)**: Portal centralizado para proyectos locales (`ReceApp`, `AppFinanzas`, `Terreno Store`, `Aplicación Desk Linux`).
    6. **Directorio de Servicios**: Tabla de acceso rápido con URLs duales (Tailscale y LAN).
  - **In-App Workspace Modal (`#modal-workspace`)**: Modal flotante con iframe integrado y fallback directo ("Abrir en pestaña nueva") para consolas con cabeceras restrictivas `X-Frame-Options`.
* **`styles.css`**: Paleta estética Dark Slate (`#060911`, `#0e1626`, `#121c32`), bordes de brillo sutil, acentos cian/neón y tipografía moderna Inter/JetBrains Mono.
* **`app.js`**: Enrutador de vistas dinámico, simulación fluida de curva Bézier SVG con variación algorítmica y control de modales.
* **`Dockerfile` & `docker-compose.yml`**: Contenedor Nginx Alpine optimizado, sirviendo en el puerto **`3005`** en la Raspberry Pi.

---

## 4. 🔍 Investigación de Fuentes de Actualización y Vulnerabilidades

Para responder a la necesidad de mantener actualizados todos los sistemas (Linux, Proxmox, VMs Ubuntu/AlmaLinux, Ollama, macOS en Docker y contenedores), se diseñó la siguiente matriz de fuentes y mecanismos de detección:

| Entorno / Servicio | Tipo | Fuente Oficial de Novedades / Versiones | Cómo verificar actualizaciones | Detección de Vulnerabilidades |
| :--- | :--- | :--- | :--- | :--- |
| **Proxmox VE (`jj`)** | Hipervisor Debian | [Proxmox Roadmap & Release Notes](https://pve.proxmox.com/wiki/Roadmap) y repos `pve-no-subscription` | `apt update && apt list --upgradable` vía SSH o API de Proxmox | [Debian Security Bug Tracker](https://security-tracker.debian.org/) y CVEs de Proxmox |
| **Ubuntu Server (VMs 102, 107)** | S.O. Linux | [Ubuntu Release Notes](https://wiki.ubuntu.com/Releases) y `archive.ubuntu.com` | `apt update && apt list --upgradable` | [Ubuntu Security Notices (USN)](https://ubuntu.com/security/notices) |
| **AlmaLinux (VMs RHEL-based)** | S.O. Linux | [AlmaLinux Errata / Release Notes](https://errata.almalinux.org/) | `dnf check-update` | [AlmaLinux Security Advisory (ALSA)](https://errata.almalinux.org/) y OVAL/OSCAL feeds |
| **Ollama (`VM 106`)** | Binario / Daemon IA | [GitHub Releases: `ollama/ollama`](https://github.com/ollama/ollama/releases) | Endpoint HTTP `GET /api/version` contra la versión más reciente en GitHub API | GitHub Security Advisories en el repositorio oficial |
| **macOS en Docker (`Docker-OSX`)** | QEMU Container | [GitHub: `sickcodes/Docker-OSX`](https://github.com/sickcodes/Docker-OSX) | Docker Hub tags (`sickcodes/docker-osx:latest`) y releases de sickcodes | Escaneo de capas con Trivy / Grype |
| **AdGuard Home** | Contenedor Docker | [GitHub Releases: `AdguardTeam/AdGuardHome`](https://github.com/AdguardTeam/AdGuardHome/releases) | API AdGuard `/control/version.json` o GitHub Releases API | GitHub Dependabot & CVEs en CVE Details |
| **Contenedores Docker en NodeR** | Apps Docker | Docker Hub Registry & GitHub Releases de cada vendor (Portainer, Vaultwarden, etc.) | **Watchtower** (`monitor-only`) informando contenedores con imágenes nuevas | **Trivy** escaneando imágenes locales buscando CVEs conocidos |

---

## 5. 🗺️ Tabla Consolidada de Acceso a la Infraestructura

| Servicio | Servidor Físico / Nodo | IP Tailscale | IP Red Local | Puerto | Estado Operativo |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Home-Page-Server** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:3005` | 🟢 Activo (Docker) |
| **Router TP-Link Archer C50**| Físico | — | `192.168.0.1` | `:80` | 🟢 En línea |
| **Proxmox VE Web UI** | `jj` | `100.77.123.25` | `192.168.0.104` | `:8006` | 🟢 Activo |
| **Coolify PaaS** | `jj` (LXC 200) | `100.120.169.85` | `192.168.0.112` | `:8000` | 🟢 Activo |
| **Portainer CE** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:9000` | 🟢 Activo (Docker) |
| **AdGuard Home** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:8088` / `:53` | 🟢 Activo (Web UI en `:8088`) |
| **Nginx Proxy Manager** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:81` | 🟢 Activo (Docker) |
| **Uptime Kuma** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:3001` | 🟢 Activo (Docker) |
| **Vaultwarden** | `NodeR` (Pi 4) | `100.120.34.14` | `192.168.0.200` | `:8080` | 🟢 Activo (Docker) |
| **Tenable Nessus** | `jj` (VM 107) | `100.77.123.25` | `192.168.0.104` | `:8834` | 🟡 Pendiente config final |
| **Ollama + Qwen** | `jj` (VM 106) | `100.77.123.25` | `192.168.0.104` | `:11434` | 🟢 Aprovisionado (GTX 1650S) |

---

## 6. 📌 Próximos Pasos Recomendados

1. **Automatización de Notificaciones de Actualizaciones**: Integrar llamadas livianas del frontend hacia la GitHub API (`/repos/:owner/:repo/releases/latest`) para mostrar insignias "Update Available" en AdGuard, Ollama y Portainer.
2. **Reverse Proxy SSL con Nginx Proxy Manager**: Configurar un dominio interno con certificado SSL local hacia `192.168.0.200:3005` y `192.168.0.112:8000` para suprimir alertas de seguridad del navegador y Malwarebytes.
3. **Despliegue Continuo de Proyectos**: Montar `ReceApp` y `AppFinanzas` en contenedores ligeros de Docker directamente en la Raspberry Pi para disponibilidad permanente con mínimo consumo.
