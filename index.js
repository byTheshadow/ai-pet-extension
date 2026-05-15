/* ============================================================ */
/* BLOCK START: 模块元信息与常量定义                              */
/* ============================================================ */

const PLUGIN_NAME = "AI桌宠系统";
const PLUGIN_VERSION = "1.0.0";
const EXTENSION_NAME = "ai-pet-extension";

const LOG_PREFIX = `[${PLUGIN_NAME} v${PLUGIN_VERSION}]`;

// 品牌配置（形象 URL 占位，后续替换为实际图片）
const BRAND_CONFIG = {
  claude: {
    label: "Claude",
    color: "#DA7756",
    skins: [
      { name: "默认皮肤", url: "https://placehold.co/120x120/DA7756/fff?text=Claude" },
      { name: "节日皮肤", url: "https://placehold.co/120x120/c45e3e/fff?text=Claude+2" }
    ]
  },
  gemini: {
    label: "Gemini",
    color: "#4285F4",
    skins: [
      { name: "默认皮肤", url: "https://placehold.co/120x120/4285F4/fff?text=Gemini" },
      { name: "节日皮肤", url: "https://placehold.co/120x120/1a56c4/fff?text=Gemini+2" }
    ]
  },
  deepseek: {
    label: "DeepSeek",
    color: "#2D5BE3",
    skins: [
      { name: "默认皮肤", url: "https://placehold.co/120x120/2D5BE3/fff?text=DeepSeek" },
      { name: "节日皮肤", url: "https://placehold.co/120x120/1a3fa8/fff?text=DeepSeek+2" }
    ]
  },
  gpt: {
    label: "GPT",
    color: "#10A37F",
    skins: [
      { name: "默认皮肤", url: "https://placehold.co/120x120/10A37F/fff?text=GPT" },
      { name: "节日皮肤", url: "https://placehold.co/120x120/0a7a5e/fff?text=GPT+2" }
    ]
  }
};

// 消息 emoji 注入配置
const MESSAGE_EMOJI = "🐾";

// 默认设置结构
const DEFAULT_SETTINGS = {
  settings: {
    enabled: true,
    mode: "free",
    apiKeys: [],
    currentKeyIndex: 0,
    model: "",
    messageTemplate: "{petName}这次和{charName}聊天消耗了{tokens}tk，用时{time}秒，第{floor}楼",
    logLevel: "verbose"
  },
  pets: {
    slot1: null,
    slot2: null
  },
  relationship: {
    affection: 0,
    events: []
  },
  globalStats: {
    totalTokens: 0,
    totalMessages: 0,
    totalResponseTime: 0,
    sessionTokens: 0
  }
};

/* BLOCK END: 模块元信息与常量定义 */

/* ============================================================ */
/* BLOCK START: 日志系统                                         */
/* ============================================================ */

/**
 * 普通运行日志（verbose 模式下输出）
 */
function log(...args) {
  const settings = getSettings();
  if (settings.logLevel === "verbose") {
    console.log(LOG_PREFIX, ...args);
  }
}

/**
 * 错误日志（始终输出）
 */
function logError(...args) {
  console.error(LOG_PREFIX, "[ERROR]", ...args);
}

/**
 * 警告日志
 */
function logWarn(...args) {
  console.warn(LOG_PREFIX, "[WARN]", ...args);
}

/* BLOCK END: 日志系统 */

/* ============================================================ */
/* BLOCK START: 数据持久化                                       */
/* ============================================================ */

/**
 * 获取当前设置（带默认值兜底）
 */
function getSettings() {
  // extensionSettings 由 ST 注入
  if (typeof extensionSettings === "undefined") {
    logError("extensionSettings 未定义，ST环境异常");
    return DEFAULT_SETTINGS.settings;
  }
  if (!extensionSettings[EXTENSION_NAME]) {
    extensionSettings[EXTENSION_NAME] = structuredClone(DEFAULT_SETTINGS);
  }
  return extensionSettings[EXTENSION_NAME].settings;
}

/**
 * 获取完整插件数据
 */
function getPluginData() {
  if (typeof extensionSettings === "undefined") return structuredClone(DEFAULT_SETTINGS);
  if (!extensionSettings[EXTENSION_NAME]) {
    extensionSettings[EXTENSION_NAME] = structuredClone(DEFAULT_SETTINGS);
  }
  return extensionSettings[EXTENSION_NAME];
}

/**
 * 保存数据（防抖）
 */
function saveData() {
  if (typeof saveSettingsDebounced === "function") {
    saveSettingsDebounced();
    log("数据已保存");
  } else {
    logWarn("saveSettingsDebounced 未定义，数据未持久化");
  }
}

/**
 * 初始化数据结构（补全缺失字段）
 */
function initData() {
  if (typeof extensionSettings === "undefined") {
    logError("无法初始化数据：extensionSettings 未定义");
    return;
  }

  if (!extensionSettings[EXTENSION_NAME]) {
    extensionSettings[EXTENSION_NAME] = structuredClone(DEFAULT_SETTINGS);
    log("数据结构首次初始化完成");
    saveData();
    return;
  }

  // 补全缺失字段（版本升级兼容）
  const data = extensionSettings[EXTENSION_NAME];
  let dirty = false;

  for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
    if (data[key] === undefined) {
      data[key] = structuredClone(val);
      dirty = true;
      log(`补全缺失字段: ${key}`);
    }
  }

  // 补全 settings 子字段
  for (const [key, val] of Object.entries(DEFAULT_SETTINGS.settings)) {
    if (data.settings[key] === undefined) {
      data.settings[key] = val;
      dirty = true;
      log(`补全缺失 settings 字段: ${key}`);
    }
  }

  if (dirty) saveData();
  log("数据结构校验完成");
}

/* BLOCK END: 数据持久化 */

/* ============================================================ */
/* BLOCK START: UI 工具函数                                      */
/* ============================================================ */

/**
 * 显示交互反馈 toast
 * @param {string} message 消息内容
 * @param {'info'|'success'|'error'|'loading'} type 类型
 * @param {number} duration 持续毫秒，0 = 不自动消失
 * @returns {HTMLElement} toast 元素（可手动移除）
 */
function showToast(message, type = "info", duration = 3000) {
  // 移除同类 loading toast（避免堆叠）
  if (type === "loading") {
    document.querySelectorAll(".aipet-toast.loading").forEach(el => el.remove());
  }

  const toast = document.createElement("div");
  toast.className = `aipet-toast ${type}`;

  const icons = { info: "ℹ️", success: "✅", error: "❌", loading: "⏳" };
  toast.innerHTML = `<span class="aipet-toast-icon">${icons[type] || "ℹ️"}</span><span class="aipet-toast-msg">${message}</span>`;

  document.body.appendChild(toast);

  // 触发动画
  requestAnimationFrame(() => toast.classList.add("visible"));

  if (duration > 0) {
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return toast;
}

/**
 * 移除指定 toast（用于 loading 结束后手动关闭）
 */
function removeToast(toastEl) {
  if (!toastEl) return;
  toastEl.classList.remove("visible");
  setTimeout(() => toastEl.remove(), 300);
}

/* BLOCK END: UI 工具函数 */

/* ============================================================ */
/* BLOCK START: 悬浮窗核心                                       */
/* ============================================================ */

let floatWin = null;       // 悬浮窗根元素
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

/**
 * 创建悬浮窗 DOM
 */
function createFloatWindow() {
  if (document.getElementById("aipet-float")) return;

  floatWin = document.createElement("div");
  floatWin.id = "aipet-float";
  floatWin.className = "aipet-float";
  floatWin.setAttribute("role", "dialog");
  floatWin.setAttribute("aria-label", "AI桌宠");

  floatWin.innerHTML = `
    <!-- 拖动把手（PC） -->
    <div class="aipet-drag-handle" id="aipet-drag-handle" aria-hidden="true">
      <span class="aipet-drag-dots">⠿</span>
    </div>

    <!-- 主体内容区 -->
    <div class="aipet-body" id="aipet-body">

      <!-- 桌宠展示区（双槽位） -->
      <div class="aipet-pets-row" id="aipet-pets-row">
        <div class="aipet-pet-slot" id="aipet-slot1" data-slot="1">
          <div class="aipet-pet-empty">
            <span class="aipet-add-icon">＋</span>
            <span class="aipet-add-label">添加桌宠</span>
          </div>
        </div>
        <div class="aipet-pet-slot" id="aipet-slot2" data-slot="2">
          <div class="aipet-pet-empty">
            <span class="aipet-add-icon">＋</span>
            <span class="aipet-add-label">添加桌宠</span>
          </div>
        </div>
      </div>

      <!-- 统计信息栏 -->
      <div class="aipet-stats-bar" id="aipet-stats-bar">
        <span class="aipet-stat-item" id="aipet-stat-tokens">🪙 0 tk</span>
        <span class="aipet-stat-item" id="aipet-stat-msgs">💬 0 条</span>
        <span class="aipet-stat-item" id="aipet-stat-session">⚡ 本次 0 tk</span>
      </div>

      <!-- 最新消息信息面板 -->
      <div class="aipet-msg-panel" id="aipet-msg-panel" style="display:none;">
        <span class="aipet-msg-text" id="aipet-msg-text"></span>
      </div>

    </div>

    <!-- 底部工具栏 -->
    <div class="aipet-toolbar" id="aipet-toolbar">
      <button class="aipet-tool-btn" id="aipet-btn-toggle" title="最小化/展开" aria-label="最小化或展开桌宠窗口">
        <span>🐾</span>
      </button>
      <button class="aipet-tool-btn" id="aipet-btn-settings" title="设置" aria-label="打开设置">
        <span>⚙️</span>
      </button>
    </div>
  `;

  document.body.appendChild(floatWin);
  log("悬浮窗已创建");

  // 绑定拖动（PC）
  initDrag();

  // 绑定工具栏按钮（事件委托）
  floatWin.addEventListener("click", onFloatWinClick);
}

/**
 * 悬浮窗点击事件委托
 */
function onFloatWinClick(e) {
  const btn = e.target.closest("[id]");
  if (!btn) return;

  switch (btn.id) {
    case "aipet-btn-toggle":
      toggleFloatBody();
      break;
    case "aipet-btn-settings":
      openSettingsPanel();
      break;
    case "aipet-slot1":
    case "aipet-slot2": {
      const slot = btn.dataset.slot;
      const data = getPluginData();
      const pet = data.pets[`slot${slot}`];
      if (!pet) {
        openPetSelectModal(slot);
      } else {
        openPetManageModal(slot);
      }
      break;
    }
  }
}

/**
 * 切换悬浮窗主体展开/收起
 */
function toggleFloatBody() {
  if (!floatWin) return;
  const body = floatWin.querySelector("#aipet-body");
  const statsBar = floatWin.querySelector("#aipet-stats-bar");
  const isCollapsed = floatWin.classList.toggle("collapsed");
  log(`悬浮窗 ${isCollapsed ? "收起" : "展开"}`);
}

/**
 * 初始化 PC 拖动
 */
function initDrag() {
  const handle = document.getElementById("aipet-drag-handle");
  if (!handle) return;

  // 检测是否为触摸设备
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if (isMobile) {
    handle.style.display = "none";
    return;
  }

  handle.addEventListener("mousedown", (e) => {
    isDragging = true;
    const rect = floatWin.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    floatWin.style.transition = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    let x = e.clientX - dragOffsetX;
    let y = e.clientY - dragOffsetY;

    // 边界限制
    const maxX = window.innerWidth - floatWin.offsetWidth;
    const maxY = window.innerHeight - floatWin.offsetHeight;
    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));

    floatWin.style.left = `${x}px`;
    floatWin.style.top = `${y}px`;
    floatWin.style.right = "auto";
    floatWin.style.bottom = "auto";
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      floatWin.style.transition = "";
      // 保存位置
      const rect = floatWin.getBoundingClientRect();
      localStorage.setItem("aipet_float_pos", JSON.stringify({ x: rect.left, y: rect.top }));
      log(`悬浮窗位置已保存: ${rect.left}, ${rect.top}`);
    }
  });

  // 恢复上次位置
  const savedPos = localStorage.getItem("aipet_float_pos");
  if (savedPos) {
    try {
      const { x, y } = JSON.parse(savedPos);
      floatWin.style.left = `${x}px`;
      floatWin.style.top = `${y}px`;
      floatWin.style.right = "auto";
      floatWin.style.bottom = "auto";
      log(`悬浮窗位置已恢复: ${x}, ${y}`);
    } catch (err) {
      logError("恢复悬浮窗位置失败", err);
    }
  }
}

/**
 * 显示/隐藏悬浮窗
 */
function setFloatWindowVisible(visible) {
  if (!floatWin) return;
  floatWin.style.display = visible ? "flex" : "none";
}

/* BLOCK END: 悬浮窗核心 */

/* ============================================================ */
/* BLOCK START: 模态框系统                                       */
/* ============================================================ */

let activeModal = null;

/**
 * 创建通用模态框容器
 * @param {string} id 模态框 ID
 * @param {string} title 标题
 * @param {string} bodyHTML 内容 HTML
 * @param {Object} options 选项
 */
function createModal(id, title, bodyHTML, options = {}) {
  // 关闭已有模态框
  closeModal();

  const overlay = document.createElement("div");
  overlay.className = "aipet-modal-overlay";
  overlay.id = id;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", title);

  overlay.innerHTML = `
    <div class="aipet-modal">
      <div class="aipet-modal-header">
        <span class="aipet-modal-title">${title}</span>
        <button class="aipet-modal-close" aria-label="关闭" id="aipet-modal-close-btn">✕</button>
      </div>
      <div class="aipet-modal-body">
        ${bodyHTML}
      </div>
      ${options.footer ? `<div class="aipet-modal-footer">${options.footer}</div>` : ""}
    </div>
  `;

  document.body.appendChild(overlay);
  activeModal = overlay;

  // 点击遮罩关闭
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  // 关闭按钮
  overlay.querySelector("#aipet-modal-close-btn").addEventListener("click", closeModal);

  // 动画
  requestAnimationFrame(() => overlay.classList.add("visible"));

  log(`模态框已打开: ${id}`);
  return overlay;
}

/**
 * 关闭当前模态框
 */
function closeModal() {
  if (!activeModal) return;
  activeModal.classList.remove("visible");
  const el = activeModal;
  activeModal = null;
  setTimeout(() => el.remove(), 300);
  log("模态框已关闭");
}

/**
 * 打开桌宠选择模态框（Phase 2 完整实现，此处为骨架）
 */
function openPetSelectModal(slot) {
  const html = `
    <div class="aipet-placeholder-notice">
      <span class="aipet-placeholder-icon">🚧</span>
      <p>桌宠选择界面将在 Phase 2 实现</p>
      <p class="aipet-placeholder-sub">槽位 ${slot} 等待中...</p>
    </div>
  `;
  createModal("aipet-modal-select", `选择桌宠 · 槽位 ${slot}`, html);
}

/**
 * 打开桌宠管理模态框（Phase 2 完整实现，此处为骨架）
 */
function openPetManageModal(slot) {
  const data = getPluginData();
  const pet = data.pets[`slot${slot}`];
  if (!pet) return;

  const html = `
    <div class="aipet-placeholder-notice">
      <span class="aipet-placeholder-icon">🚧</span>
      <p>桌宠管理界面将在 Phase 2 实现</p>
      <p class="aipet-placeholder-sub">${pet.name} 正在等待...</p>
    </div>
  `;
  createModal("aipet-modal-manage", `管理桌宠 · ${pet.name}`, html);
}

/**
 * 打开设置面板（跳转到 ST 设置页）
 */
function openSettingsPanel() {
  // ST 设置页通过 settings.html 注入，这里触发导航
  const settingsTab = document.querySelector('[data-tab="extensions"]') ||
                      document.querySelector('#extensions-settings-button') ||
                      document.querySelector('.fa-plug')?.closest('button');
  if (settingsTab) {
    settingsTab.click();
    log("已跳转到扩展设置页");
  } else {
    showToast("请手动打开 ST 设置 → 扩展 → AI桌宠系统", "info", 4000);
    logWarn("未找到设置按钮，提示用户手动导航");
  }
}

/* BLOCK END: 模态框系统 */

/* ============================================================ */
/* BLOCK START: ST 事件监听                                      */
/* ============================================================ */

let messageStartTime = null;  // 记录消息开始时间

/**
 * 监听消息发送开始（记录时间）
 */
function onMessageSent() {
  messageStartTime = Date.now();
  log("消息已发送，开始计时");
}

/**
 * 监听消息接收完成
 */
function onMessageReceived() {
  const settings = getSettings();
  if (!settings.enabled) return;

  const responseTime = messageStartTime ? ((Date.now() - messageStartTime) / 1000).toFixed(1) : "?";
  messageStartTime = null;

  log(`消息接收完成，响应时间: ${responseTime}s`);

  // 获取 ST 上下文
  let context = null;
  try {
    context = typeof getContext === "function" ? getContext() : null;
  } catch (err) {
    logError("获取 ST context 失败", err);
  }

  // 提取消息信息
  const chat = context?.chat || [];
  const floor = chat.length;
  const lastMsg = chat[chat.length - 1];
  const tokens = lastMsg?.extra?.token_count || 0;
  const charName = context?.characters?.[context?.characterId]?.name || "AI";

  // 更新全局统计
  const data = getPluginData();
  data.globalStats.totalMessages += 1;
  data.globalStats.totalTokens += tokens;
  data.globalStats.totalResponseTime += parseFloat(responseTime) || 0;
  data.globalStats.sessionTokens += tokens;
  saveData();

  log(`统计更新 → 总消息: ${data.globalStats.totalMessages}, 总token: ${data.globalStats.totalTokens}`);

  // 更新 UI 统计栏
  updateStatsBar();

  // 注入 emoji 到最新消息
  injectMessageEmoji(floor);

  // 显示消息信息面板
  showMessagePanel(tokens, responseTime, floor, charName);
}

/**
 * 注入 emoji 到消息气泡
 */
function injectMessageEmoji(floor) {
  const settings = getSettings();
  if (!settings.enabled) return;

  // 找到最后一条 AI 消息气泡
  const msgElements = document.querySelectorAll(".mes:not(.user_mes)");
  if (!msgElements.length) return;

  const lastMsg = msgElements[msgElements.length - 1];
  const nameEl = lastMsg.querySelector(".name_text");
  if (!nameEl) return;

  // 避免重复注入
  if (nameEl.querySelector(".aipet-emoji")) return;

  const emojiSpan = document.createElement("span");
  emojiSpan.className = "aipet-emoji";
  emojiSpan.textContent = MESSAGE_EMOJI;
  emojiSpan.title = "AI桌宠系统";
  nameEl.appendChild(emojiSpan);

  log(`emoji 已注入到第 ${floor} 楼`);
}

/**
 * 更新统计栏 UI
 */
function updateStatsBar() {
  const data = getPluginData();
  const stats = data.globalStats;

  const tokensEl = document.getElementById("aipet-stat-tokens");
  const msgsEl = document.getElementById("aipet-stat-msgs");
  const sessionEl = document.getElementById("aipet-stat-session");

  if (tokensEl) tokensEl.textContent = `🪙 ${stats.totalTokens.toLocaleString()} tk`;
  if (msgsEl) msgsEl.textContent = `💬 ${stats.totalMessages} 条`;
  if (sessionEl) sessionEl.textContent = `⚡ 本次 ${stats.sessionTokens.toLocaleString()} tk`;
}

/**
 * 显示消息信息面板
 */
function showMessagePanel(tokens, responseTime, floor, charName) {
  const settings = getSettings();
  const data = getPluginData();

  // 找到有桌宠的槽位
  const pet = data.pets.slot1 || data.pets.slot2;
  const petName = pet?.name || "桌宠";

  // 套用模板
  let text = settings.messageTemplate
    .replace("{petName}", petName)
    .replace("{charName}", charName)
    .replace("{tokens}", tokens)
    .replace("{time}", responseTime)
    .replace("{floor}", floor);

  const panel = document.getElementById("aipet-msg-panel");
  const textEl = document.getElementById("aipet-msg-text");

  if (!panel || !textEl) return;

  textEl.textContent = text;
  panel.style.display = "block";

  // 5 秒后淡出
  panel.classList.remove("fade-out");
  clearTimeout(panel._fadeTimer);
  panel._fadeTimer = setTimeout(() => {
    panel.classList.add("fade-out");
    setTimeout(() => { panel.style.display = "none"; panel.classList.remove("fade-out"); }, 600);
  }, 5000);
}

/* BLOCK END: ST 事件监听 */

/* ============================================================ */
/* BLOCK START: Settings HTML 注入与绑定                         */
/* ============================================================ */

/**
 * 初始化 settings.html 中的控件绑定
 */
function initSettingsBindings() {
  // 插件总开关
  const enabledToggle = document.getElementById("aipet-enabled");
  if (enabledToggle) {
    const settings = getSettings();
    enabledToggle.checked = settings.enabled;
    enabledToggle.addEventListener("change", () => {
      getSettings().enabled = enabledToggle.checked;
      saveData();
      setFloatWindowVisible(enabledToggle.checked);
      showToast(enabledToggle.checked ? "AI桌宠已启用 🐾" : "AI桌宠已关闭", "success");
      log(`插件开关: ${enabledToggle.checked}`);
    });
  }

  // 模式选择
  const modeSelect = document.getElementById("aipet-mode");
  if (modeSelect) {
    const settings = getSettings();
    modeSelect.value = settings.mode;
    modeSelect.addEventListener("change", () => {
      getSettings().mode = modeSelect.value;
      saveData();
      showToast(`已切换到${modeSelect.value === "free" ? "免费" : "API"}模式`, "success");
      log(`模式切换: ${modeSelect.value}`);
    });
  }

  // 日志级别
  const logLevelSelect = document.getElementById("aipet-log-level");
  if (logLevelSelect) {
    const settings = getSettings();
    logLevelSelect.value = settings.logLevel;
    logLevelSelect.addEventListener("change", () => {
      getSettings().logLevel = logLevelSelect.value;
      saveData();
      log(`日志级别: ${logLevelSelect.value}`);
    });
  }

  // 消息模板
  const templateInput = document.getElementById("aipet-msg-template");
  if (templateInput) {
    const settings = getSettings();
    templateInput.value = settings.messageTemplate;
    templateInput.addEventListener("input", () => {
      getSettings().messageTemplate = templateInput.value;
      saveData();
    });
  }

  // API Key 输入
  const apiKeyInput = document.getElementById("aipet-api-key");
  const apiKeySaveBtn = document.getElementById("aipet-api-key-save");
  if (apiKeyInput && apiKeySaveBtn) {
    apiKeySaveBtn.addEventListener("click", () => {
      const key = apiKeyInput.value.trim();
      if (!key) {
        showToast("请输入有效的 API Key", "error");
        return;
      }
      const settings = getSettings();
      if (!settings.apiKeys.includes(key)) {
        settings.apiKeys.push(key);
        saveData();
        showToast("API Key 已保存 ✓", "success");
        renderApiKeyList();
        apiKeyInput.value = "";
        log(`API Key 已添加，当前共 ${settings.apiKeys.length} 个`);
      } else {
        showToast("该 Key 已存在", "error");
      }
    });
  }

  // API 连通性测试
  const testBtn = document.getElementById("aipet-api-test");
  if (testBtn) {
    testBtn.addEventListener("click", testApiConnection);
  }

  // 数据导出
  const exportBtn = document.getElementById("aipet-export");
  if (exportBtn) {
    exportBtn.addEventListener("click", exportData);
  }

    // 数据清空
  const clearBtn = document.getElementById("aipet-clear-data");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (!confirm("确定要清空所有桌宠数据吗？此操作不可恢复！")) return;
      extensionSettings[EXTENSION_NAME] = structuredClone(DEFAULT_SETTINGS);
      saveData();
      showToast("所有数据已清空", "success");
      updateStatsBar();
      renderPetSlots();
      log("数据已全部清空");
    });
  }

  // 渲染初始状态
  renderApiKeyList();
  updateSettingsStatus();

  log("Settings 控件绑定完成");
}

/**
 * 渲染 API Key 列表
 */
function renderApiKeyList() {
  const container = document.getElementById("aipet-api-key-list");
  if (!container) return;

  const settings = getSettings();
  if (!settings.apiKeys.length) {
    container.innerHTML = `<span class="aipet-key-empty">暂无 Key，请添加</span>`;
    return;
  }

  container.innerHTML = settings.apiKeys.map((key, i) => `
    <div class="aipet-key-item">
      <span class="aipet-key-index">#${i + 1}</span>
      <span class="aipet-key-value">${maskApiKey(key)}</span>
      <span class="aipet-key-badge ${i === settings.currentKeyIndex ? "active" : ""}">
        ${i === settings.currentKeyIndex ? "当前" : "备用"}
      </span>
      <button class="aipet-key-del" data-index="${i}" aria-label="删除此Key">✕</button>
    </div>
  `).join("");

  // 删除 Key 事件委托
  container.addEventListener("click", (e) => {
    const delBtn = e.target.closest(".aipet-key-del");
    if (!delBtn) return;
    const idx = parseInt(delBtn.dataset.index);
    const settings = getSettings();
    settings.apiKeys.splice(idx, 1);
    if (settings.currentKeyIndex >= settings.apiKeys.length) {
      settings.currentKeyIndex = 0;
    }
    saveData();
    renderApiKeyList();
    showToast("Key 已删除", "success");
    log(`API Key #${idx + 1} 已删除`);
  });
}

/**
 * 遮蔽 API Key 显示
 */
function maskApiKey(key) {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

/**
 * 更新设置页状态显示
 */
function updateSettingsStatus() {
  const statusEl = document.getElementById("aipet-status-text");
  if (!statusEl) return;

  const data = getPluginData();
  const settings = data.settings;
  const pet1 = data.pets.slot1;
  const pet2 = data.pets.slot2;

  statusEl.innerHTML = `
    <span class="aipet-status-row">插件状态：<b>${settings.enabled ? "✅ 运行中" : "⏸ 已关闭"}</b></span>
    <span class="aipet-status-row">当前模式：<b>${settings.mode === "free" ? "免费模式" : "API模式"}</b></span>
    <span class="aipet-status-row">槽位1：<b>${pet1 ? pet1.name : "空"}</b></span>
    <span class="aipet-status-row">槽位2：<b>${pet2 ? pet2.name : "空"}</b></span>
    <span class="aipet-status-row">API Keys：<b>${settings.apiKeys.length} 个</b></span>
  `;
}

/* BLOCK END: Settings HTML 注入与绑定 */

/* ============================================================ */
/* BLOCK START: API 连通性测试                                   */
/* ============================================================ */

/**
 * 测试 API 连通性
 */
async function testApiConnection() {
  const settings = getSettings();

  if (!settings.apiKeys.length) {
    showToast("请先添加 API Key", "error");
    return;
  }

  const testBtn = document.getElementById("aipet-api-test");
  const resultEl = document.getElementById("aipet-api-test-result");

  if (testBtn) testBtn.disabled = true;
  const loadingToast = showToast("正在测试 API 连通性...", "loading", 0);

  if (resultEl) {
    resultEl.className = "aipet-test-result testing";
    resultEl.textContent = "⏳ 测试中...";
  }

  try {
    const key = settings.apiKeys[settings.currentKeyIndex] || settings.apiKeys[0];
    const model = settings.model || "gemini-2.0-flash";

    log(`开始 API 测试，模型: ${model}`);

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 50,
        messages: [{ role: "user", content: "回复「连接成功」三个字" }]
      })
    });

    removeToast(loadingToast);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || "无回复";

    if (resultEl) {
      resultEl.className = "aipet-test-result success";
      resultEl.textContent = `✅ 连接成功！模型回复：${reply}`;
    }
    showToast("API 连接成功 ✅", "success");
    log(`API 测试成功，回复: ${reply}`);

  } catch (err) {
    removeToast(loadingToast);
    const errMsg = err.message || "未知错误";

    if (resultEl) {
      resultEl.className = "aipet-test-result error";
      resultEl.textContent = `❌ 连接失败：${errMsg}`;
    }
    showToast(`API 连接失败：${errMsg}`, "error", 5000);
    logError("API 测试失败", err);
  } finally {
    if (testBtn) testBtn.disabled = false;
  }
}

/* BLOCK END: API 连通性测试 */

/* ============================================================ */
/* BLOCK START: 数据导出                                         */
/* ============================================================ */

/**
 * 导出全部数据为 JSON 文件
 */
function exportData() {
  const loadingToast = showToast("正在准备导出...", "loading", 0);

  try {
    const data = getPluginData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `aipet-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    removeToast(loadingToast);
    showToast("数据导出成功 ✅", "success");
    log("数据已导出");
  } catch (err) {
    removeToast(loadingToast);
    showToast(`导出失败：${err.message}`, "error");
    logError("数据导出失败", err);
  }
}

/* BLOCK END: 数据导出 */

/* ============================================================ */
/* BLOCK START: 桌宠槽位渲染                                     */
/* ============================================================ */

/**
 * 渲染两个桌宠槽位
 */
function renderPetSlots() {
  renderPetSlot(1);
  renderPetSlot(2);
}

/**
 * 渲染单个槽位
 */
function renderPetSlot(slotNum) {
  const slotEl = document.getElementById(`aipet-slot${slotNum}`);
  if (!slotEl) return;

  const data = getPluginData();
  const pet = data.pets[`slot${slotNum}`];

  if (!pet) {
    slotEl.innerHTML = `
      <div class="aipet-pet-empty">
        <span class="aipet-add-icon">＋</span>
        <span class="aipet-add-label">添加桌宠</span>
      </div>
    `;
    return;
  }

  const brand = BRAND_CONFIG[pet.brand] || BRAND_CONFIG.claude;
  const skin = brand.skins[pet.skin] || brand.skins[0];

  slotEl.innerHTML = `
    <div class="aipet-pet-card" data-brand="${pet.brand}">
      <div class="aipet-pet-img-wrap">
        <img
          class="aipet-pet-img"
          src="${skin.url}"
          alt="${pet.name}"
          draggable="false"
        />
        <div class="aipet-pet-idle-overlay"></div>
      </div>
      <div class="aipet-pet-name">${pet.name}</div>
      <div class="aipet-pet-brand-badge" style="background:${brand.color}">${brand.label}</div>
      <div class="aipet-pet-mood-bar">
        <div class="aipet-mood-fill" style="width:${pet.stats.mood}%"></div>
      </div>
    </div>
  `;

  log(`槽位 ${slotNum} 渲染完成: ${pet.name}`);
}

/* BLOCK END: 桌宠槽位渲染 */

/* ============================================================ */
/* BLOCK START: 插件初始化入口                                   */
/* ============================================================ */

/**
 * 主初始化函数
 */
async function initPlugin() {
  log("插件开始初始化...");

  // 1. 初始化数据
  initData();

  // 2. 创建悬浮窗
  createFloatWindow();

  // 3. 根据设置决定是否显示
  const settings = getSettings();
  setFloatWindowVisible(settings.enabled);

  // 4. 渲染槽位
  renderPetSlots();

  // 5. 更新统计栏
  updateStatsBar();

  // 6. 注册 ST 事件监听
  if (typeof eventSource !== "undefined" && typeof event_types !== "undefined") {
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.MESSAGE_SENT, onMessageSent);
    log("ST 事件监听已注册");
  } else {
    logWarn("eventSource 或 event_types 未定义，ST事件监听跳过（非ST环境）");
  }

  // 7. 绑定 settings.html 控件（ST 会在加载扩展时注入 settings.html）
  //    使用 MutationObserver 等待 DOM 就绪
  waitForSettingsDOM();

  log(`插件初始化完成 ✅ v${PLUGIN_VERSION}`);
}

/**
 * 等待 settings.html 注入 DOM 后绑定控件
 */
function waitForSettingsDOM() {
  // 如果已经存在直接绑定
  if (document.getElementById("aipet-enabled")) {
    initSettingsBindings();
    return;
  }

  // 否则用 MutationObserver 等待
  const observer = new MutationObserver(() => {
    if (document.getElementById("aipet-enabled")) {
      observer.disconnect();
      initSettingsBindings();
      log("Settings DOM 已就绪，控件绑定完成");
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  log("等待 Settings DOM 注入...");
}

// ST 扩展入口：jQuery ready
jQuery(async () => {
  try {
    await initPlugin();
  } catch (err) {
    logError("插件初始化失败", err);
    showToast(`AI桌宠初始化失败：${err.message}`, "error", 0);
  }
});

/* BLOCK END: 插件初始化入口 */

