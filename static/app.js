// ==================== STATE ====================
const state = {
  candidateName: "",
  position: "",
  jobDescription: "",
  messages: [],
  notes: [],
  timerInterval: null,
  seconds: 0,
  currentPhase: "intro",
  isWaiting: false,
  editor: null,
  currentLanguage: "python",
};

const $ = (s) => document.querySelector(s);

// ==================== PAGES ====================
function showPage(name) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  $(`#${name}`).classList.add("active");
  if (name === "interview" && state.editor) {
    setTimeout(() => state.editor.layout(), 50);
  }
}

// ==================== TIMER ====================
function startTimer() {
  state.seconds = 0;
  state.timerInterval = setInterval(() => {
    state.seconds++;
    const m = String(Math.floor(state.seconds / 60)).padStart(2, "0");
    const s = String(state.seconds % 60).padStart(2, "0");
    $("#timer").textContent = `${m}:${s}`;
  }, 1000);
}

// ==================== MONACO EDITOR ====================
const defaultCode = {
  python: '# Write your code here\nprint("Hello, World!")\n',
  javascript: '// Write your code here\nconsole.log("Hello, World!");\n',
  typescript: '// Write your code here\nconsole.log("Hello, World!");\n',
  cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}\n',
  c: '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}\n',
  java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}\n',
  rust: 'fn main() {\n    println!("Hello, World!");\n}\n',
};

const monacoLangMap = {
  python: "python",
  javascript: "javascript",
  typescript: "typescript",
  cpp: "cpp",
  c: "c",
  java: "java",
  go: "go",
  rust: "rust",
};

function initMonaco() {
  require.config({
    paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" },
  });

  require(["vs/editor/editor.main"], function () {
    state.editor = monaco.editor.create($("#editorContainer"), {
      value: defaultCode.python,
      language: "python",
      theme: "vs-dark",
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      lineNumbers: "on",
      roundedSelection: false,
      padding: { top: 8 },
      wordWrap: "on",
      suggest: { showSnippets: true },
      tabSize: 4,
    });
  });
}

function changeLanguage(lang) {
  state.currentLanguage = lang;
  if (!state.editor) return;
  const model = state.editor.getModel();
  monaco.editor.setModelLanguage(model, monacoLangMap[lang] || lang);
  if (state.editor.getValue().trim() === "" || isDefaultCode(state.editor.getValue())) {
    state.editor.setValue(defaultCode[lang] || `// ${lang}\n`);
  }
}

function isDefaultCode(code) {
  return Object.values(defaultCode).some((d) => code.trim() === d.trim());
}

// ==================== CODE EXECUTION ====================
async function runCode() {
  const code = state.editor ? state.editor.getValue() : "";
  const output = $("#consoleOutput");
  output.textContent = "Running...\n";

  let result = "";
  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, language: state.currentLanguage }),
    });
    const data = await res.json();
    result = data.output || "(no output)";
    output.textContent = result;
  } catch (err) {
    result = "Error: " + err.message;
    output.textContent = result;
  }

  // Auto-send code + output to AI so it can review
  if (state.messages.length > 1 && !state.isWaiting) {
    if (recognition) try { recognition.stop(); } catch {}
    const autoMsg = `[CODE RUN — ${state.currentLanguage}]\nCode:\n\`\`\`\n${code}\n\`\`\`\nOutput:\n\`\`\`\n${result}\n\`\`\``;
    state.messages.push({ role: "user", content: autoMsg });
    addDiscussionEntry("(Ran code — shared with Alex for review)", "user");
    setWaiting(true);
    try {
      const aiData = await callMistral(state.messages);
      state.messages.push({ role: "assistant", content: JSON.stringify(aiData) });
      await handleAIResponse(aiData);
    } catch (err) {
      addDiscussionEntry("Connection error: " + err.message, "ai");
      resumeMicIfActive();
    } finally {
      setWaiting(false);
    }
  }
}

// ==================== SYSTEM PROMPT ====================
function buildSystemPrompt() {
  return `You are Alex, a professional AI coding interviewer. You are an EVALUATOR, not a tutor.

CONTEXT:
- Candidate: ${state.candidateName}
- Position: ${state.position}
- Job: ${state.jobDescription}
- Coding language: ${state.currentLanguage}
- The candidate has a live code editor on the left (60% of screen). They write and run code there.
- You can put code in their editor using the "code" field (ONLY for the initial template).
- You can switch the editor language using the "language" field.

YOUR ROLE — EVALUATOR, NOT HELPER:
- You are here to ASSESS the candidate, not to help them pass.
- NEVER write code for the candidate. NEVER fix their code. NEVER give them the answer.
- Do NOT point out specific bugs directly. Instead ask questions: "Are you sure that handles all cases?" or "Have you considered what happens with edge inputs?"
- Do NOT suggest specific edge cases by name. Instead say: "Have you thought about testing with different types of inputs?"
- Concise and direct. 1-3 sentences max per response.
- Completely UNBIASED — never factor in gender, race, age, nationality, or any protected characteristic.

WHEN TO GIVE HINTS (strict rules):
- Count how many times the candidate has been stuck with no progress. Track this internally.
- LEVEL 0 (first sign of struggle): Say nothing helpful. Just ask "What are you thinking?" or "Walk me through your approach."
- LEVEL 1 (stuck for 2+ messages, no progress at all): Give a VAGUE directional hint like "Think about which data structure might help here" or "Consider the time complexity of your current approach."
- LEVEL 2 (stuck for 4+ messages, clearly frustrated, high stress detected): Give a slightly more specific hint, but still NEVER the answer. Like "A hash map could be useful here" — but nothing more.
- NEVER go beyond level 2. If they still can't solve it, that's a valid assessment signal.

IF CANDIDATE SEEMS STRESSED:
- Briefly acknowledge: "Take your time, no rush." Then move on. Don't overdo it.
- Lower stress doesn't mean lowering the bar — keep evaluating.

LANGUAGE SWITCHING:
- If the candidate asks to switch to a different programming language (e.g. "can we do this in JavaScript?"), set the "language" field to that language name (e.g. "javascript").
- Valid languages: python, javascript, typescript, cpp, c, go, java, rust
- When switching, also update the "code" field with the same template translated to the new language.
- If they don't ask to switch, set "language" to null.

INTERVIEW FLOW:
1. INTRO (1 message, combine with step 2!) — Brief "Hi, let's get started." + present the problem immediately.
2. PROBLEM — Present ONE coding problem appropriate for "${state.position}". Include:
   - Clear problem statement
   - 2-3 input/output examples (described verbally in "message")
   - Put ONLY a minimal skeleton in "code" (function signature + example calls, NO solution logic)
3. CODING — The main phase (most time here). Your job is to OBSERVE and ASSESS:
   - [CODE RUN] with output: Check if output looks correct. Ask "Does that look right to you?" Don't tell them.
   - If their approach is wrong: Don't tell them. Ask "Can you walk me through your logic?" Let them find it.
   - If code has bugs: Don't point them out. Ask "Have you tested this thoroughly?"
   - If code works: Ask about complexity, optimization, or give a harder follow-up.
   - TAKE NOTES on everything: approach, mistakes, how they debug, communication, speed.
4. REVIEW — Quick summary of how they did
5. DECISION — Only when told to end

RESPONSE FORMAT — Always valid JSON:
{
  "message": "What you SAY (spoken words, short)",
  "code": null or "starter template code only",
  "language": null or "python" | "javascript" | "typescript" | "cpp" | "c" | "go" | "java" | "rust",
  "sentiment": {
    "overall": "confident" | "nervous" | "stressed" | "neutral" | "enthusiastic",
    "confidence": 0.0-1.0,
    "stress": 0.0-1.0,
    "engagement": 0.0-1.0
  },
  "notes": ["observation 1", "observation 2"],
  "phase": "intro" | "problem" | "coding" | "review" | "decision",
  "decision": null
}

When phase is "decision":
{
  "message": "...",
  "code": null,
  "language": null,
  "sentiment": {...},
  "notes": [...],
  "phase": "decision",
  "decision": {
    "verdict": "strong_hire" | "hire" | "further_review" | "no_hire",
    "scores": {"technical":0-10,"communication":0-10,"problemSolving":0-10,"culturalFit":0-10,"experience":0-10},
    "strengths": ["..."],
    "concerns": ["..."],
    "summary": "2-3 sentence assessment"
  }
}

IMPORTANT: Only valid JSON. No markdown, no code fences, no extra text.`;
}

// ==================== MISTRAL API ====================
async function callMistral(messages) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "API error");
  }
  const data = await res.json();
  try {
    return JSON.parse(data.content);
  } catch {
    return {
      message: data.content,
      sentiment: { overall: "neutral", confidence: 0.5, stress: 0.3, engagement: 0.5 },
      notes: [],
      phase: state.currentPhase,
      decision: null,
    };
  }
}

// ==================== DISCUSSION UI ====================
function addDiscussionEntry(text, sender) {
  const container = $("#discussionMessages");
  const entry = document.createElement("div");
  entry.className = "disc-entry";

  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const isAI = sender === "ai";

  entry.innerHTML = `
    <div class="disc-avatar ${sender}">${isAI ? "A" : state.candidateName.charAt(0).toUpperCase()}</div>
    <div class="disc-body">
      <div class="disc-header">
        <span class="disc-name ${sender}">${isAI ? "Alex (AI Interviewer)" : state.candidateName}</span>
        <span class="disc-time">${time}</span>
      </div>
      <div class="disc-text">${escapeHtml(text)}</div>
    </div>`;

  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;

}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function updateSentiment(s) {
  if (!s) return;
  const conf = Math.round(s.confidence * 100);
  const stress = Math.round(s.stress * 100);
  const eng = Math.round(s.engagement * 100);

  $("#confidenceFill").style.width = conf + "%";
  $("#confidenceVal").textContent = conf + "%";
  $("#stressFill").style.width = stress + "%";
  $("#stressVal").textContent = stress + "%";
  $("#engagementFill").style.width = eng + "%";
  $("#engagementVal").textContent = eng + "%";

  const mood = $("#overallMood");
  mood.textContent = s.overall;
  mood.className = "mood-tag " + s.overall;
}

function addNotes(notes) {
  if (!notes || !notes.length) return;
  const list = $("#notesList");
  const empty = list.querySelector(".note-empty");
  if (empty) empty.remove();

  notes.forEach((n) => {
    state.notes.push(n);
    const div = document.createElement("div");
    div.className = "note-item";
    div.textContent = n;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
  });
}

function updatePhase(phase) {
  if (!phase || phase === state.currentPhase) return;

  const prev = $(`.phase-step[data-phase="${state.currentPhase}"]`);
  if (prev) { prev.classList.remove("active"); prev.classList.add("completed"); }

  state.currentPhase = phase;
  const cur = $(`.phase-step[data-phase="${phase}"]`);
  if (cur) cur.classList.add("active");

  const labels = {
    intro: "Intro", problem: "Problem",
    coding: "Coding", review: "Review",
    decision: "Decision",
  };
  $("#headerPhase").textContent = labels[phase] || phase;
}

function setWaiting(on) {
  state.isWaiting = on;
  $("#sendBtn").disabled = on;
  $("#discussionInput").disabled = on;
  $("#typingIndicator").classList.toggle("visible", on);
}

// ==================== VOICE (Web Speech API) ====================
let recognition = null;
let isRecording = false;
let finalTranscript = "";
let silenceTimer = null;

function initVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 3;

  recognition.onresult = (e) => {
    let interim = "";
    finalTranscript = "";
    for (let i = 0; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        finalTranscript += t + " ";
      } else {
        interim += t;
      }
    }
    $("#discussionInput").value = (finalTranscript + interim).trim();

    // Auto-send after 2s of silence once we have a final transcript
    clearTimeout(silenceTimer);
    if (finalTranscript.trim()) {
      silenceTimer = setTimeout(() => {
        if (isRecording && finalTranscript.trim()) {
          const text = $("#discussionInput").value.trim();
          // Stop, send, then restart listening
          try { recognition.stop(); } catch {}
          finalTranscript = "";
          $("#discussionInput").value = "";
          if (text) sendMessage(text);
          // Restart after a short delay to let the send go through
          setTimeout(() => { if (isRecording) try { recognition.start(); } catch {} }, 500);
        }
      }, 2000);
    }
  };

  recognition.onend = () => {
    // Always restart if mic is active (browser kills recognition after ~60s)
    if (isRecording) {
      setTimeout(() => { if (isRecording) try { recognition.start(); } catch {} }, 300);
    }
  };

  recognition.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") {
      if (isRecording) {
        setTimeout(() => { if (isRecording) try { recognition.start(); } catch {} }, 300);
      }
      return;
    }
    stopMic();
  };
}

function toggleMic() {
  if (!recognition) return;
  if (isRecording) {
    muteMic();
  } else {
    unmuteMic();
  }
}

function unmuteMic() {
  if (!recognition) return;
  isRecording = true;
  finalTranscript = "";
  clearTimeout(silenceTimer);
  $("#micBtn").classList.add("recording");
  $("#discussionInput").placeholder = "Listening... speak now (or type)";
  const vs = $("#voiceStatus");
  vs.innerHTML = '<div class="voice-bar"><span></span><span></span><span></span><span></span><span></span></div> Mic ON — speak freely, auto-sends after pause';
  vs.classList.add("active");
  try { recognition.start(); } catch {}
}

function muteMic() {
  isRecording = false;
  clearTimeout(silenceTimer);
  $("#micBtn").classList.remove("recording");
  $("#discussionInput").placeholder = "Mic muted — type or click mic to unmute";
  $("#voiceStatus").classList.remove("active");
  try { recognition.stop(); } catch {}
}

let currentAudio = null;
let isSpeaking = false;

function resumeMicIfActive() {
  if (isRecording && recognition) {
    setTimeout(() => { try { recognition.start(); } catch {} }, 400);
  }
}

async function speakText(text) {
  if (!text) return resumeMicIfActive();

  isSpeaking = true;
  // Pause mic so it doesn't pick up the AI voice
  if (recognition) try { recognition.stop(); } catch {};

  // Stop any previous audio
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) throw new Error("TTS failed");

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);

    await new Promise((resolve) => {
      currentAudio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      currentAudio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      currentAudio.play().catch(resolve);
    });
  } catch {
    // Silently fail — don't block the interview
  } finally {
    currentAudio = null;
    isSpeaking = false;
    resumeMicIfActive();
  }
}

// ==================== CORE INTERVIEW LOGIC ====================
async function handleAIResponse(aiData) {
  addDiscussionEntry(aiData.message, "ai");
  updateSentiment(aiData.sentiment);
  addNotes(aiData.notes);
  updatePhase(aiData.phase);

  // Language switch — update dropdown, editor syntax, and compiler target
  if (aiData.language && aiData.language !== state.currentLanguage) {
    const lang = aiData.language;
    state.currentLanguage = lang;
    const sel = $("#languageSelect");
    if (sel) sel.value = lang;
    if (state.editor) {
      const model = state.editor.getModel();
      monaco.editor.setModelLanguage(model, monacoLangMap[lang] || lang);
    }
    addDiscussionEntry(`(Switched to ${lang})`, "ai");
  }

  // Inject code into editor if AI provided it (only for templates)
  if (aiData.code && state.editor) {
    state.editor.setValue(aiData.code);
    addDiscussionEntry("(Code loaded into editor)", "ai");
  }

  // Speak with ElevenLabs — awaits until audio finishes, then mic resumes
  if (aiData.message && !aiData.message.startsWith("(")) {
    await speakText(aiData.message);
  } else {
    resumeMicIfActive();
  }

  if (aiData.decision && aiData.phase === "decision") {
    clearInterval(state.timerInterval);
    setTimeout(() => showDecision(aiData.decision), 1500);
  }
}

async function sendMessage(text) {
  if (!text || state.isWaiting) return;

  // Stop recognition during API call + TTS (speakText will resume it after)
  if (recognition) try { recognition.stop(); } catch {}

  state.messages.push({ role: "user", content: text });
  addDiscussionEntry(text, "user");
  $("#discussionInput").value = "";
  setWaiting(true);

  try {
    const aiData = await callMistral(state.messages);
    state.messages.push({ role: "assistant", content: JSON.stringify(aiData) });
    await handleAIResponse(aiData);
  } catch (err) {
    addDiscussionEntry("Connection error: " + err.message, "ai");
    resumeMicIfActive();
  } finally {
    setWaiting(false);
    $("#discussionInput").focus();
  }
}

async function shareCode() {
  if (!state.editor || state.isWaiting) return;
  if (recognition) try { recognition.stop(); } catch {}

  const code = state.editor.getValue();
  const lang = state.currentLanguage;
  const msg = `[CODE SHARED — ${lang}]\n\`\`\`\n${code}\n\`\`\``;
  addDiscussionEntry(`(Shared ${lang} code with Alex)`, "user");

  state.messages.push({ role: "user", content: msg });
  setWaiting(true);

  try {
    const aiData = await callMistral(state.messages);
    state.messages.push({ role: "assistant", content: JSON.stringify(aiData) });
    await handleAIResponse(aiData);
  } catch (err) {
    addDiscussionEntry("Error sharing code: " + err.message, "ai");
    resumeMicIfActive();
  } finally {
    setWaiting(false);
  }
}

async function startInterview() {
  state.messages = [{ role: "system", content: buildSystemPrompt() }];

  const kickoff = `[SYSTEM: The candidate just joined. Give a brief 1-2 sentence welcome, mention the position, then immediately present the coding problem with examples in ${state.currentLanguage}. Do NOT ask them to introduce themselves. Get straight to the problem.]`;
  state.messages.push({ role: "user", content: kickoff });

  setWaiting(true);
  // Auto-activate mic from the start — speakText will pause/resume it around AI audio
  if (recognition) unmuteMic();

  try {
    const aiData = await callMistral(state.messages);
    state.messages.push({ role: "assistant", content: JSON.stringify(aiData) });
    await handleAIResponse(aiData);
  } catch (err) {
    addDiscussionEntry("Failed to connect. Check your API key in .env and restart.", "ai");
    resumeMicIfActive();
  } finally {
    setWaiting(false);
    $("#discussionInput").focus();
  }
}

async function endInterview() {
  if (state.isWaiting) return;
  if (recognition) try { recognition.stop(); } catch {}
  setWaiting(true);

  const endMsg = "[SYSTEM: End the interview now. Provide your final decision with verdict, scores, strengths, concerns, and summary. Set phase to 'decision'.]";
  state.messages.push({ role: "user", content: endMsg });

  try {
    const aiData = await callMistral(state.messages);
    state.messages.push({ role: "assistant", content: JSON.stringify(aiData) });
    await handleAIResponse(aiData);

    if (!aiData.decision || aiData.phase !== "decision") {
      clearInterval(state.timerInterval);
      showDecision({
        verdict: "further_review",
        scores: { technical: 5, communication: 5, problemSolving: 5, culturalFit: 5, experience: 5 },
        strengths: ["Interview ended early"],
        concerns: ["Assessment incomplete"],
        summary: "Interview concluded before all phases. Further review recommended.",
      });
    }
  } catch (err) {
    addDiscussionEntry("Error: " + err.message, "ai");
  } finally {
    setWaiting(false);
  }
}

// ==================== DECISION PAGE ====================
function showDecision(d) {
  showPage("decision");
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  muteMic();

  $("#decisionMeta").textContent = `${state.candidateName} — ${state.position} — Duration: ${$("#timer").textContent}`;

  const map = {
    strong_hire: { icon: "✅", text: "Strong Hire", cls: "strong_hire" },
    hire: { icon: "👍", text: "Hire", cls: "hire" },
    further_review: { icon: "🔄", text: "Further Review", cls: "further_review" },
    no_hire: { icon: "❌", text: "No Hire", cls: "no_hire" },
  };

  const v = map[d.verdict] || map.further_review;
  $("#decisionVerdict").className = "decision-verdict " + v.cls;
  $("#verdictIcon").textContent = v.icon;
  $("#verdictText").textContent = v.text;
  $("#verdictSummary").textContent = d.summary || "";

  const sl = $("#scoresList");
  sl.innerHTML = "";
  if (d.scores) {
    const labels = {
      technical: "Technical", communication: "Communication",
      problemSolving: "Problem Solving", culturalFit: "Cultural Fit", experience: "Experience",
    };
    for (const [k, val] of Object.entries(d.scores)) {
      const row = document.createElement("div");
      row.className = "score-row";
      row.innerHTML = `<span>${labels[k] || k}</span>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="score-bar-bg"><div class="score-bar-fill" style="width:${val * 10}%"></div></div>
          <span style="font-weight:600;min-width:28px;text-align:right">${val}/10</span>
        </div>`;
      sl.appendChild(row);
    }
  }

  const fill = (id, items) => {
    const ul = $(id);
    ul.innerHTML = "";
    (items || []).forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
  };
  fill("#strengthsList", d.strengths);
  fill("#concernsList", d.concerns);

  const fn = $("#fullNotes");
  fn.innerHTML = "";
  state.notes.forEach((n) => {
    const div = document.createElement("div");
    div.className = "note-line";
    div.textContent = n;
    fn.appendChild(div);
  });
}

// ==================== EVENT LISTENERS ====================
document.addEventListener("DOMContentLoaded", () => {
  initMonaco();
  initVoice();

  // Landing form
  $("#setupForm").addEventListener("submit", (e) => {
    e.preventDefault();
    state.candidateName = $("#candidateName").value.trim();
    state.position = $("#position").value.trim();
    state.jobDescription = $("#jobDescription").value.trim();
    if (!state.candidateName || !state.position) return;

    state.currentLanguage = $("#languageSelect").value;
    $("#headerPosition").textContent = state.position;
    showPage("interview");
    startTimer();
    startInterview();
  });

  // Discussion send
  $("#discussionForm").addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage($("#discussionInput").value.trim());
  });

  // Language change — also tell the AI
  $("#languageSelect").addEventListener("change", (e) => {
    changeLanguage(e.target.value);
    if (state.messages.length > 1) {
      state.messages.push({
        role: "user",
        content: `[SYSTEM: Candidate switched the editor language to ${e.target.value}. Adapt any code examples to this language.]`,
      });
    }
  });

  // Run code
  $("#runCodeBtn").addEventListener("click", runCode);

  // Clear console
  $("#clearConsoleBtn").addEventListener("click", () => {
    $("#consoleOutput").textContent = "Ready.";
  });

  // Share code with AI
  $("#shareCodeBtn").addEventListener("click", shareCode);

  // Mic
  $("#micBtn").addEventListener("click", toggleMic);

  // End interview
  $("#endInterviewBtn").addEventListener("click", () => {
    if (state.isWaiting) return;
    if (confirm("End the interview and get the final decision?")) endInterview();
  });

  // Analysis panel toggle
  $("#analysisToggle").addEventListener("click", () => {
    $("#analysisPanel").classList.toggle("collapsed");
  });

  // Keyboard shortcut: Ctrl+Enter to run code
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runCode();
    }
  });
});
