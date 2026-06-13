import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

import { Line } from "react-chartjs-2";
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const API_BASE = "http://localhost:8000";

function App() {
  const [status, setStatus] = useState(null);
  const [probe, setProbe] = useState(null);
  const [delayMs, setDelayMs] = useState(500);
  const [loading, setLoading] = useState(false);
  const [probeHistory, setProbeHistory] = useState([]);
  const [lossPercent, setLossPercent] = useState(30);
  const [events, setEvents] = useState([]);
  const [jitterMs, setJitterMs] = useState(0);
  const probingRef = useRef(false);
  const previousProbeSuccessRef = useRef(true);


  async function fetchStatus() {
    const res = await fetch(`${API_BASE}/network/status`);
    const data = await res.json();
    setStatus(data);
  }

  async function runProbe() {
    if (probingRef.current) return;

    probingRef.current = true;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);

    try {
      const res = await fetch(`${API_BASE}/network/probe`, {
        signal: controller.signal,
      });

      const data = await res.json();

      setProbe(data);

      if (previousProbeSuccessRef.current && !data.success) {
        addEvent("PROBE FAILED", "Connection timeout");
      }

      if (!previousProbeSuccessRef.current && data.success) {
        addEvent("PROBE RECOVERED", `${data.duration_ms}ms`);
      }

      previousProbeSuccessRef.current = data.success;

      setProbeHistory((previous) => [
        ...previous.slice(-19),
        {
          time: new Date().toLocaleTimeString(),
          duration_ms: data.duration_ms,
          success: data.success,
        },
      ]);
    } catch {
      const failedProbe = {
        duration_ms: null,
        success: false,
      };

      setProbe(failedProbe);

      if (previousProbeSuccessRef.current) {
        addEvent("PROBE FAILED", "Request timeout");
      }

      previousProbeSuccessRef.current = false;

      setProbeHistory((previous) => [
        ...previous.slice(-19),
        {
          time: new Date().toLocaleTimeString(),
          duration_ms: null,
          success: false,
        },
      ]);
    } finally {
      clearTimeout(timeoutId);
      probingRef.current = false;
    }
  }

  async function injectLatency() {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/network/latency`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          delay_ms: Number(delayMs),
          jitter_ms: Number(jitterMs),
        }),
      });
      await fetchStatus();
      await runProbe();
      addEvent(
        "LATENCY",
        Number(jitterMs) > 0 ? `${delayMs}ms ±${jitterMs}ms` : `${delayMs}ms`
      );
    } finally {
      setLoading(false);
    }
  }

  async function resetNetwork() {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/network/reset`, {
        method: "POST",
      });
      await fetchStatus();
      await runProbe();
      addEvent("RESET", "Network restored");
    } finally {
      setLoading(false);
    }
  }

  async function injectPacketLoss() {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/network/packet-loss`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          loss_percent: Number(lossPercent),
        }),
      });
      await fetchStatus();
      await runProbe();
      addEvent("PACKET LOSS", `${lossPercent}%`);
    } finally {
      setLoading(false);
    }
  }

  async function applyPreset(name) {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/network/preset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });
      await fetchStatus();
      await runProbe();
      addEvent("PRESET", formatPresetName(name));
    } finally {
      setLoading(false);
    }
  }

  function getNetworkHealth(status) {
    if (!status) return "Unknown";

    const loss = status.packet_loss_percent ?? 0;
    const latency = status.latency_ms ?? 0;
    const jitter = status.jitter_ms ?? 0;

    if (loss >= 50) return "Broken";
    if (latency >= 500 || jitter >= 100) return "Slow";
    if (loss > 0) return "Degraded";

    return "Healthy";
  }

  function addEvent(type, detail) {
    const newEvent = { time: new Date().toLocaleTimeString(), type, detail };
    setEvents((previous) => [newEvent, ...previous].slice(0, 50));
  }

  function formatPresetName(preset) {
    const names = {
      normal: "Normal",
      slow: "Slow Network",
      "bad-wifi": "Bad WiFi",
      broken: "Broken Network",
      custom: "Custom",
    };

    return names[preset] ?? "-";
  }

  function getHealthColor(health) {
    switch (health) {
      case "Healthy":
        return "#22c55e";
      case "Slow":
        return "#eab308";
      case "Degraded":
        return "#f97316";
      case "Broken":
        return "#ef4444";
      case "Faulted":
        return "#f97316";
      default:
        return "white";
    }
  }

  function getEventColor(type) {
    switch (type) {
      case "LATENCY":
        return "#38bdf8";
      case "PACKET LOSS":
        return "#f97316";
      case "PRESET":
        return "#a855f7";
      case "RESET":
        return "#22c55e";
      case "PROBE FAILED":
        return "#ef4444";
      case "PROBE RECOVERED":
        return "#22c55e";
      default:
        return "#94a3b8";
    }
  }

  function getSuccessRateColor(rate) {
  if (rate >= 90) return "#22c55e";
  if (rate >= 60) return "#eab308";
  return "#ef4444";
}

  const networkHealth = getNetworkHealth(status);
  const healthColor = getHealthColor(networkHealth);

  useEffect(() => {
    fetchStatus();
    runProbe();

    const intervalId = setInterval(() => {
      fetchStatus();
      runProbe();
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const totalProbes = probeHistory.length;
  const successfulProbes = probeHistory.filter((item) => item.success).length;
  const failures = totalProbes - successfulProbes;

  const successRate =
    totalProbes === 0
      ? 100
      : Math.round((successfulProbes / totalProbes) * 100);

  return (
    <main style={styles.page}>
      <h1>Network Playground v0.2</h1>

      <p style={styles.subtitle}>Frontend → API → Redis</p>

      <section style={styles.grid}>
        <Card title="Latency">
          <strong>{status?.latency_ms ?? "-"} ms</strong>
          <span style={styles.cardSub}>
            jitter ±{status?.jitter_ms ?? 0} ms
          </span>
        </Card>

        <Card title="Packet Loss">
          <strong>{status?.packet_loss_percent ?? "-"}%</strong>
        </Card>

        <Card title="Network Health">
          <div style={styles.healthRow}>
            <span style={{ ...styles.healthDot, background: healthColor }} />
            <strong style={{ color: healthColor }}>{networkHealth}</strong>
          </div>
        </Card>

        <Card title="Current Preset">
          <strong>{formatPresetName(status?.preset)}</strong>
        </Card>

        <Card title="Last Result">
          <strong>
            {probe?.success ? `${probe.duration_ms} ms` : "FAILED"}
          </strong>
        </Card>

        <Card title="Success Rate">
          <strong style={{ color: getSuccessRateColor(successRate) }}>
            {successRate}%
          </strong>
        </Card>

        <Card title="Total Probes">
          <strong>{totalProbes}</strong>
        </Card>

        <Card title="Failures">
          <strong style={{ color: failures > 0 ? "#ef4444" : "white" }}>
            {failures}
          </strong>
        </Card>
      </section>

      <section style={styles.panel}>
        <h2>Fault Injection</h2>

        <div style={styles.controls}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Latency (ms)</span>
            <input
              type="number"
              value={delayMs}
              onChange={(event) => setDelayMs(event.target.value)}
              style={styles.input}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Jitter (ms)</span>
            <input
              type="number"
              min="0"
              value={jitterMs}
              onChange={(event) => setJitterMs(event.target.value)}
              style={styles.input}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Packet Loss (%)</span>
            <input
              type="number"
              min="0"
              max="80"
              value={lossPercent}
              onChange={(event) => setLossPercent(event.target.value)}
              style={styles.input}
            />
          </label>
        </div>

        <div style={styles.buttonRow}>
          <button onClick={injectLatency} disabled={loading} style={styles.button}>
            Inject Latency
          </button>

          <button onClick={injectPacketLoss} disabled={loading} style={styles.button}>
            Inject Packet Loss
          </button>

          <button onClick={resetNetwork} disabled={loading} style={styles.secondaryButton}>
            Reset Network
          </button>

          <button onClick={runProbe} disabled={loading} style={styles.secondaryButton}>
            Run Probe
          </button>
        </div>

        <div style={styles.presetRow}>
          <button onClick={() => applyPreset("normal")} disabled={loading} style={styles.secondaryButton}>
            Normal
          </button>

          <button onClick={() => applyPreset("slow")} disabled={loading} style={styles.secondaryButton}>
            Slow Network
          </button>

          <button onClick={() => applyPreset("bad-wifi")} disabled={loading} style={styles.secondaryButton}>
            Bad WiFi
          </button>

          <button onClick={() => applyPreset("broken")} disabled={loading} style={styles.secondaryButton}>
            Broken Network
          </button>
        </div>
      </section>

      <section style={styles.panel}>
        <h2>Latency Trend</h2>

        <Line
          data={{
            labels: probeHistory.map((item) => item.time),

            datasets: [
              {
                label: "Probe duration ms",
                data: probeHistory.map((item) =>
                  item.success ? item.duration_ms : null
                ),
                borderColor: "#38bdf8",
                backgroundColor: "rgba(56,189,248,0.2)",
                borderWidth: 3,
                pointRadius: 4,
                pointHoverRadius: 6,
                tension: 0.3,
                fill: true,
              },
              {
                label: "Failed probe",
                data: probeHistory.map((item) =>
                  item.success ? null : 1000
                ),
                borderColor: "#ef4444",
                backgroundColor: "#ef4444",
                pointRadius: 6,
                pointHoverRadius: 8,
                showLine: false,
              },
            ],
          }}
          options={{
            responsive: true,

            plugins: {
              legend: {
                labels: {
                  color: "#e2e8f0",
                },
              },
            },

            scales: {
              x: {
                ticks: {
                  color: "#94a3b8",
                },
                grid: {
                  color: "#334155",
                },
              },

              y: {
                min: 0,
                suggestedMax: 1000,

                ticks: {
                  color: "#94a3b8",
                },

                grid: {
                  color: "#334155",
                },
              },
            },
          }}
        />
      </section>

      <section style={styles.panel}>
        <h2>Recent Probes</h2>

        <div style={styles.historyList}>
          {probeHistory.map((item, index) => (
            <div key={index} style={styles.historyItem}>
              <span>{item.time}</span>
              <strong>
                {item.success ? `${item.duration_ms} ms` : "FAILED"}
              </strong>
            </div>
          ))}
        </div>
      </section>

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <h2 style={{ margin: 0 }}>Event Log</h2>
          <button onClick={() => setEvents([])} style={styles.secondaryButton}>
            Clear
          </button>
        </div>
        <div style={styles.historyList}>
          {events.map((event, index) => (
            <div key={index} style={styles.historyItem}>
              <span>{event.time}</span>
              <span>
                <strong
                  style={{
                    color: getEventColor(event.type),
                    fontWeight: "bold",
                  }}
                >
                  {event.type}
                </strong>
                <span style={{ opacity: 0.4, margin: "0 8px" }}>|</span>
                {event.detail}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Card({ title, children }) {
  return (
    <div style={styles.card}>
      <p style={styles.cardTitle}>{title}</p>
      <div style={styles.cardValue}>{children}</div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: "40px",
    fontFamily: "system-ui, sans-serif",
    background: "#0f172a",
    color: "white",
  },
  subtitle: {
    color: "#94a3b8",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
    marginTop: "32px",
  },
  card: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "16px",
    padding: "20px",
  },
  cardTitle: {
    margin: 0,
    color: "#94a3b8",
    fontSize: "14px",
  },
  cardValue: {
    marginTop: "12px",
    fontSize: "28px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  cardSub: {
    fontSize: "12px",
    color: "#64748b",
    fontWeight: "normal",
  },
  healthRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  healthDot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    display: "inline-block",
  },
  panel: {
    marginTop: "24px",
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "16px",
    padding: "20px",
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },
  controls: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  fieldLabel: {
    fontSize: "12px",
    color: "#94a3b8",
  },
  input: {
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid #475569",
    background: "#0f172a",
    color: "white",
  },
  buttonRow: {
    display: "flex",
    gap: "12px",
    marginTop: "16px",
    flexWrap: "wrap",
  },
  button: {
    padding: "10px 16px",
    borderRadius: "10px",
    border: "none",
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "10px 16px",
    borderRadius: "10px",
    border: "1px solid #475569",
    background: "#0f172a",
    color: "white",
    cursor: "pointer",
  },
  historyList: {
    display: "grid",
    gap: "8px",
  },
  historyItem: {
    display: "flex",
    justifyContent: "space-between",
    padding: "10px 12px",
    borderRadius: "10px",
    background: "#0f172a",
    border: "1px solid #334155",
  },
  presetRow: {
    display: "flex",
    gap: "12px",
    marginTop: "16px",
    flexWrap: "wrap",
  },
};

createRoot(document.getElementById("root")).render(<App />);