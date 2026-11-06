/* ==========================================================================
   SiliconSphere — VLSI learning & interview preparation
   Plain JavaScript, no framework. Data comes from questions.js (VLSI_DOMAINS).

   Sections
     1. Storage & state        (localStorage keys are unchanged from v1 so
                                existing user progress is preserved)
     2. Tracks, levels, XP
     3. Content helpers        (answer formatting, code highlighting, sections)
     4. Stats & gamification
     5. Renderers              (dashboard, domains, question lists, study mode,
                                achievements, search)
     6. Router                 (hash based: works on refresh / direct links
                                without any server rewrites)
     7. Events & init
   ========================================================================== */
"use strict";

const $ = id => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- 1. Storage & state ---------- */
const STORE = {
  done: "vlsi_master_done_v1", saved: "vlsi_master_saved_v1", theme: "vlsi_master_theme_v1",
  days: "vlsi_master_days_v1", last: "vlsi_master_last_v1", lastQ: "vlsi_master_lastq_v1",
  autoReveal: "vlsi_master_autoreveal_v1"
};
const lsGet = (k, fb) => { try { const v = localStorage.getItem(k); return v === null ? fb : v; } catch (e) { return fb; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode / quota */ } };
const lsJSON = (k, fb) => { try { const v = JSON.parse(lsGet(k, "null")); return Array.isArray(v) ? v : fb; } catch (e) { return fb; } };

const DOMAINS = typeof VLSI_DOMAINS !== "undefined" ? VLSI_DOMAINS : [];
const DOMAIN_BY_ID = new Map(DOMAINS.map(d => [d.id, d]));
/** id -> {q, d, index}. Built once so lookups are O(1) instead of scanning 5,000 items. */
const Q_INDEX = new Map();
DOMAINS.forEach(d => d.questions.forEach((q, index) => Q_INDEX.set(q.id, { q, d, index })));
const TOTAL_QUESTIONS = Q_INDEX.size;

// Drop stale ids (e.g. from an older data set) so counts and XP stay accurate.
const validIds = arr => arr.filter(id => Q_INDEX.has(id));
let completed = new Set(validIds(lsJSON(STORE.done, [])));
let bookmarks = new Set(validIds(lsJSON(STORE.saved, [])));
let studyDays = new Set(lsJSON(STORE.days, []).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s)));

const ui = {
  view: "dashboard", domain: null, qFilter: "all", section: "all", trackFilter: "all",
  qotdId: null, study: null, searchTerm: "", searchDomain: "all", searchResults: []
};

/* ---------- 2. Tracks, levels, XP ---------- */
const TRACKS = [
  { key: "digital", name: "Digital & RTL", emoji: "🧩", c1: "#2f6bff", c2: "#00c2ff", tag: "Logic, HDL, synthesis & circuit fundamentals", ids: [2, 3, 4, 5, 9, 10] },
  { key: "verif", name: "Verification", emoji: "🧪", c1: "#8b3dff", c2: "#ff4fd8", tag: "UVM, assertions, formal & coverage closure", ids: [6, 7, 32, 34, 36] },
  { key: "timing", name: "Timing & Signoff", emoji: "⏱️", c1: "#00b8a9", c2: "#2ee6a8", tag: "STA, SDC, CTS, crosstalk & timing closure", ids: [8, 12, 23, 38, 39] },
  { key: "dft", name: "DFT & Test", emoji: "🩺", c1: "#ff3d81", c2: "#ff8a5c", tag: "Scan, ATPG, BIST, ATE & production test", ids: [11, 22, 27, 33] },
  { key: "pd", name: "Physical Design", emoji: "🗺️", c1: "#12b76a", c2: "#4be0a0", tag: "Floorplan, place, route & physical verification", ids: [13, 20, 25, 40] },
  { key: "analog", name: "Analog, RF & Memory", emoji: "📡", c1: "#ff4757", c2: "#ff9f43", tag: "Analog CMOS, data converters, RF & memories", ids: [15, 16, 17, 18] },
  { key: "power", name: "Power & Reliability", emoji: "⚡", c1: "#f5b700", c2: "#ff8a00", tag: "Low power, IR drop, ESD, safety & thermal", ids: [14, 19, 21, 35, 41, 42, 43, 49] },
  { key: "soc", name: "SoC, FPGA & Packaging", emoji: "🚀", c1: "#00a8ff", c2: "#6a5cff", tag: "Architecture, FPGA flows, chiplets & 3D ICs", ids: [26, 30, 31] },
  { key: "device", name: "Device & Process", emoji: "🔬", c1: "#ff6a1a", c2: "#ffb02e", tag: "Semiconductor physics, FinFET/GAA & modeling", ids: [1, 24, 44, 45, 50] },
  { key: "mfg", name: "Manufacturing & EDA", emoji: "🏭", c1: "#7ccf00", c2: "#18c964", tag: "Yield, fab, post-silicon debug & EDA algorithms", ids: [28, 29, 37, 46, 47, 48] }
];
const TRACK_OF = new Map();
TRACKS.forEach(t => t.ids.forEach(id => TRACK_OF.set(id, t)));
const trackOf = id => TRACK_OF.get(Number(id)) || TRACKS[0];
const trackVars = t => `--c1:${t.c1};--c2:${t.c2}`;

/** 9 levels. The threshold is the number of questions marked as understood. */
const XP_PER_QUESTION = 10;
const LEVELS = [
  { at: 0, name: "Wafer Rookie", icon: "🌱", msg: "Every chip starts as bare silicon. Mark your first questions as understood." },
  { at: 25, name: "Transistor Tinkerer", icon: "🔧", msg: "The switches are flipping — fundamentals are taking shape." },
  { at: 100, name: "Logic Builder", icon: "🧩", msg: "Gates are connecting into real logic. Keep stacking concepts." },
  { at: 250, name: "RTL Ranger", icon: "🧭", msg: "You can navigate the RTL wilderness. Time to branch into new tracks." },
  { at: 500, name: "Timing Tamer", icon: "⏱️", msg: "Setup and hold no longer scare you. Push for closure." },
  { at: 1000, name: "Silicon Sage", icon: "🧙", msg: "A thousand concepts deep — you are interview-ready in many domains." },
  { at: 2000, name: "Tapeout Titan", icon: "🚀", msg: "Your knowledge is ready for tapeout. Close the remaining gaps." },
  { at: 3500, name: "Fab Legend", icon: "🏭", msg: "Legendary breadth. The finish line is in sight." },
  { at: 5000, name: "VLSI Master", icon: "👑", msg: "Every question understood. You are a VLSI Master!" }
];
function levelInfo(done) {
  let index = 0;
  for (let k = 0; k < LEVELS.length; k++) if (done >= LEVELS[k].at) index = k;
  const cur = LEVELS[index], next = LEVELS[index + 1] || null;
  const pct = next ? Math.min(100, Math.floor((done - cur.at) / (next.at - cur.at) * 100)) : 100;
  return { index, level: index + 1, ...cur, next, pct, toNext: next ? next.at - done : 0 };
}
const xpOf = done => done * XP_PER_QUESTION;

/* ---------- 3. Content helpers ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pad = (n, w = 2) => String(n).padStart(w, "0");
/** Escape text and wrap search matches in <mark>. */
function hl(text, term) {
  if (!term || term.length < 2) return esc(text);
  return String(text ?? "").split(new RegExp("(" + reEsc(term) + ")", "gi")).map((p, i) => i % 2 ? `<mark>${esc(p)}</mark>` : esc(p)).join("");
}
/** Some domain names were truncated in the source PDF ("… Design &"); end them cleanly. */
const niceName = n => { const s = String(n).trim(); return /[&,\-]$/.test(s) ? s.replace(/\s*[&,\-]$/, "") + "…" : s; };

/* Source-PDF artifacts, handled at display time only (questions.js stays untouched):
   - a few answers end with the *next* section's heading, e.g. "… Section 2 — UVM Architecture";
   - two answers carry a stray signature in Ethiopic script. */
const SIGNATURE_RE = /\s*[\u1200-\u137F][\u1200-\u137F\s]*$/;
const SECTION_TAIL_RE = /\s+(Section \d+\s*[–—-]\s*[^]*)$/;
const PLAIN_TAIL_RE = /([.?!)`"'])\s+([A-Z][^.?!`]{2,90})$/;
function splitAnswer(raw) {
  let text = String(raw ?? "").replace(SIGNATURE_RE, "");
  let heading = null, m = text.match(SECTION_TAIL_RE);
  if (m) { heading = m[1].trim(); text = text.slice(0, m.index); }
  else if (!/[.?!)`"']\s*$/.test(text) && (m = text.match(PLAIN_TAIL_RE))) {
    heading = m[2].trim(); text = text.slice(0, m.index + 1);
  }
  return { text: text.trim(), heading };
}
/** Per-domain sections derived from those headings: [{label, from, to}] (1-based numbers). */
const SECTIONS = new Map();
const CLEAN_ANSWER = new Map();
DOMAINS.forEach(d => {
  const starts = [];
  d.questions.forEach((q, i) => {
    const { text, heading } = splitAnswer(q.answer);
    CLEAN_ANSWER.set(q.id, text);
    if (heading && i < d.questions.length - 1) starts.push({ label: heading, from: d.questions[i + 1].number });
  });
  if (!starts.length) { SECTIONS.set(d.id, []); return; }
  const firstLabel = /^Section 2\b/.test(starts[0].label) ? "Section 1" : "Opening questions";
  const list = [{ label: firstLabel, from: d.questions[0].number }, ...starts];
  list.forEach((s, i) => { s.to = i < list.length - 1 ? list[i + 1].from - 1 : d.questions.at(-1).number; s.label = s.label.replace(/^Section (\d+)\s*[–—-]\s*/, "§$1 · "); });
  SECTIONS.set(d.id, list);
});
const answerOf = id => CLEAN_ANSWER.get(id) ?? "";
const sectionOf = (domainId, number) => (SECTIONS.get(domainId) || []).find(s => number >= s.from && number <= s.to) || null;

/** Lightweight Verilog / SystemVerilog / VHDL / Tcl / C highlighter for code snippets in answers. */
const KW = new Set(("module endmodule input output inout wire reg logic bit byte int integer always always_ff always_comb always_latch assign begin end if else case casez casex endcase default for while repeat forever posedge negedge or and not parameter localparam generate endgenerate genvar function endfunction task endtask initial class endclass extends virtual new return typedef enum struct packed unsigned signed interface endinterface modport package endpackage import property endproperty sequence endsequence assert assume cover covergroup endgroup coverpoint bins constraint rand randc foreach unique priority fork join join_any join_none static automatic void string super this disable iff within throughout intersect first_match process entity architecture is signal port map std_logic std_logic_vector downto to of when others then elsif library use proc set puts foreach_in_collection expr include define ifdef endif").split(" "));
function highlightCode(code) {
  const re = /(\/\/.*$|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*")|(\$[a-zA-Z_]\w*|`[a-zA-Z_]\w*)|(\b\d+'[sS]?[bBoOdDhH][0-9a-fA-FxXzZ_?]+\b|'[01xXzZ]\b|\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/gm;
  let out = "", last = 0, m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    const [tok, com, str, sys, num, word] = m;
    if (com) out += `<span class="tk-c">${esc(tok)}</span>`;
    else if (str) out += `<span class="tk-s">${esc(tok)}</span>`;
    else if (sys) out += `<span class="tk-f">${esc(tok)}</span>`;
    else if (num) out += `<span class="tk-n">${esc(tok)}</span>`;
    else if (word && KW.has(word)) out += `<span class="tk-k">${esc(tok)}</span>`;
    else out += esc(tok);
    last = m.index + tok.length;
  }
  return out + esc(code.slice(last));
}
/** Break a long one-line code snippet into readable lines (display only). */
function layoutCode(code) {
  return code
    .replace(/;\s+(?=\S)/g, ";\n")
    .replace(/\bbegin\s+/g, "begin\n")
    .replace(/\s+(end(?:module|case|class|function|task|interface|package|property|sequence)?)\b/g, "\n$1")
    .split("\n").reduce((acc, line) => {
      const t = line.trim(); if (/^end/.test(t)) acc.depth = Math.max(0, acc.depth - 1);
      acc.lines.push("  ".repeat(acc.depth) + t);
      if (/\bbegin$|^module\b|^class\b|^function\b|^task\b|^interface\b|^package\b/.test(t)) acc.depth++;
      return acc;
    }, { lines: [], depth: 0 }).lines.join("\n");
}
/** Render text that may contain `inline code` segments. */
function richText(text, term) {
  let afterBlock = false;
  return String(text).split(/(`[^`]+`)/).map(part => {
    if (!/^`[^`]+`$/.test(part)) {
      // drop sentence punctuation that would otherwise sit alone below a code block
      const t = afterBlock ? part.replace(/^[.,;]\s*/, "") : part; afterBlock = false;
      return hl(t, term);
    }
    const code = part.slice(1, -1);
    const termHit = term && term.length >= 2 && code.toLowerCase().includes(term.toLowerCase());
    if (code.length > 48 && /;/.test(code)) {
      const laid = layoutCode(code); afterBlock = true;
      return `<pre class="code-block"><code>${termHit ? hl(laid, term) : highlightCode(laid)}</code></pre>`;
    }
    return `<code class="code-inline">${termHit ? hl(code, term) : highlightCode(code)}</code>`;
  }).join("");
}
const ANSWER_LABELS = {
  "Example / follow-up:": ["ex", "💡 Example"], "Example / application:": ["app", "🛠️ Application"],
  "Example:": ["ex", "💡 Example"], "Applications:": ["app", "🛠️ Applications"],
  "Interview tip:": ["tip", "🎤 Interview tip"], "Follow-up to prepare:": ["fu", "🎯 Follow-up"], "Follow-up:": ["fu", "🎯 Follow-up"]
};
const LABEL_RE = /(Example \/ follow-up:|Example \/ application:|Follow-up to prepare:|Interview tip:|Applications:|Example:|Follow-up:)/;
/** Split an answer into the main explanation plus coloured Example / Application / Follow-up callouts. */
function formatAnswer(id, term) {
  const parts = answerOf(id).split(LABEL_RE);
  let html = parts[0].trim() ? `<p class="ans-main">${richText(parts[0].trim(), term)}</p>` : "";
  for (let i = 1; i < parts.length; i += 2) {
    const meta = ANSWER_LABELS[parts[i]], txt = (parts[i + 1] || "").trim();
    if (!txt) continue;
    html += `<div class="ans-chip ${meta[0]}"><b>${meta[1]}</b><div>${richText(txt, term)}</div></div>`;
  }
  return html;
}

/* ---------- 4. Stats & gamification ---------- */
const doneIn = d => { let n = 0; for (const q of d.questions) if (completed.has(q.id)) n++; return n; };
const percent = d => d.questions.length ? Math.floor(doneIn(d) / d.questions.length * 100) : 0;
const isMastered = d => d.questions.length > 0 && doneIn(d) === d.questions.length;
const dateKey = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const dayKey = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() - offset); return dateKey(d); };
/** Current streak: consecutive study days ending today (or yesterday, so it survives until you study today). */
function currentStreak() {
  let i = studyDays.has(dayKey(0)) ? 0 : 1, n = 0;
  while (studyDays.has(dayKey(i))) { n++; i++; }
  return n;
}
function longestStreak() {
  const days = [...studyDays].sort();
  let best = 0, run = 0, prev = null;
  for (const s of days) {
    const t = new Date(s + "T00:00:00");
    run = prev && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = t;
  }
  return best;
}
function motivation(done, li, streak) {
  if (!done) return "🚀 Open any domain, read an answer and mark it as understood to earn your first 10 XP.";
  if (!li.next) return "👑 You have completed the entire question bank. Revise your bookmarks to stay sharp!";
  if (li.toNext <= 5) return `⚡ So close! Just ${li.toNext} more to become a ${li.next.name}.`;
  if (streak >= 3) return `🔥 ${streak}-day streak — consistency is how tapeouts happen. Keep it alive today!`;
  if (studyDays.has(dayKey(1)) && !studyDays.has(dayKey(0))) return "⏰ Study today to keep your streak going.";
  return li.msg;
}

function saveState() {
  lsSet(STORE.done, JSON.stringify([...completed]));
  lsSet(STORE.saved, JSON.stringify([...bookmarks]));
  lsSet(STORE.days, JSON.stringify([...studyDays]));
  updateStats();
}
function setText(id, v) { const el = $(id); if (el && el.textContent !== String(v)) el.textContent = v; }
function updateStats() {
  const done = completed.size, saved = bookmarks.size, pct = TOTAL_QUESTIONS ? Math.floor(done / TOTAL_QUESTIONS * 100) : 0;
  const li = levelInfo(done), xp = xpOf(done), streak = currentStreak();
  setText("completedCount", done.toLocaleString()); setText("bookmarkCount", saved.toLocaleString());
  setText("navBookmarks", saved.toLocaleString()); setText("navCompleted", done.toLocaleString());
  setText("sidePercent", pct + "%"); $("sideProgressBar").style.width = pct + "%";
  setText("sideProgressText", `${done.toLocaleString()} of ${TOTAL_QUESTIONS.toLocaleString()} completed`);
  setText("sideLevelBadge", "LV " + li.level); setText("sideLevelName", li.name);
  $("sideXpBar").style.width = li.pct + "%";
  setText("sideXpText", li.next ? `${xp.toLocaleString()} XP · ${li.toNext} to LV ${li.level + 1}` : `${xp.toLocaleString()} XP · max level`);
  setText("levelChipText", "LV " + li.level); setText("levelChipIcon", li.icon);
  $("levelChip").title = `${li.name} · ${xp.toLocaleString()} XP`;
  setText("levelName", li.name); setText("levelSub", `Level ${li.level} of ${LEVELS.length} · ${xp.toLocaleString()} XP`);
  $("xpBar").style.width = li.pct + "%"; $("xpTrack").setAttribute("aria-valuenow", li.pct);
  setText("xpText", li.next ? `${li.toNext} more question${li.toNext === 1 ? "" : "s"} (${xpOf(li.toNext)} XP) to reach “${li.next.name}”` : "Maximum level reached — you are a VLSI Master! 🏆");
  $("levelRing").style.setProperty("--p", pct); setText("ringText", pct + "%");
  $("levelRing").setAttribute("aria-label", `Overall progress ${pct}%`);
  setText("streakCount", streak); setText("xpTotal", xp.toLocaleString());
  setText("domainsDone", DOMAINS.filter(isMastered).length);
  setText("motivation", motivation(done, li, streak));
  const ld = DOMAIN_BY_ID.get(Number(lsGet(STORE.last, "")));
  const cb = $("continueBtn"); cb.classList.toggle("hidden", !ld);
  if (ld) cb.textContent = "▶ Continue · Domain " + pad(ld.id);
}

/* Toasts are queued so simultaneous events (e.g. level-up + domain mastered) are all shown. */
const toastQueue = []; let toastBusy = false;
function toast(msg, kind = "") {
  if (toastQueue.length > 3) toastQueue.shift();
  toastQueue.push([msg, kind]); if (!toastBusy) nextToast();
}
function nextToast() {
  const item = toastQueue.shift(); const t = $("toast");
  if (!item) { toastBusy = false; return; }
  toastBusy = true; t.textContent = item[0]; t.className = "toast show " + item[1];
  setTimeout(() => { t.classList.remove("show"); setTimeout(nextToast, 260); }, item[1] ? 3200 : 2000);
}

function confetti(count = 90) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cv = $("confetti"), ctx = cv.getContext("2d"); cv.width = innerWidth; cv.height = innerHeight;
  const cols = ["#ff4fa3", "#ff8a3d", "#ffd23f", "#2ee6a8", "#00c2ff", "#8b3dff", "#ff4757"];
  const ps = Array.from({ length: count }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 260, y: innerHeight * .62, vx: (Math.random() - .5) * 13, vy: -Math.random() * 15 - 5, s: Math.random() * 7 + 4, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: cols[Math.random() * cols.length | 0], l: 1 }));
  (function tick() {
    ctx.clearRect(0, 0, cv.width, cv.height); let alive = false;
    for (const p of ps) {
      p.vy += .42; p.x += p.vx; p.y += p.vy; p.vx *= .992; p.r += p.vr; p.l -= .011;
      if (p.l > 0 && p.y < cv.height + 20) { alive = true; ctx.save(); ctx.globalAlpha = Math.max(p.l, 0); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); }
    }
    if (alive) requestAnimationFrame(tick); else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}

function toggleBookmark(id) {
  if (!Q_INDEX.has(id)) return;
  const on = !bookmarks.has(id);
  on ? bookmarks.add(id) : bookmarks.delete(id);
  saveState(); toast(on ? "⭐ Added to bookmarks" : "Removed from bookmarks");
  syncQuestion(id);
}
function toggleDone(id) {
  const entry = Q_INDEX.get(id); if (!entry) return;
  const d = entry.d, wasMastered = isMastered(d), lvBefore = levelInfo(completed.size).index;
  if (completed.has(id)) {
    completed.delete(id);
    const lvNow = levelInfo(completed.size);
    toast(lvNow.index < lvBefore ? `Marked as not completed · back to ${lvNow.name}` : "Marked as not completed (−10 XP)");
  } else {
    completed.add(id); studyDays.add(dayKey(0));
    const lvNow = levelInfo(completed.size); let celebrated = false;
    if (lvNow.index > lvBefore) { confetti(200); toast(`${lvNow.icon} Level up! You are now a ${lvNow.name} (LV ${lvNow.level})`, "big"); celebrated = true; }
    if (!wasMastered && isMastered(d)) { if (!celebrated) confetti(220); toast("🏆 Domain mastered: " + niceName(d.name), "big"); celebrated = true; }
    if (!celebrated) { confetti(30); toast(["✅ Nice one! +10 XP", "🔥 Keep it rolling! +10 XP", "⚡ Concept unlocked! +10 XP", "🚀 Brilliant! +10 XP"][completed.size % 4]); }
  }
  saveState(); syncQuestion(id);
}

/* ---------- 5. Renderers ---------- */
function domainCard(d) {
  const p = percent(d), t = trackOf(d.id), dn = doneIn(d), m = dn === d.questions.length;
  return `<a class="domain-card${m ? " mastered" : ""}" href="#/domain/${d.id}" style="${trackVars(t)}">
    <div class="domain-card-top"><span class="domain-symbol" aria-hidden="true">${t.emoji}</span><span class="domain-number">DOMAIN ${pad(d.id)}</span></div>
    <span class="track-pill">${esc(t.name)}</span>
    <h3>${esc(niceName(d.name))}</h3><p>${esc(t.tag)}</p>
    <div class="domain-card-bottom"><span>${d.questions.length} questions · ${dn} done</span><b>${m ? "🏆 Mastered" : p + "% →"}</b></div>
    <div class="card-progress" aria-hidden="true"><span style="width:${p}%"></span></div></a>`;
}
const EMPTY_DOMAINS = `<div class="empty-state"><div class="empty-icon">🔎</div><h3>No domains found</h3><p>Try another search term or track.</p></div>`;
function renderDomains(target, arr) { $(target).innerHTML = arr.map(domainCard).join("") || EMPTY_DOMAINS; }
function trackStats(t) {
  const ds = t.ids.map(id => DOMAIN_BY_ID.get(id)).filter(Boolean);
  const tot = ds.reduce((n, d) => n + d.questions.length, 0), dn = ds.reduce((n, d) => n + doneIn(d), 0);
  return { ds, tot, dn, p: tot ? Math.floor(dn / tot * 100) : 0 };
}
function renderTracks() {
  $("trackGrid").innerHTML = TRACKS.map(t => {
    const s = trackStats(t);
    return `<a class="track-tile" href="#/domains?track=${t.key}" style="${trackVars(t)}"><span class="tt-emoji" aria-hidden="true">${t.emoji}</span><strong>${t.name}</strong><small>${s.ds.length} domains · ${s.tot} Qs</small><div class="tt-bar" aria-hidden="true"><span style="width:${s.p}%"></span></div><em>${s.p}% complete</em></a>`;
  }).join("");
}
function renderTrackFilters() {
  const chip = (key, label, vars) => `<a class="chip-btn${ui.trackFilter === key ? " active" : ""}" href="#/domains${key === "all" ? "" : "?track=" + key}" style="${vars}" aria-current="${ui.trackFilter === key}">${label}</a>`;
  $("trackFilters").innerHTML = chip("all", "🌈 All tracks", "--c1:#7c5cff;--c2:#38bdf8") + TRACKS.map(t => chip(t.key, `${t.emoji} ${t.name}`, trackVars(t))).join("");
}
const FEATURED = [10, 6, 8, 13, 11, 31];
function renderDashboard() {
  renderDomains("featuredDomains", FEATURED.map(id => DOMAIN_BY_ID.get(id)).filter(Boolean));
  const inProg = DOMAINS.filter(d => { const n = doneIn(d); return n > 0 && n < d.questions.length; })
    .sort((a, b) => percent(b) - percent(a)).slice(0, 3);
  $("inProgressHeading").classList.toggle("hidden", !inProg.length);
  $("inProgressDomains").classList.toggle("hidden", !inProg.length);
  if (inProg.length) renderDomains("inProgressDomains", inProg);
  renderTracks(); pickQotd(false);
}
function filterDomains() {
  const term = $("domainSearch").value.toLowerCase().trim();
  const arr = DOMAINS.filter(d => {
    const t = trackOf(d.id);
    if (ui.trackFilter !== "all" && t.key !== ui.trackFilter) return false;
    return !term || (d.name + " " + t.name + " " + t.tag + " domain " + d.id).toLowerCase().includes(term);
  });
  $("domainResultCount").textContent = `${arr.length} domain${arr.length === 1 ? "" : "s"}`;
  renderDomains("allDomains", arr); renderTrackFilters();
}

/* Question cards (accordion). One delegated click handler serves every list. */
function qCard(q, d, withDomain, term) {
  const isDone = completed.has(q.id), isSaved = bookmarks.has(q.id), t = trackOf(d.id);
  return `<article class="question-card${isDone ? " is-done" : ""}" id="card-${q.id}" data-qid="${q.id}" style="${trackVars(t)}">
    <div class="question-row">
      <button class="question-head" type="button" aria-expanded="false" aria-controls="ans-${q.id}">
        <span class="q-number">${pad(q.number, 3)}</span>
        <span class="q-title">${withDomain ? `<span class="q-domain">${t.emoji} DOMAIN ${pad(d.id)} · ${esc(niceName(d.name))}</span>` : ""}${hl(q.question, term)}</span>
        <span class="q-chevron" aria-hidden="true">⌄</span>
      </button>
      <span class="question-actions">
        <button type="button" class="icon-btn${isSaved ? " saved" : ""}" data-action="bookmark" aria-pressed="${isSaved}" title="${isSaved ? "Remove bookmark" : "Bookmark"}" aria-label="Bookmark question ${q.number}">${isSaved ? "★" : "☆"}</button>
        <button type="button" class="icon-btn${isDone ? " done" : ""}" data-action="done" aria-pressed="${isDone}" title="${isDone ? "Understood — click to undo" : "Mark as understood"}" aria-label="Mark question ${q.number} as understood">${isDone ? "✓" : "○"}</button>
      </span>
    </div>
    <div class="answer-panel" id="ans-${q.id}" hidden></div></article>`;
}
/** Answer HTML is built lazily on first open — keeps big lists light. */
function fillAnswer(card, term) {
  const panel = card.querySelector(".answer-panel"), id = card.dataset.qid;
  if (panel.dataset.filled === "1") return;
  const isDone = completed.has(id), isSaved = bookmarks.has(id);
  panel.innerHTML = `<div class="answer-label">ANSWER</div><div class="answer-text">${formatAnswer(id, term)}</div>
    <div class="answer-footer">
      <button type="button" class="small-action${isDone ? " is-done" : ""}" data-action="done">${isDone ? "✓ Understood" : "✓ Mark as understood"}</button>
      <button type="button" class="small-action${isSaved ? " is-saved" : ""}" data-action="bookmark">${isSaved ? "★ Remove bookmark" : "☆ Bookmark"}</button>
      <a class="small-action" href="${studyHref(id)}">▶ Study mode</a>
      <button type="button" class="small-action" data-action="copy">▢ Copy</button>
    </div>`;
  panel.dataset.filled = "1";
}
function setCardOpen(card, open, term = currentTerm()) {
  if (open) fillAnswer(card, term);
  card.classList.toggle("open", open);
  card.querySelector(".answer-panel").hidden = !open;
  card.querySelector(".question-head").setAttribute("aria-expanded", String(open));
}
function currentTerm() {
  if (ui.view === "questions") return $("questionSearch").value.trim();
  if (ui.view === "search") return ui.searchTerm;
  return "";
}
const LIST_CAP = 120; // render in chunks so long lists (bookmarks/completed/search) stay fast
function renderQuestionCards(target, items, withDomain = false, term = "") {
  const el = $(target);
  const html = items.slice(0, LIST_CAP).map(({ q, d }) => qCard(q, d, withDomain, term)).join("");
  el.innerHTML = html;
  el._rest = items.slice(LIST_CAP); el._args = [withDomain, term];
  appendMoreButton(el);
}
function appendMoreButton(el) {
  el.querySelector(".load-more")?.remove();
  if (el._rest && el._rest.length) el.insertAdjacentHTML("beforeend", `<button type="button" class="outline-btn load-more" data-action="more">Show ${Math.min(LIST_CAP, el._rest.length)} more (${el._rest.length} remaining)</button>`);
}
function loadMore(el) {
  const chunk = el._rest.splice(0, LIST_CAP), [withDomain, term] = el._args;
  el.querySelector(".load-more")?.remove();
  el.insertAdjacentHTML("beforeend", chunk.map(({ q, d }) => qCard(q, d, withDomain, term)).join(""));
  appendMoreButton(el);
}
/** Update every rendered copy of a question in place (no list re-render → scroll & open state preserved). */
function syncQuestion(id) {
  const isDone = completed.has(id), isSaved = bookmarks.has(id);
  $$(`.question-card[data-qid="${id}"]`).forEach(card => {
    card.classList.toggle("is-done", isDone);
    const [bm, dn] = card.querySelectorAll(".question-actions .icon-btn");
    bm.classList.toggle("saved", isSaved); bm.textContent = isSaved ? "★" : "☆"; bm.setAttribute("aria-pressed", isSaved); bm.title = isSaved ? "Remove bookmark" : "Bookmark";
    dn.classList.toggle("done", isDone); dn.textContent = isDone ? "✓" : "○"; dn.setAttribute("aria-pressed", isDone); dn.title = isDone ? "Understood — click to undo" : "Mark as understood";
    const fd = card.querySelector('.answer-footer [data-action="done"]'), fb = card.querySelector('.answer-footer [data-action="bookmark"]');
    if (fd) { fd.classList.toggle("is-done", isDone); fd.textContent = isDone ? "✓ Understood" : "✓ Mark as understood"; }
    if (fb) { fb.classList.toggle("is-saved", isSaved); fb.textContent = isSaved ? "★ Remove bookmark" : "☆ Bookmark"; }
  });
  if (ui.view === "questions") updateDomainProgress();
  if (ui.view === "study") renderStudyState();
  if (ui.view === "bookmarks") $("bookmarksSub").textContent = bookmarkSub();
}

/* Domain page */
function updateDomainProgress() {
  const d = ui.domain, p = percent(d), dn = doneIn(d);
  $("domainProgressBar").style.width = p + "%";
  $("domainProgressText").textContent = `${p}% completed · ${dn}/${d.questions.length}`;
  $("domainBannerSub").textContent = `${d.questions.filter(q => bookmarks.has(q.id)).length} bookmarked`;
}
function openDomain(d, opts = {}) {
  const changed = ui.domain !== d; ui.domain = d;
  const t = trackOf(d.id);
  lsSet(STORE.last, String(d.id));
  $("questionsView").setAttribute("style", trackVars(t));
  $("bannerEmoji").textContent = t.emoji;
  $("domainEyebrow").textContent = `DOMAIN ${pad(d.id)} · ${t.name.toUpperCase()}`;
  $("domainTitle").textContent = niceName(d.name);
  $("domainDescription").textContent = `${t.tag} — ${d.questions.length} interview questions with answers.`;
  $("domainQuestionTotal").textContent = d.questions.length;
  const lastQ = lsGet(STORE.lastQ, ""), resume = Q_INDEX.get(lastQ)?.d === d ? lastQ : (d.questions.find(q => !completed.has(q.id)) || d.questions[0]).id;
  $("studyDomainBtn").href = studyHref(resume);
  $("studyDomainBtn").textContent = doneIn(d) ? "▶ Continue studying" : "▶ Start study mode";
  if (changed) { $("questionSearch").value = ""; ui.qFilter = "all"; ui.section = "all"; }
  if (opts.filter) ui.qFilter = opts.filter;
  const secs = SECTIONS.get(d.id) || [];
  $("sectionField").classList.toggle("hidden", !secs.length);
  $("sectionSelect").innerHTML = `<option value="all">All sections</option>` + secs.map((s, i) => `<option value="${i}">${esc(s.label)} (Q${s.from}–${s.to})</option>`).join("");
  $("sectionSelect").value = ui.section;
  setTabs(); renderDomainQuestions(); renderDomainPager(d);
}
function renderDomainPager(d) {
  const i = DOMAINS.indexOf(d), prev = DOMAINS[i - 1], next = DOMAINS[i + 1];
  const link = (x, dir) => x ? `<a class="pager-btn ${dir}" href="#/domain/${x.id}" style="${trackVars(trackOf(x.id))}"><small>${dir === "prev" ? "← Previous domain" : "Next domain →"}</small><span>${pad(x.id)} · ${esc(niceName(x.name))}</span></a>` : "<span></span>";
  $("domainPager").innerHTML = link(prev, "prev") + link(next, "next");
}
function domainFilteredQuestions() {
  const d = ui.domain, term = $("questionSearch").value.trim().toLowerCase();
  const sec = ui.section === "all" ? null : (SECTIONS.get(d.id) || [])[Number(ui.section)];
  return d.questions.filter(q => {
    if (sec && (q.number < sec.from || q.number > sec.to)) return false;
    if (term && !(q.question + " " + answerOf(q.id)).toLowerCase().includes(term)) return false;
    if (ui.qFilter === "todo") return !completed.has(q.id);
    if (ui.qFilter === "done") return completed.has(q.id);
    if (ui.qFilter === "saved") return bookmarks.has(q.id);
    return true;
  });
}
const FILTER_TITLES = { all: "All questions", todo: "Still to do", done: "Understood", saved: "Bookmarked" };
function renderDomainQuestions() {
  const d = ui.domain, term = $("questionSearch").value.trim(), qs = domainFilteredQuestions();
  const el = $("questionList");
  el.innerHTML = qs.map(q => qCard(q, d, false, term)).join("") ||
    `<div class="empty-state"><div class="empty-icon">${ui.qFilter === "todo" ? "🎉" : "🔎"}</div><h3>${ui.qFilter === "todo" && !term ? "All done here!" : "Nothing here"}</h3><p>No questions match this filter.</p></div>`;
  el._rest = null;
  $("questionListTitle").textContent = FILTER_TITLES[ui.qFilter] + (ui.section !== "all" ? " · " + $("sectionSelect").selectedOptions[0].text : "");
  $("questionResultCount").textContent = `${qs.length} of ${d.questions.length} questions`;
  $("listFooterText").textContent = `Showing ${qs.length} question${qs.length === 1 ? "" : "s"}`;
  updateDomainProgress();
}
function setTabs() { $$("#qTabs .tab").forEach(b => { const on = b.dataset.filter === ui.qFilter; b.classList.toggle("active", on); b.setAttribute("aria-pressed", on); }); }

/* Bookmarks / completed */
const itemsFor = ids => ids.map(id => Q_INDEX.get(id)).filter(Boolean);
const byBankOrder = (a, b) => a.d.id - b.d.id || a.index - b.index;
const bookmarkSub = () => bookmarks.size ? `${bookmarks.size} saved question${bookmarks.size === 1 ? "" : "s"} across ${new Set([...bookmarks].map(id => Q_INDEX.get(id).d.id)).size} domain(s).` : "Questions you have saved to revisit later.";
function renderBookmarks() {
  const items = itemsFor([...bookmarks]).sort(byBankOrder);
  $("bookmarkEmpty").classList.toggle("hidden", items.length > 0);
  $("studyBookmarks").classList.toggle("hidden", !items.length);
  if (items.length) $("studyBookmarks").href = studyHref(items[0].q.id, "bookmarks");
  $("bookmarksSub").textContent = bookmarkSub();
  renderQuestionCards("bookmarkList", items, true);
}
function renderCompleted() {
  const items = itemsFor([...completed]).sort(byBankOrder);
  $("completedEmpty").classList.toggle("hidden", items.length > 0);
  $("completedSub").textContent = items.length ? `${items.length.toLocaleString()} understood · ${xpOf(items.length).toLocaleString()} XP earned.` : "Keep building momentum, one understood concept at a time.";
  renderQuestionCards("completedList", items, true);
}

/* Global search — a lower-cased index is built once on first use. */
let SEARCH_INDEX = null;
function buildSearchIndex() {
  SEARCH_INDEX = [];
  for (const d of DOMAINS) for (const q of d.questions) SEARCH_INDEX.push({ q, d, qText: q.question.toLowerCase(), aText: answerOf(q.id).toLowerCase() });
}
function runSearch(term) {
  if (!SEARCH_INDEX) buildSearchIndex();
  const query = term.trim().toLowerCase(); ui.searchTerm = term.trim();
  const words = query.split(/\s+/).filter(Boolean);
  const results = [];
  if (words.length) for (const e of SEARCH_INDEX) {
    const hay = e.qText + " " + e.aText + " " + e.d.name.toLowerCase();
    if (!words.every(w => hay.includes(w))) continue;
    // rank: phrase in question > all words in question > answer-only
    const score = e.qText.includes(query) ? 0 : words.every(w => e.qText.includes(w)) ? 1 : 2;
    results.push({ ...e, score });
  }
  results.sort((a, b) => a.score - b.score || byBankOrder(a, b));
  ui.searchResults = results;
  renderSearch();
}
function renderSearch() {
  const all = ui.searchResults, term = ui.searchTerm;
  const counts = new Map(); all.forEach(r => counts.set(r.d.id, (counts.get(r.d.id) || 0) + 1));
  if (ui.searchDomain !== "all" && !counts.has(Number(ui.searchDomain))) ui.searchDomain = "all";
  const shown = ui.searchDomain === "all" ? all : all.filter(r => r.d.id === Number(ui.searchDomain));
  $("searchSummary").textContent = term ? `${all.length.toLocaleString()} matching question${all.length === 1 ? "" : "s"} for “${term}”${counts.size ? ` in ${counts.size} domain${counts.size === 1 ? "" : "s"}` : ""}.` : "Type in the search box to search all questions and answers.";
  const facets = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  $("searchFacets").innerHTML = facets.length > 1 ? `<button type="button" class="chip-btn${ui.searchDomain === "all" ? " active" : ""}" data-facet="all" style="--c1:#7c5cff;--c2:#38bdf8">All · ${all.length}</button>` +
    facets.map(([id, n]) => `<button type="button" class="chip-btn${String(ui.searchDomain) === String(id) ? " active" : ""}" data-facet="${id}" style="${trackVars(trackOf(id))}">${trackOf(id).emoji} D${pad(id)} · ${n}</button>`).join("") : "";
  $("searchEmpty").classList.toggle("hidden", shown.length > 0 || !term);
  renderQuestionCards("searchList", shown, true, term);
}

/* Dashboard: question of the day */
function pickQotd(shuffle) {
  const ids = [...Q_INDEX.keys()]; if (!ids.length) return;
  if (shuffle) ui.qotdId = ids[Math.random() * ids.length | 0];
  else if (!ui.qotdId) { let h = 0; for (const c of dayKey(0)) h = (h * 31 + c.charCodeAt(0)) >>> 0; ui.qotdId = ids[h % ids.length]; }
  const { q, d } = Q_INDEX.get(ui.qotdId), t = trackOf(d.id);
  $("qotd").setAttribute("style", trackVars(t));
  $("qotdDomain").textContent = `${t.emoji} Domain ${pad(d.id)} · ${niceName(d.name)}`;
  $("qotdDomain").href = `#/domain/${d.id}`;
  $("qotdQuestion").textContent = q.question;
  $("qotdAnswer").innerHTML = formatAnswer(q.id, ""); $("qotdAnswer").classList.add("hidden");
  $("qotdReveal").textContent = "Reveal answer"; $("qotdReveal").setAttribute("aria-expanded", "false");
  $("qotdOpen").href = studyHref(q.id);
}

/* Study mode: one question at a time with previous / next navigation. */
function studyHref(id, ctx) { return `#/q/${id}${ctx ? "?from=" + ctx : ""}`; }
function studyList(ctx, entry) {
  if (ctx === "bookmarks") { const l = itemsFor([...bookmarks]).sort(byBankOrder); if (l.some(x => x.q.id === entry.q.id)) return { list: l, label: "Bookmarks" }; }
  if (ctx === "completed") { const l = itemsFor([...completed]).sort(byBankOrder); if (l.some(x => x.q.id === entry.q.id)) return { list: l, label: "Completed" }; }
  return { list: entry.d.questions.map((q, index) => ({ q, d: entry.d, index })), label: null };
}
function openStudy(id, ctx) {
  const entry = Q_INDEX.get(id); if (!entry) return false;
  const { list, label } = studyList(ctx, entry), pos = list.findIndex(x => x.q.id === id);
  const usedCtx = label ? ctx : null;
  ui.study = { id, ctx: usedCtx, list, pos };
  ui.domain = entry.d; lsSet(STORE.last, String(entry.d.id)); lsSet(STORE.lastQ, id);
  const { q, d } = entry, t = trackOf(d.id);
  $("studyView").setAttribute("style", trackVars(t));
  $("studyBack").href = usedCtx ? `#/${usedCtx}` : `#/domain/${d.id}`;
  $("studyBack").textContent = usedCtx ? `← Back to ${label.toLowerCase()}` : "← Back to domain";
  $("studyDomain").innerHTML = `${t.emoji} DOMAIN ${pad(d.id)} · ${esc(niceName(d.name))}`;
  $("studyDomain").href = `#/domain/${d.id}`;
  $("studyPos").textContent = `${label ? label + " · " : "Question "}${pos + 1} / ${list.length}`;
  const sec = sectionOf(d.id, q.number);
  $("studySection").textContent = sec ? sec.label : ""; $("studySection").classList.toggle("hidden", !sec);
  $("studyTrackBar").style.width = ((pos + 1) / list.length * 100) + "%";
  $("studyQuestion").innerHTML = `<span class="q-number">${pad(q.number, 3)}</span><span>${esc(q.question)}</span>`;
  $("studyAnswer").innerHTML = formatAnswer(id, "");
  const auto = lsGet(STORE.autoReveal, "0") === "1"; $("studyAutoReveal").checked = auto;
  setStudyRevealed(auto);
  const prev = list[pos - 1], next = list[pos + 1], suffix = usedCtx ? "?from=" + usedCtx : "";
  const navLink = (el, item, lab) => {
    el.classList.toggle("disabled", !item);
    if (item) { el.href = `#/q/${item.q.id}${suffix}`; el.removeAttribute("aria-disabled"); lab.textContent = `${usedCtx ? "D" + pad(item.d.id) + " · " : ""}Q${pad(item.q.number, 3)} · ${item.q.question}`; }
    else { el.removeAttribute("href"); el.setAttribute("aria-disabled", "true"); lab.textContent = usedCtx ? "End of list" : "End of domain"; }
  };
  navLink($("studyPrev"), prev, $("studyPrevLabel")); navLink($("studyNext"), next, $("studyNextLabel"));
  renderStudyState();
  return true;
}
function setStudyRevealed(on) {
  $("studyAnswer").classList.toggle("hidden", !on);
  $("studyReveal").setAttribute("aria-expanded", String(on));
  $("studyReveal").innerHTML = on ? "Hide answer <kbd>Space</kbd>" : "Reveal answer <kbd>Space</kbd>";
}
function renderStudyState() {
  if (!ui.study) return;
  const id = ui.study.id, isDone = completed.has(id), isSaved = bookmarks.has(id);
  const b1 = $("studyDone"), b2 = $("studySave");
  b1.classList.toggle("is-done", isDone); b1.setAttribute("aria-pressed", isDone); b1.innerHTML = (isDone ? "✓ Understood" : "✓ Mark as understood") + " <kbd>M</kbd>";
  b2.classList.toggle("is-saved", isSaved); b2.setAttribute("aria-pressed", isSaved); b2.innerHTML = (isSaved ? "★ Bookmarked" : "☆ Bookmark") + " <kbd>B</kbd>";
  $("studyCard").classList.toggle("is-done", isDone);
}

/* Achievements page */
function renderAchievements() {
  const done = completed.size, li = levelInfo(done), xp = xpOf(done), streak = currentStreak(), best = longestStreak();
  const mastered = DOMAINS.filter(isMastered).length;
  $("achSummary").innerHTML = `
    <div class="ach-hero" style="--c1:#8b3dff;--c2:#ff4fa3"><span class="ach-icon">${li.icon}</span><div><small>LEVEL ${li.level} OF ${LEVELS.length}</small><strong>${li.name}</strong>
      <div class="xp-track light"><span style="width:${li.pct}%"></span></div>
      <small>${li.next ? `${xp.toLocaleString()} / ${xpOf(li.next.at).toLocaleString()} XP · ${li.toNext} more question${li.toNext === 1 ? "" : "s"} to ${li.next.name}` : `${xp.toLocaleString()} XP · maximum level`}</small></div></div>
    <div class="ach-stat"><b>${xp.toLocaleString()}</b><span>⚡ Total XP</span></div>
    <div class="ach-stat"><b>${done.toLocaleString()}</b><span>✅ Questions understood</span></div>
    <div class="ach-stat"><b>${streak}</b><span>🔥 Current streak</span></div>
    <div class="ach-stat"><b>${best}</b><span>🏅 Longest streak</span></div>
    <div class="ach-stat"><b>${studyDays.size}</b><span>📅 Study days</span></div>
    <div class="ach-stat"><b>${mastered}/${DOMAINS.length}</b><span>🏆 Domains mastered</span></div>`;
  $("levelGrid").innerHTML = LEVELS.map((L, i) => {
    const state = i < li.index ? "earned" : i === li.index ? "current" : "locked";
    const next = LEVELS[i + 1], span = next ? next.at - L.at : 0;
    const p = state === "earned" ? 100 : state === "current" ? li.pct : 0;
    return `<div class="level-card ${state}"><span class="lv-icon">${state === "locked" ? "🔒" : L.icon}</span><small>LEVEL ${i + 1}</small><strong>${L.name}</strong>
      <em>${L.at.toLocaleString()} questions · ${xpOf(L.at).toLocaleString()} XP</em>
      ${next ? `<div class="lv-bar"><span style="width:${p}%"></span></div><small class="lv-note">${state === "current" ? `${done - L.at} / ${span} toward next level` : state === "earned" ? "Completed ✓" : "Locked"}</small>` : `<small class="lv-note">${state === "current" ? "Achieved 👑" : "Complete all questions"}</small>`}</div>`;
  }).join("");
  // 35-day activity grid (study days come from questions marked as understood)
  let cells = "";
  for (let i = 34; i >= 0; i--) { const k = dayKey(i), on = studyDays.has(k); cells += `<span class="day${on ? " on" : ""}${i === 0 ? " today" : ""}" title="${k}${on ? " · studied" : ""}"></span>`; }
  $("activity").innerHTML = `<div class="day-grid">${cells}</div><small>Each square is a day; coloured days are days you marked at least one question as understood.</small>`;
  $("trackAch").innerHTML = TRACKS.map(t => { const s = trackStats(t); return `<a class="track-row" href="#/domains?track=${t.key}" style="${trackVars(t)}"><span>${t.emoji}</span><b>${t.name}</b><div class="tt-bar"><span style="width:${s.p}%"></span></div><em>${s.dn}/${s.tot}</em></a>`; }).join("");
  $("badgeCount").textContent = `${mastered} of ${DOMAINS.length} earned`;
  $("badgeGrid").innerHTML = DOMAINS.map(d => {
    const t = trackOf(d.id), m = isMastered(d), p = percent(d);
    return `<a class="badge${m ? " earned" : ""}" href="#/domain/${d.id}" style="${trackVars(t)}" title="${esc(niceName(d.name))} — ${p}%"><span class="badge-icon">${m ? t.emoji : pad(d.id)}</span><small>${esc(niceName(d.name))}</small><i style="--p:${p}"></i></a>`;
  }).join("");
}

/* Export / import progress (JSON backup) */
function exportProgress() {
  const data = { app: "SiliconSphere", version: 1, exportedAt: new Date().toISOString(), completed: [...completed], bookmarks: [...bookmarks], studyDays: [...studyDays] };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `siliconsphere-progress-${dayKey(0)}.json` });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("⬇ Progress exported");
}
function importProgress(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!Array.isArray(data.completed) || !Array.isArray(data.bookmarks)) throw new Error("bad file");
      validIds(data.completed).forEach(id => completed.add(id));
      validIds(data.bookmarks).forEach(id => bookmarks.add(id));
      (data.studyDays || []).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s)).forEach(s => studyDays.add(s));
      saveState(); updateStats(); renderAchievements(); toast("⬆ Progress imported and merged", "big");
    } catch (e) { toast("That file is not a valid SiliconSphere backup"); }
  };
  r.readAsText(file);
}

/* ---------- 6. Router ----------
   #/                       dashboard
   #/domains[?track=key]    domain library
   #/domain/:id[?filter=]   one domain's questions
   #/q/:qid[?from=ctx]      study mode (ctx: bookmarks | completed)
   #/bookmarks  #/completed  #/achievements  #/search?q=…            */
const VIEW_LABELS = { dashboard: "Dashboard", domains: "All domains", bookmarks: "Bookmarks", completed: "Completed", achievements: "Achievements", search: "Search results", notfound: "Not found" };
function parseHash() {
  const raw = location.hash.replace(/^#!?\/?/, "");
  const [path, qs] = raw.split("?");
  return { parts: path.split("/").filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(qs || "") };
}
function show(view, crumbs, title) {
  const changed = ui.view !== view; ui.view = view;
  $$(".view").forEach(v => v.classList.toggle("active", v.id === view + "View"));
  const navKey = view === "questions" || view === "study" ? "domains" : view;
  $$(".nav-item[data-nav]").forEach(a => { const on = a.dataset.nav === navKey; a.classList.toggle("active", on); on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); });
  $("breadcrumbs").innerHTML = `<a href="#/">Workspace</a>` + (crumbs || [[VIEW_LABELS[view] || view]]).map(([label, href]) => `<b>/</b>${href ? `<a href="${href}">${esc(label)}</a>` : `<strong>${esc(label)}</strong>`}`).join("");
  document.title = (title || VIEW_LABELS[view] || "SiliconSphere") + (view === "dashboard" ? " · SiliconSphere — VLSI Learning & Interview Preparation" : " · SiliconSphere");
  closeSidebar();
  return changed;
}
function route() {
  const { parts, params } = parseHash(), [head, arg] = parts;
  const scrollTop = () => window.scrollTo(0, 0);
  switch (head || "") {
    case "": show("dashboard"); renderDashboard(); scrollTop(); break;
    case "domains": {
      ui.trackFilter = TRACKS.some(t => t.key === params.get("track")) ? params.get("track") : "all";
      const t = TRACKS.find(x => x.key === ui.trackFilter);
      show("domains", t ? [["All domains", "#/domains"], [t.name]] : null, t ? t.name + " domains" : "All domains");
      filterDomains(); scrollTop(); break;
    }
    case "domain": {
      const d = DOMAIN_BY_ID.get(Number(arg)); if (!d) return notFound();
      const f = params.get("filter");
      openDomain(d, { filter: FILTER_TITLES[f] ? f : null });
      show("questions", [["All domains", "#/domains"], [`${pad(d.id)} · ${niceName(d.name)}`]], niceName(d.name));
      scrollTop(); break;
    }
    case "q": {
      if (!openStudy(arg, params.get("from"))) return notFound();
      const { q, d } = Q_INDEX.get(arg);
      show("study", [["All domains", "#/domains"], [`${pad(d.id)} · ${niceName(d.name)}`, `#/domain/${d.id}`], [`Q${pad(q.number, 3)}`]], `Q${q.number}: ${q.question}`);
      scrollTop(); break;
    }
    case "bookmarks": show("bookmarks"); renderBookmarks(); scrollTop(); break;
    case "completed": show("completed"); renderCompleted(); scrollTop(); break;
    case "achievements": show("achievements"); renderAchievements(); scrollTop(); break;
    case "search": {
      const q = params.get("q") || "", fresh = ui.view !== "search";
      if ($("globalSearch").value !== q && document.activeElement !== $("globalSearch")) $("globalSearch").value = q;
      if (q.trim() !== ui.searchTerm || fresh || !ui.searchResults.length) { ui.searchDomain = "all"; runSearch(q); }
      show("search", null, q ? `Search: ${q}` : "Search");
      if (fresh) scrollTop(); break;
    }
    default: notFound();
  }
}
function notFound() { show("notfound"); }
function go(hash) {
  if (location.hash === hash) route(); else location.hash = hash;
}

/* ---------- 7. Events & init ---------- */
function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  $$("[data-theme-toggle]").forEach(b => { b.setAttribute("aria-pressed", String(dark)); b.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme"); });
  $$("[data-theme-text]").forEach(el => el.textContent = dark ? "Light theme" : "Dark theme");
  $$("[data-theme-icon]").forEach(el => el.textContent = dark ? "☀️" : "🌙");
}
function openSidebar() { $("sidebar").classList.add("open"); $("scrim").hidden = false; $("mobileMenu").setAttribute("aria-expanded", "true"); }
function closeSidebar() { $("sidebar").classList.remove("open"); $("scrim").hidden = true; $("mobileMenu").setAttribute("aria-expanded", "false"); }
function copyQuestion(id) {
  const e = Q_INDEX.get(id); if (!e) return;
  const text = `${e.q.question}\n\n${answerOf(id)}`;
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast("📋 Question and answer copied"), () => toast("Clipboard access unavailable"));
}
const randomId = (list = [...Q_INDEX.keys()]) => list[Math.random() * list.length | 0];

function bindEvents() {
  // One delegated handler for every question list (domain, bookmarks, completed, search).
  document.addEventListener("click", e => {
    const more = e.target.closest('[data-action="more"]'); if (more) { loadMore(more.parentElement); return; }
    const card = e.target.closest(".question-card");
    if (card) {
      const btn = e.target.closest("[data-action]"), id = card.dataset.qid;
      if (btn) {
        e.preventDefault();
        if (btn.dataset.action === "bookmark") toggleBookmark(id);
        else if (btn.dataset.action === "done") toggleDone(id);
        else if (btn.dataset.action === "copy") copyQuestion(id);
        return;
      }
      if (e.target.closest(".question-head")) setCardOpen(card, !card.classList.contains("open"));
      return;
    }
    const facet = e.target.closest("[data-facet]"); if (facet) { ui.searchDomain = facet.dataset.facet; renderSearch(); return; }
    if (e.target.closest("[data-theme-toggle]")) { const dark = !document.documentElement.classList.contains("dark"); applyTheme(dark); lsSet(STORE.theme, dark ? "dark" : "light"); return; }
    if (e.target.closest("[data-scroll-top]")) window.scrollTo({ top: 0, behavior: "smooth" });
  });

  document.addEventListener("keydown", e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("globalSearch").focus(); $("globalSearch").select(); return; }
    if (e.key === "Escape") { closeSidebar(); if (typing) e.target.blur(); return; }
    if (e.key === "/" && !typing) { e.preventDefault(); $("globalSearch").focus(); return; }
    if (ui.view !== "study" || typing || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "arrowright" || k === "j") { const n = $("studyNext"); if (n.getAttribute("href")) { e.preventDefault(); location.hash = n.getAttribute("href"); } }
    else if (k === "arrowleft" || k === "k") { const p = $("studyPrev"); if (p.getAttribute("href")) { e.preventDefault(); location.hash = p.getAttribute("href"); } }
    else if (k === " " && !e.target.closest("button,a")) { e.preventDefault(); setStudyRevealed($("studyAnswer").classList.contains("hidden")); }
    else if (k === "m") toggleDone(ui.study.id);
    else if (k === "b") toggleBookmark(ui.study.id);
  });

  $("continueBtn").addEventListener("click", () => {
    const lastQ = lsGet(STORE.lastQ, ""), d = DOMAIN_BY_ID.get(Number(lsGet(STORE.last, "1")));
    go(Q_INDEX.has(lastQ) && Q_INDEX.get(lastQ).d === d ? studyHref(lastQ) : `#/domain/${(d || DOMAINS[0]).id}`);
  });
  $("randomBtn").addEventListener("click", () => go(studyHref(randomId())));
  $("randomInDomain").addEventListener("click", () => { if (ui.domain) go(studyHref(randomId(ui.domain.questions.map(q => q.id)))); });
  $("qotdShuffle").addEventListener("click", () => pickQotd(true));
  $("qotdReveal").addEventListener("click", () => { const h = $("qotdAnswer").classList.toggle("hidden"); $("qotdReveal").textContent = h ? "Reveal answer" : "Hide answer"; $("qotdReveal").setAttribute("aria-expanded", String(!h)); });

  $("domainSearch").addEventListener("input", filterDomains);
  let qsTimer; $("questionSearch").addEventListener("input", () => { clearTimeout(qsTimer); qsTimer = setTimeout(renderDomainQuestions, 120); });
  $("sectionSelect").addEventListener("change", e => { ui.section = e.target.value; renderDomainQuestions(); });
  $("qTabs").addEventListener("click", e => { const b = e.target.closest(".tab"); if (!b) return; ui.qFilter = b.dataset.filter; setTabs(); renderDomainQuestions(); });
  $("expandAll").addEventListener("click", () => $$("#questionList .question-card").forEach(c => setCardOpen(c, true)));
  $("collapseAll").addEventListener("click", () => $$("#questionList .question-card").forEach(c => setCardOpen(c, false)));

  $("studyReveal").addEventListener("click", () => setStudyRevealed($("studyAnswer").classList.contains("hidden")));
  $("studyAutoReveal").addEventListener("change", e => { lsSet(STORE.autoReveal, e.target.checked ? "1" : "0"); if (e.target.checked) setStudyRevealed(true); });
  $("studyDone").addEventListener("click", () => toggleDone(ui.study.id));
  $("studySave").addEventListener("click", () => toggleBookmark(ui.study.id));
  $("studyCopy").addEventListener("click", () => copyQuestion(ui.study.id));

  $("exportBtn").addEventListener("click", exportProgress);
  $("importInput").addEventListener("change", e => { if (e.target.files[0]) importProgress(e.target.files[0]); e.target.value = ""; });

  $("mobileMenu").addEventListener("click", () => $("sidebar").classList.contains("open") ? closeSidebar() : openSidebar());
  $("scrim").addEventListener("click", closeSidebar);

  // Global search: debounced live search (3+ chars) and Enter to search immediately; URL stays shareable.
  let gsTimer;
  const searchNow = v => { const q = v.trim(); if (!q) return; const h = "#/search?q=" + encodeURIComponent(q); ui.view === "search" ? (history.replaceState(null, "", h), route()) : (location.hash = h); };
  $("globalSearch").addEventListener("input", e => { clearTimeout(gsTimer); const v = e.target.value; if (v.trim().length >= 3) gsTimer = setTimeout(() => searchNow(v), 220); });
  $("globalSearch").addEventListener("keydown", e => { if (e.key === "Enter") { clearTimeout(gsTimer); searchNow(e.target.value); } });

  window.addEventListener("hashchange", route);
  // Keep progress in sync across open tabs.
  window.addEventListener("storage", e => {
    if (![STORE.done, STORE.saved, STORE.days].includes(e.key)) return;
    completed = new Set(validIds(lsJSON(STORE.done, []))); bookmarks = new Set(validIds(lsJSON(STORE.saved, []))); studyDays = new Set(lsJSON(STORE.days, []));
    updateStats(); route();
  });
}

function init() {
  $("loading").remove();
  if (!DOMAINS.length) { $("main").insertAdjacentHTML("beforeend", `<div class="empty-state"><h3>Question bank failed to load</h3><p>Please refresh the page.</p></div>`); return; }
  setText("totalDomains", DOMAINS.length); setText("totalQuestions", TOTAL_QUESTIONS.toLocaleString());
  setText("domainNavCount", DOMAINS.length);
  applyTheme(document.documentElement.classList.contains("dark"));
  bindEvents(); updateStats(); route();
  // Follow the OS theme until the user picks one explicitly.
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", e => { if (!lsGet(STORE.theme, "")) applyTheme(e.matches); });
}
init();
