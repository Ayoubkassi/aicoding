<p align="center">
  <img src="https://img.shields.io/badge/Mistral_AI-Large_2512-FF7000?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjRkY3MDAwIiByeD0iNCIvPjwvc3ZnPg==&logoColor=white" alt="Mistral AI" />
  <img src="https://img.shields.io/badge/Codestral-Code_Intelligence-FF7000?style=for-the-badge" alt="Codestral" />
  <img src="https://img.shields.io/badge/ElevenLabs-Voice_AI-000000?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDAwIiByeD0iNCIvPjwvc3ZnPg==&logoColor=white" alt="ElevenLabs" />
  <img src="https://img.shields.io/badge/Flask-Backend-000000?style=for-the-badge&logo=flask&logoColor=white" alt="Flask" />
</p>

<h1 align="center">HireAI</h1>
<p align="center"><strong>AI-Powered Coding Interview Platform with Real-Time Voice, Code Intelligence & Anti-Cheating</strong></p>

<p align="center">
  <em>A fully autonomous AI interviewer that conducts live coding interviews with voice interaction, real-time code analysis, multi-modal cheating detection, and data-driven hiring decisions.</em>
</p>

---

## Demo

| Landing | Live Interview | Decision Report |
|---------|---------------|-----------------|
| Setup candidate profile, role, and job description | Voice conversation + Monaco editor + real-time analysis | Scores, integrity report, interviewer impression |

---

## What Makes This Different

Unlike basic LLM chatbots, HireAI is a **complete interview simulation** that mirrors how a real senior engineer would conduct a coding interview:

- **Voice-first interaction** — the AI speaks and listens naturally using ElevenLabs, not just text
- **Multi-model orchestration** — Mistral Large drives the conversation, Codestral silently analyzes code in real-time, and Mistral Vision monitors the webcam
- **Evaluator, not tutor** — the AI is explicitly designed to *assess*, never to help or give answers
- **Tamper-proof** — 3-layer anti-manipulation system detects and blocks prompt injection, social engineering, and cheating attempts

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                            │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Monaco   │  │  Voice I/O │  │ Sentiment│  │ Integrity │  │
│  │  Editor   │  │  (STT/TTS)│  │ Tracker  │  │  Monitor  │  │
│  └─────┬────┘  └─────┬─────┘  └────┬─────┘  └─────┬─────┘  │
└────────┼─────────────┼──────────────┼──────────────┼────────┘
         │             │              │              │
         ▼             ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Flask Backend                           │
│  ┌──────────────┐  ┌──────────┐  ┌───────────────────────┐  │
│  │ /api/chat     │  │ /api/tts │  │ /api/analyze-frame    │  │
│  │ Mistral Large │  │ ElevenLabs│ │ Mistral Vision        │  │
│  │ + Safety Gate │  │ Turbo v2.5│ │ Webcam Analysis       │  │
│  └──────────────┘  └──────────┘  └───────────────────────┘  │
│  ┌──────────────┐  ┌──────────────────────────────────────┐  │
│  │ /api/run      │  │ /api/code-analysis                  │  │
│  │ Code Execution│  │ Codestral — Real-time Code Intel    │  │
│  └──────────────┘  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Features

### AI Interviewer (Alex)
- **Structured interview flow** — Intro → Warmup → Problem → Coding → Review → Decision
- **Profile-aware warmup** — asks 5-6 conceptual questions tailored to the candidate's role (Java questions for Java engineers, ML questions for ML engineers, etc.)
- **Human-like personality** — natural fillers, genuine reactions, adaptive tone based on candidate's emotional state
- **Evaluator mindset** — never writes code, never gives answers, asks probing questions instead
- **Voice conversation** — ElevenLabs TTS with natural voice, Web Speech API for recognition

### Real-Time Code Intelligence (Codestral)
- **Silent code watcher** — monitors the editor every few seconds during the coding phase
- **Approach analysis** — evaluates the candidate's algorithmic strategy
- **Correctness scoring** — checks for bugs, edge cases, and logical errors
- **Complexity estimation** — time and space complexity analysis
- **Stuck detection** — detects when the candidate isn't making progress and suggests nudges to the interviewer
- **Live UI panel** — displays analysis results in the sidebar with color-coded scores

### Multi-Modal Cheating Detection

**Client-Side AI Proctoring** — powered by [MediaPipe FaceLandmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) running in-browser via WebAssembly. Analyzes 478 face landmarks + 52 blendshapes + head pose matrix at ~5fps. No API calls needed — deterministic, real-time, and free.

Inspired by [exam-cheating-detection](https://github.com/AarambhDevHub/exam-cheating-detection) with consecutive-frame thresholding to eliminate false positives.

| Signal | How It's Detected | Severity |
|--------|-------------------|----------|
| Face absent | MediaPipe — no face detected for 3+ seconds | High |
| Gaze away | MediaPipe blendshapes — `eyeLookOut/In/Up` sustained off-center | Medium |
| Head turned | MediaPipe transformation matrix — yaw > 30° | Medium |
| Multiple faces | MediaPipe — 2+ faces for 5+ consecutive frames | High |
| Talking to someone | MediaPipe — `mouthOpen` + `jawOpen` while AI isn't expecting speech | Medium |
| Tab switching | Page Visibility API | Medium |
| Copy from external | Tab switch → paste sequence | High |
| Large pastes | Clipboard monitoring in editor | Medium |
| Typing bursts | Keystroke velocity analysis | Medium |
| Manipulation attempts | 3-layer detection (see below) | High |
| Fast responses | Response timing analysis | Low |
| Long silences | Inactivity tracking | Low |
| Second screen / phone | Mistral Vision fallback (when MediaPipe unavailable) | High |

### Anti-Manipulation Safety System
A **3-layer defense** against prompt injection and social engineering:

1. **Client-side regex filter** — 30+ patterns catch manipulation attempts before they reach the AI (e.g., "ignore your instructions", "give me full marks", "solve it for me")
2. **Server-side safety gate** — Flask middleware detects manipulation patterns and injects a system-level security alert into the AI's context
3. **AI self-detection** — the system prompt explicitly instructs the AI to refuse, flag (`manipulation_detected: true`), and log any manipulation attempt

Each attempt deducts **25 points** from the integrity score — the heaviest penalty in the system.

### Live Code Editor
- **Monaco Editor** (same engine as VS Code)
- **8 languages** — Python, JavaScript, TypeScript, C, C++, Go, Java, Rust
- **Server-side execution** — code runs in isolated temp files with 10s timeout
- **Language switching** — candidate can request a different language mid-interview
- **Paste protection** — clipboard pastes into the editor are blocked and logged

### Interview Playback Timeline
- **Full session recording** — every message, code change, phase transition, sentiment shift, and integrity event is captured with timestamps
- **Interactive scrubber** — drag through the entire interview like a video, see the code evolve and conversation unfold
- **Split-view replay** — left panel shows code at that point in time, right panel shows conversation up to that moment
- **Speed controls** — 0.5x, 1x, 2x, 4x playback speed with play/pause and step-by-step navigation
- **Color-coded timeline markers** — purple (AI), green (candidate), yellow (phase change), red (integrity flag), orange (code run)
- **Live sentiment overlay** — see confidence, stress, and engagement meters update as you scrub through the timeline
- **Perfect for demos** — show judges the entire interview flow in 2 minutes at 4x speed

### Interview Reports
- **Hiring decision** — Strong Hire / Hire / Further Review / No Hire
- **5 scored dimensions** — Technical, Communication, Problem Solving, Cultural Fit, Experience (0-10)
- **Strengths & concerns** — bulleted lists from the AI's evaluation
- **Interviewer's impression** — human-readable summary with behavioral observations
- **Integrity score** — 0-100 with detailed event log
- **Downloadable** — full report as `.txt` file + conversation transcript

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **LLM** | Mistral Large 2512 | Interview conversation, webcam analysis, decision making |
| **Code AI** | Codestral 2501 | Real-time code evaluation and hint generation |
| **Voice** | ElevenLabs Turbo v2.5 | Natural text-to-speech |
| **STT** | Web Speech API | Browser-native speech recognition |
| **Editor** | Monaco Editor | VS Code-level code editing in browser |
| **Backend** | Flask (Python) | API routing, code execution, AI orchestration |
| **Frontend** | Vanilla JS + CSS | Zero-dependency, no build step |

---

## Getting Started

### Prerequisites
- Python 3.8+
- [Mistral AI API key](https://console.mistral.ai/)
- [ElevenLabs API key](https://elevenlabs.io/)
- (Optional) Runtime compilers for C/C++/Go/Java/Rust if you want multi-language execution

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/hireai.git
cd hireai

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys
```

### Environment Variables

Create a `.env` file in the project root:

```env
MISTRAL_API_KEY=your_mistral_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=cjVigY5qzO86Huf0OWal
PORT=3000
```

> **Voice ID**: The default voice is "Eric" — a natural, professional male voice. You can find other voice IDs in the [ElevenLabs Voice Library](https://elevenlabs.io/voice-library).

### Run

```bash
python app.py
```

Open [http://localhost:3000](http://localhost:3000) in your browser (Chrome recommended for speech recognition).

---

## Project Structure

```
hireai/
├── app.py                 # Flask backend — API routes, AI orchestration, code execution
├── requirements.txt       # Python dependencies
├── .env                   # API keys (not committed)
└── static/
    ├── index.html         # Single-page HTML — landing, interview room, decision page
    ├── app.js             # Frontend logic — state management, AI interaction, cheating detection
    └── style.css          # Dark-theme responsive UI
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Serve the frontend |
| `POST` | `/api/chat` | Send conversation to Mistral Large, returns AI response with safety gate |
| `POST` | `/api/tts` | Convert text to speech via ElevenLabs |
| `POST` | `/api/run` | Execute code in a sandboxed temp file |
| `POST` | `/api/analyze-frame` | Analyze webcam frame with Mistral Vision |
| `POST` | `/api/code-analysis` | Analyze code with Codestral for real-time intelligence |

---

## How the Interview Works

```
1. SETUP        Candidate enters name, position, job description
                    │
2. INTRO        Alex greets the candidate warmly, small talk
                    │
3. WARMUP       5-6 conceptual questions tailored to the role
                    │
4. PROBLEM      One coding problem presented, template loaded into editor
                    │
5. CODING       Candidate codes while Codestral watches silently
                AI only engages when code is run/shared or candidate asks
                    │
6. REVIEW       Quick summary of performance
                    │
7. DECISION     Structured verdict with scores, strengths, concerns
                Integrity report + interviewer impression generated
```

---

## Safety & Integrity

HireAI takes interview integrity seriously:

- **No external help** — tab switching is detected and logged, pastes are blocked in the editor
- **No impersonation** — webcam monitoring with Mistral Vision detects multiple people or second screens
- **No AI manipulation** — 3-layer defense against prompt injection, social engineering, and jailbreak attempts
- **Transparent scoring** — every flag is logged with timestamp and detail, integrity score is computed deterministically
- **Fair evaluation** — the AI is explicitly instructed to be unbiased across gender, race, age, nationality, and all protected characteristics

---

## Built With

<p>
  <a href="https://mistral.ai"><img src="https://img.shields.io/badge/Mistral_AI-FF7000?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjRkY3MDAwIiByeD0iNCIvPjwvc3ZnPg==&logoColor=white" alt="Mistral AI" /></a>
  <a href="https://elevenlabs.io"><img src="https://img.shields.io/badge/ElevenLabs-000000?style=flat-square&logoColor=white" alt="ElevenLabs" /></a>
  <a href="https://flask.palletsprojects.com"><img src="https://img.shields.io/badge/Flask-000000?style=flat-square&logo=flask&logoColor=white" alt="Flask" /></a>
  <a href="https://microsoft.github.io/monaco-editor/"><img src="https://img.shields.io/badge/Monaco_Editor-007ACC?style=flat-square&logo=visual-studio-code&logoColor=white" alt="Monaco Editor" /></a>
</p>

---

## License

MIT

---

<p align="center">
  <strong>HireAI</strong> — Making technical hiring smarter, fairer, and tamper-proof.
</p>
