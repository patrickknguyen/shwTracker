// ============================================================
// shwTracker - Maplestory Daily/Weekly Task Tracker
// ============================================================

const DAILY_RESET_HOUR_UTC = 0;   // Midnight UTC
const WEEKLY_RESET_DAY = 4;       // Thursday (0=Sun, 4=Thu)
const WEEKLY_RESET_HOUR_UTC = 0;  // Midnight UTC Thursday

// Fixed task definitions
const DAILY_TASK = { id: 'daily', emoji: '⚔️' };
const EVENT_TASK = { id: 'event', emoji: '🎉' };
const BOSS_TASKS = [
  { id: 'ctene', emoji: '👹', name: 'ctene', reset: 'weekly' },
  { id: 'grandis', emoji: '🐉', name: 'grandis', reset: 'weekly' },
  { id: 'bm', emoji: '💀', name: 'bm', reset: 'monthly' }
];

// ---- State ----
let state = null;
let availableCharacters = [];
let memoCharModalTarget = null; // memo id being edited for character tags

// ---- Default State ----
function createDefaultState(charImages) {
  const characters = charImages.slice(0, 6).map(c => ({
    id: genId(),
    image: c.filename
  }));

  return {
    characters,
    eventActive: false,
    checks: {},          // { "charId:taskId": true }
    memos: [],           // { id, text, createdAt, charIds: [] }
    lastDailyReset: null,
    lastWeeklyReset: null,
    lastMonthlyReset: null
  };
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// ---- Date Helpers ----
function updateDateInfo() {
  const now = new Date();

  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  document.getElementById('current-date').textContent = dateStr;

  const daysSinceThursday = (now.getUTCDay() - WEEKLY_RESET_DAY + 7) % 7;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - daysSinceThursday);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  document.getElementById('week-range').textContent = `Week of ${fmt(weekStart)} ~ ${fmt(weekEnd)}`;
}

// ---- Reset Logic ----
function checkResets() {
  const now = new Date();
  let changed = false;

  const todayResetUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DAILY_RESET_HOUR_UTC));
  if (!state.lastDailyReset || (new Date(state.lastDailyReset) < todayResetUTC && now >= todayResetUTC)) {
    const dailyIds = new Set([DAILY_TASK.id, EVENT_TASK.id]);
    for (const key of Object.keys(state.checks)) {
      if (dailyIds.has(key.split(':')[1])) delete state.checks[key];
    }
    state.lastDailyReset = now.toISOString();
    changed = true;
  }

  const daysSinceThursday = (now.getUTCDay() - WEEKLY_RESET_DAY + 7) % 7;
  const thisWeekReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceThursday, WEEKLY_RESET_HOUR_UTC));
  if (now < thisWeekReset) thisWeekReset.setUTCDate(thisWeekReset.getUTCDate() - 7);

  if (!state.lastWeeklyReset || (new Date(state.lastWeeklyReset) < thisWeekReset && now >= thisWeekReset)) {
    const weeklyIds = new Set(BOSS_TASKS.filter(t => t.reset === 'weekly').map(t => t.id));
    for (const key of Object.keys(state.checks)) {
      if (weeklyIds.has(key.split(':')[1])) delete state.checks[key];
    }
    state.lastWeeklyReset = now.toISOString();
    changed = true;
  }

  const thisMonthReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0));
  if (!state.lastMonthlyReset || (new Date(state.lastMonthlyReset) < thisMonthReset && now >= thisMonthReset)) {
    const monthlyIds = new Set(BOSS_TASKS.filter(t => t.reset === 'monthly').map(t => t.id));
    for (const key of Object.keys(state.checks)) {
      if (monthlyIds.has(key.split(':')[1])) delete state.checks[key];
    }
    state.lastMonthlyReset = now.toISOString();
    changed = true;
  }

  return changed;
}

// ---- Rendering ----
function getCharDataUrl(filename) {
  const match = availableCharacters.find(c => c.filename === filename);
  return match ? match.dataUrl : '';
}

function getCharDataUrlById(charId) {
  const char = state.characters.find(c => c.id === charId);
  return char ? getCharDataUrl(char.image) : '';
}

function renderAll() {
  renderDailies();
  renderBosses();
  renderMemos();
  updateDateInfo();
}

function renderDailies() {
  const headerRow = document.getElementById('dailies-header-row');
  const tbody = document.getElementById('dailies-body');

  while (headerRow.children.length > 2) headerRow.removeChild(headerRow.lastChild);

  const thDaily = document.createElement('th');
  thDaily.innerHTML = `<div class="task-header"><span class="task-emoji-static">${DAILY_TASK.emoji}</span><span class="task-label">dailies</span></div>`;
  headerRow.appendChild(thDaily);

  if (state.eventActive) {
    const thEvent = document.createElement('th');
    thEvent.innerHTML = `<div class="task-header"><span class="task-emoji-static">${EVENT_TASK.emoji}</span><span class="task-label">event</span></div>`;
    headerRow.appendChild(thEvent);
  }

  tbody.innerHTML = '';
  state.characters.forEach(char => {
    const tr = document.createElement('tr');

    const tdRemove = document.createElement('td');
    tdRemove.className = 'remove-cell';
    tdRemove.innerHTML = `<button class="btn-remove-char" data-char-id="${char.id}" title="Remove character">&times;</button>`;
    tr.appendChild(tdRemove);

    const tdChar = document.createElement('td');
    tdChar.className = 'char-cell';
    const dataUrl = getCharDataUrl(char.image);
    tdChar.innerHTML = dataUrl
      ? `<img class="char-img" src="${dataUrl}" alt="character">`
      : `<div class="char-img" style="display:flex;align-items:center;justify-content:center;font-size:18px;">?</div>`;
    tr.appendChild(tdChar);

    const tdDaily = document.createElement('td');
    tdDaily.className = 'check-cell';
    const dailyKey = `${char.id}:${DAILY_TASK.id}`;
    tdDaily.innerHTML = `<input type="checkbox" ${state.checks[dailyKey] ? 'checked' : ''} data-key="${dailyKey}">`;
    tr.appendChild(tdDaily);

    if (state.eventActive) {
      const tdEvent = document.createElement('td');
      tdEvent.className = 'check-cell';
      const eventKey = `${char.id}:${EVENT_TASK.id}`;
      tdEvent.innerHTML = `<input type="checkbox" ${state.checks[eventKey] ? 'checked' : ''} data-key="${eventKey}">`;
      tr.appendChild(tdEvent);
    }

    tbody.appendChild(tr);
  });
}

function renderBosses() {
  const headerRow = document.getElementById('bosses-header-row');
  const tbody = document.getElementById('bosses-body');

  headerRow.innerHTML = '';
  BOSS_TASKS.forEach(task => {
    const th = document.createElement('th');
    th.innerHTML = `
      <div class="task-header">
        <span class="task-emoji-static">${task.emoji}</span>
        <span class="task-label">${task.name}</span>
      </div>
    `;
    headerRow.appendChild(th);
  });

  tbody.innerHTML = '';
  state.characters.forEach(char => {
    const tr = document.createElement('tr');
    BOSS_TASKS.forEach(task => {
      const td = document.createElement('td');
      td.className = 'check-cell';
      const key = `${char.id}:${task.id}`;
      td.innerHTML = `<input type="checkbox" ${state.checks[key] ? 'checked' : ''} data-key="${key}">`;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function renderMemos() {
  const list = document.getElementById('memos-list');
  list.innerHTML = '';

  if (!state.memos || state.memos.length === 0) {
    list.innerHTML = '<div class="memo-empty">No memos yet</div>';
    return;
  }

  state.memos.forEach(memo => {
    const card = document.createElement('div');
    card.className = 'memo-card';

    const createdDate = new Date(memo.createdAt);
    const dateStr = createdDate.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });

    // Build character tags
    const charIds = memo.charIds || [];
    let charTagsHtml = '';
    if (charIds.length > 0) {
      const imgs = charIds.map(id => {
        const url = getCharDataUrlById(id);
        return url ? `<img class="memo-char-tag" src="${url}" alt="char">` : '';
      }).filter(Boolean).join('');
      charTagsHtml = `<div class="memo-char-tags">${imgs}</div>`;
    }

    card.innerHTML = `
      <div class="memo-header">
        <span class="memo-date">${dateStr}</span>
        <div class="memo-header-actions">
          <button class="btn-memo-tag" data-memo-id="${memo.id}" title="Tag characters">👤</button>
          <button class="btn-memo-delete" data-memo-id="${memo.id}" title="Delete memo">&times;</button>
        </div>
      </div>
      ${charTagsHtml}
      <textarea class="memo-text" data-memo-id="${memo.id}" rows="1" spellcheck="false" placeholder="Write a memo...">${escapeHtml(memo.text)}</textarea>
    `;
    list.appendChild(card);
  });

  // Auto-size all memo textareas
  list.querySelectorAll('.memo-text').forEach(autoResizeTextarea);
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Event Handlers ----
function setupEvents() {
  // Checkbox changes
  document.addEventListener('change', e => {
    if (e.target.type === 'checkbox' && e.target.dataset.key) {
      const key = e.target.dataset.key;
      if (e.target.checked) {
        state.checks[key] = true;
      } else {
        delete state.checks[key];
      }
      save();
    }
  });

  // Event toggle
  document.getElementById('event-toggle').addEventListener('change', e => {
    state.eventActive = e.target.checked;
    save();
    renderAll();
  });

  // Add character button
  document.getElementById('add-character').addEventListener('click', () => {
    showCharModal();
  });

  // Remove character button (delegated)
  document.addEventListener('click', e => {
    const removeBtn = e.target.closest('.btn-remove-char');
    if (removeBtn) {
      removeCharacter(removeBtn.dataset.charId);
    }
  });

  // Add memo
  document.getElementById('add-memo').addEventListener('click', () => {
    if (!state.memos) state.memos = [];
    state.memos.unshift({
      id: genId(),
      text: '',
      charIds: [],
      createdAt: new Date().toISOString()
    });
    save();
    renderMemos();
    const firstTextarea = document.querySelector('.memo-text');
    if (firstTextarea) firstTextarea.focus();
  });

  // Delete memo (delegated)
  document.addEventListener('click', e => {
    const deleteBtn = e.target.closest('.btn-memo-delete');
    if (deleteBtn) {
      state.memos = state.memos.filter(m => m.id !== deleteBtn.dataset.memoId);
      save();
      renderMemos();
    }
  });

  // Tag characters on memo (delegated)
  document.addEventListener('click', e => {
    const tagBtn = e.target.closest('.btn-memo-tag');
    if (tagBtn) {
      showMemoCharModal(tagBtn.dataset.memoId);
    }
  });

  // Memo text editing (delegated)
  document.addEventListener('input', e => {
    if (e.target.classList.contains('memo-text')) {
      const memo = state.memos.find(m => m.id === e.target.dataset.memoId);
      if (memo) {
        memo.text = e.target.value;
        save();
      }
      autoResizeTextarea(e.target);
    }
  });

  // Add-row modal
  document.getElementById('modal-close').addEventListener('click', hideCharModal);
  document.getElementById('char-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideCharModal();
  });

  // Memo char tag modal
  document.getElementById('memo-modal-close').addEventListener('click', hideMemoCharModal);
  document.getElementById('memo-char-done').addEventListener('click', hideMemoCharModal);
  document.getElementById('memo-char-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideMemoCharModal();
  });
}

// ---- Character CRUD ----
function removeCharacter(charId) {
  const idx = state.characters.findIndex(c => c.id === charId);
  if (idx !== -1) {
    state.characters.splice(idx, 1);
    for (const key of Object.keys(state.checks)) {
      if (key.startsWith(charId + ':')) delete state.checks[key];
    }
    // Also remove from memo tags
    state.memos.forEach(m => {
      if (m.charIds) m.charIds = m.charIds.filter(id => id !== charId);
    });
    save();
    renderAll();
  }
}

// ---- Character Modal (add row) ----
function showCharModal() {
  const grid = document.getElementById('char-grid');
  grid.innerHTML = '';

  availableCharacters.forEach(charImg => {
    const img = document.createElement('img');
    img.className = 'char-option';
    img.src = charImg.dataUrl;
    img.title = charImg.filename;
    img.addEventListener('click', () => {
      state.characters.push({ id: genId(), image: charImg.filename });
      save();
      renderAll();
      hideCharModal();
    });
    grid.appendChild(img);
  });

  document.getElementById('char-modal').classList.remove('hidden');
}

function hideCharModal() {
  document.getElementById('char-modal').classList.add('hidden');
}

// ---- Memo Character Tag Modal (multi-select) ----
function showMemoCharModal(memoId) {
  memoCharModalTarget = memoId;
  const memo = state.memos.find(m => m.id === memoId);
  if (!memo) return;
  if (!memo.charIds) memo.charIds = [];

  const grid = document.getElementById('memo-char-grid');
  grid.innerHTML = '';

  state.characters.forEach(char => {
    const dataUrl = getCharDataUrl(char.image);
    if (!dataUrl) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'char-option-wrapper';

    const img = document.createElement('img');
    img.className = 'char-option';
    img.src = dataUrl;
    if (memo.charIds.includes(char.id)) {
      img.classList.add('selected');
    }

    img.addEventListener('click', () => {
      const idx = memo.charIds.indexOf(char.id);
      if (idx === -1) {
        memo.charIds.push(char.id);
        img.classList.add('selected');
      } else {
        memo.charIds.splice(idx, 1);
        img.classList.remove('selected');
      }
      save();
    });

    wrapper.appendChild(img);
    grid.appendChild(wrapper);
  });

  document.getElementById('memo-char-modal').classList.remove('hidden');
}

function hideMemoCharModal() {
  document.getElementById('memo-char-modal').classList.add('hidden');
  memoCharModalTarget = null;
  renderMemos();
}

// ---- Persistence ----
async function save() {
  await window.api.saveData(state);
}

async function load() {
  return await window.api.loadData();
}

// ---- Init ----
async function init() {
  availableCharacters = await window.api.listCharacters();

  const saved = await load();
  if (saved) {
    state = saved;
    if (!state.memos) state.memos = [];
    state.memos.forEach(m => { if (!m.charIds) m.charIds = []; });
  } else {
    state = createDefaultState(availableCharacters);
  }

  document.getElementById('event-toggle').checked = state.eventActive;

  checkResets();
  await save();

  renderAll();
  setupEvents();

  setInterval(() => {
    if (checkResets()) {
      save();
      renderAll();
    }
    updateDateInfo();
  }, 60000);
}

init();
