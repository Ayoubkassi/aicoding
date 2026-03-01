<p align="center">
  <img src="https://img.shields.io/badge/Mistral_AI-Large_2512-FF7000?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjRkY3MDAwIiByeD0iNCIvPjwvc3ZnPg==&logoColor=white" alt="Mistral AI" />
  <img src="https://img.shields.io/badge/ElevenLabs-Voice_AI-000000?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMDAwIiByeD0iNCIvPjwvc3ZnPg==&logoColor=white" alt="ElevenLabs" />
  <img src="https://img.shields.io/badge/face--api.js-Proctoring-4285F4?style=for-the-badge" alt="face-api.js" />
  <img src="https://img.shields.io/badge/Flask-Backend-000000?style=for-the-badge&logo=flask&logoColor=white" alt="Flask" />
  <img src="https://img.shields.io/badge/Monaco-Editor-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white" alt="Monaco" />
</p>

<h1 align="center">HireAI</h1>
<p align="center"><strong>AI-Powered Coding Interview Platform with Real-Time Voice, Webcam Proctoring & Anti-Cheating</strong></p>

<p align="center">
  <em>A fully autonomous AI interviewer that conducts structured live coding interviews with natural voice interaction, face-tracking proctoring, multi-layer integrity detection, and data-driven hiring decisions.</em>
</p>

---

## Why HireAI

Every engineering hire costs teams 10+ hours of inconsistent, unstructured interviews. One interviewer is tough, another is lenient — there's no standardization and no data behind the decision.

HireAI solves this with an AI interviewer that gives **every candidate the same structured, fair experience** while catching cheating in real time.

- **Voice-first interaction** — the AI speaks and listens naturally using ElevenLabs, not just text chat
- **Structured phases** — mandatory interview flow that cannot be skipped or manipulated
- **Evaluator, not tutor** — the AI assesses skills, never helps or gives answers
- **Tamper-proof** — multi-layer anti-cheating with webcam proctoring, paste blocking, tab detection, and manipulation defense
- **Configurable difficulty** — Easy, Medium, or Hard coding problems selected before the interview
- **Interviewer feedback** — hiring managers add their own notes before viewing results

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                          Frontend                              │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐  ┌─────────────┐   │
│  │  Monaco   │ │  Voice    │  │ Sentiment │  │  Integrity  │   │
│  │  Editor   │ │  STT/TTS  │  │  Tracker  │  │   Monitor   │   │
│  └─────┬────┘  └─────┬─────┘  └─────┬─────┘  └──────┬──────┘   │
│        │             │              │                │         │
│  ┌─────┴─────────────┴──────────────┴────────────────┴──────┐  │
│  │          face-api.js — Webcam Proctoring Engine          │  │
│  │  TinyFaceDetector + FaceLandmark68TinyNet (in-browser)   │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────┬─────────────┬──────────────┬──────────────────────────|
         │             │              │
         ▼             ▼              ▼
┌────────────────────────────────────────────────────────────────┐
│                       Flask Backend                            │
│  ┌───────────────┐  ┌─────────────┐  ┌──────────────────────┐  │
│  │  /api/chat    │  │  /api/tts   │  │  /api/run            │  │
│  │  Mistral LLM  │  │  ElevenLabs │  │  Code Execution      │  │
│  │  + Safety Gate│  │  Voice      │  │  (sandboxed, 10s)    │  │
│  └───────────────┘  └─────────────┘  └──────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## Features

### AI Interviewer (Alex)
- **Mandatory structured flow** — Intro → Warmup (2 questions) → Problem → Coding → Review → Decision
- **Phase enforcement** — phases must proceed sequentially; skip attempts are blocked in code and logged
- **Profile-aware warmup** — conceptual questions tailored to the candidate's role
- **Difficulty selection** — Easy (1-2 min), Medium (5-10 min), or Hard (15+ min) coding problems
- **Human-like personality** — natural fillers ("hmm", "gotcha"), genuine reactions, tone adapts to candidate stress level
- **Evaluator mindset** — never writes code, never gives answers, asks probing questions instead
- **Language lock** — coding language chosen at setup, cannot be changed mid-interview

### Voice Interaction
- **ElevenLabs TTS** — natural AI voice output, not robotic text-to-speech
- **Web Speech API** — browser-native speech recognition with auto-send on pause
- **Echo protection** — mic automatically mutes while AI speaks, resumes after
- **Low latency** — 900ms silence detection triggers auto-send for natural conversation flow

### Webcam Proctoring (face-api.js)
Runs entirely in-browser using TinyFaceDetector + FaceLandmark68TinyNet. Detection every 2 seconds.

| Signal | Detection Method | Scoring |
|--------|-----------------|---------|
| **Face not visible** | 0 faces detected (once per disappearance) | -5 per event (max -20) |
| **Multiple faces** | >1 faces in frame | -10 per event (max -25) |
| **Gaze away** | Bounding box off-center (>20% H / >25% V) OR nose-eye landmark offset > 0.55 | -2 per event (max -15) |

Live stats overlay on the webcam feed: Face status, Multi-face count, Gaze-away count, and Trust Score (starts at 100%).

### Multi-Layer Cheating Detection

| Signal | How It's Detected | Severity |
|--------|-------------------|----------|
| Tab switching | Page Visibility API + blur/focus events | Medium |
| Copy from external | Tab switch → paste sequence within 5s | High |
| Paste in editor | Clipboard monitoring, blocked and logged | Medium |
| Large pastes | Paste > 50 chars in editor or input | Medium |
| Typing bursts | Keystroke velocity > 20 chars/sec | Medium |
| Manipulation attempts | 3-layer detection: regex + server gate + AI self-detection | Critical |
| Language change attempt | Candidate tries to switch locked language | High |
| Phase skip attempt | Candidate tries to skip interview phases | High |
| Multiple voices | Speech recognition alternative transcript analysis | Medium |
| Consistent latency | Response times with suspiciously low variance (AI-assisted) | Medium |
| Fast responses | Response < 3 seconds to complex questions | Low |
| Long silences | > 60 seconds of inactivity | Low |

### Anti-Manipulation Safety System
A **3-layer defense** against prompt injection and social engineering:

1. **Client-side regex** — 30+ patterns catch manipulation before reaching the AI ("ignore your instructions", "give me full marks", "solve it for me", phase skip requests)
2. **Server-side safety gate** — Flask middleware detects manipulation and injects security alerts into context
3. **AI self-detection** — system prompt instructs the AI to refuse, flag (`manipulation_detected: true`), and log any attempt

Each manipulation attempt deducts **25 points** from the integrity score.

### Live Code Editor
- **Monaco Editor** — same engine as VS Code, with syntax highlighting and IntelliSense
- **8 languages** — Python, JavaScript, TypeScript, C, C++, Go, Java, Rust
- **Server-side execution** — code runs in isolated temp files with 10s timeout
- **Paste protection** — clipboard pastes into the editor are blocked and logged
- **Share with AI** — button to explicitly share current code for AI review

### Interview Playback
- **Full session recording** — every message, code change, phase transition, sentiment shift, and integrity event captured with timestamps
- **Interactive scrubber** — drag through the entire interview, see code evolve and conversation unfold
- **Split-view replay** — code editor on left, conversation on right, both synchronized
- **Speed controls** — 0.5x, 1x, 2x, 4x with play/pause and step-by-step navigation
- **Color-coded timeline** — purple (AI), green (candidate), yellow (phase), red (integrity), orange (code run)

### Interviewer Feedback
- **Dedicated feedback page** — appears between interview end and results, interviewer writes notes or skips
- **Included in report** — feedback displayed on decision page and embedded in downloadable report

### Interview Reports
- **Hiring decision** — Strong Hire / Hire / Further Review / No Hire with verdict icon
- **5 scored dimensions** — Technical, Communication, Problem Solving, Cultural Fit, Experience (0-10 with visual bars)
- **Strengths & concerns** — bulleted analysis from the AI
- **Interviewer's impression** — AI-generated behavioral summary with sentiment observations
- **Integrity score** — 0-100 with detailed event log of every flagged action
- **Interviewer feedback** — human notes displayed alongside AI assessment
- **Downloadable** — full report as `.txt` file + conversation transcript export

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **LLM** | Mistral Large | Interview conversation, decision making, safety detection |
| **Voice** | ElevenLabs TTS | Natural text-to-speech for AI interviewer |
| **STT** | Web Speech API | Browser-native speech recognition |
| **Proctoring** | face-api.js | In-browser face detection, landmark analysis, gaze tracking |
| **Editor** | Monaco Editor | VS Code-level code editing in browser |
| **Backend** | Flask (Python) | API routing, code execution, AI orchestration |
| **Frontend** | Vanilla JS + CSS | Zero-dependency, no build step, single page app |

---

## Getting Started

### Prerequisites
- Python 3.8+
- [Mistral AI API key](https://console.mistral.ai/)
- [ElevenLabs API key](https://elevenlabs.io/)
- Chrome or Edge browser (for Web Speech API support)
- (Optional) Compilers for C/C++/Go/Java/Rust if using those languages

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

> **Voice ID**: The default voice is "Eric" — a natural, professional male voice. Browse other voices in the [ElevenLabs Voice Library](https://elevenlabs.io/voice-library).

### Run

```bash
python app.py
```

Open [http://localhost:3000](http://localhost:3000) in Chrome.

---

## Project Structure

```
hireai/
├── app.py                 # Flask backend — API routes, AI orchestration, code execution
├── requirements.txt       # Python dependencies
├── .env                   # API keys (not committed)
└── static/
    ├── index.html         # Single-page app — landing, interview, feedback, decision, playback
    ├── app.js             # Frontend logic — state, voice, proctoring, cheating detection, playback
    └── style.css          # Dark-theme responsive UI
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Serve the frontend |
| `POST` | `/api/chat` | Send conversation to Mistral, returns AI response with safety gate |
| `POST` | `/api/tts` | Convert text to speech via ElevenLabs |
| `POST` | `/api/run` | Execute code in a sandboxed temp file (10s timeout) |
| `POST` | `/api/save-evidence` | Save proctoring evidence for a session |
| `GET` | `/api/evidence/<id>` | Retrieve saved evidence for a session |

---

## Interview Flow

```
1. SETUP         Candidate name, position, job description,
                 coding language, problem difficulty
                     │
2. INTRO         Alex greets the candidate, warm small talk
                     │
3. WARMUP        2 conceptual questions tailored to the role
                     │
4. PROBLEM       Coding problem presented (easy/medium/hard),
                 starter template loaded into editor
                     │
5. CODING        Candidate codes while AI observes silently
                 AI engages only when code is run/shared or asked
                     │
6. REVIEW        Quick performance summary
                     │
7. FEEDBACK      Interviewer adds notes (optional, can skip)
                     │
8. DECISION      Structured verdict with scores, strengths,
                 concerns, integrity report, downloadable output
```

---

## Safety & Integrity

- **No external help** — tab switching detected and logged, pastes blocked in editor
- **No impersonation** — face-api.js webcam proctoring detects missing faces, multiple people, and gaze away
- **No AI manipulation** — 3-layer defense against prompt injection, social engineering, and jailbreak attempts
- **No phase skipping** — interview phases enforced in code; skip attempts blocked and logged
- **No language switching** — coding language locked at setup, cannot be changed mid-interview
- **Transparent scoring** — every flag timestamped, integrity score computed deterministically
- **Fair evaluation** — AI explicitly instructed to be unbiased across all protected characteristics

---

## Built With

<p>
  <a href="https://mistral.ai"><img src="https://img.shields.io/badge/Mistral_AI-FF7000?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjRkY3MDAwIiByeD0iNCIvPjwvc3ZnPg==&logoColor=white" alt="Mistral AI" /></a>
  <a href="https://elevenlabs.io"><img src="https://img.shields.io/badge/ElevenLabs-000000?style=flat-square&logoColor=white" alt="ElevenLabs" /></a>
  <a href="https://github.com/justadudewhohacks/face-api.js"><img src="https://img.shields.io/badge/face--api.js-4285F4?style=flat-square&logoColor=white" alt="face-api.js" /></a>
  <a href="https://flask.palletsprojects.com"><img src="https://img.shields.io/badge/Flask-000000?style=flat-square&logo=flask&logoColor=white" alt="Flask" /></a>
  <a href="https://microsoft.github.io/monaco-editor/"><img src="https://img.shields.io/badge/Monaco_Editor-007ACC?style=flat-square&logo=visual-studio-code&logoColor=white" alt="Monaco Editor" /></a>
</p>

---

## License

MIT

---

<p align="center">
  <strong>HireAI</strong> — Consistent interviews. Honest assessments. Better hires.
</p>
