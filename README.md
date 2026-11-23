# AuraCall - Low-Bandwidth Resilient Live Video Call Application

A high-performance live video call web application designed to maintain **uninterrupted, crystal-clear video and audio even under severe network constraints (2G/3G, high jitter, and up to 35% packet loss)**.

Features **Email Authentication via SLM Mailer**, **JWT Token Authorization**, **WebSocket Signaling**, and a **Microservices Architecture with Nginx API Gateway**.

---

## 🏛️ System Architecture

```text
                               +----------------------------+
                               |     Client Web Browser     |
                               +--------------+-------------+
                                              |
                             HTTPS / WSS      | (Port 80/443)
                                              v
                              +---------------+------------+
                              |   Nginx Reverse Proxy /    |
                              |        API Gateway         |
                              +---------------+------------+
                                              |
        +-----------------------+-------------+-------------+-----------------------+
        |                       |                           |                       |
        v /api/v1/auth          v /ws/ (WebSockets)         v / (Static/SPA)        v (WebRTC UDP)
+-------+--------+     +--------+---------+        +--------+--------+     +--------+--------+
|  Auth Service  |     | Signaling Service|        |    Frontend     |     |   SFU Server    |
| (Node.js/Go)   |     | (WebSockets/WS)  |        | (React + Vite)  |     | (Mediasoup/RTC) |
+-------+--------+     +------------------+        +-----------------+     +-----------------+
        |
        +-----> [Redis Cache] (OTP TTL: 300s, Rate Limiting)
        |
        +-----> [SLM Mailer Service] (AI-Generated Contextual Verification Mail)
```

---

## 🚀 Low-Network Resilience Strategy (Why it works on poor networks)

1. **Simulcast & SVC (Scalable Video Coding)**:
   - Dynamic 3-tier stream publishing:
     - **Broadband (HD)**: 1280x720 @ 30fps (~800-1200 kbps)
     - **Good 4G (SD)**: 640x360 @ 24fps (~250-480 kbps)
     - **Weak Signal (Low)**: 320x180 @ 15fps (~80-140 kbps)
     - **Critical / 2G (Audio-Only)**: Automatically suspends video stream to prioritize voice without drops.
2. **Audio-First with Opus In-band FEC & DTX**:
   - `inbandfec=1`: Forward Error Correction recovers up to 30% lost audio packets without audible glitches.
   - `usedtx=1`: Discontinuous Transmission saves bandwidth during silent pauses.
3. **Transport-Wide Congestion Control (TWCC/GCC)**:
   - Dynamic real-time bandwidth estimation prevents network bufferbloat.
4. **Selective NACK & RTX**:
   - Retransmits only crucial keyframes instead of lagging the full media pipeline.

---

## 🔐 SLM Mailer Authentication Flow

1. User submits Email ID on Frontend.
2. Frontend requests OTP: `POST /api/v1/auth/request-otp`.
3. **Auth Service** generates a cryptographic 6-digit OTP and caches it in Redis (`EX 300`).
4. **Auth Service** triggers the **SLM Mailer Service** (`POST /api/slm/send-mail`).
5. SLM generates a natural, contextual verification email and sends it to the user's inbox.
6. User enters the OTP.
7. Auth Service verifies the OTP from Redis and issues a signed **JWT Access Token**.
8. JWT is passed in the query parameter during WebSocket signaling handshake (`/ws?token=<JWT>`).

---

## 📁 Project Structure

```text
live videocalls/
├── frontend/                     # React 18 + TypeScript + Vite + Tailwind CSS
│   ├── src/
│   │   ├── components/
│   │   │   ├── AuthModal.tsx     # SLM Email + OTP verification UI
│   │   │   ├── Lobby.tsx         # Pre-call device preview & room launch
│   │   │   ├── VideoRoom.tsx     # HD Video Call arena with PiP & Controls
│   │   │   ├── Controls.tsx      # Mic, Cam, Screen Share, HUD, End Call
│   │   │   ├── NetworkStatsHUD.tsx # Live RTT/Loss stats & Network Simulator
│   │   │   └── ChatDrawer.tsx    # In-call real-time messaging
│   │   ├── services/
│   │   │   ├── api.ts            # Auth & OTP API client (with dev fallback)
│   │   │   └── webrtc.ts         # Adaptive WebRTC & Network Quality manager
│   │   ├── context/
│   │   │   └── AuthContext.tsx   # JWT & user state management
│   │   └── types/
│   │       └── index.ts          # Strongly typed schemas
├── backend/
│   ├── auth-service/             # Express microservice for OTP & JWT
│   ├── signaling-service/        # WebSocket microservice for room events
│   └── slm-mailer-mock/          # SLM-powered dynamic email dispatcher
├── nginx/
│   └── nginx.conf                # Reverse proxy & API Gateway routing
├── docker-compose.yml            # Complete container stack orchestration
└── README.md
```

---

## 🛠️ Quick Start

### 1. Run Frontend Locally
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Run Entire Microservices Stack with Docker
```bash
docker compose up --build
```
This starts:
- Nginx API Gateway on `http://localhost:80`
- Frontend Web App on `http://localhost:3000`
- Auth Service on `http://localhost:4001`
- Signaling Service on `ws://localhost:4003`
- SLM Mailer Service on `http://localhost:5000`
- Redis Cache on `localhost:6379`
