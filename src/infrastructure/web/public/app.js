// Anomalytics Dashboard UI Controller

// API Endpoints
const API_BASE = window.location.origin;
const ENDPOINTS = {
  stats: `${API_BASE}/api/stats`,
  reports: `${API_BASE}/api/reports`,
  rules: `${API_BASE}/api/rules`,
  simulate: `${API_BASE}/api/simulate-traffic`,
  health: `${API_BASE}/api/health`
};

// DOM Cache
const dom = {
  apiStatus: document.getElementById('api-status-text'),
  statTotal: document.getElementById('stat-total'),
  statFlagged: document.getElementById('stat-flagged'),
  statLatency: document.getElementById('stat-latency'),
  btnSimulate: document.getElementById('btn-simulate'),
  simStatusLog: document.getElementById('sim-status-log'),
  anomaliesTbody: document.getElementById('anomalies-tbody'),
  rulesContainer: document.getElementById('rules-container')
};

// Initial state
let lastUpdate = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkApiHealth();
  refreshDashboard();
  setupEventListeners();

  // Set refresh interval (every 5 seconds)
  setInterval(refreshDashboard, 5000);
});

// Setup event listeners
function setupEventListeners() {
  dom.btnSimulate.addEventListener('click', async () => {
    dom.btnSimulate.disabled = true;
    dom.btnSimulate.innerHTML = `<span class="btn-spinner">🔄</span> Running simulation...`;
    dom.simStatusLog.textContent = 'Triggering traffic ingestion payload...';

    try {
      const response = await fetch(ENDPOINTS.simulate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Simulation endpoint returned an error');
      }

      const result = await response.json();
      
      // Update simulation log UI
      let detailsText = '';
      if (result.disposition === 'ALLOWED') {
        detailsText = '✅ Benign traffic processed safely.';
      } else if (result.disposition === 'BLOCKED') {
        detailsText = `🚫 BLOCKED: ${result.anomalies[0] || 'Sanctions policy hit'}`;
      } else {
        detailsText = `⚠️ SOC ESCALATION: ${result.anomalies[0] || 'Threat signature triggered'}`;
      }

      dom.simStatusLog.innerHTML = `<strong>[${result.eventId}]</strong> ${detailsText}`;
      
      // Instantly refresh dashboard details
      await refreshDashboard();
    } catch (error) {
      console.error('Simulation trigger failed:', error);
      dom.simStatusLog.innerHTML = `❌ Ingestion error: ${error.message}`;
    } finally {
      dom.btnSimulate.disabled = false;
      dom.btnSimulate.innerHTML = `<span class="btn-icon">⚡</span> Run Simulated Traffic Ingestion`;
    }
  });
}

// Health check liveness pulsed indicator
async function checkApiHealth() {
  try {
    const res = await fetch(ENDPOINTS.health);
    if (res.ok) {
      dom.apiStatus.textContent = 'ACTIVE / SECURE';
      dom.apiStatus.style.color = '#10b981';
    } else {
      throw new Error('Liveness check failed');
    }
  } catch (err) {
    dom.apiStatus.textContent = 'ENGINE UNREACHABLE';
    dom.apiStatus.style.color = '#ef4444';
  }
}

// Core Orchestration to Refresh Page Data
async function refreshDashboard() {
  try {
    // Parallel fetching
    const [statsRes, reportsRes, rulesRes] = await Promise.all([
      fetch(ENDPOINTS.stats),
      fetch(ENDPOINTS.reports),
      fetch(ENDPOINTS.rules)
    ]);

    if (!statsRes.ok || !reportsRes.ok || !rulesRes.ok) {
      throw new Error('Failed to load dashboard payload');
    }

    const stats = await statsRes.json();
    const reports = await reportsRes.json();
    const rules = await rulesRes.json();

    // 1. Update Metrics Summary
    dom.statTotal.textContent = stats.totalEvents.toLocaleString();
    dom.statFlagged.textContent = stats.flaggedEvents.toLocaleString();
    dom.statLatency.textContent = `${stats.avgLatencyMs.toFixed(2)}ms`;

    // 2. Render Ingestion Feed
    renderReportsTable(reports);

    // 3. Render Rules Catalog
    renderRulesCatalog(rules);

    lastUpdate = new Date();
  } catch (error) {
    console.error('Failed to sync dashboard stats:', error);
  }
}

// Render reports in feed table
function renderReportsTable(reports) {
  if (reports.length === 0) {
    dom.anomaliesTbody.innerHTML = `
      <tr>
        <td colspan="6" class="table-empty">No ingestion events recorded yet. Click simulation above!</td>
      </tr>
    `;
    return;
  }

  dom.anomaliesTbody.innerHTML = reports.map(r => {
    // Generate badges based on action
    let badgeClass = 'badge-allowed';
    let label = 'ALLOWED';
    if (r.actionTaken === 'BLOCKED') {
      badgeClass = 'badge-blocked';
      label = 'BLOCKED';
    } else if (r.actionTaken === 'ESCALATE_TO_SOC') {
      badgeClass = 'badge-escalate';
      label = 'ESCALATE';
    }

    // Indicators / Details text
    const details = r.detectedAnomalies.length > 0 
      ? r.detectedAnomalies.join(', ')
      : (r.mitreAtlasTactics.length > 0 ? r.mitreAtlasTactics.join(', ') : 'Clean Transaction');

    return `
      <tr>
        <td style="font-family: monospace; font-weight: 600;">${r.eventId}</td>
        <td><span style="font-weight: 600; font-size: 0.8rem; color: #9ca3af;">${r.id.replace('rep_', 'REP_')}</span></td>
        <td style="font-family: monospace;">${r.score.toFixed(2)}</td>
        <td>
          <span class="badge ${badgeClass}">${label}</span>
        </td>
        <td style="max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${details}">
          ${details}
        </td>
        <td style="color: #60a5fa; font-size: 0.75rem;">${new Date(r.timestamp).toLocaleTimeString()}</td>
      </tr>
    `;
  }).join('');
}

// Render active rules list in sidebar
function renderRulesCatalog(rules) {
  if (rules.length === 0) {
    dom.rulesContainer.innerHTML = `<div class="rule-item-loading">No active signature checks loaded.</div>`;
    return;
  }

  dom.rulesContainer.innerHTML = rules.map(rule => {
    return `
      <div class="rule-item">
        <div class="rule-header">
          <span class="rule-name">${rule.name}</span>
          <span class="rule-tactic">${rule.tactic.split(':')[0]}</span>
        </div>
        <div class="rule-pattern" title="Signature pattern matches regex">${rule.pattern}</div>
      </div>
    `;
  }).join('');
}
