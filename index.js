/* ============================================================ */
/* BLOCK START: 模块元信息与常量定义                              */
/* ============================================================ */

const AI_PET_NAME    = 'AI桌宠系统';
const AI_PET_VERSION = '1.0.0-phase1';
const AI_PET_EXT_PATH = '/scripts/extensions/third-party/ai-pet-extension';

const BRANDS = {
  claude:   { label: 'Claude',   color: '#E8845A', accent: '#F4A87C' },
  gemini:   { label: 'Gemini',   color: '#8B7CF6', accent: '#A78BFA' },
  deepseek: { label: 'DeepSeek', color: '#3B82F6', accent: '#60A5FA' },
  gpt:      { label: 'GPT',      color: '#10B981', accent: '#34D399' },
};

const DEFAULT_SETTINGS = {
  settings: {
    enabled:         true,
    mode:            'free',       // 'free' | 'api'
    apiKey:          '',
    apiBaseUrl:      'https://api.openai.com/v1',
    model:           '',
    availableModels: [],
    messageTemplate: '{petName}这次和{charName}聊天消耗了{tokens}tk，用时{time}秒，第{floor}楼',
    logLevel:        'verbose',    // 'verbose' | 'error'
    theme:           'pink',       // 'pink' | 'dark'
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

const PET_TEMPLATE = {
  id:        '',
  brand:     'claude',
  skin:      0,
  name:      '',
  birthday:  '',
  stats: {
    mood:        80,
    hunger:      60,
    energy:      90,
    cleanliness: 70,
    intimacy:    0,
  },
  personality: {
    trait:      '',
    catchphrase: '',
    likes: {
      presets: [],
      custom:  [],
    },
  },
  address: {
    userNickname: '',
    currentTitle: '主人',
  },
  memory:      [],
  history:     [],
  diary:       [],
  stats_meta: {
    totalInteractions: 0,
    createdAt:         '',
    lastActiveAt:      '',
    consecutiveDays:   0,
  },
};

/* BLOCK END: 模块元信息与常量定义 */

/* ============================================================ */
/* BLOCK START: 日志系统                                         */
/* ============================================================ */

const AIPetLog = {
  _prefix: `[${AI_PET_NAME} v${AI_PET_VERSION}]`,

  _shouldLog(level) {
    const s = AIPetCore.getSettings();
    if (!s) return true;
    if (s.logLevel === 'error' && level !== 'error') return false;
    return true;
  },

  info(tag, ...args) {
    if (!this._shouldLog('info')) return;
    console.log(`%c${this._prefix}%c [${tag}]`, 'color:#E8845A;font-weight:bold', 'color:#888', ...args);
  },

  warn(tag, ...args) {
    if (!this._shouldLog('warn')) return;
    console.warn(`${this._prefix} [${tag}]`, ...args);
  },

  error(tag, ...args) {
    console.error(`${this._prefix} [ERROR][${tag}]`, ...args);
  },

  debug(tag, ...args) {
    if (!this._shouldLog('debug')) return;
    console.debug(`${this._prefix} [${tag}]`, ...args);
  },
};

/* BLOCK END: 日志系统 */

/* ============================================================ */
/* BLOCK START: 核心数据管理                                     */
/* ============================================================ */

const AIPetCore = {
  _data: null,

  /** 从 extensionSettings 加载，缺失字段用默认值补全 */
  load() {
    try {
      const raw = extension_settings['ai_pet_extension'];
      if (raw) {
        // 深度合并：保留用户数据，补全缺失字段
        this._data = this._deepMerge(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), raw);
      } else {
        this._data = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      }
      AIPetLog.info('Core', '数据加载成功', this._data);
    } catch (e) {
      AIPetLog.error('Core', '数据加载失败，使用默认值', e);
      this._data = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
  },

  save() {
    try {
      extension_settings['ai_pet_extension'] = this._data;
      saveSettingsDebounced();
      AIPetLog.debug('Core', '数据已保存');
    } catch (e) {
      AIPetLog.error('Core', '数据保存失败', e);
    }
  },

  getData()     { return this._data; },
  getSettings() { return this._data?.settings; },
  getPets()     { return this._data?.pets; },
  getRelationship() { return this._data?.relationship; },
  getGlobalStats()  { return this._data?.globalStats; },

  updateSettings(patch) {
    Object.assign(this._data.settings, patch);
    this.save();
  },

  updatePet(slot, petData) {
    this._data.pets[slot] = petData;
    this.save();
  },

  updateGlobalStats(patch) {
    Object.assign(this._data.globalStats, patch);
    this.save();
  },

  /** 简单深度合并（target被source补全，不覆盖已有值） */
  _deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key] || typeof target[key] !== 'object') target[key] = {};
        this._deepMerge(target[key], source[key]);
      } else {
        // source的值优先（用户数据覆盖默认值）
        target[key] = source[key];
      }
    }
    return target;
  },

  /** 生成UUID */
  generateId() {
    return 'pet_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  },

  /** 创建新桌宠对象 */
  createPet(brand, name, skin = 0) {
    const pet = JSON.parse(JSON.stringify(PET_TEMPLATE));
    pet.id       = this.generateId();
    pet.brand    = brand;
    pet.name     = name;
    pet.skin     = skin;
    pet.birthday = new Date().toISOString().slice(0, 10);
    pet.stats_meta.createdAt    = pet.birthday;
    pet.stats_meta.lastActiveAt = pet.birthday;
    return pet;
  },
};

/* BLOCK END: 核心数据管理 */

/* ============================================================ */
/* BLOCK START: ST事件监听与消息处理                              */
/* ============================================================ */

const AIPetEvents = {
  _lastMessageTime: null,

  init() {
    // 监听AI消息接收
    eventSource.on(event_types.MESSAGE_RECEIVED, (idx) => {
      this._onMessageReceived(idx);
    });

    // 监听消息发送（记录发送时间，用于计算响应时间）
    eventSource.on(event_types.MESSAGE_SENT, () => {
      this._lastMessageTime = Date.now();
      AIPetLog.debug('Events', '消息已发送，开始计时');
    });

    AIPetLog.info('Events', 'ST事件监听已注册');
  },

  _onMessageReceived(messageIndex) {
    const settings = AIPetCore.getSettings();
    if (!settings?.enabled) return;

    try {
      const ctx     = getContext();
      const message = ctx.chat[messageIndex];
      if (!message) return;

      // 计算响应时间
      const responseTime = this._lastMessageTime
        ? ((Date.now() - this._lastMessageTime) / 1000).toFixed(1)
        : '?';
      this._lastMessageTime = null;

      // 估算token数（ST原生数据优先，否则按字符数估算）
      const tokens = message.extra?.token_count
        || Math.ceil((message.mes || '').length / 3);

      // 更新全局统计
      const gs = AIPetCore.getGlobalStats();
      AIPetCore.updateGlobalStats({
        totalTokens:       gs.totalTokens + tokens,
        totalMessages:     gs.totalMessages + 1,
        totalResponseTime: gs.totalResponseTime + parseFloat(responseTime),
        sessionTokens:     gs.sessionTokens + tokens,
      });

      AIPetLog.info('Events', `消息#${messageIndex} 接收 | tokens:${tokens} | 响应时间:${responseTime}s`);

      // 注入emoji按钮到该消息
      AIPetUI.injectMessageButton(messageIndex, {
        tokens,
        responseTime,
        floor: messageIndex + 1,
        charName: message.name || ctx.characters?.[ctx.characterId]?.name || 'AI',
      });

      // 触发桌宠属性更新
      AIPetPetManager.onMessageReceived(tokens);

    } catch (e) {
      AIPetLog.error('Events', '消息处理失败', e);
    }
  },
};

/* BLOCK END: ST事件监听与消息处理 */

/* ============================================================ */
/* BLOCK START: 桌宠管理器                                       */
/* ============================================================ */

const AIPetPetManager = {
  /** 消息到来时更新桌宠状态 */
  onMessageReceived(tokens) {
    const pets = AIPetCore.getPets();
    let changed = false;

    for (const slot of ['slot1', 'slot2']) {
      const pet = pets[slot];
      if (!pet) continue;

      // 对话增加亲密度
      pet.stats.intimacy += 1;
      // 消耗精力
      pet.stats.energy = Math.max(0, pet.stats.energy - 2);
      // 心情微增
      pet.stats.mood = Math.min(100, pet.stats.mood + 1);
      // 更新最后活跃时间
      pet.stats_meta.lastActiveAt = new Date().toISOString().slice(0, 10);
      pet.stats_meta.totalInteractions += 1;

      changed = true;
    }

    if (changed) {
      AIPetCore.save();
      AIPetLog.debug('PetManager', '桌宠状态已更新');
    }
  },

  /** 属性自然衰减（每小时调用一次） */
  naturalDecay() {
    const pets = AIPetCore.getPets();
    let changed = false;

    for (const slot of ['slot1', 'slot2']) {
      const pet = pets[slot];
      if (!pet) continue;

      pet.stats.hunger      = Math.max(0, pet.stats.hunger - 1);
      pet.stats.cleanliness = Math.max(0, pet.stats.cleanliness - 0.5);
      pet.stats.energy      = Math.min(100, pet.stats.energy + 0.5); // 休息恢复精力
      changed = true;
    }

    if (changed) {
      AIPetCore.save();
      AIPetLog.debug('PetManager', '属性自然衰减已执行');
    }
  },

  /** 获取称呼（根据亲密度） */
  getTitleByIntimacy(intimacy) {
    if (intimacy < 10)  return '主人';
    if (intimacy < 30)  return '亲爱的主人';
    if (intimacy < 60)  return '我的主人';
    if (intimacy < 100) return '最重要的人';
    return '永远的伴侣';
  },
};

/* BLOCK END: 桌宠管理器 */

/* ============================================================ */
/* BLOCK START: UI系统 - 悬浮窗与消息注入                        */
/* ============================================================ */

const AIPetUI = {
  _floatVisible: false,
  _dragState:    null,
  _currentMsgData: null,

  init() {
    this._createFloatWindow();
    this._bindEvents();
    AIPetLog.info('UI', '悬浮窗UI已初始化');
  },

  /* ── 消息emoji按钮注入 ── */
  injectMessageButton(messageIndex, msgData) {
    // 找到对应消息的DOM（ST的消息容器）
    const msgEl = document.querySelector(
      `.mes[mesid="${messageIndex}"], .message[mesid="${messageIndex}"]`
    );
    if (!msgEl) {
      AIPetLog.warn('UI', `找不到消息DOM #${messageIndex}`);
      return;
    }

    // 防重复注入
    if (msgEl.querySelector('.ai-pet-msg-btn')) return;

    const btn = document.createElement('button');
    btn.className   = 'ai-pet-msg-btn';
    btn.textContent = '🐾';
    btn.title       = '打开AI桌宠';
    btn.dataset.msgIndex = messageIndex;
    btn.dataset.msgData  = JSON.stringify(msgData);

    // 找消息底部操作区
    const actionsEl = msgEl.querySelector('.mes_buttons, .message-buttons, .mes_block');
    if (actionsEl) {
      actionsEl.appendChild(btn);
    } else {
      // 兜底：直接加到消息末尾
      msgEl.appendChild(btn);
    }

    AIPetLog.debug('UI', `🐾 按钮已注入到消息 #${messageIndex}`);
  },

  /* ── 悬浮窗创建 ── */
  _createFloatWindow() {
    if (document.getElementById('ai-pet-float')) return;

    const theme = AIPetCore.getSettings()?.theme || 'pink';

    const win = document.createElement('div');
    win.id        = 'ai-pet-float';
    win.className = `ai-pet-float theme-${theme}`;
    win.innerHTML = this._getFloatHTML();
    document.body.appendChild(win);

    AIPetLog.debug('UI', '悬浮窗DOM已创建');
  },

  _getFloatHTML() {
    return `
      <!-- 设备外壳 -->
      <div class="pet-device">

        <!-- 顶部状态栏 -->
        <div class="pet-device-header">
          <div class="pet-device-drag-handle" id="ai-pet-drag-handle">
            <span class="pet-device-title">AI桌宠</span>
            <div class="pet-device-controls">
              <button class="pet-ctrl-btn" id="ai-pet-theme-toggle" title="切换主题">🎨</button>
              <button class="pet-ctrl-btn" id="ai-pet-close" title="关闭">✕</button>
            </div>
          </div>
        </div>

        <!-- 屏幕区域 -->
        <div class="pet-screen">

          <!-- 页面：主界面（无桌宠时） -->
          <div class="pet-page" id="pet-page-empty">
            <div class="pet-empty-state">
              <div class="pet-empty-icon">🥚</div>
              <p class="pet-empty-text">还没有桌宠</p>
              <button class="pet-btn-primary" id="pet-btn-add-first">领养第一只</button>
            </div>
          </div>

          <!-- 页面：桌宠主界面 -->
          <div class="pet-page hidden" id="pet-page-main">
            <!-- 桌宠展示区 -->
            <div class="pet-display-area">
              <div class="pet-slot" id="pet-slot-1">
                <div class="pet-avatar-wrap">
                  <div class="pet-avatar placeholder" id="pet-avatar-1">
                    <!-- SVG占位符 -->
                    <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="40" cy="35" r="22" fill="currentColor" opacity="0.3"/>
                      <circle cx="40" cy="35" r="18" fill="currentColor" opacity="0.5"/>
                      <text x="40" y="41" text-anchor="middle" font-size="18">🤖</text>
                    </svg>
                  </div>
                  <div class="pet-bubble hidden" id="pet-bubble-1"></div>
                </div>
                <div class="pet-name" id="pet-name-1">-</div>
                <div class="pet-brand-badge" id="pet-brand-1">-</div>
              </div>

              <div class="pet-slot-divider" id="pet-slot-divider">
                <span class="pet-relation-heart">💕</span>
                <span class="pet-relation-val" id="pet-relation-val">0</span>
              </div>

              <div class="pet-slot" id="pet-slot-2">
                <div class="pet-avatar-wrap">
                  <div class="pet-avatar placeholder" id="pet-avatar-2">
                    <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="40" cy="35" r="22" fill="currentColor" opacity="0.3"/>
                      <circle cx="40" cy="35" r="18" fill="currentColor" opacity="0.5"/>
                      <text x="40" y="41" text-anchor="middle" font-size="18">🤖</text>
                    </svg>
                  </div>
                  <div class="pet-bubble hidden" id="pet-bubble-2"></div>
                </div>
                <div class="pet-name" id="pet-name-2">-</div>
                <div class="pet-brand-badge" id="pet-brand-2">-</div>
              </div>
            </div>

            <!-- 消息信息面板 -->
            <div class="pet-msg-panel" id="pet-msg-panel">
              <div class="pet-msg-panel-title">📊 本次对话</div>
              <div class="pet-msg-info" id="pet-msg-info">
                <span class="pet-msg-info-item">等待消息...</span>
              </div>
            </div>

            <!-- 统计栏 -->
            <div class="pet-stats-bar">
              <div class="pet-stat-item">
                <span class="pet-stat-label">总Token</span>
                <span class="pet-stat-val" id="pet-stat-total-tokens">0</span>
              </div>
              <div class="pet-stat-item">
                <span class="pet-stat-label">消息数</span>
                <span class="pet-stat-val" id="pet-stat-total-msgs">0</span>
              </div>
              <div class="pet-stat-item">
                <span class="pet-stat-label">平均响应</span>
                <span class="pet-stat-val" id="pet-stat-avg-time">-</span>
              </div>
            </div>

            <!-- 底部操作按钮 -->
            <div class="pet-action-bar">
              <button class="pet-action-btn" id="pet-btn-detail-1" title="桌宠1详情">🐾</button>
              <button class="pet-action-btn" id="pet-btn-add-pet" title="添加桌宠">➕</button>
              <button class="pet-action-btn" id="pet-btn-detail-2" title="桌宠2详情">🐾</button>
            </div>
          </div>

          <!-- 页面：桌宠详情 -->
          <div class="pet-page hidden" id="pet-page-detail">
            <div class="pet-detail-header">
              <button class="pet-back-btn" id="pet-detail-back">← 返回</button>
              <span class="pet-detail-title" id="pet-detail-title">桌宠详情</span>
            </div>
            <div class="pet-detail-avatar-wrap">
              <div class="pet-avatar large placeholder" id="pet-detail-avatar">
                <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="40" cy="35" r="22" fill="currentColor" opacity="0.3"/>
                  <circle cx="40" cy="35" r="18" fill="currentColor" opacity="0.5"/>
                  <text x="40" y="41" text-anchor="middle" font-size="18">🤖</text>
                </svg>
              </div>
            </div>
            <div class="pet-detail-stats" id="pet-detail-stats">
              <!-- 动态渲染 -->
            </div>
          </div>

          <!-- 页面：选择/创建桌宠 -->
          <div class="pet-page hidden" id="pet-page-create">
            <div class="pet-detail-header">
              <button class="pet-back-btn" id="pet-create-back">← 返回</button>
              <span class="pet-detail-title">领养桌宠</span>
            </div>
            <div class="pet-create-content">
              <p class="pet-create-hint">选择品牌</p>
              <div class="pet-brand-grid" id="pet-brand-grid">
                <!-- 动态渲染 -->
              </div>
              <div class="pet-create-form hidden" id="pet-create-form">
                <input class="pet-input" id="pet-create-name" type="text" placeholder="给它取个名字..." maxlength="12"/>
                <div class="pet-skin-select" id="pet-skin-select">
                  <span class="pet-create-hint">选择皮肤</span>
                  <div class="pet-skin-options">
                    <div class="pet-skin-opt selected" data-skin="0">皮肤 A</div>
                    <div class="pet-skin-opt" data-skin="1">皮肤 B</div>
                  </div>
                </div>
                <button class="pet-btn-primary" id="pet-create-confirm">
                  <span id="pet-create-confirm-text">确认领养</span>
                </button>
              </div>
            </div>
          </div>

          <!-- 全局加载遮罩 -->
          <div class="pet-loading-mask hidden" id="pet-loading-mask">
            <div class="pet-loading-spinner"></div>
            <span class="pet-loading-text" id="pet-loading-text">处理中...</span>
          </div>

          <!-- 全局提示Toast -->
          <div class="pet-toast hidden" id="pet-toast"></div>

        </div>

        <!-- 底部装饰按钮（拓麻歌子风格） -->
        <div class="pet-device-footer">
          <button class="pet-hw-btn" id="pet-hw-left">◀</button>
          <button class="pet-hw-btn pet-hw-center" id="pet-hw-center">●</button>
          <button class="pet-hw-btn" id="pet-hw-right">▶</button>
        </div>

      </div>
    `;
  },

  /* ── 事件绑定（事件委托） ── */
  _bindEvents() {
    // 🐾 消息按钮点击 → 打开悬浮窗
    $(document).on('click', '.ai-pet-msg-btn', (e) => {
      const btn     = e.currentTarget;
      const msgData = JSON.parse(btn.dataset.msgData || '{}');
      this._currentMsgData = msgData;
      this.openFloat(msgData);
    });

    // 关闭按钮
    $(document).on('click', '#ai-pet-close', () => this.closeFloat());

    // 主题切换
    $(document).on('click', '#ai-pet-theme-toggle', () => this.toggleTheme());

    // 领养第一只
    $(document).on('click', '#pet-btn-add-first, #pet-btn-add-pet', () => {
      this.showPage('pet-page-create');
      this._renderBrandGrid();
    });

    // 品牌选择
    $(document).on('click', '.pet-brand-card', (e) => {
      const brand = e.currentTarget.dataset.brand;
      this._selectBrand(brand);
    });

    // 皮肤选择
    $(document).on('click', '.pet-skin-opt', (e) => {
      $('.pet-skin-opt').removeClass('selected');
      $(e.currentTarget).addClass('selected');
    });

    // 确认创建
    $(document).on('click', '#pet-create-confirm', () => this._confirmCreate());

    // 返回按钮
    $(document).on('click', '#pet-detail-back, #pet-create-back', () => {
      this.showPage('pet-page-main');
      this._renderMainPage();
    });

    // 桌宠详情按钮
    $(document).on('click', '#pet-btn-detail-1', () => this._showPetDetail('slot1'));
    $(document).on('click', '#pet-btn-detail-2', () => this._showPetDetail('slot2'));

    // 拖动（PC）
    this._initDrag();

    AIPetLog.debug('UI', '事件委托已绑定');
  },

  /* ── 页面切换 ── */
  showPage(pageId) {
    document.querySelectorAll('.pet-page').forEach(p => p.classList.add('hidden'));
    const target = document.getElementById(pageId);
    if (target) target.classList.remove('hidden');
  },

  /* ── 打开/关闭悬浮窗 ── */
  openFloat(msgData) {
    const win = document.getElementById('ai-pet-float');
    if (!win) return;

    win.classList.add('visible');
    this._floatVisible = true;

    // 更新消息信息
    if (msgData) this._updateMsgPanel(msgData);

    // 决定显示哪个页面
    const pets = AIPetCore.getPets();
    if (pets.slot1 || pets.slot2) {
      this.showPage('pet-page-main');
      this._renderMainPage();
    } else {
      this.showPage('pet-page-empty');
    }

    AIPetLog.info('UI', '悬浮窗已打开');
  },

  closeFloat() {
    const win = document.getElementById('ai-pet-float');
    if (!win) return;
    win.classList.remove('visible');
    this._floatVisible = false;
    AIPetLog.info('UI', '悬浮窗已关闭');
  },

  /* ── 主页面渲染 ── */
  _renderMainPage() {
    const pets = AIPetCore.getPets();
    const gs   = AIPetCore.getGlobalStats();

    // 渲染两个槽位
    for (const [slot, idx] of [['slot1', 1], ['slot2', 2]]) {
      const pet = pets[slot];
      const nameEl  = document.getElementById(`pet-name-${idx}`);
      const brandEl = document.getElementById(`pet-brand-${idx}`);

      if (pet) {
        if (nameEl)  nameEl.textContent  = pet.name;
        if (brandEl) {
          brandEl.textContent  = BRANDS[pet.brand]?.label || pet.brand;
          brandEl.style.color  = BRANDS[pet.brand]?.color || '#888';
        }
        // 更新头像颜色
        const avatarEl = document.getElementById(`pet-avatar-${idx}`);
        if (avatarEl) avatarEl.style.color = BRANDS[pet.brand]?.color || '#888';
      } else {
        if (nameEl)  nameEl.textContent  = '空槽';
        if (brandEl) brandEl.textContent = '点击领养';
      }
    }

        // 更新统计
    const avgTime = gs.totalMessages > 0
      ? (gs.totalResponseTime / gs.totalMessages).toFixed(1) + 's'
      : '-';

    const totalTokensEl = document.getElementById('pet-stat-total-tokens');
    const totalMsgsEl   = document.getElementById('pet-stat-total-msgs');
    const avgTimeEl     = document.getElementById('pet-stat-avg-time');

    if (totalTokensEl) totalTokensEl.textContent = gs.totalTokens.toLocaleString();
    if (totalMsgsEl)   totalMsgsEl.textContent   = gs.totalMessages;
    if (avgTimeEl)     avgTimeEl.textContent      = avgTime;

    // 关系好感度
    const relVal = document.getElementById('pet-relation-val');
    if (relVal) relVal.textContent = AIPetCore.getRelationship().affection;

    // 显示/隐藏关系分隔符（两只都有才显示）
    const divider = document.getElementById('pet-slot-divider');
    if (divider) {
      divider.style.display = (pets.slot1 && pets.slot2) ? 'flex' : 'none';
    }
  },

  /* ── 消息信息面板更新 ── */
  _updateMsgPanel(msgData) {
    const settings = AIPetCore.getSettings();
    const pets     = AIPetCore.getPets();
    const pet      = pets.slot1 || pets.slot2;

    const template = settings.messageTemplate;
    const text = template
      .replace('{petName}',  pet?.name     || '桌宠')
      .replace('{charName}', msgData.charName  || 'AI')
      .replace('{tokens}',   msgData.tokens    || '?')
      .replace('{time}',     msgData.responseTime || '?')
      .replace('{floor}',    msgData.floor     || '?');

    const infoEl = document.getElementById('pet-msg-info');
    if (infoEl) {
      infoEl.innerHTML = `<span class="pet-msg-info-item">${text}</span>`;
    }
  },

  /* ── 品牌选择网格渲染 ── */
  _renderBrandGrid() {
    const grid = document.getElementById('pet-brand-grid');
    if (!grid) return;

    grid.innerHTML = Object.entries(BRANDS).map(([key, brand]) => `
      <div class="pet-brand-card" data-brand="${key}" style="--brand-color:${brand.color}">
        <div class="pet-brand-avatar">
          <svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
            <circle cx="30" cy="30" r="25" fill="${brand.color}" opacity="0.2"/>
            <circle cx="30" cy="30" r="18" fill="${brand.color}" opacity="0.4"/>
            <text x="30" y="36" text-anchor="middle" font-size="16" fill="${brand.color}">
              ${this._getBrandEmoji(key)}
            </text>
          </svg>
        </div>
        <span class="pet-brand-label">${brand.label}</span>
      </div>
    `).join('');
  },

  _getBrandEmoji(brand) {
    const map = { claude: '🟠', gemini: '💜', deepseek: '🔵', gpt: '🟢' };
    return map[brand] || '🤖';
  },

  _selectBrand(brand) {
    // 高亮选中
    document.querySelectorAll('.pet-brand-card').forEach(c => c.classList.remove('selected'));
    const card = document.querySelector(`.pet-brand-card[data-brand="${brand}"]`);
    if (card) card.classList.add('selected');

    // 显示创建表单
    const form = document.getElementById('pet-create-form');
    if (form) form.classList.remove('hidden');

    // 存储选中品牌
    this._selectedBrand = brand;

    AIPetLog.debug('UI', `选中品牌: ${brand}`);
  },

  /* ── 确认创建桌宠 ── */
  _confirmCreate() {
    const brand = this._selectedBrand;
    const nameInput = document.getElementById('pet-create-name');
    const name  = nameInput?.value?.trim();
    const skin  = parseInt(document.querySelector('.pet-skin-opt.selected')?.dataset.skin || '0');

    if (!brand) {
      this.showToast('请先选择品牌', 'warn');
      return;
    }
    if (!name) {
      this.showToast('请给桌宠取个名字', 'warn');
      nameInput?.focus();
      return;
    }

    // 找空槽位
    const pets = AIPetCore.getPets();
    const slot = !pets.slot1 ? 'slot1' : !pets.slot2 ? 'slot2' : null;
    if (!slot) {
      this.showToast('槽位已满，最多养两只', 'warn');
      return;
    }

    // 显示加载状态
    const confirmBtn  = document.getElementById('pet-create-confirm');
    const confirmText = document.getElementById('pet-create-confirm-text');
    if (confirmBtn)  confirmBtn.disabled = true;
    if (confirmText) confirmText.textContent = '领养中...';

    try {
      const newPet = AIPetCore.createPet(brand, name, skin);
      AIPetCore.updatePet(slot, newPet);

      AIPetLog.info('UI', `新桌宠已创建: ${name} (${brand}) → ${slot}`);
      this.showToast(`${name} 已成功领养！`, 'success');

      // 跳转主页
      setTimeout(() => {
        this.showPage('pet-page-main');
        this._renderMainPage();
      }, 800);

    } catch (e) {
      AIPetLog.error('UI', '创建桌宠失败', e);
      this.showToast('领养失败，请重试', 'error');
      if (confirmBtn)  confirmBtn.disabled = false;
      if (confirmText) confirmText.textContent = '确认领养';
    }
  },

  /* ── 桌宠详情页 ── */
  _showPetDetail(slot) {
    const pet = AIPetCore.getPets()[slot];
    if (!pet) {
      this.showToast('该槽位还没有桌宠', 'warn');
      return;
    }

    const titleEl  = document.getElementById('pet-detail-title');
    const statsEl  = document.getElementById('pet-detail-stats');
    const avatarEl = document.getElementById('pet-detail-avatar');

    if (titleEl) titleEl.textContent = pet.name;
    if (avatarEl) avatarEl.style.color = BRANDS[pet.brand]?.color || '#888';

    if (statsEl) {
      const stats = pet.stats;
      const meta  = pet.stats_meta;
      statsEl.innerHTML = `
        <div class="pet-detail-info-row">
          <span class="pet-detail-label">品牌</span>
          <span class="pet-detail-val" style="color:${BRANDS[pet.brand]?.color}">${BRANDS[pet.brand]?.label}</span>
        </div>
        <div class="pet-detail-info-row">
          <span class="pet-detail-label">生日</span>
          <span class="pet-detail-val">${pet.birthday}</span>
        </div>
        <div class="pet-detail-info-row">
          <span class="pet-detail-label">亲密度</span>
          <span class="pet-detail-val">${stats.intimacy}</span>
        </div>
        <div class="pet-detail-info-row">
          <span class="pet-detail-label">称呼你为</span>
          <span class="pet-detail-val">${AIPetPetManager.getTitleByIntimacy(stats.intimacy)}</span>
        </div>
        <div class="pet-detail-section-title">属性</div>
        ${this._renderStatBar('心情',   stats.mood)}
        ${this._renderStatBar('饥饿',   stats.hunger)}
        ${this._renderStatBar('精力',   stats.energy)}
        ${this._renderStatBar('清洁',   stats.cleanliness)}
        <div class="pet-detail-section-title">统计</div>
        <div class="pet-detail-info-row">
          <span class="pet-detail-label">互动次数</span>
          <span class="pet-detail-val">${meta.totalInteractions}</span>
        </div>
        <div class="pet-detail-info-row">
          <span class="pet-detail-label">创建于</span>
          <span class="pet-detail-val">${meta.createdAt}</span>
        </div>
        <div class="pet-detail-info-row">
          <span class="pet-detail-label">最后活跃</span>
          <span class="pet-detail-val">${meta.lastActiveAt}</span>
        </div>
      `;
    }

    this.showPage('pet-page-detail');
  },

  _renderStatBar(label, value) {
    const pct   = Math.max(0, Math.min(100, value));
    const color = pct > 60 ? '#4ade80' : pct > 30 ? '#facc15' : '#f87171';
    return `
      <div class="pet-stat-bar-row">
        <span class="pet-stat-bar-label">${label}</span>
        <div class="pet-stat-bar-track">
          <div class="pet-stat-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="pet-stat-bar-num">${Math.round(pct)}</span>
      </div>
    `;
  },

  /* ── Toast提示 ── */
  showToast(msg, type = 'info') {
    const toast = document.getElementById('pet-toast');
    if (!toast) return;

    const icons = { success: '✅', warn: '⚠️', error: '❌', info: 'ℹ️' };
    toast.textContent = `${icons[type] || ''} ${msg}`;
    toast.className   = `pet-toast pet-toast-${type}`;
    toast.classList.remove('hidden');

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2500);
  },

  /* ── 主题切换 ── */
  toggleTheme() {
    const settings = AIPetCore.getSettings();
    const newTheme = settings.theme === 'pink' ? 'dark' : 'pink';
    AIPetCore.updateSettings({ theme: newTheme });

    const win = document.getElementById('ai-pet-float');
    if (win) {
      win.classList.remove('theme-pink', 'theme-dark');
      win.classList.add(`theme-${newTheme}`);
    }

    AIPetLog.info('UI', `主题切换为: ${newTheme}`);
  },

  /* ── PC拖动 ── */
  _initDrag() {
    let isDragging = false;
    let startX, startY, origLeft, origTop;

    $(document).on('mousedown', '#ai-pet-drag-handle', (e) => {
      const win = document.getElementById('ai-pet-float');
      if (!win) return;

      isDragging = true;
      startX   = e.clientX;
      startY   = e.clientY;
      origLeft = win.offsetLeft;
      origTop  = win.offsetTop;

      win.style.transition = 'none';
      e.preventDefault();
    });

    $(document).on('mousemove', (e) => {
      if (!isDragging) return;
      const win = document.getElementById('ai-pet-float');
      if (!win) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // 边界限制
      const maxLeft = window.innerWidth  - win.offsetWidth;
      const maxTop  = window.innerHeight - win.offsetHeight;
      const newLeft = Math.max(0, Math.min(maxLeft, origLeft + dx));
      const newTop  = Math.max(0, Math.min(maxTop,  origTop  + dy));

      win.style.left = newLeft + 'px';
      win.style.top  = newTop  + 'px';
      win.style.right  = 'auto';
      win.style.bottom = 'auto';
    });

    $(document).on('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        const win = document.getElementById('ai-pet-float');
        if (win) win.style.transition = '';
      }
    });
  },
};

/* BLOCK END: UI系统 - 悬浮窗与消息注入 */

/* ============================================================ */
/* BLOCK START: 配置面板注入                                     */
/* ============================================================ */

const AIPetSettings = {
  _EXT_PATH: AI_PET_EXT_PATH,

  init() {
    this._injectSettingsPanel();
    this._bindSettingsEvents();
  },

  _injectSettingsPanel() {
    if (document.getElementById('ai-pet-settings-panel')) {
      AIPetLog.info('Settings', '配置面板已存在，跳过注入');
      return;
    }

    fetch(`${this._EXT_PATH}/settings.html`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(html => {
        // 寻找ST挂载点（多版本兼容）
        const possibleParents = [
          document.getElementById('extensions_settings'),
          document.getElementById('extensions_settings2'),
          document.querySelector('.extensions_block'),
        ];
        let parent = possibleParents.find(p => p) || document.getElementById('top-settings-holder') || document.body;

        const container = document.createElement('div');
        container.id        = 'ai-pet-settings-panel';
        container.className = 'extension_container';
        container.innerHTML = html;
        parent.appendChild(container);

        // 动态加载 settings.css
        if (!document.querySelector(`link[href*="ai-pet-extension/settings.css"]`)) {
          const link = document.createElement('link');
          link.rel  = 'stylesheet';
          link.href = `${this._EXT_PATH}/settings.css`;
          document.head.appendChild(link);
        }

        // 同步UI数据
        this._syncSettingsUI();
        AIPetLog.info('Settings', '配置面板注入成功');
      })
      .catch(e => {
        AIPetLog.error('Settings', '配置面板加载失败', e);
      });
  },

  _syncSettingsUI() {
    const el = document.getElementById('ai-pet-sp-enabled');
    if (!el) {
      setTimeout(() => this._syncSettingsUI(), 500);
      return;
    }

    const s = AIPetCore.getSettings();
    $('#ai-pet-sp-enabled').prop('checked', s.enabled);
    $('#ai-pet-sp-mode').val(s.mode);
    $('#ai-pet-sp-api-key').val(s.apiKey);
    $('#ai-pet-sp-api-base').val(s.apiBaseUrl);
    $('#ai-pet-sp-model').val(s.model);
    $('#ai-pet-sp-template').val(s.messageTemplate);
    $('#ai-pet-sp-log-level').val(s.logLevel);
    $('#ai-pet-sp-theme').val(s.theme);

    // 渲染已缓存的模型列表
    if (s.availableModels?.length) {
      this._renderModelOptions(s.availableModels, s.model);
    }

    AIPetLog.debug('Settings', 'UI数据同步完成');
  },

  _bindSettingsEvents() {
    // 插件总开关
    $(document).on('change', '#ai-pet-sp-enabled', function () {
      AIPetCore.updateSettings({ enabled: this.checked });
      AIPetLog.info('Settings', `插件${this.checked ? '已启用' : '已禁用'}`);
    });

    // 模式切换
    $(document).on('change', '#ai-pet-sp-mode', function () {
      AIPetCore.updateSettings({ mode: this.value });
      AIPetSettings._toggleApiSection(this.value === 'api');
    });

    // API Key
    $(document).on('input', '#ai-pet-sp-api-key', function () {
      AIPetCore.updateSettings({ apiKey: this.value.trim() });
    });

    // API Base URL
    $(document).on('input', '#ai-pet-sp-api-base', function () {
      AIPetCore.updateSettings({ apiBaseUrl: this.value.trim() });
    });

    // 获取模型列表
    $(document).on('click', '#ai-pet-sp-fetch-models', () => {
      this._fetchModels();
    });

    // 模型选择
    $(document).on('change', '#ai-pet-sp-model', function () {
      AIPetCore.updateSettings({ model: this.value });
      AIPetLog.info('Settings', `模型已选择: ${this.value}`);
    });

    // 消息模板
    $(document).on('input', '#ai-pet-sp-template', function () {
      AIPetCore.updateSettings({ messageTemplate: this.value });
    });

    // 日志级别
    $(document).on('change', '#ai-pet-sp-log-level', function () {
      AIPetCore.updateSettings({ logLevel: this.value });
    });

    // 主题
    $(document).on('change', '#ai-pet-sp-theme', function () {
      AIPetCore.updateSettings({ theme: this.value });
      const win = document.getElementById('ai-pet-float');
      if (win) {
        win.classList.remove('theme-pink', 'theme-dark');
        win.classList.add(`theme-${this.value}`);
      }
    });

    // 面板折叠
    $(document).on('click', '#ai-pet-sp-collapse-btn', () => {
      this._toggleCollapse();
    });

    // 连通性测试
    $(document).on('click', '#ai-pet-sp-test-api', () => {
      this._testApiConnection();
    });

    // 数据导出
    $(document).on('click', '#ai-pet-sp-export', () => {
      this._exportData();
    });

    // 清空数据
    $(document).on('click', '#ai-pet-sp-clear-all', () => {
      this._clearAllData();
    });
  },

  _toggleApiSection(show) {
    const section = document.getElementById('ai-pet-sp-api-section');
    if (section) section.style.display = show ? 'block' : 'none';
  },

  _toggleCollapse() {
    const body = document.getElementById('ai-pet-sp-body');
    const btn  = document.getElementById('ai-pet-sp-collapse-btn');
    if (!body) return;

    const isCollapsed = body.classList.toggle('collapsed');
    if (btn) btn.textContent = isCollapsed ? '▶' : '▼';
    AIPetLog.debug('Settings', `面板${isCollapsed ? '已折叠' : '已展开'}`);
  },

  /* ── 获取模型列表 ── */
  async _fetchModels() {
    const s      = AIPetCore.getSettings();
    const apiKey = s.apiKey?.trim();
    const base   = s.apiBaseUrl?.trim();

    if (!apiKey || !base) {
      this._setFetchModelsStatus('请先填写 API Key 和 Base URL', 'error');
      return;
    }

    const btn = document.getElementById('ai-pet-sp-fetch-models');
    if (btn) { btn.disabled = true; btn.textContent = '获取中...'; }
    this._setFetchModelsStatus('正在获取模型列表...', 'loading');

    try {
      const url = base.replace(/\/$/, '') + '/models';
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 100)}`);
      }

      const data   = await res.json();
      const models = (data.data || data.models || []).map(m => m.id || m).filter(Boolean);

      if (!models.length) throw new Error('未获取到任何模型');

      AIPetCore.updateSettings({ availableModels: models });
      this._renderModelOptions(models, s.model);
      this._setFetchModelsStatus(`✅ 获取成功，共 ${models.length} 个模型`, 'success');
      AIPetLog.info('Settings', `模型列表获取成功: ${models.length} 个`);

    } catch (e) {
      AIPetLog.error('Settings', '获取模型列表失败', e);
      this._setFetchModelsStatus(`❌ 获取失败: ${e.message}`, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '获取模型'; }
    }
  },

  _renderModelOptions(models, currentModel) {
    const select = document.getElementById('ai-pet-sp-model');
    if (!select) return;

    select.innerHTML = '<option value="">-- 请选择模型 --</option>' +
      models.map(m => `<option value="${m}" ${m === currentModel ? 'selected' : ''}>${m}</option>`).join('');
  },

  _setFetchModelsStatus(msg, type) {
    const el = document.getElementById('ai-pet-sp-models-status');
    if (!el) return;
    el.textContent  = msg;
    el.className    = `ai-pet-sp-status ai-pet-sp-status-${type}`;
  },

  /* ── API连通性测试 ── */
  async _testApiConnection() {
    const s      = AIPetCore.getSettings();
    const apiKey = s.apiKey?.trim();
    const base   = s.apiBaseUrl?.trim();
    const model  = s.model;

    if (!apiKey || !base || !model) {
      this._setTestStatus('请先填写 API Key、Base URL 并选择模型', 'error');
      return;
    }

    const btn = document.getElementById('ai-pet-sp-test-api');
    if (btn) { btn.disabled = true; btn.textContent = '测试中...'; }
    this._setTestStatus('正在测试连接...', 'loading');

    try {
      const url = base.replace(/\/$/, '') + '/chat/completions';
      const res = await fetch(url, {
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
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 150)}`);
      }

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || '(无回复)';
      this._setTestStatus(`✅ 连接成功！回复: "${reply}"`, 'success');
      AIPetLog.info('Settings', 'API连通性测试成功');

    } catch (e) {
      AIPetLog.error('Settings', 'API连通性测试失败', e);
      this._setTestStatus(`❌ 连接失败: ${e.message}`, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '测试连接'; }
    }
  },

  _setTestStatus(msg, type) {
    const el = document.getElementById('ai-pet-sp-test-status');
    if (!el) return;
    el.textContent = msg;
    el.className   = `ai-pet-sp-status ai-pet-sp-status-${type}`;
  },

  /* ── 数据导出 ── */
  _exportData() {
    try {
      const data = JSON.stringify(AIPetCore.getData(), null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `ai-pet-data-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      AIPetLog.info('Settings', '数据已导出');
    } catch (e) {
      AIPetLog.error('Settings', '数据导出失败', e);
    }
  },

  /* ── 清空数据 ── */
  _clearAllData() {
    const confirmed = confirm('⚠️ 确定要清空所有桌宠数据吗？此操作不可撤销！');
    if (!confirmed) return;

    try {
      extension_settings['ai_pet_extension'] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      AIPetCore.load();
      saveSettingsDebounced();
      AIPetLog.info('Settings', '所有数据已清空');
      alert('✅ 数据已清空');
    } catch (e) {
      AIPetLog.error('Settings', '清空数据失败', e);
      alert('❌ 清空失败: ' + e.message);
    }
  },
};

/* BLOCK END: 配置面板注入 */

/* ============================================================ */
/* BLOCK START: 定时器系统                                       */
/* ============================================================ */

const AIPetTimers = {
  _decayTimer:  null,
  _DECAY_INTERVAL: 60 * 60 * 1000, // 1小时

  init() {
    this._decayTimer = setInterval(() => {
      AIPetPetManager.naturalDecay();
    }, this._DECAY_INTERVAL);

    AIPetLog.info('Timers', `属性衰减定时器已启动，间隔 ${this._DECAY_INTERVAL / 60000} 分钟`);
  },

  destroy() {
    if (this._decayTimer) {
      clearInterval(this._decayTimer);
      this._decayTimer = null;
      AIPetLog.info('Timers', '定时器已销毁');
    }
  },
};

/* BLOCK END: 定时器系统 */

/* ============================================================ */
/* BLOCK START: 插件入口与初始化                                  */
/* ============================================================ */

(function AIPetExtensionInit() {
  AIPetLog.info('Init', `${AI_PET_NAME} v${AI_PET_VERSION} 开始初始化`);

  // 等待ST就绪
  function waitForST(cb, retries = 20) {
    if (
      typeof extension_settings !== 'undefined' &&
      typeof eventSource       !== 'undefined' &&
      typeof event_types       !== 'undefined' &&
      typeof saveSettingsDebounced !== 'undefined'
    ) {
      cb();
    } else if (retries > 0) {
      AIPetLog.debug('Init', `等待ST就绪... 剩余重试 ${retries}`);
      setTimeout(() => waitForST(cb, retries - 1), 300);
    } else {
      AIPetLog.error('Init', 'ST环境未就绪，插件初始化失败');
    }
  }

  waitForST(() => {
    try {
      // 1. 加载数据
      AIPetCore.load();

      // 2. 初始化UI
      AIPetUI.init();

      // 3. 注册ST事件
      AIPetEvents.init();

      // 4. 注入配置面板
      AIPetSettings.init();

      // 5. 启动定时器
      AIPetTimers.init();

      AIPetLog.info('Init', '✅ 所有模块初始化完成');
    } catch (e) {
      AIPetLog.error('Init', '初始化过程中发生错误', e);
    }
  });
})();

/* BLOCK END: 插件入口与初始化 */

