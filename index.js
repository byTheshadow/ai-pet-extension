/* ============================================================ */
/* BLOCK START: 模块元信息与常量定义                              */
/* ============================================================ */

const AI_PET_NAME    = 'AI桌宠系统';
const AI_PET_VERSION = '1.0.0-phase1';
const AI_PET_ID      = 'ai-pet-extension';
const EXTENSION_PATH = `/scripts/extensions/third-party/${AI_PET_ID}`;

/** 默认全局配置 */
const DEFAULT_SETTINGS = {
  settings: {
    enabled:          true,
    mode:             'free',       // 'free' | 'api'
    apiKeys:          [],
    currentKeyIndex:  0,
    model:            '',
    messageTemplate:  '{petName}这次和{charName}聊天消耗了{tokens}tk，用时{time}秒，第{floor}楼',
    logLevel:         'verbose',    // 'verbose' | 'error'
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

/** 品牌配置 */
const BRAND_CONFIG = {
  claude:   { label: 'Claude',   color: '#D97757', accent: '#F4A27A' },
  gemini:   { label: 'Gemini',   color: '#4285F4', accent: '#A78BFA' },
  deepseek: { label: 'DeepSeek', color: '#1A56DB', accent: '#60A5FA' },
  gpt:      { label: 'GPT',      color: '#10A37F', accent: '#34D399' },
};

/** 皮肤配置（每品牌2套） */
const SKIN_CONFIG = {
  claude:   [{ name: '默认橙', bg: '#FFF3ED' }, { name: '暗夜橙', bg: '#2D1A0E' }],
  gemini:   [{ name: '默认蓝', bg: '#EEF2FF' }, { name: '暗夜蓝', bg: '#0F172A' }],
  deepseek: [{ name: '默认深', bg: '#EFF6FF' }, { name: '暗夜深', bg: '#0A0F1E' }],
  gpt:      [{ name: '默认绿', bg: '#ECFDF5' }, { name: '暗夜绿', bg: '#022C22' }],
};

/* BLOCK END: 模块元信息与常量定义 */

/* ============================================================ */
/* BLOCK START: 日志系统                                         */
/* ============================================================ */

const PetLog = {
  _prefix: `[${AI_PET_NAME} v${AI_PET_VERSION}]`,

  _shouldLog(level) {
    const cfg = window.ai_pet_settings?.settings?.logLevel ?? 'verbose';
    if (cfg === 'error' && level !== 'error') return false;
    return true;
  },

  info(tag, ...args) {
    if (!this._shouldLog('info')) return;
    console.log(`%c${this._prefix}%c [${tag}]`, 'color:#D97757;font-weight:bold', 'color:#888', ...args);
  },

  warn(tag, ...args) {
    if (!this._shouldLog('warn')) return;
    console.warn(`${this._prefix} [${tag}]`, ...args);
  },

  error(tag, ...args) {
    console.error(`${this._prefix} [ERROR:${tag}]`, ...args);
  },

  group(label) {
    if (!this._shouldLog('info')) return;
    console.group(`${this._prefix} ${label}`);
  },

  groupEnd() {
    if (!this._shouldLog('info')) return;
    console.groupEnd();
  },
};

/* BLOCK END: 日志系统 */

/* ============================================================ */
/* BLOCK START: 数据管理与持久化                                  */
/* ============================================================ */

/** 运行时设置引用（挂到 window 方便日志系统读取） */
window.ai_pet_settings = null;

/**
 * 深合并：将 source 的缺失字段补充到 target
 */
function _deepMergeDefaults(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      _deepMergeDefaults(target[key], source[key]);
    } else {
      if (target[key] === undefined) target[key] = source[key];
    }
  }
}

/**
 * 从 ST extensionSettings 加载数据，缺失字段用默认值补全
 */
function loadSettings() {
  try {
    // ST 的全局 extensionSettings 对象
    if (!window.extension_settings) {
      PetLog.warn('storage', 'extension_settings 不存在，使用内存默认值');
      window.ai_pet_settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      return;
    }

    if (!window.extension_settings[AI_PET_ID]) {
      window.extension_settings[AI_PET_ID] = {};
    }

    _deepMergeDefaults(window.extension_settings[AI_PET_ID], DEFAULT_SETTINGS);
    window.ai_pet_settings = window.extension_settings[AI_PET_ID];

    PetLog.info('storage', '设置加载完成', window.ai_pet_settings);
  } catch (err) {
    PetLog.error('storage', '加载设置失败', err);
    window.ai_pet_settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
}

/**
 * 保存设置到 ST（防抖）
 */
function saveSettings() {
  try {
    if (typeof window.saveSettingsDebounced === 'function') {
      window.saveSettingsDebounced();
      PetLog.info('storage', '设置已触发保存');
    } else {
      PetLog.warn('storage', 'saveSettingsDebounced 不可用，设置仅保存在内存中');
    }
  } catch (err) {
    PetLog.error('storage', '保存设置失败', err);
  }
}

/* BLOCK END: 数据管理与持久化 */

/* ============================================================ */
/* BLOCK START: SVG占位符资源                                     */
/* ============================================================ */

/**
 * 生成品牌占位SVG（Phase 2 替换为真实形象）
 * @param {string} brand  品牌key
 * @param {number} skinIdx 皮肤索引
 * @returns {string} SVG字符串
 */
function getPetSVG(brand, skinIdx = 0) {
  const cfg    = BRAND_CONFIG[brand]  ?? BRAND_CONFIG.claude;
  const skin   = SKIN_CONFIG[brand]?.[skinIdx] ?? SKIN_CONFIG.claude[0];
  const label  = cfg.label;
  const color  = cfg.color;
  const accent = cfg.accent;

  // 占位：简单Q版圆头小人 + 品牌色
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100" width="80" height="100">
    <!-- 身体 -->
    <ellipse cx="40" cy="72" rx="22" ry="26" fill="${color}" opacity="0.9"/>
    <!-- 头 -->
    <circle cx="40" cy="38" r="26" fill="${accent}"/>
    <!-- 眼睛 -->
    <circle cx="32" cy="36" r="4" fill="#fff"/>
    <circle cx="48" cy="36" r="4" fill="#fff"/>
    <circle cx="33" cy="37" r="2.5" fill="#333"/>
    <circle cx="49" cy="37" r="2.5" fill="#333"/>
    <!-- 高光 -->
    <circle cx="34" cy="35.5" r="1" fill="#fff"/>
    <circle cx="50" cy="35.5" r="1" fill="#fff"/>
    <!-- 嘴 -->
    <path d="M34 46 Q40 51 46 46" stroke="#333" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <!-- 品牌标签 -->
    <text x="40" y="95" text-anchor="middle" font-size="8" fill="${color}" font-family="sans-serif" font-weight="bold">${label}</text>
    <!-- 占位标记 -->
    <text x="40" y="20" text-anchor="middle" font-size="6" fill="#999" font-family="sans-serif">占位符</text>
  </svg>`;
}

/* BLOCK END: SVG占位符资源 */

/* ============================================================ */
/* BLOCK START: 悬浮窗 UI                                        */
/* ============================================================ */

let _floatWindowOpen = false;
let _dragState       = null;   // 拖拽状态

/**
 * 创建悬浮窗 DOM（拓麻歌子外壳风格）
 */
function createFloatWindow() {
  if (document.getElementById('aipet-float-window')) return;

  const win = document.createElement('div');
  win.id        = 'aipet-float-window';
  win.className = 'aipet-float-window aipet-hidden';
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', 'AI桌宠');
  win.setAttribute('aria-modal', 'false');

  win.innerHTML = `
    <!-- 设备外壳 -->
    <div class="aipet-device">

      <!-- 顶部装饰条 -->
      <div class="aipet-device-top" id="aipet-drag-handle" aria-label="拖动手柄">
        <div class="aipet-device-speaker"></div>
        <div class="aipet-device-title">AI PET</div>
        <button class="aipet-close-btn" id="aipet-close-btn" aria-label="关闭桌宠窗口" title="关闭">✕</button>
      </div>

      <!-- 屏幕区域 -->
      <div class="aipet-screen-wrap">
        <div class="aipet-screen" id="aipet-screen">

          <!-- 状态：无桌宠 -->
          <div class="aipet-screen-empty" id="aipet-screen-empty">
            <div class="aipet-empty-icon">🥚</div>
            <div class="aipet-empty-text">还没有桌宠</div>
            <button class="aipet-btn-primary" id="aipet-btn-create-first" aria-label="领养第一只桌宠">领养桌宠</button>
          </div>

          <!-- 状态：有桌宠（Phase 2 填充） -->
          <div class="aipet-screen-pets" id="aipet-screen-pets" style="display:none">
            <!-- 双槽位桌宠展示区 -->
            <div class="aipet-pet-slots">
              <div class="aipet-pet-slot" id="aipet-slot1" data-slot="1">
                <div class="aipet-pet-avatar" id="aipet-avatar1"></div>
                <div class="aipet-pet-name"  id="aipet-name1">—</div>
                <div class="aipet-pet-mood"  id="aipet-mood1"></div>
              </div>
              <div class="aipet-pet-slot" id="aipet-slot2" data-slot="2">
                <div class="aipet-pet-avatar" id="aipet-avatar2"></div>
                <div class="aipet-pet-name"  id="aipet-name2">—</div>
                <div class="aipet-pet-mood"  id="aipet-mood2"></div>
              </div>
            </div>

            <!-- 消息信息面板（Phase 3 填充） -->
            <div class="aipet-msg-panel" id="aipet-msg-panel">
              <div class="aipet-msg-panel-row">
                <span class="aipet-msg-label">Tokens</span>
                <span class="aipet-msg-value" id="aipet-stat-tokens">—</span>
              </div>
              <div class="aipet-msg-panel-row">
                <span class="aipet-msg-label">响应</span>
                <span class="aipet-msg-value" id="aipet-stat-time">—</span>
              </div>
              <div class="aipet-msg-panel-row">
                <span class="aipet-msg-label">楼层</span>
                <span class="aipet-msg-value" id="aipet-stat-floor">—</span>
              </div>
            </div>
          </div>

          <!-- 加载中遮罩 -->
          <div class="aipet-loading-mask" id="aipet-loading-mask" style="display:none" aria-live="polite" aria-label="加载中">
            <div class="aipet-loading-spinner"></div>
            <div class="aipet-loading-text" id="aipet-loading-text">处理中…</div>
          </div>

          <!-- 错误提示 -->
          <div class="aipet-error-toast" id="aipet-error-toast" style="display:none" role="alert" aria-live="assertive"></div>

          <!-- 成功提示 -->
          <div class="aipet-success-toast" id="aipet-success-toast" style="display:none" role="status" aria-live="polite"></div>

        </div><!-- /aipet-screen -->
      </div><!-- /aipet-screen-wrap -->

      <!-- 底部按钮区 -->
      <div class="aipet-device-buttons">
        <button class="aipet-dev-btn" id="aipet-btn-interact" data-action="interact" aria-label="互动" title="互动">💬</button>
        <button class="aipet-dev-btn aipet-dev-btn-main" id="aipet-btn-home" data-action="home" aria-label="主页" title="主页">🏠</button>
        <button class="aipet-dev-btn" id="aipet-btn-stats" data-action="stats" aria-label="统计" title="统计">📊</button>
      </div>

      <!-- 底部装饰 -->
      <div class="aipet-device-bottom">
        <div class="aipet-device-port"></div>
      </div>

    </div><!-- /aipet-device -->
  `;

  document.body.appendChild(win);
  PetLog.info('ui', '悬浮窗 DOM 已创建');
}

/**
 * 打开悬浮窗
 */
function openFloatWindow() {
  const win = document.getElementById('aipet-float-window');
  if (!win) return;
  win.classList.remove('aipet-hidden');
  _floatWindowOpen = true;
  refreshFloatWindowContent();
  PetLog.info('ui', '悬浮窗已打开');
}

/**
 * 关闭悬浮窗
 */
function closeFloatWindow() {
  const win = document.getElementById('aipet-float-window');
  if (!win) return;
  win.classList.add('aipet-hidden');
  _floatWindowOpen = false;
  PetLog.info('ui', '悬浮窗已关闭');
}

/**
 * 刷新悬浮窗内容（根据当前数据状态）
 */
function refreshFloatWindowContent() {
  const s     = window.ai_pet_settings;
  if (!s) return;

  const hasPet = s.pets.slot1 || s.pets.slot2;
  document.getElementById('aipet-screen-empty').style.display = hasPet ? 'none'  : 'flex';
  document.getElementById('aipet-screen-pets').style.display  = hasPet ? 'flex'  : 'none';

  if (hasPet) {
    _renderPetSlot(1, s.pets.slot1);
    _renderPetSlot(2, s.pets.slot2);
  }
}

/**
 * 渲染单个桌宠槽位
 */
function _renderPetSlot(slotNum, pet) {
  const avatarEl = document.getElementById(`aipet-avatar${slotNum}`);
  const nameEl   = document.getElementById(`aipet-name${slotNum}`);
  const moodEl   = document.getElementById(`aipet-mood${slotNum}`);

  if (!pet) {
    if (avatarEl) avatarEl.innerHTML = '<div class="aipet-slot-empty">＋</div>';
    if (nameEl)   nameEl.textContent  = '空槽位';
    if (moodEl)   moodEl.textContent  = '';
    return;
  }

  if (avatarEl) avatarEl.innerHTML = getPetSVG(pet.brand, pet.skin);
  if (nameEl)   nameEl.textContent  = pet.name || pet.brand;
  if (moodEl)   moodEl.textContent  = `❤️ ${pet.stats?.mood ?? 0}`;
}

/* ── 拖拽（PC端） ── */

function _initDrag() {
  const win    = document.getElementById('aipet-float-window');
  const handle = document.getElementById('aipet-drag-handle');
  if (!win || !handle) return;

  // 手机端不启用拖拽
  if (window.matchMedia('(max-width: 768px)').matches) return;

  handle.addEventListener('mousedown', (e) => {
    if (e.target.id === 'aipet-close-btn') return;
    const rect = win.getBoundingClientRect();
    _dragState = {
      startX:  e.clientX,
      startY:  e.clientY,
      origLeft: rect.left,
      origTop:  rect.top,
    };
    win.classList.add('aipet-dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!_dragState) return;
    const dx = e.clientX - _dragState.startX;
    const dy = e.clientY - _dragState.startY;
    let newLeft = _dragState.origLeft + dx;
    let newTop  = _dragState.origTop  + dy;

    // 边界限制
    const maxLeft = window.innerWidth  - win.offsetWidth;
    const maxTop  = window.innerHeight - win.offsetHeight;
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop  = Math.max(0, Math.min(newTop,  maxTop));

    win.style.left = `${newLeft}px`;
    win.style.top  = `${newTop}px`;
    win.style.right  = 'auto';
    win.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (!_dragState) return;
    _dragState = null;
    win.classList.remove('aipet-dragging');
  });
}

/* BLOCK END: 悬浮窗 UI */

/* ============================================================ */
/* BLOCK START: 交互反馈系统（Loading / Toast）                   */
/* ============================================================ */

/**
 * 显示加载遮罩
 * @param {string} text 提示文字
 */
function showLoading(text = '处理中…') {
  const mask    = document.getElementById('aipet-loading-mask');
  const textEl  = document.getElementById('aipet-loading-text');
  if (!mask) return;
  if (textEl) textEl.textContent = text;
  mask.style.display = 'flex';
}

/**
 * 隐藏加载遮罩
 */
function hideLoading() {
  const mask = document.getElementById('aipet-loading-mask');
  if (mask) mask.style.display = 'none';
}

/**
 * 显示错误提示
 * @param {string} msg
 * @param {number} duration ms
 */
function showError(msg, duration = 3000) {
  const el = document.getElementById('aipet-error-toast');
  if (!el) return;
  el.textContent    = `⚠️ ${msg}`;
  el.style.display  = 'flex';
  el.classList.add('aipet-toast-show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.classList.remove('aipet-toast-show');
    setTimeout(() => { el.style.display = 'none'; }, 300);
  }, duration);
}

/**
 * 显示成功提示
 * @param {string} msg
 * @param {number} duration ms
 */
function showSuccess(msg, duration = 2000) {
  const el = document.getElementById('aipet-success-toast');
  if (!el) return;
  el.textContent    = `✅ ${msg}`;
  el.style.display  = 'flex';
  el.classList.add('aipet-toast-show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.classList.remove('aipet-toast-show');
    setTimeout(() => { el.style.display = 'none'; }, 300);
  }, duration);
}

/* BLOCK END: 交互反馈系统 */

/* ============================================================ */
/* BLOCK START: 消息emoji注入                                     */
/* ============================================================ */

let _lastInjectedMsgId = null;

/**
 * 向最后一条AI消息注入触发按钮
 */
function injectEmojiTrigger() {
  if (!window.ai_pet_settings?.settings?.enabled) return;

  // 找到所有AI消息（ST的消息结构）
  const allMsgs = document.querySelectorAll('.mes[is_user="false"]');
  if (!allMsgs.length) return;

  const lastMsg = allMsgs[allMsgs.length - 1];
  const msgId   = lastMsg.getAttribute('mesid') || lastMsg.dataset.mesid;

  // 避免重复注入同一条消息
  if (msgId && msgId === _lastInjectedMsgId) return;

  // 移除旧的触发按钮
  document.querySelectorAll('.aipet-emoji-trigger').forEach(el => el.remove());

  // 创建新按钮
  const btn = document.createElement('button');
  btn.className   = 'aipet-emoji-trigger';
  btn.innerHTML   = '🐾';
  btn.title       = '打开AI桌宠';
  btn.setAttribute('aria-label', '打开AI桌宠面板');

  // 注入到消息底部
  const msgText = lastMsg.querySelector('.mes_text') || lastMsg;
  msgText.style.position = 'relative';
  msgText.appendChild(btn);

  _lastInjectedMsgId = msgId;
  PetLog.info('inject', `emoji触发按钮已注入到消息 #${msgId}`);
}

/* BLOCK END: 消息emoji注入 */

/* ============================================================ */
/* BLOCK START: ST事件监听                                        */
/* ============================================================ */

let _msgStartTime = null;   // 记录消息开始时间，用于计算响应时间

/**
 * 绑定 SillyTavern 事件
 */
function bindSTEvents() {
  try {
    if (!window.eventSource || !window.event_types) {
      PetLog.warn('events', 'ST eventSource 不可用，事件监听跳过');
      return;
    }

    // 消息发送前：记录开始时间
    if (window.event_types.MESSAGE_SENT) {
      window.eventSource.on(window.event_types.MESSAGE_SENT, () => {
        _msgStartTime = Date.now();
        PetLog.info('events', '消息已发送，开始计时');
      });
    }

    // 消息接收：核心触发点
    if (window.event_types.MESSAGE_RECEIVED) {
      window.eventSource.on(window.event_types.MESSAGE_RECEIVED, (data) => {
        PetLog.group('MESSAGE_RECEIVED');
        PetLog.info('events', '收到AI消息', data);

        const responseTime = _msgStartTime ? ((Date.now() - _msgStartTime) / 1000).toFixed(1) : '—';
        _msgStartTime = null;

        _onMessageReceived(data, responseTime);
        PetLog.groupEnd();
      });
    }

    // 聊天切换：重新注入按钮
    if (window.event_types.CHAT_CHANGED) {
      window.eventSource.on(window.event_types.CHAT_CHANGED, () => {
        PetLog.info('events', '聊天已切换，重置注入状态');
        _lastInjectedMsgId = null;
        setTimeout(injectEmojiTrigger, 500);
      });
    }

    PetLog.info('events', 'ST事件监听绑定完成');
  } catch (err) {
    PetLog.error('events', '绑定ST事件失败', err);
  }
}

/**
 * 处理收到AI消息
 */
function _onMessageReceived(data, responseTime) {
  if (!window.ai_pet_settings?.settings?.enabled) return;

  try {
    // 获取ST上下文
    const ctx   = typeof getContext === 'function' ? getContext() : null;
    const floor = ctx?.chat?.length ?? '—';

    // 更新全局统计
    const gs = window.ai_pet_settings.globalStats;
    gs.totalMessages++;
    if (responseTime !== '—') {
      gs.totalResponseTime += parseFloat(responseTime);
    }

    // 更新屏幕上的统计面板
    _updateStatPanel({ floor, responseTime });

    // 注入emoji触发按钮
    setTimeout(injectEmojiTrigger, 200);

    saveSettings();
    PetLog.info('events', `消息处理完成 | 楼层:${floor} | 响应:${responseTime}s`);
  } catch (err) {
    PetLog.error('events', '处理消息失败', err);
  }
}

/**
 * 更新屏幕统计面板
 */
function _updateStatPanel({ floor, responseTime }) {
  const floorEl = document.getElementById('aipet-stat-floor');
  const timeEl  = document.getElementById('aipet-stat-time');
  if (floorEl) floorEl.textContent = floor !== '—' ? `#${floor}` : '—';
  if (timeEl)  timeEl.textContent  = responseTime !== '—' ? `${responseTime}s` : '—';
}

/* BLOCK END: ST事件监听 */

/* ============================================================ */
/* BLOCK START: 事件委托（全局点击路由）                           */
/* ============================================================ */

/**
 * 绑定全局事件委托
 */
function bindGlobalEvents() {
  // 使用事件委托，挂在 document 上
  $(document).on('click', '#aipet-close-btn', () => {
    closeFloatWindow();
  });

  $(document).on('click', '.aipet-emoji-trigger', () => {
    if (_floatWindowOpen) {
      closeFloatWindow();
    } else {
      openFloatWindow();
    }
  });

  $(document).on('click', '#aipet-btn-home', () => {
    refreshFloatWindowContent();
    PetLog.info('ui', '点击主页按钮');
  });

  $(document).on('click', '#aipet-btn-interact', () => {
    PetLog.info('ui', '点击互动按钮（Phase 3 实现）');
    showSuccess('互动功能将在 Phase 3 开放 🐾');
  });

  $(document).on('click', '#aipet-btn-stats', () => {
    PetLog.info('ui', '点击统计按钮（Phase 3 实现）');
    showSuccess('统计功能将在 Phase 3 开放 📊');
  });

    $(document).on('click', '#aipet-btn-create-first', () => {
    PetLog.info('ui', '点击领养桌宠按钮（Phase 2 实现）');
    showSuccess('桌宠领养功能将在 Phase 2 开放 🥚');
  });

  $(document).on('click', '.aipet-pet-slot', function () {
    const slot = $(this).data('slot');
    PetLog.info('ui', `点击槽位 ${slot}（Phase 2 实现）`);
  });

  PetLog.info('events', '全局事件委托绑定完成');
}

/* BLOCK END: 事件委托（全局点击路由） */

/* ============================================================ */
/* BLOCK START: 设置面板注入（ST扩展设置区）                       */
/* ============================================================ */

/**
 * 注入设置面板到 ST 扩展设置区
 */
function injectSettingsPanel() {
  if (document.getElementById('aipet-settings-panel')) {
    PetLog.info('settings', '设置面板已存在，跳过注入');
    return;
  }

  fetch(`${EXTENSION_PATH}/settings.html`)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then(html => {
      // 寻找 ST 挂载点（多版本兼容）
      const possibleParents = [
        document.getElementById('extensions_settings'),
        document.getElementById('extensions_settings2'),
        document.querySelector('.extensions_block'),
      ];
      let parent = possibleParents.find(p => p) ?? document.getElementById('top-settings-holder') ?? document.body;

      const container = document.createElement('div');
      container.id        = 'aipet-settings-panel';
      container.className = 'extension_container';
      container.innerHTML = html;
      parent.appendChild(container);

      // 动态加载 settings.css
      if (!document.querySelector(`link[href*="${AI_PET_ID}/settings.css"]`)) {
        const link  = document.createElement('link');
        link.rel    = 'stylesheet';
        link.href   = `${EXTENSION_PATH}/settings.css`;
        document.head.appendChild(link);
      }

      syncSettingsUI();
      bindSettingsEvents();
      PetLog.info('settings', '设置面板注入完成');
    })
    .catch(err => {
      PetLog.error('settings', '加载 settings.html 失败', err);
    });
}

/**
 * 将当前设置数据同步到面板 UI
 */
function syncSettingsUI() {
  const el = document.getElementById('aipet-sp-enabled');
  if (!el) {
    // DOM 还未就绪，轮询重试
    setTimeout(syncSettingsUI, 500);
    return;
  }

  const s = window.ai_pet_settings?.settings;
  if (!s) return;

  $('#aipet-sp-enabled').prop('checked', s.enabled);
  $('#aipet-sp-mode').val(s.mode);
  $('#aipet-sp-model').val(s.model);
  $('#aipet-sp-loglevel').val(s.logLevel);
  $('#aipet-sp-template').val(s.messageTemplate);
  $('#aipet-sp-apikeys').val((s.apiKeys ?? []).join('\n'));

  PetLog.info('settings', 'UI 同步完成');
}

/**
 * 绑定设置面板事件（事件委托）
 */
function bindSettingsEvents() {
  // 插件总开关
  $(document).on('change', '#aipet-sp-enabled', function () {
    window.ai_pet_settings.settings.enabled = this.checked;
    saveSettings();
    PetLog.info('settings', `插件已${this.checked ? '启用' : '禁用'}`);
    _showSettingsFeedback(this.checked ? '插件已启用 ✅' : '插件已禁用', !this.checked);
  });

  // 模式切换
  $(document).on('change', '#aipet-sp-mode', function () {
    window.ai_pet_settings.settings.mode = this.value;
    saveSettings();
    PetLog.info('settings', `模式切换为: ${this.value}`);
    _showSettingsFeedback(`已切换为${this.value === 'api' ? 'API' : '免费'}模式`);
  });

  // 模型选择
  $(document).on('change', '#aipet-sp-model', function () {
    window.ai_pet_settings.settings.model = this.value;
    saveSettings();
    PetLog.info('settings', `模型设置为: ${this.value}`);
  });

  // 日志级别
  $(document).on('change', '#aipet-sp-loglevel', function () {
    window.ai_pet_settings.settings.logLevel = this.value;
    saveSettings();
    PetLog.info('settings', `日志级别: ${this.value}`);
  });

  // 消息模板
  $(document).on('input', '#aipet-sp-template', function () {
    window.ai_pet_settings.settings.messageTemplate = this.value;
    saveSettings();
  });

  // API Keys 保存
  $(document).on('click', '#aipet-sp-save-keys', function () {
    const raw  = $('#aipet-sp-apikeys').val().trim();
    const keys = raw.split('\n').map(k => k.trim()).filter(Boolean);
    window.ai_pet_settings.settings.apiKeys          = keys;
    window.ai_pet_settings.settings.currentKeyIndex  = 0;
    saveSettings();
    PetLog.info('settings', `已保存 ${keys.length} 个 API Key`);
    _showSettingsFeedback(`已保存 ${keys.length} 个 Key ✅`);
  });

  // API 连通性测试
  $(document).on('click', '#aipet-sp-test-api', async function () {
    const keys  = window.ai_pet_settings.settings.apiKeys;
    const model = window.ai_pet_settings.settings.model;

    if (!keys.length) {
      _showSettingsFeedback('请先填写 API Key ⚠️', true);
      return;
    }

    _setSettingsStatus('正在测试连接…', 'loading');

    try {
      const result = await testAPIConnection(keys[0], model);
      _setSettingsStatus(`连接成功 ✅ (${result.model})`, 'success');
      PetLog.info('settings', 'API 连通测试成功', result);
    } catch (err) {
      _setSettingsStatus(`连接失败 ⚠️: ${err.message}`, 'error');
      PetLog.error('settings', 'API 连通测试失败', err);
    }
  });

  PetLog.info('settings', '设置面板事件绑定完成');
}

/**
 * 设置面板状态提示
 */
function _showSettingsFeedback(msg, isError = false) {
  const el = document.getElementById('aipet-sp-feedback');
  if (!el) return;
  el.textContent  = msg;
  el.className    = `aipet-sp-feedback ${isError ? 'aipet-sp-feedback-error' : 'aipet-sp-feedback-ok'}`;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function _setSettingsStatus(msg, type = 'info') {
  const el = document.getElementById('aipet-sp-api-status');
  if (!el) return;
  el.textContent = msg;
  el.className   = `aipet-sp-api-status aipet-status-${type}`;
}

/* BLOCK END: 设置面板注入 */

/* ============================================================ */
/* BLOCK START: API工具函数                                       */
/* ============================================================ */

/**
 * 获取当前轮询 Key
 */
function getCurrentAPIKey() {
  const s    = window.ai_pet_settings.settings;
  const keys = s.apiKeys;
  if (!keys.length) throw new Error('未配置 API Key');
  const key = keys[s.currentKeyIndex % keys.length];
  // 轮转到下一个
  s.currentKeyIndex = (s.currentKeyIndex + 1) % keys.length;
  return key;
}

/**
 * 测试 API 连通性（发送最小请求）
 * @param {string} key
 * @param {string} model
 */
async function testAPIConnection(key, model) {
  const targetModel = model || 'claude-3-haiku-20240307';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 10,
      messages:   [{ role: 'user', content: 'hi' }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }

  const data = await res.json();
  return { model: data.model ?? targetModel };
}

/* BLOCK END: API工具函数 */

/* ============================================================ */
/* BLOCK START: 插件初始化入口                                    */
/* ============================================================ */

/**
 * 主初始化函数
 */
async function initAIPetExtension() {
  PetLog.group(`${AI_PET_NAME} 初始化 v${AI_PET_VERSION}`);

  try {
    // 1. 加载持久化数据
    PetLog.info('init', '步骤 1/5：加载设置…');
    loadSettings();

    // 2. 创建悬浮窗 DOM
    PetLog.info('init', '步骤 2/5：创建悬浮窗…');
    createFloatWindow();

    // 3. 初始化拖拽
    PetLog.info('init', '步骤 3/5：初始化拖拽…');
    _initDrag();

    // 4. 绑定全局事件委托
    PetLog.info('init', '步骤 4/5：绑定事件…');
    bindGlobalEvents();
    bindSTEvents();

    // 5. 注入设置面板
    PetLog.info('init', '步骤 5/5：注入设置面板…');
    injectSettingsPanel();

    // 初始化完成后尝试注入 emoji（如果已有消息）
    setTimeout(injectEmojiTrigger, 1000);

    PetLog.info('init', `✅ ${AI_PET_NAME} 初始化完成`);
  } catch (err) {
    PetLog.error('init', '初始化失败', err);
  }

  PetLog.groupEnd();
}

// ST 扩展入口：等待 jQuery 和 ST 就绪
if (typeof $ !== 'undefined') {
  $(document).ready(() => {
    // 额外延迟确保 ST 自身初始化完毕
    setTimeout(initAIPetExtension, 500);
  });
} else {
  window.addEventListener('load', () => {
    setTimeout(initAIPetExtension, 500);
  });
}

/* BLOCK END: 插件初始化入口 */

