import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
 
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);
 
const API_BASE = "http://localhost:8000";
 
function App() {
  const [status, setStatus] = useState(null);
  const [probe, setProbe] = useState(null);
  const [delayMs, setDelayMs] = useState(500);
  const [loading, setLoading] = useState(false);
  const [probeHistory, setProbeHistory] = useState([]);
  const probingRef = useRef(false);
 
  async function fetchStatus() {
    const res = await fetch(`${API_BASE}/network/status`);
    const data = await res.json();
    setStatus(data);
  }
 
  async function runProbe() {
    if (probingRef.current) return;
 
    probingRef.current = true;
 
    try {
      const res = await fetch(`${API_BASE}/network/probe`);
      const data = await res.json();
 
      console.log("probe:", data.duration_ms);
 
      setProbe(data);
 
      setProbeHistory((previous) => [
        ...previous.slice(-19),
        {
          time: new Date().toLocaleTimeString(),
          duration_ms: data.duration_ms,
          success: data.success,
        },
      ]);
    } finally {
      probingRef.current = false;
    }
  }
 
  async function injectLatency() {
    setLoading(true);
 
    await fetch(`${API_BASE}/network/latency`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        delay_ms: Number(delayMs),
      }),
    });
 
    await fetchStatus();
    await runProbe();
    setLoading(false);
  }
 
  async function resetNetwork() {
    setLoading(true);
 
    await fetch(`${API_BASE}/network/reset`, {
      method: "POST",
    });
 
    await fetchStatus();
    await runProbe();
    setLoading(false);
  }
 
  useEffect(() => {
    fetchStatus();
    runProbe();
 
    const intervalId = setInterval(() => {
      fetchStatus();
      runProbe();
    }, 1000);
 
    return () => clearInterval(intervalId);
  }, []);
 
  return (
    <main style={styles.page}>
      <h1>Network Playground v0.1</h1>
 
      <p style={styles.subtitle}>Frontend → API → Redis</p>
 
      <section style={styles.grid}>
        <Card title="Latency">
          <strong>{status?.latency_ms ?? "-"} ms</strong>
        </Card>
 
        <Card title="Packet Loss">
          <strong>{status?.packet_loss_percent ?? "-"}%</strong>
        </Card>
 
        <Card title="Network Fault">
          <strong>{status?.enabled ? "Enabled" : "Disabled"}</strong>
        </Card>
 
        <Card title="Probe Duration">
          <strong>{probe?.duration_ms ?? "-"} ms</strong>
        </Card>
      </section>
 
      <section style={styles.panel}>
        <h2>Inject Latency</h2>
 
        <div style={styles.controls}>
          <input
            type="number"
            value={delayMs}
            onChange={(event) => setDelayMs(event.target.value)}
            style={styles.input}
          />
 
          <button onClick={injectLatency} disabled={loading} style={styles.button}>
            Inject
          </button>
 
          <button onClick={resetNetwork} disabled={loading} style={styles.secondaryButton}>
            Reset
          </button>
 
          <button onClick={runProbe} disabled={loading} style={styles.secondaryButton}>
            Probe
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
                data: probeHistory.map((item) => item.duration_ms),
 
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
              <strong>{item.duration_ms} ms</strong>
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
};
 
createRoot(document.getElementById("root")).render(<App />);
