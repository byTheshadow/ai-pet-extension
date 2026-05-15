/* ============================================================ */
/* BLOCK START: 模块元信息与常量定义                              */
/* ============================================================ */

const AI_PET_NAME    = "AI桌宠系统";
const AI_PET_VERSION = "1.0.0";
const AI_PET_KEY     = "ai_pets";

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

const DEFAULT_SETTINGS = {
  settings: {
    enabled:         true,
    mode:            "free",
    apiKeys:         [],
    currentKeyIndex: 0,
    model:           "",
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
  const settings = getAiPetSettings();
  if (!settings || settings.logLevel === "verbose") {
    if (data !== undefined) {
      console.log(`[${AI_PET_NAME}] ${msg}`, data);
    } else {
      console.log(`[${AI_PET_NAME}] ${msg}`);
    }
  }
}

function logError(msg, err) {
  if (err !== undefined) {
    console.error(`[${AI_PET_NAME}][ERROR] ${msg}`, err);
  } else {
    console.error(`[${AI_PET_NAME}][ERROR] ${msg}`);
  }
}

function logWarn(msg, data) {
  if (data !== undefined) {
    console.warn(`[${AI_PET_NAME}][WARN] ${msg}`, data);
  } else {
    console.warn(`[${AI_PET_NAME}][WARN] ${msg}`);
  }
}

/* BLOCK END: 日志系统 */

/* ============================================================ */
/* BLOCK START: 数据持久化与初始化                               */
/* ============================================================ */

function getAiPetSettings() {
  try {
    return extension_settings[AI_PET_KEY] || null;
  } catch (e) {
    return null;
  }
}

function initSettings() {
  if (!extension_settings[AI_PET_KEY]) {
    extension_settings[AI_PET_KEY] = structuredClone(DEFAULT_SETTINGS);
    log("首次初始化默认设置");
  } else {
    // 补全缺失字段（版本升级兼容）
    const s = extension_settings[AI_PET_KEY];
    if (!s.settings)      s.settings      = structuredClone(DEFAULT_SETTINGS.settings);
    if (!s.pets)          s.pets          = structuredClone(DEFAULT_SETTINGS.pets);
    if (!s.relationship)  s.relationship  = structuredClone(DEFAULT_SETTINGS.relationship);
    if (!s.globalStats)   s.globalStats   = structuredClone(DEFAULT_SETTINGS.globalStats);
    log("已加载已有设置，缺失字段已补全");
  }
  saveSettingsDebounced();
}

function saveData() {
  try {
    saveSettingsDebounced();
    log("数据已保存");
  } catch (e) {
    logError("保存数据失败", e);
  }
}

/* BLOCK END: 数据持久化与初始化 */

/* ============================================================ */
/* BLOCK START: ST事件监听                                       */
/* ============================================================ */

// 记录最后一条消息的元数据，供桌宠台词使用
let lastMessageMeta = {
  tokens:       0,
  responseTime: 0,
  floor:        0,
  charName:     "",
};

let _msgStartTime = 0;

function onMessageSending() {
  _msgStartTime = Date.now();
  log("消息发送中，开始计时");
}

function onMessageReceived(messageId) {
  try {
    const elapsed = _msgStartTime ? ((Date.now() - _msgStartTime) / 1000).toFixed(1) : 0;
    _msgStartTime = 0;

    const context = getContext();
    const chat    = context?.chat || [];
    const msg     = chat[messageId];

    if (!msg) {
      logWarn("onMessageReceived: 找不到消息", messageId);
      return;
    }

    // 更新最后消息元数据
    lastMessageMeta = {
      tokens:       msg.extra?.token_count || 0,
      responseTime: elapsed,
      floor:        messageId,
      charName:     msg.name || "",
    };

    // 更新全局统计
    const gs = extension_settings[AI_PET_KEY].globalStats;
    gs.totalMessages     += 1;
    gs.totalTokens       += lastMessageMeta.tokens;
    gs.totalResponseTime += parseFloat(elapsed);
    gs.sessionTokens     += lastMessageMeta.tokens;
    saveData();

    log("收到消息", lastMessageMeta);

    // 注入emoji按钮到最后一条AI消息
    injectEmojiButton(messageId);

  } catch (e) {
    logError("onMessageReceived 处理失败", e);
  }
}

function bindSTEvents() {
  try {
    eventSource.on(event_types.MESSAGE_SENT,     onMessageSending);
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    log("ST事件监听已绑定");
  } catch (e) {
    logError("ST事件绑定失败", e);
  }
}

/* BLOCK END: ST事件监听 */

/* ============================================================ */
/* BLOCK START: Emoji按钮注入                                    */
/* ============================================================ */

function injectEmojiButton(messageId) {
  try {
    // 找到对应楼层的消息DOM
    const msgEl = document.querySelector(
      `.mes[mesid="${messageId}"]`
    );
    if (!msgEl) {
      logWarn("injectEmojiButton: 找不到消息DOM", messageId);
      return;
    }

    // 避免重复注入
    if (msgEl.querySelector(".ai-pet-emoji-btn")) return;

    const btn = document.createElement("button");
    btn.className   = "ai-pet-emoji-btn";
    btn.title       = "打开AI桌宠";
    btn.textContent = "🐾";
    btn.setAttribute("aria-label", "打开AI桌宠面板");

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openPetWindow();
    });

    // 注入到消息框右下角
    const extraBtns = msgEl.querySelector(".extraMesButtons")
                   || msgEl.querySelector(".mes_buttons")
                   || msgEl;
    extraBtns.appendChild(btn);

    log("emoji按钮已注入到楼层", messageId);
  } catch (e) {
    logError("injectEmojiButton 失败", e);
  }
}

/* BLOCK END: Emoji按钮注入 */

/* ============================================================ */
/* BLOCK START: 拓麻歌子悬浮窗                                   */
/* ============================================================ */

let petWindowEl   = null;
let isDragging    = false;
let dragOffsetX   = 0;
let dragOffsetY   = 0;
let currentScreen = "home"; // home | select | manage | stats

function buildPetWindow() {
  if (petWindowEl) return;

  const el = document.createElement("div");
  el.id        = "ai-pet-window";
  el.className = "ai-pet-window";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "AI桌宠系统");
  el.setAttribute("aria-modal", "true");

  el.innerHTML = `
    <!-- 拓麻歌子外壳 -->
    <div class="tama-shell">

      <!-- 顶部装饰条 -->
      <div class="tama-top-bar">
        <span class="tama-top-dot"></span>
        <span class="tama-title-text">AI PET</span>
        <span class="tama-top-dot"></span>
      </div>

      <!-- 屏幕区域 -->
      <div class="tama-screen-bezel">
        <div class="tama-screen" id="ai-pet-screen">

          <!-- 加载状态 -->
          <div class="pet-screen-loading hidden" id="pet-loading">
            <div class="pet-loading-spinner"></div>
            <span>正在加载…</span>
          </div>

          <!-- 错误状态 -->
          <div class="pet-screen-error hidden" id="pet-error">
            <span class="pet-error-icon">⚠️</span>
            <span id="pet-error-msg">出错了</span>
          </div>

          <!-- 主屏幕内容（动态渲染） -->
          <div id="pet-screen-content">
            <!-- Phase 1: 占位主页 -->
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

      <!-- 底部按钮区 -->
      <div class="tama-buttons">
        <button class="tama-btn" id="tama-btn-left"  aria-label="左键" title="菜单">◀</button>
        <button class="tama-btn tama-btn-center" id="tama-btn-center" aria-label="确认" title="确认">●</button>
        <button class="tama-btn" id="tama-btn-right" aria-label="右键" title="取消">▶</button>
      </div>

      <!-- 关闭按钮 -->
      <button class="tama-close-btn" id="tama-close" aria-label="关闭桌宠面板" title="关闭">✕</button>

    </div>
  `;

  document.body.appendChild(el);
  petWindowEl = el;

  // 绑定关闭
  el.querySelector("#tama-close").addEventListener("click", closePetWindow);

  // 绑定底部按钮（Phase 1 占位）
  el.querySelector("#tama-btn-left").addEventListener("click",   () => onTamaBtn("left"));
  el.querySelector("#tama-btn-center").addEventListener("click", () => onTamaBtn("center"));
  el.querySelector("#tama-btn-right").addEventListener("click",  () => onTamaBtn("right"));

  // 绑定槽位点击
  el.addEventListener("click", onPetWindowClick);

  // PC拖动
  bindDrag(el);

  log("拓麻歌子窗口已构建");
}

function onTamaBtn(btn) {
  log("拓麻歌子按钮点击", btn);
  // Phase 2+ 实现具体逻辑
}

function onPetWindowClick(e) {
  const slot = e.target.closest(".pet-slot");
  if (slot) {
    const slotId = slot.dataset.slot;
    log("点击槽位", slotId);
    // Phase 2 实现：打开桌宠选择/管理界面
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
    const gs      = extension_settings[AI_PET_KEY]?.globalStats;
    const tokensEl = petWindowEl?.querySelector("#pet-stat-tokens");
    const msgsEl   = petWindowEl?.querySelector("#pet-stat-msgs");
    if (tokensEl && gs) tokensEl.textContent = `🪙 ${gs.totalTokens} tk`;
    if (msgsEl   && gs) msgsEl.textContent   = `💬 ${gs.totalMessages} 条`;
  } catch (e) {
    logError("refreshPetScreen 失败", e);
  }
}

/* ── 拖动（PC端） ── */
function bindDrag(el) {
  const shell = el.querySelector(".tama-shell");
  if (!shell) return;

  shell.addEventListener("mousedown", (e) => {
    // 不拦截按钮点击
    if (e.target.closest("button")) return;
    isDragging  = true;
    dragOffsetX = e.clientX - el.getBoundingClientRect().left;
    dragOffsetY = e.clientY - el.getBoundingClientRect().top;
    el.style.transition = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;
    // 限制在视口内
    const maxX = window.innerWidth  - el.offsetWidth;
    const maxY = window.innerHeight - el.offsetHeight;
    el.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
    el.style.top  = `${Math.max(0, Math.min(y, maxY))}px`;
    el.style.right  = "auto";
    el.style.bottom = "auto";
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
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
    toastTimer = setTimeout(() => {
      toast.classList.remove("visible");
    }, duration);
  } catch (e) {
    logError("showToast 失败", e);
  }
}

function showLoading(show) {
  const el = document.getElementById("pet-loading");
  if (!el) return;
  if (show) {
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
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

function bindSettingsPanel() {
  try {
    const enabledToggle = document.getElementById("ai-pet-enabled");
    if (enabledToggle) {
      const s = extension_settings[AI_PET_KEY].settings;
      enabledToggle.checked = s.enabled;
      enabledToggle.addEventListener("change", () => {
        s.enabled = enabledToggle.checked;
        saveData();
        log("插件开关切换", s.enabled);
        showToast(s.enabled ? "AI桌宠已启用" : "AI桌宠已停用");
      });
    }

    const modeSelect = document.getElementById("ai-pet-mode");
    if (modeSelect) {
      const s = extension_settings[AI_PET_KEY].settings;
      modeSelect.value = s.mode;
      modeSelect.addEventListener("change", () => {
        s.mode = modeSelect.value;
        saveData();
        log("模式切换", s.mode);
        showToast(`已切换到${s.mode === "free" ? "免费" : "API"}模式`);
      });
    }

    log("设置面板已绑定");
  } catch (e) {
    logError("bindSettingsPanel 失败", e);
  }
}

/* BLOCK END: 设置面板联动 */

/* ============================================================ */
/* BLOCK START: 插件入口与初始化                                  */
/* ============================================================ */

(function initAiPet() {
  try {
    log(`${AI_PET_NAME} v${AI_PET_VERSION} 正在初始化…`);

    // 1. 初始化数据
    initSettings();

    // 2. 绑定ST事件
    bindSTEvents();

    // 3. 等待DOM就绪后绑定设置面板
    //    ST在扩展加载时settings.html已注入，直接绑定
    jQuery(document).ready(() => {
      bindSettingsPanel();
      log("DOM就绪，设置面板已绑定");
    });

    log(`${AI_PET_NAME} 初始化完成 ✓`);
  } catch (e) {
    logError("插件初始化失败", e);
  }
})();

/* BLOCK END: 插件入口与初始化 */


