const locale = "ar-BH";

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

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length <= 1) {
    return [];
  }

  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).reduce((rows, line) => {
    if (!line.trim()) {
      return rows;
    }

    const values = splitCSVLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    rows.push(row);
    return rows;
  }, []);
}

function number(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function daysUntilRenewal(value) {
  const date = parseDate(value);
  if (!date) {
    return null;
  }

  const diff = date.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatPercent(value) {
  return `${formatNumber(value * 100)}%`;
}

function formatDate(value) {
  const date = parseDate(value);
  return date ? date.toLocaleDateString(locale) : value || "";
}

function remainingBalance(employee) {
  return (
    number(employee.opening_balance) +
    number(employee.entitlement_days) +
    number(employee.time_off_in_lieu) -
    number(employee.used_days)
  );
}

function segmentLabel(segment) {
  const labels = {
    critical_risk: "خطر حرج",
    high_risk: "خطر مرتفع",
    watchlist: "قائمة مراقبة",
    healthy: "مستقر",
    expansion_ready: "جاهز للتوسع",
  };
  return labels[segment] || segment;
}

function actionBucketRows(rows) {
  return [
    {
      title: "إنقاذ فوري",
      segment: "critical_risk",
      description: "تصعيد مباشر وإزالة العوائق قبل اقتراب قرار التجديد.",
      count: rows.filter((row) => row.risk_segment === "critical_risk").length,
    },
    {
      title: "تدخل مركز",
      segment: "high_risk",
      description: "مراجعة قيمة، تغطية الرعاة، وتمكين موجه للحسابات المتعثرة.",
      count: rows.filter((row) => row.risk_segment === "high_risk").length,
    },
    {
      title: "مراقبة نشطة",
      segment: "watchlist",
      description: "متابعة التبني والدعم قبل تحولهما إلى خطر فقدان.",
      count: rows.filter((row) => row.risk_segment === "watchlist").length,
    },
    {
      title: "حركة توسع",
      segment: "expansion_ready",
      description: "تثبيت التجديد المبكر ثم فتح محادثة التوسع في الوقت المناسب.",
      count: rows.filter((row) => row.risk_segment === "expansion_ready").length,
    },
  ];
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function renderOverview(rows, metrics) {
  const total = rows.length;
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

  setText("overviewAccountCount", `${formatNumber(total)} حساب`);
  setText("overviewRefresh", `تم التحديث ${new Date().toLocaleString(locale)}`);
  setText("overviewDue30", formatNumber(due30));
  setText("overviewDue60", formatNumber(due60));
  setText("overviewDue90", formatNumber(due90));
  setText("overviewRenewalAvg", formatPercent(renewalAverage));

  if (metrics) {
    setText("overviewRocAuc", metrics.roc_auc ? metrics.roc_auc.toFixed(3) : "-");
    setText("overviewAvgPrecision", metrics.average_precision ? metrics.average_precision.toFixed(3) : "-");
  }
}

function renderRisk(rows) {
  const sorted = [...rows].sort((a, b) => number(b.churn_probability) - number(a.churn_probability));
  const critical = rows.filter((row) => row.risk_segment === "critical_risk").length;
  const high = rows.filter((row) => row.risk_segment === "high_risk").length;

  setText("riskCriticalCount", formatNumber(critical));
  setText("riskHighCount", formatNumber(high));

  const container = document.getElementById("riskTopList");
  if (!container) {
    return;
  }

  container.innerHTML = sorted
    .slice(0, 5)
    .map((row) => {
      const days = daysUntilRenewal(row.renewal_date);
      const subtitle = days == null ? "موعد التجديد غير متاح" : `متبقي ${formatNumber(days)} يومًا`;
      return `
        <div class="list-item">
          <h3>${row.client_id} - ${segmentLabel(row.risk_segment)}</h3>
          <small>${subtitle} | خطر ${formatPercent(number(row.churn_probability))} | تجديد ${formatPercent(number(row.renewal_probability))}</small>
          <p class="lede">${row.recommended_action}</p>
        </div>
      `;
    })
    .join("");
}

function renderActions(rows) {
  const container = document.getElementById("actionList");
  if (!container) {
    return;
  }

  container.innerHTML = actionBucketRows(rows)
    .map(
      (item) => `
        <div class="list-item">
          <h3>${item.title}</h3>
          <small>${formatNumber(item.count)} حساب</small>
          <p class="lede">${item.description}</p>
        </div>
      `
    )
    .join("");
}

function renderClients(rows) {
  const tbody = document.getElementById("clientsTableBody");
  if (!tbody) {
    return;
  }

  tbody.innerHTML = [...rows]
    .sort((a, b) => number(b.churn_probability) - number(a.churn_probability))
    .slice(0, 12)
    .map(
      (row) => `
        <tr>
          <td>${row.client_id}</td>
          <td>${formatPercent(number(row.churn_probability))}</td>
          <td>${formatPercent(number(row.renewal_probability))}</td>
          <td>${segmentLabel(row.risk_segment)}</td>
          <td>${formatDate(row.renewal_date)}</td>
        </tr>
      `
    )
    .join("");
}

function renderEmployees(rows) {
  const total = rows.length;
  const balances = rows.map(remainingBalance);
  const negative = balances.filter((value) => value < 0).length;
  const low = balances.filter((value) => value >= 0 && value <= 5).length;
  const average = total ? balances.reduce((sum, value) => sum + value, 0) / total : 0;

  setText("employeeTotal", formatNumber(total));
  setText("employeeNegative", formatNumber(negative));
  setText("employeeLow", formatNumber(low));
  setText("employeeAverage", formatNumber(average, 1));

  const tbody = document.getElementById("employeesTableBody");
  if (!tbody) {
    return;
  }

  tbody.innerHTML = [...rows]
    .sort((a, b) => remainingBalance(a) - remainingBalance(b))
    .map(
      (row) => `
        <tr>
          <td>${row.full_name}</td>
          <td>${row.department || ""}</td>
          <td>${formatNumber(number(row.entitlement_days))}</td>
          <td>${formatNumber(number(row.used_days), 2)}</td>
          <td>${formatNumber(remainingBalance(row), 2)}</td>
        </tr>
      `
    )
    .join("");
}

async function loadData() {
  const scoresUrl = new URL("../../../outputs/client_risk_scores.csv", window.location.href);
  const metricsUrl = new URL("../../../outputs/churn_model_metrics.json", window.location.href);
  const employeeUrl = new URL("../../../leave_balance_import_sample.csv", window.location.href);

  const [scoresResp, metricsResp, employeesResp] = await Promise.all([
    fetch(scoresUrl),
    fetch(metricsUrl),
    fetch(employeeUrl),
  ]);

  const rows = scoresResp.ok ? parseCSV(await scoresResp.text()) : [];
  const metrics = metricsResp.ok ? await metricsResp.json() : null;
  const employees = employeesResp.ok ? parseCSV(await employeesResp.text()) : [];

  renderOverview(rows, metrics);
  renderRisk(rows);
  renderActions(rows);
  renderClients(rows);
  renderEmployees(employees);
}

loadData().catch((error) => {
  console.warn("Unable to load Arabic dashboard data", error);
});
