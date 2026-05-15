/* ============================================================ */
/* BLOCK START: 模块元信息与常量定义                              */
/* ============================================================ */

const AI_PET_NAME        = "AI桌宠系统";
const AI_PET_VERSION     = "1.0.0";
const AI_PET_KEY         = "ai_pets";
const AI_PET_STORAGE_KEY = "ai_pet_data_v1";

const BRANDS = {
  claude:   { label: "Claude",   color: "#D97757", avatarUrl: "PLACEHOLDER_CLAUDE_URL"   },
  gemini:   { label: "Gemini",   color: "#4285F4", avatarUrl: "PLACEHOLDER_GEMINI_URL"   },
  deepseek: { label: "DeepSeek", color: "#1A4B8C", avatarUrl: "PLACEHOLDER_DEEPSEEK_URL" },
  gpt:      { label: "GPT",      color: "#10A37F", avatarUrl: "PLACEHOLDER_GPT_URL"      },
};

const SKINS = {
  claude:   ["PLACEHOLDER_CLAUDE_SKIN0_URL",   "PLACEHOLDER_CLAUDE_SKIN1_URL"  ],
  gemini:   ["PLACEHOLDER_GEMINI_SKIN0_URL",   "PLACEHOLDER_GEMINI_SKIN1_URL"  ],
  deepseek: ["PLACEHOLDER_DEEPSEEK_SKIN0_URL", "PLACEHOLDER_DEEPSEEK_SKIN1_URL"],
  gpt:      ["PLACEHOLDER_GPT_SKIN0_URL",      "PLACEHOLDER_GPT_SKIN1_URL"     ],
};

const DEFAULT_DATA = {
  settings: {
    enabled:         true,
    mode:            "free",
    apiKeys:         [],
    currentKeyIndex: 0,
    model:           "",
    apiUrl:          "",
    messageTemplate: "{petName}这次和{charName}聊天消耗了{tokens}tk，用时{time}秒，第{floor}楼",
    logLevel:        "verbose",
  },
  pets: {
    slot1: null,
    slot2: null,
  },
  relationship: {
    affection: 0,
    events:    [],
  },
  globalStats: {
    totalTokens:       0,
    totalMessages:     0,
    totalResponseTime: 0,
    sessionTokens:     0,
  },
};

/* BLOCK END: 模块元信息与常量定义 */

/* ============================================================ */
/* BLOCK START: 日志系统                                         */
/* ============================================================ */

function log(msg, data) {
  try {
    const d = loadData();
    if (!d || d.settings?.logLevel === "verbose") {
      data !== undefined
        ? console.log(`[${AI_PET_NAME}] ${msg}`, data)
        : console.log(`[${AI_PET_NAME}] ${msg}`);
    }
  } catch (e) {
    console.log(`[${AI_PET_NAME}] ${msg}`);
  }
}

function logError(msg, err) {
  err !== undefined
    ? console.error(`[${AI_PET_NAME}][ERROR] ${msg}`, err)
    : console.error(`[${AI_PET_NAME}][ERROR] ${msg}`);
}

function logWarn(msg, data) {
  data !== undefined
    ? console.warn(`[${AI_PET_NAME}][WARN] ${msg}`, data)
    : console.warn(`[${AI_PET_NAME}][WARN] ${msg}`);
}

/* BLOCK END: 日志系统 */

/* ============================================================ */
/* BLOCK START: 数据持久化                                       */
/* ============================================================ */

/**
 * 双轨存储：优先用 extension_settings（ST原生持久化），
 * 同时写 localStorage 作为备份。读取时两者合并，extension_settings 优先。
 */
function loadData() {
  try {
    // 优先从 extension_settings 读
    if (typeof extension_settings !== "undefined" && extension_settings[AI_PET_KEY]) {
      return extension_settings[AI_PET_KEY];
    }
    // 回退到 localStorage
    const raw = localStorage.getItem(AI_PET_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    return null;
  } catch (e) {
    logError("loadData 失败", e);
    return null;
  }
}

function saveData(data) {
  try {
    // 写入 extension_settings（ST持久化）
    if (typeof extension_settings !== "undefined") {
      extension_settings[AI_PET_KEY] = data;
      if (typeof saveSettingsDebounced === "function") {
        saveSettingsDebounced();
      }
    }
    // 同时写 localStorage 备份
    localStorage.setItem(AI_PET_STORAGE_KEY, JSON.stringify(data));
    log("数据已保存");
  } catch (e) {
    logError("saveData 失败", e);
  }
}

function initData() {
  let data = loadData();
  if (!data) {
    data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    saveData(data);
    log("首次初始化默认数据");
  } else {
    let changed = false;
    if (!data.settings)     { data.settings     = JSON.parse(JSON.stringify(DEFAULT_DATA.settings));     changed = true; }
    if (!data.pets)         { data.pets         = JSON.parse(JSON.stringify(DEFAULT_DATA.pets));         changed = true; }
    if (!data.relationship) { data.relationship = JSON.parse(JSON.stringify(DEFAULT_DATA.relationship)); changed = true; }
    if (!data.globalStats)  { data.globalStats  = JSON.parse(JSON.stringify(DEFAULT_DATA.globalStats));  changed = true; }
    if (changed) saveData(data);
    log("已加载已有数据");
  }
  return data;
}

/* BLOCK END: 数据持久化 */

/* ============================================================ */
/* BLOCK START: Emoji按钮注入                                    */
/* ============================================================ */

function injectEmojiButton(messageId) {
  try {
    const msgEl = document.querySelector(`.mes[mesid="${messageId}"]`);
    if (!msgEl) {
      logWarn("injectEmojiButton: 找不到消息DOM", messageId);
      return;
    }

    // 避免重复注入
    if (msgEl.querySelector(".ai-pet-emoji-btn")) return;

    // 只注入AI消息
    if (msgEl.getAttribute("is_user") === "true") return;

    const btn = document.createElement("button");
    btn.className   = "ai-pet-emoji-btn";
    btn.title       = "打开AI桌宠";
    btn.textContent = "🐾";
    btn.setAttribute("aria-label", "打开AI桌宠面板");

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openPetWindow();
    });

    const target = msgEl.querySelector(".extraMesButtons")
                || msgEl.querySelector(".mes_buttons")
                || msgEl.querySelector(".mes_block")
                || msgEl;
    target.appendChild(btn);

    log("emoji按钮已注入到楼层", messageId);
  } catch (e) {
    logError("injectEmojiButton 失败", e);
  }
}

/* BLOCK END: Emoji按钮注入 */

/* ============================================================ */
/* BLOCK START: 拓麻歌子悬浮窗                                   */
/* ============================================================ */

let petWindowEl = null;
let isDragging  = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

function buildPetWindow() {
  if (petWindowEl) return;

  const el = document.createElement("div");
  el.id        = "ai-pet-window";
  el.className = "ai-pet-window hidden";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "AI桌宠系统");
  el.setAttribute("aria-modal", "true");

  el.innerHTML = `
    <div class="tama-shell">
      <div class="tama-top-bar">
        <span class="tama-top-dot"></span>
        <span class="tama-title-text">AI PET</span>
        <span class="tama-top-dot"></span>
      </div>

      <div class="tama-screen-bezel">
        <div class="tama-screen" id="ai-pet-screen">
          <div class="pet-screen-loading hidden" id="pet-loading">
            <div class="pet-loading-spinner"></div>
            <span>正在加载…</span>
          </div>
          <div class="pet-screen-error hidden" id="pet-error">
            <span class="pet-error-icon">⚠️</span>
            <span id="pet-error-msg">出错了</span>
          </div>
          <div id="pet-screen-content">
            <div class="pet-home-placeholder">
              <div class="pet-slot-row">
                <div class="pet-slot empty" id="pet-slot-1" data-slot="1">
                  <div class="pet-slot-inner">
                    <span class="pet-slot-plus">＋</span>
                    <span class="pet-slot-label">领养桌宠</span>
                  </div>
                </div>
                <div class="pet-slot empty" id="pet-slot-2" data-slot="2">
                  <div class="pet-slot-inner">
                    <span class="pet-slot-plus">＋</span>
                    <span class="pet-slot-label">领养桌宠</span>
                  </div>
                </div>
              </div>
              <div class="pet-stats-bar">
                <span id="pet-stat-tokens">🪙 0 tk</span>
                <span id="pet-stat-msgs">💬 0 条</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="tama-buttons">
        <button class="tama-btn" id="tama-btn-left"   aria-label="菜单"  title="菜单">◀</button>
        <button class="tama-btn tama-btn-center" id="tama-btn-center" aria-label="确认" title="确认">●</button>
        <button class="tama-btn" id="tama-btn-right"  aria-label="取消"  title="取消">▶</button>
      </div>

      <button class="tama-close-btn" id="tama-close" aria-label="关闭桌宠面板" title="关闭">✕</button>
    </div>
  `;

  document.body.appendChild(el);
  petWindowEl = el;

  el.querySelector("#tama-close").addEventListener("click", closePetWindow);
  el.querySelector("#tama-btn-left").addEventListener("click",   () => onTamaBtn("left"));
  el.querySelector("#tama-btn-center").addEventListener("click", () => onTamaBtn("center"));
  el.querySelector("#tama-btn-right").addEventListener("click",  () => onTamaBtn("right"));
  el.addEventListener("click", onPetWindowClick);

  bindDrag(el);
  log("拓麻歌子窗口已构建");
}

function onTamaBtn(btn) {
  log("拓麻歌子按钮点击", btn);
}

function onPetWindowClick(e) {
  const slot = e.target.closest(".pet-slot");
  if (slot) {
    const slotId = slot.dataset.slot;
    log("点击槽位", slotId);
    showToast(`槽位 ${slotId} — 桌宠功能将在 Phase 2 开放`);
  }
}

function openPetWindow() {
  try {
    if (!petWindowEl) buildPetWindow();
    petWindowEl.classList.remove("hidden");
    petWindowEl.classList.add("visible");
    refreshPetScreen();
    log("桌宠窗口已打开");
  } catch (e) {
    logError("openPetWindow 失败", e);
  }
}

function closePetWindow() {
  if (!petWindowEl) return;
  petWindowEl.classList.remove("visible");
  petWindowEl.classList.add("hidden");
  log("桌宠窗口已关闭");
}

function refreshPetScreen() {
  try {
    const data     = loadData();
    const gs       = data?.globalStats;
    const tokensEl = petWindowEl?.querySelector("#pet-stat-tokens");
    const msgsEl   = petWindowEl?.querySelector("#pet-stat-msgs");
    if (tokensEl && gs) tokensEl.textContent = `🪙 ${gs.totalTokens} tk`;
    if (msgsEl   && gs) msgsEl.textContent   = `💬 ${gs.totalMessages} 条`;
  } catch (e) {
    logError("refreshPetScreen 失败", e);
  }
}

function bindDrag(el) {
  const shell = el.querySelector(".tama-shell");
  if (!shell) return;

  shell.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    isDragging  = true;
    dragOffsetX = e.clientX - el.getBoundingClientRect().left;
    dragOffsetY = e.clientY - el.getBoundingClientRect().top;
    el.style.transition = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const x    = e.clientX - dragOffsetX;
    const y    = e.clientY - dragOffsetY;
    const maxX = window.innerWidth  - el.offsetWidth;
    const maxY = window.innerHeight - el.offsetHeight;
    el.style.left   = `${Math.max(0, Math.min(x, maxX))}px`;
    el.style.top    = `${Math.max(0, Math.min(y, maxY))}px`;
    el.style.right  = "auto";
    el.style.bottom = "auto";
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging          = false;
      el.style.transition = "";
    }
  });
}

/* BLOCK END: 拓麻歌子悬浮窗 */

/* ============================================================ */
/* BLOCK START: Toast提示系统                                    */
/* ============================================================ */

let toastTimer = null;

function showToast(msg, type = "info", duration = 3000) {
  try {
    let toast = document.getElementById("ai-pet-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id        = "ai-pet-toast";
      toast.className = "ai-pet-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className   = `ai-pet-toast ai-pet-toast--${type} visible`;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), duration);
  } catch (e) {
    logError("showToast 失败", e);
  }
}

function showLoading(show) {
  const el = document.getElementById("pet-loading");
  if (!el) return;
  show ? el.classList.remove("hidden") : el.classList.add("hidden");
}

function showScreenError(msg) {
  const el    = document.getElementById("pet-error");
  const msgEl = document.getElementById("pet-error-msg");
  if (!el) return;
  if (msgEl) msgEl.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4000);
}

/* BLOCK END: Toast提示系统 */

/* ============================================================ */
/* BLOCK START: 设置面板联动                                     */
/* ============================================================ */

function refreshSettingsStats(data) {
  try {
    if (!data) data = loadData();
    const gs = data?.globalStats;
    if (!gs) return;

    const avgTime = gs.totalMessages > 0
      ? (gs.totalResponseTime / gs.totalMessages).toFixed(1)
      : 0;

    const q = (id) => document.getElementById(id);
    if (q("settings-total-tokens"))   q("settings-total-tokens").textContent   = gs.totalTokens;
    if (q("settings-total-msgs"))     q("settings-total-msgs").textContent     = gs.totalMessages;
    if (q("settings-avg-time"))       q("settings-avg-time").textContent       = `${avgTime}s`;
    if (q("settings-session-tokens")) q("settings-session-tokens").textContent = gs.sessionTokens;
  } catch (e) {
    logError("refreshSettingsStats 失败", e);
  }
}

function bindSettingsPanel() {
  try {
    const data = loadData();
    if (!data) {
      logWarn("bindSettingsPanel: 数据未就绪");
      return;
    }
    const s = data.settings;

    const enabledToggle = document.getElementById("ai-pet-enabled");
    if (enabledToggle) {
      enabledToggle.checked = s.enabled;
      enabledToggle.addEventListener("change", () => {
        const d = loadData();
        d.settings.enabled = enabledToggle.checked;
        saveData(d);
        showToast(d.settings.enabled ? "✅ AI桌宠已启用" : "⏸️ AI桌宠已停用");
      });
    }

    const modeSelect = document.getElementById("ai-pet-mode");
    if (modeSelect) {
      modeSelect.value = s.mode;
      modeSelect.addEventListener("change", () => {
        const d = loadData();
        d.settings.mode = modeSelect.value;
        saveData(d);
        showToast(`已切换到${d.settings.mode === "free" ? "🆓 免费" : "🔑 API"}模式`);
      });
    }

    const logLevel = document.getElementById("ai-pet-log-level");
    if (logLevel) {
      logLevel.value = s.logLevel;
      logLevel.addEventListener("change", () => {
        const d = loadData();
        d.settings.logLevel = logLevel.value;
        saveData(d);
      });
    }

    const templateInput      = document.getElementById("ai-pet-msg-template");
    const templateSaveBtn    = document.getElementById("ai-pet-template-save");
    const templateSaveResult = document.getElementById("ai-pet-template-save-result");
    if (templateInput) templateInput.value = s.messageTemplate;
    if (templateSaveBtn) {
      templateSaveBtn.addEventListener("click", () => {
        const d = loadData();
        d.settings.messageTemplate = templateInput?.value?.trim()
          || DEFAULT_DATA.settings.messageTemplate;
        saveData(d);
        if (templateSaveResult) {
          templateSaveResult.textContent = "✅ 已保存";
          setTimeout(() => { templateSaveResult.textContent = ""; }, 2000);
        }
        showToast("消息模板已保存");
      });
    }

    const exportBtn = document.getElementById("ai-pet-export");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        try {
          const d    = loadData();
          const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
          const url  = URL.createObjectURL(blob);
          const a    = document.createElement("a");
          a.href     = url;
          a.download = `ai-pet-data-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
          showToast("📤 数据已导出");
        } catch (e) {
          logError("导出数据失败", e);
          showToast("导出失败", "error");
        }
      });
    }

    const clearBtn = document.getElementById("ai-pet-clear-all");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (!confirm("⚠️ 确定要清空所有桌宠数据吗？此操作不可撤销！")) return;
        const fresh = JSON.parse(JSON.stringify(DEFAULT_DATA));
        saveData(fresh);
        refreshSettingsStats(fresh);
        showToast("🗑️ 数据已清空", "warn");
      });
    }

    refreshSettingsStats(data);
    log("设置面板已绑定");
  } catch (e) {
    logError("bindSettingsPanel 失败", e);
  }
}

/* BLOCK END: 设置面板联动 */
/* ============================================================ */
/* BLOCK START: ST事件监听                                       */
/* ============================================================ */

let lastMessageMeta = {
  tokens:       0,
  responseTime: 0,
  floor:        0,
  charName:     "",
};
let _msgStartTime = 0;

function onMessageSent(messageId) {
  _msgStartTime = Date.now();
  log("消息发送，开始计时", messageId);
}

function onMessageReceived(messageId) {
  try {
    const data = loadData();
    if (!data?.settings?.enabled) return;

    const elapsed = _msgStartTime
      ? ((Date.now() - _msgStartTime) / 1000).toFixed(1)
      : 0;
    _msgStartTime = 0;

    const ctx  = (typeof getContext === "function") ? getContext() : null;
    const chat = ctx?.chat || [];
    const msg  = chat[messageId];

    lastMessageMeta = {
      tokens:       msg?.extra?.token_count || 0,
      responseTime: elapsed,
      floor:        messageId,
      charName:     msg?.name || ctx?.name2 || "",
    };

    data.globalStats.totalMessages     += 1;
    data.globalStats.totalTokens       += lastMessageMeta.tokens;
    data.globalStats.totalResponseTime += parseFloat(elapsed);
    data.globalStats.sessionTokens     += lastMessageMeta.tokens;
    saveData(data);

    log("收到消息", lastMessageMeta);

    setTimeout(() => injectEmojiButton(messageId), 100);
    refreshSettingsStats(data);

  } catch (e) {
    logError("onMessageReceived 处理失败", e);
  }
}

function onCharacterMessageRendered(messageId) {
  setTimeout(() => injectEmojiButton(messageId), 50);
}

function bindSTEvents() {
  // 轮询等待 eventSource 就绪，最多等 30 秒
  let attempts    = 0;
  const maxAttempts = 300; // 300 * 100ms = 30s

  const tryBind = () => {
    attempts++;

    if (typeof eventSource === "undefined" || typeof event_types === "undefined") {
      if (attempts >= maxAttempts) {
        logError("等待 eventSource 超时，事件监听未能绑定");
        return;
      }
      setTimeout(tryBind, 100);
      return;
    }

    // eventSource 就绪，绑定事件
    try {
      eventSource.on(event_types.MESSAGE_SENT,     onMessageSent);
      eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);

      if (event_types.CHARACTER_MESSAGE_RENDERED) {
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onCharacterMessageRendered);
      }

      log(`ST事件监听已绑定（等待了 ${attempts * 100}ms）`);
    } catch (e) {
      logError("ST事件绑定失败", e);
    }
  };

  tryBind();
}

/* BLOCK END: ST事件监听 */

/* ============================================================ */
/* BLOCK START: 插件入口与初始化                                  */
/* ============================================================ */

(function initAiPet() {
  try {
    console.log(`[${AI_PET_NAME}] v${AI_PET_VERSION} 正在初始化…`);

    // 1. 初始化数据（localStorage 随时可用）
    initData();

    // 2. 绑定 ST 事件（内部轮询等待 eventSource 就绪）
    bindSTEvents();

    // 3. 绑定设置面板 & 构建悬浮窗
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        bindSettingsPanel();
        buildPetWindow();
      });
    } else {
      bindSettingsPanel();
      buildPetWindow();
    }

    console.log(`[${AI_PET_NAME}] 初始化完成 ✓`);
  } catch (e) {
    console.error(`[${AI_PET_NAME}][ERROR] 插件初始化失败`, e);
  }
})();

/* BLOCK END: 插件入口与初始化 */
