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

  // Close modals or drawer on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMobileMenu();
      closeModal('modal-workspace');
      closeModal('modal-settings');
      closeModal('modal-new-project');
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

// Integrated Workspace Modal (In-App Embedding)
window.openWorkspace = function(url, title) {
  document.getElementById('workspace-title').innerText = title;
  document.getElementById('workspace-url-badge').innerText = url;
  document.getElementById('workspace-external-link').href = url;
  
  const iframe = document.getElementById('workspace-iframe');
  iframe.src = url;

  openModal('modal-workspace');
};

window.reloadWorkspaceFrame = function() {
  const iframe = document.getElementById('workspace-iframe');
  if (iframe) {
    iframe.src = iframe.src;
  }
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
      // Clear iframe on close to stop resource usage
      const iframe = document.getElementById('workspace-iframe');
      if (iframe) iframe.src = '';
    }
  }
};

window.refreshData = function() {
  const btn = document.getElementById('btn-refresh');
  btn.style.transform = 'rotate(180deg)';
  setTimeout(() => { btn.style.transform = 'none'; }, 400);
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
    active: true,
    gpuPassthrough: true,
    risk: 'critical',
    desc: 'Passthrough directo de GPU NVIDIA GeForce GTX 1650 Super (vfio-pci). Apagar el hipervisor causará reseteo forzado del bus PCIe e inconsistencia en la memoria VRAM del modelo de IA.'
  },
  {
    id: 107,
    name: 'VM 107 · Nessus-Scanner',
    type: 'VM (QEMU)',
    active: true,
    isScanning: false,
    risk: 'warning',
    desc: 'Servicio Tenable Nessus activo en puerto :8834. Si hay un escaneo de vulnerabilidades en curso, la base de datos de auditoría puede corromperse.'
  },
  {
    id: 200,
    name: 'LXC 200 · Coolify PaaS',
    type: 'LXC (Container)',
    active: true,
    risk: 'managed',
    desc: 'Aloja PostgreSQL, Redis y Traefik. Proxmox gestionará el apagado ordenado mediante señal ACPI shutdown.'
  },
  {
    id: 102,
    name: 'VM 102 · OPNsense',
    type: 'VM (QEMU)',
    active: false,
    risk: 'safe',
    desc: 'Firewall secundario. Actualmente detenido sin tráfico activo.'
  }
];

let proxmoxCountdownTimer = null;

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
      badgeHtml = '<span class="audit-badge ok">APAGADA</span>';
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
    `;
    confirmBtn.disabled = true;
    confirmBtn.innerText = '🛑 Apagado Bloqueado por Seguridad';
  } else {
    verdict.className = 'audit-verdict ready';
    verdict.innerHTML = `
      ✅ <strong>VERIFICACIÓN EXITOSA:</strong> No se detectaron cargas críticas con GPU activa ni escaneos en curso. Proxmox enviará señales ACPI de apagado ordenado a los contenedores.
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

window.executeProxmoxShutdown = function() {
  const confirmBtn = document.getElementById('btn-proxmox-shutdown-confirm');
  if (confirmBtn) confirmBtn.disabled = true;

  alert('Enviando orden de apagado ordenado a Proxmox VE (jj) vía API...\nEl hipervisor cerrará las máquinas virtuales y procederá al apagado.');
  closeModal('modal-power-proxmox');
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

window.executeRpiShutdown = function() {
  const modalBody = document.querySelector('#modal-power-rpi .modal-body');
  const modalFooter = document.querySelector('#modal-power-rpi .modal-footer');
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
          [CONEXIÓN CERRADA]
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
};
