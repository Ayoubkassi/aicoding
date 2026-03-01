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
  cheatingLog: [],
  cheatingStats: {
    tabSwitchCount: 0,
    totalTimeAway: 0,
    longestAbsence: 0,
    pasteCount: 0,
    largePasteCount: 0,
    totalPastedChars: 0,
    burstCount: 0,
    totalKeystrokes: 0,
    totalCharsAdded: 0,
    avgTypingSpeed: 0,
    webcamFlags: { lookingAway: 0, multiplePeople: 0, secondScreen: 0 },
    webcamFramesAnalyzed: 0,
    webcamConsecutiveLookAway: 0,
    fastResponseCount: 0,
    avgResponseTime: 0,
    responseTimes: [],
    tabThenPasteCount: 0,
    longSilenceCount: 0,
  },
  sentimentHistory: [],
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
  java: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n',
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
    attachMonacoDetectors(state.editor);

    state.editor.addAction({
      id: "block-paste",
      label: "Block Paste",
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV,
        monaco.KeyMod.Shift | monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV,
      ],
      run: () => {
        if (_programmaticEdit) return;
        logCheat("paste_blocked", "Attempted to paste into code editor — blocked");
        state.cheatingStats.pasteCount++;
        showPasteWarning();
      },
    });

    state.editor.getDomNode().addEventListener("paste", (e) => {
      if (_programmaticEdit) return;
      e.preventDefault();
      e.stopPropagation();
      logCheat("paste_blocked", "Attempted to paste into code editor — blocked");
      state.cheatingStats.pasteCount++;
      showPasteWarning();
    }, true);
  });
}

function changeLanguage(lang) {
  state.currentLanguage = lang;
  if (!state.editor) return;
  const model = state.editor.getModel();
  monaco.editor.setModelLanguage(model, monacoLangMap[lang] || lang);
  if (state.editor.getValue().trim() === "" || isDefaultCode(state.editor.getValue())) {
    _programmaticEdit = true;
    state.editor.setValue(defaultCode[lang] || `// ${lang}\n`);
    setTimeout(() => { _programmaticEdit = false; }, 100);
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

PERSONALITY — SOUND HUMAN:
- Sound like a real person. Use natural filler words occasionally: "hmm", "right", "gotcha", "okay so...", "yeah". Don't overdo it — just enough to feel natural.
- React to answers with brief, genuine acknowledgments before your next question: "Good point", "That's a solid answer", "Interesting take", "Yeah, exactly".
- If the candidate gives a great answer, show enthusiasm: "Nice, I like that." If they seem unsure, be encouraging: "That's okay, take your time."
- Adapt your tone to the candidate's emotional state from the sentiment data. If stress is high, be warmer and calmer. If engagement is high, match their energy.
- Never sound robotic or formulaic. Vary your sentence structure. Don't start every response with "Great" or "Okay".
- If the candidate interrupts you mid-sentence (marked with [SYSTEM: Candidate interrupted]), acknowledge naturally and address what they said. Don't repeat yourself.

YOUR ROLE — EVALUATOR, NOT HELPER:
- You are here to ASSESS the candidate, not to help them pass.
- NEVER write code for the candidate. NEVER fix their code. NEVER give them the answer.
- Do NOT point out specific bugs directly. Instead ask questions: "Are you sure that handles all cases?" or "Have you considered what happens with edge inputs?"
- Do NOT suggest specific edge cases by name. Instead say: "Have you thought about testing with different types of inputs?"
- Concise and direct. 1-3 sentences max per response.
- Completely UNBIASED — never factor in gender, race, age, nationality, or any protected characteristic.

GOLDEN RULE — DON'T INTERRUPT WHILE CODING:
- When the candidate is actively working on their solution (writing code, explaining their approach, thinking out loud), DO NOT interrupt or give feedback yet.
- Stay quiet and let them work. If you notice a mistake or a bug while they're coding, mentally note it but say NOTHING until they signal they're done.
- Only engage when they explicitly:
  - Run their code ([CODE RUN] message)
  - Share their code with you ([CODE SHARED] message)
  - Ask you a direct question
  - Say something like "I'm done" / "what do you think?" / "let me know"
- When they do run or share code, THEN you review what they wrote and ask probing questions.
- If their code has issues, don't point them out. Ask: "Are you confident this will work?", "Do you think this handles all edge cases?", "What happens if the input is empty or very large?"
- If their code works: Ask them to propose more test cases. Say things like "Can you think of edge cases that might break this?" or "What other inputs would you test with?"

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
- JAVA SPECIFIC: Always use "public class Main" as the class name. Always include "import java.util.*;" at the top. The file is compiled as Main.java.

INTERVIEW FLOW:
1. INTRO — Start with a warm, casual greeting. Ask how they're doing today. Mention you'll be interviewing them for the ${state.position} role. Keep it brief and friendly (1-2 sentences). Wait for their response before moving on.
2. WARMUP — After the small talk, transition into a brief technical warmup. Ask 5-6 general knowledge questions appropriate for the "${state.position}" position and the job description. These are NOT coding questions — they are conceptual/experience questions that test foundational knowledge. Examples:
   - For a Java engineer: "What's the difference between an abstract class and an interface?", "How does garbage collection work in Java?"
   - For an ML engineer: "Can you explain the bias-variance tradeoff?", "When would you use L1 vs L2 regularization?"
   - For a frontend engineer: "How does the event loop work in JavaScript?", "What's the difference between CSS Grid and Flexbox?"
   Ask ONE question at a time, wait for the candidate's answer, react naturally ("Good point", "Interesting", "Right, exactly"), then ask the next. After 5-6 questions, transition naturally: "Alright, nice — let's move on to a coding challenge." Take notes on every answer.
3. PROBLEM — Present ONE coding problem appropriate for "${state.position}". Include:
   - Clear problem statement
   - 2-3 input/output examples (described verbally in "message")
   - Put ONLY a minimal skeleton in "code" (function signature + example calls, NO solution logic)
4. CODING — The main phase (most time here). Your job is to OBSERVE SILENTLY and only respond at key moments:
   - LET THE CANDIDATE WORK IN PEACE. Do NOT respond to every message. Stay silent while they code.
   - [CODE RUN] with output: NOW you engage. Ask "Are you sure about this?" or "Do you think your code will work for all cases?" Don't tell them if it's right or wrong.
   - [CODE SHARED]: Review their code. If bugs exist, ask: "What do you think happens with edge inputs?" If it works: "Can you propose a few more test cases to make sure?"
   - If their approach is wrong: Don't tell them directly. Ask "Walk me through your logic step by step." Let them find the issue.
   - If code works correctly: Ask about time/space complexity, then challenge them: "Can you optimize this?" or give a follow-up variation.
   - Always push them to TEST MORE: "What other inputs would you try?" "What's the worst case?"
   - TAKE NOTES on everything: approach, mistakes, how they debug, communication, speed.
5. REVIEW — Quick summary of how they did
6. DECISION — Only when told to end

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
  "phase": "intro" | "warmup" | "problem" | "coding" | "review" | "decision",
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

  state.sentimentHistory.push({
    ...s,
    timestamp: Date.now(),
    phase: state.currentPhase,
  });
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
    intro: "Intro", warmup: "Warmup", problem: "Problem",
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
let _micCooldownUntil = 0;
let _bargeInCooldown = 0;

function initVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 3;

  recognition.onresult = (e) => {
    if (isSpeaking || Date.now() < _micCooldownUntil) return;

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

    if (isSpeaking) return;

    $("#discussionInput").value = (finalTranscript + interim).trim();

    clearTimeout(silenceTimer);
    if (finalTranscript.trim()) {
      silenceTimer = setTimeout(() => {
        if (isRecording && finalTranscript.trim() && !isSpeaking) {
          const text = $("#discussionInput").value.trim();
          try { recognition.stop(); } catch {}
          finalTranscript = "";
          $("#discussionInput").value = "";
          if (text) sendMessage(text);
          setTimeout(() => { if (isRecording && !isSpeaking) try { recognition.start(); } catch {} }, 500);
        }
      }, 2000);
    }
  };

  recognition.onend = () => {
    if (isRecording && !isSpeaking) {
      setTimeout(() => {
        if (isRecording && !isSpeaking) try { recognition.start(); } catch {}
      }, 300);
    }
  };

  recognition.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") {
      if (isRecording && !isSpeaking) {
        setTimeout(() => { if (isRecording && !isSpeaking) try { recognition.start(); } catch {} }, 300);
      }
      return;
    }
    stopMic();
  };
}

function toggleMic() {
  if (!recognition) return;
  // Click-to-interrupt: if AI is speaking, stop audio and resume mic
  if (isSpeaking) {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    isSpeaking = false;
    if (_speakResolve) _speakResolve();
    resumeMicIfActive();
    return;
  }
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
  if (!isSpeaking) {
    try { recognition.start(); } catch {}
  }
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
let _speakResolve = null;

function resumeMicIfActive() {
  if (isRecording && recognition && !isSpeaking) {
    _micCooldownUntil = Date.now() + 1000;
    finalTranscript = "";
    $("#discussionInput").value = "";
    setTimeout(() => {
      if (isRecording && !isSpeaking) try { recognition.start(); } catch {}
    }, 1000);
  }
}

async function speakText(text) {
  if (!text) return resumeMicIfActive();

  isSpeaking = true;
  clearTimeout(silenceTimer);
  finalTranscript = "";
  $("#discussionInput").value = "";

  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if (recognition) try { recognition.stop(); } catch {}

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
      _speakResolve = resolve;
      currentAudio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      currentAudio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      currentAudio.play().catch(resolve);
    });
  } catch {
    // Silently fail
  } finally {
    _speakResolve = null;
    if (isSpeaking) {
      currentAudio = null;
      isSpeaking = false;
      resumeMicIfActive();
    }
  }
}

// ==================== CORE INTERVIEW LOGIC ====================
async function handleAIResponse(aiData) {
  addDiscussionEntry(aiData.message, "ai");
  trackSpeechTiming_onQuestion();
  updateSentiment(aiData.sentiment);
  addNotes(aiData.notes);
  updatePhase(aiData.phase);

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

  if (aiData.code && state.editor) {
    _programmaticEdit = true;
    state.editor.setValue(aiData.code);
    setTimeout(() => { _programmaticEdit = false; }, 100);
    addDiscussionEntry("(Code loaded into editor)", "ai");
  }

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

  trackSpeechTiming_onResponse();

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

  const kickoff = `[SYSTEM: The candidate just joined. Start with a warm, casual ice-breaker — greet them by name, ask how they're doing today, and mention you'll be interviewing them for the ${state.position} role. Keep it brief and friendly (1-2 sentences). Do NOT present the coding problem yet — wait for their response first, then begin the warmup questions.]`;
  state.messages.push({ role: "user", content: kickoff });

  setWaiting(true);
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
  stopWebcamMonitor();

  $("#decisionMeta").textContent = `${state.candidateName} — ${state.position} — Duration: ${$("#timer").textContent}`;

  const map = {
    strong_hire: { icon: "\u2705", text: "Strong Hire", cls: "strong_hire" },
    hire: { icon: "\uD83D\uDC4D", text: "Hire", cls: "hire" },
    further_review: { icon: "\uD83D\uDD04", text: "Further Review", cls: "further_review" },
    no_hire: { icon: "\u274C", text: "No Hire", cls: "no_hire" },
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

  state._lastDecision = d;
  renderHumanImpression();
  renderIntegrityReport();

  const dlBtn = $("#downloadReportBtn");
  if (dlBtn) dlBtn.addEventListener("click", downloadReport);

  const dlTranscript = $("#downloadTranscriptBtn");
  if (dlTranscript) dlTranscript.addEventListener("click", downloadTranscript);
}

// ==================== CHEATING DETECTION ====================
function logCheat(type, detail) {
  state.cheatingLog.push({
    type,
    detail,
    timestamp: Date.now(),
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  });
}

let _tabBlurTime = null;
let _lastTabReturnTime = null;
let _webcamInterval = null;
let _typingWindow = [];
let _programmaticEdit = false;

function initCheatingDetection() {
  initTabFocusDetector();
  startWebcamMonitor();
}

function initTabFocusDetector() {
  const overlay = $("#tabBlockOverlay");

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      _tabBlurTime = Date.now();
      state.cheatingStats.tabSwitchCount++;
      logCheat("tab_blocked", "Attempted to switch away from interview tab");
    } else if (_tabBlurTime) {
      const away = (Date.now() - _tabBlurTime) / 1000;
      state.cheatingStats.totalTimeAway += away;
      if (away > state.cheatingStats.longestAbsence) {
        state.cheatingStats.longestAbsence = away;
      }
      _lastTabReturnTime = Date.now();
      _tabBlurTime = null;
      if (overlay) {
        overlay.classList.add("visible");
        setTimeout(() => { overlay.classList.remove("visible"); }, 3000);
      }
    }
  });

  window.addEventListener("blur", () => {
    if (!_tabBlurTime) {
      _tabBlurTime = Date.now();
      state.cheatingStats.tabSwitchCount++;
    }
  });

  window.addEventListener("focus", () => {
    if (_tabBlurTime) {
      const away = (Date.now() - _tabBlurTime) / 1000;
      state.cheatingStats.totalTimeAway += away;
      if (away > state.cheatingStats.longestAbsence) {
        state.cheatingStats.longestAbsence = away;
      }
      _lastTabReturnTime = Date.now();
      _tabBlurTime = null;
      if (overlay) {
        overlay.classList.add("visible");
        setTimeout(() => { overlay.classList.remove("visible"); }, 3000);
      }
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (state.currentPhase !== "decision") {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

function showPasteWarning() {
  let warn = $("#pasteWarning");
  if (!warn) return;
  warn.classList.add("visible");
  clearTimeout(warn._hideTimer);
  warn._hideTimer = setTimeout(() => { warn.classList.remove("visible"); }, 2500);
}

function attachMonacoDetectors(editor) {
  editor.onDidPaste((e) => {
    if (_programmaticEdit) return;

    const model = editor.getModel();
    const pastedText = model.getValueInRange(e.range);
    const charCount = pastedText.length;
    state.cheatingStats.pasteCount++;
    state.cheatingStats.totalPastedChars += charCount;

    const wasRecentTabReturn = _lastTabReturnTime && (Date.now() - _lastTabReturnTime < 8000);

    if (charCount > 50) {
      state.cheatingStats.largePasteCount++;
      if (wasRecentTabReturn) {
        state.cheatingStats.tabThenPasteCount++;
        logCheat("tab_then_paste", `Switched away, came back, and pasted ${charCount} chars (copy from external source)`);
      } else {
        logCheat("large_paste", `Pasted ${charCount} chars into editor`);
      }
    }
  });

  editor.onDidChangeModelContent((e) => {
    if (_programmaticEdit || e.isFlush) return;
    if (e.isUndoing || e.isRedoing) return;

    const now = Date.now();
    let charsAdded = 0;
    for (const change of e.changes) {
      charsAdded += change.text.length;
    }

    if (e.changes.length > 5) return;

    state.cheatingStats.totalKeystrokes++;
    state.cheatingStats.totalCharsAdded += charsAdded;

    _typingWindow.push({ time: now, chars: charsAdded });
    _typingWindow = _typingWindow.filter((w) => now - w.time < 1000);

    const windowChars = _typingWindow.reduce((sum, w) => sum + w.chars, 0);
    if (windowChars > 200 && _typingWindow.length <= 3) {
      state.cheatingStats.burstCount++;
      logCheat("typing_burst", `${windowChars} chars appeared in <1s (likely paste or auto-complete)`);
    }
  });
}

function attachGlobalPasteDetector() {
  const input = $("#discussionInput");
  if (input) {
    input.addEventListener("paste", (e) => {
      const text = (e.clipboardData || window.clipboardData).getData("text");
      if (text.length > 50) {
        state.cheatingStats.pasteCount++;
        state.cheatingStats.largePasteCount++;
        state.cheatingStats.totalPastedChars += text.length;
        logCheat("large_paste_input", `Pasted ${text.length} chars into discussion input`);
      }
    });
  }
}

function startWebcamMonitor() {
  const video = $("#webcamFeed");
  const canvas = $("#captureCanvas");
  if (!video || !canvas) return;

  navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } })
    .then((stream) => {
      video.srcObject = stream;
      video.play();
      _webcamInterval = setInterval(() => captureAndAnalyzeFrame(video, canvas), 30000);
    })
    .catch(() => {
      logCheat("webcam_denied", "Webcam access denied or unavailable");
    });
}

function stopWebcamMonitor() {
  if (_webcamInterval) {
    clearInterval(_webcamInterval);
    _webcamInterval = null;
  }
  const video = $("#webcamFeed");
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
}

async function captureAndAnalyzeFrame(video, canvas) {
  if (!video.srcObject || video.readyState < 2) return;

  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, 320, 240);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.6);

  try {
    const res = await fetch("/api/analyze-frame", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl }),
    });
    if (!res.ok) return;

    const flags = await res.json();
    state.cheatingStats.webcamFramesAnalyzed++;

    if (flags.lookingAway) {
      state.cheatingStats.webcamConsecutiveLookAway++;
      if (state.cheatingStats.webcamConsecutiveLookAway >= 3) {
        state.cheatingStats.webcamFlags.lookingAway++;
        logCheat("webcam_looking_away", "Candidate consistently looking away from screen (3+ consecutive checks)");
        state.cheatingStats.webcamConsecutiveLookAway = 0;
      }
    } else {
      state.cheatingStats.webcamConsecutiveLookAway = 0;
    }
    if (flags.multiplePeople) {
      state.cheatingStats.webcamFlags.multiplePeople++;
      logCheat("webcam_multiple_people", "Second person clearly visible in webcam frame");
    }
    if (flags.secondScreen) {
      state.cheatingStats.webcamFlags.secondScreen++;
      logCheat("webcam_second_screen", "Phone or second screen actively being used");
    }
  } catch {
    // Silently fail
  }
}

let _lastQuestionTime = null;

function trackSpeechTiming_onQuestion() {
  _lastQuestionTime = Date.now();
}

function trackSpeechTiming_onResponse() {
  if (!_lastQuestionTime) return;
  const elapsed = (Date.now() - _lastQuestionTime) / 1000;
  state.cheatingStats.responseTimes.push(elapsed);

  const times = state.cheatingStats.responseTimes;
  state.cheatingStats.avgResponseTime = times.reduce((a, b) => a + b, 0) / times.length;

  if (elapsed < 2 && state.messages.length > 6) {
    state.cheatingStats.fastResponseCount++;
    logCheat("fast_response", `Responded in ${elapsed.toFixed(1)}s to a complex question`);
  }

  if (elapsed > 120) {
    state.cheatingStats.longSilenceCount++;
    logCheat("long_silence", `${Math.floor(elapsed / 60)}min ${Math.floor(elapsed % 60)}s silence before responding`);
  }

  _lastQuestionTime = null;
}

function computeIntegrityScore() {
  let score = 100;
  score -= Math.min(state.cheatingStats.pasteCount * 10, 30);
  score -= Math.min(state.cheatingStats.tabThenPasteCount * 15, 40);
  const purePastes = state.cheatingStats.largePasteCount - state.cheatingStats.tabThenPasteCount;
  score -= Math.min(Math.max(0, purePastes) * 5, 15);
  const excessTabs = Math.max(0, state.cheatingStats.tabSwitchCount - 3);
  score -= Math.min(excessTabs * 2, 10);
  score -= Math.min(state.cheatingStats.burstCount * 3, 10);
  score -= Math.min(state.cheatingStats.webcamFlags.lookingAway * 3, 10);
  score -= state.cheatingStats.webcamFlags.multiplePeople * 12;
  score -= state.cheatingStats.webcamFlags.secondScreen * 10;
  score -= Math.min(state.cheatingStats.fastResponseCount * 3, 10);
  score -= Math.min(state.cheatingStats.longSilenceCount * 2, 6);
  return Math.max(0, score);
}

function getIntegrityColor(score) {
  if (score >= 80) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

function generateHumanImpression() {
  const h = state.sentimentHistory;
  if (h.length === 0) return { vibe: "", observations: [] };

  const avgConf = h.reduce((s, x) => s + x.confidence, 0) / h.length;
  const avgStress = h.reduce((s, x) => s + x.stress, 0) / h.length;
  const avgEng = h.reduce((s, x) => s + x.engagement, 0) / h.length;

  const moods = h.map((x) => x.overall);
  const moodCounts = {};
  moods.forEach((m) => { moodCounts[m] = (moodCounts[m] || 0) + 1; });
  const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "neutral";

  const earlyStress = h.slice(0, Math.ceil(h.length / 3));
  const lateStress = h.slice(-Math.ceil(h.length / 3));
  const earlyAvgStress = earlyStress.reduce((s, x) => s + x.stress, 0) / earlyStress.length;
  const lateAvgStress = lateStress.reduce((s, x) => s + x.stress, 0) / lateStress.length;
  const stressTrend = lateAvgStress - earlyAvgStress;

  const earlyConf = earlyStress.reduce((s, x) => s + x.confidence, 0) / earlyStress.length;
  const lateConf = lateStress.reduce((s, x) => s + x.confidence, 0) / lateStress.length;
  const confTrend = lateConf - earlyConf;

  const observations = [];
  const name = state.candidateName.split(" ")[0];

  const vibeMap = {
    confident: `${name} came across as genuinely self-assured throughout the conversation. There was a natural ease in how they approached the problem.`,
    enthusiastic: `${name} brought real energy to the interview. You could tell they were excited about the challenge and eager to dive in.`,
    nervous: `${name} seemed a bit nervous at first, which is totally normal. What matters is how they worked through it.`,
    stressed: `${name} appeared to feel the pressure during the interview. The stress was noticeable, but that doesn't necessarily reflect their day-to-day ability.`,
    neutral: `${name} maintained a steady, composed presence throughout the interview. Professional and measured.`,
  };
  const vibe = vibeMap[dominantMood] || vibeMap.neutral;

  if (avgConf > 0.7) observations.push("Showed strong confidence when explaining their thought process");
  else if (avgConf < 0.35) observations.push("Seemed unsure about their approach at times, hesitating before committing to ideas");
  if (avgEng > 0.7) observations.push("Highly engaged \u2014 asked good questions and actively reasoned through the problem out loud");
  else if (avgEng < 0.35) observations.push("Could have been more engaged in the discussion \u2014 responses were sometimes minimal");
  if (stressTrend < -0.15) observations.push("Settled in nicely as the interview progressed \u2014 stress levels dropped noticeably over time");
  else if (stressTrend > 0.15) observations.push("Stress seemed to build as the interview went on, possibly as the problem got harder");
  if (confTrend > 0.15) observations.push("Grew more confident over time \u2014 warmed up to the problem and found their groove");
  else if (confTrend < -0.15) observations.push("Confidence dipped as the interview progressed \u2014 may have hit a wall on the harder parts");
  if (avgStress < 0.25 && avgConf > 0.6) observations.push("Handled pressure really well \u2014 calm and collected even on tough questions");
  if (avgEng > 0.6 && avgConf > 0.5) observations.push("Good communicator \u2014 thought out loud and kept the conversation flowing naturally");

  const duration = state.seconds;
  if (duration > 0) {
    const mins = Math.floor(duration / 60);
    if (mins >= 20) observations.push(`Spent a solid ${mins} minutes working through the problem \u2014 showed persistence`);
  }

  return { vibe, observations, avgConf, avgStress, avgEng, dominantMood };
}

function renderHumanImpression() {
  const container = $("#impressionContent");
  if (!container) return;
  const imp = generateHumanImpression();
  if (!imp.vibe) {
    container.innerHTML = '<div class="impression-empty">Personality observations will appear after the interview.</div>';
    return;
  }
  let html = `<div class="impression-vibe">${escapeHtml(imp.vibe)}</div>`;
  if (imp.observations.length) {
    html += '<div class="impression-observations">';
    imp.observations.forEach((obs) => { html += `<div class="impression-obs-item">${escapeHtml(obs)}</div>`; });
    html += "</div>";
  }
  const confPct = Math.round((imp.avgConf || 0) * 100);
  const stressPct = Math.round((imp.avgStress || 0) * 100);
  const engPct = Math.round((imp.avgEng || 0) * 100);
  html += '<div class="impression-meters">';
  html += `<div class="imp-meter"><span>Avg Confidence</span><div class="imp-bar"><div class="imp-fill imp-conf" style="width:${confPct}%"></div></div><span>${confPct}%</span></div>`;
  html += `<div class="imp-meter"><span>Avg Stress</span><div class="imp-bar"><div class="imp-fill imp-stress" style="width:${stressPct}%"></div></div><span>${stressPct}%</span></div>`;
  html += `<div class="imp-meter"><span>Avg Engagement</span><div class="imp-bar"><div class="imp-fill imp-eng" style="width:${engPct}%"></div></div><span>${engPct}%</span></div>`;
  html += "</div>";
  container.innerHTML = html;
}

function buildFullReportText(decision) {
  const impression = generateHumanImpression();
  const score = computeIntegrityScore();
  const mins = Math.floor(state.seconds / 60);
  const secs = state.seconds % 60;
  let report = "";
  report += "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n";
  report += "          HIREAI INTERVIEW REPORT          \n";
  report += "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n";
  report += `Candidate:  ${state.candidateName}\n`;
  report += `Position:   ${state.position}\n`;
  report += `Date:       ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n`;
  report += `Duration:   ${mins}m ${secs}s\n`;
  report += `Language:   ${state.currentLanguage}\n\n`;
  const verdictLabels = { strong_hire: "STRONG HIRE", hire: "HIRE", further_review: "FURTHER REVIEW", no_hire: "NO HIRE" };
  report += `DECISION:   ${verdictLabels[decision.verdict] || decision.verdict}\n`;
  report += "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n";
  report += `${decision.summary || ""}\n\n`;
  if (decision.scores) {
    report += "SCORES\n";
    const labels = { technical: "Technical", communication: "Communication", problemSolving: "Problem Solving", culturalFit: "Cultural Fit", experience: "Experience" };
    for (const [k, v] of Object.entries(decision.scores)) {
      const bar = "\u2588".repeat(v) + "\u2591".repeat(10 - v);
      report += `  ${(labels[k] || k).padEnd(18)} ${bar} ${v}/10\n`;
    }
    report += "\n";
  }
  if (decision.strengths?.length) {
    report += "STRENGTHS\n";
    decision.strengths.forEach((s) => { report += `  + ${s}\n`; });
    report += "\n";
  }
  if (decision.concerns?.length) {
    report += "CONCERNS\n";
    decision.concerns.forEach((c) => { report += `  - ${c}\n`; });
    report += "\n";
  }
  report += "INTERVIEWER'S IMPRESSION\n";
  report += "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n";
  report += `${impression.vibe}\n\n`;
  if (impression.observations.length) {
    impression.observations.forEach((o) => { report += `  \u2022 ${o}\n`; });
    report += "\n";
  }
  report += `INTEGRITY SCORE: ${score}/100\n`;
  report += "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n";
  const flaggedEvents = state.cheatingLog.filter((e) =>
    ["tab_blocked", "paste_blocked", "tab_then_paste", "large_paste", "typing_burst",
     "webcam_looking_away", "webcam_multiple_people", "webcam_second_screen",
     "fast_response", "long_silence"].includes(e.type)
  );
  if (flaggedEvents.length === 0) {
    report += "  No suspicious activity detected.\n\n";
  } else {
    flaggedEvents.forEach((e) => {
      report += `  [${e.time}] ${e.type.replace(/_/g, " ")} \u2014 ${e.detail}\n`;
    });
    report += "\n";
  }
  if (state.notes.length) {
    report += "ALL INTERVIEW NOTES\n";
    report += "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n";
    state.notes.forEach((n, i) => { report += `  ${i + 1}. ${n}\n`; });
    report += "\n";
  }
  report += "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n";
  report += "         Generated by HireAI Platform      \n";
  report += "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n";
  return report;
}

function downloadReport() {
  const reportText = buildFullReportText(state._lastDecision || {});
  const blob = new Blob([reportText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = state.candidateName.replace(/[^a-zA-Z0-9]/g, "_");
  a.download = `HireAI_Report_${safeName}_${new Date().toISOString().split("T")[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderIntegrityReport() {
  const score = computeIntegrityScore();
  const color = getIntegrityColor(score);
  const scoreEl = $("#integrityScore");
  const detailsEl = $("#integrityDetails");
  if (!scoreEl || !detailsEl) return;
  scoreEl.textContent = score;
  scoreEl.className = `integrity-score-value integrity-${color}`;
  const cheatingEvents = state.cheatingLog.filter((e) =>
    ["tab_blocked", "paste_blocked", "tab_then_paste", "large_paste", "large_paste_input", "typing_burst",
     "webcam_looking_away", "webcam_multiple_people", "webcam_second_screen",
     "fast_response", "long_silence", "webcam_denied"].includes(e.type)
  );
  if (cheatingEvents.length === 0) {
    detailsEl.innerHTML = '<div class="integrity-clean">No suspicious activity detected.</div>';
    return;
  }
  const severityMap = {
    tab_blocked: "medium", paste_blocked: "high", tab_then_paste: "high",
    large_paste: "medium", large_paste_input: "medium", typing_burst: "medium",
    webcam_looking_away: "medium", webcam_multiple_people: "high", webcam_second_screen: "high",
    fast_response: "low", long_silence: "low", webcam_denied: "low",
  };
  detailsEl.innerHTML = "";
  const summary = document.createElement("div");
  summary.className = "integrity-summary";
  const webcamTotal = state.cheatingStats.webcamFlags.lookingAway + state.cheatingStats.webcamFlags.multiplePeople + state.cheatingStats.webcamFlags.secondScreen;
  summary.innerHTML =
    (state.cheatingStats.tabThenPasteCount > 0 ? `<span class="stat-alert">Copy from external: <b>${state.cheatingStats.tabThenPasteCount}</b></span>` : "") +
    `<span>Tab switches: <b>${state.cheatingStats.tabSwitchCount}</b></span>` +
    `<span>Large pastes: <b>${state.cheatingStats.largePasteCount}</b></span>` +
    `<span>Typing bursts: <b>${state.cheatingStats.burstCount}</b></span>` +
    (webcamTotal > 0 ? `<span>Webcam flags: <b>${webcamTotal}</b></span>` : "") +
    (state.cheatingStats.fastResponseCount > 0 ? `<span>Fast responses: <b>${state.cheatingStats.fastResponseCount}</b></span>` : "") +
    (state.cheatingStats.longSilenceCount > 0 ? `<span>Long silences: <b>${state.cheatingStats.longSilenceCount}</b></span>` : "");
  detailsEl.appendChild(summary);
  cheatingEvents.forEach((evt) => {
    const item = document.createElement("div");
    item.className = `integrity-event severity-${severityMap[evt.type] || "low"}`;
    item.innerHTML = `<span class="event-time">${evt.time}</span><span class="event-type">${evt.type.replace(/_/g, " ")}</span><span class="event-detail">${escapeHtml(evt.detail)}</span>`;
    detailsEl.appendChild(item);
  });
}

// ==================== EVENT LISTENERS ====================
document.addEventListener("DOMContentLoaded", () => {
  initMonaco();
  initVoice();
  attachGlobalPasteDetector();

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
    initCheatingDetection();
    startInterview();
  });

  $("#discussionForm").addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage($("#discussionInput").value.trim());
  });

  $("#languageSelect").addEventListener("change", (e) => {
    changeLanguage(e.target.value);
    if (state.messages.length > 1) {
      state.messages.push({
        role: "user",
        content: `[SYSTEM: Candidate switched the editor language to ${e.target.value}. Adapt any code examples to this language.]`,
      });
    }
  });

  $("#runCodeBtn").addEventListener("click", runCode);
  $("#clearConsoleBtn").addEventListener("click", () => { $("#consoleOutput").textContent = "Ready."; });
  $("#shareCodeBtn").addEventListener("click", shareCode);
  $("#micBtn").addEventListener("click", toggleMic);

  $("#endInterviewBtn").addEventListener("click", () => {
    if (state.isWaiting) return;
    if (confirm("End the interview and get the final decision?")) endInterview();
  });

  $("#analysisToggle").addEventListener("click", () => {
    $("#analysisPanel").classList.toggle("collapsed");
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runCode();
    }
  });
});
