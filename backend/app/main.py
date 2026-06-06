from fastapi import FastAPI
from redis import Redis
import time
import subprocess
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from fastapi import HTTPException

app = FastAPI(title="Network Playground")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

redis_client = Redis(
    host="redis",
    port=6379,
    decode_responses=True,
    socket_connect_timeout=1,
    socket_timeout=1,
)

class LatencyRequest(BaseModel):
    delay_ms: int
    jitter_ms: int = 0
    
class PacketLossRequest(BaseModel):
    loss_percent: int = Field(..., ge=0, le=80)

class PresetRequest(BaseModel):
    name: str

network_state = {
    "latency_ms": 0,
    "jitter_ms": 0,
    "packet_loss_percent": 0,
    "enabled": False,
    "preset": "normal",
}

PRESETS = {
    "normal": {"latency_ms": 0, "jitter_ms": 0, "packet_loss_percent": 0},
    "slow": {"latency_ms": 500, "jitter_ms": 50, "packet_loss_percent": 0},
    "bad-wifi": {"latency_ms": 200, "jitter_ms": 80, "packet_loss_percent": 10},
    "broken": {"latency_ms": 700, "jitter_ms": 150, "packet_loss_percent": 40},
}

@app.get("/health")
def health():
    redis_client.ping()
    return {"status": "ok", "redis": "connected"}


@app.get("/network/status")
def network_status():
    return network_state

@app.get("/network/probe")
def probe():
    start = time.perf_counter()

    try:
        redis_client.ping()

        duration_ms = round(
            (time.perf_counter() - start) * 1000,
            2,
        )

        return {
            "duration_ms": duration_ms,
            "success": True,
        }

    except Exception:
        return {
            "duration_ms": None,
            "success": False,
        }


@app.post("/network/reset")
def reset_network():
    subprocess.run(
        ["tc", "qdisc", "del", "dev", "eth0", "root"],
        check=False,
    )

    network_state["latency_ms"] = 0
    network_state["packet_loss_percent"] = 0
    network_state["enabled"] = False
    network_state["jitter_ms"] = 0
    network_state["preset"] = "normal"

    return network_state

@app.post("/network/latency")
def inject_latency(request: LatencyRequest):
    command = [
        "tc", "qdisc", "replace", "dev", "eth0",
        "root", "netem",
        "delay", f"{request.delay_ms}ms",
    ]

    if request.jitter_ms > 0:
        command.append(f"{request.jitter_ms}ms")

    try:
        subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"tc failed: {e.stderr}")

    network_state["latency_ms"] = request.delay_ms
    network_state["jitter_ms"] = request.jitter_ms
    network_state["enabled"] = True
    network_state["preset"] = "custom"
    return {"status": "ok", "latency_ms": request.delay_ms}

@app.post("/network/packet-loss")
def inject_packet_loss(request: PacketLossRequest):
    try:
        subprocess.run(
            ["tc", "qdisc", "replace", "dev", "eth0",
             "root", "netem", "loss", f"{request.loss_percent}%"],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"tc failed: {e.stderr}")

    network_state["packet_loss_percent"] = request.loss_percent
    network_state["enabled"] = True
    network_state["preset"] = "custom"
    return {"status": "ok", "loss_percent": request.loss_percent}

@app.post("/network/preset")
def apply_preset(request: PresetRequest):
    
    preset = PRESETS.get(request.name)

    if preset is None:
        raise HTTPException(status_code=400, detail="Unknown preset")

    latency_ms = preset["latency_ms"]
    loss_percent = preset["packet_loss_percent"]
    jitter_ms = preset["jitter_ms"]

    if latency_ms == 0 and loss_percent == 0:
        subprocess.run(
            ["tc", "qdisc", "del", "dev", "eth0", "root"],
            check=False,
        )
    else:
        subprocess.run(
            [
                "tc", "qdisc", "replace", "dev", "eth0",
                "root", "netem",
                "delay", f"{latency_ms}ms", f"{jitter_ms}ms",
                "loss", f"{loss_percent}%",
            ],
            check=True,
        )

    network_state["latency_ms"] = latency_ms
    network_state["packet_loss_percent"] = loss_percent
    network_state["enabled"] = latency_ms > 0 or loss_percent > 0
    network_state["jitter_ms"] = jitter_ms
    network_state["preset"] = request.name

    return network_state