const state = {
  rows: [],
  metrics: null,
  employees: [],
};

const els = {
  sidebar: document.getElementById("sidebar"),
  sidebarToggle: document.getElementById("sidebarToggle"),
  sidebarToggleTop: document.getElementById("sidebarToggleTop"),
  csvInput: document.getElementById("csvInput"),
  searchInput: document.getElementById("searchInput"),
  employeeSearchInput: document.getElementById("employeeSearchInput"),
  clientTable: document.getElementById("clientTable"),
  employeeTable: document.getElementById("employeeTable"),
  recordCount: document.getElementById("recordCount"),
  lastRefresh: document.getElementById("lastRefresh"),
  avgRenewal: document.getElementById("avgRenewal"),
  due30Count: document.getElementById("due30Count"),
  due60Count: document.getElementById("due60Count"),
  due90Count: document.getElementById("due90Count"),
  criticalCount: document.getElementById("criticalCount"),
  watchlistCount: document.getElementById("watchlistCount"),
  expansionCount: document.getElementById("expansionCount"),
  avgChurn: document.getElementById("avgChurn"),
  employeeCount: document.getElementById("employeeCount"),
  negativeBalanceCount: document.getElementById("negativeBalanceCount"),
  lowBalanceCount: document.getElementById("lowBalanceCount"),
  avgRemainingBalance: document.getElementById("avgRemainingBalance"),
  topRiskList: document.getElementById("topRiskList"),
  actionQueue: document.getElementById("actionQueue"),
  rocAuc: document.getElementById("rocAuc"),
  avgPrecision: document.getElementById("avgPrecision"),
  accuracy: document.getElementById("accuracy"),
  riskChart: document.getElementById("riskChart"),
  scatterChart: document.getElementById("scatterChart"),
  concernFill: document.getElementById("concernFill"),
  concernValue: document.getElementById("concernValue"),
  healthScore: document.getElementById("healthScore"),
  healthLabel: document.getElementById("healthLabel"),
};

function parseCSV(text) {
  const rows = [];
  const lines = text.trim().split(/\r?\n/);
  if (lines.length <= 1) return rows;

  const headers = splitCSVLine(lines[0]);
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitCSVLine(line);
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });
    rows.push(record);
  }
  return rows;
}

function splitCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current);
  return result;
}

function number(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function formatPct(value) {
  return `${Math.round(value * 100)}%`;
}

function segmentClass(segment) {
  switch (segment) {
    case "critical_risk":
      return "critical";
    case "high_risk":
      return "high";
    case "watchlist":
      return "watchlist";
    case "expansion_ready":
      return "expansion";
    default:
      return "health";
  }
}

function daysUntilRenewal(value) {
  const date = parseDate(value);
  if (!date) return null;
  const diff = date.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function segmentLabel(segment) {
  return segment.replaceAll("_", " ");
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) return value || "";
  return date.toLocaleDateString();
}

function calculateRemainingBalance(employee) {
  return (
    number(employee.opening_balance) +
    number(employee.entitlement_days) +
    number(employee.time_off_in_lieu) -
    number(employee.used_days)
  );
}

function drawRiskChart(rows) {
  const canvas = els.riskChart;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const counts = rows.reduce(
    (acc, row) => {
      acc[row.risk_segment] = (acc[row.risk_segment] || 0) + 1;
      return acc;
    },
    { critical_risk: 0, high_risk: 0, watchlist: 0, healthy: 0, expansion_ready: 0 }
  );

  const items = [
    ["critical_risk", counts.critical_risk, "#ff6b8a"],
    ["high_risk", counts.high_risk, "#4a84ff"],
    ["watchlist", counts.watchlist, "#2f62f0"],
    ["healthy", counts.healthy, "#67b8ff"],
    ["expansion_ready", counts.expansion_ready, "#8ee3ff"],
  ];

  const max = Math.max(...items.map(([, count]) => count), 1);
  const barWidth = 92;
  const gap = 40;
  const startX = 36;
  const baseline = height - 42;

  ctx.fillStyle = "#8ea0c7";
  ctx.font = "12px Inter, sans-serif";

  items.forEach(([label, count, color], index) => {
    const x = startX + index * (barWidth + gap);
    const barHeight = Math.max(12, (count / max) * 136);
    const y = baseline - barHeight;
    const gradient = ctx.createLinearGradient(0, y, 0, baseline);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "rgba(74, 132, 255, 0.16)");
    ctx.fillStyle = gradient;
    roundRect(ctx, x, y, barWidth, barHeight, 14);
    ctx.fill();

    ctx.fillStyle = "#edf3ff";
    ctx.font = "700 15px Inter, sans-serif";
    ctx.fillText(String(count), x + 38, y - 10);
    ctx.fillStyle = "#8ea0c7";
    ctx.font = "12px Inter, sans-serif";
    drawMultiline(ctx, label.replace("_", " "), x + 8, baseline + 18, 76, 14);
  });

  drawGrid(ctx, width, height);
}

function drawScatterChart(rows) {
  const canvas = els.scatterChart;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, width, height);

  const sorted = [...rows]
    .sort((a, b) => number(b.churn_probability) - number(a.churn_probability))
    .slice(0, 18);

  sorted.forEach((row, index) => {
    const x = 44 + (index % 6) * 100;
    const y = 160 - Math.round(number(row.churn_probability) * 110);
    const renewal = number(row.renewal_probability);
    const radius = 5 + renewal * 12;
    const color = colorForSegment(row.risk_segment);

    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (index < 6) {
      ctx.fillStyle = "#8ea0c7";
      ctx.font = "11px Inter, sans-serif";
      ctx.fillText(row.client_id, x - 18, y + radius + 14);
    }
  });
}

function drawGrid(ctx, width, height) {
  ctx.save();
  ctx.strokeStyle = "rgba(74, 132, 255, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 44) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawMultiline(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let currentY = y;

  words.forEach((word, index) => {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
    if (index === words.length - 1) {
      ctx.fillText(line, x, currentY);
    }
  });
}

function colorForSegment(segment) {
  switch (segment) {
    case "critical_risk":
      return "#ff6b8a";
    case "high_risk":
      return "#4a84ff";
    case "watchlist":
      return "#2f62f0";
    case "expansion_ready":
      return "#67b8ff";
    default:
      return "#8ee3ff";
  }
}

function renderTable(rows) {
  const query = els.searchInput.value.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (!query) return true;
    return (
      row.client_id.toLowerCase().includes(query) ||
      row.risk_segment.toLowerCase().includes(query) ||
      row.recommended_action.toLowerCase().includes(query)
    );
  });

  if (!filtered.length) {
    els.clientTable.innerHTML = `<tr><td class="empty" colspan="5">No matching clients found.</td></tr>`;
    return;
  }

  els.clientTable.innerHTML = filtered
    .sort((a, b) => number(b.churn_probability) - number(a.churn_probability))
    .map(
      (row) => `
        <tr>
          <td><strong class="client-code">${row.client_id}</strong><div class="muted">${row.as_of_date || ""}</div></td>
          <td>${formatPct(number(row.churn_probability))}</td>
          <td>${formatPct(number(row.renewal_probability))}</td>
          <td><span class="pill ${segmentClass(row.risk_segment)}">${row.risk_segment.replace("_", " ")}</span></td>
          <td>${row.recommended_action}</td>
        </tr>
      `
    )
    .join("");
}

function renderInsights(rows) {
  const sorted = [...rows].sort((a, b) => number(b.churn_probability) - number(a.churn_probability));
  const top = sorted.slice(0, 5);
  const topHtml = top.length
    ? top
        .map((row, index) => {
          const days = daysUntilRenewal(row.renewal_date);
          return `
            <div class="rank-item">
              <div class="rank-position">${index + 1}</div>
              <div class="rank-copy">
                <div class="rank-topline">
                  <strong class="client-code">${row.client_id}</strong>
                  <span class="muted">${days != null ? `${days}d to renewal` : "Renewal date n/a"}</span>
                </div>
                <div class="rank-meta">
                  <span class="pill ${segmentClass(row.risk_segment)}">${segmentLabel(row.risk_segment)}</span>
                  <span class="metric-chip">Risk ${formatPct(number(row.churn_probability))}</span>
                  <span class="metric-chip">Renewal ${formatPct(number(row.renewal_probability))}</span>
                </div>
                <p>${row.recommended_action}</p>
              </div>
            </div>
          `;
        })
        .join("")
    : `<div class="empty">No risk-ranked accounts available.</div>`;

  els.topRiskList.innerHTML = topHtml;

  const actionBuckets = [
    {
      title: "Critical rescue",
      segment: "critical_risk",
      description: "Escalate immediately and remove blockers before the renewal decision closes.",
    },
    {
      title: "Focused intervention",
      segment: "high_risk",
      description: "Run value review, sponsor coverage, and targeted enablement.",
    },
    {
      title: "Monitor closely",
      segment: "watchlist",
      description: "Track adoption and support friction before it drifts into churn.",
    },
    {
      title: "Expansion motion",
      segment: "expansion_ready",
      description: "Lock in renewal, then open upside conversations while momentum is strong.",
    },
  ];

  els.actionQueue.innerHTML = actionBuckets
    .map((bucket) => {
      const count = rows.filter((row) => row.risk_segment === bucket.segment).length;
      return `
        <div class="action-card">
          <div class="action-card-head">
            <strong>${bucket.title}</strong>
            <span>${count} accounts</span>
          </div>
          <p>${bucket.description}</p>
        </div>
      `;
    })
    .join("");
}

function renderEmployeeTable(rows) {
  const query = els.employeeSearchInput.value.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (!query) return true;
    return (
      row.employee_email.toLowerCase().includes(query) ||
      row.full_name.toLowerCase().includes(query) ||
      row.department.toLowerCase().includes(query)
    );
  });

  if (!filtered.length) {
    els.employeeTable.innerHTML = `<tr><td class="empty" colspan="8">No matching employees found.</td></tr>`;
    return;
  }

  const sorted = [...filtered].sort((a, b) => calculateRemainingBalance(a) - calculateRemainingBalance(b));
  els.employeeTable.innerHTML = sorted
    .map((employee) => {
      const remaining = calculateRemainingBalance(employee);
      const statusClass = remaining < 0 ? "critical" : remaining <= 5 ? "high" : "health";
      return `
        <tr>
          <td>
            <strong class="client-code">${employee.full_name}</strong>
            <div class="muted">${employee.employee_email}</div>
          </td>
          <td>${employee.department || ""}</td>
          <td>${number(employee.entitlement_days).toFixed(0)}</td>
          <td>${number(employee.opening_balance).toFixed(2)}</td>
          <td>${number(employee.used_days).toFixed(2)}</td>
          <td>${number(employee.time_off_in_lieu).toFixed(2)}</td>
          <td>${formatDate(employee.join_date)}</td>
          <td><span class="pill ${statusClass}">${remaining.toFixed(2)}</span></td>
        </tr>
      `;
    })
    .join("");
}

function updateSummary(rows, metrics) {
  const total = rows.length;
  const counts = rows.reduce(
    (acc, row) => {
      acc[row.risk_segment] = (acc[row.risk_segment] || 0) + 1;
      acc.churn += number(row.churn_probability);
      return acc;
    },
    { critical_risk: 0, watchlist: 0, expansion_ready: 0, churn: 0 }
  );
  const renewalAverage = total
    ? rows.reduce((sum, row) => sum + number(row.renewal_probability), 0) / total
    : 0;
  const due30 = rows.filter((row) => {
    const days = daysUntilRenewal(row.renewal_date);
    return days != null && days >= 0 && days <= 30;
  }).length;
  const due60 = rows.filter((row) => {
    const days = daysUntilRenewal(row.renewal_date);
    return days != null && days > 30 && days <= 60;
  }).length;
  const due90 = rows.filter((row) => {
    const days = daysUntilRenewal(row.renewal_date);
    return days != null && days > 60 && days <= 90;
  }).length;

  els.recordCount.textContent = `${total} accounts`;
  els.avgRenewal.textContent = `${Math.round(renewalAverage * 100)}%`;
  els.due30Count.textContent = due30;
  els.due60Count.textContent = due60;
  els.due90Count.textContent = due90;
  els.criticalCount.textContent = counts.critical_risk;
  els.watchlistCount.textContent = counts.watchlist;
  els.expansionCount.textContent = counts.expansion_ready;
  els.avgChurn.textContent = total ? `${Math.round((counts.churn / total) * 100)}%` : "0%";
  els.lastRefresh.textContent = `Updated ${new Date().toLocaleString()}`;

  if (metrics) {
    els.rocAuc.textContent = metrics.roc_auc ? metrics.roc_auc.toFixed(3) : "-";
    els.avgPrecision.textContent = metrics.average_precision ? metrics.average_precision.toFixed(3) : "-";
    els.accuracy.textContent = metrics.classification_report?.accuracy
      ? metrics.classification_report.accuracy.toFixed(3)
      : "-";
  }
}

function updateEmployeeSummary(rows) {
  const total = rows.length;
  const balances = rows.map(calculateRemainingBalance);
  const negative = balances.filter((value) => value < 0).length;
  const low = balances.filter((value) => value >= 0 && value <= 5).length;
  const average = total ? balances.reduce((sum, value) => sum + value, 0) / total : 0;

  els.employeeCount.textContent = total;
  els.negativeBalanceCount.textContent = negative;
  els.lowBalanceCount.textContent = low;
  els.avgRemainingBalance.textContent = average.toFixed(2);
}

async function loadDefaultData() {
  try {
    const [scoresResp, metricsResp, employeeResp] = await Promise.all([
      fetch("../outputs/client_risk_scores.csv"),
      fetch("../outputs/churn_model_metrics.json"),
      fetch("../leave_balance_import_sample.csv"),
    ]);
    if (!scoresResp.ok) {
      throw new Error(`Unable to load score CSV: ${scoresResp.status}`);
    }

    const scoresText = await scoresResp.text();
    const metrics = metricsResp.ok ? await metricsResp.json() : null;
    const employeeText = employeeResp.ok ? await employeeResp.text() : "";
    state.rows = parseCSV(scoresText);
    state.metrics = metrics;
    state.employees = employeeText ? parseCSV(employeeText) : [];
    updateUI();
  } catch (error) {
    console.warn("Unable to load default data", error);
    const fallback = await createFallbackRows();
    state.rows = fallback;
    state.metrics = null;
    state.employees = [];
    updateUI();
  }
}

let currentConcern = 0;
let targetConcern = 0;
let animFrame = null;

function computeConcernScore(rows, metrics) {
  const total = rows.length;
  if (!total) return 0;

  const avgChurn = rows.reduce((s, r) => s + number(r.churn_probability), 0) / total;
  const criticalHigh = rows.filter(r => r.risk_segment === "critical_risk" || r.risk_segment === "high_risk").length / total;
  const avgRenewal = rows.reduce((s, r) => s + number(r.renewal_probability), 0) / total;
  const modelScore = metrics?.classification_report?.accuracy ?? 0.5;

  const churnScore = avgChurn * 40;
  const riskScore = criticalHigh * 35;
  const renewalScore = (1 - avgRenewal) * 15;
  const modelScoreComponent = (1 - modelScore) * 10;

  return Math.min(100, Math.round(churnScore + riskScore + renewalScore + modelScoreComponent));
}

function updateConcernMeter(rows, metrics) {
  targetConcern = computeConcernScore(rows, metrics);
  if (!animFrame) animateConcern();
}

function animateConcern() {
  const diff = targetConcern - currentConcern;
  if (Math.abs(diff) < 0.5) {
    currentConcern = targetConcern;
    animFrame = null;
  } else {
    currentConcern += diff * 0.12;
    animFrame = requestAnimationFrame(animateConcern);
  }
  renderConcern(currentConcern);
}

function renderConcern(value) {
  const rounded = Math.round(value);
  if (els.concernFill) els.concernFill.style.width = `${rounded}%`;
  if (els.concernValue) els.concernValue.textContent = `${rounded}%`;

  if (els.healthScore) {
    const health = 100 - rounded;
    els.healthScore.textContent = `${health}%`;
    els.healthScore.className = health >= 70 ? "health-good" : health >= 40 ? "health-warn" : "health-bad";
  }
  if (els.healthLabel) {
    els.healthLabel.textContent = rounded >= 70 ? "High risk — intervene now" : rounded >= 40 ? "Moderate risk — monitor closely" : "Stable — low churn probability";
  }
}

function updateUI() {
  updateSummary(state.rows, state.metrics);
  updateConcernMeter(state.rows, state.metrics);
  renderTable(state.rows);
  renderInsights(state.rows);
  drawRiskChart(state.rows);
  drawScatterChart(state.rows);
  updateEmployeeSummary(state.employees);
  renderEmployeeTable(state.employees);
}

async function createFallbackRows() {
  return [
    {
      client_id: "C00001",
      as_of_date: "2026-07-06",
      renewal_date: "2026-08-06",
      churn_probability: "0.98",
      renewal_probability: "0.03",
      risk_segment: "critical_risk",
      recommended_action: "Launch executive rescue plan, fix blockers, and assign weekly renewal recovery review.",
    },
    {
      client_id: "C00002",
      as_of_date: "2026-07-06",
      renewal_date: "2026-12-13",
      churn_probability: "0.01",
      renewal_probability: "0.99",
      risk_segment: "expansion_ready",
      recommended_action: "Pursue early renewal and expansion conversation.",
    },
    {
      client_id: "C00003",
      as_of_date: "2026-07-06",
      renewal_date: "2026-09-03",
      churn_probability: "0.61",
      renewal_probability: "0.39",
      risk_segment: "high_risk",
      recommended_action: "Run value review, sponsor mapping, and targeted adoption intervention within 2 weeks.",
    },
    {
      client_id: "C00004",
      as_of_date: "2026-07-06",
      renewal_date: "2026-10-11",
      churn_probability: "0.43",
      renewal_probability: "0.57",
      risk_segment: "watchlist",
      recommended_action: "Increase monitoring cadence and resolve adoption, support, or billing friction early.",
    },
  ];
}

function toggleNavigation() {
  const isMobile = window.matchMedia("(max-width: 760px)").matches;
  if (isMobile) {
    document.body.classList.toggle("sidebar-open");
    return;
  }
  document.body.classList.toggle("sidebar-collapsed");
}

els.csvInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  state.rows = parseCSV(text);
  updateUI();
});

els.sidebarToggle.addEventListener("click", toggleNavigation);
els.sidebarToggleTop.addEventListener("click", toggleNavigation);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.body.classList.remove("sidebar-open");
  }
});

window.addEventListener("resize", () => {
  if (!window.matchMedia("(max-width: 760px)").matches) {
    document.body.classList.remove("sidebar-open");
  }
});

els.searchInput.addEventListener("input", () => renderTable(state.rows));
els.employeeSearchInput.addEventListener("input", () => renderEmployeeTable(state.employees));

window.addEventListener("resize", () => {
  drawRiskChart(state.rows);
  drawScatterChart(state.rows);
});

const STORAGE_KEY = "renewalRadarChat";

const chatEls = {
  toggle: document.getElementById("chatToggle"),
  panel: document.getElementById("chatPanel"),
  close: document.getElementById("chatClose"),
  input: document.getElementById("chatInput"),
  send: document.getElementById("chatSend"),
  save: document.getElementById("chatSave"),
  newBtn: document.getElementById("chatNew"),
  mic: document.getElementById("chatMic"),
  tts: document.getElementById("chatTts"),
  messages: document.getElementById("chatMessages"),
  apiKey: document.getElementById("chatApiKey"),
  model: document.getElementById("chatModel"),
  modelCustom: document.getElementById("chatModelCustom"),
  apiBase: document.getElementById("chatApiBase"),
  provider: document.getElementById("chatProvider"),
  badge: document.getElementById("chatModelBadge"),
};

let chatHistory = [];

function addMessage(role, text, save) {
  if (save !== false) {
    chatHistory.push({role, content: text});
  }
  const div = document.createElement("div");
  div.className = `chat-message ${role}`;
  div.innerHTML = `<div class="chat-bubble">${text}</div>`;
  chatEls.messages.appendChild(div);
  chatEls.messages.scrollTop = chatEls.messages.scrollHeight;
  if (save !== false) saveChatHistory();
}

function setTyping(typing) {
  const existing = chatEls.messages.querySelector(".chat-message.typing");
  if (typing) {
    if (existing) return;
    const div = document.createElement("div");
    div.className = "chat-message typing";
    div.innerHTML = `<div class="chat-bubble">Thinking...</div>`;
    div.id = "typingIndicator";
    chatEls.messages.appendChild(div);
    chatEls.messages.scrollTop = chatEls.messages.scrollHeight;
  } else {
    const el = document.getElementById("typingIndicator");
    if (el) el.remove();
  }
}

function saveChatHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chatHistory));
  } catch {}
}

function loadChatHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || parsed.length === 0) return false;
    chatHistory = parsed;
    chatEls.messages.innerHTML = "";
    chatHistory.forEach(m => addMessage(m.role, m.content, false));
    return true;
  } catch {
    return false;
  }
}

function clearChat(showWelcome) {
  chatHistory = [];
  saveChatHistory();
  chatEls.messages.innerHTML = showWelcome !== false
    ? `<div class="chat-message assistant">
        <div class="chat-bubble">Chat cleared. Ask me anything about your data.</div>
      </div>`
    : "";
}

function downloadChat() {
  if (chatHistory.length === 0) return;
  const lines = chatHistory.map(m => {
    const label = m.role === "user" ? "You" : "Assistant";
    return `[${label}]\n${m.content}\n`;
  }).join("\n---\n\n");
  const blob = new Blob([lines], {type: "text/plain"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `renewal-radar-chat-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

const PROVIDERS = {
  groq: { apiBase: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  openai: { apiBase: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  gemini: { apiBase: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash" },
  custom: { apiBase: "", model: "" },
};

const PROVIDER_MODELS = {
  groq: [
    "llama-3.3-70b-versatile", "llama-3.1-8b-instant",
    "mixtral-8x7b-32768", "gemma2-9b-it",
  ],
  openai: [
    "gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo",
    "o1-mini",
  ],
  gemini: [
    "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-pro-exp-03-25",
  ],
};

function populateModels(provider) {
  const select = chatEls.model;
  const customInput = chatEls.modelCustom;
  const models = PROVIDER_MODELS[provider];

  if (provider === "custom") {
    select.style.display = "none";
    customInput.style.display = "";
    return;
  }

  select.style.display = "";
  customInput.style.display = "none";
  select.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join("");
}

function getModelValue() {
  if (chatEls.provider.value === "custom") {
    return chatEls.modelCustom.value.trim() || "llama-3.3-70b-versatile";
  }
  return chatEls.model.value || PROVIDERS[chatEls.provider.value]?.model || "llama-3.3-70b-versatile";
}

function getChatConfig() {
  return {
    apiKey: chatEls.apiKey.value.trim(),
    model: getModelValue(),
    apiBaseUrl: chatEls.apiBase.value.trim() || PROVIDERS[chatEls.provider.value]?.apiBase || "https://api.groq.com/openai/v1",
  };
}

function applyProvider(provider) {
  populateModels(provider);
  if (provider === "custom") return;
  chatEls.apiBase.value = PROVIDERS[provider].apiBase;
}

function saveChatConfig() {
  const cfg = getChatConfig();
  localStorage.setItem("chatApiKey", cfg.apiKey);
  localStorage.setItem("chatModel", cfg.model);
  localStorage.setItem("chatApiBase", cfg.apiBaseUrl);
  localStorage.setItem("chatProvider", chatEls.provider.value);
  updateChatBadge(cfg.apiKey);
}

chatEls.model.addEventListener("change", saveChatConfig);
chatEls.modelCustom.addEventListener("input", saveChatConfig);

function updateChatBadge(apiKey) {
  if (apiKey) {
    const cfg = getChatConfig();
    chatEls.badge.textContent = cfg.model;
    chatEls.badge.style.background = "rgba(90, 215, 164, 0.15)";
    chatEls.badge.style.color = "#5ad7a4";
  } else {
    chatEls.badge.textContent = "No API Key";
    chatEls.badge.style.background = "rgba(255, 103, 130, 0.15)";
    chatEls.badge.style.color = "#ff6782";
  }
}

function loadChatConfig() {
  const key = localStorage.getItem("chatApiKey") || "";
  const provider = localStorage.getItem("chatProvider") || "groq";
  const model = localStorage.getItem("chatModel") || "";
  const base = localStorage.getItem("chatApiBase") || "";
  if (chatEls.apiKey) chatEls.apiKey.value = key;
  if (chatEls.provider) chatEls.provider.value = provider;
  populateModels(provider);
  if (provider === "custom") {
    chatEls.modelCustom.value = model;
  } else {
    if (model && [...chatEls.model.options].some(o => o.value === model)) {
      chatEls.model.value = model;
    }
  }
  chatEls.apiBase.value = base || PROVIDERS[provider]?.apiBase || "";
  saveChatConfig();
  updateChatBadge(key);
}

chatEls.apiKey.addEventListener("input", saveChatConfig);
chatEls.model.addEventListener("input", saveChatConfig);
chatEls.apiBase.addEventListener("input", saveChatConfig);
chatEls.provider.addEventListener("change", () => {
  applyProvider(chatEls.provider.value);
  saveChatConfig();
});

async function sendMessage() {
  const text = chatEls.input.value.trim();
  if (!text) return;

  if (text === "/clear") {
    chatEls.input.value = "";
    clearChat(true);
    return;
  }

  chatEls.input.value = "";
  addMessage("user", text.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  setTyping(true);
  try {
    const cfg = getChatConfig();
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        messages: chatHistory,
        apiKey: cfg.apiKey || undefined,
        model: cfg.model,
        apiBaseUrl: cfg.apiBaseUrl,
        rows: state.rows,
        metrics: state.metrics,
      }),
    });
    const data = await resp.json();
    setTyping(false);
    const rawReply = data.reply || "No response.";
    const reply = rawReply.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    addMessage("assistant", reply);
    const voiceText = rawReply.replace(/[*_#`\[\]]/g, "").replace(/https?:\/\/\S+/g, "a link").slice(0, 600);
    speakText(voiceText);
  } catch {
    setTyping(false);
    addMessage("error", "Could not reach the assistant. Check your API key and connection.");
  }
}

chatEls.toggle.addEventListener("click", () => {
  chatEls.panel.classList.toggle("open");
  chatEls.toggle.classList.toggle("open");
  if (chatEls.panel.classList.contains("open")) chatEls.input.focus();
});

chatEls.close.addEventListener("click", () => {
  chatEls.panel.classList.remove("open");
  chatEls.toggle.classList.remove("open");
});

let ttsEnabled = false;

chatEls.tts.addEventListener("click", () => {
  ttsEnabled = !ttsEnabled;
  chatEls.tts.classList.toggle("active");
  if (ttsEnabled) chatEls.tts.textContent = "🔊";
  else { chatEls.tts.textContent = "🔊"; window.speechSynthesis.cancel(); }
});

let ttsVoice = null;

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  ttsVoice = voices.find(v => /natural|neural| premium/i.test(v.name))
    || voices.find(v => v.lang.startsWith("en") && v.name.includes("Female"))
    || voices.find(v => v.lang.startsWith("en") && v.name.includes("Male"))
    || voices.find(v => v.lang.startsWith("en"))
    || voices[0];
}

if (window.speechSynthesis) {
  pickVoice();
  window.speechSynthesis.onvoiceschanged = pickVoice;
}

function speakText(text) {
  if (!ttsEnabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const cleaned = text.replace(/<[^>]*>/g, "").replace(/[•·]/g, ", ").replace(/\s+/g, " ").trim();
  if (!cleaned) return;
  const utterance = new SpeechSynthesisUtterance(cleaned);
  if (ttsVoice) utterance.voice = ttsVoice;
  utterance.rate = 1.05;
  utterance.pitch = 1.0;
  utterance.volume = 1;
  chatEls.tts.classList.add("speaking");
  utterance.onend = () => chatEls.tts.classList.remove("speaking");
  utterance.onerror = () => chatEls.tts.classList.remove("speaking");
  window.speechSynthesis.speak(utterance);
}

chatEls.send.addEventListener("click", sendMessage);
chatEls.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecording = false;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    chatEls.input.value = transcript;
    chatEls.mic.classList.remove("recording");
    isRecording = false;
    sendMessage();
  };

  recognition.onerror = (event) => {
    chatEls.mic.classList.remove("recording");
    isRecording = false;
    if (event.error === "not-allowed") {
      addMessage("error", "Microphone access denied. Allow microphone access in your browser settings and try again.");
    }
  };
}

chatEls.save.addEventListener("click", downloadChat);
chatEls.newBtn.addEventListener("click", () => {
  if (chatHistory.length > 0 && !confirm("Start a new chat? Current conversation will be cleared.")) return;
  clearChat(true);
});

chatEls.mic.addEventListener("click", () => {
  if (!recognition) {
    chatEls.mic.classList.add("denied");
    if (!chatEls.mic.title) {
      chatEls.mic.title = "Voice input not supported in this browser";
      addMessage("error", "Voice input is not supported in this browser. Try Chrome or Edge.");
    }
    return;
  }
  if (isRecording) {
    try { recognition.stop(); } catch {}
    chatEls.mic.classList.remove("recording");
    isRecording = false;
    return;
  }
  try {
    recognition.start();
    chatEls.mic.classList.add("recording");
    isRecording = true;
  } catch {
    chatEls.mic.classList.remove("recording");
    isRecording = false;
    addMessage("error", "Could not start voice recognition. Make sure your browser supports it and microphone permissions are granted.");
  }
});

loadChatConfig();
if (!loadChatHistory()) clearChat(true);
loadDefaultData();
