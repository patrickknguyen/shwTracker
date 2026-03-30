// ============================================================
// shwTracker - Maplestory Daily/Weekly Task Tracker
// ============================================================

const DAILY_RESET_HOUR_UTC = 0;   // Midnight UTC
const WEEKLY_RESET_DAY = 4;       // Thursday (0=Sun, 4=Thu)
const WEEKLY_RESET_HOUR_UTC = 0;  // Midnight UTC Thursday

// Fixed task definitions
const DAILY_TASK = { id: 'daily', emoji: '⚔️' };
const EVENT_TASK = { id: 'event', emoji: '⭐' };
const DEFAULT_BOSS_TASKS = [
  { id: 'ctene', name: 'ctene', reset: 'weekly' },
  { id: 'grandis', name: 'grandis', reset: 'weekly' },
  { id: 'bm', name: 'bm', reset: 'monthly' }
];

function getBossTaskIcon(reset) {
  return reset === 'monthly' ? 'yellow_crystal.png' : 'purple_crystal.png';
}

// ---- State ----
let state = null;
let availableCharacters = [];
let bossData = [];
let memoCharModalTarget = null;
let currentTab = 'tracker';

// ---- Tracker Settings edit state ----
let trackerSettingsEditData = null;

// ---- Icon cache ----
let iconCache = {}; // { filename: dataUrl }

// ---- Drag state ----
let dragSrcIndex = null;

// ---- Default State ----
function createDefaultState(charImages) {
  const characters = charImages.slice(0, 6).map(c => ({
    id: genId(),
    image: c.filename
  }));

  return {
    characters,
    eventActive: false,
    bossTasks: JSON.parse(JSON.stringify(DEFAULT_BOSS_TASKS)),
    checks: {},
    memos: [],
    bossSelections: {},
    lastDailyReset: null,
    lastWeeklyReset: null,
    lastMonthlyReset: null
  };
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// ---- Filename display helper ----
function getDisplayName(filename) {
  // Remove extension for tooltip
  return filename.replace(/\.[^.]+$/, '');
}

// ---- Date Helpers (all UTC) ----
function updateDateInfo() {
  const now = new Date();

  // Format date in UTC
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const dayName = days[now.getUTCDay()];
  const monthName = months[now.getUTCMonth()];
  const day = now.getUTCDate();
  const year = now.getUTCFullYear();
  const dateStr = `${dayName}, ${monthName} ${day}, ${year}`;
  document.getElementById('current-date').textContent = dateStr;

  // Week range in UTC
  const daysSinceThursday = (now.getUTCDay() - WEEKLY_RESET_DAY + 7) % 7;
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceThursday));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = (d) => `${shortMonths[d.getUTCMonth()]} ${d.getUTCDate()}`;
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
    const weeklyIds = new Set(state.bossTasks.filter(t => t.reset === 'weekly').map(t => t.id));
    for (const key of Object.keys(state.checks)) {
      if (weeklyIds.has(key.split(':')[1])) delete state.checks[key];
    }
    state.lastWeeklyReset = now.toISOString();
    changed = true;
  }

  const thisMonthReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0));
  if (!state.lastMonthlyReset || (new Date(state.lastMonthlyReset) < thisMonthReset && now >= thisMonthReset)) {
    const monthlyIds = new Set(state.bossTasks.filter(t => t.reset === 'monthly').map(t => t.id));
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
  renderTracker();
  renderMemos();
  updateDateInfo();
  if (currentTab === 'income') renderIncome();
}

// ============================================================
// UNIFIED TRACKER (Dailies + Bosses in one table)
// ============================================================

function renderTracker() {
  renderTrackerHeaders();
  renderTrackerBody();
}

function renderTrackerHeaders() {
  // ---- Section row (Dailies label + toggle | Bosses label) ----
  const sectionRow = document.getElementById('tracker-section-row');
  sectionRow.className = 'section-row';
  sectionRow.innerHTML = '';

  const dailyCols = 2 + 1 + (state.eventActive ? 1 : 0); // remove + char + daily + event?
  const thDailies = document.createElement('th');
  thDailies.className = 'section-dailies';
  thDailies.colSpan = dailyCols;
  thDailies.innerHTML = `<span class="panel-title">Dailies</span>`;
  sectionRow.appendChild(thDailies);

  // Separator
  const thSepSection = document.createElement('th');
  thSepSection.className = 'separator-header';
  sectionRow.appendChild(thSepSection);

  // Bosses label + settings button (extra col for drag handle)
  const thBosses = document.createElement('th');
  thBosses.className = 'section-bosses';
  thBosses.colSpan = state.bossTasks.length + 1;
  thBosses.innerHTML = `
    <div class="section-bosses-inner">
      <span class="panel-title bosses-title">Bosses</span>
      <button class="btn-icon" id="tracker-settings-btn" title="Tracker Settings">&#9881;</button>
    </div>
  `;
  sectionRow.appendChild(thBosses);

  // ---- Emoji header row ----
  const headerRow = document.getElementById('tracker-header-row');
  headerRow.className = 'emoji-row';
  headerRow.innerHTML = '';

  // Remove col
  const thRemove = document.createElement('th');
  thRemove.className = 'col-remove';
  headerRow.appendChild(thRemove);

  // Char col
  const thChar = document.createElement('th');
  thChar.className = 'col-char';
  headerRow.appendChild(thChar);

  // Daily column
  const thDaily = document.createElement('th');
  thDaily.className = 'col-check';
  thDaily.innerHTML = `<div class="task-header"><span class="task-emoji-static">${DAILY_TASK.emoji}</span><span class="task-label">dailies</span></div>`;
  headerRow.appendChild(thDaily);

  // Event column (if active)
  if (state.eventActive) {
    const thEvent = document.createElement('th');
    thEvent.className = 'col-check';
    thEvent.innerHTML = `<div class="task-header"><span class="task-emoji-static">${EVENT_TASK.emoji}</span><span class="task-label">event</span></div>`;
    headerRow.appendChild(thEvent);
  }

  // Separator
  const thSep = document.createElement('th');
  thSep.className = 'separator-header';
  headerRow.appendChild(thSep);

  // Boss columns (use icon images)
  state.bossTasks.forEach(task => {
    const th = document.createElement('th');
    th.className = 'col-check';
    const iconUrl = iconCache[getBossTaskIcon(task.reset)] || '';
    const iconHtml = iconUrl
      ? `<img class="task-icon" src="${iconUrl}" alt="${task.name}">`
      : `<span class="task-emoji-static">?</span>`;
    th.innerHTML = `<div class="task-header">${iconHtml}<span class="task-label">${task.name}</span></div>`;
    headerRow.appendChild(th);
  });

  // Drag handle column header
  const thDragHandle = document.createElement('th');
  thDragHandle.className = 'drag-handle-cell';
  headerRow.appendChild(thDragHandle);
}

function renderTrackerBody() {
  const tbody = document.getElementById('tracker-body');
  tbody.innerHTML = '';

  state.characters.forEach((char, index) => {
    const tr = document.createElement('tr');
    tr.dataset.index = index;

    // Drag events (on row, but initiated via handle)
    tr.addEventListener('dragover', handleDragOver);
    tr.addEventListener('dragleave', handleDragLeave);
    tr.addEventListener('drop', handleDrop);

    // Remove button
    const tdRemove = document.createElement('td');
    tdRemove.className = 'remove-cell col-remove';
    tdRemove.innerHTML = `<button class="btn-remove-char" data-char-id="${char.id}" title="Remove character">&times;</button>`;
    tr.appendChild(tdRemove);

    // Character image with custom tooltip
    const tdChar = document.createElement('td');
    tdChar.className = 'char-cell col-char';
    const dataUrl = getCharDataUrl(char.image);
    const displayName = getDisplayName(char.image);
    tdChar.dataset.tooltip = displayName;
    tdChar.innerHTML = dataUrl
      ? `<img class="char-img" src="${dataUrl}" alt="character" draggable="false">`
      : `<div class="char-img" style="display:flex;align-items:center;justify-content:center;font-size:18px;">?</div>`;
    tr.appendChild(tdChar);

    // Daily checkbox
    const tdDaily = document.createElement('td');
    tdDaily.className = 'check-cell col-check';
    const dailyKey = `${char.id}:${DAILY_TASK.id}`;
    tdDaily.innerHTML = `<input type="checkbox" ${state.checks[dailyKey] ? 'checked' : ''} data-key="${dailyKey}">`;
    tr.appendChild(tdDaily);

    // Event checkbox (if active)
    if (state.eventActive) {
      const tdEvent = document.createElement('td');
      tdEvent.className = 'check-cell col-check';
      const eventKey = `${char.id}:${EVENT_TASK.id}`;
      tdEvent.innerHTML = `<input type="checkbox" ${state.checks[eventKey] ? 'checked' : ''} data-key="${eventKey}">`;
      tr.appendChild(tdEvent);
    }

    // Separator
    const tdSep = document.createElement('td');
    tdSep.className = 'separator-cell';
    tr.appendChild(tdSep);

    // Boss checkboxes
    state.bossTasks.forEach(task => {
      const td = document.createElement('td');
      td.className = 'check-cell col-check boss-check' + (task.reset === 'monthly' ? ' bm-check' : '');
      const key = `${char.id}:${task.id}`;
      td.innerHTML = `<input type="checkbox" ${state.checks[key] ? 'checked' : ''} data-key="${key}">`;
      tr.appendChild(td);
    });

    // Drag handle
    const tdDrag = document.createElement('td');
    tdDrag.className = 'drag-handle-cell';
    tdDrag.innerHTML = `<div class="drag-handle" draggable="true"><span class="drag-handle-dot"></span><span class="drag-handle-dot"></span><span class="drag-handle-dot"></span></div>`;
    const handle = tdDrag.querySelector('.drag-handle');
    handle.addEventListener('dragstart', (e) => {
      dragSrcIndex = index;
      tr.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index.toString());
    });
    handle.addEventListener('dragend', () => {
      tr.classList.remove('dragging');
      document.querySelectorAll('#tracker-body tr').forEach(r => {
        r.classList.remove('drag-over-top', 'drag-over-bottom');
      });
      dragSrcIndex = null;
    });
    tr.appendChild(tdDrag);

    tbody.appendChild(tr);
  });
}

// ============================================================
// DRAG AND DROP
// ============================================================

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const tr = e.currentTarget;
  const rect = tr.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;

  // Clear previous indicators
  tr.classList.remove('drag-over-top', 'drag-over-bottom');

  if (e.clientY < midY) {
    tr.classList.add('drag-over-top');
  } else {
    tr.classList.add('drag-over-bottom');
  }
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
}

function handleDrop(e) {
  e.preventDefault();
  const tr = e.currentTarget;
  tr.classList.remove('drag-over-top', 'drag-over-bottom');

  const targetIndex = parseInt(tr.dataset.index);
  if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;

  const rect = tr.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  let insertIndex = e.clientY < midY ? targetIndex : targetIndex + 1;

  // Adjust insert index if dragging from above
  if (dragSrcIndex < insertIndex) insertIndex--;

  // Reorder
  const [moved] = state.characters.splice(dragSrcIndex, 1);
  state.characters.splice(insertIndex, 0, moved);

  dragSrcIndex = null;
  save();
  renderTracker();
}


// ============================================================
// MEMOS
// ============================================================

function renderMemos() {
  const list = document.getElementById('memos-list');
  list.innerHTML = '';

  if (!state.memos || state.memos.length === 0) {
    list.innerHTML = '<div class="memo-empty">No memos yet</div>';
    return;
  }

  // Sort oldest to newest
  const sorted = [...state.memos].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  sorted.forEach(memo => {
    const card = document.createElement('div');
    card.className = 'memo-card';

    const createdDate = new Date(memo.createdAt);
    // Format in UTC
    const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const h = createdDate.getUTCHours();
    const m = createdDate.getUTCMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    const dateStr = `${shortMonths[createdDate.getUTCMonth()]} ${createdDate.getUTCDate()}, ${createdDate.getUTCFullYear()}, ${h12}:${m.toString().padStart(2, '0')} ${ampm} UTC`;

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

  list.querySelectorAll('.memo-text').forEach(autoResizeTextarea);

  // Auto-scroll to bottom (newest memo)
  list.scrollTop = list.scrollHeight;
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

// ============================================================
// INCOME VIEW
// ============================================================

function diffClass(level) {
  switch ((level || '').toLowerCase()) {
    case 'easy':    return 'diff-easy';
    case 'normal':  return 'diff-normal';
    case 'chaos':   return 'diff-chaos';
    case 'hard':    return 'diff-hard';
    case 'extreme': return 'diff-extreme';
    default:        return 'diff-none';
  }
}

function formatMeso(value) {
  if (!value || value === 0) return '0';
  return value.toLocaleString('en-US');
}

function getSelectedMeso(charId, bossName) {
  const key = `${charId}:${bossName}`;
  const difficulty = state.bossSelections[key];
  if (!difficulty || difficulty === 'None') return 0;

  const boss = bossData.find(b => b.name === bossName);
  if (!boss) return 0;

  const diff = boss.difficulties.find(d => d.level === difficulty);
  return diff ? diff.meso : 0;
}

function getCharTotal(charId) {
  let total = 0;
  bossData.forEach(boss => {
    total += getSelectedMeso(charId, boss.name);
  });
  return total;
}

function renderIncome() {
  const thead = document.getElementById('income-thead');
  const tbody = document.getElementById('income-tbody');
  const tfoot = document.getElementById('income-tfoot');

  // Boss header row — no category grouping
  let bossRowHtml = '<tr class="boss-header-row"><th class="income-char-col"></th>';
  bossData.forEach(boss => {
    bossRowHtml += `<th>${escapeHtml(boss.name)}</th>`;
  });
  bossRowHtml += '<th class="income-total-col">Total</th></tr>';
  thead.innerHTML = bossRowHtml;

  // Character rows with per-character total column
  tbody.innerHTML = '';
  let grandTotal = 0;

  state.characters.forEach(char => {
    const tr = document.createElement('tr');

    const tdChar = document.createElement('td');
    tdChar.className = 'income-char-cell';
    const dataUrl = getCharDataUrl(char.image);
    const displayName = getDisplayName(char.image);
    tdChar.dataset.tooltip = displayName;
    tdChar.innerHTML = dataUrl
      ? `<img class="char-img" src="${dataUrl}" alt="character">`
      : `<div class="char-img" style="display:flex;align-items:center;justify-content:center;font-size:14px;">?</div>`;
    tr.appendChild(tdChar);

    bossData.forEach(boss => {
      const td = document.createElement('td');
      const key = `${char.id}:${boss.name}`;
      const current = state.bossSelections[key] || 'None';
      let options = '<option value="None">-</option>';
      boss.difficulties.forEach(d => {
        const sel = d.level === current ? ' selected' : '';
        options += `<option value="${d.level}"${sel}>${d.level}</option>`;
      });
      td.innerHTML = `<select class="boss-select ${diffClass(current)}" data-key="${key}">${options}</select>`;
      tr.appendChild(td);
    });

    const charTotal = getCharTotal(char.id);
    grandTotal += charTotal;
    const tdTotal = document.createElement('td');
    tdTotal.className = 'income-total-col';
    tdTotal.textContent = formatMeso(charTotal);
    tr.appendChild(tdTotal);

    tbody.appendChild(tr);
  });

  // Grand total footer row
  tfoot.innerHTML = '';
  const tfRow = document.createElement('tr');
  // Empty char cell + empty boss cells
  const tfChar = document.createElement('td');
  tfRow.appendChild(tfChar);
  bossData.forEach(() => {
    tfRow.appendChild(document.createElement('td'));
  });
  const tfTotal = document.createElement('td');
  tfTotal.className = 'income-total-col';
  tfTotal.textContent = formatMeso(grandTotal);
  tfRow.appendChild(tfTotal);
  tfoot.appendChild(tfRow);
}

// ============================================================
// BOSS MANAGER MODAL
// ============================================================

let bossEditData = [];

function showBossModal() {
  bossEditData = JSON.parse(JSON.stringify(bossData));
  renderBossModal();
  document.getElementById('boss-modal').classList.remove('hidden');
}

function hideBossModal() {
  document.getElementById('boss-modal').classList.add('hidden');
  bossEditData = [];
}

function renderBossModal() {
  const list = document.getElementById('boss-modal-list');
  list.innerHTML = '';

  bossEditData.forEach((boss, bi) => {
    const entry = document.createElement('div');
    entry.className = 'boss-entry';

    const header = document.createElement('div');
    header.className = 'boss-entry-header';

    const left = document.createElement('div');
    left.className = 'boss-entry-left';

    const nameInput = document.createElement('input');
    nameInput.className = 'boss-name-input';
    nameInput.type = 'text';
    nameInput.value = boss.name;
    nameInput.addEventListener('input', e => { boss.name = e.target.value; });
    nameInput.addEventListener('click', e => e.stopPropagation());

    left.appendChild(nameInput);

    const actions = document.createElement('div');
    actions.className = 'boss-entry-actions';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'boss-toggle-btn';
    toggleBtn.textContent = '▼';
    toggleBtn.addEventListener('click', () => {
      const diffs = entry.querySelector('.boss-diffs');
      diffs.classList.toggle('open');
      toggleBtn.textContent = diffs.classList.contains('open') ? '▲' : '▼';
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'boss-remove-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', () => {
      bossEditData.splice(bi, 1);
      renderBossModal();
    });

    actions.appendChild(toggleBtn);
    actions.appendChild(removeBtn);

    header.appendChild(left);
    header.appendChild(actions);
    entry.appendChild(header);

    const diffsDiv = document.createElement('div');
    diffsDiv.className = 'boss-diffs';

    boss.difficulties.forEach((diff, di) => {
      const row = document.createElement('div');
      row.className = 'boss-diff-row';

      const levelInput = document.createElement('input');
      levelInput.className = 'boss-diff-level';
      levelInput.type = 'text';
      levelInput.value = diff.level;
      levelInput.placeholder = 'Difficulty';
      levelInput.addEventListener('input', e => { diff.level = e.target.value; });

      const mesoInput = document.createElement('input');
      mesoInput.className = 'boss-diff-meso';
      mesoInput.type = 'text';
      mesoInput.value = formatMeso(diff.meso);
      mesoInput.placeholder = 'Meso value';
      mesoInput.addEventListener('focus', () => { mesoInput.value = diff.meso.toString(); });
      mesoInput.addEventListener('blur', () => {
        const val = parseInt(mesoInput.value.replace(/[^0-9]/g, ''), 10) || 0;
        diff.meso = val;
        mesoInput.value = formatMeso(val);
      });

      const removeD = document.createElement('button');
      removeD.className = 'boss-diff-remove';
      removeD.innerHTML = '&times;';
      removeD.addEventListener('click', () => {
        boss.difficulties.splice(di, 1);
        renderBossModal();
        const entries = document.querySelectorAll('.boss-entry');
        if (entries[bi]) entries[bi].querySelector('.boss-diffs').classList.add('open');
      });

      row.appendChild(levelInput);
      row.appendChild(mesoInput);
      row.appendChild(removeD);
      diffsDiv.appendChild(row);
    });

    const addDiffBtn = document.createElement('button');
    addDiffBtn.className = 'boss-add-diff';
    addDiffBtn.textContent = '+ Add Difficulty';
    addDiffBtn.addEventListener('click', () => {
      boss.difficulties.push({ level: '', meso: 0 });
      renderBossModal();
      const entries = document.querySelectorAll('.boss-entry');
      if (entries[bi]) {
        entries[bi].querySelector('.boss-diffs').classList.add('open');
        entries[bi].querySelector('.boss-toggle-btn').textContent = '▲';
      }
    });
    diffsDiv.appendChild(addDiffBtn);

    entry.appendChild(diffsDiv);
    list.appendChild(entry);
  });
}

// ============================================================
// TRACKER SETTINGS MODAL
// ============================================================

function showTrackerSettingsModal() {
  trackerSettingsEditData = {
    eventActive: state.eventActive,
    bossTasks: JSON.parse(JSON.stringify(state.bossTasks))
  };
  renderTrackerSettingsModal();
  document.getElementById('tracker-settings-modal').classList.remove('hidden');
}

function hideTrackerSettingsModal() {
  document.getElementById('tracker-settings-modal').classList.add('hidden');
  trackerSettingsEditData = null;
}

function renderTrackerSettingsModal() {
  const body = document.getElementById('tracker-settings-modal-body');
  body.innerHTML = '';

  // ---- Dailies section ----
  const dailiesSection = document.createElement('div');
  dailiesSection.className = 'ts-section';

  const dailiesTitle = document.createElement('div');
  dailiesTitle.className = 'ts-section-title';
  dailiesTitle.textContent = 'Dailies';
  dailiesSection.appendChild(dailiesTitle);

  const eventRow = document.createElement('div');
  eventRow.className = 'ts-row';
  const eventLabel = document.createElement('span');
  eventLabel.className = 'ts-row-label';
  eventLabel.textContent = 'Event column';
  const eventToggleBtn = document.createElement('button');
  eventToggleBtn.className = 'ts-event-toggle' + (trackerSettingsEditData.eventActive ? ' active' : '');
  eventToggleBtn.textContent = 'Event';
  eventToggleBtn.addEventListener('click', () => {
    trackerSettingsEditData.eventActive = !trackerSettingsEditData.eventActive;
    renderTrackerSettingsModal();
  });
  eventRow.appendChild(eventLabel);
  eventRow.appendChild(eventToggleBtn);
  dailiesSection.appendChild(eventRow);
  body.appendChild(dailiesSection);

  // ---- Boss Columns section ----
  const bossSection = document.createElement('div');
  bossSection.className = 'ts-section';

  const bossTitle = document.createElement('div');
  bossTitle.className = 'ts-section-title';
  bossTitle.textContent = 'Boss Columns';
  bossSection.appendChild(bossTitle);

  trackerSettingsEditData.bossTasks.forEach((task, i) => {
    const row = document.createElement('div');
    row.className = 'ts-boss-row';

    // Crystal icon preview
    const iconUrl = iconCache[getBossTaskIcon(task.reset)] || '';
    const iconEl = document.createElement('img');
    iconEl.className = 'ts-boss-icon';
    iconEl.src = iconUrl;
    iconEl.alt = task.reset;
    row.appendChild(iconEl);

    // Name input
    const nameInput = document.createElement('input');
    nameInput.className = 'ts-boss-name';
    nameInput.type = 'text';
    nameInput.value = task.name;
    nameInput.addEventListener('input', e => { task.name = e.target.value; });
    row.appendChild(nameInput);

    // Reset type select
    const resetSelect = document.createElement('select');
    resetSelect.className = 'ts-reset-select ts-' + task.reset;
    ['weekly', 'monthly'].forEach(type => {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = type.charAt(0).toUpperCase() + type.slice(1);
      if (task.reset === type) opt.selected = true;
      resetSelect.appendChild(opt);
    });
    resetSelect.addEventListener('change', e => {
      task.reset = e.target.value;
      renderTrackerSettingsModal();
    });
    row.appendChild(resetSelect);

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'ts-boss-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', () => {
      trackerSettingsEditData.bossTasks.splice(i, 1);
      renderTrackerSettingsModal();
    });
    row.appendChild(removeBtn);

    bossSection.appendChild(row);
  });

  body.appendChild(bossSection);
}

function saveTrackerSettings() {
  const oldTaskIds = new Set(state.bossTasks.map(t => t.id));
  const newTaskIds = new Set(trackerSettingsEditData.bossTasks.map(t => t.id));
  const removedIds = [...oldTaskIds].filter(id => !newTaskIds.has(id));

  // Clean up check keys for removed boss columns
  for (const key of Object.keys(state.checks)) {
    if (removedIds.includes(key.split(':')[1])) delete state.checks[key];
  }

  state.eventActive = trackerSettingsEditData.eventActive;
  state.bossTasks = trackerSettingsEditData.bossTasks;

  save();
  hideTrackerSettingsModal();
  renderAll();
}

// ============================================================
// EVENT HANDLERS
// ============================================================

function setupEvents() {
  // Tab switching
  document.querySelectorAll('#tab-bar .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#tab-bar .tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      const viewId = tab.dataset.tab === 'tracker' ? 'tracker-view' : 'income-view';
      document.getElementById(viewId).classList.add('active');
      currentTab = tab.dataset.tab;
      if (currentTab === 'income') renderIncome();
    });
  });

  // Checkbox changes (tracker)
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

  // Boss select dropdown changes (income)
  document.addEventListener('change', e => {
    if (e.target.classList.contains('boss-select')) {
      const key = e.target.dataset.key;
      const value = e.target.value;
      if (value === 'None') {
        delete state.bossSelections[key];
      } else {
        state.bossSelections[key] = value;
      }
      save();
      renderIncome();
    }
  });

  // Event toggle is bound in renderTrackerHeaders() since it's rebuilt on each render

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

  // Add memo — push to end (oldest first display)
  document.getElementById('add-memo').addEventListener('click', () => {
    if (!state.memos) state.memos = [];
    state.memos.push({
      id: genId(),
      text: '',
      charIds: [],
      createdAt: new Date().toISOString()
    });
    save();
    renderMemos();
    // Focus the last (newest) textarea
    const textareas = document.querySelectorAll('.memo-text');
    if (textareas.length > 0) textareas[textareas.length - 1].focus();
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

  // Character modal
  document.getElementById('modal-close').addEventListener('click', hideCharModal);
  document.getElementById('char-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideCharModal();
  });
  document.getElementById('open-char-folder').addEventListener('click', async () => {
    await window.api.openCharactersFolder();
  });

  // Memo char tag modal
  document.getElementById('memo-modal-close').addEventListener('click', hideMemoCharModal);
  document.getElementById('memo-char-done').addEventListener('click', hideMemoCharModal);
  document.getElementById('memo-char-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideMemoCharModal();
  });

  // Tracker settings (delegated — button is recreated on each render)
  document.addEventListener('click', e => {
    if (e.target.closest('#tracker-settings-btn')) showTrackerSettingsModal();
  });
  document.getElementById('tracker-settings-close').addEventListener('click', hideTrackerSettingsModal);
  document.getElementById('tracker-settings-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideTrackerSettingsModal();
  });
  document.getElementById('tracker-settings-save').addEventListener('click', saveTrackerSettings);
  document.getElementById('tracker-settings-add-boss').addEventListener('click', () => {
    trackerSettingsEditData.bossTasks.push({ id: genId(), name: 'New Boss', reset: 'weekly' });
    renderTrackerSettingsModal();
    const body = document.getElementById('tracker-settings-modal-body');
    body.scrollTop = body.scrollHeight;
  });

  // Boss manager
  document.getElementById('manage-bosses').addEventListener('click', showBossModal);
  document.getElementById('boss-modal-close').addEventListener('click', hideBossModal);
  document.getElementById('boss-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideBossModal();
  });

  document.getElementById('boss-add-new').addEventListener('click', () => {
    bossEditData.push({ name: 'New Boss', category: 'Arcane', difficulties: [{ level: 'Normal', meso: 0 }] });
    renderBossModal();
    const body = document.getElementById('boss-modal-list');
    body.scrollTop = body.scrollHeight;
  });

  document.getElementById('boss-reset-defaults').addEventListener('click', async () => {
    bossData = await window.api.resetBossData();
    bossEditData = JSON.parse(JSON.stringify(bossData));
    renderBossModal();
  });

  document.getElementById('boss-save').addEventListener('click', async () => {
    bossEditData = bossEditData.filter(b => b.name.trim() !== '');
    bossEditData.forEach(b => {
      b.difficulties = b.difficulties.filter(d => d.level.trim() !== '');
    });

    bossData = JSON.parse(JSON.stringify(bossEditData));
    await window.api.saveBossData(bossData);
    save();
    hideBossModal();
    renderIncome();
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
    for (const key of Object.keys(state.bossSelections)) {
      if (key.startsWith(charId + ':')) delete state.bossSelections[key];
    }
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

// ---- Custom Tooltip ----
function setupCustomTooltip() {
  const tooltip = document.createElement('div');
  tooltip.className = 'custom-tooltip';
  document.body.appendChild(tooltip);

  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;

    tooltip.textContent = target.dataset.tooltip;
    tooltip.classList.add('visible');

    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = (rect.bottom + 6) + 'px';
  });

  document.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;
    tooltip.classList.remove('visible');
  });
}

// ---- Init ----
async function init() {
  availableCharacters = await window.api.listCharacters();
  bossData = await window.api.loadBossData();

  // Preload both crystal icons
  for (const file of ['purple_crystal.png', 'yellow_crystal.png']) {
    const dataUrl = await window.api.loadIcon(file);
    if (dataUrl) iconCache[file] = dataUrl;
  }

  const saved = await load();
  if (saved) {
    state = saved;
    if (!state.memos) state.memos = [];
    if (!state.bossSelections) state.bossSelections = {};
    if (!state.bossTasks) state.bossTasks = JSON.parse(JSON.stringify(DEFAULT_BOSS_TASKS));
    state.memos.forEach(m => { if (!m.charIds) m.charIds = []; });
  } else {
    state = createDefaultState(availableCharacters);
  }

  checkResets();
  await save();

  renderAll();
  setupEvents();
  setupCustomTooltip();

  window.api.onWindowFocus(async () => {
    availableCharacters = await window.api.listCharacters();
    renderAll();
  });

  setInterval(() => {
    if (checkResets()) {
      save();
      renderAll();
    }
    updateDateInfo();
  }, 60000);
}

init();
