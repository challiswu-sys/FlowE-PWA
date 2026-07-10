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

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", () => {
  registerServiceWorker();
  bindNavigation();
  bindForms();
  bindActions();
  switchView(initialView());
  renderAll();
  renderIcons();
});

function initialView() {
  const hashView = window.location.hash.replace("#", "");
  return hashView && $(`[data-view="${hashView}"]`) ? hashView : "materials";
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
        attempts: parsed.attempts || []
      });
    } catch (error) {
      console.warn("Failed to parse saved state", error);
    }
  }

  return normalizeState({
    materials: [],
    chunks: [],
    mistakes: [],
    attempts: []
  });
}

function normalizeState(nextState) {
  const materials = (nextState.materials || []).filter((item) => !BLOCKED_PUBLIC_MATERIAL_IDS.has(item.id));
  const blockedSourceIds = new Set([...BLOCKED_PUBLIC_MATERIAL_IDS]);

  return {
    materials,
    chunks: (nextState.chunks || []).filter((chunk) => !blockedSourceIds.has(chunk.sourceMaterialId)),
    mistakes: (nextState.mistakes || []).filter((mistake) => !blockedSourceIds.has(mistake.sourceMaterialId)),
    attempts: nextState.attempts || []
  };
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
  window.history.replaceState(null, "", `#${view}`);
  renderAll();
}

function bindForms() {
  $("#transcriptInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    $("#transcriptText").value = await file.text();
    toast("文稿已读取");
  });

  $("#materialForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = $("#materialTitle").value.trim();
    const source = $("#materialSource").value.trim();
    const audioFile = $("#audioInput").files?.[0] || null;
    const transcript = $("#transcriptText").value.trim();

    if (!title || !transcript) {
      toast("请填写标题和 transcript");
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
    toast("素材已保存");
  });
}

function bindActions() {
  $("#chunkFilter").addEventListener("change", renderChunks);
  $("#mistakeFilter").addEventListener("change", renderMistakes);

  $("#clearCompletedButton").addEventListener("click", () => {
    state.mistakes = state.mistakes.filter((mistake) => !mistake.mastered);
    saveState();
    renderAll();
    toast("已归档掌握项");
  });

  $("#exportButton").addEventListener("click", exportData);

  $("#backupInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      state = normalizeState({
        materials: imported.materials || [],
        chunks: imported.chunks || [],
        mistakes: imported.mistakes || [],
        attempts: imported.attempts || []
      });
      activeMaterialId = state.materials[0]?.id || null;
      activeChunkId = state.chunks[0]?.id || null;
      currentAnalysis = null;
      latestFeedback = null;
      saveState();
      renderAll();
      toast("备份已导入");
    } catch (error) {
      toast("备份文件无法读取");
    }
    event.target.value = "";
  });
}

function renderAll() {
  renderStats();
  renderMaterials();
  renderChunks();
  renderMistakes();
  renderIcons();
}

function renderStats() {
  $("#materialCount").textContent = state.materials.length;
  $("#chunkCount").textContent = state.chunks.length;
  $("#mistakeCount").textContent = state.mistakes.filter((item) => !item.mastered).length;
}

function renderIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function renderMaterials() {
  const list = $("#materialsList");
  if (!state.materials.length) {
    list.innerHTML = `<div class="detail-empty compact-empty">暂无素材</div>`;
    $("#materialDetail").innerHTML = `<div class="detail-empty">导入素材后开始练习</div>`;
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
          <p class="small-note">${material.segments?.length || 0} 句 · ${formatDate(material.createdAt)}</p>
          <div class="card-actions">
            <button class="secondary-button" type="button" data-select-material="${material.id}">
              <i data-lucide="play"></i>
              <span>打开</span>
            </button>
            <button class="ghost-button" type="button" data-delete-material="${material.id}">删除</button>
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
      toast("素材已删除");
    });
  });

  renderMaterialDetail();
}

async function renderMaterialDetail() {
  const container = $("#materialDetail");
  const material = state.materials.find((item) => item.id === activeMaterialId);
  if (!material) return;

  const sourceLink = material.source
    ? `<a class="ghost-button" href="${escapeAttribute(material.source)}" target="_blank" rel="noreferrer">来源</a>`
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
              <button class="mini-button" type="button" data-play-segment="${index}" aria-label="播放该句">
                <i data-lucide="play"></i>
              </button>
            </article>
          `
        )
        .join("")
    : `<div class="detail-empty compact-empty">字幕正在载入</div>`;

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
            <h3>抓取词伙</h3>
            <p>听到重要表达后，直接说出来。</p>
          </div>
        </div>
        <label>
          <span>英文词伙</span>
          <div class="voice-field">
            <input id="capturePhrase" type="text" placeholder="例如：falling more in love" value="${escapeAttribute(currentAnalysis?.phrase || "")}">
            <button class="icon-button voice-button" type="button" data-voice-target="capturePhrase" data-voice-lang="en-US" aria-label="语音输入英文词伙" title="语音输入英文词伙">
              <i data-lucide="mic"></i>
            </button>
          </div>
        </label>
        <label>
          <span>我的中文理解</span>
          <div class="voice-field">
            <textarea id="captureMeaning" rows="3" placeholder="例如：越来越爱上某个人，感情更深了">${escapeHtml(currentAnalysis?.meaning || "")}</textarea>
            <button class="icon-button voice-button" type="button" data-voice-target="captureMeaning" data-voice-lang="zh-CN" aria-label="语音输入中文理解" title="语音输入中文理解">
              <i data-lucide="mic"></i>
            </button>
          </div>
        </label>
        <input id="captureSourceSentence" type="hidden" value="${escapeAttribute(currentAnalysis?.sentence || "")}">
        <button class="primary-button" type="button" id="analyzeChunkButton">
          <i data-lucide="sparkles"></i>
          <span>分析这个词伙</span>
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
          <h2>逐句文稿</h2>
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
    audio.insertAdjacentHTML("afterend", `<p class="small-note">这个素材暂未保存音频，可以继续用文稿练习。</p>`);
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
      toast("请先输入词伙和中文理解");
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
      tag: "听力高频",
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
      toast("已选中来源句");
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
          <h3>理解词伙</h3>
          <p>分析后会看到中文理解是否准确、含义和使用范围。</p>
        </div>
      </div>
      <div class="detail-empty compact-empty">等待分析</div>
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
        <span>完整含义</span>
        <p>${escapeHtml(analysis.definition)}</p>
      </article>
      <article>
        <span>使用范围</span>
        <p>${escapeHtml(analysis.range)}</p>
      </article>
      <article>
        <span>常见搭配</span>
        <p>${escapeHtml(analysis.collocations)}</p>
      </article>
      <article>
        <span>常见误区</span>
        <p>${escapeHtml(analysis.warning)}</p>
      </article>
    </div>
    <div class="example-stack">
      ${analysis.examples.map((example) => `<p>${escapeHtml(example)}</p>`).join("")}
    </div>
    <button class="primary-button" type="button" id="saveChunkButton">
      <i data-lucide="bookmark-plus"></i>
      <span>保存到词伙库</span>
    </button>
  `;
}

function renderPracticeCard(chunk) {
  if (!chunk) {
    return `
      <div class="step-heading">
        <span class="step-number">3</span>
        <div>
          <h3>用它造句</h3>
          <p>保存词伙后，用语音说一句自己的英文句子。</p>
        </div>
      </div>
      <div class="detail-empty compact-empty">等待词伙</div>
    `;
  }

  return `
    <div class="step-heading">
      <span class="step-number">3</span>
      <div>
        <h3>用它造句</h3>
        <p>目标词伙：${escapeHtml(chunk.phrase)}</p>
      </div>
    </div>
    <label>
      <span>我的英文句子</span>
      <div class="voice-field">
        <textarea id="practiceSentence" rows="4" placeholder="说一句和你自己有关的英文句子"></textarea>
        <button class="icon-button voice-button" type="button" data-voice-target="practiceSentence" data-voice-lang="en-US" aria-label="语音输入英文句子" title="语音输入英文句子">
          <i data-lucide="mic"></i>
        </button>
      </div>
    </label>
    <div class="button-row">
      <button class="primary-button" type="button" id="checkSentenceButton">
        <i data-lucide="check-circle-2"></i>
        <span>检查语法和自然度</span>
      </button>
      <button class="secondary-button" type="button" id="saveMistakeButton">
        <i data-lucide="bookmark-plus"></i>
        <span>加入错题本</span>
      </button>
    </div>
    <div id="practiceFeedback" class="feedback-area compact-feedback">
      ${latestFeedback ? feedbackMarkup(latestFeedback) : ""}
    </div>
  `;
}

function saveCurrentChunk() {
  if (!currentAnalysis) return;

  const exists = state.chunks.some(
    (chunk) => chunk.phrase.toLowerCase() === currentAnalysis.phrase.toLowerCase() && chunk.sourceMaterialId === currentAnalysis.materialId
  );

  if (exists) {
    toast("这个词伙已保存");
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
  toast("词伙已保存，可以造句");
}

function checkPracticeSentence() {
  const sentence = $("#practiceSentence")?.value.trim();
  const chunk = getActivePracticeChunk();

  if (!chunk) {
    toast("先保存或分析一个词伙");
    return;
  }
  if (!sentence) {
    toast("先说或输入一句英文");
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
  $("#practiceFeedback").innerHTML = feedbackMarkup(latestFeedback);
  renderIcons();
}

function getActivePracticeChunk() {
  return state.chunks.find((chunk) => chunk.id === activeChunkId) || currentAnalysis;
}

function feedbackMarkup(feedback) {
  return `
    <article class="feedback-card">
      <h3><i data-lucide="sparkles"></i> 更自然版本</h3>
      <div class="corrected-box">${escapeHtml(feedback.corrected)}</div>
    </article>
    <article class="feedback-card">
      <h3><i data-lucide="scan-search"></i> 检查结果</h3>
      ${feedback.notes.map((note) => `<p class="small-note">${escapeHtml(note)}</p>`).join("")}
    </article>
    <article class="feedback-card">
      <h3><i data-lucide="target"></i> 训练重点</h3>
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
  toast("已加入错题本");
}

function renderChunks() {
  const filter = $("#chunkFilter")?.value || "all";
  const chunks = filter === "all" ? state.chunks : state.chunks.filter((chunk) => chunk.tag === filter);
  const list = $("#chunksList");

  if (!chunks.length) {
    list.innerHTML = `<div class="detail-empty">暂无词伙</div>`;
    return;
  }

  list.innerHTML = chunks
    .map(
      (chunk) => `
        <article class="chunk-item">
          <div class="item-topline">
            <p class="chunk-phrase">${escapeHtml(chunk.phrase)}</p>
            <span class="tag">${escapeHtml(chunk.tag || "未分类")}</span>
          </div>
          <p class="muted-text">${escapeHtml(chunk.meaning || "未填写意思")}</p>
          ${chunk.analysis?.definition ? `<p class="chunk-sentence">${escapeHtml(chunk.analysis.definition)}</p>` : ""}
          ${chunk.sentence ? `<p class="small-note">原句：${escapeHtml(chunk.sentence)}</p>` : ""}
          <div class="card-actions">
            <button class="secondary-button" type="button" data-practice-chunk="${chunk.id}">
              <i data-lucide="pen-line"></i>
              <span>回到素材练习</span>
            </button>
            <button class="ghost-button" type="button" data-delete-chunk="${chunk.id}">删除</button>
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
      toast("词伙已删除");
    });
  });
}

function renderMistakes() {
  const filter = $("#mistakeFilter")?.value || "all";
  const mistakes = filter === "all" ? state.mistakes : state.mistakes.filter((mistake) => mistake.category === filter);
  const list = $("#mistakesList");

  if (!mistakes.length) {
    list.innerHTML = `<div class="detail-empty">暂无错题</div>`;
    return;
  }

  list.innerHTML = mistakes
    .map(
      (mistake) => `
        <article class="mistake-item ${mistake.mastered ? "is-mastered" : ""}">
          <div class="item-topline">
            <span class="pill ${mistake.category === "语法" ? "" : "amber"}">${escapeHtml(mistake.category)}</span>
            <span class="small-note">${formatDate(mistake.createdAt)}</span>
          </div>
          <p class="mistake-original">原句：${escapeHtml(mistake.original)}</p>
          <p class="mistake-fixed">修正：${escapeHtml(mistake.corrected)}</p>
          <p class="small-note">${escapeHtml(mistake.note || "")}</p>
          <div class="card-actions">
            <button class="secondary-button" type="button" data-toggle-mastered="${mistake.id}">
              <i data-lucide="${mistake.mastered ? "undo-2" : "check"}"></i>
              <span>${mistake.mastered ? "恢复" : "已掌握"}</span>
            </button>
            <button class="ghost-button" type="button" data-delete-mistake="${mistake.id}">删除</button>
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
      toast("错题已删除");
    });
  });
}

function startVoiceInput(targetId, lang, button) {
  const target = document.getElementById(targetId);
  if (!target) return;

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    target.focus();
    toast("当前环境不支持网页语音识别，可用键盘听写");
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
  toast("正在听...");

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
    toast("语音识别未成功，可用键盘听写");
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
    definition: `“${phrase}” 可以先作为一个整体表达记忆，重点观察它在原句里连接了哪些动作、对象和语气。`,
    range: "当前版本会根据原句给出初步分析；接入 AI 后可以进一步判断语域、隐含语气和更自然的替换表达。",
    collocations: "把前后的动词、介词和宾语一起记，避免只记单个单词。",
    warning: "不要直接逐词翻译成中文后再拼回英文，要保留它在原句里的搭配结构。",
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
      keywords: ["爱", "更深", "越来越", "感情"],
      definition: "表示爱意或情感正在加深，常见于亲密关系或带有浪漫色彩的叙事。",
      range: "偏口语、叙事和情感表达。通常用于人，也可以有意识地夸张地用于事物或兴趣。",
      collocations: "feel yourself falling more in love, find yourself falling more in love, keep falling more in love",
      warning: "不要说 become more love。对象通常接 with someone，而不是 to someone。",
      examples: [
        "I found myself falling more in love with her every day.",
        "The more we talked, the more I felt myself falling for him."
      ]
    };
  }
  if (lower.includes("have a hard time")) {
    return {
      keywords: ["困难", "吃力", "很难"],
      definition: "表示做某事很吃力、遇到困难，后面通常接 doing。",
      range: "口语和写作都常见，比 very difficult for me 更自然、更轻松。",
      collocations: "have a hard time doing, have a hard time with something",
      warning: "不要说 I am difficult to do something。可以说 I have a hard time doing something。",
      examples: [
        "I have a hard time understanding fast native speakers.",
        "She had a hard time adjusting to the new schedule."
      ]
    };
  }
  if (lower.includes("rabbit hole")) {
    return {
      keywords: ["陷入", "越聊越深", "停不下来"],
      definition: "表示进入一个越挖越深、越聊越多、很难停下来的话题或思绪。",
      range: "口语、网络语境和叙事里常见，可以用于故事、研究、视频、兴趣。",
      collocations: "fall into a rabbit hole, go down a rabbit hole, a rabbit hole of stories",
      warning: "不是字面上的兔子洞，重点是“越陷越深”的感觉。",
      examples: [
        "I went down a rabbit hole of old interviews.",
        "We fell into a rabbit hole of childhood stories."
      ]
    };
  }
  if (lower.includes("turn off the lights")) {
    return {
      keywords: ["关灯"],
      definition: "表示关灯，是非常日常、自然的动作表达。",
      range: "日常口语最常见，也可用于叙事描述。",
      collocations: "turn off the lights, turn the lights off, before we turned off the lights",
      warning: "lights 通常用复数；turn off 是可分短语动词。",
      examples: [
        "Before we turned off the lights, we talked for a while.",
        "Could you turn the lights off?"
      ]
    };
  }
  if (lower.includes("find yourself")) {
    return {
      keywords: ["发现自己", "不知不觉"],
      definition: "表示不知不觉处在某种状态或开始做某事。",
      range: "叙事和表达心理变化时很自然，后面常接 doing 或介词短语。",
      collocations: "find yourself doing, find yourself in, suddenly find yourself",
      warning: "这里的 find 不是寻找，而是“发现自己处于某状态”。",
      examples: [
        "I found myself thinking about that sentence all day.",
        "You may find yourself using the phrase naturally."
      ]
    };
  }
  if (lower.includes("it turns out")) {
    return {
      keywords: ["结果", "原来", "事实证明"],
      definition: "用来引出后来发现的事实、结果或转折。",
      range: "口语和写作都常见，适合讲故事、解释原因、纠正预期。",
      collocations: "it turns out that, as it turns out, turned out to be",
      warning: "不要和 turn out the light 混淆；这里 turn out 表示结果是。",
      examples: [
        "It turns out that I was focusing on the wrong problem.",
        "The meeting turned out to be useful."
      ]
    };
  }
  return null;
}

function reviewMeaning(meaning, known) {
  if (!meaning.trim()) return "请先写下或说出你的中文理解。";
  if (!known) return "你的中文理解已记录；当前版本会先给出基于原句的初步判断。";
  const hit = known.keywords.some((keyword) => meaning.includes(keyword));
  return hit ? "你的中文理解基本准确。" : "你的中文理解可能还不完整，可以再对照完整含义调整。";
}

function analyseSentence(sentence, chunk) {
  const notes = [];
  let corrected = sentence.trim();
  let focus = "保留目标词伙，下一次换一个更贴近你生活的场景再说一遍。";

  if (!/[.!?]$/.test(corrected)) {
    corrected += ".";
    notes.push("句末建议加标点，让完整句更稳定。");
  }

  if (/\bi\b/.test(corrected)) {
    corrected = corrected.replace(/\bi\b/g, "I");
    notes.push("英文里的第一人称 I 需要大写。");
  }

  if (/I am difficult to/i.test(corrected)) {
    corrected = corrected.replace(/I am difficult to/i, "I find it difficult to");
    notes.push("表达“我觉得难”时，不说 I am difficult to...，可以说 I find it difficult to...");
    focus = "练习 I find it difficult to... / I have difficulty doing...";
  }

  if (/listen music/i.test(corrected)) {
    corrected = corrected.replace(/listen music/gi, "listen to music");
    notes.push("listen 后面接宾语时通常需要 to。");
    focus = "留意动词后面的固定介词。";
  }

  if (/different with/i.test(corrected)) {
    corrected = corrected.replace(/different with/gi, "different from");
    notes.push("different from 比 different with 更自然。");
    focus = "把形容词和介词当作一个整体记忆。";
  }

  if (/discuss about/i.test(corrected)) {
    corrected = corrected.replace(/discuss about/gi, "discuss");
    notes.push("discuss 是及物动词，后面直接接讨论对象。");
    focus = "注意中文里有“关于”，英文里不一定需要 about。";
  }

  const usedChunk = chunkLooksUsed(corrected, chunk.phrase);
  if (!usedChunk) {
    notes.push(`这句话里没有明显用到目标词伙：${chunk.phrase}`);
    focus = "先把目标词伙放进句子，再调整语法和语气。";
  }

  if (chunk.analysis?.range && /english|work|study|project/i.test(corrected) && /love/i.test(chunk.phrase)) {
    notes.push("这个词伙带浪漫或强情感色彩，用在人以外的对象时会显得夸张，可以有意识地作为幽默或强调。");
    focus = "注意词伙的使用范围，不只看字面意思。";
  }

  if (notes.length === 0) {
    notes.push("基础检查没有发现明显问题。下一步接 AI 后可以继续检查语气、自然度和更地道说法。");
  }

  return {
    original: sentence,
    corrected,
    notes,
    focus,
    category: usedChunk ? "语法" : "搭配"
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
    toast("这个素材还没有音频");
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
  link.download = `englishflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast("数据已导出");
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
  return new Intl.DateTimeFormat("zh-CN", {
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
