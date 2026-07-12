const STORAGE_KEY = "englishflow-state-v3";
const LEGACY_STORAGE_KEY = "englishflow-state-v2";
const DB_NAME = "englishflow-files-v1";
const DB_VERSION = 2;
const BLOCKED_PUBLIC_MATERIAL_IDS = new Set(["xhs_6a25584d"]);

let state = loadState();
let activeView = "materials";
let activeMaterialId = state.materials[0]?.id || null;
let activeChunkId = state.chunks[0]?.id || null;
let currentAnalysis = null;
let latestFeedback = null;
let activeCaptureId = null;
let captureEditorOpen = false;
let activePhraseDetailId = null;
let activeErrorId = null;
let editingMaterialId = null;
let sentenceComposerKey = null;
let activeAudioUrl = null;
let activeVideoUrl = null;
let activePosterUrl = null;
let frequentCoverUrls = [];
let frequentPreviewRenderId = 0;
let materialListCoverUrls = [];
let materialListRenderId = 0;
let materialDetailRenderId = 0;
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
  if (isDemoPreview()) {
    return normalizeState(buildDemoPreviewState());
  }

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

function isDemoPreview() {
  return new URLSearchParams(window.location.search).has("demo");
}

function buildDemoPreviewState() {
  const now = new Date().toISOString();
  const materialId = "demo_material_1";
  const stuckChunk = {
    id: "demo_chunk_stuck",
    phrase: "Stuck with it",
    meaning: "坚持做",
    sourceMaterialId: materialId,
    sourceTitle: "American Comedy: Controversial History",
    sentence: "I stuck with it because I wanted to finish what I started.",
    tag: "Listening",
    status: "learning",
    createdAt: now,
    practiceHistory: [
      {
        id: "demo_attempt_1",
        chunkId: "demo_chunk_stuck",
        sentence: "I stuck with it even when the topic was hard",
        corrected: "I stuck with it even when the topic was hard.",
        feedback: {
          corrected: "I stuck with it even when the topic was hard.",
          notes: ["Add sentence-ending punctuation to make the sentence complete."],
          focus: "Keep the target phrase in a personal sentence.",
          category: "Grammar"
        },
        createdAt: now
      }
    ]
  };
  const storyChunk = {
    id: "demo_chunk_story",
    phrase: "A specific inspiring story",
    meaning: "一个鼓舞人心的故事",
    sourceMaterialId: materialId,
    sourceTitle: "American Comedy: Controversial History",
    sentence: "He wanted a specific inspiring story, not a vague answer.",
    tag: "Listening",
    status: "learning",
    createdAt: now,
    practiceHistory: []
  };

  stuckChunk.analysis = buildChunkAnalysis(stuckChunk.phrase, stuckChunk.meaning, stuckChunk.sentence);
  storyChunk.analysis = buildChunkAnalysis(storyChunk.phrase, storyChunk.meaning, storyChunk.sentence);

  return {
    materials: [
      {
        id: materialId,
        title: "American Comedy: Controversial History",
        source: "http://xhslink.com/o/1wXnrAknwZg",
        videoName: "demo-video.mp4",
        videoType: "video/mp4",
        audioName: "demo-audio.mp3",
        audioType: "audio/mpeg",
        coverName: "demo-cover.jpg",
        transcriptName: "demo-subtitles.srt",
        transcript: "I stuck with it because I wanted to finish what I started.\nHe wanted a specific inspiring story, not a vague answer.",
        segments: [
          { start: 0, end: 4, text: "I stuck with it because I wanted to finish what I started." },
          { start: 4, end: 9, text: "He wanted a specific inspiring story, not a vague answer." }
        ],
        captures: [
          {
            id: "demo_capture_stuck",
            phrase: stuckChunk.phrase,
            meaning: stuckChunk.meaning,
            sentence: stuckChunk.sentence,
            analysis: stuckChunk.analysis,
            linkedChunkId: stuckChunk.id,
            practiceHistory: [...stuckChunk.practiceHistory],
            createdAt: now
          },
          {
            id: "demo_capture_story",
            phrase: storyChunk.phrase,
            meaning: storyChunk.meaning,
            sentence: storyChunk.sentence,
            analysis: storyChunk.analysis,
            linkedChunkId: storyChunk.id,
            practiceHistory: [],
            createdAt: now
          }
        ],
        createdAt: now,
        updatedAt: now
      }
    ],
    chunks: [stuckChunk, storyChunk],
    mistakes: [],
    attempts: [...stuckChunk.practiceHistory],
    practiceLog: {
      [dateKey(new Date())]: 42
    },
    profile: {},
    ieltsHistory: []
  };
}

function normalizeState(nextState) {
  const blockedSourceIds = new Set([...BLOCKED_PUBLIC_MATERIAL_IDS]);
  const chunks = (nextState.chunks || [])
    .filter((chunk) => !blockedSourceIds.has(chunk.sourceMaterialId))
    .map((chunk) => ({
      ...chunk,
      tag: translateLegacyLabel(chunk.tag),
      meaning: chunk.meaning || "",
      sentence: chunk.sentence || "",
      analysis: chunk.analysis || buildChunkAnalysis(chunk.phrase || "This phrase", chunk.meaning || "", chunk.sentence || ""),
      practiceHistory: chunk.practiceHistory || []
    }));
  const materials = (nextState.materials || [])
    .filter((item) => !BLOCKED_PUBLIC_MATERIAL_IDS.has(item.id))
    .map((material) => {
      const captures = Array.isArray(material.captures)
        ? material.captures.map((capture) => ({
            ...capture,
            phrase: capture.phrase || "",
            meaning: capture.meaning || "",
            sentence: capture.sentence || "",
            linkedChunkId: capture.linkedChunkId || "",
            analysis: capture.analysis || buildChunkAnalysis(capture.phrase || "This phrase", capture.meaning || "", capture.sentence || ""),
            practiceHistory: capture.practiceHistory || []
          }))
        : [];
      chunks
        .filter((chunk) => chunk.sourceMaterialId === material.id)
        .forEach((chunk) => {
          const alreadyLinked = captures.some((capture) =>
            capture.linkedChunkId === chunk.id || capture.phrase?.toLowerCase() === chunk.phrase?.toLowerCase()
          );
          if (!alreadyLinked) {
            captures.push({
              id: `cap_${chunk.id}`,
              phrase: chunk.phrase,
              meaning: chunk.meaning || "",
              sentence: chunk.sentence || "",
              analysis: chunk.analysis || buildChunkAnalysis(chunk.phrase, chunk.meaning || "", chunk.sentence || ""),
              linkedChunkId: chunk.id,
              createdAt: chunk.createdAt || new Date().toISOString()
            });
          }
        });
      return { ...material, captures };
    });
  const mistakes = (nextState.mistakes || [])
    .filter((mistake) => !blockedSourceIds.has(mistake.sourceMaterialId))
    .map((mistake) => {
      const sourceChunk = chunks.find((chunk) => chunk.id === mistake.sourceChunkId);
      return {
        ...mistake,
        category: translateLegacyLabel(mistake.category),
        phrase: mistake.phrase || sourceChunk?.phrase || "Saved sentence error",
        meaning: mistake.meaning || sourceChunk?.meaning || "",
        sentence: mistake.sentence || sourceChunk?.sentence || "",
        analysis: mistake.analysis || sourceChunk?.analysis || null,
        practiceHistory: mistake.practiceHistory || sourceChunk?.practiceHistory || [],
        morePractice: mistake.morePractice || []
      };
    });

  return {
    materials,
    chunks,
    mistakes,
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
  if (isDemoPreview()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bindNavigation() {
  $$("[data-nav], [data-goto]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      const target = element.dataset.nav || element.dataset.goto;
      if (target) switchView(target, { resetDetail: true, scrollTop: true });
    });
  });
}

function resetViewState(view) {
  sentenceComposerKey = null;
  latestFeedback = null;

  if (view === "materials") {
    activeCaptureId = null;
    captureEditorOpen = false;
    currentAnalysis = null;
  }
  if (view === "chunks") {
    activePhraseDetailId = null;
  }
  if (view === "mistakes") {
    activeErrorId = null;
  }
}

function switchView(view, options = {}) {
  const { resetDetail = false, scrollTop = false } = options;
  if (resetDetail) resetViewState(view);
  activeView = view;
  $$(".view").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.view === view));
  $$(".nav-button").forEach((button) => button.classList.toggle("is-active", button.dataset.nav === view));
  $$(".mobile-tabbar button").forEach((button) => button.classList.toggle("is-active", button.dataset.nav === view));
  window.history.replaceState(null, "", `#${view}`);
  renderAll();
  if (scrollTop) {
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }
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
    const videoFile = $("#videoInput").files?.[0] || null;
    const audioFile = $("#audioInput").files?.[0] || null;
    const coverFile = $("#coverInput").files?.[0] || null;
    const transcriptFile = $("#transcriptInput").files?.[0] || null;
    const transcript = $("#transcriptText").value.trim();

    if (!title || !transcript) {
      toast("Add a title and transcript first");
      return;
    }

    const existing = editingMaterialId
      ? state.materials.find((material) => material.id === editingMaterialId)
      : null;
    const id = existing?.id || createId("mat");
    const material = existing || { id, captures: [], createdAt: new Date().toISOString() };
    Object.assign(material, {
      title,
      source,
      videoName: videoFile?.name || material.videoName || "",
      videoType: videoFile?.type || material.videoType || "",
      audioName: audioFile?.name || material.audioName || "",
      audioType: audioFile?.type || material.audioType || "",
      coverName: coverFile?.name || material.coverName || "",
      coverType: coverFile?.type || material.coverType || "",
      transcriptName: transcriptFile?.name || material.transcriptName || "",
      transcript,
      segments: segmentTranscript(transcript),
      updatedAt: new Date().toISOString()
    });

    await Promise.all([
      videoFile ? putFile("video", id, videoFile) : Promise.resolve(),
      audioFile ? putFile("audio", id, audioFile) : Promise.resolve(),
      coverFile ? putFile("cover", id, coverFile) : Promise.resolve()
    ]);

    if (!existing) state.materials.unshift(material);
    activeMaterialId = id;
    activeCaptureId = null;
    captureEditorOpen = false;
    currentAnalysis = null;
    latestFeedback = null;
    saveState();
    closeMaterialEditor();
    renderAll();
    toast(existing ? "Material updated" : "Material saved");
  });
}

function openMaterialEditor(material = null) {
  const editor = $("#materialImporter");
  const form = $("#materialForm");
  if (!editor || !form) return;

  editingMaterialId = material?.id || null;
  form.reset();
  $("#materialTitle").value = material?.title || "";
  $("#materialSource").value = material?.source || "";
  $("#transcriptText").value = material?.transcript || "";
  setText("#materialFormMode", material ? "Edit material" : "New material");
  setText("#materialFormTitle", material ? "Edit Material" : "Add Material");
  setText("#materialSubmitLabel", material ? "Save Changes" : "Save Material");
  setCurrentFile("#currentVideoFile", material?.videoName);
  setCurrentFile("#currentAudioFile", material?.audioName);
  setCurrentFile("#currentCoverFile", material?.coverName);
  setCurrentFile("#currentTranscriptFile", material?.transcriptName);
  editor.hidden = false;
  editor.scrollIntoView({ behavior: "smooth", block: "nearest" });
  window.setTimeout(() => $("#materialTitle")?.focus(), 180);
  renderIcons();
}

function closeMaterialEditor() {
  const editor = $("#materialImporter");
  const form = $("#materialForm");
  editingMaterialId = null;
  if (editor) editor.hidden = true;
  form?.reset();
  ["#currentVideoFile", "#currentAudioFile", "#currentCoverFile", "#currentTranscriptFile"].forEach((selector) => setText(selector, ""));
}

function setCurrentFile(selector, filename) {
  setText(selector, filename ? `Current: ${filename}. Choose a new file only to replace it.` : "");
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

  $("#exportButton")?.addEventListener("click", exportData);

  $("#addMaterialButton")?.addEventListener("click", () => {
    window.requestAnimationFrame(() => {
      openMaterialEditor();
    });
  });

  $("#manageAddMaterialButton")?.addEventListener("click", () => openMaterialEditor());
  $("#cancelMaterialEditButton")?.addEventListener("click", closeMaterialEditor);

  $("#practiceSummaryToggle")?.addEventListener("click", () => {
    practiceSummaryOpen = !practiceSummaryOpen;
    renderPreservingScroll(() => {
      renderHomeDashboard();
      renderIcons();
    });
  });

  $("#backupInput")?.addEventListener("change", async (event) => {
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

async function renderFrequentMaterials() {
  const container = $("#frequentMaterialsPreview");
  if (!container) return;
  const renderId = ++frequentPreviewRenderId;
  frequentCoverUrls.forEach((url) => URL.revokeObjectURL(url));
  frequentCoverUrls = [];

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
      : material.coverName
        ? `<img data-local-cover="${escapeAttribute(material.id)}" alt="">`
      : `<span class="preview-letter">${escapeHtml((material.title || "M").slice(0, 1).toUpperCase())}</span>`;
    const mediaType = material.videoPath || material.videoName ? "Video" : material.audioName ? "Audio" : "Text";
    return `
      <span class="material-preview material-tone-${index + 1}">
        ${poster}
        <span class="preview-caption"><small>${mediaType}</small><strong>${escapeHtml(material.title)}</strong></span>
      </span>
    `;
  }).join("");

  await Promise.all(materials.map(async (material) => {
    if (!material.coverName || material.posterPath) return;
    const blob = await getFile("cover", material.id);
    if (!blob || renderId !== frequentPreviewRenderId) return;
    const image = container.querySelector(`[data-local-cover="${CSS.escape(material.id)}"]`);
    if (!image) return;
    const url = URL.createObjectURL(blob);
    frequentCoverUrls.push(url);
    image.src = url;
  }));
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

function renderPreservingScroll(renderAction) {
  const scrollTop = window.scrollY;
  const restore = () => window.scrollTo({ top: scrollTop, left: 0, behavior: "auto" });
  const result = renderAction();
  restore();
  window.requestAnimationFrame(() => {
    restore();
    window.requestAnimationFrame(restore);
  });
  if (result?.then) {
    result.finally(() => window.requestAnimationFrame(restore));
  }
  return result;
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
      const cover = material.posterPath
        ? `<img src="${escapeAttribute(material.posterPath)}" alt="">`
        : material.coverName
          ? `<img data-material-list-cover="${escapeAttribute(material.id)}" alt="">`
          : `<span>${escapeHtml((material.title || "M").slice(0, 1).toUpperCase())}</span>`;
      return `
        <article class="material-item ${material.id === activeMaterialId ? "is-active" : ""}">
          <button class="material-item-main" type="button" data-select-material="${material.id}" aria-label="Open ${escapeAttribute(material.title)}">
            <span class="material-list-cover">${cover}</span>
            <div class="material-item-copy">
              <h3>${escapeHtml(material.title)}</h3>
              <p>${mediaLabel} · ${material.captures?.length || 0} phrases · ${material.segments?.length || 0} lines</p>
            </div>
          </button>
          <div class="material-row-actions">
            <button class="icon-button" type="button" data-edit-material="${material.id}" aria-label="Edit ${escapeAttribute(material.title)}" title="Edit material"><i data-lucide="pencil"></i></button>
            <button class="icon-button danger-icon" type="button" data-delete-material="${material.id}" aria-label="Delete ${escapeAttribute(material.title)}" title="Delete material"><i data-lucide="trash-2"></i></button>
          </div>
        </article>
      `;
    })
    .join("");

  loadMaterialListCovers(list, state.materials);

  $$("[data-select-material]", list).forEach((button) => {
    button.addEventListener("click", () => {
      activeMaterialId = button.dataset.selectMaterial;
      activeCaptureId = null;
      captureEditorOpen = false;
      currentAnalysis = null;
      latestFeedback = null;
      renderPreservingScroll(() => renderAll());
    });
  });

  $$("[data-edit-material]", list).forEach((button) => {
    button.addEventListener("click", () => {
      const material = state.materials.find((item) => item.id === button.dataset.editMaterial);
      if (material) openMaterialEditor(material);
    });
  });

  $$("[data-delete-material]", list).forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.deleteMaterial;
      const material = state.materials.find((item) => item.id === id);
      if (!window.confirm(`Delete “${material?.title || "this material"}” and its locally stored media?`)) return;
      state.materials = state.materials.filter((item) => item.id !== id);
      state.chunks = state.chunks.map((chunk) =>
        chunk.sourceMaterialId === id ? { ...chunk, sourceMaterialId: "", sourceTitle: "Deleted material" } : chunk
      );
      await Promise.all([
        deleteFile("audio", id),
        deleteFile("video", id),
        deleteFile("cover", id)
      ]);
      activeMaterialId = state.materials[0]?.id || null;
      activeCaptureId = null;
      saveState();
      renderAll();
      toast("Material deleted");
    });
  });

  renderMaterialDetail();
}

async function loadMaterialListCovers(container, materials) {
  const renderId = ++materialListRenderId;
  materialListCoverUrls.forEach((url) => URL.revokeObjectURL(url));
  materialListCoverUrls = [];

  await Promise.all(materials.map(async (material) => {
    if (!material.coverName || material.posterPath) return;
    const blob = await getFile("cover", material.id);
    if (!blob || renderId !== materialListRenderId) return;
    const image = container.querySelector(`[data-material-list-cover="${CSS.escape(material.id)}"]`);
    if (!image) return;
    const url = URL.createObjectURL(blob);
    materialListCoverUrls.push(url);
    image.src = url;
  }));
}

async function renderMaterialDetail() {
  const renderId = ++materialDetailRenderId;
  const container = $("#materialDetail");
  const material = state.materials.find((item) => item.id === activeMaterialId);
  if (!material) return;
  material.captures = Array.isArray(material.captures) ? material.captures : [];

  if (activeCaptureId && !material.captures.some((capture) => capture.id === activeCaptureId)) {
    activeCaptureId = null;
  }
  const activeCapture = material.captures.find((capture) => capture.id === activeCaptureId) || null;
  if (activeCapture) {
    currentAnalysis = captureAsAnalysis(activeCapture, material);
    activeChunkId = activeCapture.linkedChunkId || "";
    latestFeedback = activeCapture.latestFeedback || null;
  } else {
    currentAnalysis = null;
    latestFeedback = null;
  }

  const materialTitle = material.source
    ? `<a class="material-title-link" href="${escapeAttribute(material.source)}" target="_blank" rel="noreferrer" title="Open source link">${escapeHtml(material.title)}</a>`
    : escapeHtml(material.title);
  const videoBlock = material.videoPath || material.videoName
    ? `
      <video
        id="activeVideo"
        class="video-player"
        controls
        playsinline
        preload="metadata"
        ${material.posterPath ? `poster="${escapeAttribute(material.posterPath)}"` : ""}
        ${material.videoPath ? `src="${escapeAttribute(material.videoPath)}"` : ""}
      ></video>
    `
    : "";
  const audioBlock = material.audioPath || material.audioName
    ? `<audio id="activeAudio" class="audio-player" controls></audio>`
    : "";
  const transcriptRows = material.segments?.length
    ? material.segments
        .map(
          (segment, index) => `
            <article class="sentence-row" data-segment-index="${index}" data-sentence="${escapeAttribute(segment.text)}">
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

  container.className = "detail-content";
  container.innerHTML = `
    <div class="workbench-head">
      <div>
        <p class="section-label">Material</p>
        <h2>${materialTitle}</h2>
      </div>
    </div>

    ${videoBlock}
    ${audioBlock}

    <details class="transcript-drawer transcript-block" id="subtitleDrawer">
      <summary>
        <span><i data-lucide="captions"></i> English Subtitles</span>
        <small>${material.segments?.length || 0} lines</small>
        <i data-lucide="chevron-down"></i>
      </summary>
      <div class="transcript-panel" id="transcriptPanel">${transcriptRows}</div>
    </details>

    <section class="material-phrases" aria-labelledby="capturedPhrasesTitle">
      <div class="phrase-section-head">
        <div>
          <h2 id="capturedPhrasesTitle">Captured Phrases <span>${material.captures.length}</span></h2>
        </div>
        ${captureEditorOpen || !material.captures.length ? "" : `
          <button class="compact-action add-phrase-button" type="button" id="addPhraseButton">
            <i data-lucide="plus"></i>
            <span>Add</span>
          </button>
        `}
      </div>

      ${captureEditorOpen || !material.captures.length ? renderCaptureEditor(Boolean(material.captures.length)) : ""}
      ${renderCapturedPhraseList(material, activeCapture)}
    </section>
  `;

  const video = $("#activeVideo");
  const audio = $("#activeAudio");
  const [videoBlob, audioBlob, coverBlob] = await Promise.all([
    material.videoPath ? null : getFile("video", material.id),
    material.audioPath ? null : getFile("audio", material.id),
    material.posterPath ? null : getFile("cover", material.id)
  ]);
  if (renderId !== materialDetailRenderId || activeMaterialId !== material.id) return;
  if (activeVideoUrl) URL.revokeObjectURL(activeVideoUrl);
  if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
  if (activePosterUrl) URL.revokeObjectURL(activePosterUrl);
  activeVideoUrl = null;
  activeAudioUrl = null;
  activePosterUrl = null;

  if (video && material.videoPath) {
    video.src = material.videoPath;
  } else if (video && videoBlob) {
    activeVideoUrl = URL.createObjectURL(videoBlob);
    video.src = activeVideoUrl;
  }
  if (video && coverBlob) {
    activePosterUrl = URL.createObjectURL(coverBlob);
    video.poster = activePosterUrl;
  }

  if (audio && material.audioPath) {
    audio.src = material.audioPath;
  } else if (audio && audioBlob) {
    activeAudioUrl = URL.createObjectURL(audioBlob);
    audio.src = activeAudioUrl;
  } else if (!video) {
    const workbenchHead = $(".workbench-head", container);
    workbenchHead?.insertAdjacentHTML("afterend", `<p class="small-note">No playable media is saved for this material. You can still practise with the transcript.</p>`);
  }

  bindMaterialDetailEvents(material);
  bindSubtitleSync(material, video, audio);
  renderIcons();
}

function bindSubtitleSync(material, video, audio) {
  const drawer = $("#subtitleDrawer");
  const panel = $("#transcriptPanel");
  const rows = $$("[data-segment-index]", panel);
  if (!drawer || !panel || !rows.length) return;

  let activeIndex = -1;
  const updateSubtitle = (media) => {
    const time = media.currentTime;
    const nextIndex = material.segments.findIndex((segment) => (
      segment.start != null
      && segment.end != null
      && time >= segment.start
      && time < segment.end
    ));
    if (nextIndex < 0) {
      rows[activeIndex]?.classList.remove("is-current");
      activeIndex = -1;
      return;
    }
    if (nextIndex === activeIndex) return;

    rows[activeIndex]?.classList.remove("is-current");
    const activeRow = rows[nextIndex];
    activeRow?.classList.add("is-current");
    activeIndex = nextIndex;

    if (drawer.open && activeRow) {
      const targetTop = activeRow.offsetTop - (panel.clientHeight - activeRow.offsetHeight) / 2;
      panel.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    }
  };

  [video, audio].filter(Boolean).forEach((media) => {
    media.addEventListener("timeupdate", () => updateSubtitle(media));
    media.addEventListener("seeked", () => updateSubtitle(media));
    media.addEventListener("play", () => {
      [video, audio]
        .filter((item) => item && item !== media && !item.paused)
        .forEach((item) => item.pause());
      updateSubtitle(media);
    });
  });

  drawer.addEventListener("toggle", () => {
    if (!drawer.open || activeIndex < 0) return;
    const activeRow = rows[activeIndex];
    if (!activeRow) return;
    panel.scrollTop = Math.max(0, activeRow.offsetTop - (panel.clientHeight - activeRow.offsetHeight) / 2);
  });
}

function bindMaterialDetailEvents(material) {
  $$("[data-voice-target]", $("#materialDetail")).forEach((button) => {
    button.addEventListener("click", () => startVoiceInput(button.dataset.voiceTarget, button.dataset.voiceLang, button));
  });

  $("#addPhraseButton")?.addEventListener("click", () => {
    captureEditorOpen = true;
    activeCaptureId = null;
    renderPreservingScroll(() => renderMaterialDetail());
  });

  $("#cancelCaptureButton")?.addEventListener("click", () => {
    captureEditorOpen = false;
    renderPreservingScroll(() => renderMaterialDetail());
  });

  $$('[data-open-capture]', $("#materialDetail")).forEach((button) => {
    button.addEventListener("click", () => {
      const nextId = button.dataset.openCapture;
      activeCaptureId = activeCaptureId === nextId ? null : nextId;
      captureEditorOpen = false;
      renderPreservingScroll(() => renderMaterialDetail());
    });
  });

  $("#analyzeChunkButton")?.addEventListener("click", () => {
    const phrase = $("#capturePhrase").value.trim();
    const meaning = $("#captureMeaning").value.trim();
    const sentence = $("#captureSourceSentence").value.trim();

    if (!phrase || !meaning) {
      toast("Add the phrase and your understanding first");
      return;
    }

    const capture = {
      id: createId("cap"),
      phrase,
      meaning,
      sentence,
      analysis: buildChunkAnalysis(phrase, meaning, sentence),
      linkedChunkId: "",
      createdAt: new Date().toISOString()
    };
    material.captures.unshift(capture);
    activeCaptureId = capture.id;
    captureEditorOpen = false;
    currentAnalysis = captureAsAnalysis(capture, material);
    activeChunkId = "";
    latestFeedback = null;
    saveState();
    renderPreservingScroll(() => renderMaterialDetail());
    toast("Phrase added to this material");
  });

  const saveButton = $("#saveChunkButton");
  if (saveButton) {
    saveButton.addEventListener("click", saveCurrentChunk);
  }

  bindSentencePracticeControls($("#materialDetail"));

  $("#deleteCaptureButton")?.addEventListener("click", () => {
    material.captures = material.captures.filter((capture) => capture.id !== activeCaptureId);
    activeCaptureId = null;
    currentAnalysis = null;
    latestFeedback = null;
    saveState();
    renderPreservingScroll(() => renderMaterialDetail());
    toast("Phrase removed from this material");
  });

  $$(".sentence-row", $("#transcriptPanel")).forEach((row) => {
    row.addEventListener("click", () => {
      const sourceInput = $("#captureSourceSentence");
      if (sourceInput) {
        sourceInput.value = row.dataset.sentence || "";
        toast("Source line selected");
      } else {
        toast("Open Add Phrase before selecting a source line");
      }
    });
  });

  $$("[data-play-segment]", $("#transcriptPanel")).forEach((button) => {
    button.addEventListener("click", () => {
      const material = state.materials.find((item) => item.id === activeMaterialId);
      const segment = material?.segments?.[Number(button.dataset.playSegment)];
      playSegment($("#activeAudio") || $("#activeVideo"), segment);
    });
  });
}

function renderCaptureEditor(canCancel) {
  return `
    <section class="capture-editor">
      <div class="capture-editor-head">
        <h3>Capture a Phrase</h3>
        ${canCancel ? `<button class="icon-button" type="button" id="cancelCaptureButton" aria-label="Close phrase form" title="Close phrase form"><i data-lucide="x"></i></button>` : ""}
      </div>
      <label>
        <span>English phrase</span>
        <div class="voice-field">
          <input id="capturePhrase" type="text" placeholder="e.g. a specific inspiring story">
          <button class="icon-button voice-button" type="button" data-voice-target="capturePhrase" data-voice-lang="en-US" aria-label="Dictate an English phrase" title="Dictate an English phrase"><i data-lucide="mic"></i></button>
        </div>
      </label>
      <label>
        <span>My understanding in Chinese</span>
        <div class="voice-field">
          <textarea id="captureMeaning" rows="3" placeholder="用中文说出你的理解"></textarea>
          <button class="icon-button voice-button" type="button" data-voice-target="captureMeaning" data-voice-lang="zh-CN" aria-label="Dictate your understanding" title="Dictate your understanding"><i data-lucide="mic"></i></button>
        </div>
      </label>
      <input id="captureSourceSentence" type="hidden" value="">
      <button class="primary-button" type="button" id="analyzeChunkButton">
        <i data-lucide="sparkles"></i>
        <span>Analyse This Phrase</span>
      </button>
    </section>
  `;
}

function renderCapturedPhraseList(material, activeCapture) {
  if (!material.captures.length) return "";
  return `
    <div class="captured-phrase-list">
      ${material.captures.map((capture, index) => {
        const isOpen = activeCapture?.id === capture.id;
        return `
          <article class="captured-phrase ${isOpen ? "is-open" : ""}">
            <button class="captured-phrase-row" type="button" data-open-capture="${escapeAttribute(capture.id)}" aria-expanded="${isOpen}">
              <span class="phrase-order">${String(index + 1).padStart(2, "0")}</span>
              <strong>${escapeHtml(capture.phrase)}</strong>
              ${capture.linkedChunkId ? `<span class="phrase-saved-state">In Phrase Bank</span>` : ""}
              <i data-lucide="chevron-down"></i>
            </button>
            ${isOpen ? `<div class="captured-phrase-detail">${renderCaptureWorkspace(capture)}</div>` : ""}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderCaptureWorkspace(capture) {
  return `
    ${renderMeaningFeedback(capture)}
    <div class="phrase-bank-action">
      ${capture.linkedChunkId
        ? `<span class="saved-confirmation"><i data-lucide="check"></i> Saved to Phrase Bank</span>`
        : `<button class="secondary-button" type="button" id="saveChunkButton"><i data-lucide="bookmark-plus"></i><span>Save to Phrase Bank</span></button>`}
    </div>
    <section class="inline-sentence-practice practice-card">
      ${renderPracticeCard(capture, {
        showErrorAction: false,
        heading: "Sentence Practice",
        entries: capture.practiceHistory || [],
        composerKey: `material:${capture.id}`
      })}
    </section>
    <button class="ghost-button remove-capture-button" type="button" id="deleteCaptureButton"><i data-lucide="trash-2"></i><span>Remove from this material</span></button>
  `;
}

function captureAsAnalysis(capture, material) {
  return {
    ...capture,
    materialId: material.id,
    sourceMaterialId: material.id,
    sourceTitle: material.title,
    tag: "Listening"
  };
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

function renderPracticeCard(chunk, options = {}) {
  const {
    showErrorAction = true,
    heading = "Sentence Practice",
    entries = chunk?.practiceHistory || [],
    composerKey = `practice:${chunk?.id || "draft"}`
  } = options;

  if (!chunk) {
    return `
      <div class="sentence-practice-head"><h3>${escapeHtml(heading)}</h3></div>
      <div class="detail-empty compact-empty">Waiting for a phrase</div>
    `;
  }

  const composerOpen = sentenceComposerKey === composerKey;
  return `
    <div class="sentence-practice-head">
      <div>
        <h3>${escapeHtml(heading)}</h3>
        <p>${entries.length} ${entries.length === 1 ? "sentence" : "sentences"}</p>
      </div>
      ${composerOpen ? "" : `<button class="secondary-button compact-action" type="button" data-add-sentence="${escapeAttribute(composerKey)}"><i data-lucide="plus"></i><span>Add Sentence</span></button>`}
    </div>
    ${renderSentenceEntries(entries)}
    ${composerOpen ? `
      <section class="sentence-composer">
        <label>
          <span>New English sentence</span>
          <div class="voice-field">
            <textarea data-practice-sentence rows="3" placeholder="Say an English sentence about your own life"></textarea>
            <button class="icon-button voice-button" type="button" data-voice-target="practiceSentence" data-voice-lang="en-US" aria-label="Dictate an English sentence" title="Dictate an English sentence"><i data-lucide="mic"></i></button>
          </div>
        </label>
        <div class="button-row">
          <button class="primary-button" type="button" data-check-sentence><i data-lucide="check-circle-2"></i><span>Check Grammar and Naturalness</span></button>
          <button class="ghost-button" type="button" data-cancel-sentence><span>Cancel</span></button>
        </div>
      </section>
    ` : ""}
    ${showErrorAction && entries.length ? `<button class="secondary-button add-error-button" type="button" data-save-mistake><i data-lucide="bookmark-plus"></i><span>Add Phrase to Error</span></button>` : ""}
  `;
}

function renderSentenceEntries(entries = []) {
  if (!entries.length) return `<div class="sentence-list-empty">No sentences yet.</div>`;
  const chronological = [...entries].reverse();
  return `
    <div class="sentence-entry-list">
      ${chronological.map((entry, index) => {
        const rawCheck = entry.feedback?.notes?.[0]
          || (entry.corrected === entry.sentence ? "Looks natural and complete." : "Review the improved version below.");
        const check = rawCheck.includes("future AI connection") ? "Looks natural and complete." : rawCheck;
        return `
          <article class="sentence-entry">
            <div class="sentence-entry-head">
              <span>${index + 1}</span>
              <p>${escapeHtml(entry.sentence || "")}</p>
              <button class="icon-button danger-icon" type="button" data-delete-sentence="${escapeAttribute(entry.id)}" aria-label="Delete sentence ${index + 1}" title="Delete sentence"><i data-lucide="trash-2"></i></button>
            </div>
            <div class="sentence-result-row">
              <strong><i data-lucide="check-circle-2"></i> Check</strong>
              <p>${escapeHtml(check)}</p>
            </div>
            <div class="sentence-result-row natural-version-row">
              <strong><i data-lucide="sparkles"></i> More Natural Version</strong>
              <p>${escapeHtml(entry.corrected || entry.sentence || "")}</p>
            </div>
          </article>
        `;
      }).join("")}
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
      button.addEventListener("click", () => switchView(button.dataset.nav, { resetDetail: true, scrollTop: true }));
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

  bindSentencePracticeControls(container);
}

function saveCurrentChunk() {
  if (!currentAnalysis) return;

  let chunk = state.chunks.find(
    (chunk) => chunk.phrase.toLowerCase() === currentAnalysis.phrase.toLowerCase() && chunk.sourceMaterialId === currentAnalysis.materialId
  );

  if (!chunk) {
    chunk = {
      id: createId("chk"),
      phrase: currentAnalysis.phrase,
      meaning: currentAnalysis.meaning,
      sourceMaterialId: currentAnalysis.materialId,
      sourceTitle: currentAnalysis.sourceTitle,
      sentence: currentAnalysis.sentence,
      tag: currentAnalysis.tag,
      status: "learning",
      analysis: currentAnalysis.analysis,
      practiceHistory: [...(currentAnalysis.practiceHistory || [])],
      createdAt: new Date().toISOString()
    };
    state.chunks.unshift(chunk);
  }

  const material = state.materials.find((item) => item.id === currentAnalysis.materialId);
  const capture = material?.captures?.find((item) => item.id === activeCaptureId);
  if (capture) {
    capture.linkedChunkId = chunk.id;
    capture.practiceHistory = (capture.practiceHistory || []).map((entry) => ({ ...entry, chunkId: chunk.id }));
    chunk.practiceHistory = [...capture.practiceHistory];
  }
  state.attempts.forEach((attempt) => {
    if (attempt.chunkId === currentAnalysis.id) attempt.chunkId = chunk.id;
  });
  activeChunkId = chunk.id;
  activePhraseDetailId = chunk.id;
  saveState();
  renderPreservingScroll(() => renderAll());
  toast("Saved to Phrase with its analysis and practice history");
}

function bindSentencePracticeControls(scope) {
  if (!scope) return;
  $$('[data-add-sentence]', scope).forEach((button) => {
    button.addEventListener("click", () => {
      sentenceComposerKey = button.dataset.addSentence;
      rerenderCurrentPracticeView();
    });
  });
  $$('[data-cancel-sentence]', scope).forEach((button) => {
    button.addEventListener("click", () => {
      sentenceComposerKey = null;
      rerenderCurrentPracticeView();
    });
  });
  $$('[data-delete-sentence]', scope).forEach((button) => {
    button.addEventListener("click", () => deletePracticeSentence(button.dataset.deleteSentence));
  });
  $("[data-check-sentence]", scope)?.addEventListener("click", () => checkPracticeSentence(scope));
  $("[data-save-mistake]", scope)?.addEventListener("click", () => saveLatestMistake(scope));
}

function rerenderCurrentPracticeView() {
  renderPreservingScroll(() => {
    if (activeView === "materials") renderMaterialDetail();
    else if (activeView === "chunks") renderChunks();
    else if (activeView === "mistakes") renderMistakes();
    else renderSentenceStudio();
    renderIcons();
  });
}

function deletePracticeSentence(entryId) {
  if (activeView === "materials") {
    const material = state.materials.find((item) => item.id === activeMaterialId);
    const capture = material?.captures?.find((item) => item.id === activeCaptureId);
    if (capture) {
      capture.practiceHistory = (capture.practiceHistory || []).filter((entry) => entry.id !== entryId);
      const linked = state.chunks.find((chunk) => chunk.id === capture.linkedChunkId);
      if (linked) linked.practiceHistory = [...capture.practiceHistory];
    }
  } else if (activeView === "mistakes") {
    const mistake = state.mistakes.find((item) => item.id === activeErrorId);
    if (mistake) {
      mistake.practiceHistory = (mistake.practiceHistory || []).filter((entry) => entry.id !== entryId);
      mistake.morePractice = (mistake.morePractice || []).filter((entry) => entry.id !== entryId);
    }
  } else {
    const chunk = state.chunks.find((item) => item.id === activeChunkId);
    if (chunk) {
      chunk.practiceHistory = (chunk.practiceHistory || []).filter((entry) => entry.id !== entryId);
      state.materials.forEach((material) => {
        const capture = material.captures?.find((item) => item.linkedChunkId === chunk.id);
        if (capture) capture.practiceHistory = [...chunk.practiceHistory];
      });
    }
  }
  state.attempts = state.attempts.filter((entry) => entry.id !== entryId);
  saveState();
  rerenderCurrentPracticeView();
  toast("Sentence deleted");
}

function checkPracticeSentence(scope = currentPracticeScope()) {
  const sentence = $("[data-practice-sentence]", scope || document)?.value.trim();
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
  const practiceEntry = {
    id: createId("att"),
    chunkId: chunk.id || "",
    sentence,
    corrected: latestFeedback.corrected,
    feedback: latestFeedback,
    createdAt: new Date().toISOString()
  };
  state.attempts.unshift(practiceEntry);

  if (activeView === "materials") {
    const material = state.materials.find((item) => item.id === activeMaterialId);
    const capture = material?.captures?.find((item) => item.id === activeCaptureId);
    if (capture) {
      capture.practiceHistory = [practiceEntry, ...(capture.practiceHistory || [])];
      capture.latestFeedback = latestFeedback;
      if (capture.linkedChunkId) {
        const linkedChunk = state.chunks.find((item) => item.id === capture.linkedChunkId);
        if (linkedChunk) linkedChunk.practiceHistory = [practiceEntry, ...(linkedChunk.practiceHistory || [])];
      }
    }
  } else if (activeView === "mistakes") {
    const mistake = state.mistakes.find((item) => item.id === activeErrorId);
    if (mistake) {
      mistake.morePractice = [practiceEntry, ...(mistake.morePractice || [])];
      mistake.latestFeedback = latestFeedback;
    }
  } else {
    const savedChunk = state.chunks.find((item) => item.id === activeChunkId);
    if (savedChunk) {
      savedChunk.practiceHistory = [practiceEntry, ...(savedChunk.practiceHistory || [])];
      savedChunk.latestFeedback = latestFeedback;
      state.materials.forEach((material) => {
        const linkedCapture = material.captures?.find((capture) => capture.linkedChunkId === savedChunk.id);
        if (linkedCapture) linkedCapture.practiceHistory = [...savedChunk.practiceHistory];
      });
    }
  }
  sentenceComposerKey = null;
  saveState();
  rerenderCurrentPracticeView();
}

function getActivePracticeChunk() {
  if (activeView === "materials") return currentAnalysis;
  if (activeView === "mistakes") {
    const mistake = state.mistakes.find((item) => item.id === activeErrorId);
    if (!mistake) return null;
    return {
      id: mistake.sourceChunkId || mistake.id,
      phrase: mistake.phrase,
      meaning: mistake.meaning,
      sentence: mistake.sentence,
      analysis: mistake.analysis,
      sourceMaterialId: mistake.sourceMaterialId
    };
  }
  return state.chunks.find((chunk) => chunk.id === activeChunkId) || currentAnalysis;
}

function currentPracticeScope() {
  if (activeView === "materials") return $("#materialDetail");
  if (activeView === "chunks") return $("#chunksList");
  if (activeView === "mistakes") return $("#mistakesList");
  return $("#sentenceStudio");
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

function saveLatestMistake(scope = currentPracticeScope()) {
  if (!latestFeedback) {
    checkPracticeSentence(scope);
    if (!latestFeedback) return;
  }

  const chunk = getActivePracticeChunk();
  const savedChunk = state.chunks.find((item) => item.id === chunk?.id);
  if (!savedChunk) {
    toast("Save this item to Phrase before adding it to Error");
    return;
  }

  let mistake = state.mistakes.find((item) => item.sourceChunkId === savedChunk.id && !item.mastered);
  if (!mistake) {
    mistake = {
      id: createId("err"),
      category: latestFeedback.category,
      phrase: savedChunk.phrase,
      meaning: savedChunk.meaning,
      sentence: savedChunk.sentence,
      analysis: savedChunk.analysis,
      practiceHistory: [...(savedChunk.practiceHistory || [])],
      morePractice: [],
      original: latestFeedback.original,
      corrected: latestFeedback.corrected,
      note: latestFeedback.notes.join(" "),
      sourceChunkId: savedChunk.id,
      sourceMaterialId: savedChunk.sourceMaterialId || "",
      mastered: false,
      createdAt: new Date().toISOString()
    };
    state.mistakes.unshift(mistake);
  } else {
    mistake.original = latestFeedback.original;
    mistake.corrected = latestFeedback.corrected;
    mistake.note = latestFeedback.notes.join(" ");
    mistake.practiceHistory = [...(savedChunk.practiceHistory || [])];
  }
  activeErrorId = mistake.id;
  saveState();
  renderStats();
  renderPreservingScroll(() => renderMistakes());
  toast("Phrase moved to Error for more practice");
}

function renderChunksLegacy() {
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
      switchView("materials", { resetDetail: false, scrollTop: true });
    });
  });

  $$("[data-delete-chunk]", list).forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.deleteChunk;
      state.chunks = state.chunks.filter((chunk) => chunk.id !== id);
      activeChunkId = state.chunks[0]?.id || "";
      saveState();
      renderPreservingScroll(() => renderAll());
      toast("Phrase deleted");
    });
  });
}

function renderMistakesLegacy() {
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

function renderChunks() {
  const filter = $("#chunkFilter")?.value || "all";
  const chunks = filter === "all" ? state.chunks : state.chunks.filter((chunk) => chunk.tag === filter);
  const list = $("#chunksList");

  if (!chunks.length) {
    list.innerHTML = `<div class="detail-empty">No phrases yet</div>`;
    return;
  }

  const activeChunk = chunks.find((chunk) => chunk.id === activePhraseDetailId) || null;
  if (activeView === "chunks") latestFeedback = activeChunk?.latestFeedback || null;
  const materialTone = new Map();
  let nextTone = 1;
  chunks.forEach((chunk) => {
    const sourceKey = chunk.sourceMaterialId || "standalone";
    if (!materialTone.has(sourceKey)) {
      materialTone.set(sourceKey, nextTone);
      nextTone = nextTone === 5 ? 1 : nextTone + 1;
    }
  });

  list.innerHTML = `
    <div class="phrase-notebook-grid">
      ${chunks.map((chunk, index) => {
        const sourceKey = chunk.sourceMaterialId || "standalone";
        const tone = materialTone.get(sourceKey) || 1;
        return `
          <button class="phrase-notebook-card phrase-tone-${tone}" type="button" data-open-phrase="${escapeAttribute(chunk.id)}">
            <span class="phrase-order">${String(index + 1).padStart(2, "0")}</span>
            <strong>${escapeHtml(chunk.phrase)}</strong>
            <small>${escapeHtml(chunk.sourceTitle || "Personal phrase")}</small>
            <span class="phrase-card-meta">${chunk.practiceHistory?.length || 0} sentences</span>
          </button>
        `;
      }).join("")}
    </div>
    ${activeChunk ? `
      <div class="phrase-detail-overlay" data-phrase-overlay role="dialog" aria-modal="true" aria-label="${escapeAttribute(activeChunk.phrase)} details">
        <section class="phrase-detail-sheet">
          <div class="phrase-detail-head">
            <div><p class="section-label">Phrase</p><h2>${escapeHtml(activeChunk.phrase)}</h2></div>
            <button class="icon-button" type="button" data-close-phrase aria-label="Close phrase details" title="Close phrase details"><i data-lucide="x"></i></button>
          </div>
          ${renderPhraseBankWorkspace(activeChunk)}
        </section>
      </div>
    ` : ""}
  `;

  $$('[data-open-phrase]', list).forEach((button) => {
    button.addEventListener("click", () => {
      const nextId = button.dataset.openPhrase;
      activePhraseDetailId = activePhraseDetailId === nextId ? null : nextId;
      activeChunkId = nextId;
      latestFeedback = state.chunks.find((item) => item.id === nextId)?.latestFeedback || null;
      renderPreservingScroll(() => {
        renderChunks();
        renderIcons();
      });
    });
  });

  $("[data-close-phrase]", list)?.addEventListener("click", () => {
    activePhraseDetailId = null;
    renderPreservingScroll(() => {
      renderChunks();
      renderIcons();
    });
  });
  $("[data-phrase-overlay]", list)?.addEventListener("click", (event) => {
    if (event.target !== event.currentTarget) return;
    activePhraseDetailId = null;
    renderPreservingScroll(() => {
      renderChunks();
      renderIcons();
    });
  });

  $$('[data-open-source-material]', list).forEach((button) => {
    button.addEventListener("click", () => {
      const chunk = state.chunks.find((item) => item.id === button.dataset.openSourceMaterial);
      if (!chunk) return;
      activeMaterialId = chunk.sourceMaterialId || activeMaterialId;
      activeCaptureId = state.materials
        .find((material) => material.id === activeMaterialId)
        ?.captures?.find((capture) => capture.linkedChunkId === chunk.id)?.id || null;
      switchView("materials", { resetDetail: false, scrollTop: true });
    });
  });

  $$('[data-voice-target]', list).forEach((button) => {
    button.addEventListener("click", () => startVoiceInput(button.dataset.voiceTarget, button.dataset.voiceLang, button));
  });
  bindSentencePracticeControls(list);

  $$('[data-delete-chunk]', list).forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.deleteChunk;
      state.chunks = state.chunks.filter((chunk) => chunk.id !== id);
      state.materials.forEach((material) => {
        material.captures?.forEach((capture) => {
          if (capture.linkedChunkId === id) capture.linkedChunkId = "";
        });
      });
      activeChunkId = state.chunks[0]?.id || "";
      activePhraseDetailId = null;
      saveState();
      renderPreservingScroll(() => renderAll());
      toast("Phrase deleted");
    });
  });
}

function renderPhraseBankWorkspace(chunk) {
  return `
    ${renderPhraseKnowledge(chunk)}
    <section class="inline-sentence-practice practice-card">
      ${renderPracticeCard(chunk, {
        showErrorAction: true,
        heading: "Sentence Practice",
        entries: chunk.practiceHistory || [],
        composerKey: `phrase:${chunk.id}`
      })}
    </section>
    <div class="detail-actions-row">
      ${chunk.sourceMaterialId ? `<button class="ghost-button" type="button" data-open-source-material="${escapeAttribute(chunk.id)}"><i data-lucide="headphones"></i><span>Open Source Material</span></button>` : ""}
      <button class="ghost-button" type="button" data-delete-chunk="${escapeAttribute(chunk.id)}"><i data-lucide="trash-2"></i><span>Delete Phrase</span></button>
    </div>
  `;
}

function renderPhraseKnowledge(item) {
  return renderMeaningFeedback(item);
}

function renderMeaningFeedback(item) {
  const known = getKnownChunk(item.phrase || "");
  const analysis = item.analysis || buildChunkAnalysis(item.phrase || "This phrase", item.meaning || "", item.sentence || "");
  const review = getChineseMeaningReview(item, known);
  const englishDefinition = known?.definition || cleanEnglishDefinition(item, analysis);

  return `
    <section class="meaning-feedback">
      <div class="meaning-feedback-row">
        <span>My Chinese interpretation</span>
        <p>${escapeHtml(item.meaning || "No interpretation added")}</p>
      </div>
      <div class="meaning-feedback-row chinese-meaning-feedback ${review.status === "correct" ? "is-correct" : "needs-correction"}">
        <span>Chinese meaning feedback</span>
        ${review.status === "correct"
          ? `<p class="meaning-verdict"><i data-lucide="check"></i> Correct</p>`
          : `<div class="correct-version"><strong>${escapeHtml(review.label)}</strong><p>${escapeHtml(review.text)}</p></div>`}
      </div>
      <div class="meaning-feedback-row english-supplement">
        <span>English definition</span>
        <p>${escapeHtml(englishDefinition)}</p>
      </div>
    </section>
  `;
}

function getChineseMeaningReview(item, known) {
  const meaning = item.meaning || "";
  if (!meaning.trim()) {
    return {
      status: "needs-correction",
      label: "Better meaning",
      text: "Add your Chinese understanding first, then compare it with the source context."
    };
  }

  if (!known?.chineseKeywords?.length) {
    return {
      status: "needs-correction",
      label: "Better meaning",
      text: "Use the source sentence to confirm the exact Chinese meaning, then save a tighter version here."
    };
  }

  const chineseMatchCount = known.chineseKeywords.filter((keyword) => meaning.includes(keyword)).length;
  const accurate = chineseMatchCount >= Math.min(2, known.chineseKeywords.length);
  return accurate
    ? { status: "correct", label: "Correct", text: "Correct" }
    : {
        status: "needs-correction",
        label: "Better meaning",
        text: known.suggestedChinese || meaning
      };
}

function cleanEnglishDefinition(item, analysis) {
  if (analysis?.definition && !analysis.definition.startsWith("Learn “")) return analysis.definition;
  const phrase = item.phrase || "this phrase";
  if (item.sentence) {
    return `In the source sentence, “${phrase}” should be understood as one complete expression. Use the surrounding words to confirm its exact meaning and tone.`;
  }
  return `A saved expression from your material. Learn “${phrase}” as one complete phrase, then confirm its exact meaning from the source context.`;
}

function renderPracticeHistory(entries = [], title = "Practice History") {
  return `
    <section class="practice-history">
      <div class="practice-history-head"><h3>${escapeHtml(title)}</h3><span>${entries.length}</span></div>
      ${entries.length ? `
        <div class="practice-history-list">
          ${entries.map((entry) => `
            <article>
              <p>${escapeHtml(entry.sentence || "")}</p>
              ${entry.corrected && entry.corrected !== entry.sentence ? `<small>${escapeHtml(entry.corrected)}</small>` : ""}
            </article>
          `).join("")}
        </div>
      ` : `<p class="small-note">No sentence practice yet.</p>`}
    </section>
  `;
}

function renderMistakes() {
  const filter = $("#mistakeFilter")?.value || "all";
  const mistakes = filter === "all" ? state.mistakes : state.mistakes.filter((mistake) => mistake.category === filter);
  const list = $("#mistakesList");

  if (!mistakes.length) {
    list.innerHTML = `<div class="detail-empty">No saved errors</div>`;
    return;
  }

  const activeError = mistakes.find((mistake) => mistake.id === activeErrorId) || null;
  if (activeView === "mistakes") latestFeedback = activeError?.latestFeedback || null;
  list.innerHTML = mistakes.map((mistake, index) => {
    const isOpen = mistake.id === activeErrorId;
    return `
      <article class="error-phrase ${mistake.mastered ? "is-mastered" : ""} ${isOpen ? "is-open" : ""}">
        <button class="error-phrase-row" type="button" data-open-error="${escapeAttribute(mistake.id)}" aria-expanded="${isOpen}">
          <span class="phrase-order">${String(index + 1).padStart(2, "0")}</span>
          <strong>${escapeHtml(mistake.phrase || "Saved sentence error")}</strong>
          <span class="pill ${mistake.category === "Grammar" ? "" : "amber"}">${escapeHtml(mistake.category)}</span>
          <i data-lucide="chevron-down"></i>
        </button>
        ${isOpen ? `<div class="error-phrase-detail">${renderErrorWorkspace(mistake)}</div>` : ""}
      </article>
    `;
  }).join("");

  $$('[data-open-error]', list).forEach((button) => {
    button.addEventListener("click", () => {
      const nextId = button.dataset.openError;
      activeErrorId = activeErrorId === nextId ? null : nextId;
      latestFeedback = state.mistakes.find((item) => item.id === nextId)?.latestFeedback || null;
      renderPreservingScroll(() => {
        renderMistakes();
        renderIcons();
      });
    });
  });

  $$('[data-voice-target]', list).forEach((button) => {
    button.addEventListener("click", () => startVoiceInput(button.dataset.voiceTarget, button.dataset.voiceLang, button));
  });
  bindSentencePracticeControls(list);

  $$('[data-toggle-mastered]', list).forEach((button) => {
    button.addEventListener("click", () => {
      const mistake = state.mistakes.find((item) => item.id === button.dataset.toggleMastered);
      if (mistake) mistake.mastered = !mistake.mastered;
      saveState();
      renderPreservingScroll(() => renderAll());
    });
  });

  $$('[data-delete-mistake]', list).forEach((button) => {
    button.addEventListener("click", () => {
      state.mistakes = state.mistakes.filter((item) => item.id !== button.dataset.deleteMistake);
      activeErrorId = null;
      saveState();
      renderPreservingScroll(() => renderAll());
      toast("Error deleted");
    });
  });
}

function renderErrorWorkspace(mistake) {
  return `
    ${renderPhraseKnowledge(mistake)}
    <section class="previous-sentences">
      <h3>Previous Sentences</h3>
      ${renderSentenceEntries(mistake.practiceHistory || [])}
    </section>
    <section class="saved-error-summary">
      <span>Why it is here</span>
      <p class="mistake-original">${escapeHtml(mistake.original || "")}</p>
      <p class="mistake-fixed">${escapeHtml(mistake.corrected || "")}</p>
      <small>${escapeHtml(mistake.note || "")}</small>
    </section>
    <section class="inline-sentence-practice practice-card more-practice-card">
      ${renderPracticeCard(mistake, {
        showErrorAction: false,
        heading: "More Practice",
        entries: mistake.morePractice || [],
        composerKey: `error:${mistake.id}`
      })}
    </section>
    <div class="detail-actions-row">
      <button class="secondary-button" type="button" data-toggle-mastered="${escapeAttribute(mistake.id)}"><i data-lucide="${mistake.mastered ? "undo-2" : "check"}"></i><span>${mistake.mastered ? "Restore" : "Mastered"}</span></button>
      <button class="ghost-button" type="button" data-delete-mistake="${escapeAttribute(mistake.id)}"><i data-lucide="trash-2"></i><span>Delete Error</span></button>
    </div>
  `;
}

function startVoiceInput(targetId, lang, button) {
  const target = button.closest(".voice-field")?.querySelector("input, textarea") || document.getElementById(targetId);
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
  if (lower.includes("stuck with it") || lower.includes("stick with it") || lower.includes("stuck with")) {
    return {
      keywords: ["continue", "persist", "not give up"],
      chineseKeywords: ["坚持", "继续", "没有放弃", "做"],
      suggestedChinese: "坚持做下去；没有放弃它",
      definition: "Continued doing or supporting something despite difficulty, doubt or inconvenience. It is used when someone does not give up.",
      range: "",
      collocations: "",
      warning: "",
      examples: []
    };
  }
  if (lower.includes("specific inspiring story")) {
    return {
      keywords: ["specific", "inspiring", "story"],
      chineseKeywords: ["具体", "鼓舞", "激励", "故事"],
      suggestedChinese: "一个具体而鼓舞人心的故事",
      definition: "A particular story that gives people encouragement, hope or motivation.",
      range: "",
      collocations: "",
      warning: "",
      examples: []
    };
  }
  if (lower.includes("falling more in love") || lower.includes("fall more in love")) {
    return {
      keywords: ["love", "deeper", "increasingly", "feelings"],
      chineseKeywords: ["爱", "感情", "越来越", "更深"],
      suggestedChinese: "越来越爱上；感情越来越深",
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
      chineseKeywords: ["困难", "吃力", "很难", "费劲"],
      suggestedChinese: "做某事很吃力；很难做到某事",
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
      chineseKeywords: ["沉迷", "越挖越深", "停不下来", "深入"],
      suggestedChinese: "越陷越深地研究或沉迷某个话题",
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
      chineseKeywords: ["关灯", "关掉", "灯"],
      suggestedChinese: "关灯；把灯关掉",
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
      chineseKeywords: ["发现自己", "不知不觉", "意识到"],
      suggestedChinese: "发现自己不知不觉处于某种状态或正在做某事",
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
      chineseKeywords: ["结果", "原来", "后来发现", "实际上"],
      suggestedChinese: "结果是；后来发现；原来",
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
    notes.push("Looks natural and complete.");
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
      if (!db.objectStoreNames.contains("video")) db.createObjectStore("video");
      if (!db.objectStoreNames.contains("cover")) db.createObjectStore("cover");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putFile(storeName, id, file) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(file, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getFile(storeName, id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function deleteFile(storeName, id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
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
