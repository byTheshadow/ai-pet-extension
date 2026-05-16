/* ============================================================ */
/* BLOCK START: 模块元信息与常量定义                              */
/* ============================================================ */

import {
  extension_settings,
  getContext,
  saveSettingsDebounced,
} from '../../../extensions.js';

import {
  eventSource,
  event_types,
} from '../../../../script.js';

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
    mode:            'free',
    apiKey:          '',
    apiBaseUrl:      'https://api.openai.com/v1',
    model:           '',
    availableModels: [],
    messageTemplate: '{petName}这次和{charName}聊天消耗了{tokens}tk，用时{time}秒，第{floor}楼',
    logLevel:        'verbose',
    theme:           'pink',
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
    likes: { presets: [], custom: [] },
  },
  address: {
    userNickname: '',
    currentTitle: '主人',
  },
  memory:  [],
  history: [],
  diary:   [],
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

  load() {
    try {
      if (!extension_settings['ai_pet_extension']) {
        extension_settings['ai_pet_extension'] = {};
      }
      const raw = extension_settings['ai_pet_extension'];
      this._data = this._deepMerge(
        JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
        raw
      );
      AIPetLog.info('Core', '数据加载成功');
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

  getData()         { return this._data; },
  getSettings()     { return this._data?.settings; },
  getPets()         { return this._data?.pets; },
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

  _deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        if (!target[key] || typeof target[key] !== 'object') target[key] = {};
        this._deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  },

  generateId() {
    return 'pet_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  },

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
    eventSource.on(event_types.MESSAGE_RECEIVED, (idx) => {
      this._onMessageReceived(idx);
    });

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

      const responseTime = this._lastMessageTime
        ? ((Date.now() - this._lastMessageTime) / 1000).toFixed(1)
        : '?';
      this._lastMessageTime = null;

      const tokens = message.extra?.token_count
        || Math.ceil((message.mes || '').length / 3);

      const gs = AIPetCore.getGlobalStats();
      AIPetCore.updateGlobalStats({
        totalTokens:       gs.totalTokens + tokens,
        totalMessages:     gs.totalMessages + 1,
        totalResponseTime: gs.totalResponseTime + parseFloat(responseTime) || 0,
        sessionTokens:     gs.sessionTokens + tokens,
      });

      AIPetLog.info('Events', `消息#${messageIndex} | tokens:${tokens} | 响应:${responseTime}s`);

      AIPetUI.injectMessageButton(messageIndex, {
        tokens,
        responseTime,
        floor:    messageIndex + 1,
        charName: message.name || ctx.characters?.[ctx.characterId]?.name || 'AI',
      });

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
  onMessageReceived(tokens) {
    const pets = AIPetCore.getPets();
    let changed = false;

    for (const slot of ['slot1', 'slot2']) {
      const pet = pets[slot];
      if (!pet) continue;
      pet.stats.intimacy    += 1;
      pet.stats.energy       = Math.max(0, pet.stats.energy - 2);
      pet.stats.mood         = Math.min(100, pet.stats.mood + 1);
      pet.stats_meta.lastActiveAt      = new Date().toISOString().slice(0, 10);
      pet.stats_meta.totalInteractions += 1;
      changed = true;
    }

    if (changed) {
      AIPetCore.save();
      AIPetLog.debug('PetManager', '桌宠状态已更新');
    }
  },

  naturalDecay() {
    const pets = AIPetCore.getPets();
    let changed = false;

    for (const slot of ['slot1', 'slot2']) {
      const pet = pets[slot];
      if (!pet) continue;
      pet.stats.hunger      = Math.max(0, pet.stats.hunger - 1);
      pet.stats.cleanliness = Math.max(0, pet.stats.cleanliness - 0.5);
      pet.stats.energy      = Math.min(100, pet.stats.energy + 0.5);
      changed = true;
    }

    if (changed) {
      AIPetCore.save();
      AIPetLog.debug('PetManager', '属性自然衰减已执行');
    }
  },

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
  _floatVisible:   false,
  _currentMsgData: null,
  _selectedBrand:  null,
  _toastTimer:     null,

  init() {
    this._createFloatWindow();
    this._bindEvents();
    AIPetLog.info('UI', '悬浮窗UI已初始化');
  },

  /* ── 消息emoji按钮注入 ── */
  injectMessageButton(messageIndex, msgData) {
    // ST消息DOM选择器兼容多版本
    const msgEl = document.querySelector(
      `.mes[mesid="${messageIndex}"]`
    ) || document.querySelector(
      `[mesid="${messageIndex}"]`
    );

    if (!msgEl) {
      AIPetLog.warn('UI', `找不到消息DOM #${messageIndex}`);
      return;
    }

    if (msgEl.querySelector('.ai-pet-msg-btn')) return;

    const btn = document.createElement('button');
    btn.className        = 'ai-pet-msg-btn';
    btn.textContent      = '🐾';
    btn.title            = '打开AI桌宠';
    btn.dataset.msgIndex = messageIndex;
    btn.dataset.msgData  = JSON.stringify(msgData);

    // ST消息按钮区域，兼容多版本
    const actionsEl = msgEl.querySelector('.mes_buttons')
      || msgEl.querySelector('.extraMesButtons')
      || msgEl.querySelector('.mes_block');

    if (actionsEl) {
      actionsEl.appendChild(btn);
    } else {
      msgEl.appendChild(btn);
    }

    AIPetLog.debug('UI', `🐾 已注入消息 #${messageIndex}`);
  },

  /* ── 悬浮窗创建 ── */
  _createFloatWindow() {
    if (document.getElementById('ai-pet-float')) return;

    const theme = AIPetCore.getSettings()?.theme || 'pink';
    const win   = document.createElement('div');
    win.id        = 'ai-pet-float';
    win.className = `ai-pet-float theme-${theme}`;
    win.innerHTML = this._getFloatHTML();
    document.body.appendChild(win);

    AIPetLog.debug('UI', '悬浮窗DOM已创建');
  },

  _getFloatHTML() {
    return `
      <div class="pet-device">
        <div class="pet-device-header">
          <div class="pet-device-drag-handle" id="ai-pet-drag-handle">
            <span class="pet-device-title">AI桌宠</span>
            <div class="pet-device-controls">
              <button class="pet-ctrl-btn" id="ai-pet-theme-toggle" title="切换主题">🎨</button>
              <button class="pet-ctrl-btn" id="ai-pet-close" title="关闭">✕</button>
            </div>
          </div>
        </div>

        <div class="pet-screen">
          <!-- 空状态页 -->
          <div class="pet-page" id="pet-page-empty">
            <div class="pet-empty-state">
              <div class="pet-empty-icon">🥚</div>
              <p class="pet-empty-text">还没有桌宠</p>
              <button class="pet-btn-primary" id="pet-btn-add-first">领养第一只</button>
            </div>
          </div>

          <!-- 主界面 -->
          <div class="pet-page hidden" id="pet-page-main">
            <div class="pet-display-area">
              <div class="pet-slot" id="pet-slot-1">
                <div class="pet-avatar-wrap">
                  <div class="pet-avatar placeholder" id="pet-avatar-1">
                    ${this._placeholderSVG()}
                  </div>
                  <div class="pet-bubble hidden" id="pet-bubble-1"></div>
                </div>
                <div class="pet-name" id="pet-name-1">空槽</div>
                <div class="pet-brand-badge" id="pet-brand-1">点击领养</div>
              </div>

              <div class="pet-slot-divider" id="pet-slot-divider" style="display:none">
                <span class="pet-relation-heart">💕</span>
                <span class="pet-relation-val" id="pet-relation-val">0</span>
              </div>

              <div class="pet-slot" id="pet-slot-2">
                <div class="pet-avatar-wrap">
                  <div class="pet-avatar placeholder" id="pet-avatar-2">
                    ${this._placeholderSVG()}
                  </div>
                  <div class="pet-bubble hidden" id="pet-bubble-2"></div>
                </div>
                <div class="pet-name" id="pet-name-2">空槽</div>
                <div class="pet-brand-badge" id="pet-brand-2">点击领养</div>
              </div>
            </div>

            <div class="pet-msg-panel" id="pet-msg-panel">
              <div class="pet-msg-panel-title">📊 本次对话</div>
              <div class="pet-msg-info" id="pet-msg-info">
                <span class="pet-msg-info-item">等待消息...</span>
              </div>
            </div>

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

            <div class="pet-action-bar">
              <button class="pet-action-btn" id="pet-btn-detail-1" title="桌宠1详情">🐾</button>
              <button class="pet-action-btn" id="pet-btn-add-pet" title="添加桌宠">➕</button>
              <button class="pet-action-btn" id="pet-btn-detail-2" title="桌宠2详情">🐾</button>
            </div>
          </div>

          <!-- 详情页 -->
          <div class="pet-page hidden" id="pet-page-detail">
            <div class="pet-detail-header">
              <button class="pet-back-btn" id="pet-detail-back">← 返回</button>
              <span class="pet-detail-title" id="pet-detail-title">桌宠详情</span>
            </div>
            <div class="pet-detail-avatar-wrap">
              <div class="pet-avatar large placeholder" id="pet-detail-avatar">
                ${this._placeholderSVG()}
              </div>
            </div>
            <div class="pet-detail-stats" id="pet-detail-stats"></div>
          </div>

          <!-- 创建页 -->
          <div class="pet-page hidden" id="pet-page-create">
            <div class="pet-detail-header">
              <button class="pet-back-btn" id="pet-create-back">← 返回</button>
              <span class="pet-detail-title">领养桌宠</span>
            </div>
            <div class="pet-create-content">
              <p class="pet-create-hint">选择品牌</p>
              <div class="pet-brand-grid" id="pet-brand-grid"></div>
              <div class="pet-create-form hidden" id="pet-create-form">
                <input class="pet-input" id="pet-create-name" type="text"
                  placeholder="给它取个名字..." maxlength="12"/>
                <div class="pet-skin-select">
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

          <!-- 加载遮罩 -->
          <div class="pet-loading-mask hidden" id="pet-loading-mask">
            <div class="pet-loading-spinner"></div>
            <span class="pet-loading-text" id="pet-loading-text">处理中...</span>
          </div>

          <!-- Toast -->
          <div class="pet-toast hidden" id="pet-toast"></div>
        </div>

        <div class="pet-device-footer">
          <button class="pet-hw-btn" id="pet-hw-left">◀</button>
          <button class="pet-hw-btn pet-hw-center" id="pet-hw-center">●</button>
          <button class="pet-hw-btn" id="pet-hw-right">▶</button>
        </div>
      </div>
    `;
  },

  _placeholderSVG() {
    return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="35" r="22" fill="currentColor" opacity="0.2"/>
      <circle cx="40" cy="35" r="15" fill="currentColor" opacity="0.35"/>
      <text x="40" y="41" text-anchor="middle" font-size="16">🤖</text>
    </svg>`;
  },

  /* ── 事件绑定 ── */
  _bindEvents() {
    $(document).on('click', '.ai-pet-msg-btn', (e) => {
      const msgData = JSON.parse(e.currentTarget.dataset.msgData || '{}');
      this._currentMsgData = msgData;
      this.openFloat(msgData);
    });

    $(document).on('click', '#ai-pet-close',        () => this.closeFloat());
    $(document).on('click', '#ai-pet-theme-toggle', () => this.toggleTheme());

    $(document).on('click', '#pet-btn-add-first, #pet-btn-add-pet', () => {
      this.showPage('pet-page-create');
      this._renderBrandGrid();
    });

    $(document).on('click', '.pet-brand-card', (e) => {
      this._selectBrand(e.currentTarget.dataset.brand);
    });

    $(document).on('click', '.pet-skin-opt', (e) => {
      document.querySelectorAll('.pet-skin-opt').forEach(o => o.classList.remove('selected'));
      e.currentTarget.classList.add('selected');
    });

    $(document).on('click', '#pet-create-confirm', () => this._confirmCreate());

    $(document).on('click', '#pet-detail-back, #pet-create-back', () => {
      this.showPage('pet-page-main');
      this._renderMainPage();
    });

    $(document).on('click', '#pet-btn-detail-1', () => this._showPetDetail('slot1'));
    $(document).on('click', '#pet-btn-detail-2', () => this._showPetDetail('slot2'));

    this._initDrag();
    AIPetLog.debug('UI', '事件委托已绑定');
  },

  showPage(pageId) {
    document.querySelectorAll('.pet-page').forEach(p => p.classList.add('hidden'));
    const target = document.getElementById(pageId);
    if (target) target.classList.remove('hidden');
  },

  openFloat(msgData) {
    const win = document.getElementById('ai-pet-float');
    if (!win) return;
    win.classList.add('visible');
    this._floatVisible = true;

    if (msgData) this._updateMsgPanel(msgData);

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
  },

  _renderMainPage() {
    const pets = AIPetCore.getPets();
    const gs   = AIPetCore.getGlobalStats();

    for (const [slot, idx] of [['slot1', 1], ['slot2', 2]]) {
      const pet     = pets[slot];
      const nameEl  = document.getElementById(`pet-name-${idx}`);
      const brandEl = document.getElementById(`pet-brand-${idx}`);
      const avatarEl = document.getElementById(`pet-avatar-${idx}`);

      if (pet) {
        if (nameEl)   nameEl.textContent  = pet.name;
        if (brandEl) {
          brandEl.textContent = BRANDS[pet.brand]?.label || pet.brand;
          brandEl.style.color = BRANDS[pet.brand]?.color || '#888';
        }
        if (avatarEl) avatarEl.style.color = BRANDS[pet.brand]?.color || '#888';
      } else {
        if (nameEl)   nameEl.textContent  = '空槽';
        if (brandEl) {
          brandEl.textContent = '点击领养';
          brandEl.style.color = '';
        }
      }
    }

    const avgTime = gs.totalMessages > 0
      ? (gs.totalResponseTime / gs.totalMessages).toFixed(1) + 's'
      : '-';

    const el = (id) => document.getElementById(id);
    if (el('pet-stat-total-tokens')) el('pet-stat-total-tokens').textContent = gs.totalTokens.toLocaleString();
    if (el('pet-stat-total-msgs'))   el('pet-stat-total-msgs').textContent   = gs.totalMessages;
    if (el('pet-stat-avg-time'))     el('pet-stat-avg-time').textContent     = avgTime;

    const relVal  = el('pet-relation-val');
    const divider = el('pet-slot-divider');
    if (relVal)  relVal.textContent    = AIPetCore.getRelationship().affection;
    if (divider) divider.style.display = (pets.slot1 && pets.slot2) ? 'flex' : 'none';
  },

  _updateMsgPanel(msgData) {
    const settings = AIPetCore.getSettings();
    const pets     = AIPetCore.getPets();
    const pet      = pets.slot1 || pets.slot2;

    const text = settings.messageTemplate
      .replace('{petName}',  pet?.name          || '桌宠')
      .replace('{charName}', msgData.charName   || 'AI')
      .replace('{tokens}',   msgData.tokens     || '?')
      .replace('{time}',     msgData.responseTime || '?')
      .replace('{floor}',    msgData.floor      || '?');

    const infoEl = document.getElementById('pet-msg-info');
    if (infoEl) infoEl.innerHTML = `<span class="pet-msg-info-item">${text}</span>`;
  },

  _renderBrandGrid() {
    const grid = document.getElementById('pet-brand-grid');
    if (!grid) return;
    grid.innerHTML = Object.entries(BRANDS).map(([key, brand]) => `
      <div class="pet-brand-card" data-brand="${key}" style="--brand-color:${brand.color}">
        <div class="pet-brand-avatar">
          <svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
            <circle cx="30" cy="30" r="25" fill="${brand.color}" opacity="0.2"/>
            <circle cx="30" cy="30" r="18" fill="${brand.color}" opacity="0.4"/>
            <text x="30" y="36" text-anchor="middle" font-size="16">${this._getBrandEmoji(key)}</text>
          </svg>
        </div>
        <span class="pet-brand-label">${brand.label}</span>
      </div>
    `).join('');
  },

  _getBrandEmoji(brand) {
    return { claude: '🟠', gemini: '💜', deepseek: '🔵', gpt: '🟢' }[brand] || '🤖';
  },

  _selectBrand(brand) {
    document.querySelectorAll('.pet-brand-card').forEach(c => c.classList.remove('selected'));
    const card = document.querySelector(`.pet-brand-card[data-brand="${brand}"]`);
    if (card) card.classList.add('selected');
    document.getElementById('pet-create-form')?.classList.remove('hidden');
    this._selectedBrand = brand;
  },

  _confirmCreate() {
    const brand     = this._selectedBrand;
    const nameInput = document.getElementById('pet-create-name');
    const name      = nameInput?.value?.trim();
    const skin      = parseInt(
      document.querySelector('.pet-skin-opt.selected')?.dataset.skin || '0'
    );

        if (!brand) { this.showToast('请先选择品牌', 'warn'); return; }
    if (!name)  { this.showToast('请给桌宠取个名字', 'warn'); nameInput?.focus(); return; }

    const pets = AIPetCore.getPets();
    const slot = !pets.slot1 ? 'slot1' : !pets.slot2 ? 'slot2' : null;
    if (!slot) { this.showToast('槽位已满，最多养两只', 'warn'); return; }

    const confirmBtn  = document.getElementById('pet-create-confirm');
    const confirmText = document.getElementById('pet-create-confirm-text');
    if (confirmBtn)  confirmBtn.disabled = true;
    if (confirmText) confirmText.textContent = '领养中...';

    try {
      const newPet = AIPetCore.createPet(brand, name, skin);
      AIPetCore.updatePet(slot, newPet);
      AIPetLog.info('UI', `新桌宠已创建: ${name} (${brand}) → ${slot}`);
      this.showToast(`${name} 已成功领养！`, 'success');
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

  _showPetDetail(slot) {
    const pet = AIPetCore.getPets()[slot];
    if (!pet) { this.showToast('该槽位还没有桌宠', 'warn'); return; }

    const el = (id) => document.getElementById(id);
    if (el('pet-detail-title'))  el('pet-detail-title').textContent = pet.name;
    if (el('pet-detail-avatar')) el('pet-detail-avatar').style.color = BRANDS[pet.brand]?.color || '#888';

    const statsEl = el('pet-detail-stats');
    if (statsEl) {
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
          <span class="pet-detail-val">${pet.stats.intimacy}</span>
        </div>
        <div class="pet-detail-info-row">
          <span class="pet-detail-label">称呼你为</span>
          <span class="pet-detail-val">${AIPetPetManager.getTitleByIntimacy(pet.stats.intimacy)}</span>
        </div>
        <div class="pet-detail-section-title">属性</div>
        ${this._renderStatBar('心情',   pet.stats.mood)}
        ${this._renderStatBar('饥饿',   pet.stats.hunger)}
        ${this._renderStatBar('精力',   pet.stats.energy)}
        ${this._renderStatBar('清洁',   pet.stats.cleanliness)}
        <div class="pet-detail-section-title">统计</div>
        <div class="pet-detail-info-row">
          <span class="pet-detail-label">互动次数</span>
          <span class="pet-detail-val">${pet.stats_meta.totalInteractions}</span>
        </div>
        <div class="pet-detail-info-row">
          <span class="pet-detail-label">创建于</span>
          <span class="pet-detail-val">${pet.stats_meta.createdAt}</span>
        </div>
        <div class="pet-detail-info-row">
          <span class="pet-detail-label">最后活跃</span>
          <span class="pet-detail-val">${pet.stats_meta.lastActiveAt}</span>
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

  showToast(msg, type = 'info') {
    const toast = document.getElementById('pet-toast');
    if (!toast) return;
    const icons = { success: '✅', warn: '⚠️', error: '❌', info: 'ℹ️' };
    toast.textContent = `${icons[type] || ''} ${msg}`;
    toast.className   = `pet-toast pet-toast-${type}`;
    toast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.add('hidden'), 2500);
  },

  toggleTheme() {
    const settings  = AIPetCore.getSettings();
    const newTheme  = settings.theme === 'pink' ? 'dark' : 'pink';
    AIPetCore.updateSettings({ theme: newTheme });
    const win = document.getElementById('ai-pet-float');
    if (win) {
      win.classList.remove('theme-pink', 'theme-dark');
      win.classList.add(`theme-${newTheme}`);
    }
    AIPetLog.info('UI', `主题切换为: ${newTheme}`);
  },

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
      const maxLeft = window.innerWidth  - win.offsetWidth;
      const maxTop  = window.innerHeight - win.offsetHeight;
      win.style.left   = Math.max(0, Math.min(maxLeft, origLeft + e.clientX - startX)) + 'px';
      win.style.top    = Math.max(0, Math.min(maxTop,  origTop  + e.clientY - startY)) + 'px';
      win.style.right  = 'auto';
      win.style.bottom = 'auto';
    });

    $(document).on('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      const win = document.getElementById('ai-pet-float');
      if (win) win.style.transition = '';
    });
  },
};

/* BLOCK END: UI系统 - 悬浮窗与消息注入 */

/* ============================================================ */
/* BLOCK START: 配置面板注入                                     */
/* ============================================================ */

const AIPetSettings = {

  init() {
    this._injectSettingsPanel();
    this._bindSettingsEvents();
  },

  _injectSettingsPanel() {
    if (document.getElementById('ai-pet-settings-panel')) {
      AIPetLog.info('Settings', '配置面板已存在，跳过注入');
      return;
    }

    fetch(`${AI_PET_EXT_PATH}/settings.html`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(html => {
        const possibleParents = [
          document.getElementById('extensions_settings'),
          document.getElementById('extensions_settings2'),
          document.querySelector('.extensions_block'),
        ];
        const parent = possibleParents.find(p => p)
          || document.getElementById('top-settings-holder')
          || document.body;

        const container = document.createElement('div');
        container.id        = 'ai-pet-settings-panel';
        container.className = 'extension_container';
        container.innerHTML = html;
        parent.appendChild(container);

        // 动态加载 settings.css
        if (!document.querySelector(`link[href*="ai-pet-extension/settings.css"]`)) {
          const link = document.createElement('link');
          link.rel  = 'stylesheet';
          link.href = `${AI_PET_EXT_PATH}/settings.css`;
          document.head.appendChild(link);
        }

        // 同步主题class
        const wrap = container.querySelector('.ai-pet-sp-wrap');
        if (wrap && AIPetCore.getSettings()?.theme === 'dark') {
          wrap.classList.add('theme-dark-sp');
        }

        this._syncSettingsUI();
        AIPetLog.info('Settings', '配置面板注入成功');
      })
      .catch(e => AIPetLog.error('Settings', '配置面板加载失败', e));
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
    $('#ai-pet-sp-template').val(s.messageTemplate);
    $('#ai-pet-sp-log-level').val(s.logLevel);
    $('#ai-pet-sp-theme').val(s.theme);

    // API区块显示控制
    this._toggleApiSection(s.mode === 'api');

    // 已缓存的模型列表
    if (s.availableModels?.length) {
      this._renderModelOptions(s.availableModels, s.model);
    }

    AIPetLog.debug('Settings', 'UI数据同步完成');
  },

  _bindSettingsEvents() {
    $(document).on('change', '#ai-pet-sp-enabled', function () {
      AIPetCore.updateSettings({ enabled: this.checked });
      AIPetLog.info('Settings', `插件${this.checked ? '已启用' : '已禁用'}`);
    });

    $(document).on('change', '#ai-pet-sp-mode', function () {
      AIPetCore.updateSettings({ mode: this.value });
      AIPetSettings._toggleApiSection(this.value === 'api');
    });

    $(document).on('input', '#ai-pet-sp-api-key',  function () {
      AIPetCore.updateSettings({ apiKey: this.value.trim() });
    });

    $(document).on('input', '#ai-pet-sp-api-base', function () {
      AIPetCore.updateSettings({ apiBaseUrl: this.value.trim() });
    });

    $(document).on('click', '#ai-pet-sp-fetch-models', () => this._fetchModels());
    $(document).on('click', '#ai-pet-sp-test-api',     () => this._testApiConnection());

    $(document).on('change', '#ai-pet-sp-model', function () {
      AIPetCore.updateSettings({ model: this.value });
      AIPetLog.info('Settings', `模型已选择: ${this.value}`);
    });

    $(document).on('input', '#ai-pet-sp-template', function () {
      AIPetCore.updateSettings({ messageTemplate: this.value });
    });

    $(document).on('change', '#ai-pet-sp-log-level', function () {
      AIPetCore.updateSettings({ logLevel: this.value });
    });

    $(document).on('change', '#ai-pet-sp-theme', function () {
      AIPetCore.updateSettings({ theme: this.value });
      // 同步悬浮窗主题
      const win = document.getElementById('ai-pet-float');
      if (win) {
        win.classList.remove('theme-pink', 'theme-dark');
        win.classList.add(`theme-${this.value}`);
      }
      // 同步配置面板主题
      const wrap = document.querySelector('.ai-pet-sp-wrap');
      if (wrap) {
        wrap.classList.toggle('theme-dark-sp', this.value === 'dark');
      }
    });

    $(document).on('click', '#ai-pet-sp-collapse-btn', () => this._toggleCollapse());
    $(document).on('click', '#ai-pet-sp-export',       () => this._exportData());
    $(document).on('click', '#ai-pet-sp-clear-all',    () => this._clearAllData());
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
  },

  async _fetchModels() {
    const s      = AIPetCore.getSettings();
    const apiKey = s.apiKey?.trim();
    const base   = s.apiBaseUrl?.trim();

    if (!apiKey || !base) {
      this._setStatus('models', '请先填写 API Key 和 Base URL', 'error');
      return;
    }

    const btn = document.getElementById('ai-pet-sp-fetch-models');
    if (btn) { btn.disabled = true; btn.textContent = '获取中...'; }
    this._setStatus('models', '正在获取模型列表...', 'loading');

    try {
      const res = await fetch(base.replace(/\/$/, '') + '/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 100)}`);

      const data   = await res.json();
      const models = (data.data || data.models || [])
        .map(m => typeof m === 'string' ? m : m.id)
        .filter(Boolean);

      if (!models.length) throw new Error('未获取到任何模型');

      AIPetCore.updateSettings({ availableModels: models });
      this._renderModelOptions(models, s.model);
      this._setStatus('models', `✅ 获取成功，共 ${models.length} 个模型`, 'success');
      AIPetLog.info('Settings', `模型列表: ${models.length} 个`);

    } catch (e) {
      AIPetLog.error('Settings', '获取模型失败', e);
      this._setStatus('models', `❌ 获取失败: ${e.message}`, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '获取模型'; }
    }
  },

  _renderModelOptions(models, currentModel) {
    const select = document.getElementById('ai-pet-sp-model');
    if (!select) return;
    select.innerHTML = '<option value="">-- 请选择模型 --</option>'
      + models.map(m =>
          `<option value="${m}"${m === currentModel ? ' selected' : ''}>${m}</option>`
        ).join('');
  },

  async _testApiConnection() {
    const s = AIPetCore.getSettings();
    if (!s.apiKey?.trim() || !s.apiBaseUrl?.trim() || !s.model) {
      this._setStatus('test', '请先填写 API Key、Base URL 并选择模型', 'error');
      return;
    }

    const btn = document.getElementById('ai-pet-sp-test-api');
    if (btn) { btn.disabled = true; btn.textContent = '测试中...'; }
    this._setStatus('test', '正在测试连接...', 'loading');

    try {
      const res = await fetch(s.apiBaseUrl.replace(/\/$/, '') + '/chat/completions', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${s.apiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model:      s.model,
          max_tokens: 10,
          messages:   [{ role: 'user', content: 'Hi' }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);

      const data  = await res.json();
      const reply = data.choices?.[0]?.message?.content || '(无回复)';
      this._setStatus('test', `✅ 连接成功！回复: "${reply}"`, 'success');
      AIPetLog.info('Settings', 'API连通性测试成功');

    } catch (e) {
      AIPetLog.error('Settings', 'API测试失败', e);
      this._setStatus('test', `❌ 连接失败: ${e.message}`, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '测试连接'; }
    }
  },

  _setStatus(which, msg, type) {
    const idMap = { models: 'ai-pet-sp-models-status', test: 'ai-pet-sp-test-status' };
    const el = document.getElementById(idMap[which]);
    if (!el) return;
    el.textContent = msg;
    el.className   = `ai-pet-sp-status ai-pet-sp-status-${type}`;
  },

  _exportData() {
    try {
      const blob = new Blob(
        [JSON.stringify(AIPetCore.getData(), null, 2)],
        { type: 'application/json' }
      );
      const url = URL.createObjectURL(blob);
      const a   = Object.assign(document.createElement('a'), {
        href:     url,
        download: `ai-pet-data-${new Date().toISOString().slice(0, 10)}.json`,
      });
      a.click();
      URL.revokeObjectURL(url);
      AIPetLog.info('Settings', '数据已导出');
    } catch (e) {
      AIPetLog.error('Settings', '数据导出失败', e);
    }
  },

  _clearAllData() {
    if (!confirm('⚠️ 确定要清空所有桌宠数据吗？此操作不可撤销！')) return;
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
  _decayTimer: null,

  init() {
    this._decayTimer = setInterval(
      () => AIPetPetManager.naturalDecay(),
      60 * 60 * 1000
    );
    AIPetLog.info('Timers', '属性衰减定时器已启动');
  },

  destroy() {
    if (this._decayTimer) {
      clearInterval(this._decayTimer);
      this._decayTimer = null;
    }
  },
};

/* BLOCK END: 定时器系统 */

/* ============================================================ */
/* BLOCK START: 插件入口与初始化                                  */
/* ============================================================ */

AIPetLog.info('Init', `${AI_PET_NAME} v${AI_PET_VERSION} 开始初始化`);

try {
  // extension_settings 由 import 保证已就绪，直接初始化
  AIPetCore.load();
  AIPetUI.init();
  AIPetEvents.init();
  AIPetSettings.init();
  AIPetTimers.init();
  AIPetLog.info('Init', '✅ 所有模块初始化完成');
} catch (e) {
  AIPetLog.error('Init', '初始化过程中发生错误', e);
}

/* BLOCK END: 插件入口与初始化 */
