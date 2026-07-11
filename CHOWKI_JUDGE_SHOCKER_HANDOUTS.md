# 🏔️ Chowki Hackathon Improvement Handouts: "Shock the Judges" Edition

This document contains four separate, production-grade handouts for Claude Code (or any autonomous coding agent) to implement. These features are designed to elevate **Project Chowki**—a delay-tolerant mesh network (DTN) for mountain trail rescue—into a high-fidelity, climate-adaptive, and visually stunning emergency response platform.

---

## 📬 Handout 1: "The Command Center" (Unified Visual Simulation Dashboard)
**Target Directories:** `/home/nikhil/Desktop/chowki-ranger` & `/home/nikhil/Desktop/chowki-dashboard`

### 🎯 Objective
Replace dry terminal CLI logs with a real-time web dashboard visualizing the entire offline delay-tolerant network (DTN) topology, moving mules, syncing progress, and active hiker search-and-rescue statuses.

### 🛠️ Technical Specifications
1. **Express Server Backend (`chowki-ranger` Integration):**
   * Expose a high-performance REST endpoint `/api/state` that returns a merged snapshot of:
     * The central Ranger Station's ledger (`ranger-ledger.db`).
     * Individual Booth SQLite database files (read dynamically from local disk paths).
     * The active Mule's in-memory cargo database (read from `.chowki-mule-<id>.json`).
2. **Dashboard UI (Single-Page App):**
   * Build a beautiful, responsive, dark-themed dashboard using SVG or HTML5 Canvas with Tailwind CSS.
   * **Trail Topology Map:**
     * Render nodes (`booth-a`, `booth-b`, `ranger-station`) as circles positioned geographically.
     * Draw dotted lines representing the physical trails connecting the booths.
   * **Active Hiker Avatars:**
     * Represent checked-in hikers as color-coded avatars moving along the trails.
     * Color mapping:
       * **Green:** Checked in / on-time.
       * **Yellow:** Under observation (`watch` status from `judgeOverdue`).
       * **Red:** Overdue & Critical (`escalate` status from `judgeOverdue`).
   * **Glow-to-Sync Mule Link:**
     * When a Mule's simulated position (from `rangeSim`) comes in range of a Booth:
       * Trigger a glowing green bridge connection between the Booth and the Hiker on the map.
       * Animate a chunk-by-chunk file transfer progress bar displaying the database snapshot exchange in real-time.
   * **LoRa Signal Waves:**
     * When a LoRa packet transmission event occurs, radiate animated concentric ripples outwards from the sending node, demonstrating multi-hop flooding visually.

### 🧪 Verification
1. Run the Express server.
2. Launch a simulated hiker check-in, set their expected arrival time to overdue, and verify that the UI avatar turns from Green to Yellow/Red dynamically.
3. Simulate a Mule coming in-range of Booth A and verify the connection bridge lights up.

---

## 📬 Handout 3: "Mule-to-Mule Gossip" (P2P Opportunistic Mesh Sync)
**Target Directory:** `/home/nikhil/Desktop/chowki-ble`

### 🎯 Objective
Enable opportunistic peer-to-peer data synchronization when two physical Mules (hikers/rangers walking in opposite directions) pass each other on the trail, drastically reducing emergency propagation latency.

### 🛠️ Technical Specifications
1. **Extend the Sync Protocol (`src/sync.ts`):**
   * Enhance `SyncNode` to support `mule-to-mule` interaction (where both peers have `role: "mule"`).
   * When two Mules are in simulated range (UDP/BLE):
     * Exchange a bidirectional `HELLO` declaring carrying direction ("uphill" / "downhill").
     * Exchange `INVENTORY` lists.
     * Bidirectionally `PUSH` missing data bundles.
2. **Conflict & Hop Resolution:**
   * Hand off payloads correctly without creating infinite loops or double-stamping duplicates.
   * Decrement `ttlHops` on transfer and reject bundles where `ttlHops <= 0`.
3. **Mule CLI Adaptation (`src/cli-mule.ts`):**
   * Bind each Mule to a dual-state listening port so they can simultaneously act as discovery broadcasters and connection recipients.

### 🧪 Verification & Integration Test
* Update `tests/integration.test.ts` to include a triple-node scenario:
  1. `booth-a` generates a bundle.
  2. `mule-1` picks up the bundle from `booth-a` and travels.
  3. `mule-1` meets `mule-2` mid-trail and syncs the bundle.
  4. `mule-2` delivers the bundle to `booth-b`.
  * Ensure the test asserts that `booth-b` receives the exact bundle without `mule-1` ever visiting `booth-b`.

---

## 📬 Handout 4: "Climate-Adaptive LoRa Link-Budget" (Closed-Loop Weather Feedback)
**Target Directories:** `/home/nikhil/Desktop/chowki-lora` & `/home/nikhil/Desktop/chowki-brain`

### 🎯 Objective
Establish a closed-loop intelligence cycle where real-world storm conditions fetched by the Weather Agent dynamically degrade simulated LoRa links and trigger ultra-compressed fallback prompts.

### 🛠️ Technical Specifications
1. **Dynamic Environment Degradation (`chowki-lora`):**
   * Read weather statuses from a shared local configuration file written by `chowki-ranger/WeatherAgent`.
   * If the weather condition is severe (e.g., heavy rain, thunderstorm, blizzards):
     * Dynamically scale the link packet loss `LORA_LOSS` from the 10% baseline up to **70-90% packet loss** to simulate atmospheric degradation.
2. **Dynamic Prompt Compression (`chowki-brain`):**
   * Update `compressForLora` to receive an optional `climateSeverity: "NORMAL" | "SEVERE"` parameter.
   * Use **Gemini Client** (configured with the **`GEMINI_NANOBANANA_API_KEY`** environment variable).
   * **If SEVERE:** Override the standard compression prompt with an extreme instruction constraint:
     * Force Gemma to output an ultra-compact **50-byte maximum packet** (stripping all descriptions, mapping locations to single-character coordinates, and utilizing raw shortcodes).
     * This ensures critical emergency packets can still slip through highly noisy, degraded links.

### 🧪 Verification
* Set weather to "Thunderstorm". Verify that `chowki-lora` registers higher packet dropouts and that `chowki-brain` dynamically outputs a payload compressed under 50 bytes.

---

## 📬 Handout 5: "Voice SOS Offline Terminal" (Whisper Speech-to-Text Parsing)
**Target Directories:** `/home/nikhil/Desktop/chowki-brain` & `/home/nikhil/Desktop/chowki-ble`

### 🎯 Objective
Allow rescue workers on freezing, wet trails to report incidents hands-free using voice. Dictated reports are transcribed offline locally and automatically structured into JSON.

### 🛠️ Technical Specifications
1. **Offline Inference Engine (Zero Training):**
   * Integrate Whisper Speech-to-Text into `chowki-brain` using `@xenova/transformers` (which runs local ONNX runtime).
   * On first run, download the pre-trained `Xenova/whisper-tiny` weights locally. **Do not perform any training, fine-tuning, or parameter updates.**
2. **CLI Record Trigger (`chowki-ble/src/cli-booth.ts`):**
   * Map the `v` key in the Booth TUI to trigger audio recording.
   * Capture 10 seconds of mic input (using a lightweight native wrapper like `node-record-lpcm16`) or fallback to loading a pre-configured `.wav` audio fixture.
3. **Structured Pipeline Integration:**
   * Pipe the recorded/loaded audio buffer directly into the local Whisper transcriber.
   * Feed the output text transcript straight into `chowki-brain`s `parseReport` function.
   * `parseReport` runs Gemini via `GEMINI_NANOBANANA_API_KEY` to turn the Hinglish/messy transcription into a clean `StructuredIncident` JSON record.

### 🧪 Verification
* Press `v` in the booth terminal, speak: *"Help, foreigner has twisted ankle near the waterfall, alone, 2km up"*, and verify that a structured incident JSON is generated with `kind: "injury"` and `urgency: "urgent"`.
