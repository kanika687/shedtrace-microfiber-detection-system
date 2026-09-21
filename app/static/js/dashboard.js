document.addEventListener("DOMContentLoaded", () => {
  const gaugeProgress = document.getElementById("gauge-progress");
  const gaugeValue = document.getElementById("gauge-value");
  const gaugeThreshold = document.getElementById("gauge-threshold");
  const statusBadge = document.getElementById("status-badge");
  const totalWashesNode = document.getElementById("total-washes");
  const lifetimeMgNode = document.getElementById("lifetime-mg");
  const avgMgNode = document.getElementById("avg-mg");
  const timeSinceLastWashNode = document.getElementById("time-since-last-wash");
  const chartBars = document.getElementById("chart-bars");
  const historyList = document.getElementById("history-list");
  const simulateButton = document.getElementById("simulate-wash-btn");
  const cleanFilterButton = document.getElementById("clean-filter-btn");

  const radius = 84;
  const circumference = 2 * Math.PI * radius;
  gaugeProgress.style.strokeDasharray = String(circumference);
  gaugeProgress.style.strokeDashoffset = String(circumference);

  function formatNumber(value, digits = 1) {
    const numeric = Number(value) || 0;
    return numeric.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function upperCaseWords(value) {
    return String(value || "").replace(/(^\w|\s\w)/g, (letter) => letter.toUpperCase());
  }

  function parseISO(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return "No data";
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `${days}d ${hours}h ago`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m ago`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s ago`;
    }
    return `${seconds}s ago`;
  }

  function getGaugeColor(percent) {
    if (percent >= 100) return "#e35d5d";
    if (percent >= 70) return "#f2b63d";
    return "#2bb673";
  }

  function hydrateStatus(status) {
    const threshold = Number(status.threshold_mg || 500);
    const cumulative = Number(status.cumulative_mg || 0);
    const percent = Math.min((cumulative / threshold) * 100, 100);
    const color = getGaugeColor(percent);

    gaugeProgress.setAttribute("stroke", color);
    gaugeProgress.style.strokeDashoffset = String(circumference * (1 - percent / 100));
    gaugeValue.textContent = `${formatNumber(cumulative, 1)} mg`;
    gaugeThreshold.textContent = `of ${formatNumber(threshold, 0)} mg`;

    if (status.filter_full || percent >= 100) {
      statusBadge.textContent = "Filter full";
      statusBadge.style.background = "rgba(227, 93, 93, 0.1)";
      statusBadge.style.color = "#e35d5d";
    } else if (percent >= 70) {
      statusBadge.textContent = "Monitor";
      statusBadge.style.background = "rgba(242, 182, 61, 0.12)";
      statusBadge.style.color = "#f2b63d";
    } else {
      statusBadge.textContent = "Healthy";
      statusBadge.style.background = "rgba(43, 182, 115, 0.1)";
      statusBadge.style.color = "#2bb673";
    }
  }

  function hydrateStats(washes, status) {
    const total = washes.length;
    const lifetime = washes.reduce((sum, wash) => sum + Number(wash.estimated_mg || 0), 0);
    const average = total ? lifetime / total : 0;
    const lastWash = washes
      .slice()
      .sort((a, b) => parseISO(b.timestamp) - parseISO(a.timestamp))[0];

    totalWashesNode.textContent = String(total);
    lifetimeMgNode.textContent = `${formatNumber(Math.max(lifetime, Number(status.cumulative_mg || 0)), 1)} mg`;
    avgMgNode.textContent = `${formatNumber(average, 1)} mg`;

    if (lastWash && lastWash.timestamp) {
      const lastWashDate = parseISO(lastWash.timestamp);
      const now = new Date();
      timeSinceLastWashNode.textContent = formatDuration(now - lastWashDate);
    } else {
      timeSinceLastWashNode.textContent = "No data";
    }
  }

  function hydrateChart(washes) {
    const recent = washes.slice().reverse().slice(0, 10);
    chartBars.innerHTML = "";

    if (!recent.length) {
      chartBars.innerHTML = '<div class="empty-state">No wash samples available yet.</div>';
      return;
    }

    const maxValue = Math.max(...recent.map((wash) => Number(wash.estimated_mg || 0)), 1);
    recent.forEach((wash) => {
      const group = document.createElement("div");
      group.className = "bar-group";

      const value = document.createElement("div");
      value.className = "bar-value";
      value.textContent = formatNumber(Number(wash.estimated_mg || 0), 0);

      const column = document.createElement("div");
      column.className = "bar-column";
      const percentHeight = (Number(wash.estimated_mg || 0) / maxValue) * 100;
      column.style.height = `${Math.max(percentHeight, 12)}%`;

      const label = document.createElement("div");
      label.className = "bar-label";
      const date = parseISO(wash.timestamp) || new Date();
      label.textContent = `${date.getMonth() + 1}/${date.getDate()}`;

      group.appendChild(value);
      group.appendChild(column);
      group.appendChild(label);
      chartBars.appendChild(group);
    });
  }

  function hydrateHistory(washes, resets) {
    const merged = [
      ...washes.map((wash) => ({ ...wash, kind: "wash" })),
      ...resets.map((reset) => ({ ...reset, kind: "reset" })),
    ].sort((a, b) => {
      const aTime = parseISO(a.timestamp) || new Date(0);
      const bTime = parseISO(b.timestamp) || new Date(0);
      return bTime - aTime;
    });

    historyList.innerHTML = "";

    if (!merged.length) {
      historyList.innerHTML = '<div class="empty-state">No events yet. Your device is waiting for its first wash cycle.</div>';
      return;
    }

    merged.forEach((entry) => {
      const item = document.createElement("div");
      item.className = `history-item ${entry.kind === "reset" ? "reset" : ""}`;

      const icon = document.createElement("div");
      icon.className = "history-icon";
      icon.textContent = entry.kind === "reset" ? "R" : "W";

      const copy = document.createElement("div");
      copy.className = "history-copy";

      const title = document.createElement("p");
      title.className = "history-title";
      title.textContent = entry.kind === "reset" ? "Filter reset" : "Wash cycle";

      const desc = document.createElement("p");
      desc.className = "history-desc";
      desc.textContent = entry.kind === "reset"
        ? "Cumulative microfiber count cleared to 0."
        : `${formatNumber(Number(entry.estimated_mg || 0), 1)} mg captured`;

      const meta = document.createElement("div");
      meta.className = "history-meta";

      const time = document.createElement("span");
      const date = parseISO(entry.timestamp);
      time.textContent = date ? date.toLocaleString() : "Unknown time";

      const tag = document.createElement("span");
      tag.className = "history-tag";
      tag.textContent = entry.source === "simulated" ? "Simulated" : (entry.kind === "reset" ? "Reset" : "Live");

      meta.appendChild(time);
      meta.appendChild(tag);

      copy.appendChild(title);
      copy.appendChild(desc);
      copy.appendChild(meta);

      item.appendChild(icon);
      item.appendChild(copy);
      historyList.appendChild(item);
    });
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();

    if (!response.ok) {
      throw new Error(typeof body === "string" ? body : (body.error || "Request failed"));
    }

    return body;
  }

  async function loadDashboard() {
    try {
      const [statusResponse, washesResponse, resetsResponse] = await Promise.all([
        fetchJson("/api/status"),
        fetchJson("/api/washes"),
        fetchJson("/api/resets"),
      ]);

      const status = statusResponse || {};
      const washes = Array.isArray(washesResponse.washes) ? washesResponse.washes : [];
      const resets = Array.isArray(resetsResponse.resets) ? resetsResponse.resets : [];

      hydrateStatus(status);
      hydrateStats(washes, status);
      hydrateChart(washes);
      hydrateHistory(washes, resets);
    } catch (error) {
      chartBars.innerHTML = '<div class="empty-state">Unable to load real Firebase data. Configure your Firebase service account and database URL to start monitoring.</div>';
      historyList.innerHTML = '<div class="empty-state">No data available yet.</div>';
      gaugeValue.textContent = "0.0 mg";
      gaugeThreshold.textContent = "of 500 mg";
      statusBadge.textContent = "Offline";
      statusBadge.style.background = "rgba(10, 34, 64, 0.08)";
      statusBadge.style.color = "#0a2240";
      totalWashesNode.textContent = "0";
      lifetimeMgNode.textContent = "0 mg";
      avgMgNode.textContent = "0 mg";
      timeSinceLastWashNode.textContent = "No data";
      console.error(error);
    }
  }

  simulateButton.addEventListener("click", async () => {
    simulateButton.disabled = true;
    simulateButton.textContent = "Simulating...";

    try {
      const result = await fetchJson("/api/simulate-wash", { method: "POST" });
      if (!result.success) {
        throw new Error(result.error || "Failed to simulate wash");
      }
      await loadDashboard();
    } catch (error) {
      alert(error.message || "Unable to simulate a wash.");
    } finally {
      simulateButton.disabled = false;
      simulateButton.textContent = "Simulate a wash";
    }
  });

  cleanFilterButton.addEventListener("click", async () => {
    cleanFilterButton.disabled = true;
    cleanFilterButton.textContent = "Resetting...";

    try {
      const result = await fetchJson("/api/clean-filter", { method: "POST" });
      if (!result.success) {
        throw new Error(result.error || "Failed to clean filter");
      }
      await loadDashboard();
    } catch (error) {
      alert(error.message || "Unable to clean the filter.");
    } finally {
      cleanFilterButton.disabled = false;
      cleanFilterButton.textContent = "Clean filter";
    }
  });

  loadDashboard();
  setInterval(loadDashboard, 15000);
});
