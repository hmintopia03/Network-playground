# Network Playground

Interactive network failure lab for simulating latency, jitter, and packet loss.

## Features

- FastAPI backend
- React dashboard
- Redis probe target
- Docker Compose setup
- Latency injection with Linux `tc`/`netem`
- Jitter simulation
- Packet loss simulation
- Network health status
- Probe duration chart
- Success rate tracking
- Event log and presets

## Architecture

```text
Frontend
   ↓
FastAPI Backend
   ↓
Redis
```

Network faults are injected inside the backend container using `tc`/`netem`.

## Screenshots


## Run

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8000

## API

| Method | Endpoint                | Description                          |
| ------ | ----------------------- | ------------------------------------ |
| GET    | `/health`               | Health check (backend + Redis)       |
| GET    | `/network/status`       | Current network fault state          |
| GET    | `/network/probe`        | Run a probe against Redis            |
| POST   | `/network/latency`      | Inject latency (and optional jitter) |
| POST   | `/network/packet-loss`  | Inject packet loss                   |
| POST   | `/network/preset`       | Apply a named preset                 |
| POST   | `/network/reset`        | Clear all injected faults            |

### Examples

```bash
curl -X POST http://localhost:8000/network/latency \
  -H "Content-Type: application/json" \
  -d '{"delay_ms":500,"jitter_ms":100}'

curl -X POST http://localhost:8000/network/packet-loss \
  -H "Content-Type: application/json" \
  -d '{"loss_percent":30}'

curl -X POST http://localhost:8000/network/preset \
  -H "Content-Type: application/json" \
  -d '{"name":"bad-wifi"}'
```

## Presets

| Preset     | Latency | Jitter | Packet Loss |
| ---------- | ------- | ------ | ----------- |
| `normal`   | 0ms     | 0ms    | 0%          |
| `slow`     | 500ms   | 50ms   | 0%          |
| `bad-wifi` | 200ms   | 80ms   | 10%         |
| `broken`   | 700ms   | 150ms  | 40%         |

## Notes

This project requires Linux networking support and the `NET_ADMIN` capability
in Docker (e.g. `cap_add: [NET_ADMIN]` in `docker-compose.yml`).