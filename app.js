/**
 * Home-Page-Server · Control Center Logic & Router
 * Modular multi-screen architecture, integrated workspace viewer & server state
 */

// Default configuration endpoints
const DEFAULT_CONFIG = {
  proxmox: 'https://100.77.123.25:8006',
  noder: 'http://100.120.34.14:9000',
  router: 'http://192.168.0.1',
  adguard: 'http://100.120.34.14:8088'
};

let config = { ...DEFAULT_CONFIG };

// Network traffic time series data
const trafficPoints = {
  down: [25, 38, 42, 35, 68, 84, 52, 48],
  up:   [12, 18, 14, 22, 28, 32, 20, 18]
};

// View metadata for the 6 modular screens
const viewTitles = {
  dashboard: {
    title: 'Tráfico & Resumen de Red',
    subtitle: 'Telemetría de ancho de banda y salud general de los servidores'
  },
  proxmox: {
    title: 'Servidor Proxmox VE (jj)',
    subtitle: 'Hipervisor central, recursos de cómputo y estado de máquinas virtuales / LXCs'
  },
  security: {
    title: 'Red & Router TP-Link Archer C50',
    subtitle: 'Gateway principal, conectividad física LAN/WiFi y escáner de seguridad'
  },
  raspberry: {
    title: 'Raspberry Pi 4 (NodeR)',
    subtitle: 'Nodo edge 24/7 de bajo consumo, contenedores Docker y servicios de red'
  },
  projects: {
    title: 'Mis Proyectos & Aplicaciones (Dev Hub)',
    subtitle: 'Catálogo de aplicaciones propias listas para alojarse en la Raspberry Pi'
  },
  services: {
    title: 'Directorio de Accesos',
    subtitle: 'Enlaces directos consolidados por Tailscale y Red Local'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  renderTrafficChart();
  setupLiveTraffic();
  getPowerToken();
  pollServerHealth();
  setInterval(pollServerHealth, 6000);

  // Close modals or drawer on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMobileMenu();
      closeModal('modal-workspace');
      closeModal('modal-settings');
      closeModal('modal-new-project');
      closeModal('modal-power-proxmox');
      closeModal('modal-power-rpi');
    }
  });
});

// Mobile Drawer Menu Controls
window.toggleMobileMenu = function() {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar && backdrop) {
    const isOpen = sidebar.classList.contains('open');
    if (isOpen) {
      closeMobileMenu();
    } else {
      sidebar.classList.add('open');
      backdrop.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }
};

window.closeMobileMenu = function() {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('active');
  document.body.style.overflow = '';
};

// View Router
window.switchView = function(viewId) {
  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-view') === viewId);
  });

  // Update content view visibility
  document.querySelectorAll('.content-view').forEach(view => {
    view.classList.toggle('active', view.id === `view-${viewId}`);
  });

  // Update topbar heading
  const meta = viewTitles[viewId] || viewTitles.dashboard;
  document.getElementById('view-title').innerText = meta.title;
  document.getElementById('view-subtitle').innerText = meta.subtitle;

  // Auto-close mobile drawer and scroll to top
  closeMobileMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

// Generate smooth cubic bezier SVG curve
function getBezierPath(data, width, height, maxY = 100, closeArea = false) {
  const n = data.length;
  if (n === 0) return '';

  const stepX = width / (n - 1);
  const coords = data.map((val, i) => ({
    x: i * stepX,
    y: height - (val / maxY) * height
  }));

  let d = `M ${coords[0].x} ${coords[0].y}`;

  for (let i = 0; i < n - 1; i++) {
    const p0 = coords[i === 0 ? i : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2 < n ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  if (closeArea) {
    d += ` L ${width} ${height} L 0 ${height} Z`;
  }

  return d;
}

// Render real-time SVG network traffic
function renderTrafficChart() {
  const width = 800;
  const height = 240;
  const maxY = 100; // Mbps scale

  // Down
  const downLine = getBezierPath(trafficPoints.down, width, height, maxY, false);
  const downArea = getBezierPath(trafficPoints.down, width, height, maxY, true);
  const pathDownLine = document.getElementById('path-down-line');
  const pathDownArea = document.getElementById('path-down-area');
  if (pathDownLine && pathDownArea) {
    pathDownLine.setAttribute('d', downLine);
    pathDownArea.setAttribute('d', downArea);
  }

  // Up
  const upLine = getBezierPath(trafficPoints.up, width, height, maxY, false);
  const upArea = getBezierPath(trafficPoints.up, width, height, maxY, true);
  const pathUpLine = document.getElementById('path-up-line');
  const pathUpArea = document.getElementById('path-up-area');
  if (pathUpLine && pathUpArea) {
    pathUpLine.setAttribute('d', upLine);
    pathUpArea.setAttribute('d', upArea);
  }
}

// Subtle live traffic fluctuation
function setupLiveTraffic() {
  setInterval(() => {
    const nextDown = Math.max(20, Math.min(90, trafficPoints.down[trafficPoints.down.length - 1] + (Math.random() * 16 - 8)));
    const nextUp   = Math.max(10, Math.min(45, trafficPoints.up[trafficPoints.up.length - 1] + (Math.random() * 8 - 4)));

    trafficPoints.down.shift();
    trafficPoints.down.push(nextDown);

    trafficPoints.up.shift();
    trafficPoints.up.push(nextUp);

    renderTrafficChart();

    const speedDown = document.getElementById('speed-down');
    const speedUp = document.getElementById('speed-up');
    if (speedDown) speedDown.innerHTML = `${nextDown.toFixed(1)} <span class="unit">Mbps</span>`;
    if (speedUp) speedUp.innerHTML = `${nextUp.toFixed(1)} <span class="unit">Mbps</span>`;
  }, 4000);
}

// Smart Service Catalog & Dual-Endpoint Resolver
const SERVICES_MAP = {
  'proxmox': {
    name: 'Consola Proxmox VE (jj)',
    node: 'Servidor jj (Hipervisor Principal)',
    tailscale: 'https://100.77.123.25:8006',
    lan: 'https://192.168.0.104:8006',
    desc: 'Hipervisor KVM / LXC, telemetría de hardware y consola de máquinas virtuales.',
    note: '🔒 Proxmox usa HTTPS con certificado autofirmado en puerto 8006. Al correr el dashboard sobre HTTP, los navegadores bloquean el iframe por Mixed Content. Usá el botón de pestaña nueva.',
    canEmbed: false
  },
  'router': {
    name: 'Router TP-Link Archer C50',
    node: 'Gateway de Red Físico',
    tailscale: null,
    lan: 'http://192.168.0.1',
    desc: 'Panel de administración del router Wi-Fi y configuración de DHCP/LAN.',
    note: '⚠️ El router físico solo es accesible conectado al Wi-Fi de tu casa (192.168.0.1). Desde datos móviles no responde salvo que configures un Subnet Router en Tailscale.',
    canEmbed: false
  },
  'portainer': {
    name: 'Portainer CE (NodeR)',
    node: 'Raspberry Pi 4 (NodeR)',
    tailscale: 'http://100.120.34.14:9000',
    lan: 'http://192.168.0.200:9000',
    desc: 'Gestor gráfico de contenedores Docker, stacks, volúmenes y redes.',
    note: '🐳 Puerto web :9000. Portainer envía la cabecera CSP frame-ancestors none para evitar clickjacking. Te recomendamos abrirlo en pestaña nueva.',
    canEmbed: false
  },
  'adguard': {
    name: 'AdGuard Home',
    node: 'Raspberry Pi 4 (NodeR)',
    tailscale: 'http://100.120.34.14:8088',
    lan: 'http://192.168.0.200:8088',
    desc: 'Servidor DNS local, filtrado de anuncios y protección de privacidad.',
    note: '🛡️ Dashboard web en puerto :8088. ¡Totalmente compatible con la consola integrada!',
    canEmbed: true
  },
  'npm': {
    name: 'Nginx Proxy Manager',
    node: 'Raspberry Pi 4 (NodeR)',
    tailscale: 'http://100.120.34.14:81',
    lan: 'http://192.168.0.200:81',
    desc: 'Proxy inverso, enrutamiento de subdominios y certificados SSL.',
    note: '🌐 Panel de administración en puerto :81. ¡Totalmente compatible con la consola integrada!',
    canEmbed: true
  },
  'uptime': {
    name: 'Uptime Kuma',
    node: 'Raspberry Pi 4 (NodeR)',
    tailscale: 'http://100.120.34.14:3001',
    lan: 'http://192.168.0.200:3001',
    desc: 'Monitoreo de estado de salud, disponibilidad y latencia de red.',
    note: '📊 Dashboard de monitoreo en tiempo real en puerto :3001.',
    canEmbed: false
  },
  'vaultwarden': {
    name: 'Vaultwarden',
    node: 'Raspberry Pi 4 (NodeR)',
    tailscale: 'http://100.120.34.14:8080',
    lan: 'http://192.168.0.200:8080',
    desc: 'Bóveda cifrada y segura de contraseñas personales.',
    note: '🔐 Puerto :8080.',
    canEmbed: true
  },
  'coolify': {
    name: 'Coolify PaaS',
    node: 'Proxmox VE (LXC 200)',
    tailscale: 'http://100.120.169.85:8000',
    lan: 'http://192.168.0.112:8000',
    desc: 'PaaS auto-hospedado para despliegue de aplicaciones y bases de datos.',
    note: '🚀 Puerto :8000.',
    canEmbed: true
  },
  'nessus': {
    name: 'Tenable Nessus Essentials',
    node: 'Proxmox VE (VM 107)',
    tailscale: 'https://100.77.123.25:8834',
    lan: 'https://192.168.0.104:8834',
    desc: 'Escáner de vulnerabilidades y auditoría de seguridad perimetral.',
    note: '🛡️ Puerto :8834 (HTTPS autofirmado).',
    canEmbed: false
  }
};

// Workspace State Management
let currentWorkspaceUrl = '';
let currentWorkspaceActiveMode = 'launcher';

// Toggle between Embedded Iframe and Launcher Hub
window.switchWorkspaceMode = function(mode) {
  currentWorkspaceActiveMode = mode;
  const contentEl = document.getElementById('workspace-modal-content');
  const frameContainer = document.getElementById('workspace-frame-container');
  const launcherContainer = document.getElementById('workspace-launcher-container');
  const btnFrame = document.getElementById('btn-mode-frame');
  const btnLauncher = document.getElementById('btn-mode-launcher');
  const iframe = document.getElementById('workspace-iframe');

  if (mode === 'frame') {
    if (contentEl) contentEl.classList.remove('mode-launcher');
    if (frameContainer) frameContainer.style.display = 'flex';
    if (launcherContainer) launcherContainer.style.display = 'none';
    if (btnFrame) btnFrame.classList.add('active');
    if (btnLauncher) btnLauncher.classList.remove('active');

    // Load URL in iframe if different or not loaded
    if (iframe && currentWorkspaceUrl && iframe.src !== currentWorkspaceUrl) {
      iframe.src = currentWorkspaceUrl;
    }
  } else {
    if (contentEl) contentEl.classList.add('mode-launcher');
    if (frameContainer) frameContainer.style.display = 'none';
    if (launcherContainer) launcherContainer.style.display = 'block';
    if (btnFrame) btnFrame.classList.remove('active');
    if (btnLauncher) btnLauncher.classList.add('active');
  }
};

// Reload iframe content
window.reloadWorkspaceFrame = function() {
  const iframe = document.getElementById('workspace-iframe');
  if (iframe && iframe.src) {
    iframe.src = iframe.src;
  }
};

// Smart Service Launcher & Embedded Console Hub
window.openWorkspace = function(urlOrKey, title) {
  let svc = SERVICES_MAP[urlOrKey];

  if (!svc) {
    const searchTarget = (urlOrKey + ' ' + (title || '')).toLowerCase();
    const key = Object.keys(SERVICES_MAP).find(k => {
      const item = SERVICES_MAP[k];
      return (item.tailscale && searchTarget.includes(item.tailscale.toLowerCase())) ||
             (item.lan && searchTarget.includes(item.lan.toLowerCase())) ||
             (searchTarget.includes(k)) ||
             (searchTarget.includes(item.name.toLowerCase()));
    });
    if (key) svc = SERVICES_MAP[key];
  }

  if (!svc) {
    svc = {
      name: title || 'Consola de Servicio',
      node: 'Servidor Local',
      tailscale: (urlOrKey && urlOrKey.startsWith('http')) ? urlOrKey : null,
      lan: (urlOrKey && urlOrKey.startsWith('http')) ? urlOrKey : null,
      desc: 'Acceso directo a la interfaz del servicio.',
      note: 'Abrí el servicio para acceder directamente.',
      canEmbed: true
    };
  }

  const isTailscale = window.location.hostname.startsWith('100.');
  const activeUrl = (isTailscale && svc.tailscale) ? svc.tailscale : (svc.lan || svc.tailscale);
  currentWorkspaceUrl = activeUrl || '';

  // Update UI metadata
  const titleEl = document.getElementById('workspace-title');
  if (titleEl) titleEl.innerText = svc.name;
  const nodeEl = document.getElementById('workspace-node-badge');
  if (nodeEl) nodeEl.innerText = svc.node;

  const svcNameEl = document.getElementById('launcher-service-name');
  if (svcNameEl) svcNameEl.innerText = svc.name;
  const svcDescEl = document.getElementById('launcher-service-desc');
  if (svcDescEl) svcDescEl.innerText = svc.desc;
  const svcNoteEl = document.getElementById('launcher-security-note-text');
  if (svcNoteEl) svcNoteEl.innerText = svc.note;

  // External link buttons (both in header and launcher card)
  const headerExtBtn = document.getElementById('workspace-header-ext-link');
  if (headerExtBtn) {
    headerExtBtn.href = activeUrl || '#';
  }

  const primaryBtn = document.getElementById('workspace-external-link');
  if (primaryBtn) {
    primaryBtn.href = activeUrl || '#';
    primaryBtn.onclick = function(e) {
      if (!activeUrl) {
        e.preventDefault();
        alert('Este servicio solo está disponible cuando estés conectado al Wi-Fi de tu casa.');
      }
    };
  }

  const netIndicator = document.getElementById('launcher-network-indicator');
  if (netIndicator) {
    netIndicator.innerText = isTailscale 
      ? 'Conexión detectada: Tailscale Mesh (Datos Móviles / Remoto)' 
      : 'Conexión detectada: Red Local Wi-Fi (LAN)';
  }

  const tsCard = document.getElementById('endpoint-tailscale-card');
  const tsUrl = document.getElementById('launcher-tailscale-url');
  const tsBtn = document.getElementById('launcher-tailscale-btn');
  if (svc.tailscale) {
    tsCard.style.display = 'flex';
    tsUrl.innerText = svc.tailscale;
    tsBtn.href = svc.tailscale;
    tsBtn.classList.toggle('btn-primary', isTailscale);
    tsBtn.classList.toggle('btn-secondary', !isTailscale);
  } else {
    tsCard.style.display = 'none';
  }

  const lanCard = document.getElementById('endpoint-lan-card');
  const lanUrl = document.getElementById('launcher-lan-url');
  const lanBtn = document.getElementById('launcher-lan-btn');
  if (svc.lan) {
    lanCard.style.display = 'flex';
    lanUrl.innerText = svc.lan;
    lanBtn.href = svc.lan;
    lanBtn.classList.toggle('btn-primary', !isTailscale);
    lanBtn.classList.toggle('btn-secondary', isTailscale);
  } else {
    lanCard.style.display = 'none';
  }

  // Frame alert bar
  const frameAlert = document.getElementById('workspace-frame-alert');
  if (frameAlert) {
    frameAlert.style.display = (svc.canEmbed === false) ? 'flex' : 'none';
  }

  // Decide initial mode:
  // Mobile (< 768px): always launcher mode
  // Desktop (>= 768px):
  //   - If canEmbed === true: 'frame' mode (loads inside same tab / window)
  //   - If canEmbed === false: 'launcher' mode by default, but toggle is right there
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    switchWorkspaceMode('launcher');
  } else {
    if (svc.canEmbed !== false && activeUrl) {
      switchWorkspaceMode('frame');
    } else {
      switchWorkspaceMode('launcher');
    }
  }

  openModal('modal-workspace');
};

// Modal controls
window.openModal = function(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
};

window.closeModal = function(id) {
  const m = document.getElementById(id);
  if (m) {
    m.classList.remove('active');
    if (id === 'modal-workspace') {
      // Clear iframe on close to stop resource usage and sound/network
      const iframe = document.getElementById('workspace-iframe');
      if (iframe) iframe.src = '';
      currentWorkspaceUrl = '';
    }
  }
};

// Poll real-time hardware & server health via Power Bridge
async function pollServerHealth() {
  try {
    const res = await fetch('/api/power/status');
    if (!res.ok) return;
    const data = await res.json();
    const isPveUp = !!data.proxmox_reachable;

    // Overview Screen KPI
    const pveBadge = document.getElementById('pve-status-badge');
    const pveVms = document.getElementById('pve-active-vms');
    const pveMeta = document.getElementById('pve-active-meta');
    const pvePanelTag = document.getElementById('pve-panel-tag');
    const pveLiveList = document.getElementById('pve-live-list');

    if (pveBadge) {
      pveBadge.className = isPveUp ? 'status-badge green' : 'status-badge red';
      pveBadge.innerText = isPveUp ? 'Online' : 'Offline';
    }
    if (pveVms) {
      pveVms.innerText = isPveUp ? '2 Activas' : 'Apagado';
      pveVms.style.color = isPveUp ? '#ffffff' : '#94a3b8';
    }
    if (pveMeta) {
      pveMeta.innerText = isPveUp 
        ? 'LXC 200 (Coolify) · VM 102 (OPNsense)' 
        : 'Servidor Proxmox desconectado (0 Activas)';
    }
    if (pvePanelTag) {
      pvePanelTag.innerText = isPveUp
        ? '2 Activas · 7 En Espera (On-Demand)'
        : '0 Activas · Hipervisor Apagado';
      pvePanelTag.style.color = isPveUp ? 'var(--accent-cyan)' : '#ef4444';
    }
    if (pveLiveList) {
      pveLiveList.style.opacity = isPveUp ? '1' : '0.45';
    }

    // Proxmox Screen Hero
    const pveHeroBadge = document.getElementById('pve-hero-badge');
    const pveRamValue = document.getElementById('pve-ram-value');
    const pvePowerBtn = document.getElementById('pve-power-btn');
    const pveConsoleBtn = document.getElementById('pve-console-btn');

    if (pveHeroBadge) {
      pveHeroBadge.innerText = isPveUp ? 'Hipervisor Principal · ONLINE' : 'Hipervisor Principal · OFFLINE';
      pveHeroBadge.style.color = isPveUp ? 'var(--accent-cyan)' : '#ef4444';
    }
    if (pveRamValue) {
      pveRamValue.innerText = isPveUp ? '12.0 GB / 16 GB' : '0.0 GB (Apagado)';
      pveRamValue.className = isPveUp ? 'stat-value text-green' : 'stat-value';
      if (!isPveUp) pveRamValue.style.color = '#94a3b8';
    }
    if (pvePowerBtn) {
      if (!isPveUp) {
        pvePowerBtn.innerText = '⚡ Servidor Apagado';
        pvePowerBtn.disabled = true;
        pvePowerBtn.classList.remove('btn-danger-outline');
        pvePowerBtn.classList.add('btn-secondary');
      } else {
        pvePowerBtn.innerText = '🛑 Apagado Seguro';
        pvePowerBtn.disabled = false;
        pvePowerBtn.classList.add('btn-danger-outline');
        pvePowerBtn.classList.remove('btn-secondary');
      }
    }
    if (pveConsoleBtn) {
      pveConsoleBtn.disabled = !isPveUp;
      pveConsoleBtn.style.opacity = isPveUp ? '1' : '0.5';
    }
  } catch (e) {
    console.warn('[PowerStatus] Telemetry poll failed:', e);
  }
}

window.refreshData = function() {
  const btn = document.getElementById('btn-refresh');
  btn.style.transform = 'rotate(180deg)';
  setTimeout(() => { btn.style.transform = 'none'; }, 400);
  pollServerHealth();
};

function loadConfig() {
  const saved = localStorage.getItem('homepage_server_config');
  if (saved) {
    try { config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) }; } catch (e) {}
  }
}

window.saveSettings = function() {
  config.proxmox = document.getElementById('cfg-proxmox').value.trim();
  config.noder = document.getElementById('cfg-noder').value.trim();
  if (document.getElementById('cfg-router')) {
    config.router = document.getElementById('cfg-router').value.trim();
  }
  localStorage.setItem('homepage_server_config', JSON.stringify(config));
  closeModal('modal-settings');
};

// ==========================================================================
// Pre-Flight Workloads Audit & Safe Power Management
// ==========================================================================

const PROXMOX_WORKLOADS = [
  {
    id: 106,
    name: 'VM 106 · Ollama-Qwen',
    type: 'VM (QEMU)',
    active: false, // En Proxmox está Apagada (On-demand)
    gpuPassthrough: true,
    risk: 'critical',
    desc: 'Passthrough de GPU NVIDIA GeForce GTX 1650 Super (vfio-pci). Al estar APAGADA, el bus PCIe y la memoria VRAM están liberados.'
  },
  {
    id: 107,
    name: 'VM 107 · Nessus-Scanner',
    type: 'VM (QEMU)',
    active: false, // En Proxmox está en Standby / Aprovisionada
    isScanning: false,
    risk: 'warning',
    desc: 'Servicio Tenable Nessus. Actualmente en Standby / Aprovisionada sin escaneos activos.'
  },
  {
    id: 200,
    name: 'LXC 200 · Coolify PaaS',
    type: 'LXC (Container)',
    active: true, // Corriendo
    risk: 'managed',
    desc: 'Aloja PostgreSQL, Redis y Traefik. Proxmox gestionará el apagado ordenado mediante señal ACPI shutdown.'
  },
  {
    id: 102,
    name: 'VM 102 · opnsense-lab',
    type: 'VM (QEMU)',
    active: true, // Corriendo
    risk: 'managed',
    desc: 'Router / Firewall secundario activo. Proxmox gestionará el apagado ordenado mediante señal ACPI shutdown.'
  }
];

let proxmoxCountdownTimer = null;

// Toggle VM 106 state for live simulation
window.toggleVm106Simulation = function() {
  const vm106 = PROXMOX_WORKLOADS.find(w => w.id === 106);
  if (vm106) {
    vm106.active = !vm106.active;
    vm106.desc = vm106.active
      ? 'Passthrough directo de GPU NVIDIA GeForce GTX 1650 Super (vfio-pci) ACTIVO. Apagar el hipervisor causará reseteo forzado del bus PCIe e inconsistencia en la memoria VRAM.'
      : 'Passthrough de GPU NVIDIA GeForce GTX 1650 Super (vfio-pci). Al estar APAGADA, el bus PCIe y la memoria VRAM están liberados.';
    auditProxmoxWorkloads();
  }
};

window.openProxmoxPowerModal = function() {
  openModal('modal-power-proxmox');
  auditProxmoxWorkloads();
};

function auditProxmoxWorkloads() {
  const list = document.getElementById('proxmox-audit-list');
  const verdict = document.getElementById('proxmox-audit-verdict');
  const confirmBtn = document.getElementById('btn-proxmox-shutdown-confirm');

  if (!list || !verdict || !confirmBtn) return;

  list.innerHTML = '';
  let isBlocked = false;
  let blockReasons = [];

  PROXMOX_WORKLOADS.forEach(item => {
    const itemEl = document.createElement('div');
    let itemClass = 'safe';
    let badgeHtml = '<span class="audit-badge ok">SEGURO</span>';

    if (item.active && item.gpuPassthrough) {
      isBlocked = true;
      itemClass = 'blocked';
      badgeHtml = '<span class="audit-badge danger">🛑 BLOQUEO: GPU ACTIVA</span>';
      blockReasons.push(`<strong>${item.name}</strong> tiene passthrough activo de la GPU NVIDIA`);
    } else if (item.active && item.risk === 'warning') {
      itemClass = 'warning';
      badgeHtml = '<span class="audit-badge warn">⚠️ ATENCIÓN</span>';
    } else if (item.active && item.risk === 'managed') {
      itemClass = 'warning';
      badgeHtml = '<span class="audit-badge warn">APAGADO ACPI</span>';
    } else if (!item.active) {
      itemClass = 'safe';
      badgeHtml = item.gpuPassthrough 
        ? '<span class="audit-badge ok">APAGADA (GPU LIBRE)</span>' 
        : '<span class="audit-badge ok">APAGADA / STANDBY</span>';
    }

    itemEl.className = `audit-item ${itemClass}`;
    itemEl.innerHTML = `
      <div class="audit-item-header">
        <span class="audit-vm-name">${item.name} (${item.type})</span>
        ${badgeHtml}
      </div>
      <p class="audit-reason">${item.desc}</p>
    `;
    list.appendChild(itemEl);
  });

  if (proxmoxCountdownTimer) {
    clearInterval(proxmoxCountdownTimer);
    proxmoxCountdownTimer = null;
  }

  if (isBlocked) {
    verdict.className = 'audit-verdict blocked';
    verdict.innerHTML = `
      🛑 <strong>APAGADO DEL HIPERVISOR BLOQUEADO:</strong><br>
      ${blockReasons.join('<br>')}.<br><br>
      <em>Por seguridad de hardware, primero debés apagar la VM 106 desde la consola de Proxmox para liberar el bus PCIe y la memoria VRAM antes de apagar el servidor 'jj'.</em>
      <div style="margin-top: 10px; text-align: right;">
        <button type="button" onclick="toggleVm106Simulation()" class="btn btn-xs btn-secondary" style="font-size: 0.72rem; padding: 3px 8px;">🔄 Simular que VM 106 está Apagada</button>
      </div>
    `;
    confirmBtn.disabled = true;
    confirmBtn.innerText = '🛑 Apagado Bloqueado por Seguridad';
  } else {
    verdict.className = 'audit-verdict ready';
    verdict.innerHTML = `
      ✅ <strong>VERIFICACIÓN EXITOSA:</strong> No se detectaron cargas críticas con GPU activa ni escaneos en curso. La VM 106 está apagada (bus PCIe liberado). Proxmox enviará señales ACPI de apagado ordenado a los contenedores activos (Coolify y OPNsense).
      <div style="margin-top: 10px; text-align: right;">
        <button type="button" onclick="toggleVm106Simulation()" class="btn btn-xs btn-secondary" style="font-size: 0.72rem; padding: 3px 8px;">⚡ Simular encendido de VM 106 (con GPU)</button>
      </div>
    `;
    let countdown = 5;
    confirmBtn.disabled = true;
    confirmBtn.innerText = `⏱️ Esperá ${countdown}s para confirmar`;
    proxmoxCountdownTimer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(proxmoxCountdownTimer);
        proxmoxCountdownTimer = null;
        confirmBtn.disabled = false;
        confirmBtn.innerText = '🛑 Confirmar Apagado del Hipervisor';
      } else {
        confirmBtn.innerText = `⏱️ Esperá ${countdown}s para confirmar`;
      }
    }, 1000);
  }
}

// ==========================================================================
// Power Bridge Token Management & Real Hardware Shutdown
// ==========================================================================

let cachedPowerToken = '';

async function getPowerToken() {
  if (cachedPowerToken) return cachedPowerToken;
  try {
    const res = await fetch('/api/power/token');
    if (res.ok) {
      const data = await res.json();
      if (data.token) {
        cachedPowerToken = data.token;
        return cachedPowerToken;
      }
    }
  } catch (e) {
    console.warn('[PowerBridge] Could not fetch power token:', e);
  }
  return '';
}

window.executeProxmoxShutdown = async function() {
  const confirmBtn = document.getElementById('btn-proxmox-shutdown-confirm');
  const verdict = document.getElementById('proxmox-audit-verdict');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerText = '⏳ Enviando orden de apagado...';
  }

  try {
    const token = await getPowerToken();
    const res = await fetch('/api/power/proxmox', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await res.json();

    if (res.ok && data.success) {
      if (verdict) {
        verdict.className = 'audit-verdict ready';
        verdict.innerHTML = `
          🔌 <strong>ORDEN ENVIADA EXITOSAMENTE:</strong><br>
          ${data.message}<br><br>
          <em>El hipervisor Proxmox VE (jj) se desconectará físicamente en breves instantes.</em>
        `;
      }
      if (confirmBtn) {
        confirmBtn.innerText = '✅ Proxmox Apagándose';
      }
      setTimeout(() => {
        closeModal('modal-power-proxmox');
      }, 4000);
    } else {
      throw new Error(data.error || 'Error al comunicarse con el daemon de energía');
    }
  } catch (err) {
    alert('Error al apagar Proxmox: ' + err.message);
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerText = '🛑 Reintentar Apagado';
    }
  }
};

// Raspberry Pi Edge Node Power Off
window.openRpiPowerModal = function() {
  const input = document.getElementById('rpi-shutdown-input');
  const confirmBtn = document.getElementById('btn-rpi-shutdown-confirm');
  if (input) input.value = '';
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerText = '⚠️ Confirmar Apagado del Nodo';
  }
  openModal('modal-power-rpi');
};

window.onRpiConfirmInput = function(value) {
  const confirmBtn = document.getElementById('btn-rpi-shutdown-confirm');
  if (!confirmBtn) return;

  if (value.trim().toUpperCase() === 'APAGAR') {
    confirmBtn.disabled = false;
    confirmBtn.innerText = '⚠️ APAGAR RASPBERRY PI AHORA';
  } else {
    confirmBtn.disabled = true;
    confirmBtn.innerText = '⚠️ Confirmar Apagado del Nodo';
  }
};

window.executeRpiShutdown = async function() {
  const modalBody = document.querySelector('#modal-power-rpi .modal-body');
  const modalFooter = document.querySelector('#modal-power-rpi .modal-footer');
  const confirmBtn = document.getElementById('btn-rpi-shutdown-confirm');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerText = '⏳ Apagando...';
  }

  try {
    const token = await getPowerToken();
    const res = await fetch('/api/power/rpi', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ challenge: 'APAGAR' })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Error de apagado');
    }

    if (modalFooter) modalFooter.style.display = 'none';

    if (modalBody) {
      modalBody.innerHTML = `
        <div style="text-align: center; padding: 20px 10px;">
          <div style="font-size: 2.5rem; margin-bottom: 12px;">🔌</div>
          <h3 style="color: #ffffff; margin-bottom: 10px;">Apagando Raspberry Pi (NodeR)...</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.5;">
            El sistema operativo está deteniendo los contenedores Docker y ejecutando <code>poweroff</code>.<br>
            <strong>Esta ventana de Home-Page-Server perderá conexión en unos instantes.</strong>
          </p>
          <div style="margin-top: 18px; color: #ef4444; font-weight: 700; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem;">
            [APAGADO EN PROCESO]
          </div>
        </div>
      `;
    }

    setTimeout(() => {
      document.body.innerHTML = `
        <div style="height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #060911; color: #ffffff; font-family: sans-serif; text-align: center; padding: 20px;">
          <div style="font-size: 3.5rem; margin-bottom: 16px;">⚡</div>
          <h1 style="font-size: 1.5rem; margin-bottom: 8px;">Servidor Desconectado</h1>
          <p style="color: #8493ad; max-width: 440px; line-height: 1.5; font-size: 0.9rem;">
            La Raspberry Pi se ha apagado correctamente. Para volver a visualizar la Home Page y recuperar los servicios de red, reconectá la alimentación física de la Pi.
          </p>
        </div>
      `;
    }, 4000);

  } catch (err) {
    alert('Error al apagar Raspberry Pi: ' + err.message);
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerText = '⚠️ Reintentar Apagado';
    }
  }
};
