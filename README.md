# Chowki Ranger Station (`chowki-ranger`)

**PS2 (Autonomous Orchestration with Managed Agents) Compliance Repository**

This repository is the production-grade, autonomous orchestration hub for **Project Chowki**, a Google DeepMind Hackathon project. It is fully compliant with the PS2 category and represents a **real, production-quality multi-agent orchestration system** powered by Google Gemini and Node.js.

---

## 🏔️ The Mission

In our distributed trekking network, the **Ranger Station** is the **only node with internet connectivity**. 

It acts as the gateway:
1. **Watches `mesh-out/`**: Receives distress/status packets (bundles) exiting the offline trail mesh network.
2. **Orchestrates AI Agents**: Runs a structured multi-agent workflow to triage, generate emergency briefs, and analyze weather advisories.
3. **Injects Weather Warnings**: Fetches live weather forecasts via Open-Meteo and injects advisory packets back into the offline mesh via `mesh-in/` to warn uphill hikers of storms or torrential rains.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js v20+
- **Language**: TypeScript (ESM, strict type-checking, NodeNext resolution)
- **AI Engine**: Google Gemini API (`@google/generative-ai` SDK)
- **Primary Model**: `gemini-2.5-flash`

### Why Fallback to Structured Orchestration?
The official `@google/generative-ai` package (v0.21.0) does not offer a production-ready, local "Managed Agents" SDK. To maintain production-grade reliability and adhere to strict SDK compliance (never inventing non-existent API methods), we implemented **explicit structured orchestration** under the coordination of a centralized `WorkflowManager`.

---

## 🧩 Architecture & Design

```
                     [ InboxWatcher ] (watches mesh-out/)
                            │
                            ▼
                    [ WorkflowManager ]
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
   [ TriageAgent ]   [ CommsAgent ]    [ WeatherAgent ]
         │                  │                  │
         └────────┬─────────┴─────────┬────────┘
                  ▼                   ▼
           [ GeminiClient ]    [ WeatherTool ]
                  │                   │
                  ▼                   ▼
           (Gemini API)         (Open-Meteo)
```

The system is designed with **SOLID Principles** and strict **Dependency Injection**:
- **`WorkflowManager`**: The single component responsible for coordinating execution flow. **Agents never call each other.**
- **`InboxWatcher`**: Polls the inbox directory for high-efficiency, platform-independent file change detection.
- **`GeminiClient`**: Centralized wrapper encapsulating Google Gemini API calls, using `responseMimeType: "application/json"` for reliable structured JSON generation.
- **`WeatherTool`**: A lightweight client consuming the Open-Meteo API (without keys) using native `fetch`.

---

## 📁 Folder Structure

```
src/
├── main.ts               # Bootstraps the application and injects dependencies
├── config.ts             # Loads configuration and environment variables
├── logger.ts             # Emits structured, sequential, human-readable logging
├── watcher/
│   └── InboxWatcher.ts   # Watches "mesh-out/" directory for new JSON bundles
├── manager/
│   └── WorkflowManager.ts # Orchestrates triage -> comms -> weather sequentially
├── agents/
│   ├── BaseAgent.ts      # Shared agent capabilities
│   ├── TriageAgent.ts    # Determines severity, confidence, actions
│   ├── CommsAgent.ts     # Drafts family updates and rescue briefs
│   └── WeatherAgent.ts   # Evaluates forecasts and injects advisory packets
├── tools/
│   ├── GeminiClient.ts   # Integrates with the official @google/generative-ai SDK
│   ├── WeatherTool.ts    # Consumes Open-Meteo current & hourly forecasts
│   └── FilesystemTool.ts # Standardizes filesystem I/O operations
├── types/
│   ├── Bundle.ts         # Schema for trail mesh data packets
│   ├── AgentResult.ts    # Typed outputs for all agents
│   ├── Config.ts         # Type safety for environmental configurations
│   └── Outbox.ts         # Schema for queued transmissions
└── utils/
    ├── time.ts           # Unified timestamp formatting
    └── json.ts           # Clean JSON extractor from LLM markdown responses
fixtures/
└── sos-bundle.json       # Predefined test bundle representing an active SOS
```

---

## 🤖 Why Multiple Agents Instead of One Giant LLM?

In complex safety-critical environments like Ranger Stations, a single monolithic prompt suffers from **hallucinations, context dilution, and lack of deterministic auditing**. 

Our multi-agent separation provides:
1. **Single Responsibility**: `TriageAgent` focuses entirely on severity scaling and confidence assessment. It cannot draft communications or make active decisions.
2. **Auditable Control**: The `WorkflowManager` acts as the human-in-the-loop audit point, isolating communication drafting (`CommsAgent`) and mesh environmental injection (`WeatherAgent`).
3. **Interchangeable Logic**: We can replace the `WeatherAgent` with hardcoded triggers or a lightweight classifier without affecting how we draft rescue communications.

---

## 📡 Simulated Systems

- **SMS Outbox Simulated**: Emergency outbox alerts are fully drafted and printed to console. File copies are written to `outbox/family.txt` and `outbox/dispatch.txt` to model a localized GSM gateway queue.
- **Mesh Advisory Injection**: If live weather shows thunderstorm risks, heavy rain, or freezing conditions, a JSON advisory package is saved to `mesh-in/` for simulated broadcast.

---

## 🚀 How to Run the Demo

### 1. Prerequisites
- Node.js v20 or higher.
- A valid Google Gemini API Key.

### 2. Installation
Install dependencies in the project folder:
```bash
npm install
```

### 3. Environment Setup
Create a `.env` file in the root directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
MODEL_NAME=gemini-2.5-flash
WEATHER_LAT=44.33
WEATHER_LON=-110.79
```

### 4. Running the Daemon
Start the inbox watcher in development mode:
```bash
npm run dev
```

### 5. Simulate a Distress Bundle
While the server is running, copy the included test fixture into the inbox folder:
```bash
cp fixtures/sos-bundle.json mesh-out/
```
*(On Windows PowerShell: `Copy-Item fixtures/sos-bundle.json -Destination mesh-out/`)*

You will immediately observe the sequential orchestration output, matching our human-readable standard.

---

## 📝 Example Flow Output

```
12:00:01 [System] INFO: Chowki Ranger Station Starting Up...
12:00:01 [InboxWatcher] INFO: Monitoring directory for new bundles: C:\...\mesh-out
12:00:15 [Manager] Bundle received
  ↓
12:00:15 [Manager] Delegating TriageAgent
  ↓
12:00:16 [TriageAgent] Triage completed. Severity: CRITICAL, Confidence: 0.98
12:00:16 [Manager] Completed severity CRITICAL
  ↓
12:00:16 [Manager] Delegating CommsAgent
  ↓
12:00:17 [CommsAgent] Saved family SMS draft to C:\...\outbox\family.txt
12:00:17 [CommsAgent] Saved dispatch brief to C:\...\outbox\dispatch.txt
12:00:17 [CommsAgent] INFO: [Family SMS Draft]:
--------------------
Chowki Ranger Station update: We are deploying rangers to assist trekker 'hiker-trekker-alpha'. More updates shortly.
--------------------
12:00:17 [Manager] Created family.txt dispatch.txt
  ↓
12:00:17 [Manager] Delegating WeatherAgent
  ↓
12:00:18 [WeatherAgent] Fetched weather: Thunderstorms and heavy rain (18°C, Precipitation: 3.2mm)
12:00:19 [WeatherAgent] Weather advisory bundle injected into mesh-in: C:\...\mesh-in\weather-advisory-1782381203.json
12:00:19 [Manager] Weather advisory generated
  ↓
12:00:19 [Manager] Archived processed bundle to: C:\...\mesh-out\processed\sos-bundle.json
12:00:19 [Manager] Workflow complete
```

---

## 🧪 Running Tests
Run the Vitest unit tests:
```bash
npm test
```
