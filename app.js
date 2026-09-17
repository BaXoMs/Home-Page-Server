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
});

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
