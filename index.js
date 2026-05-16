/* ============================================================ */
/* BLOCK START: 模块元信息与常量定义                              */
/* ============================================================ */

const AI_PET_NAME    = 'AI桌宠系统';
const AI_PET_VERSION = '1.0.0-phase1';
const AI_PET_FOLDER  = 'ai-pet-extension';
const EXTENSION_PATH = `/scripts/extensions/third-party/${AI_PET_FOLDER}`;

const DEFAULT_SETTINGS = {
  settings: {
    enabled:         true,
    mode:            'free',       // 'free' | 'api'
    apiKey:          '',
    apiBaseUrl:      'https://api.openai.com/v1',
    model:           '',
    messageTemplate: '{petName}这次和{charName}聊天消耗了{tokens}tk，用时{time}秒，第{floor}楼',
    logLevel:        'verbose',    // 'verbose' | 'error'
    theme:           'pink',       // 'pink' | 'dark'
    panelCollapsed:  false,
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

const BRAND_CONFIG = {
  claude:   { label: 'Claude',   color: '#DA7756', emoji: '🟠' },
  gemini:   { label: 'Gemini',   color: '#8B5CF6', emoji: '🟣' },
  deepseek: { label: 'DeepSeek', color: '#1E40AF', emoji: '🔵' },
  gpt:      { label: 'GPT',      color: '#10A37F', emoji: '🟢' },
};

/* BLOCK END: 模块元信息与常量定义 */

/* ============================================================ */
/* BLOCK START: 日志系统                                         */
/* ============================================================ */

const AiPetLog = {
  _prefix: `[${AI_PET_NAME} v${AI_PET_VERSION}]`,

  info(module, ...args) {
    const lvl = AiPetCore.getLogLevel();
    if (lvl === 'verbose') {
      console.log(`%c${this._prefix}[${module}]`, 'color:#c084fc;font-weight:bold', ...args);
    }
  },

  warn(module, ...args) {
    console.warn(`${this._prefix}[${module}]`, ...args);
  },

  error(module, ...args) {
    console.error(`%c${this._prefix}[${module}] ❌`, 'color:#f87171;font-weight:bold', ...args);
  },

  success(module, ...args) {
    const lvl = AiPetCore.getLogLevel();
    if (lvl === 'verbose') {
      console.log(`%c${this._prefix}[${module}] ✅`, 'color:#4ade80;font-weight:bold', ...args);
    }
  },
};

/* BLOCK END: 日志系统 */

/* ============================================================ */
/* BLOCK START: 核心状态管理                                      */
/* ============================================================ */

const AiPetCore = {
  _settings: null,

  // 获取日志级别（安全访问，初始化前也能用）
  getLogLevel() {
    return this._settings?.settings?.logLevel ?? 'verbose';
  },

  // 从 ST extensionSettings 加载，深度合并默认值
  load() {
    try {
      const stored = window.extension_settings?.ai_pet_extension;
      if (stored) {
        this._settings = this._deepMerge(
          JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
          stored
        );
        AiPetLog.success('Core', '设置加载成功');
      } else {
        this._settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        AiPetLog.info('Core', '未找到已存储设置，使用默认值');
      }
    } catch (e) {
      AiPetLog.error('Core', '设置加载失败，使用默认值', e);
      this._settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
  },

  // 保存到 ST extensionSettings
  save() {
    try {
      if (!window.extension_settings) {
        AiPetLog.error('Core', 'extension_settings 不存在，无法保存');
        return;
      }
      window.extension_settings.ai_pet_extension = this._settings;
      if (typeof window.saveSettingsDebounced === 'function') {
        window.saveSettingsDebounced();
        AiPetLog.info('Core', '设置已保存（debounced）');
      } else {
        AiPetLog.warn('Core', 'saveSettingsDebounced 不可用');
      }
    } catch (e) {
      AiPetLog.error('Core', '设置保存失败', e);
    }
  },

  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this._settings);
  },

  set(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((obj, key) => obj?.[key], this._settings);
    if (target && last) {
      target[last] = value;
      this.save();
    }
  },

  // 深度合并（target被source覆盖，但target中source没有的key保留）
  _deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;
    for (const key of Object.keys(source)) {
      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target[key] !== null &&
        typeof target[key] === 'object'
      ) {
        this._deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  },
};

/* BLOCK END: 核心状态管理 */

/* ============================================================ */
/* BLOCK START: UI工具函数                                        */
/* ============================================================ */

const AiPetUI = {

    // 显示Toast提示
  toast(message, type = 'info', duration = 3000) {
    const existing = document.getElementById('ai-pet-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'ai-pet-toast';
    toast.className = `ai-pet-toast ai-pet-toast--${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // 触发动画
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('ai-pet-toast--show'));
    });

    setTimeout(() => {
      toast.classList.remove('ai-pet-toast--show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // 显示加载状态到某个按钮
  setButtonLoading(btn, loading, originalText = '') {
    if (!btn) return;
    if (loading) {
      btn.disabled = true;
      btn.dataset.originalText = btn.textContent;
      btn.textContent = '⏳ 处理中...';
    } else {
      btn.disabled = false;
      btn.textContent = originalText || btn.dataset.originalText || '确认';
    }
  },

  // 在指定容器内显示加载占位
  showLoading(container, message = '加载中...') {
    if (!container) return;
    container.innerHTML = `
      <div class="ai-pet-loading">
        <div class="ai-pet-loading__spinner"></div>
        <span>${message}</span>
      </div>
    `;
  },

  // 在指定容器内显示错误
  showError(container, message) {
    if (!container) return;
    container.innerHTML = `
      <div class="ai-pet-error">
        <span class="ai-pet-error__icon">❌</span>
        <span>${message}</span>
      </div>
    `;
  },

  // 在指定容器内显示成功
  showSuccess(container, message) {
    if (!container) return;
    container.innerHTML = `
      <div class="ai-pet-success">
        <span class="ai-pet-success__icon">✅</span>
        <span>${message}</span>
      </div>
    `;
  },
};

/* BLOCK END: UI工具函数 */

/* ============================================================ */
/* BLOCK START: 悬浮窗模块                                        */
/* ============================================================ */

const AiPetFloating = {
  _el: null,
  _isDragging: false,
  _dragOffsetX: 0,
  _dragOffsetY: 0,

  // 创建悬浮窗DOM
  create() {
    if (document.getElementById('ai-pet-floating')) {
      AiPetLog.info('Floating', '悬浮窗已存在，跳过创建');
      return;
    }

    const el = document.createElement('div');
    el.id = 'ai-pet-floating';
    el.className = 'ai-pet-floating';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'AI桌宠面板');
    el.innerHTML = this._buildHTML();
    document.body.appendChild(el);
    this._el = el;

    this._bindDrag();
    this._bindClose();
    this._bindTabSwitch();

    AiPetLog.success('Floating', '悬浮窗创建完成');
  },

  _buildHTML() {
    return `
      <div class="ai-pet-floating__header" id="ai-pet-drag-handle">
        <span class="ai-pet-floating__title">🐾 AI桌宠</span>
        <div class="ai-pet-floating__header-actions">
          <button class="ai-pet-floating__theme-btn" id="ai-pet-theme-toggle" title="切换主题" aria-label="切换主题">🎨</button>
          <button class="ai-pet-floating__close" id="ai-pet-floating-close" title="关闭" aria-label="关闭面板">✕</button>
        </div>
      </div>

      <div class="ai-pet-floating__tabs" role="tablist">
        <button class="ai-pet-tab active" data-tab="pets" role="tab" aria-selected="true">桌宠</button>
        <button class="ai-pet-tab" data-tab="stats" role="tab" aria-selected="false">统计</button>
        <button class="ai-pet-tab" data-tab="relation" role="tab" aria-selected="false">关系</button>
      </div>

      <div class="ai-pet-floating__body">
        <!-- Tab: 桌宠 -->
        <div class="ai-pet-tab-panel active" data-panel="pets">
          <div class="ai-pet-slots">
            <div class="ai-pet-slot" data-slot="slot1" id="ai-pet-slot1">
              ${this._buildSlotHTML('slot1')}
            </div>
            <div class="ai-pet-slot" data-slot="slot2" id="ai-pet-slot2">
              ${this._buildSlotHTML('slot2')}
            </div>
          </div>
        </div>

        <!-- Tab: 统计 -->
        <div class="ai-pet-tab-panel" data-panel="stats">
          <div class="ai-pet-stats-panel" id="ai-pet-stats-panel">
            ${this._buildStatsHTML()}
          </div>
        </div>

        <!-- Tab: 关系 -->
        <div class="ai-pet-tab-panel" data-panel="relation">
          <div class="ai-pet-relation-panel" id="ai-pet-relation-panel">
            ${this._buildRelationHTML()}
          </div>
        </div>
      </div>
    `;
  },

  _buildSlotHTML(slotKey) {
    const pet = AiPetCore.get(`pets.${slotKey}`);
    if (!pet) {
      return `
        <div class="ai-pet-slot__empty">
          <div class="ai-pet-slot__empty-icon">➕</div>
          <div class="ai-pet-slot__empty-text">点击领养桌宠</div>
        </div>
      `;
    }
    const brand = BRAND_CONFIG[pet.brand] || BRAND_CONFIG.claude;
    return `
      <div class="ai-pet-slot__pet" data-slot="${slotKey}">
        <div class="ai-pet-avatar" style="--pet-color:${brand.color}">
          <div class="ai-pet-avatar__img-wrap">
            <img class="ai-pet-avatar__img" src="${pet.avatarUrl || ''}" alt="${pet.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
            <div class="ai-pet-avatar__placeholder" style="display:none">${brand.emoji}</div>
          </div>
          <div class="ai-pet-avatar__brand-badge">${brand.label}</div>
        </div>
        <div class="ai-pet-slot__info">
          <div class="ai-pet-slot__name">${pet.name}</div>
          <div class="ai-pet-slot__mood">${this._getMoodEmoji(pet.stats?.mood ?? 80)}</div>
        </div>
        <div class="ai-pet-slot__bars">
          ${this._buildStatBar('心情', pet.stats?.mood ?? 80, '😊')}
          ${this._buildStatBar('饥饿', pet.stats?.hunger ?? 60, '🍖')}
          ${this._buildStatBar('精力', pet.stats?.energy ?? 90, '⚡')}
          ${this._buildStatBar('清洁', pet.stats?.cleanliness ?? 70, '🛁')}
        </div>
        <div class="ai-pet-slot__actions">
          <button class="ai-pet-btn ai-pet-btn--sm" data-action="manage" data-slot="${slotKey}">管理</button>
          <button class="ai-pet-btn ai-pet-btn--sm ai-pet-btn--danger" data-action="release" data-slot="${slotKey}">放生</button>
        </div>
      </div>
    `;
  },

  _buildStatBar(label, value, icon) {
    const pct = Math.max(0, Math.min(100, value));
    const colorClass = pct > 60 ? 'high' : pct > 30 ? 'mid' : 'low';
    return `
      <div class="ai-pet-bar">
        <span class="ai-pet-bar__icon" title="${label}">${icon}</span>
        <div class="ai-pet-bar__track">
          <div class="ai-pet-bar__fill ai-pet-bar__fill--${colorClass}" style="width:${pct}%"></div>
        </div>
        <span class="ai-pet-bar__val">${pct}</span>
      </div>
    `;
  },

  _buildStatsHTML() {
    const gs = AiPetCore.get('globalStats') || {};
    const avgTime = gs.totalMessages > 0
      ? (gs.totalResponseTime / gs.totalMessages).toFixed(1)
      : '0.0';
    return `
      <div class="ai-pet-stats-grid">
        <div class="ai-pet-stat-card">
          <div class="ai-pet-stat-card__val">${gs.totalTokens ?? 0}</div>
          <div class="ai-pet-stat-card__label">累计Token</div>
        </div>
        <div class="ai-pet-stat-card">
          <div class="ai-pet-stat-card__val">${gs.totalMessages ?? 0}</div>
          <div class="ai-pet-stat-card__label">总消息数</div>
        </div>
        <div class="ai-pet-stat-card">
          <div class="ai-pet-stat-card__val">${avgTime}s</div>
          <div class="ai-pet-stat-card__label">平均响应</div>
        </div>
        <div class="ai-pet-stat-card">
          <div class="ai-pet-stat-card__val">${gs.sessionTokens ?? 0}</div>
          <div class="ai-pet-stat-card__label">本次会话</div>
        </div>
      </div>
      <div class="ai-pet-last-msg" id="ai-pet-last-msg">
        <div class="ai-pet-last-msg__label">最近一条消息</div>
        <div class="ai-pet-last-msg__content" id="ai-pet-last-msg-content">暂无数据</div>
      </div>
    `;
  },

  _buildRelationHTML() {
    const rel = AiPetCore.get('relationship') || {};
    const affection = rel.affection ?? 0;
    const pet1 = AiPetCore.get('pets.slot1');
    const pet2 = AiPetCore.get('pets.slot2');

    if (!pet1 || !pet2) {
      return `<div class="ai-pet-empty-hint">需要两只桌宠才能查看关系 🐾</div>`;
    }

    return `
      <div class="ai-pet-relation">
        <div class="ai-pet-relation__names">
          <span>${pet1.name}</span>
          <span class="ai-pet-relation__heart">💕</span>
          <span>${pet2.name}</span>
        </div>
        <div class="ai-pet-relation__bar-wrap">
          <div class="ai-pet-bar">
            <span class="ai-pet-bar__icon">💖</span>
            <div class="ai-pet-bar__track">
              <div class="ai-pet-bar__fill ai-pet-bar__fill--high"
                   style="width:${Math.min(100, affection / 10)}%"></div>
            </div>
            <span class="ai-pet-bar__val">${affection}</span>
          </div>
        </div>
        <div class="ai-pet-relation__events" id="ai-pet-relation-events">
          ${(rel.events || []).length === 0
            ? '<div class="ai-pet-empty-hint">还没有羁绊事件</div>'
            : (rel.events || []).slice(-3).map(e =>
                `<div class="ai-pet-relation__event">${e}</div>`
              ).join('')
          }
        </div>
      </div>
    `;
  },

  _getMoodEmoji(mood) {
    if (mood >= 80) return '😄';
    if (mood >= 60) return '🙂';
    if (mood >= 40) return '😐';
    if (mood >= 20) return '😟';
    return '😢';
  },

  // 刷新悬浮窗内容
  refresh() {
    if (!this._el) return;
    const slot1 = this._el.querySelector('#ai-pet-slot1');
    const slot2 = this._el.querySelector('#ai-pet-slot2');
    if (slot1) slot1.innerHTML = this._buildSlotHTML('slot1');
    if (slot2) slot2.innerHTML = this._buildSlotHTML('slot2');

    const statsPanel = this._el.querySelector('#ai-pet-stats-panel');
    if (statsPanel) statsPanel.innerHTML = this._buildStatsHTML();

    const relPanel = this._el.querySelector('#ai-pet-relation-panel');
    if (relPanel) relPanel.innerHTML = this._buildRelationHTML();

    AiPetLog.info('Floating', '悬浮窗内容已刷新');
  },

  // 更新最后一条消息信息
  updateLastMessage(info) {
    const el = document.getElementById('ai-pet-last-msg-content');
    if (!el) return;
    const template = AiPetCore.get('settings.messageTemplate') || DEFAULT_SETTINGS.settings.messageTemplate;
    const text = template
      .replace('{petName}',  info.petName  || '桌宠')
      .replace('{charName}', info.charName || '角色')
      .replace('{tokens}',   info.tokens   || 0)
      .replace('{time}',     info.time     || 0)
      .replace('{floor}',    info.floor    || 0);
    el.textContent = text;
  },

  show() {
    if (!this._el) this.create();
    this._el.classList.add('ai-pet-floating--visible');
    AiPetLog.info('Floating', '悬浮窗已显示');
  },

  hide() {
    if (!this._el) return;
    this._el.classList.remove('ai-pet-floating--visible');
    AiPetLog.info('Floating', '悬浮窗已隐藏');
  },

  toggle() {
    if (!this._el) { this.show(); return; }
    this._el.classList.contains('ai-pet-floating--visible')
      ? this.hide()
      : this.show();
  },

  // PC端拖动
  _bindDrag() {
    const handle = this._el.querySelector('#ai-pet-drag-handle');
    if (!handle) return;

    const isMobile = () => window.innerWidth <= 768;

    handle.addEventListener('mousedown', (e) => {
      if (isMobile()) return;
      if (e.target.closest('button')) return; // 不拦截按钮点击
      this._isDragging = true;
      const rect = this._el.getBoundingClientRect();
      this._dragOffsetX = e.clientX - rect.left;
      this._dragOffsetY = e.clientY - rect.top;
      this._el.style.transition = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this._isDragging) return;
      let x = e.clientX - this._dragOffsetX;
      let y = e.clientY - this._dragOffsetY;
      // 边界限制
      const maxX = window.innerWidth  - this._el.offsetWidth;
      const maxY = window.innerHeight - this._el.offsetHeight;
      x = Math.max(0, Math.min(x, maxX));
      y = Math.max(0, Math.min(y, maxY));
      this._el.style.left   = `${x}px`;
      this._el.style.top    = `${y}px`;
      this._el.style.right  = 'auto';
      this._el.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (this._isDragging) {
        this._isDragging = false;
        this._el.style.transition = '';
      }
    });
  },

  _bindClose() {
    // 事件委托到悬浮窗根元素
    this._el.addEventListener('click', (e) => {
      if (e.target.closest('#ai-pet-floating-close')) {
        this.hide();
      }
      if (e.target.closest('#ai-pet-theme-toggle')) {
        AiPetTheme.toggle();
      }
    });
  },

  _bindTabSwitch() {
    this._el.addEventListener('click', (e) => {
      const tab = e.target.closest('.ai-pet-tab');
      if (!tab) return;
      const tabName = tab.dataset.tab;

      this._el.querySelectorAll('.ai-pet-tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      this._el.querySelectorAll('.ai-pet-tab-panel').forEach(p => {
        p.classList.remove('active');
      });

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const panel = this._el.querySelector(`[data-panel="${tabName}"]`);
      if (panel) panel.classList.add('active');
    });
  },
};

/* BLOCK END: 悬浮窗模块 */

/* ============================================================ */
/* BLOCK START: 主题系统                                          */
/* ============================================================ */

const AiPetTheme = {
  apply(theme) {
    document.documentElement.setAttribute('data-ai-pet-theme', theme);
    AiPetCore.set('settings.theme', theme);
    AiPetLog.info('Theme', `主题已切换为: ${theme}`);
  },

  toggle() {
    const current = AiPetCore.get('settings.theme') || 'pink';
    const next = current === 'pink' ? 'dark' : 'pink';
    this.apply(next);
    // 同步设置面板的选择器
    const sel = document.getElementById('ai-pet-sp-theme');
    if (sel) sel.value = next;
  },

  init() {
    const theme = AiPetCore.get('settings.theme') || 'pink';
    this.apply(theme);
  },
};

/* BLOCK END: 主题系统 */

/* ============================================================ */
/* BLOCK START: 消息emoji注入                                     */
/* ============================================================ */

const AiPetMessageInject = {

  // 注入单条消息的爪子按钮
  injectOne(messageEl) {
    if (!messageEl) return;
    // 防重复注入
    if (messageEl.querySelector('.ai-pet-msg-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'ai-pet-msg-btn';
    btn.title = '打开AI桌宠面板';
    btn.setAttribute('aria-label', '打开AI桌宠面板');
    btn.innerHTML = '🐾';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      AiPetFloating.show();
      AiPetLog.info('MsgInject', '通过消息按钮打开悬浮窗');
    });

    // 注入到消息右下角
    // ST消息结构：.mes > .mes_block > .mes_text
    // 我们找 .mes_block 或直接找消息容器
    let target = messageEl.querySelector('.mes_block') || messageEl;
    target.style.position = 'relative';
    target.appendChild(btn);
  },

  // 注入所有现有AI消息
  injectAll() {
    const messages = document.querySelectorAll('.mes[is_user="false"]');
    let count = 0;
    messages.forEach(msg => {
      this.injectOne(msg);
      count++;
    });
    AiPetLog.info('MsgInject', `已注入 ${count} 条现有消息`);
  },

  // 注入最新一条AI消息
  injectLatest() {
    const messages = document.querySelectorAll('.mes[is_user="false"]');
    if (messages.length === 0) return;
    this.injectOne(messages[messages.length - 1]);
    AiPetLog.info('MsgInject', '已注入最新消息');
  },
};

/* BLOCK END: 消息emoji注入 */

/* ============================================================ */
/* BLOCK START: ST事件监听                                        */
/* ============================================================ */

const AiPetEvents = {
  _msgStartTime: null,

  init() {
    // 确保 ST 的 eventSource 可用
    if (typeof window.eventSource === 'undefined' || typeof window.event_types === 'undefined') {
      AiPetLog.error('Events', 'ST eventSource 或 event_types 不可用，事件监听失败');
      return;
    }

    // 消息开始生成时记录时间
    window.eventSource.on(window.event_types.GENERATION_STARTED, () => {
      this._msgStartTime = Date.now();
      AiPetLog.info('Events', '检测到生成开始');
    });

    // 消息接收完成
    window.eventSource.on(window.event_types.MESSAGE_RECEIVED, (data) => {
      this._onMessageReceived(data);
    });

    // 聊天切换时重新注入
    window.eventSource.on(window.event_types.CHAT_CHANGED, () => {
      AiPetLog.info('Events', '聊天已切换，重新注入消息按钮');
      setTimeout(() => AiPetMessageInject.injectAll(), 500);
    });

    AiPetLog.success('Events', 'ST事件监听已注册');
  },

  _onMessageReceived(data) {
    if (!AiPetCore.get('settings.enabled')) return;

    const elapsed = this._msgStartTime
      ? ((Date.now() - this._msgStartTime) / 1000).toFixed(1)
      : '?';

    // 从 ST context 获取信息
    let tokens = 0;
    let charName = '角色';
    let floor = 0;

    try {
      const ctx = window.getContext ? window.getContext() : null;
      if (ctx) {
        charName = ctx.name2 || ctx.characters?.[ctx.characterId]?.name || '角色';
        floor = ctx.chat?.length ?? 0;
        // ST 在某些版本会把 token 信息放在 data 或 ctx 里
        tokens = data?.token_count
          || ctx.chat?.[ctx.chat.length - 1]?.extra?.token_count
          || 0;
      }
    } catch (e) {
      AiPetLog.error('Events', '获取ST上下文失败', e);
    }

    // 更新全局统计
    const gs = AiPetCore._settings.globalStats;
    gs.totalMessages += 1;
    gs.totalTokens   += tokens;
    gs.sessionTokens += tokens;
    if (elapsed !== '?') gs.totalResponseTime += parseFloat(elapsed);
    AiPetCore.save();

    // 更新悬浮窗最后一条消息
    const pet1 = AiPetCore.get('pets.slot1');
    const petName = pet1?.name || '桌宠';
    AiPetFloating.updateLastMessage({ petName, charName, tokens, time: elapsed, floor });

    // 注入爪子按钮到最新消息
    AiPetMessageInject.injectLatest();

    AiPetLog.info('Events', `消息接收完成 | tokens:${tokens} | 用时:${elapsed}s | 楼层:${floor}`);
  },
};

/* BLOCK END: ST事件监听 */

/* ============================================================ */
/* BLOCK START: 配置面板注入                                      */
/* ============================================================ */

const AiPetSettings = {

  inject() {
    // 防重复注入
    if (document.getElementById('ai-pet-settings-panel')) {
      AiPetLog.info('Settings', '配置面板已存在，跳过注入');
      return;
    }

    AiPetLog.info('Settings', '开始注入配置面板...');

    fetch(`${EXTENSION_PATH}/settings.html`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(html => {
        // 寻找ST挂载点（多版本兼容）
        const parent = this._findParent();
        if (!parent) {
          AiPetLog.error('Settings', '找不到ST扩展挂载点');
          return;
        }

        const container = document.createElement('div');
        container.id = 'ai-pet-settings-panel';
        container.className = 'extension_container';
        container.innerHTML = html;
        parent.appendChild(container);

        // 动态加载 settings.css
        if (!document.querySelector(`link[href*="${AI_PET_FOLDER}/settings.css"]`)) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = `${EXTENSION_PATH}/settings.css`;
          document.head.appendChild(link);
          AiPetLog.info('Settings', 'settings.css 已加载');
        }

        // 同步UI数据（等DOM渲染完）
        this._syncUI();
        // 绑定事件（事件委托，只绑一次）
        this._bindEvents();

        AiPetLog.success('Settings', '配置面板注入完成');
      })
      .catch(err => {
        AiPetLog.error('Settings', '配置面板加载失败', err);
        AiPetUI.toast('配置面板加载失败，请检查插件文件', 'error');
      });
  },

  _findParent() {
    const candidates = [
      document.getElementById('extensions_settings2'),
      document.getElementById('extensions_settings'),
      document.querySelector('.extensions_block'),
      document.getElementById('top-settings-holder'),
    ];
    for (const el of candidates) {
      if (el) {
        AiPetLog.info('Settings', `找到挂载点: ${el.id || el.className}`);
        return el;
      }
    }
    AiPetLog.warn('Settings', '所有候选挂载点均不存在，回退到 document.body');
    return document.body;
  },

  _syncUI() {
    const trySync = (attempt = 0) => {
      const el = document.getElementById('ai-pet-sp-enabled');
      if (!el) {
        if (attempt < 10) {
          setTimeout(() => trySync(attempt + 1), 200);
        } else {
          AiPetLog.error('Settings', 'UI同步超时，找不到面板元素');
        }
        return;
      }

      // 同步各字段
      const s = AiPetCore._settings.settings;
      el.checked = s.enabled;

      const modeEl = document.getElementById('ai-pet-sp-mode');
      if (modeEl) modeEl.value = s.mode;

      const keyEl = document.getElementById('ai-pet-sp-apikey');
      if (keyEl) keyEl.value = s.apiKey || '';

      const urlEl = document.getElementById('ai-pet-sp-baseurl');
      if (urlEl) urlEl.value = s.apiBaseUrl || 'https://api.openai.com/v1';

      const tplEl = document.getElementById('ai-pet-sp-template');
      if (tplEl) tplEl.value = s.messageTemplate || DEFAULT_SETTINGS.settings.messageTemplate;

      const logEl = document.getElementById('ai-pet-sp-loglevel');
      if (logEl) logEl.value = s.logLevel || 'verbose';

      const themeEl = document.getElementById('ai-pet-sp-theme');
      if (themeEl) themeEl.value = s.theme || 'pink';

      // 折叠状态
      const body = document.getElementById('ai-pet-sp-body');
      const arrow = document.getElementById('ai-pet-sp-arrow');
      if (body && arrow) {
        if (s.panelCollapsed) {
          body.classList.add('collapsed');
          arrow.textContent = '▶';
        } else {
          body.classList.remove('collapsed');
          arrow.textContent = '▼';
        }
      }

      AiPetLog.success('Settings', 'UI数据同步完成');
    };

    trySync();
  },

  // 所有事件用事件委托绑定到 document，只绑一次
  _bindEvents() {
    // 防止重复绑定
    if (AiPetSettings._eventsBound) return;
    AiPetSettings._eventsBound = true;

    // 折叠/展开
    $(document).on('click', '#ai-pet-sp-toggle', function () {
      const body  = document.getElementById('ai-pet-sp-body');
      const arrow = document.getElementById('ai-pet-sp-arrow');
      if (!body) return;
      const collapsed = body.classList.toggle('collapsed');
      if (arrow) arrow.textContent = collapsed ? '▶' : '▼';
      AiPetCore.set('settings.panelCollapsed', collapsed);
    });

    // 插件总开关
    $(document).on('change', '#ai-pet-sp-enabled', function () {
      AiPetCore.set('settings.enabled', this.checked);
      AiPetUI.toast(this.checked ? '桌宠系统已启用 🐾' : '桌宠系统已关闭', this.checked ? 'success' : 'info');
    });

        // 模式切换
    $(document).on('change', '#ai-pet-sp-mode', function () {
      AiPetCore.set('settings.mode', this.value);
      AiPetUI.toast(`已切换为${this.value === 'api' ? 'API' : '免费'}模式`, 'info');
    });

    // API Key
    $(document).on('change', '#ai-pet-sp-apikey', function () {
      AiPetCore.set('settings.apiKey', this.value.trim());
    });

    // Base URL
    $(document).on('change', '#ai-pet-sp-baseurl', function () {
      AiPetCore.set('settings.apiBaseUrl', this.value.trim());
    });

    // 消息模板
    $(document).on('change', '#ai-pet-sp-template', function () {
      AiPetCore.set('settings.messageTemplate', this.value);
      AiPetUI.toast('消息模板已保存', 'success');
    });

    // 日志级别
    $(document).on('change', '#ai-pet-sp-loglevel', function () {
      AiPetCore.set('settings.logLevel', this.value);
    });

    // 主题切换
    $(document).on('change', '#ai-pet-sp-theme', function () {
      AiPetTheme.apply(this.value);
      AiPetUI.toast(this.value === 'pink' ? '已切换为粉白色系 🌸' : '已切换为黑白色系 🌑', 'info');
    });

    // 获取模型列表
    $(document).on('click', '#ai-pet-sp-fetch-models', function () {
      AiPetSettings.fetchModels();
    });

    // 模型选择
    $(document).on('change', '#ai-pet-sp-model', function () {
      AiPetCore.set('settings.model', this.value);
      AiPetUI.toast(`已选择模型: ${this.value}`, 'success');
    });

    // API连通性测试
    $(document).on('click', '#ai-pet-sp-test-api', function () {
      AiPetSettings.testApi();
    });

    AiPetLog.success('Settings', '事件委托绑定完成');
  },

  // 获取可用模型列表
  async fetchModels() {
    const btn = document.getElementById('ai-pet-sp-fetch-models');
    const select = document.getElementById('ai-pet-sp-model');
    const statusEl = document.getElementById('ai-pet-sp-model-status');

    const apiKey     = AiPetCore.get('settings.apiKey')     || '';
    const apiBaseUrl = AiPetCore.get('settings.apiBaseUrl') || 'https://api.openai.com/v1';

    if (!apiKey) {
      AiPetUI.toast('请先填写 API Key', 'error');
      return;
    }

    AiPetUI.setButtonLoading(btn, true);
    if (statusEl) {
      statusEl.textContent = '⏳ 正在获取模型列表...';
      statusEl.className = 'ai-pet-sp-status ai-pet-sp-status--loading';
    }

    try {
      const res = await fetch(`${apiBaseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const models = (data.data || [])
        .map(m => m.id)
        .filter(Boolean)
        .sort();

      if (models.length === 0) {
        throw new Error('未获取到任何模型');
      }

      // 填充 select
      if (select) {
        const currentModel = AiPetCore.get('settings.model') || '';
        select.innerHTML = models.map(m =>
          `<option value="${m}" ${m === currentModel ? 'selected' : ''}>${m}</option>`
        ).join('');
        select.disabled = false;
      }

      if (statusEl) {
        statusEl.textContent = `✅ 获取到 ${models.length} 个模型`;
        statusEl.className = 'ai-pet-sp-status ai-pet-sp-status--success';
      }

      AiPetUI.toast(`获取到 ${models.length} 个模型`, 'success');
      AiPetLog.success('Settings', `模型列表获取成功，共 ${models.length} 个`);

    } catch (e) {
      AiPetLog.error('Settings', '获取模型列表失败', e);
      if (statusEl) {
        statusEl.textContent = `❌ 获取失败: ${e.message}`;
        statusEl.className = 'ai-pet-sp-status ai-pet-sp-status--error';
      }
      AiPetUI.toast(`获取模型失败: ${e.message}`, 'error');
    } finally {
      AiPetUI.setButtonLoading(btn, false, '获取模型');
    }
  },

  // API连通性测试
  async testApi() {
    const btn = document.getElementById('ai-pet-sp-test-api');
    const statusEl = document.getElementById('ai-pet-sp-test-status');

    const apiKey     = AiPetCore.get('settings.apiKey')     || '';
    const apiBaseUrl = AiPetCore.get('settings.apiBaseUrl') || 'https://api.openai.com/v1';
    const model      = AiPetCore.get('settings.model')      || '';

    if (!apiKey) {
      AiPetUI.toast('请先填写 API Key', 'error');
      return;
    }
    if (!model) {
      AiPetUI.toast('请先选择模型', 'error');
      return;
    }

    AiPetUI.setButtonLoading(btn, true);
    if (statusEl) {
      statusEl.textContent = '⏳ 正在测试连接...';
      statusEl.className = 'ai-pet-sp-status ai-pet-sp-status--loading';
    }

    try {
      const res = await fetch(`${apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || '(无回复)';

      if (statusEl) {
        statusEl.textContent = `✅ 连接成功！回复: ${reply}`;
        statusEl.className = 'ai-pet-sp-status ai-pet-sp-status--success';
      }
      AiPetUI.toast('API连接测试成功 ✅', 'success');
      AiPetLog.success('Settings', 'API连通性测试成功', reply);

    } catch (e) {
      AiPetLog.error('Settings', 'API连通性测试失败', e);
      if (statusEl) {
        statusEl.textContent = `❌ 连接失败: ${e.message}`;
        statusEl.className = 'ai-pet-sp-status ai-pet-sp-status--error';
      }
      AiPetUI.toast(`连接失败: ${e.message}`, 'error');
    } finally {
      AiPetUI.setButtonLoading(btn, false, '测试连接');
    }
  },
};

/* BLOCK END: 配置面板注入 */

/* ============================================================ */
/* BLOCK START: 插件初始化入口                                    */
/* ============================================================ */

const AiPetInit = {

  async run() {
    AiPetLog.info('Init', `${AI_PET_NAME} v${AI_PET_VERSION} 开始初始化...`);

    // 1. 加载设置
    AiPetCore.load();

    // 2. 初始化主题
    AiPetTheme.init();

    // 3. 加载主样式
    this._loadMainCSS();

    // 4. 注入配置面板（等ST的扩展设置区域渲染完）
    this._waitForST(() => {
      AiPetSettings.inject();
    });

    // 5. 注册ST事件监听
    this._waitForEvents(() => {
      AiPetEvents.init();
    });

    // 6. 注入现有消息的爪子按钮（等聊天区域渲染完）
    this._waitForChat(() => {
      AiPetMessageInject.injectAll();
    });

    AiPetLog.success('Init', '初始化流程启动完成');
  },

  _loadMainCSS() {
    if (document.querySelector(`link[href*="${AI_PET_FOLDER}/style.css"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${EXTENSION_PATH}/style.css`;
    document.head.appendChild(link);
    AiPetLog.info('Init', 'style.css 已加载');
  },

  // 等待ST扩展设置区域出现
  _waitForST(cb, attempt = 0) {
    const found =
      document.getElementById('extensions_settings2') ||
      document.getElementById('extensions_settings') ||
      document.querySelector('.extensions_block');

    if (found) {
      cb();
    } else if (attempt < 20) {
      setTimeout(() => this._waitForST(cb, attempt + 1), 300);
    } else {
      AiPetLog.warn('Init', 'ST扩展挂载点等待超时，强制注入');
      cb();
    }
  },

  // 等待ST事件系统就绪
  _waitForEvents(cb, attempt = 0) {
    if (
      typeof window.eventSource !== 'undefined' &&
      typeof window.event_types !== 'undefined'
    ) {
      cb();
    } else if (attempt < 20) {
      setTimeout(() => this._waitForEvents(cb, attempt + 1), 300);
    } else {
      AiPetLog.error('Init', 'ST事件系统等待超时，事件监听未注册');
    }
  },

  // 等待聊天区域出现
  _waitForChat(cb, attempt = 0) {
    const chat = document.getElementById('chat') || document.querySelector('#chat');
    if (chat) {
      cb();
    } else if (attempt < 20) {
      setTimeout(() => this._waitForChat(cb, attempt + 1), 300);
    } else {
      AiPetLog.warn('Init', '聊天区域等待超时，跳过初始注入');
    }
  },
};

/* BLOCK END: 插件初始化入口 */

/* ============================================================ */
/* BLOCK START: ST插件注册                                        */
/* ============================================================ */

// SillyTavern 扩展入口：jQuery ready 后执行
jQuery(async () => {
  try {
    await AiPetInit.run();
  } catch (e) {
    console.error(`[${AI_PET_NAME}] 初始化异常:`, e);
  }
});

/* BLOCK END: ST插件注册 */


