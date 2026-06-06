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
  const probingRef = useRef(false);
  const [lossPercent, setLossPercent] = useState(30);
  const [events, setEvents] = useState([]);
  const [jitterMs, setJitterMs] = useState(0);

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
      addEvent(`Injected latency: ${delayMs}ms`);
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
      addEvent("Reset network");
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
      addEvent(`Injected packet loss: ${lossPercent}%`);
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
      addEvent(`Applied preset: ${name}`);
    } finally {
      setLoading(false);
    }
  }

  function getNetworkHealth(status) {
    if (!status) return "Unknown";

    if (status.packet_loss_percent >= 50) return "Broken";
    if (status.packet_loss_percent > 0) return "Degraded";
    if (status.latency_ms >= 500) return "Slow";
    if (status.enabled) return "Faulted";

    return "Healthy";
  }

  function addEvent(message) {
  setEvents((previous) => [
    {
      time: new Date().toLocaleTimeString(),
      message,
    },
    ...previous.slice(0, 9),
  ]);
}

  const networkHealth = getNetworkHealth(status);

  useEffect(() => {
    fetchStatus();
    runProbe();

    const intervalId = setInterval(() => {
      fetchStatus();
      runProbe();
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const successfulProbes = probeHistory.filter((item) => item.success).length;

  const successRate =
    probeHistory.length === 0
      ? 100
      : Math.round((successfulProbes / probeHistory.length) * 100);
  return (
    <main style={styles.page}>
      <h1>Network Playground v0.2</h1>

      <p style={styles.subtitle}>Frontend → API → Redis</p>

      <section style={styles.grid}>
        <Card title="Latency">
          <strong>{status?.latency_ms ?? "-"} ms</strong>
        </Card>

        <Card title="Packet Loss">
          <strong>{status?.packet_loss_percent ?? "-"}%</strong>
        </Card>

        <Card title="Network Health">
          <strong>{networkHealth}</strong>
        </Card>

        <Card title="Probe Duration">
          <strong>
            {probe?.success ? `${probe.duration_ms} ms` : "FAILED"}
          </strong>
        </Card>

        <Card title="Last Probe">
          <strong>{probe?.success ? "Success" : "Failed"}</strong>
        </Card>

        <Card title="Jitter">
          <strong>{status?.jitter_ms ?? "-"} ms</strong>
        </Card>
        <Card title="Success Rate">
          <strong>{successRate}%</strong>
        </Card>
        <Card title="Current Preset">
          <strong>{status?.preset ?? "-"}</strong>
        </Card>
      </section>

      <section style={styles.panel}>
        <h2>Fault Injection</h2>

        <div style={styles.controls}>
          <input
            type="number"
            value={delayMs}
            onChange={(event) => setDelayMs(event.target.value)}
            style={styles.input}
          />

          <input
            type="number"
            value={jitterMs}
            onChange={(event) => setJitterMs(event.target.value)}
            style={styles.input}
          />

          <button onClick={injectLatency} disabled={loading} style={styles.button}>
            Inject Latency
          </button>

          <button onClick={resetNetwork} disabled={loading} style={styles.secondaryButton}> 
            Reset Network
          </button>

          <button onClick={runProbe} disabled={loading} style={styles.secondaryButton}>
            Run Probe
          </button>
        </div>

        <div style={styles.controls}>
          <input
            type="number"
            min="0"
            max="80"
            value={lossPercent}
            onChange={(event) => setLossPercent(event.target.value)}
            style={styles.input}
          />

          <button onClick={injectPacketLoss} disabled={loading} style={styles.button}>
            Inject Packet Loss
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
                max: 600,

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
        <h2>Event Log</h2>

        <div style={styles.historyList}>
          {events.map((event, index) => (
            <div key={index} style={styles.historyItem}>
              <span>{event.time}</span>
              <strong>{event.message}</strong>
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
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
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
  },
  panel: {
    marginTop: "24px",
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "16px",
    padding: "20px",
  },
  controls: {
    display: "flex",
    gap: "12px",
  },
  input: {
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid #475569",
    background: "#0f172a",
    color: "white",
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
