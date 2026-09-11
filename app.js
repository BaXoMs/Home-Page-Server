/**
 * NodeR · Fireman Dashboard Logic & Interactivity
 * High-performance chart rendering, API hooks & modal management
 */

// Default configuration endpoints (persisted in localStorage)
const DEFAULT_CONFIG = {
  proxmox: 'https://100.77.123.25:8006',
  noder: 'http://100.120.34.14:9000',
  wazuh: 'https://10.10.60.88',
  nessus: 'https://10.10.60.88:8834',
  watchtower: 'http://100.120.34.14:9000',
  cctv: 'http://192.168.0.200'
};

// State
let config = { ...DEFAULT_CONFIG };
let activeTrafficLayer = 'corp'; // 'corp' or 'byod'

// Traffic time series data (last 12 hours)
const trafficData = {
  corp: [
    { hour: '-12h', val: 140 },
    { hour: '-10h', val: 115 },
    { hour: '-8h',  val: 135 },
    { hour: '-6h',  val: 90 },
    { hour: '-4h',  val: 105 },
    { hour: '-2h',  val: 70 },
    { hour: '-1h',  val: 85 },
    { hour: 'now',  val: 60 }
  ],
  byod: [
    { hour: '-12h', val: 165 },
    { hour: '-10h', val: 150 },
    { hour: '-8h',  val: 155 },
    { hour: '-6h',  val: 135 },
    { hour: '-4h',  val: 145 },
    { hour: '-2h',  val: 125 },
    { hour: '-1h',  val: 135 },
    { hour: 'now',  val: 130 }
  ]
};

// Initialize dashboard on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  loadStoredConfig();
  renderTrafficChart();
  initModals();
  initBarsTooltips();
  setupLiveRefresh();
});

// Load config from localStorage
function loadStoredConfig() {
  const saved = localStorage.getItem('fireman_config');
  if (saved) {
    try {
      config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Error loading config:', e);
    }
  }
}

// Generate smooth cubic bezier SVG path
function getBezierPath(points, width, height, closeArea = false) {
  const n = points.length;
  if (n === 0) return '';

  const stepX = width / (n - 1);
  const coords = points.map((p, i) => ({
    x: i * stepX,
    y: p.val
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

// Render traffic chart SVG
function renderTrafficChart() {
  const width = 650;
  const height = 200;

  // Render BYOD (secondary/background line)
  const byodPath = getBezierPath(trafficData.byod, width, height, false);
  const byodArea = getBezierPath(trafficData.byod, width, height, true);

  const pathByodLine = document.getElementById('path-byod-line');
  const pathByodArea = document.getElementById('path-byod-area');
  if (pathByodLine && pathByodArea) {
    pathByodLine.setAttribute('d', byodPath);
    pathByodArea.setAttribute('d', byodArea);
  }

  // Render CORP (primary line matching mockup)
  const corpPath = getBezierPath(trafficData.corp, width, height, false);
  const corpArea = getBezierPath(trafficData.corp, width, height, true);

  const pathCorpLine = document.getElementById('path-corp-line');
  const pathCorpArea = document.getElementById('path-corp-area');
  if (pathCorpLine && pathCorpArea) {
    pathCorpLine.setAttribute('d', corpPath);
    pathCorpArea.setAttribute('d', corpArea);
  }
}

// Switch traffic layer filter
window.switchTrafficLayer = function(layer) {
  activeTrafficLayer = layer;
  document.getElementById('tab-corp').classList.toggle('active', layer === 'corp');
  document.getElementById('tab-byod').classList.toggle('active', layer === 'byod');

  const pathCorpLine = document.getElementById('path-corp-line');
  const pathCorpArea = document.getElementById('path-corp-area');
  const pathByodLine = document.getElementById('path-byod-line');
  const pathByodArea = document.getElementById('path-byod-area');

  if (layer === 'corp') {
    pathCorpLine.style.stroke = '#00f2fe';
    pathCorpLine.style.strokeWidth = '2.5px';
    pathCorpArea.style.opacity = '1';
    pathByodLine.style.stroke = '#2563eb';
    pathByodLine.style.strokeWidth = '1.5px';
    pathByodArea.style.opacity = '0.3';
  } else {
    pathByodLine.style.stroke = '#00f2fe';
    pathByodLine.style.strokeWidth = '2.5px';
    pathByodArea.style.opacity = '1';
    pathCorpLine.style.stroke = '#2563eb';
    pathCorpLine.style.strokeWidth = '1.5px';
    pathCorpArea.style.opacity = '0.3';
  }
};

// Tooltip for bars
function initBarsTooltips() {
  const bars = document.querySelectorAll('.bar-group');
  const tooltip = document.getElementById('chart-tooltip');

  bars.forEach(bar => {
    bar.addEventListener('mouseenter', (e) => {
      const vlan = bar.getAttribute('data-vlan');
      const label = bar.getAttribute('data-label');
      const vulns = bar.getAttribute('data-vulns');

      tooltip.innerHTML = `<strong>${vlan} (${label})</strong><br>Vulnerabilidades: ${vulns}`;
      tooltip.style.display = 'block';
    });

    bar.addEventListener('mousemove', (e) => {
      const rect = bar.getBoundingClientRect();
      tooltip.style.left = `${rect.left + rect.width / 2 - 60}px`;
      tooltip.style.top = `${rect.top - 45}px`;
    });

    bar.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  });
}

// Modal management
function initModals() {
  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      document.getElementById('cfg-proxmox').value = config.proxmox;
      document.getElementById('cfg-noder').value = config.noder;
      document.getElementById('cfg-wazuh').value = config.wazuh;
      document.getElementById('cfg-nessus').value = config.nessus;
      openModal('modal-settings');
    });
  }

  const btnNotifications = document.getElementById('btn-notifications');
  if (btnNotifications) {
    btnNotifications.addEventListener('click', () => {
      showServiceModal(
        'Centro de Alertas SOC',
        `
        <div style="font-size: 0.85rem; line-height: 1.6; color: #94a3b8;">
          <p><strong style="color: #22c55e;">[OK] Proxmox VE (jj):</strong> Hipervisor operativo (12 GB RAM disponibles).</p>
          <p><strong style="color: #00f2fe;">[OK] NodeR:</strong> Servicios activos en Portainer (AdGuard, Vaultwarden, NPM).</p>
          <p><strong style="color: #ff6363;">[ALERTA] Wazuh:</strong> 37 eventos detectados en las últimas 24h.</p>
          <p><strong style="color: #ff6363;">[CRÍTICO] Nessus:</strong> 12 vulnerabilidades críticas detectadas en VLAN 40.</p>
        </div>
        `,
        config.wazuh
      );
    });
  }
}

window.openModal = function(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
};

window.closeModal = function(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
};

window.saveSettings = function() {
  config.proxmox = document.getElementById('cfg-proxmox').value.trim();
  config.noder = document.getElementById('cfg-noder').value.trim();
  config.wazuh = document.getElementById('cfg-wazuh').value.trim();
  config.nessus = document.getElementById('cfg-nessus').value.trim();

  localStorage.setItem('fireman_config', JSON.stringify(config));
  closeModal('modal-settings');
};

// Open service or show quick action dialog
window.openService = function(serviceKey) {
  const serviceMap = {
    proxmox: {
      title: 'Proxmox Virtual Environment (jj)',
      url: config.proxmox,
      body: '<p>Hipervisor central de cómputo y virtualización.</p><p style="color:#64748b; font-size:0.8rem; margin-top:8px;">IP Tailscale: 100.77.123.25:8006<br>IP LAN: 192.168.0.104:8006</p>'
    },
    wazuh: {
      title: 'Wazuh SOC & SIEM',
      url: config.wazuh,
      body: '<p>Monitoreo continuo de eventos de seguridad y detección de amenazas.</p><p style="color:#64748b; font-size:0.8rem; margin-top:8px;">Allowlist activa para escáner Nessus (10.10.60.88)</p>'
    },
    nessus: {
      title: 'Tenable Nessus Scanner (VM 107)',
      url: config.nessus,
      body: '<p>Escáner de vulnerabilidades perimetral e interno para VLANs.</p><p style="color:#64748b; font-size:0.8rem; margin-top:8px;">Puerto 8834 | VM 107 en Proxmox</p>'
    },
    watchtower: {
      title: 'Watchtower Updater & Monitor',
      url: config.noder,
      body: '<p>Auditoría y detección de imágenes desactualizadas en modo monitor-only.</p><p style="color:#64748b; font-size:0.8rem; margin-top:8px;">Ejecutándose en Raspberry Pi (NodeR)</p>'
    },
    cctv: {
      title: 'CCTV / IoT Network Dashboard',
      url: config.cctv,
      body: '<p>Monitoreo de cámaras de seguridad y dispositivos en VLAN 50.</p>'
    },
    portainer: {
      title: 'Portainer CE (NodeR)',
      url: config.noder,
      body: '<p>Gestor de contenedores Docker en Raspberry Pi 4.</p>'
    }
  };

  const item = serviceMap[serviceKey];
  if (!item) return;

  showServiceModal(item.title, item.body, item.url);
};

function showServiceModal(title, bodyHtml, targetUrl) {
  document.getElementById('modal-service-title').innerText = title;
  document.getElementById('modal-service-body').innerHTML = bodyHtml;
  document.getElementById('modal-service-link').href = targetUrl;
  openModal('modal-service');
}

// Live refresh simulation (subtle realistic fluctuations)
function setupLiveRefresh() {
  setInterval(() => {
    // Subtle pulse effect on Wazuh count
    const wCount = document.getElementById('wazuh-count');
    if (wCount && Math.random() > 0.7) {
      const current = parseInt(wCount.innerText);
      const delta = Math.random() > 0.5 ? 1 : -1;
      const next = Math.max(30, Math.min(45, current + delta));
      wCount.innerText = next;
    }
  }, 10000);
}
