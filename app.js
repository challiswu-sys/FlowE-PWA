const STORAGE_KEY = "englishflow-state-v3";
const LEGACY_STORAGE_KEY = "englishflow-state-v2";
const DB_NAME = "englishflow-files-v1";
const DB_VERSION = 1;
const BLOCKED_PUBLIC_MATERIAL_IDS = new Set(["xhs_6a25584d"]);

let state = loadState();
let activeView = "materials";
let activeMaterialId = state.materials[0]?.id || null;
let activeChunkId = state.chunks[0]?.id || null;
let currentAnalysis = null;
let latestFeedback = null;
let activeAudioUrl = null;
let segmentTimer = null;
let recognition = null;
let activeVoiceButton = null;
let practiceClock = null;
let lastPracticeTick = Date.now();
let ieltsRound = 0;
let practiceSummaryOpen = false;
let practiceSummaryMode = "month";
let practiceSummaryCursor = new Date();

const IELTS_QUESTION_BANK = [
  {
    prompt: "Choose the most natural sentence.",
    options: ["I have a hard time understanding fast speech.", "I am difficult to understand fast speech.", "I have hard time to understand fast speech."],
    answer: 0,
    note: "Use have a hard time followed by an -ing form."
  },
  {
    prompt: "If I ___ more time, I would practise speaking every day.",
    options: ["have", "had", "will have"],
    answer: 1,
    note: "For a present unreal condition, use if + past tense and would in the main clause."
  },
  {
    prompt: "Which collocation is correct?",
    options: ["make progress", "do progress", "create progress"],
    answer: 0,
    note: "Make progress is the standard collocation."
  },
  {
    prompt: "By the time I arrived, the meeting ___.",
    options: ["had started", "has started", "starts"],
    answer: 0,
    note: "Use the past perfect for an action completed before another past action."
  },
  {
    prompt: "Which phrase sounds most natural?",
    options: ["different from mine", "different with mine", "different as mine"],
    answer: 0,
    note: "Different from is the most widely accepted form."
  },
  {
    prompt: "I’m looking forward to ___ from you.",
    options: ["hearing", "hear", "have heard"],
    answer: 0,
    note: "The to in look forward to is a preposition, so it takes a noun or an -ing form."
  }
];

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", () => {
  registerServiceWorker();
  bindNavigation();
  bindForms();
  bindActions();
  bindProfileForm();
  switchView(initialView());
  renderAll();
  renderIcons();
  startPracticeClock();
});

function initialView() {
  const hashView = window.location.hash.replace("#", "");
  return hashView && $(`[data-view="${hashView}"]`) ? hashView : "home";
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return normalizeState({
        materials: parsed.materials || [],
        chunks: parsed.chunks || [],
        mistakes: parsed.mistakes || [],
        attempts: parsed.attempts || [],
        practiceLog: parsed.practiceLog || {},
        profile: parsed.profile || {},
        ieltsHistory: parsed.ieltsHistory || []
      });
    } catch (error) {
      console.warn("Failed to parse saved state", error);
    }
  }

  return normalizeState({
    materials: [],
    chunks: [],
    mistakes: [],
    attempts: [],
    practiceLog: {},
    profile: {},
    ieltsHistory: []
  });
}

function normalizeState(nextState) {
  const materials = (nextState.materials || []).filter((item) => !BLOCKED_PUBLIC_MATERIAL_IDS.has(item.id));
  const blockedSourceIds = new Set([...BLOCKED_PUBLIC_MATERIAL_IDS]);

  return {
    materials,
    chunks: (nextState.chunks || []).filter((chunk) => !blockedSourceIds.has(chunk.sourceMaterialId)).map((chunk) => ({ ...chunk, tag: translateLegacyLabel(chunk.tag) })),
    mistakes: (nextState.mistakes || []).filter((mistake) => !blockedSourceIds.has(mistake.sourceMaterialId)).map((mistake) => ({ ...mistake, category: translateLegacyLabel(mistake.category) })),
    attempts: nextState.attempts || [],
    practiceLog: nextState.practiceLog || {},
    profile: {
      name: "",
      age: "",
      industry: "",
      role: "",
      currentLevel: "IELTS 6.0–6.5",
      targetLevel: "IELTS 7.0",
      ...(nextState.profile || {})
    },
    ieltsHistory: nextState.ieltsHistory || []
  };
}

function translateLegacyLabel(value = "") {
  const labels = {
    "口语": "Speaking",
    "听力高频": "Listening",
    "学术": "Academic",
    "工作": "Work",
    "逻辑连接": "Linking",
    "我老用错": "Frequent error",
    "语法": "Grammar",
    "搭配": "Collocation",
    "听力": "Listening",
    "表达升级": "Expression upgrade"
  };
  return labels[value] || value;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bindNavigation() {
  $$("[data-nav], [data-goto]").forEach((element) => {
    element.addEventListener("click", () => {
      const target = element.dataset.nav || element.dataset.goto;
      if (target) switchView(target);
    });
  });
}

function switchView(view) {
  activeView = view;
  $$(".view").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.view === view));
  $$(".nav-button").forEach((button) => button.classList.toggle("is-active", button.dataset.nav === view));
  $$(".mobile-tabbar button").forEach((button) => button.classList.toggle("is-active", button.dataset.nav === view));
  window.history.replaceState(null, "", `#${view}`);
  renderAll();
}

function bindForms() {
  $("#transcriptInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    $("#transcriptText").value = await file.text();
    toast("Transcript loaded");
  });

  $("#materialForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = $("#materialTitle").value.trim();
    const source = $("#materialSource").value.trim();
    const audioFile = $("#audioInput").files?.[0] || null;
    const transcript = $("#transcriptText").value.trim();

    if (!title || !transcript) {
      toast("Add a title and transcript first");
      return;
    }

    const id = createId("mat");
    const material = {
      id,
      title,
      source,
      audioName: audioFile?.name || "",
      audioType: audioFile?.type || "",
      createdAt: new Date().toISOString(),
      transcript,
      segments: segmentTranscript(transcript)
    };

    if (audioFile) await putAudio(id, audioFile);

    state.materials.unshift(material);
    activeMaterialId = id;
    currentAnalysis = null;
    latestFeedback = null;
    saveState();
    event.target.reset();
    renderAll();
    toast("Material saved");
  });
}

function bindActions() {
  $("#chunkFilter").addEventListener("change", renderChunks);
  $("#mistakeFilter").addEventListener("change", renderMistakes);

  $("#clearCompletedButton").addEventListener("click", () => {
    state.mistakes = state.mistakes.filter((mistake) => !mistake.mastered);
    saveState();
    renderAll();
    toast("Mastered items archived");
  });

  $("#exportButton").addEventListener("click", exportData);

  $("#addMaterialButton")?.addEventListener("click", () => {
    window.requestAnimationFrame(() => {
      const importer = $("#materialImporter");
      if (importer) importer.open = true;
      $("#materialTitle")?.focus();
    });
  });

  $("#practiceSummaryToggle")?.addEventListener("click", () => {
    practiceSummaryOpen = !practiceSummaryOpen;
    renderHomeDashboard();
    renderIcons();
  });

  $("#backupInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      state = normalizeState({
        materials: imported.materials || [],
        chunks: imported.chunks || [],
        mistakes: imported.mistakes || [],
        attempts: imported.attempts || [],
        practiceLog: imported.practiceLog || {},
        profile: imported.profile || {},
        ieltsHistory: imported.ieltsHistory || []
      });
      activeMaterialId = state.materials[0]?.id || null;
      activeChunkId = state.chunks[0]?.id || null;
      currentAnalysis = null;
      latestFeedback = null;
      saveState();
      renderAll();
      toast("Backup imported");
    } catch (error) {
      toast("This backup file could not be read");
    }
    event.target.value = "";
  });
}

function renderAll() {
  renderStats();
  renderMaterials();
  renderChunks();
  renderSentenceStudio();
  renderMistakes();
  renderHomeDashboard();
  renderProfile();
  renderIcons();
}

function renderStats() {
  const materialCount = state.materials.length;
  const chunkCount = state.chunks.length;
  const mistakeCount = state.mistakes.filter((item) => !item.mastered).length;
  const attemptCount = state.attempts.length;

  setText("#materialCount", materialCount);
  setText("#chunkCount", chunkCount);
  setText("#mistakeCount", mistakeCount);
  setText("#homeMaterialCount", materialCount);
  setText("#homeChunkCount", chunkCount);
  setText("#homeMistakeCount", mistakeCount);
  setText("#homeMaterialCountCard", materialCount);
  setText("#homeChunkCountCard", chunkCount);
  setText("#homeMistakeCountCard", mistakeCount);
  setText("#homeAttemptCountCard", attemptCount);
  setText("#attemptCount", attemptCount);
  setText("#sentenceChunkCount", chunkCount);
}

function bindProfileForm() {
  const form = $("#profileForm");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    state.profile = {
      name: $("#profileName").value.trim(),
      age: $("#profileAge").value.trim(),
      industry: $("#profileIndustry").value.trim(),
      role: $("#profileRole").value.trim(),
      currentLevel: $("#profileCurrentLevel").value.trim() || "IELTS 6.0–6.5",
      targetLevel: $("#profileTargetLevel").value.trim() || "IELTS 7.0"
    };
    saveState();
    renderHomeDashboard();
    renderProfile();
    toast("Profile saved");
  });
}

function renderHomeDashboard() {
  const now = new Date();
  setText("#todayLabel", new Intl.DateTimeFormat("en-GB", { month: "long", day: "numeric", weekday: "long" }).format(now));

  const todaySeconds = Number(state.practiceLog[dateKey(now)] || 0);
  setText("#todayMinutes", Math.min(60, Math.floor(todaySeconds / 60)));

  const strip = $("#weekStrip");
  if (!strip) return;
  const monday = startOfWeek(now);
  const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  strip.innerHTML = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    const seconds = Number(state.practiceLog[dateKey(day)] || 0);
    const progress = Math.min(100, Math.round((seconds / 3600) * 100));
    const minutes = Math.floor(seconds / 60);
    const isToday = dateKey(day) === dateKey(now);
    return `
      <article class="day-progress ${isToday ? "is-today" : ""}" aria-label="${formatFullDate(day)}, ${minutes} practice minutes">
        <span class="day-name">${weekdayNames[index]}</span>
        <span class="progress-ring" style="--progress:${progress}">
          <span>${day.getDate()}</span>
        </span>
        <small>${minutes ? `${minutes}m` : "–"}</small>
      </article>
    `;
  }).join("");

  const toggle = $("#practiceSummaryToggle");
  const insights = $("#practiceInsights");
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(practiceSummaryOpen));
    toggle.classList.toggle("is-open", practiceSummaryOpen);
    const label = $("span", toggle);
    if (label) label.textContent = practiceSummaryOpen ? "Less" : "More";
  }
  if (insights) {
    insights.hidden = !practiceSummaryOpen;
    if (practiceSummaryOpen) renderPracticeInsights(insights);
  }

  renderFrequentMaterials();
}

function renderFrequentMaterials() {
  const container = $("#frequentMaterialsPreview");
  if (!container) return;

  const attemptCountByMaterial = new Map();
  state.attempts.forEach((attempt) => {
    const chunk = state.chunks.find((item) => item.id === attempt.chunkId);
    const materialId = chunk?.sourceMaterialId;
    if (materialId) attemptCountByMaterial.set(materialId, (attemptCountByMaterial.get(materialId) || 0) + 1);
  });

  const materials = [...state.materials]
    .sort((a, b) => {
      const usageDifference = (attemptCountByMaterial.get(b.id) || 0) - (attemptCountByMaterial.get(a.id) || 0);
      return usageDifference || new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    })
    .slice(0, 3);

  container.innerHTML = Array.from({ length: 3 }, (_, index) => {
    const material = materials[index];
    if (!material) {
      return `<span class="material-preview placeholder-${index + 1}" aria-hidden="true"><span class="preview-number">0${index + 1}</span></span>`;
    }
    const poster = material.posterPath
      ? `<img src="${escapeAttribute(material.posterPath)}" alt="">`
      : `<span class="preview-letter">${escapeHtml((material.title || "M").slice(0, 1).toUpperCase())}</span>`;
    const mediaType = material.videoPath || material.videoName ? "Video" : material.audioName ? "Audio" : "Text";
    return `
      <span class="material-preview material-tone-${index + 1}">
        ${poster}
        <span class="preview-caption"><small>${mediaType}</small><strong>${escapeHtml(material.title)}</strong></span>
      </span>
    `;
  }).join("");
}

function renderPracticeInsights(container) {
  const cursor = new Date(practiceSummaryCursor);
  const title = practiceSummaryMode === "week"
    ? formatWeekRange(cursor)
    : practiceSummaryMode === "year"
      ? `${cursor.getFullYear()}`
      : new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(cursor);

  container.innerHTML = `
    <div class="summary-toolbar">
      <div class="summary-tabs" role="tablist" aria-label="Practice summary range">
        ${[
          ["week", "Week"],
          ["month", "Month"],
          ["year", "Year"]
        ].map(([value, label]) => `
          <button type="button" role="tab" data-summary-mode="${value}" aria-selected="${practiceSummaryMode === value}">${label}</button>
        `).join("")}
      </div>
      <div class="period-switcher">
        <button type="button" data-summary-shift="-1" aria-label="Previous period" title="Previous period"><i data-lucide="chevron-left"></i></button>
        <strong>${title}</strong>
        <button type="button" data-summary-shift="1" aria-label="Next period" title="Next period"><i data-lucide="chevron-right"></i></button>
      </div>
    </div>
    <div class="summary-visual">
      ${practiceSummaryMode === "week" ? renderWeekSummary(cursor) : practiceSummaryMode === "year" ? renderYearSummary(cursor) : renderMonthCalendar(cursor)}
    </div>
    ${renderPeriodStats(cursor, practiceSummaryMode)}
  `;

  $$('[data-summary-mode]', container).forEach((button) => {
    button.addEventListener("click", () => {
      practiceSummaryMode = button.dataset.summaryMode;
      renderPracticeInsights(container);
      renderIcons();
    });
  });

  $$('[data-summary-shift]', container).forEach((button) => {
    button.addEventListener("click", () => {
      const direction = Number(button.dataset.summaryShift);
      if (practiceSummaryMode === "week") practiceSummaryCursor.setDate(practiceSummaryCursor.getDate() + direction * 7);
      if (practiceSummaryMode === "month") practiceSummaryCursor.setMonth(practiceSummaryCursor.getMonth() + direction);
      if (practiceSummaryMode === "year") practiceSummaryCursor.setFullYear(practiceSummaryCursor.getFullYear() + direction);
      renderPracticeInsights(container);
      renderIcons();
    });
  });

  $$('[data-open-month]', container).forEach((button) => {
    button.addEventListener("click", () => {
      practiceSummaryCursor = new Date(practiceSummaryCursor.getFullYear(), Number(button.dataset.openMonth), 1);
      practiceSummaryMode = "month";
      renderPracticeInsights(container);
      renderIcons();
    });
  });
}

function renderWeekSummary(cursor) {
  const monday = startOfWeek(cursor);
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return `
    <div class="week-detail-grid">
      ${Array.from({ length: 7 }, (_, index) => {
        const day = new Date(monday);
        day.setDate(monday.getDate() + index);
        const seconds = Number(state.practiceLog[dateKey(day)] || 0);
        const progress = Math.min(100, Math.round(seconds / 36));
        return `
          <article class="week-detail-day">
            <span>${labels[index]}</span>
            <strong>${day.getMonth() + 1}/${day.getDate()}</strong>
            <div class="summary-progress"><i style="width:${progress}%"></i></div>
            <small>${Math.floor(seconds / 60)} min</small>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderMonthCalendar(cursor) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = (firstDay.getDay() + 6) % 7;
  const cells = [
    ...Array.from({ length: leading }, () => `<span class="calendar-day is-empty"></span>`),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = new Date(year, month, index + 1);
      const seconds = Number(state.practiceLog[dateKey(day)] || 0);
      const progress = Math.min(100, Math.round(seconds / 36));
      const isToday = dateKey(day) === dateKey(new Date());
      return `
        <article class="calendar-day ${isToday ? "is-today" : ""}" aria-label="${formatFullDate(day)}, ${Math.floor(seconds / 60)} practice minutes">
          <span class="mini-ring" style="--progress:${progress}"><b>${index + 1}</b></span>
          <small>${seconds ? `${Math.floor(seconds / 60)}m` : ""}</small>
        </article>
      `;
    })
  ];
  return `
    <div class="calendar-weekdays">${["M", "T", "W", "T", "F", "S", "S"].map((day) => `<span>${day}</span>`).join("")}</div>
    <div class="month-calendar">${cells.join("")}</div>
  `;
}

function renderYearSummary(cursor) {
  const year = cursor.getFullYear();
  return `
    <div class="year-grid">
      ${Array.from({ length: 12 }, (_, month) => {
        const stats = getRangeStats(new Date(year, month, 1), new Date(year, month + 1, 0));
        const progress = Math.min(100, Math.round((stats.totalSeconds / (stats.daysInRange * 3600)) * 100));
        return `
          <button class="year-month" type="button" data-open-month="${month}">
            <span>${new Intl.DateTimeFormat("en-GB", { month: "short" }).format(new Date(year, month, 1))}</span>
            <strong>${formatDuration(stats.totalSeconds)}</strong>
            <div class="summary-progress"><i style="width:${progress}%"></i></div>
            <small>${stats.activeDays} active days</small>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderPeriodStats(cursor, mode) {
  let start;
  let end;
  let label;
  if (mode === "week") {
    start = startOfWeek(cursor);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
    label = "Weekly Summary";
  } else if (mode === "year") {
    start = new Date(cursor.getFullYear(), 0, 1);
    end = new Date(cursor.getFullYear(), 11, 31);
    label = "Yearly Summary";
  } else {
    start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    label = "Monthly Summary";
  }
  const stats = getRangeStats(start, end);
  return `
    <section class="period-summary" aria-label="${label}">
      <div class="period-summary-head">
        <div><p class="section-label">Practice report</p><h3>${label}</h3></div>
        <span>60-minute daily goal</span>
      </div>
      <div class="summary-metrics">
        <article><strong>${formatDuration(stats.totalSeconds)}</strong><span>Total practice</span></article>
        <article><strong>${stats.activeDays}</strong><span>Active days</span></article>
        <article><strong>${stats.completedDays}</strong><span>Goals completed</span></article>
        <article><strong>${stats.longestStreak}</strong><span>Longest streak</span></article>
      </div>
    </section>
  `;
}

function getRangeStats(start, end) {
  let totalSeconds = 0;
  let activeDays = 0;
  let completedDays = 0;
  let longestStreak = 0;
  let currentStreak = 0;
  let daysInRange = 0;
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (day <= last) {
    const seconds = Number(state.practiceLog[dateKey(day)] || 0);
    daysInRange += 1;
    totalSeconds += seconds;
    if (seconds > 0) {
      activeDays += 1;
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
    if (seconds >= 3600) completedDays += 1;
    day.setDate(day.getDate() + 1);
  }
  return { totalSeconds, activeDays, completedDays, longestStreak, daysInRange };
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours} hr`;
}

function formatWeekRange(date) {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startLabel = new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric" }).format(start);
  const endLabel = new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric" }).format(end);
  return `${startLabel} – ${endLabel}`;
}

function renderProfile() {
  if (!$("#profileForm")) return;
  $("#profileName").value = state.profile.name || "";
  $("#profileAge").value = state.profile.age || "";
  $("#profileIndustry").value = state.profile.industry || "";
  $("#profileRole").value = state.profile.role || "";
  $("#profileCurrentLevel").value = state.profile.currentLevel || "IELTS 6.0–6.5";
  $("#profileTargetLevel").value = state.profile.targetLevel || "IELTS 7.0";
  setText("#profileLevelBadge", state.profile.currentLevel || "IELTS 6.0–6.5");
  setText("#ieltsTestCount", state.ieltsHistory.length);
  renderIeltsQuiz();
}

function renderIeltsQuiz() {
  const container = $("#ieltsQuiz");
  if (!container) return;
  const start = (ieltsRound * 3) % IELTS_QUESTION_BANK.length;
  const questions = Array.from({ length: 3 }, (_, index) => IELTS_QUESTION_BANK[(start + index) % IELTS_QUESTION_BANK.length]);
  container.innerHTML = `
    <form id="ieltsQuizForm" class="quiz-form">
      ${questions.map((question, index) => `
        <fieldset class="quiz-question">
          <legend><span>${index + 1}</span>${escapeHtml(question.prompt)}</legend>
          ${question.options.map((option, optionIndex) => `
            <label class="quiz-option">
              <input type="radio" name="question-${index}" value="${optionIndex}">
              <span>${escapeHtml(option)}</span>
            </label>
          `).join("")}
        </fieldset>
      `).join("")}
      <div class="button-row">
        <button class="primary-button" type="submit"><i data-lucide="check-circle-2"></i><span>View Results</span></button>
        <button class="secondary-button" type="button" id="nextIeltsTest"><i data-lucide="shuffle"></i><span>New Questions</span></button>
      </div>
      <div id="ieltsResult" class="ielts-result" aria-live="polite"></div>
    </form>
  `;

  $("#ieltsQuizForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const answerNodes = questions.map((_, index) => event.target.querySelector(`input[name="question-${index}"]:checked`));
    if (answerNodes.some((node) => !node)) {
      toast("Answer all three questions first");
      return;
    }
    const answers = answerNodes.map((node) => Number(node.value));
    const score = answers.reduce((total, answer, index) => total + (answer === questions[index].answer ? 1 : 0), 0);
    const estimate = score === 3 ? "7.0+" : score === 2 ? "6.0–6.5" : score === 1 ? "5.5–6.0" : "Foundation review";
    state.ieltsHistory.unshift({ id: createId("test"), score, estimate, createdAt: new Date().toISOString() });
    saveState();
    setText("#ieltsTestCount", state.ieltsHistory.length);
    $("#ieltsResult").innerHTML = `
      <strong>${score} / 3 · Indicative level ${estimate}</strong>
      <p>${questions.map((question, index) => `${index + 1}. ${answers[index] === question.answer ? "Correct" : question.note}`).join("<br>")}</p>
      <small>This mini test tracks trends; it is not an official IELTS score.</small>
    `;
  });

  $("#nextIeltsTest").addEventListener("click", () => {
    ieltsRound += 1;
    renderIeltsQuiz();
    renderIcons();
  });
}

function startPracticeClock() {
  if (practiceClock) window.clearInterval(practiceClock);
  lastPracticeTick = Date.now();
  practiceClock = window.setInterval(() => {
    const now = Date.now();
    const elapsed = Math.min(30, Math.max(0, Math.round((now - lastPracticeTick) / 1000)));
    lastPracticeTick = now;
    if (document.hidden || activeView === "profile") return;
    const key = dateKey(new Date());
    state.practiceLog[key] = Number(state.practiceLog[key] || 0) + elapsed;
    saveState();
    renderHomeDashboard();
  }, 30000);

  document.addEventListener("visibilitychange", () => {
    lastPracticeTick = Date.now();
  });
}

function startOfWeek(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatFullDate(date) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", day: "numeric", weekday: "long" }).format(date);
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function renderIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function renderMaterials() {
  const list = $("#materialsList");
  if (!state.materials.length) {
    list.innerHTML = `<div class="detail-empty compact-empty">No materials yet</div>`;
    $("#materialDetail").innerHTML = `<div class="detail-empty">Import a material to begin</div>`;
    return;
  }

  if (!activeMaterialId || !state.materials.some((item) => item.id === activeMaterialId)) {
    activeMaterialId = state.materials[0].id;
  }

  list.innerHTML = state.materials
    .map((material) => {
      const mediaLabel = material.videoPath || material.videoName ? "Video" : material.audioName ? "Audio" : "Text";
      const mediaTone = material.videoPath || material.audioName ? "green" : "amber";
      return `
        <article class="material-item ${material.id === activeMaterialId ? "is-active" : ""}">
          <div class="item-topline">
            <h3>${escapeHtml(material.title)}</h3>
            <span class="pill ${mediaTone}">${mediaLabel}</span>
          </div>
          <p class="small-note">${material.segments?.length || 0} lines · ${formatDate(material.createdAt)}</p>
          <div class="card-actions">
            <button class="secondary-button" type="button" data-select-material="${material.id}">
              <i data-lucide="play"></i>
              <span>Open</span>
            </button>
            <button class="ghost-button" type="button" data-delete-material="${material.id}">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");

  $$("[data-select-material]", list).forEach((button) => {
    button.addEventListener("click", () => {
      activeMaterialId = button.dataset.selectMaterial;
      currentAnalysis = null;
      latestFeedback = null;
      renderAll();
    });
  });

  $$("[data-delete-material]", list).forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.deleteMaterial;
      state.materials = state.materials.filter((item) => item.id !== id);
      state.chunks = state.chunks.map((chunk) =>
        chunk.sourceMaterialId === id ? { ...chunk, sourceMaterialId: "", sourceTitle: "Deleted material" } : chunk
      );
      await deleteAudio(id);
      activeMaterialId = state.materials[0]?.id || null;
      saveState();
      renderAll();
      toast("Material deleted");
    });
  });

  renderMaterialDetail();
}

async function renderMaterialDetail() {
  const container = $("#materialDetail");
  const material = state.materials.find((item) => item.id === activeMaterialId);
  if (!material) return;

  const sourceLink = material.source
    ? `<a class="ghost-button" href="${escapeAttribute(material.source)}" target="_blank" rel="noreferrer">Source</a>`
    : "";
  const videoBlock = material.videoPath
    ? `
      <video
        id="activeVideo"
        class="video-player"
        controls
        playsinline
        preload="metadata"
        poster="${escapeAttribute(material.posterPath || "")}"
        src="${escapeAttribute(material.videoPath)}"
      ></video>
    `
    : "";
  const transcriptRows = material.segments?.length
    ? material.segments
        .map(
          (segment, index) => `
            <article class="sentence-row" data-sentence="${escapeAttribute(segment.text)}">
              <span class="sentence-index">${index + 1}</span>
              <p class="sentence-text">${escapeHtml(segment.text)}</p>
              <button class="mini-button" type="button" data-play-segment="${index}" aria-label="Play this line">
                <i data-lucide="play"></i>
              </button>
            </article>
          `
        )
        .join("")
    : `<div class="detail-empty compact-empty">Transcript is loading</div>`;

  const activeChunk = state.chunks.find((chunk) => chunk.id === activeChunkId);
  const practiceChunk = activeChunk || currentAnalysis;

  container.className = "detail-content";
  container.innerHTML = `
    <div class="workbench-head">
      <div>
        <p class="section-label">Material</p>
        <h2>${escapeHtml(material.title)}</h2>
      </div>
      ${sourceLink}
    </div>

    ${videoBlock}
    <audio id="activeAudio" class="audio-player" controls></audio>

    <div class="guided-flow">
      <div class="step-card">
        <div class="step-heading">
          <span class="step-number">1</span>
          <div>
            <h3>Capture a Phrase</h3>
            <p>When you hear a useful expression, say it aloud.</p>
          </div>
        </div>
        <label>
          <span>English phrase</span>
          <div class="voice-field">
            <input id="capturePhrase" type="text" placeholder="e.g. falling more in love" value="${escapeAttribute(currentAnalysis?.phrase || "")}">
            <button class="icon-button voice-button" type="button" data-voice-target="capturePhrase" data-voice-lang="en-US" aria-label="Dictate an English phrase" title="Dictate an English phrase">
              <i data-lucide="mic"></i>
            </button>
          </div>
        </label>
        <label>
          <span>My understanding</span>
          <div class="voice-field">
            <textarea id="captureMeaning" rows="3" placeholder="Explain what the phrase means to you">${escapeHtml(currentAnalysis?.meaning || "")}</textarea>
            <button class="icon-button voice-button" type="button" data-voice-target="captureMeaning" data-voice-lang="zh-CN" aria-label="Dictate your understanding" title="Dictate your understanding">
              <i data-lucide="mic"></i>
            </button>
          </div>
        </label>
        <input id="captureSourceSentence" type="hidden" value="${escapeAttribute(currentAnalysis?.sentence || "")}">
        <button class="primary-button" type="button" id="analyzeChunkButton">
          <i data-lucide="sparkles"></i>
          <span>Analyse This Phrase</span>
        </button>
      </div>

      <div class="step-card" id="analysisCard">
        ${renderAnalysisCard(material)}
      </div>

      <div class="step-card practice-card">
        ${renderPracticeCard(practiceChunk)}
      </div>
    </div>

    <div class="transcript-block">
      <div class="panel-title">
        <div>
          <p class="section-label">Transcript</p>
          <h2>Line-by-line Transcript</h2>
        </div>
      </div>
      <div class="transcript-panel" id="transcriptPanel">${transcriptRows}</div>
    </div>
  `;

  const audio = $("#activeAudio");
  const audioBlob = material.audioPath ? null : await getAudio(material.id);
  if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
  if (material.audioPath) {
    audio.src = material.audioPath;
  } else if (audioBlob) {
    activeAudioUrl = URL.createObjectURL(audioBlob);
    audio.src = activeAudioUrl;
  } else {
    audio.removeAttribute("src");
    audio.insertAdjacentHTML("afterend", `<p class="small-note">No audio is saved for this material. You can still practise with the transcript.</p>`);
  }

  bindMaterialDetailEvents(material);
  renderIcons();
}

function bindMaterialDetailEvents(material) {
  $$("[data-voice-target]", $("#materialDetail")).forEach((button) => {
    button.addEventListener("click", () => startVoiceInput(button.dataset.voiceTarget, button.dataset.voiceLang, button));
  });

  $("#analyzeChunkButton").addEventListener("click", () => {
    const phrase = $("#capturePhrase").value.trim();
    const meaning = $("#captureMeaning").value.trim();
    const sentence = $("#captureSourceSentence").value.trim();

    if (!phrase || !meaning) {
      toast("Add the phrase and your understanding first");
      return;
    }

    currentAnalysis = {
      id: createId("draft"),
      phrase,
      meaning,
      sentence,
      materialId: material.id,
      sourceMaterialId: material.id,
      sourceTitle: material.title,
      tag: "Listening",
      analysis: buildChunkAnalysis(phrase, meaning, sentence)
    };
    activeChunkId = "";
    latestFeedback = null;
    renderMaterialDetail();
  });

  const saveButton = $("#saveChunkButton");
  if (saveButton) {
    saveButton.addEventListener("click", saveCurrentChunk);
  }

  const checkButton = $("#checkSentenceButton");
  if (checkButton) {
    checkButton.addEventListener("click", checkPracticeSentence);
  }

  const saveMistakeButton = $("#saveMistakeButton");
  if (saveMistakeButton) {
    saveMistakeButton.addEventListener("click", saveLatestMistake);
  }

  $$(".sentence-row", $("#transcriptPanel")).forEach((row) => {
    row.addEventListener("click", () => {
      $("#captureSourceSentence").value = row.dataset.sentence || "";
      toast("Source line selected");
    });
  });

  $$("[data-play-segment]", $("#transcriptPanel")).forEach((button) => {
    button.addEventListener("click", () => {
      const material = state.materials.find((item) => item.id === activeMaterialId);
      const segment = material?.segments?.[Number(button.dataset.playSegment)];
      playSegment($("#activeAudio"), segment);
    });
  });
}

function renderAnalysisCard(material) {
  if (!currentAnalysis || currentAnalysis.materialId !== material.id) {
    return `
      <div class="step-heading">
        <span class="step-number">2</span>
        <div>
          <h3>Understand the Phrase</h3>
          <p>Review its meaning, range of use and how accurate your interpretation is.</p>
        </div>
      </div>
      <div class="detail-empty compact-empty">Waiting for analysis</div>
    `;
  }

  const analysis = currentAnalysis.analysis;
  return `
    <div class="step-heading">
      <span class="step-number">2</span>
      <div>
        <h3>${escapeHtml(currentAnalysis.phrase)}</h3>
        <p>${escapeHtml(analysis.verdict)}</p>
      </div>
    </div>
    <div class="analysis-grid">
      <article>
        <span>Full meaning</span>
        <p>${escapeHtml(analysis.definition)}</p>
      </article>
      <article>
        <span>Range of use</span>
        <p>${escapeHtml(analysis.range)}</p>
      </article>
      <article>
        <span>Common collocations</span>
        <p>${escapeHtml(analysis.collocations)}</p>
      </article>
      <article>
        <span>Common pitfall</span>
        <p>${escapeHtml(analysis.warning)}</p>
      </article>
    </div>
    <div class="example-stack">
      ${analysis.examples.map((example) => `<p>${escapeHtml(example)}</p>`).join("")}
    </div>
    <button class="primary-button" type="button" id="saveChunkButton">
      <i data-lucide="bookmark-plus"></i>
      <span>Save to Phrase Bank</span>
    </button>
  `;
}

function renderPracticeCard(chunk) {
  if (!chunk) {
    return `
      <div class="step-heading">
        <span class="step-number">3</span>
        <div>
          <h3>Use It in a Sentence</h3>
          <p>Save the phrase, then say an English sentence of your own.</p>
        </div>
      </div>
      <div class="detail-empty compact-empty">Waiting for a phrase</div>
    `;
  }

  return `
    <div class="step-heading">
      <span class="step-number">3</span>
      <div>
        <h3>Use It in a Sentence</h3>
        <p>Target phrase: ${escapeHtml(chunk.phrase)}</p>
      </div>
    </div>
    <label>
      <span>My English sentence</span>
      <div class="voice-field">
        <textarea id="practiceSentence" rows="4" placeholder="Say an English sentence about your own life"></textarea>
        <button class="icon-button voice-button" type="button" data-voice-target="practiceSentence" data-voice-lang="en-US" aria-label="Dictate an English sentence" title="Dictate an English sentence">
          <i data-lucide="mic"></i>
        </button>
      </div>
    </label>
    <div class="button-row">
      <button class="primary-button" type="button" id="checkSentenceButton">
        <i data-lucide="check-circle-2"></i>
        <span>Check Grammar and Naturalness</span>
      </button>
      <button class="secondary-button" type="button" id="saveMistakeButton">
        <i data-lucide="bookmark-plus"></i>
        <span>Add to Error Review</span>
      </button>
    </div>
    <div id="practiceFeedback" class="feedback-area compact-feedback">
      ${latestFeedback ? feedbackMarkup(latestFeedback) : ""}
    </div>
  `;
}

function renderSentenceStudio() {
  const container = $("#sentenceStudio");
  if (!container) return;

  if (!state.chunks.length) {
    container.innerHTML = `
      <section class="sentence-empty">
        <span class="card-icon"><i data-lucide="library"></i></span>
        <h2>Save a phrase from a material first</h2>
        <p>Sentence practice uses expressions captured from your materials.</p>
        <button class="primary-button" type="button" data-nav="materials">
          <i data-lucide="headphones"></i>
          <span>Open Materials</span>
        </button>
      </section>
    `;
    $$("[data-nav]", container).forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.nav));
    });
    return;
  }

  if (!activeChunkId || !state.chunks.some((chunk) => chunk.id === activeChunkId)) {
    activeChunkId = state.chunks[0].id;
  }

  const activeChunk = state.chunks.find((chunk) => chunk.id === activeChunkId);
  container.innerHTML = `
    <aside class="sentence-picker">
      <div class="panel-title">
        <div>
          <p class="section-label">Choose</p>
          <h2>Choose a Phrase</h2>
        </div>
      </div>
      <div class="sentence-chip-list">
        ${state.chunks
          .map(
            (chunk) => `
              <button class="sentence-chip ${chunk.id === activeChunkId ? "is-active" : ""}" type="button" data-pick-sentence-chunk="${chunk.id}">
                <span>${escapeHtml(chunk.phrase)}</span>
                <small>${escapeHtml(chunk.meaning || chunk.tag || "Practice expression")}</small>
              </button>
            `
          )
          .join("")}
      </div>
    </aside>
    <section class="sentence-practice-panel">
      ${renderPracticeCard(activeChunk)}
    </section>
  `;

  $$("[data-pick-sentence-chunk]", container).forEach((button) => {
    button.addEventListener("click", () => {
      activeChunkId = button.dataset.pickSentenceChunk;
      latestFeedback = null;
      renderSentenceStudio();
      renderIcons();
    });
  });

  $$("[data-voice-target]", container).forEach((button) => {
    button.addEventListener("click", () => startVoiceInput(button.dataset.voiceTarget, button.dataset.voiceLang, button));
  });

  const checkButton = $("#checkSentenceButton", container);
  if (checkButton) checkButton.addEventListener("click", checkPracticeSentence);

  const saveMistakeButton = $("#saveMistakeButton", container);
  if (saveMistakeButton) saveMistakeButton.addEventListener("click", saveLatestMistake);
}

function saveCurrentChunk() {
  if (!currentAnalysis) return;

  const exists = state.chunks.some(
    (chunk) => chunk.phrase.toLowerCase() === currentAnalysis.phrase.toLowerCase() && chunk.sourceMaterialId === currentAnalysis.materialId
  );

  if (exists) {
    toast("This phrase is already saved");
    return;
  }

  const chunk = {
    id: createId("chk"),
    phrase: currentAnalysis.phrase,
    meaning: currentAnalysis.meaning,
    sourceMaterialId: currentAnalysis.materialId,
    sourceTitle: currentAnalysis.sourceTitle,
    sentence: currentAnalysis.sentence,
    tag: currentAnalysis.tag,
    status: "learning",
    analysis: currentAnalysis.analysis,
    createdAt: new Date().toISOString()
  };

  state.chunks.unshift(chunk);
  activeChunkId = chunk.id;
  saveState();
  renderAll();
  toast("Phrase saved. It is ready for sentence practice");
}

function checkPracticeSentence() {
  const scope = activeView === "sentences" ? $("#sentenceStudio") : $("#materialDetail");
  const sentence = $("#practiceSentence", scope || document)?.value.trim();
  const chunk = getActivePracticeChunk();

  if (!chunk) {
    toast("Save or analyse a phrase first");
    return;
  }
  if (!sentence) {
    toast("Say or type an English sentence first");
    return;
  }

  latestFeedback = analyseSentence(sentence, chunk);
  state.attempts.unshift({
    id: createId("att"),
    chunkId: chunk.id || "",
    sentence,
    corrected: latestFeedback.corrected,
    createdAt: new Date().toISOString()
  });
  saveState();
  $("#practiceFeedback", scope || document).innerHTML = feedbackMarkup(latestFeedback);
  renderIcons();
}

function getActivePracticeChunk() {
  return state.chunks.find((chunk) => chunk.id === activeChunkId) || currentAnalysis;
}

function feedbackMarkup(feedback) {
  return `
    <article class="feedback-card">
      <h3><i data-lucide="sparkles"></i> More Natural Version</h3>
      <div class="corrected-box">${escapeHtml(feedback.corrected)}</div>
    </article>
    <article class="feedback-card">
      <h3><i data-lucide="scan-search"></i> Check Results</h3>
      ${feedback.notes.map((note) => `<p class="small-note">${escapeHtml(note)}</p>`).join("")}
    </article>
    <article class="feedback-card">
      <h3><i data-lucide="target"></i> Practice Focus</h3>
      <p class="small-note">${escapeHtml(feedback.focus)}</p>
    </article>
  `;
}

function saveLatestMistake() {
  if (!latestFeedback) {
    checkPracticeSentence();
    if (!latestFeedback) return;
  }

  const chunk = getActivePracticeChunk();
  state.mistakes.unshift({
    id: createId("err"),
    category: latestFeedback.category,
    original: latestFeedback.original,
    corrected: latestFeedback.corrected,
    note: latestFeedback.notes.join(" "),
    sourceChunkId: chunk?.id || "",
    sourceMaterialId: chunk?.sourceMaterialId || chunk?.materialId || "",
    mastered: false,
    createdAt: new Date().toISOString()
  });
  saveState();
  renderStats();
  renderMistakes();
  toast("Added to Error Review");
}

function renderChunks() {
  const filter = $("#chunkFilter")?.value || "all";
  const chunks = filter === "all" ? state.chunks : state.chunks.filter((chunk) => chunk.tag === filter);
  const list = $("#chunksList");

  if (!chunks.length) {
    list.innerHTML = `<div class="detail-empty">No phrases yet</div>`;
    return;
  }

  list.innerHTML = chunks
    .map(
      (chunk) => `
        <article class="chunk-item">
          <div class="item-topline">
            <p class="chunk-phrase">${escapeHtml(chunk.phrase)}</p>
            <span class="tag">${escapeHtml(chunk.tag || "Uncategorised")}</span>
          </div>
          <p class="muted-text">${escapeHtml(chunk.meaning || "No meaning added")}</p>
          ${chunk.analysis?.definition ? `<p class="chunk-sentence">${escapeHtml(chunk.analysis.definition)}</p>` : ""}
          ${chunk.sentence ? `<p class="small-note">Source: ${escapeHtml(chunk.sentence)}</p>` : ""}
          <div class="card-actions">
            <button class="secondary-button" type="button" data-practice-chunk="${chunk.id}">
              <i data-lucide="pen-line"></i>
              <span>Practise with Material</span>
            </button>
            <button class="ghost-button" type="button" data-delete-chunk="${chunk.id}">Delete</button>
          </div>
        </article>
      `
    )
    .join("");

  $$("[data-practice-chunk]", list).forEach((button) => {
    button.addEventListener("click", () => {
      const chunk = state.chunks.find((item) => item.id === button.dataset.practiceChunk);
      if (!chunk) return;
      activeChunkId = chunk.id;
      activeMaterialId = chunk.sourceMaterialId || state.materials[0]?.id || activeMaterialId;
      latestFeedback = null;
      switchView("materials");
    });
  });

  $$("[data-delete-chunk]", list).forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.deleteChunk;
      state.chunks = state.chunks.filter((chunk) => chunk.id !== id);
      activeChunkId = state.chunks[0]?.id || "";
      saveState();
      renderAll();
      toast("Phrase deleted");
    });
  });
}

function renderMistakes() {
  const filter = $("#mistakeFilter")?.value || "all";
  const mistakes = filter === "all" ? state.mistakes : state.mistakes.filter((mistake) => mistake.category === filter);
  const list = $("#mistakesList");

  if (!mistakes.length) {
    list.innerHTML = `<div class="detail-empty">No saved errors</div>`;
    return;
  }

  list.innerHTML = mistakes
    .map(
      (mistake) => `
        <article class="mistake-item ${mistake.mastered ? "is-mastered" : ""}">
          <div class="item-topline">
            <span class="pill ${mistake.category === "Grammar" ? "" : "amber"}">${escapeHtml(mistake.category)}</span>
            <span class="small-note">${formatDate(mistake.createdAt)}</span>
          </div>
          <p class="mistake-original">Original: ${escapeHtml(mistake.original)}</p>
          <p class="mistake-fixed">Corrected: ${escapeHtml(mistake.corrected)}</p>
          <p class="small-note">${escapeHtml(mistake.note || "")}</p>
          <div class="card-actions">
            <button class="secondary-button" type="button" data-toggle-mastered="${mistake.id}">
              <i data-lucide="${mistake.mastered ? "undo-2" : "check"}"></i>
              <span>${mistake.mastered ? "Restore" : "Mastered"}</span>
            </button>
            <button class="ghost-button" type="button" data-delete-mistake="${mistake.id}">Delete</button>
          </div>
        </article>
      `
    )
    .join("");

  $$("[data-toggle-mastered]", list).forEach((button) => {
    button.addEventListener("click", () => {
      const mistake = state.mistakes.find((item) => item.id === button.dataset.toggleMastered);
      if (mistake) mistake.mastered = !mistake.mastered;
      saveState();
      renderAll();
    });
  });

  $$("[data-delete-mistake]", list).forEach((button) => {
    button.addEventListener("click", () => {
      state.mistakes = state.mistakes.filter((item) => item.id !== button.dataset.deleteMistake);
      saveState();
      renderAll();
      toast("Error deleted");
    });
  });
}

function startVoiceInput(targetId, lang, button) {
  const target = document.getElementById(targetId);
  if (!target) return;

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    target.focus();
    toast("Voice recognition is unavailable here. Try keyboard dictation");
    return;
  }

  if (recognition) recognition.abort();
  recognition = new Recognition();
  recognition.lang = lang || "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;

  activeVoiceButton?.classList.remove("is-listening");
  activeVoiceButton = button;
  button.classList.add("is-listening");
  toast("Listening...");

  recognition.onresult = (event) => {
    const text = Array.from(event.results)
      .map((result) => result[0]?.transcript || "")
      .join(" ")
      .trim();
    if (!text) return;
    const separator = target.value.trim() ? " " : "";
    target.value = `${target.value.trim()}${separator}${text}`.trim();
    target.dispatchEvent(new Event("input", { bubbles: true }));
  };

  recognition.onerror = () => {
    target.focus();
    toast("Voice recognition did not complete. Try keyboard dictation");
  };

  recognition.onend = () => {
    button.classList.remove("is-listening");
    activeVoiceButton = null;
  };

  recognition.start();
}

function buildChunkAnalysis(phrase, meaning, sourceSentence = "") {
  const known = getKnownChunk(phrase);
  const verdict = reviewMeaning(meaning, known);

  if (known) {
    return {
      verdict,
      definition: known.definition,
      range: known.range,
      collocations: known.collocations,
      warning: known.warning,
      examples: [sourceSentence, ...known.examples].filter(Boolean).slice(0, 3)
    };
  }

  return {
    verdict,
    definition: `Learn “${phrase}” as one complete expression. Notice the actions, objects and tone it connects in the source sentence.`,
    range: "This version provides an initial reading from the source sentence. A future AI connection can assess register, implied tone and natural alternatives.",
    collocations: "Remember the surrounding verbs, prepositions and objects together instead of learning isolated words.",
    warning: "Avoid translating word by word and rebuilding the phrase. Keep its original collocation pattern.",
    examples: [
      sourceSentence,
      `I want to use "${phrase}" in a sentence that feels natural to me.`,
      `This expression is useful when I talk about a real situation.`
    ].filter(Boolean)
  };
}

function getKnownChunk(phrase) {
  const lower = phrase.toLowerCase();
  if (lower.includes("falling more in love") || lower.includes("fall more in love")) {
    return {
      keywords: ["love", "deeper", "increasingly", "feelings"],
      definition: "Describes affection or emotional attachment becoming stronger, especially in romantic or intimate contexts.",
      range: "Common in conversation, storytelling and emotional language. It usually refers to people, but can be used playfully for interests or objects.",
      collocations: "feel yourself falling more in love, find yourself falling more in love, keep falling more in love",
      warning: "Do not say become more love. The object normally follows with, as in fall in love with someone.",
      examples: [
        "I found myself falling more in love with her every day.",
        "The more we talked, the more I felt myself falling for him."
      ]
    };
  }
  if (lower.includes("have a hard time")) {
    return {
      keywords: ["difficult", "struggle", "hard"],
      definition: "Says that an activity is difficult for someone. It is normally followed by an -ing form.",
      range: "Natural in both speech and writing, and often lighter and more idiomatic than very difficult for me.",
      collocations: "have a hard time doing, have a hard time with something",
      warning: "Do not say I am difficult to do something. Say I have a hard time doing something.",
      examples: [
        "I have a hard time understanding fast native speakers.",
        "She had a hard time adjusting to the new schedule."
      ]
    };
  }
  if (lower.includes("rabbit hole")) {
    return {
      keywords: ["deep", "absorbed", "cannot stop"],
      definition: "Describes becoming deeply absorbed in a topic, search or train of thought that keeps expanding.",
      range: "Common in conversation, online contexts and storytelling about research, videos, stories or interests.",
      collocations: "fall into a rabbit hole, go down a rabbit hole, a rabbit hole of stories",
      warning: "It is figurative rather than a literal rabbit hole; the key idea is going increasingly deep into something.",
      examples: [
        "I went down a rabbit hole of old interviews.",
        "We fell into a rabbit hole of childhood stories."
      ]
    };
  }
  if (lower.includes("turn off the lights")) {
    return {
      keywords: ["switch off", "lights"],
      definition: "A natural everyday expression meaning to switch the lights off.",
      range: "Most common in daily conversation and also useful in narrative description.",
      collocations: "turn off the lights, turn the lights off, before we turned off the lights",
      warning: "Lights is often plural, and turn off is a separable phrasal verb.",
      examples: [
        "Before we turned off the lights, we talked for a while.",
        "Could you turn the lights off?"
      ]
    };
  }
  if (lower.includes("find yourself")) {
    return {
      keywords: ["realise", "unexpectedly", "notice yourself"],
      definition: "Means that you unexpectedly notice yourself in a state or doing an activity.",
      range: "Natural in storytelling and descriptions of mental change. It is often followed by an -ing form or prepositional phrase.",
      collocations: "find yourself doing, find yourself in, suddenly find yourself",
      warning: "Find does not mean search here; it means to notice yourself in a particular state.",
      examples: [
        "I found myself thinking about that sentence all day.",
        "You may find yourself using the phrase naturally."
      ]
    };
  }
  if (lower.includes("it turns out")) {
    return {
      keywords: ["result", "actually", "discover"],
      definition: "Introduces a fact, result or contrast that became clear later.",
      range: "Common in speech and writing for storytelling, explaining causes and correcting expectations.",
      collocations: "it turns out that, as it turns out, turned out to be",
      warning: "Do not confuse it with turn out the light. Here, turn out refers to the eventual result.",
      examples: [
        "It turns out that I was focusing on the wrong problem.",
        "The meeting turned out to be useful."
      ]
    };
  }
  return null;
}

function reviewMeaning(meaning, known) {
  if (!meaning.trim()) return "Write or dictate your understanding first.";
  if (!known) return "Your interpretation is saved. This version gives an initial assessment based on the source sentence.";
  const hit = known.keywords.some((keyword) => meaning.includes(keyword));
  return hit ? "Your interpretation is broadly accurate." : "Your interpretation may be incomplete. Compare it with the full meaning and refine it.";
}

function analyseSentence(sentence, chunk) {
  const notes = [];
  let corrected = sentence.trim();
  let focus = "Keep the target phrase and repeat it in a new situation from your own life.";

  if (!/[.!?]$/.test(corrected)) {
    corrected += ".";
    notes.push("Add sentence-ending punctuation to make the sentence complete.");
  }

  if (/\bi\b/.test(corrected)) {
    corrected = corrected.replace(/\bi\b/g, "I");
    notes.push("The first-person pronoun I must be capitalised.");
  }

  if (/I am difficult to/i.test(corrected)) {
    corrected = corrected.replace(/I am difficult to/i, "I find it difficult to");
    notes.push("To describe something you find hard, use I find it difficult to..., not I am difficult to...");
    focus = "Practise I find it difficult to... and I have difficulty doing...";
  }

  if (/listen music/i.test(corrected)) {
    corrected = corrected.replace(/listen music/gi, "listen to music");
    notes.push("Listen normally needs to before its object.");
    focus = "Notice the fixed prepositions that follow verbs.";
  }

  if (/different with/i.test(corrected)) {
    corrected = corrected.replace(/different with/gi, "different from");
    notes.push("Different from is more natural than different with.");
    focus = "Learn adjectives and their prepositions as one unit.";
  }

  if (/discuss about/i.test(corrected)) {
    corrected = corrected.replace(/discuss about/gi, "discuss");
    notes.push("Discuss is transitive, so it takes its object directly.");
    focus = "Do not add about after discuss.";
  }

  const usedChunk = chunkLooksUsed(corrected, chunk.phrase);
  if (!usedChunk) {
    notes.push(`The target phrase is not clearly used in this sentence: ${chunk.phrase}`);
    focus = "Place the target phrase in the sentence before refining its grammar and tone.";
  }

  if (chunk.analysis?.range && /english|work|study|project/i.test(corrected) && /love/i.test(chunk.phrase)) {
    notes.push("This phrase carries romantic or strong emotional colour. Using it for non-human objects sounds exaggerated, which can work as humour or emphasis.");
    focus = "Notice a phrase’s range of use, not only its literal meaning.";
  }

  if (notes.length === 0) {
    notes.push("The basic check found no obvious issues. A future AI connection can assess tone, naturalness and more idiomatic alternatives.");
  }

  return {
    original: sentence,
    corrected,
    notes,
    focus,
    category: usedChunk ? "Grammar" : "Collocation"
  };
}

function chunkLooksUsed(sentence, phrase) {
  const lowerSentence = sentence.toLowerCase();
  const phraseParts = phrase
    .toLowerCase()
    .replace(/something|someone|somebody|doing|to do|do/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 3);

  if (!phraseParts.length) return true;
  return phraseParts.some((word) => lowerSentence.includes(word));
}

function segmentTranscript(text) {
  const subtitleSegments = parseSubtitle(text);
  if (subtitleSegments.length) return subtitleSegments;

  return text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .flatMap((line) => line.match(/[^.!?。！？]+[.!?。！？]?/g) || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({ text: item, start: null, end: null }));
}

function parseSubtitle(text) {
  if (!text.includes("-->")) return [];
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n").filter(Boolean);
      const timingLine = lines.find((line) => line.includes("-->"));
      if (!timingLine) return null;
      const [startRaw, endRaw] = timingLine.split("-->").map((item) => item.trim());
      const textLines = lines.filter((line) => !line.includes("-->") && !/^\d+$/.test(line.trim()));
      return {
        start: parseTimestamp(startRaw),
        end: parseTimestamp(endRaw),
        text: textLines.join(" ").replace(/\s+,/g, ",").trim()
      };
    })
    .filter((segment) => segment && segment.text);
}

function parseTimestamp(value) {
  const clean = value.replace(",", ".");
  const parts = clean.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function playSegment(audio, segment) {
  if (!audio?.src) {
    toast("This material has no audio");
    return;
  }
  if (!segment || segment.start == null || segment.end == null) {
    audio.play();
    return;
  }

  if (segmentTimer) window.clearInterval(segmentTimer);
  audio.currentTime = segment.start;
  audio.play();
  segmentTimer = window.setInterval(() => {
    if (audio.currentTime >= segment.end) {
      audio.pause();
      window.clearInterval(segmentTimer);
      segmentTimer = null;
    }
  }, 120);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("audio")) db.createObjectStore("audio");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putAudio(id, file) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("audio", "readwrite");
    tx.objectStore("audio").put(file, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getAudio(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("audio", "readonly");
    const request = tx.objectStore("audio").get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function deleteAudio(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("audio", "readwrite");
    tx.objectStore("audio").delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `flowe-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast("Data exported");
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("is-visible");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => node.classList.remove("is-visible"), 2200);
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll("\n", " ");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  }
}
