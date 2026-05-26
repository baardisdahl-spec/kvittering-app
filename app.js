// Main app logic
let currentTripId = null;
let currentReceiptId = null;
let pendingImage = null;
let batchQueue = [];
let batchInProgress = false;
let currentSort = 'created-desc';

// ============ CATEGORIES ============
const CATEGORIES = [
  { id: 'hotel',     name: 'Hotell',    icon: 'ti-bed',               class: 'cat-hotel' },
  { id: 'food',      name: 'Mat',       icon: 'ti-tools-kitchen-2',   class: 'cat-food' },
  { id: 'transport', name: 'Transport', icon: 'ti-train',             class: 'cat-transport' },
  { id: 'flight',    name: 'Fly',       icon: 'ti-plane',             class: 'cat-flight' },
  { id: 'fuel',      name: 'Drivstoff', icon: 'ti-gas-station',       class: 'cat-fuel' },
  { id: 'parking',   name: 'Parkering', icon: 'ti-parking',           class: 'cat-parking' },
  { id: 'supplies',  name: 'Utgifter',  icon: 'ti-shopping-bag',      class: 'cat-supplies' },
  { id: 'other',     name: 'Annet',     icon: 'ti-dots',              class: 'cat-other' },
];

function getCategory(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

// ============ NAVIGATION ============
// Tab-based: each tab has its own nav stack. Detail screens push onto current tab's stack.
let currentTab = 'overview';
const tabStacks = {
  overview: ['trips'],
  newTrip: ['newTrip'],
  archive: ['archive'],
  settings: ['settings']
};

// Which tab a screen belongs to (for detail screens pushed onto a stack)
function getActiveStack() {
  return tabStacks[currentTab];
}

async function switchTab(tab) {
  currentTab = tab;
  // newTrip always resets to a fresh form
  if (tab === 'newTrip') {
    tabStacks.newTrip = ['newTrip'];
  }
  updateTabBar();
  await render();
}

function updateTabBar() {
  document.querySelectorAll('.tab-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === currentTab);
  });
}

async function navigate(screen, opts = {}) {
  const stack = getActiveStack();
  if (opts.replace) stack[stack.length - 1] = screen;
  else stack.push(screen);
  await render();
}

async function goBack() {
  const stack = getActiveStack();
  if (stack.length > 1) {
    stack.pop();
    await render();
  }
}

async function render() {
  const stack = getActiveStack();
  const screen = stack[stack.length - 1];
  const main = document.getElementById('main-content');
  const backBtn = document.getElementById('back-btn');
  const headerAction = document.getElementById('header-action');
  const title = document.getElementById('screen-title');
  const tabBar = document.getElementById('tab-bar');

  // Back button shows when we're deeper than the tab root
  backBtn.classList.toggle('hidden', stack.length <= 1);
  // Hide tab bar on detail screens for a focused view
  tabBar.classList.toggle('hidden', stack.length > 1);
  headerAction.classList.add('hidden');
  
  switch (screen) {
    case 'trips':
      title.textContent = 'Oversikt';
      await renderTripsList(main);
      break;
    case 'archive':
      title.textContent = 'Arkiv';
      await renderArchive(main);
      break;
    case 'newTrip':
      title.textContent = 'Ny reise';
      renderNewTrip(main);
      break;
    case 'tripDetail':
      const trip = await getTrip(currentTripId);
      title.textContent = trip ? trip.name : 'Reise';
      await renderTripDetail(main, trip);
      break;
    case 'editTrip':
      title.textContent = 'Rediger reise';
      await renderEditTrip(main);
      break;
    case 'editReceipt':
      title.textContent = currentReceiptId ? 'Rediger kvittering' : 'Ny kvittering';
      await renderEditReceipt(main);
      break;
    case 'settings':
      title.textContent = 'Innstillinger';
      renderSettings(main);
      break;
  }
}

// ============ SETTINGS SCREEN ============
function renderSettings(container) {
  const tpl = document.getElementById('tpl-settings');
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  
  const settings = getSettings();
  
  // Set current values
  const engineRadio = container.querySelector(`#engine-${settings.ocrEngine}`);
  if (engineRadio) engineRadio.checked = true;
  
  container.querySelector('#claude-api-key').value = settings.claudeApiKey || '';
  
  // Toggle claude-settings visibility based on selection
  function toggleClaudeSection() {
    const isClaudeSelected = container.querySelector('#engine-claude').checked;
    container.querySelector('#claude-settings').classList.toggle('hidden', !isClaudeSelected);
  }
  toggleClaudeSection();
  
  container.querySelectorAll('input[name="ocr-engine"]').forEach(radio => {
    radio.addEventListener('change', toggleClaudeSection);
  });
}

async function testApiKey() {
  const key = document.getElementById('claude-api-key').value.trim();
  const result = document.getElementById('api-test-result');
  
  if (!key) {
    result.innerHTML = '<div class="ocr-status error">Skriv inn en nøkkel først.</div>';
    return;
  }
  
  result.innerHTML = '<div class="ocr-status processing"><div class="spinner"></div> Tester nøkkel...</div>';
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hei' }]
      })
    });
    
    if (response.ok) {
      result.innerHTML = '<div class="ocr-status success">✓ Nøkkelen fungerer!</div>';
    } else {
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `HTTP ${response.status}`;
      result.innerHTML = `<div class="ocr-status error">✗ Feil: ${escapeHtml(errMsg)}</div>`;
    }
  } catch (err) {
    result.innerHTML = `<div class="ocr-status error">✗ Kunne ikke nå API: ${escapeHtml(err.message)}</div>`;
  }
}

function saveSettingsAndBack() {
  const engine = document.querySelector('input[name="ocr-engine"]:checked')?.value || 'tesseract';
  const apiKey = document.getElementById('claude-api-key').value.trim();
  
  saveSettings({ ocrEngine: engine, claudeApiKey: apiKey });
  showToast('Innstillinger lagret');
}

// ============ TRIPS LIST ============
async function renderTripsList(container) {
  const tpl = document.getElementById('tpl-trips-list');
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  
  // Personal greeting
  container.querySelector('#greeting').innerHTML = `
    <div class="greeting-hello">${getGreeting()}</div>
    <div class="greeting-sub">${getGreetingSub()}</div>
  `;
  
  const allTrips = await getAllTrips();
  // Only show active (non-archived) trips on the overview
  const trips = allTrips.filter(t => !isArchived(t));
  const tripsContainer = container.querySelector('#trips-container');
  const emptyState = container.querySelector('#empty-state');
  
  if (trips.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  
  // Render stats row
  const statsRow = container.querySelector('#stats-row');
  statsRow.classList.remove('hidden');
  container.querySelector('#stat-active-value').textContent = trips.length;
  
  // Calculate this month's total in NOK
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  let monthTotal = 0;
  trips.forEach(t => {
    t.receipts.forEach(r => {
      if (r.date) {
        const d = new Date(r.date);
        if (d.getMonth() === thisMonth && d.getFullYear() === thisYear && (r.currency || 'NOK') === 'NOK') {
          monthTotal += (r.amount || 0);
        }
      }
    });
  });
  container.querySelector('#stat-month-value').textContent = formatCurrency(monthTotal, 'NOK');
  
  // Show sorting toolbar (only if 2+ trips)
  const toolbar = container.querySelector('#trips-toolbar');
  const sortSelect = container.querySelector('#sort-select');
  if (trips.length >= 2) {
    toolbar.classList.remove('hidden');
    sortSelect.value = currentSort;
    sortSelect.onchange = () => {
      currentSort = sortSelect.value;
      render();
    };
  }
  
  const sortedTrips = sortTrips(trips, currentSort);
  sortedTrips.forEach(trip => {
    tripsContainer.appendChild(buildTripCard(trip));
  });
}

// Build a trip card element (shared by overview and archive)
function buildTripCard(trip) {
  const totals = sumByCurrency(trip.receipts);
  const usedCats = uniqueCategories(trip.receipts);
  const status = trip.status || 'draft';
  const card = document.createElement('div');
  card.className = 'trip-card';
  card.onclick = () => openTrip(trip.id);
  
  const tagsHtml = usedCats.length > 0 
    ? `<div class="category-tags">
         ${usedCats.slice(0, 4).map(catId => {
           const cat = getCategory(catId);
           return `<span class="category-tag ${cat.class}"><i class="ti ${cat.icon}"></i>${cat.name}</span>`;
         }).join('')}
       </div>`
    : '';
  
  card.innerHTML = `
    <div class="trip-card-header">
      <span class="trip-name">${escapeHtml(trip.name)}</span>
      <span class="status-badge ${status}">${STATUS_LABELS[status]}</span>
    </div>
    <div class="trip-card-footer">
      <span class="trip-date">${formatTripDateRange(trip)}</span>
      <span class="trip-total">${formatTotals(totals)}</span>
    </div>
    ${tagsHtml}
  `;
  return card;
}

// Greeting based on time of day
function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return 'God natt';
  if (h < 10) return 'God morgen';
  if (h < 18) return 'God dag';
  return 'God kveld';
}

function getGreetingSub() {
  const messages = [
    'Klar for å registrere kvitteringer?',
    'Hold reiseregningene i orden.',
    'Her er reisene dine.'
  ];
  // Pick based on day so it's stable through a session
  return messages[new Date().getDate() % messages.length];
}

function uniqueCategories(receipts) {
  const seen = new Set();
  for (const r of receipts) {
    if (r.category) seen.add(r.category);
  }
  return Array.from(seen);
}

// Sort trips by selected criterion
function sortTrips(trips, sortKey) {
  const sorted = [...trips];
  // Helper: total in NOK only (for amount sorting — mixes currencies imperfectly but practical)
  const tripTotal = (t) => t.receipts.reduce((s, r) => s + (r.amount || 0), 0);
  
  switch (sortKey) {
    case 'created-asc':
      return sorted.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    case 'created-desc':
      return sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    case 'date-asc':
      return sorted.sort((a, b) => 
        (a.dateFrom || a.date || '').localeCompare(b.dateFrom || b.date || ''));
    case 'date-desc':
      return sorted.sort((a, b) => 
        (b.dateFrom || b.date || '').localeCompare(a.dateFrom || a.date || ''));
    case 'amount-asc':
      return sorted.sort((a, b) => tripTotal(a) - tripTotal(b));
    case 'amount-desc':
      return sorted.sort((a, b) => tripTotal(b) - tripTotal(a));
    case 'name-asc':
      return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'nb'));
    default:
      return sorted;
  }
}

// Group receipts by currency and sum each
function sumByCurrency(receipts) {
  const totals = {};
  for (const r of receipts) {
    const cur = r.currency || 'NOK';
    totals[cur] = (totals[cur] || 0) + (r.amount || 0);
  }
  return totals;
}

// Group receipts by category, optionally per currency
function sumByCategory(receipts) {
  const map = {};
  for (const r of receipts) {
    const cat = r.category || 'other';
    const cur = r.currency || 'NOK';
    if (!map[cat]) map[cat] = {};
    map[cat][cur] = (map[cat][cur] || 0) + (r.amount || 0);
  }
  return map;
}

// Format multi-currency totals: "1 250,00 kr" or "1 250,00 kr + 89,00 €"
function formatTotals(totals) {
  const entries = Object.entries(totals);
  if (entries.length === 0) return formatCurrency(0, 'NOK');
  if (entries.length === 1) return formatCurrency(entries[0][1], entries[0][0]);
  return entries.map(([cur, sum]) => formatCurrency(sum, cur)).join(' + ');
}

// Format trip date range: "13.05.2026 – 15.05.2026" or just one if dates equal/missing
function formatTripDateRange(trip) {
  const from = trip.dateFrom || trip.date;
  const to = trip.dateTo;
  if (!from) return '';
  const fromStr = formatDateString(from);
  if (!to || to === from) return fromStr;
  return `${fromStr} – ${formatDateString(to)}`;
}

function openTrip(id) {
  currentTripId = id;
  navigate('tripDetail');
}

// ============ TRIP STATUS ============
const STATUS_LABELS = {
  draft: 'Utkast',
  submitted: 'Levert',
  refunded: 'Refundert'
};

async function setTripStatus(status) {
  const trip = await getTrip(currentTripId);
  if (!trip) return;
  trip.status = status;
  await saveTrip(trip);
  
  // Update the visual selection immediately
  document.querySelectorAll('.status-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === status);
  });
  
  if (status === 'refunded') {
    showToast('Reise merket som refundert – flyttet til arkiv');
  } else {
    showToast(`Status: ${STATUS_LABELS[status]}`);
  }
}

// A trip is "archived" when its status is refunded
function isArchived(trip) {
  return (trip.status || 'draft') === 'refunded';
}

// ============ ARCHIVE ============
async function renderArchive(container) {
  const tpl = document.getElementById('tpl-archive');
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  
  const allTrips = await getAllTrips();
  const archived = allTrips.filter(isArchived);
  const archiveContainer = container.querySelector('#archive-container');
  const archiveEmpty = container.querySelector('#archive-empty');
  
  if (archived.length === 0) {
    archiveEmpty.classList.remove('hidden');
    return;
  }
  
  const sorted = sortTrips(archived, currentSort);
  sorted.forEach(trip => {
    archiveContainer.appendChild(buildTripCard(trip));
  });
}

// ============ NEW TRIP ============
function renderNewTrip(container) {
  const tpl = document.getElementById('tpl-new-trip');
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  
  // Set today's date as default for both
  const today = new Date().toISOString().split('T')[0];
  const fromInput = container.querySelector('#trip-date-from');
  const toInput = container.querySelector('#trip-date-to');
  fromInput.value = today;
  toInput.value = today;
  
  // Update duration hint when dates change
  const updateHint = () => {
    const hint = container.querySelector('#duration-hint');
    const from = fromInput.value;
    const to = toInput.value;
    if (from && to) {
      const days = calculateDays(from, to);
      if (days < 0) {
        hint.classList.remove('hidden');
        hint.innerHTML = '<i class="ti ti-alert-circle"></i> Hjemreisedato kan ikke være før avreisedato';
        hint.style.background = 'rgba(255, 59, 48, 0.1)';
        hint.style.color = 'var(--danger)';
      } else {
        hint.classList.remove('hidden');
        const dayLabel = days === 1 ? 'dag' : 'dager';
        hint.innerHTML = `<i class="ti ti-calendar"></i> Varighet: ${days} ${dayLabel}`;
        hint.style.background = '';
        hint.style.color = '';
      }
    } else {
      hint.classList.add('hidden');
    }
  };
  
  fromInput.addEventListener('change', updateHint);
  toInput.addEventListener('change', updateHint);
  updateHint();
}

// Calculate number of days between two dates (inclusive)
function calculateDays(fromStr, toStr) {
  if (!fromStr || !toStr) return 0;
  const from = new Date(fromStr);
  const to = new Date(toStr);
  const diffMs = to - from;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
}

async function createTrip() {
  const name = document.getElementById('trip-name').value.trim() || 'Ny reise';
  const dateFrom = document.getElementById('trip-date-from').value;
  const dateTo = document.getElementById('trip-date-to').value;
  const description = document.getElementById('trip-description').value.trim();
  
  // Validate dates
  if (dateFrom && dateTo && new Date(dateTo) < new Date(dateFrom)) {
    showToast('Hjemreisedato kan ikke være før avreisedato');
    return;
  }
  
  const trip = {
    id: 't' + Date.now(),
    name,
    date: dateFrom,         // Keep `date` for backwards compatibility
    dateFrom,
    dateTo,
    description,
    status: 'draft',
    receipts: [],
    createdAt: Date.now()
  };
  
  await saveTrip(trip);
  currentTripId = trip.id;
  // Switch to overview tab and open the new trip
  currentTab = 'overview';
  tabStacks.overview = ['trips', 'tripDetail'];
  tabStacks.newTrip = ['newTrip']; // reset form for next time
  updateTabBar();
  await render();
}

// ============ EDIT TRIP ============
async function renderEditTrip(container) {
  const tpl = document.getElementById('tpl-edit-trip');
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  
  const trip = await getTrip(currentTripId);
  if (!trip) return;
  
  const nameInput = container.querySelector('#edit-trip-name');
  const fromInput = container.querySelector('#edit-trip-date-from');
  const toInput = container.querySelector('#edit-trip-date-to');
  const descInput = container.querySelector('#edit-trip-description');
  
  nameInput.value = trip.name || '';
  fromInput.value = trip.dateFrom || trip.date || '';
  toInput.value = trip.dateTo || '';
  descInput.value = trip.description || '';
  
  // Live duration hint
  const updateHint = () => {
    const hint = container.querySelector('#edit-duration-hint');
    const from = fromInput.value;
    const to = toInput.value;
    if (from && to) {
      const days = calculateDays(from, to);
      if (days < 0) {
        hint.classList.remove('hidden');
        hint.innerHTML = '<i class="ti ti-alert-circle"></i> Hjemreisedato kan ikke være før avreisedato';
        hint.style.background = 'rgba(255, 59, 48, 0.1)';
        hint.style.color = 'var(--danger)';
      } else {
        hint.classList.remove('hidden');
        const dayLabel = days === 1 ? 'dag' : 'dager';
        hint.innerHTML = `<i class="ti ti-calendar"></i> Varighet: ${days} ${dayLabel}`;
        hint.style.background = '';
        hint.style.color = '';
      }
    } else {
      hint.classList.add('hidden');
    }
  };
  fromInput.addEventListener('change', updateHint);
  toInput.addEventListener('change', updateHint);
  updateHint();
}

async function saveEditedTrip() {
  const trip = await getTrip(currentTripId);
  if (!trip) return;
  
  const name = document.getElementById('edit-trip-name').value.trim() || 'Ny reise';
  const dateFrom = document.getElementById('edit-trip-date-from').value;
  const dateTo = document.getElementById('edit-trip-date-to').value;
  const description = document.getElementById('edit-trip-description').value.trim();
  
  if (dateFrom && dateTo && new Date(dateTo) < new Date(dateFrom)) {
    showToast('Hjemreisedato kan ikke være før avreisedato');
    return;
  }
  
  trip.name = name;
  trip.dateFrom = dateFrom;
  trip.dateTo = dateTo;
  trip.date = dateFrom; // keep in sync for backwards compatibility
  trip.description = description;
  
  await saveTrip(trip);
  showToast('Reise oppdatert');
  goBack();
}

// ============ TRIP DETAIL ============
async function renderTripDetail(container, trip) {
  if (!trip) {
    container.innerHTML = '<div class="screen"><p>Reisen finnes ikke.</p></div>';
    return;
  }
  
  const tpl = document.getElementById('tpl-trip-detail');
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  
  // Highlight current status
  const status = trip.status || 'draft';
  container.querySelectorAll('.status-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === status);
  });
  
  const totals = sumByCurrency(trip.receipts);
  container.querySelector('#trip-total').textContent = formatTotals(totals);
  container.querySelector('#receipt-count').textContent = `${trip.receipts.length} kvitt.`;
  
  if (Object.keys(totals).length > 1) {
    container.querySelector('#trip-total').style.fontSize = '16px';
    container.querySelector('#trip-total').style.lineHeight = '1.3';
  }
  
  // Add trip date range + duration info above summary
  const dateRange = formatTripDateRange(trip);
  if (dateRange) {
    const dateInfo = document.createElement('div');
    dateInfo.className = 'trip-date-info';
    const from = trip.dateFrom || trip.date;
    const to = trip.dateTo;
    let durationHtml = '';
    if (from && to && to !== from) {
      const days = calculateDays(from, to);
      const dayLabel = days === 1 ? 'dag' : 'dager';
      durationHtml = `<span class="trip-duration">${days} ${dayLabel}</span>`;
    }
    dateInfo.innerHTML = `
      <span><i class="ti ti-calendar"></i> ${dateRange}</span>
      ${durationHtml}
    `;
    const summary = container.querySelector('.summary-card');
    summary.parentNode.insertBefore(dateInfo, summary);
  }
  
  // Category breakdown
  if (trip.receipts.length > 0) {
    const breakdown = container.querySelector('#category-breakdown');
    const catMap = sumByCategory(trip.receipts);
    const sortedCats = Object.entries(catMap).sort((a, b) => {
      const sumA = Object.values(a[1]).reduce((s, v) => s + v, 0);
      const sumB = Object.values(b[1]).reduce((s, v) => s + v, 0);
      return sumB - sumA;
    });
    
    if (sortedCats.length > 0) {
      const card = document.createElement('div');
      card.className = 'category-breakdown';
      card.innerHTML = sortedCats.map(([catId, currencies]) => {
        const cat = getCategory(catId);
        const totalStr = formatTotals(currencies);
        return `
          <div class="breakdown-row">
            <span style="display: flex; align-items: center; gap: 8px;">
              <span class="category-tag ${cat.class}"><i class="ti ${cat.icon}"></i>${cat.name}</span>
            </span>
            <span style="font-weight: 500;">${totalStr}</span>
          </div>
        `;
      }).join('');
      breakdown.appendChild(card);
    }
  }
  
  const receiptsContainer = container.querySelector('#receipts-container');
  
  if (trip.receipts.length > 0) {
    container.querySelector('#export-btn').classList.remove('hidden');
    container.querySelector('#csv-btn').classList.remove('hidden');
    
    trip.receipts.forEach((r, i) => {
      const cat = getCategory(r.category);
      const card = document.createElement('div');
      card.className = 'receipt-card';
      card.onclick = () => openReceipt(r.id);
      card.innerHTML = `
        ${r.image 
          ? `<img class="receipt-thumb" src="${r.image}" alt="">`
          : `<div class="receipt-thumb"><i class="ti ${cat.icon}"></i></div>`}
        <div class="receipt-info">
          <div class="receipt-merchant">${escapeHtml(r.merchant || 'Kvittering ' + (i+1))}</div>
          <div class="receipt-date">
            ${r.date ? formatDateString(r.date) : ''}
            ${r.category ? `<span class="category-tag ${cat.class}" style="margin-left: 6px;"><i class="ti ${cat.icon}"></i>${cat.name}</span>` : ''}
          </div>
        </div>
        <div class="receipt-amount">${r.amount ? formatCurrency(r.amount, r.currency) : '–'}</div>
      `;
      receiptsContainer.appendChild(card);
    });
  }
  
  // Wire up upload button
  const uploadBtn = container.querySelector('#upload-btn');
  if (uploadBtn) {
    uploadBtn.onclick = () => {
      const input = document.getElementById('camera-input');
      input.removeAttribute('capture');
      input.value = '';
      input.click();
    };
  }
  
  const cameraInput = document.getElementById('camera-input');
  cameraInput.onchange = handleImageSelected;
}

function openReceipt(receiptId) {
  currentReceiptId = receiptId;
  pendingImage = null;
  navigate('editReceipt');
}

function captureReceipt() {
  currentReceiptId = null;
  batchInProgress = false;
  const input = document.getElementById('camera-input');
  input.setAttribute('capture', 'environment');
  input.removeAttribute('multiple');
  input.value = '';
  input.click();
}

function batchCapture() {
  currentReceiptId = null;
  batchInProgress = true;
  const input = document.getElementById('camera-input');
  input.setAttribute('multiple', '');
  input.removeAttribute('capture');
  input.value = '';
  input.click();
}

async function handleImageSelected(e) {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;
  
  if (files.length === 1 && !batchInProgress) {
    // Single image — normal flow
    const dataUrl = await fileToDataURL(files[0]);
    pendingImage = await resizeImage(dataUrl);
    currentReceiptId = null;
    navigate('editReceipt');
    setTimeout(() => runOCRForCurrent(), 100);
  } else {
    // Multiple images — batch flow
    await processBatch(files);
  }
  
  batchInProgress = false;
  e.target.value = '';
}

async function processBatch(files) {
  const trip = await getTrip(currentTripId);
  const settings = getSettings();
  const usingClaude = settings.ocrEngine === 'claude' && settings.claudeApiKey;
  
  // Show progress indicator
  const progress = document.createElement('div');
  progress.className = 'batch-progress';
  document.body.appendChild(progress);
  
  let completed = 0;
  const total = files.length;
  
  for (const file of files) {
    completed++;
    progress.innerHTML = `<div class="spinner"></div> Behandler ${completed} av ${total}...`;
    
    try {
      const dataUrl = await fileToDataURL(file);
      const resized = await resizeImage(dataUrl);
      
      // Try to run OCR (best-effort)
      let ocrResult = null;
      try {
        ocrResult = await runOCR(resized);
      } catch (err) {
        console.warn('OCR failed for one image:', err);
      }
      
      const lastReceipt = trip.receipts[trip.receipts.length - 1];
      const newReceipt = {
        id: 'r' + Date.now() + '_' + completed,
        merchant: ocrResult?.merchant || '',
        amount: ocrResult?.amount || 0,
        currency: (ocrResult?.currency && isSupportedCurrency(ocrResult.currency)) 
                  ? ocrResult.currency 
                  : (lastReceipt?.currency || 'NOK'),
        category: 'other',
        date: ocrResult?.date || trip.date || new Date().toISOString().split('T')[0],
        note: '',
        image: resized
      };
      trip.receipts.push(newReceipt);
    } catch (err) {
      console.error('Batch error on file:', err);
    }
  }
  
  await saveTrip(trip);
  progress.remove();
  
  await render();
  const verifiedCount = trip.receipts.filter(r => r.amount > 0).length;
  showToast(`${total} kvitteringer lagt til${usingClaude ? '' : ' (sjekk OCR-verdier)'}`);
}

function isSupportedCurrency(cur) {
  return ['NOK', 'EUR', 'USD', 'GBP', 'SEK', 'DKK', 'CHF', 'PLN', 'JPY', 'AUD', 'CAD', 'THB'].includes(cur);
}

async function confirmDeleteTrip() {
  if (!confirm('Slette denne reisen og alle kvitteringer?')) return;
  await deleteTrip(currentTripId);
  currentTripId = null;
  // Reset to the root of whichever tab we're in
  tabStacks[currentTab] = [currentTab === 'archive' ? 'archive' : 'trips'];
  await render();
  showToast('Reise slettet');
}

// ============ EDIT RECEIPT ============
async function renderEditReceipt(container) {
  const tpl = document.getElementById('tpl-edit-receipt');
  container.innerHTML = '';
  container.appendChild(tpl.content.cloneNode(true));
  
  const trip = await getTrip(currentTripId);
  let receipt = null;
  
  if (currentReceiptId) {
    receipt = trip.receipts.find(r => r.id === currentReceiptId);
    container.querySelector('#delete-receipt-btn').style.display = 'block';
  } else {
    container.querySelector('#delete-receipt-btn').style.display = 'none';
  }
  
  const img = container.querySelector('#receipt-preview');
  const imageData = receipt ? receipt.image : pendingImage;
  if (imageData) {
    img.src = imageData;
    img.onclick = () => openLightbox(imageData);
  } else {
    container.querySelector('.receipt-image-container').style.display = 'none';
  }
  
  // Build category grid
  const catGrid = container.querySelector('#category-grid');
  catGrid.innerHTML = CATEGORIES.map(c => `
    <button type="button" class="category-btn" data-cat="${c.id}">
      <i class="ti ${c.icon}"></i>
      <span>${c.name}</span>
    </button>
  `).join('');
  catGrid.querySelectorAll('.category-btn').forEach(btn => {
    btn.onclick = () => {
      catGrid.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
  });
  
  function setCategory(catId) {
    catGrid.querySelectorAll('.category-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.cat === catId);
    });
  }

  if (receipt) {
    container.querySelector('#r-merchant').value = receipt.merchant || '';
    container.querySelector('#r-amount').value = receipt.amount || '';
    container.querySelector('#r-currency').value = receipt.currency || 'NOK';
    container.querySelector('#r-date').value = receipt.date || '';
    container.querySelector('#r-note').value = receipt.note || '';
    setCategory(receipt.category || 'other');
  } else {
    // Default date = trip start date or today
    container.querySelector('#r-date').value = trip.dateFrom || trip.date || new Date().toISOString().split('T')[0];
    // Default currency = last used currency in this trip, or NOK
    const lastReceipt = trip.receipts[trip.receipts.length - 1];
    container.querySelector('#r-currency').value = lastReceipt?.currency || 'NOK';
    setCategory('other');
  }
}

async function runOCRForCurrent() {
  if (!pendingImage) return;
  
  const status = document.getElementById('ocr-status');
  if (!status) return;
  
  const settings = getSettings();
  const usingClaude = settings.ocrEngine === 'claude' && settings.claudeApiKey;
  const engineName = usingClaude ? 'Claude' : 'Tesseract';
  
  status.classList.remove('hidden');
  status.className = 'ocr-status processing';
  status.innerHTML = `<div class="spinner"></div> Leser kvittering med ${engineName}...`;
  
  try {
    const result = await runOCR(pendingImage);
    if (result) {
      // Auto-fill detected fields (only if not already filled)
      if (result.merchant && !document.getElementById('r-merchant').value) {
        document.getElementById('r-merchant').value = result.merchant;
      }
      if (result.amount && !document.getElementById('r-amount').value) {
        document.getElementById('r-amount').value = result.amount.toFixed(2);
      }
      if (result.currency) {
        const currencySelect = document.getElementById('r-currency');
        const supported = Array.from(currencySelect.options).map(o => o.value);
        if (supported.includes(result.currency)) {
          currencySelect.value = result.currency;
        }
      }
      if (result.category) {
        const supportedCats = CATEGORIES.map(c => c.id);
        if (supportedCats.includes(result.category)) {
          document.querySelectorAll('.category-btn').forEach(b => {
            b.classList.toggle('selected', b.dataset.cat === result.category);
          });
        }
      }
      if (result.date) {
        document.getElementById('r-date').value = result.date;
      }
      
      const filled = [];
      if (result.merchant) filled.push('butikk');
      if (result.amount) filled.push('beløp');
      if (result.date) filled.push('dato');
      
      const usedEngine = result.engine === 'claude' ? 'Claude' : 'Tesseract';
      
      if (filled.length > 0) {
        status.className = 'ocr-status success';
        status.textContent = `✓ ${usedEngine} fant: ${filled.join(', ')}. Sjekk verdiene før du lagrer.`;
      } else {
        status.className = 'ocr-status error';
        status.textContent = `${usedEngine} kunne ikke lese kvitteringen. Fyll inn manuelt.`;
      }
    } else {
      status.className = 'ocr-status error';
      status.textContent = 'OCR mislyktes. Fyll inn manuelt.';
    }
  } catch (err) {
    console.error(err);
    status.className = 'ocr-status error';
    status.textContent = 'Kunne ikke lese kvitteringen. Fyll inn manuelt.';
  }
}

async function saveReceipt() {
  const trip = await getTrip(currentTripId);
  const selectedCat = document.querySelector('.category-btn.selected')?.dataset.cat || 'other';
  const receiptData = {
    id: currentReceiptId || 'r' + Date.now(),
    merchant: document.getElementById('r-merchant').value.trim(),
    amount: parseFloat(document.getElementById('r-amount').value) || 0,
    currency: document.getElementById('r-currency').value || 'NOK',
    category: selectedCat,
    date: document.getElementById('r-date').value,
    note: document.getElementById('r-note').value.trim(),
    image: currentReceiptId 
      ? trip.receipts.find(r => r.id === currentReceiptId)?.image
      : pendingImage
  };
  
  if (currentReceiptId) {
    const idx = trip.receipts.findIndex(r => r.id === currentReceiptId);
    trip.receipts[idx] = { ...trip.receipts[idx], ...receiptData };
  } else {
    trip.receipts.push(receiptData);
  }
  
  await saveTrip(trip);
  pendingImage = null;
  currentReceiptId = null;
  goBack();
  showToast('Kvittering lagret');
}

async function deleteCurrentReceipt() {
  if (!confirm('Slette denne kvitteringen?')) return;
  const trip = await getTrip(currentTripId);
  trip.receipts = trip.receipts.filter(r => r.id !== currentReceiptId);
  await saveTrip(trip);
  currentReceiptId = null;
  goBack();
  showToast('Kvittering slettet');
}

// ============ EXPORT PDF ============
async function exportToPDF() {
  const trip = await getTrip(currentTripId);
  showToast('Genererer PDF...');
  try {
    const filename = await exportTripToPDF(trip);
    showToast(`PDF generert: ${filename}`);
  } catch (err) {
    console.error(err);
    showToast('Feil ved PDF-generering');
  }
}

// ============ EXPORT CSV ============
async function exportToCSV() {
  const trip = await getTrip(currentTripId);
  
  // CSV-header — bruker semikolon (norsk Excel-standard)
  const headers = ['Nr', 'Dato', 'Butikk/sted', 'Kategori', 'Beløp', 'Valuta', 'Notat'];
  const rows = [headers];
  
  trip.receipts.forEach((r, i) => {
    const cat = getCategory(r.category);
    rows.push([
      String(i + 1),
      r.date ? formatDateString(r.date) : '',
      r.merchant || '',
      cat.name,
      (r.amount || 0).toFixed(2).replace('.', ','), // Norsk desimal-komma
      r.currency || 'NOK',
      r.note || ''
    ]);
  });
  
  // Summary-rader
  rows.push([]);
  const totals = sumByCurrency(trip.receipts);
  Object.entries(totals).forEach(([cur, sum]) => {
    rows.push(['', '', '', `Totalt ${cur}`, sum.toFixed(2).replace('.', ','), cur, '']);
  });
  
  // Konverter til CSV-tekst med semikolon-separator
  const csvText = rows.map(row => 
    row.map(cell => {
      const str = String(cell);
      // Cite cell hvis den inneholder semikolon, anførselstegn eller linjeskift
      if (str.includes(';') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(';')
  ).join('\r\n');
  
  // UTF-8 BOM så Excel åpner det riktig med norske tegn
  const blob = new Blob(['\uFEFF' + csvText], { type: 'text/csv;charset=utf-8' });
  const filename = `Reiseregning_${(trip.name || 'reise').replace(/[^a-z0-9æøåÆØÅ\-]/gi, '_')}.csv`;
  
  await shareOrDownload(blob, filename, 'text/csv');
  showToast(`CSV generert: ${filename}`);
}

// ============ HELPERS ============
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ============ LIGHTBOX (zoomable image viewer) ============
function openLightbox(imageData) {
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.innerHTML = `
    <button class="lightbox-close" aria-label="Lukk">✕</button>
    <div class="lightbox-img-wrapper">
      <img src="${imageData}" alt="Kvittering">
    </div>
    <div class="lightbox-hint">Klyp for å zoome · dra for å panorere</div>
  `;
  document.body.appendChild(lightbox);

  const img = lightbox.querySelector('img');
  const closeBtn = lightbox.querySelector('.lightbox-close');
  
  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let startDistance = 0;
  let startScale = 1;
  let isPanning = false;
  let lastX = 0;
  let lastY = 0;

  function updateTransform() {
    img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  }

  function close() {
    lightbox.remove();
  }

  closeBtn.onclick = close;

  // Click outside image to close (only when not zoomed)
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox || e.target.classList.contains('lightbox-img-wrapper')) {
      if (scale <= 1.05) close();
    }
  });

  // Escape key to close
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Double-tap/double-click to zoom in/out
  let lastTap = 0;
  lightbox.addEventListener('click', (e) => {
    const now = Date.now();
    if (now - lastTap < 300 && e.target === img) {
      if (scale > 1.05) {
        scale = 1;
        translateX = 0;
        translateY = 0;
      } else {
        scale = 2.5;
      }
      updateTransform();
    }
    lastTap = now;
  });

  // Mouse wheel zoom (desktop)
  lightbox.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    const newScale = Math.min(Math.max(1, scale + delta * scale), 6);
    scale = newScale;
    if (scale === 1) {
      translateX = 0;
      translateY = 0;
    }
    updateTransform();
  }, { passive: false });

  // Touch: pinch to zoom + pan
  lightbox.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      // Pinch start
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      startDistance = Math.sqrt(dx * dx + dy * dy);
      startScale = scale;
    } else if (e.touches.length === 1 && scale > 1) {
      // Pan start
      isPanning = true;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    }
  }, { passive: true });

  lightbox.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      scale = Math.min(Math.max(1, startScale * (distance / startDistance)), 6);
      if (scale === 1) {
        translateX = 0;
        translateY = 0;
      }
      updateTransform();
    } else if (e.touches.length === 1 && isPanning && scale > 1) {
      e.preventDefault();
      const dx = e.touches[0].clientX - lastX;
      const dy = e.touches[0].clientY - lastY;
      translateX += dx;
      translateY += dy;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
      updateTransform();
    }
  }, { passive: false });

  lightbox.addEventListener('touchend', () => {
    isPanning = false;
  });
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
  updateTabBar();
  render();
});
