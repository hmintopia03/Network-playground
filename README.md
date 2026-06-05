# Network Playground

Inject network faults and observe their impact in real time.

## Features

- Latency injection using Linux tc/netem
- Real-time network status dashboard
- Probe endpoint for measuring response time
- Live latency trend graph (Chart.js)
- Docker Compose environment
- FastAPI backend
- Redis integration

## Screenshot

(스크린샷 넣기)

## Architecture

```
Frontend (React)
       ↓
   FastAPI API
       ↓
     Redis
```

Network faults simulated with tc/netem

## Endpoints

### Health

```
GET /health
```

### Network

```
GET  /network/status
GET  /network/probe
POST /network/latency
POST /network/reset
```

## Run

```bash
docker compose up --build
```

Frontend:

```
http://localhost:5173
```

Backend:

```
http://localhost:8000
```

## Example

Inject 500ms latency:

```bash
curl -X POST http://localhost:8000/network/latency \
  -H "Content-Type: application/json" \
  -d '{"delay_ms":500}'
```

Reset:

```bash
curl -X POST http://localhost:8000/network/reset
```