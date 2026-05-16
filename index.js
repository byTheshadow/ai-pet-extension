/* ============================================================ */
/* BLOCK START: ST全局API适配层                                   */
/* ============================================================ */

// ST通过 window.SillyTavern.getContext() 暴露所有API
// 用getter懒加载，确保每次调用都拿到最新的context引用
const ST = {
  get ctx() {
    return window.SillyTavern.getContext();
  },
  get eventSource() {
    return this.ctx.eventSource;
  },
  get event_types() {
    // ST列表里两个名字都有，优先用event_types，回退eventTypes
    return this.ctx.event_types ?? this.ctx.eventTypes;
  },
  get extensionSettings() {
    return this.ctx.extensionSettings;
  },
  get saveSettingsDebounced() {
    return this.ctx.saveSettingsDebounced;
  },
  getContext() {
    return this.ctx;
  },
};

/* BLOCK END: ST全局API适配层 */

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
    mode:            'free',
    apiKey:          '',
    apiBaseUrl:      'https://api.openai.com/v1',
    model:           '',
    messageTemplate: '{petName}这次和{charName}聊天消耗了{tokens}tk，用时{time}秒，第{floor}楼',
    logLevel:        'verbose',
    theme:           'pink',
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
    if (AiPetCore.getLogLevel() === 'verbose') {
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
    if (AiPetCore.getLogLevel() === 'verbose') {
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

  getLogLevel() {
    return this._settings?.settings?.logLevel ?? 'verbose';
  },

  load() {
    try {
      if (!ST.extensionSettings.ai_pet_extension) {
        ST.extensionSettings.ai_pet_extension = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        AiPetLog.info('Core', '未找到已存储设置，已初始化默认值');
      } else {
        // 深度合并，补全新增字段
        ST.extensionSettings.ai_pet_extension = this._deepMerge(
          JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
          ST.extensionSettings.ai_pet_extension
        );
        AiPetLog.success('Core', '设置加载成功');
      }
      // 直接引用，不做拷贝，保持与ST存储同步
      this._settings = ST.extensionSettings.ai_pet_extension;
    } catch (e) {
      AiPetLog.error('Core', '设置加载失败，使用默认值', e);
      this._settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
  },

  save() {
    try {
      ST.saveSettingsDebounced();
      AiPetLog.info('Core', '设置已保存');
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
    if (target !== undefined && last) {
      target[last] = value;
      this.save();
    }
  },

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

  toast(message, type = 'info', duration = 3000) {
    const existing = document.getElementById('ai-pet-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'ai-pet-toast';
    toast.className = `ai-pet-toast ai-pet-toast--${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('ai-pet-toast--show'));
    });

    setTimeout(() => {
      toast.classList.remove('ai-pet-toast--show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

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

  showLoading(container, message = '加载中...') {
    if (!container) return;
    container.innerHTML = `
      <div class="ai-pet-loading">
        <div class="ai-pet-loading__spinner"></div>
        <span>${message}</span>
      </div>`;
  },

  showError(container, message) {
    if (!container) return;
    container.innerHTML = `
      <div class="ai-pet-error">
        <span>❌</span><span>${message}</span>
      </div>`;
  },

  showSuccess(container, message) {
    if (!container) return;
    container.innerHTML = `
      <div class="ai-pet-success">
        <span>✅</span><span>${message}</span>
      </div>`;
  },
};

/* BLOCK END: UI工具函数 */

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
/* BLOCK START: 悬浮窗模块                                        */
/* ============================================================ */

const AiPetFloating = {
  _el: null,
  _isDragging: false,
  _dragOffsetX: 0,
  _dragOffsetY: 0,

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
        <div class="ai-pet-tab-panel active" data-panel="pets">
          <div class="ai-pet-slots">
            <div class="ai-pet-slot" data-slot="slot1" id="ai-pet-slot1">${this._buildSlotHTML('slot1')}</div>
            <div class="ai-pet-slot" data-slot="slot2" id="ai-pet-slot2">${this._buildSlotHTML('slot2')}</div>
          </div>
        </div>
        <div class="ai-pet-tab-panel" data-panel="stats">
          <div class="ai-pet-stats-panel" id="ai-pet-stats-panel">${this._buildStatsHTML()}</div>
        </div>
        <div class="ai-pet-tab-panel" data-panel="relation">
          <div class="ai-pet-relation-panel" id="ai-pet-relation-panel">${this._buildRelationHTML()}</div>
        </div>
      </div>`;
  },

  _buildSlotHTML(slotKey) {
    const pet = AiPetCore.get(`pets.${slotKey}`);
    if (!pet) {
      return `
        <div class="ai-pet-slot__empty" data-action="adopt" data-slot="${slotKey}" role="button" tabindex="0" aria-label="领养桌宠">
          <div class="ai-pet-slot__empty-icon">➕</div>
          <div class="ai-pet-slot__empty-text">点击领养桌宠</div>
        </div>`;
    }
    const brand = BRAND_CONFIG[pet.brand] || BRAND_CONFIG.claude;
    return `
      <div class="ai-pet-slot__pet" data-slot="${slotKey}">
        <div class="ai-pet-avatar" style="--pet-color:${brand.color}">
          <div class="ai-pet-avatar__img-wrap">
            <img class="ai-pet-avatar__img" src="${pet.avatarUrl || ''}" alt="${pet.name}"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
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
      </div>`;
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
      </div>`;
  },

  _buildStatsHTML() {
    const gs = AiPetCore.get('globalStats') || {};
    const avgTime = gs.totalMessages > 0
      ? (gs.totalResponseTime / gs.totalMessages).toFixed(1) : '0.0';
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
      <div class="ai-pet-last-msg">
        <div class="ai-pet-last-msg__label">最近一条消息</div>
        <div class="ai-pet-last-msg__content" id="ai-pet-last-msg-content">暂无数据</div>
      </div>`;
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
        <div class="ai-pet-relation__events">
          ${(rel.events || []).length === 0
            ? '<div class="ai-pet-empty-hint">还没有羁绊事件</div>'
            : (rel.events || []).slice(-3).map(e =>
                `<div class="ai-pet-relation__event">${e}</div>`
              ).join('')}
        </div>
      </div>`;
  },

  _getMoodEmoji(mood) {
    if (mood >= 80) return '😄';
    if (mood >= 60) return '🙂';
    if (mood >= 40) return '😐';
    if (mood >= 20) return '😟';
    return '😢';
  },

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
  },

  updateLastMessage(info) {
    const el = document.getElementById('ai-pet-last-msg-content');
    if (!el) return;
    const template = AiPetCore.get('settings.messageTemplate')
      || DEFAULT_SETTINGS.settings.messageTemplate;
    el.textContent = template
      .replace('{petName}',  info.petName  || '桌宠')
      .replace('{charName}', info.charName || '角色')
      .replace('{tokens}',   info.tokens   || 0)
      .replace('{time}',     info.time     || 0)
      .replace('{floor}',    info.floor    || 0);
  },

  show() {
    if (!this._el) this.create();
    this._el.classList.add('ai-pet-floating--visible');
  },

  hide() {
    if (!this._el) return;
    this._el.classList.remove('ai-pet-floating--visible');
  },

  toggle() {
    if (!this._el) { this.show(); return; }
    this._el.classList.contains('ai-pet-floating--visible') ? this.hide() : this.show();
  },

  _bindDrag() {
    const handle = this._el.querySelector('#ai-pet-drag-handle');
    if (!handle) return;
    const isMobile = () => window.innerWidth <= 768;

    handle.addEventListener('mousedown', (e) => {
      if (isMobile() || e.target.closest('button')) return;
      this._isDragging = true;
      const rect = this._el.getBoundingClientRect();
      this._dragOffsetX = e.clientX - rect.left;
      this._dragOffsetY = e.clientY - rect.top;
      this._el.style.transition = 'none';
      this._el.classList.add('dragging');
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this._isDragging) return;
      let x = Math.max(0, Math.min(e.clientX - this._dragOffsetX, window.innerWidth  - this._el.offsetWidth));
      let y = Math.max(0, Math.min(e.clientY - this._dragOffsetY, window.innerHeight - this._el.offsetHeight));
      this._el.style.left   = `${x}px`;
      this._el.style.top    = `${y}px`;
      this._el.style.right  = 'auto';
      this._el.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (this._isDragging) {
        this._isDragging = false;
        this._el.style.transition = '';
        this._el.classList.remove('dragging');
      }
    });
  },

  _bindClose() {
    this._el.addEventListener('click', (e) => {
      if (e.target.closest('#ai-pet-floating-close')) this.hide();
      if (e.target.closest('#ai-pet-theme-toggle'))   AiPetTheme.toggle();
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
      this._el.querySelectorAll('.ai-pet-tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const panel = this._el.querySelector(`[data-panel="${tabName}"]`);
      if (panel) panel.classList.add('active');
    });
  },
};

/* BLOCK END: 悬浮窗模块 */

/* ============================================================ */
/* BLOCK START: 消息emoji注入                                     */
/* ============================================================ */

const AiPetMessageInject = {

  injectOne(messageEl) {
    if (!messageEl) return;
    if (messageEl.querySelector('.ai-pet-msg-btn')) return; // 防重复

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

    // ST消息DOM结构：.mes > .mes_block > .mes_text
    // 将按钮注入到 .mes_block，使其相对定位在右下角
    const target = messageEl.querySelector('.mes_block') || messageEl;
    // 确保父容器有相对定位
    if (getComputedStyle(target).position === 'static') {
      target.style.position = 'relative';
    }
    target.appendChild(btn);
  },

  injectAll() {
    // ST中AI消息：.mes 且 is_user 属性为 "false" 或不存在
    const messages = document.querySelectorAll('.mes[is_user="false"]');
    let count = 0;
    messages.forEach(msg => { this.injectOne(msg); count++; });
    AiPetLog.info('MsgInject', `已注入 ${count} 条现有消息`);
  },

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
    ST.eventSource.on(ST.event_types.GENERATION_STARTED, () => {
      this._msgStartTime = Date.now();
      AiPetLog.info('Events', '检测到生成开始');
    });

    ST.eventSource.on(ST.event_types.MESSAGE_RECEIVED, (data) => {
      this._onMessageReceived(data);
    });

    ST.eventSource.on(ST.event_types.CHAT_CHANGED, () => {
      AiPetLog.info('Events', '聊天已切换，重新注入消息按钮');
      setTimeout(() => AiPetMessageInject.injectAll(), 500);
    });

    AiPetLog.success('Events', 'ST事件监听已注册');
  },

  _onMessageReceived(data) {
    if (!AiPetCore.get('settings.enabled')) return;

    const elapsed = this._msgStartTime
      ? ((Date.now() - this._msgStartTime) / 1000).toFixed(1) : '?';

    let tokens = 0, charName = '角色', floor = 0;
    try {
      const ctx = ST.getContext();
      if (ctx) {
        charName = ctx.name2
          || ctx.characters?.[ctx.characterId]?.name
          || '角色';
        floor  = ctx.chat?.length ?? 0;
        tokens = data?.token_count
          || ctx.chat?.[ctx.chat.length - 1]?.extra?.token_count
          || 0;
      }
    } catch (e) {
      AiPetLog.error('Events', '获取ST上下文失败', e);
    }

    // 更新全局统计（直接操作引用，再save）
    const gs = AiPetCore._settings.globalStats;
    gs.totalMessages  += 1;
    gs.totalTokens    += tokens;
    gs.sessionTokens  += tokens;
    if (elapsed !== '?') gs.totalResponseTime += parseFloat(elapsed);
    AiPetCore.save();

    const petName = AiPetCore.get('pets.slot1')?.name || '桌宠';
    AiPetFloating.updateLastMessage({ petName, charName, tokens, time: elapsed, floor });

    // 注入爪子按钮到最新消息
    AiPetMessageInject.injectLatest();

    AiPetLog.info('Events', `消息接收 | tokens:${tokens} | 用时:${elapsed}s | 楼层:${floor}`);
  },
};

/* BLOCK END: ST事件监听 */

/* ============================================================ */
/* BLOCK START: 配置面板注入                                      */
/* ============================================================ */

const AiPetSettings = {
  _eventsBound: false,

  inject() {
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

        this._syncUI();
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

      const s = AiPetCore._settings.settings;

      const enabledEl = document.getElementById('ai-pet-sp-enabled');
      if (enabledEl) enabledEl.checked = s.enabled;

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

      // 如果已有保存的模型，填入select
      if (s.model) {
        const modelEl = document.getElementById('ai-pet-sp-model');
        if (modelEl) {
          // 先添加一个已保存的选项，等用户点获取模型后会被替换
          modelEl.innerHTML = `<option value="${s.model}" selected>${s.model}</option>`;
          modelEl.disabled = false;
        }
      }

      // 折叠状态
      const body  = document.getElementById('ai-pet-sp-body');
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

  _bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;

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

    // 导出数据
    $(document).on('click', '#ai-pet-sp-export', function () {
      AiPetSettings.exportData();
    });

    // 清空数据
    $(document).on('click', '#ai-pet-sp-clear', function () {
      AiPetSettings.clearData();
    });

    AiPetLog.success('Settings', '事件委托绑定完成');
  },

  async fetchModels() {
    const btn      = document.getElementById('ai-pet-sp-fetch-models');
    const select   = document.getElementById('ai-pet-sp-model');
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
      const data   = await res.json();
      const models = (data.data || []).map(m => m.id).filter(Boolean).sort();

      if (models.length === 0) throw new Error('未获取到任何模型');

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

  async testApi() {
    const btn      = document.getElementById('ai-pet-sp-test-api');
    const statusEl = document.getElementById('ai-pet-sp-test-status');

    const apiKey     = AiPetCore.get('settings.apiKey')     || '';
    const apiBaseUrl = AiPetCore.get('settings.apiBaseUrl') || 'https://api.openai.com/v1';
    const model      = AiPetCore.get('settings.model')      || '';

    if (!apiKey) { AiPetUI.toast('请先填写 API Key', 'error'); return; }
    if (!model)  { AiPetUI.toast('请先选择模型', 'error');     return; }

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
      const data  = await res.json();
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
      AiPetUI.setButtonLoading(btn, false, '🔌 测试连接');
    }
  },

  exportData() {
    try {
      const data = JSON.stringify(AiPetCore._settings, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `ai-pet-data-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      AiPetUI.toast('数据已导出 📤', 'success');
      AiPetLog.success('Settings', '数据导出成功');
    } catch (e) {
      AiPetLog.error('Settings', '数据导出失败', e);
      AiPetUI.toast('导出失败: ' + e.message, 'error');
    }
  },

  clearData() {
    if (!confirm('确定要清空所有桌宠数据吗？此操作不可撤销！')) return;
    try {
      ST.extensionSettings.ai_pet_extension = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      AiPetCore._settings = ST.extensionSettings.ai_pet_extension;
      ST.saveSettingsDebounced();
      AiPetFloating.refresh();
      AiPetSettings._syncUI();
      AiPetUI.toast('数据已清空 🗑️', 'info');
      AiPetLog.info('Settings', '数据已清空');
    } catch (e) {
      AiPetLog.error('Settings', '数据清空失败', e);
      AiPetUI.toast('清空失败: ' + e.message, 'error');
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

    // 4. 注入配置面板
    this._waitForST(() => {
      AiPetSettings.inject();
    });

    // 5. 注册ST事件监听
    AiPetEvents.init();

    // 6. 注入现有消息的爪子按钮
    this._waitForChat(() => {
      AiPetMessageInject.injectAll();
    });

    AiPetLog.success('Init', '初始化流程启动完成');
  },

  _loadMainCSS() {
    if (document.querySelector(`link[href*="${AI_PET_FOLDER}/style.css"]`)) return;
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = `${EXTENSION_PATH}/style.css`;
    document.head.appendChild(link);
    AiPetLog.info('Init', 'style.css 已加载');
  },

  _waitForST(cb, attempt = 0) {
    const found =
      document.getElementById('extensions_settings2') ||
      document.getElementById('extensions_settings')  ||
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

  _waitForChat(cb, attempt = 0) {
    const chat = document.getElementById('chat');
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

jQuery(async () => {
  try {
    await AiPetInit.run();
  } catch (e) {
    console.error(`[${AI_PET_NAME}] 初始化异常:`, e);
  }
});

/* BLOCK END: ST插件注册 */

          


