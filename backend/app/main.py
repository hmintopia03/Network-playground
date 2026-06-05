from fastapi import FastAPI
from redis import Redis
import time
import subprocess
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Network Playground")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

redis_client = Redis(host="redis", port=6379, decode_responses=True)

class LatencyRequest(BaseModel):
    delay_ms: int


network_state = {
    "latency_ms": 0,
    "packet_loss_percent": 0,
    "enabled": False,
}

@app.get("/health")
def health():
    redis_client.ping()
    return {"status": "ok", "redis": "connected"}


@app.get("/network/status")
def network_status():
    return network_state

@app.get("/network/probe")
def network_probe():
    start = time.perf_counter()

    redis_client.ping()

    duration_ms = round(
        (time.perf_counter() - start) * 1000,
        2,
    )

    return {
        "duration_ms": duration_ms,
        "success": True,
    }

@app.post("/network/latency")
def inject_latency(request: LatencyRequest):
    subprocess.run(
        [
            "tc",
            "qdisc",
            "replace",
            "dev",
            "eth0",
            "root",
            "netem",
            "delay",
            f"{request.delay_ms}ms",
        ],
        check=True,
    )

    network_state["latency_ms"] = request.delay_ms
    network_state["packet_loss_percent"] = 0
    network_state["enabled"] = True

    return network_state


@app.post("/network/reset")
def reset_network():
    subprocess.run(
        ["tc", "qdisc", "del", "dev", "eth0", "root"],
        check=False,
    )

    network_state["latency_ms"] = 0
    network_state["packet_loss_percent"] = 0
    network_state["enabled"] = False

    return network_state