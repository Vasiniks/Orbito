// Launchpad — App Shell: routing, utilities, dashboard, settings

// ── Module Registry ──
const MODULES = {
  dashboard: { title: 'Dashboard', render: renderDashboard },
  projects:  { title: 'Projects',  render: (c) => ProjectsModule.render(c) },
  parts:     { title: 'Parts & Inventory', render: (c) => PartsModule.render(c) },
  buy:       { title: 'Buy List',  render: (c) => BuyModule.render(c) },
  containers:{ title: 'Containers', render: (c) => ContainersModule.render(c) },
  vendors:   { title: 'Vendors',   render: (c) => VendorsModule.render(c) },
  cnc:       { title: 'CNC List', render: (c) => CncModule.render(c) },
  tools:     { title: 'Tools',     render: (c) => ToolsModule.render(c) },
  accounts:  { title: 'Accounts',  render: (c) => AccountsModule.render(c) },
  history:   { title: 'Activity',  render: (c) => HistoryModule.render(c) },
  workspace: { title: 'Workspace Map', render: (c) => WorkspaceModule.render(c) },
  spreadsheet: { title: 'Master Spreadsheet', render: (c) => SpreadsheetModule.render(c) },
  sketches:  { title: 'Global Sketches', render: (c) => SketchesModule.render(c) },
  search:    { title: 'Find / Search', render: (c) => SearchModule.render(c) },
  settings:  { title: 'Settings',  render: renderSettings },
};

let currentView = 'dashboard';

// ── Navigation ──
async function navigate(view) {
  if (!MODULES[view]) view = 'dashboard';
  currentView = view;

  // Update sidebar
  document.querySelectorAll('.nav-item').forEach(el => {
    const isActive = el.dataset.view === view;
    el.classList.toggle('active', isActive);
    if (isActive) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });

  // Update topbar
  document.getElementById('topbarTitle').textContent = MODULES[view].title;
  document.getElementById('topbarActions').innerHTML = '';

  // Render
  const container = document.getElementById('pageContent');
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3)"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px"></i></div>';

  try {
    await MODULES[view].render(container);
  } catch (err) {
    console.error('Render error:', err);
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>Something went wrong</h3><p>${err.message}</p></div>`;
  }

  // Update hash
  if (location.hash !== '#' + view) {
    history.pushState(null, '', '#' + view);
  }
}

// ── Toast ──
function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => { el.remove(); }, 3500);
}

// ── Modal ──
function openModal(title, bodyHTML, footerHTML = '') {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modalFooter').innerHTML = footerHTML;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// ── Photo Upload Helpers ──
// Photos are stored as data-URLs inside Firestore documents, so size matters a
// lot: every page load downloads them. Downscale + re-encode before saving.
function compressDataUrl(dataUrl, maxDim = 1200, quality = 0.8) {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image')) return resolve(dataUrl);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      // Already small enough — keep as-is
      if (scale >= 1 && dataUrl.length < 250000) return resolve(dataUrl);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // JPEG has no alpha; avoid black backgrounds
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const out = canvas.toDataURL('image/jpeg', quality);
      resolve(out.length < dataUrl.length ? out : dataUrl);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function readFileAsDataURL(file, maxDim = 1200, quality = 0.8) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const raw = e.target.result;
      if (file.type && file.type.startsWith('image/')) {
        resolve(await compressDataUrl(raw, maxDim, quality));
      } else {
        resolve(raw);
      }
    };
    reader.readAsDataURL(file);
  });
}

// ── Format Helpers ──
function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Stock status vs baseline ──
// General status: Above / At / Below baseline, using a configurable ±% tolerance.
// Specific detail: the exact % off baseline (shown in the chip tooltip).
function stockStatus(inStock, baseline) {
  const tol = (window.__stockSettings?.tolerance ?? 10) / 100;
  if (!baseline) return { status: 'at', pct: 0, label: 'No baseline set' };
  const pct = Math.round(((inStock - baseline) / baseline) * 100);
  if (inStock < baseline * (1 - tol)) return { status: 'below', pct, label: `${pct}% — below baseline` };
  if (inStock > baseline * (1 + tol)) return { status: 'above', pct, label: `+${pct}% — above baseline` };
  return { status: 'at', pct, label: `${pct >= 0 ? '+' : ''}${pct}% — at baseline` };
}
window.stockStatus = stockStatus;

function getStockChip(inStock, needed, partId) {
  const st = stockStatus(inStock || 0, needed || 0);
  const cls = st.status === 'below' ? 'stock-red' : st.status === 'above' ? 'stock-above' : 'stock-green';
  return `<span class="stock-chip ${cls}" data-part-id="${escapeAttr(partId)}" title="${escapeAttr(st.label)}">${inStock}/${needed}</span>`;
}

// ── Duplicate part catching ──
function normalizePartName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
// Returns { exact } or { similar } match against existing parts, or null.
function findSimilarPart(name, parts, excludeId = null) {
  const n = normalizePartName(name);
  if (!n) return null;
  const pool = parts.filter(p => p.id !== excludeId);
  const exact = pool.find(p => normalizePartName(p.name) === n);
  if (exact) return { part: exact, exact: true };
  const similar = pool.find(p => {
    const pn = normalizePartName(p.name);
    return Math.min(pn.length, n.length) >= 5 && (pn.includes(n) || n.includes(pn));
  });
  return similar ? { part: similar, exact: false } : null;
}
window.findSimilarPart = findSimilarPart;

// ── Column visibility menu (stays open while toggling) ──
function showColumnMenu(anchor, cols, hiddenSet, onChange) {
  document.getElementById('genericPopmenu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'popmenu';
  menu.id = 'genericPopmenu';
  const render = () => {
    menu.innerHTML = '<div class="popmenu-label">Show columns</div>' + cols.map(c => `
      <button class="popmenu-item" data-key="${escapeAttr(c.key)}">
        <span><i class="fa-solid ${hiddenSet.has(c.key) ? 'fa-square' : 'fa-square-check'}" style="width:16px;margin-right:6px;color:${hiddenSet.has(c.key) ? 'var(--text-3)' : 'var(--accent)'}"></i>${escapeHTML(c.label)}</span>
      </button>`).join('');
    menu.querySelectorAll('.popmenu-item').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = b.dataset.key;
        if (hiddenSet.has(key)) hiddenSet.delete(key);
        else hiddenSet.add(key);
        onChange();
        render(); // keep the menu open for multi-toggling
      });
    });
  };
  render();
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = Math.max(8, Math.min(window.innerHeight - menu.offsetHeight - 8, r.bottom + 4)) + 'px';
  menu.style.left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, r.left)) + 'px';
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
    });
  }, 0);
}
window.showColumnMenu = showColumnMenu;

// ── Detail chips (FRCBOM-style): machine/process, material, vendor ──
function getProcessChip(process) {
  if (!process) return '<span class="text-muted">—</span>';
  const p = process.toLowerCase();
  let icon = 'fa-gears';
  if (p.includes('print')) icon = 'fa-cube';
  else if (p.includes('lathe')) icon = 'fa-circle-notch';
  else if (p.includes('laser')) icon = 'fa-bolt';
  else if (p.includes('router')) icon = 'fa-wave-square';
  else if (p.includes('order') || p.includes('buy') || p.includes('cots')) icon = 'fa-cart-shopping';
  else if (p.includes('saw') || p.includes('cut')) icon = 'fa-scissors';
  else if (p.includes('drill')) icon = 'fa-screwdriver-wrench';
  else if (p.includes('weld')) icon = 'fa-fire';
  else if (p.includes('bend') || p.includes('brake')) icon = 'fa-angles-up';
  else if (p.includes('hand') || p.includes('file') || p.includes('assembl')) icon = 'fa-hand';
  return `<span class="chip chip-process"><i class="fa-solid ${icon}"></i>${escapeHTML(process)}</span>`;
}

function getMaterialChip(material) {
  if (!material) return '<span class="text-muted">—</span>';
  return `<span class="chip chip-material"><i class="fa-solid fa-layer-group"></i>${escapeHTML(material)}</span>`;
}

function formatCurrency(n) {
  if (n == null || isNaN(n)) return '—';
  return '$' + Number(n).toFixed(2);
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Security / Encoding Helpers ──
function escapeHTML(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// escapeAttr escapes a string for safe interpolation into an HTML attribute value
// (double-quoted). Use this for any ${dynamic} inside `onclick="…"`, `href="…"`,
// `src="…"`, etc., instead of plain escapeHTML.
function escapeAttr(str) {
  return (str == null ? '' : String(str))
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`/g, '&#96;');
}

// safeImageSrc guards a value that will be interpolated into an <img src="…">
// attribute. Image fields (photos, drawings, reference photos, floorplans) are
// user-supplied and can arrive via JSON/CSV import, so a crafted value like
//   x" onerror="…
// would otherwise break out of the attribute and execute (stored XSS). We allow
// only data:image/* and http(s) URLs and escape the result; anything else
// (including javascript: URLs) renders as an empty src. Legitimate base64 data
// URLs and normal links pass through unchanged.
function safeImageSrc(src) {
  if (typeof src !== 'string') return '';
  const s = src.trim();
  if (/^data:image\//i.test(s) || /^https?:\/\//i.test(s)) {
    return escapeAttr(s);
  }
  return '';
}
window.safeImageSrc = safeImageSrc;

// Centralized UUID helper. Falls back to Math.random when crypto.randomUUID
// isn't available (older browsers or insecure contexts).
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
}

// Expose uid/uid() on window so feature-module scripts can reach it without
// having to inline duplicate crypto.randomUUID fallbacks.
window.uid = uid;

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ── Lightbox: click any photo to expand ──
function showLightbox(src) {
  if (!src) return;
  document.getElementById('appLightbox')?.remove();
  const ov = document.createElement('div');
  ov.className = 'lightbox';
  ov.id = 'appLightbox';
  const img = document.createElement('img');
  img.src = src;
  img.alt = 'Expanded photo';
  ov.appendChild(img);
  ov.addEventListener('click', () => ov.remove());
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') ov.remove();
    document.removeEventListener('keydown', esc);
  });
  document.body.appendChild(ov);
}
window.showLightbox = showLightbox;

// ── Generic popover menu (import/export choices, etc.) ──
function showPopMenu(anchor, items) {
  document.getElementById('genericPopmenu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'popmenu';
  menu.id = 'genericPopmenu';
  menu.innerHTML = items.map((it, i) => it.sep
    ? '<div class="popmenu-sep"></div>'
    : `<button class="popmenu-item" data-i="${i}"><span>${it.icon ? `<i class="fa-solid ${escapeAttr(it.icon)}" style="width:16px;margin-right:6px"></i>` : ''}${escapeHTML(it.label)}</span></button>`
  ).join('');
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = Math.max(8, Math.min(window.innerHeight - menu.offsetHeight - 8, r.bottom + 4)) + 'px';
  menu.style.left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, r.left)) + 'px';
  menu.querySelectorAll('.popmenu-item').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.remove();
      items[+b.dataset.i].onClick();
    });
  });
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
}
window.showPopMenu = showPopMenu;

// ── CSV / file helpers (import & export) ──
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}
window.parseCSV = parseCSV;

function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = () => { resolve(inp.files[0] || null); inp.remove(); };
    inp.click();
  });
}
window.pickFile = pickFile;

function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
window.downloadFile = downloadFile;

// ── Contextual Help ──
const VIEW_HELP = {
  dashboard: 'Your shop at a glance: project counts, stock health, and the machine queue. Numbers update live as the team works.',
  projects: 'Projects hold subsystems (like Elevator or Arm). The master spreadsheet tracks every subsystem\'s parts in one place. Use Duplicate to reuse a season\'s structure as a template.',
  parts: 'Pure stock tracking. Colors show Above / At / Below baseline (tolerance set in Settings). Use the +/− buttons for quick counts, click a stock chip to edit stock and baseline, and filter by status, category, vendor, location, or container. The Columns button hides columns you don\'t need.',
  buy: 'Everything below baseline in one shopping list: how many to buy, from which vendor, with direct buy links and cost estimates. Export the CSV when you\'re ready to order.',
  containers: 'Every bin, drawer, and shelf: photo, shop location, and the parts inside. Click a container to see its contents.',
  vendors: 'Vendor contact info and links. Click a vendor to see every part you buy from them.',
  cnc: 'The machine queue: every part waiting on the CNC (or Lathe, Manual Mill, 3D Printer) across all projects, sorted by part number. Click a status to update it as parts come off the machine.',
  tools: 'Tool catalog with health badges and checkout tracking, so you always know who has what.',
  accounts: 'Team accounts. 1360.ca sign-ins are approved automatically; others need a Mentor. Click an account to see every spreadsheet line with their name on it.',
  history: 'A feed of every change: who did what, and when.',
  workspace: 'Upload a floorplan, draw zones on it, add photos and containers to each zone. The Find Part feature walks people to the exact container.',
  spreadsheet: 'The master spreadsheet: every part your project needs, grouped by subsystem with color-coded part numbers. Every chip is clickable — status opens a picker, and material, machine, qty, stock, cost, location, and notes edit in place. The Data menu imports/exports CSV and JSON and auto-numbers parts missing an ID.',
  sketches: 'Every sketch and drawing attached to any part, gathered in one gallery.',
  search: 'Search across parts and projects. Tip: press Ctrl/Cmd+K from anywhere.',
  settings: 'Themes, stock thresholds, backup/restore, and sample data live here.',
};

function showHelpModal() {
  const tip = VIEW_HELP[currentView] || VIEW_HELP.dashboard;
  openModal('Help', `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div>
        <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:6px">About this page</div>
        <p class="text-sm">${tip}</p>
      </div>
      <div>
        <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:6px">Shortcuts</div>
        <p class="text-sm"><span class="badge badge-gray mono">Ctrl/Cmd + K</span> Search everywhere &nbsp; <span class="badge badge-gray mono">Esc</span> Close dialogs</p>
      </div>
      <div>
        <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:6px">New here?</div>
        <p class="text-sm">Replay the guided tour to get a walkthrough of every section.</p>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal();TourModule.start()"><i class="fa-solid fa-wand-magic-sparkles"></i> Replay Tour</button>
    <button class="btn btn-primary" onclick="closeModal()">Got it</button>
  `);
}

// ── Dashboard ──
async function renderDashboard(container) {
  const [projects, parts, tools, locations, boms, sessions] = await Promise.all([
    DB.getAll('projects'),
    DB.getAll('parts'),
    DB.getAll('tools'),
    DB.getAll('locations'),
    DB.getAll('bom_items'),
    // `sessions` was added in IndexedDB v2; swallow failure on legacy DBs.
    DB.getAll('sessions').catch(() => []),
  ]);

  // Recent sign-ins for the current user. Match strictly on userId so a user
  // with a non-unique display name (e.g. two "John Smith" students) does NOT
  // see each other's sessions.
  const myUid = AuthModule?.currentUser?.uid || AuthModule?.currentUser?.id;
  const recentSessions = (sessions || [])
    .filter(s => s.userId && myUid && s.userId === myUid)
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
    .slice(0, 5);

  const topProjects = projects.filter(p => !p.parentId);
  const totalInStock = parts.reduce((s, p) => s + (p.inStock || 0), 0);
  const lowParts = parts
    .filter(p => (p.needed || 0) > 0 && (p.inStock || 0) < p.needed)
    .sort((a, b) => ((a.inStock || 0) / a.needed) - ((b.inStock || 0) / b.needed));
  const checkedOut = tools.filter(t => t.checkedOutBy).length;
  const cncQueue = boms.filter(b => {
    const proc = (b.process || '').toLowerCase();
    return (proc.includes('cnc') || proc.includes('router')) && !BOM_DONE_STATUSES.includes(b.status) && b.status !== 'not_used';
  }).length;
  const containerCount = locations.reduce((s, l) => s + (l.containers || []).length, 0);

  const isEmpty = parts.length === 0 && projects.length === 0 && tools.length === 0;
  const gettingStarted = isEmpty ? `
    <div class="card mb-4" style="border-color:var(--accent-border)">
      <div class="card-header"><h3><i class="fa-solid fa-rocket text-accent"></i> Getting Started</h3></div>
      <div class="card-body">
        <p class="text-sm text-muted" style="margin-bottom:14px">Your workspace is empty. Here's the fastest way to get set up:</p>
        <div class="gs-steps">
          <a class="gs-step" href="#parts" onclick="event.preventDefault();navigate('parts')">
            <div class="gs-step-num">1</div>
            <div><div class="gs-step-title">Add your parts</div><div class="gs-step-sub">Build your inventory with photos, stock counts, and locations.</div></div>
          </a>
          <a class="gs-step" href="#workspace" onclick="event.preventDefault();navigate('workspace')">
            <div class="gs-step-num">2</div>
            <div><div class="gs-step-title">Map your shop</div><div class="gs-step-sub">Upload a floorplan and draw storage zones on it.</div></div>
          </a>
          <a class="gs-step" href="#projects" onclick="event.preventDefault();navigate('projects')">
            <div class="gs-step-num">3</div>
            <div><div class="gs-step-title">Create a project</div><div class="gs-step-sub">Then fill its master spreadsheet with the parts each subsystem needs.</div></div>
          </a>
          <a class="gs-step" href="#settings" onclick="event.preventDefault();navigate('settings')">
            <div class="gs-step-num"><i class="fa-solid fa-flask" style="font-size:11px"></i></div>
            <div><div class="gs-step-title">…or load sample data</div><div class="gs-step-sub">Explore Launchpad with a realistic demo database (Settings → Sample Data).</div></div>
          </a>
        </div>
        <button class="btn btn-secondary btn-sm mt-3" onclick="TourModule.start()"><i class="fa-solid fa-wand-magic-sparkles"></i> Take the tour</button>
      </div>
    </div>
  ` : '';

  container.innerHTML = `
    ${gettingStarted}
    <div class="grid-4 mb-4">
      <div class="card stat-card">
        <div class="stat-icon" style="background:var(--accent-dim);color:var(--accent)"><i class="fa-solid fa-folder-open"></i></div>
        <div class="stat-label">Projects</div>
        <div class="stat-value">${topProjects.length}</div>
        <div class="stat-sub">${projects.length - topProjects.length} subsystems</div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon" style="background:var(--blue-dim);color:var(--blue)"><i class="fa-solid fa-screwdriver-wrench"></i></div>
        <div class="stat-label">Parts</div>
        <div class="stat-value">${parts.length}</div>
        <div class="stat-sub">${totalInStock} in stock · ${lowParts.length} below baseline</div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon" style="background:var(--purple-dim);color:var(--purple)"><i class="fa-solid fa-gears"></i></div>
        <div class="stat-label">CNC Queue</div>
        <div class="stat-value">${cncQueue}</div>
        <div class="stat-sub">parts waiting on the machine</div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon" style="background:var(--green-dim);color:var(--green)"><i class="fa-solid fa-wrench"></i></div>
        <div class="stat-label">Tools</div>
        <div class="stat-value">${tools.length}</div>
        <div class="stat-sub">${checkedOut} checked out</div>
      </div>
    </div>

    <div class="grid-2" style="margin-top:20px">
      <!-- Low stock -->
      <div class="card">
        <div class="card-header">
          <h3>Low Stock</h3>
          <button class="btn btn-ghost btn-sm" onclick="navigate('parts')">Parts Library <i class="fa-solid fa-arrow-right" style="font-size:10px"></i></button>
        </div>
        <div class="card-body" style="padding:0">
          ${lowParts.length === 0 ? '<div class="empty-state" style="padding:30px"><p>Everything is at or above baseline 🎉</p></div>' :
            lowParts.slice(0, 6).map(p => `
              <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px">
                <div class="truncate" style="font-size:13px;font-weight:500">${escapeHTML(p.name)}</div>
                ${getStockChip(p.inStock || 0, p.needed || 0, p.id)}
              </div>
            `).join('')}
        </div>
      </div>

      <!-- Recent Sign-Ins -->
      <div class="card">
        <div class="card-header">
          <h3>Recent Sign-Ins</h3>
          <span class="badge badge-${AuthModule?.currentSession?.mode === 'online' ? 'green' : 'amber'}" style="font-size:10px;margin-left:8px">
            ${AuthModule?.currentSession?.mode === 'online' ? 'Google' : 'Offline'}
          </span>
        </div>
        <div class="card-body" style="padding:0">
          ${recentSessions.length === 0 ? '<div class="empty-state" style="padding:30px"><p>No session history</p></div>' :
            recentSessions.map(s => `
              <div style="padding:10px 16px;border-bottom:1px solid var(--border)">
                <div style="display:flex;align-items:center;justify-content:space-between">
                  <div style="font-size:13px;font-weight:500"><i class="fa-solid ${s.mode === 'online' ? 'fa-cloud' : 'fa-wifi'}" style="margin-right:6px;color:${s.mode === 'online' ? 'var(--green)' : 'var(--amber)'}" ></i>${escapeHTML(s.mode)}</div>
                  <div style="font-size:11px;color:var(--text-3)">${HistoryModule?.timeAgo ? HistoryModule.timeAgo(s.startedAt) : formatDate(s.startedAt)}</div>
                </div>
                <div style="font-size:11px;color:var(--text-3);margin-top:4px">${escapeHTML(s.platform || '')}</div>
                ${s.endedAt ? `<div style="font-size:11px;color:var(--text-3);margin-top:2px"><i class="fa-solid fa-arrow-right-from-bracket" style="margin-right:4px"></i>Ended ${HistoryModule?.timeAgo ? HistoryModule.timeAgo(s.endedAt) : formatDate(s.endedAt)}</div>` : '<div style="font-size:11px;color:var(--green);margin-top:2px"><i class="fa-solid fa-circle" style="margin-right:4px"></i>Active</div>'}
              </div>
            `).join('')}
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card-header"><h3>Quick Stats</h3></div>
      <div class="card-body">
        <div class="grid-3">
          <div><span style="color:var(--text-3);font-size:12px">Zones</span><div style="font-size:20px;font-weight:600;margin-top:2px">${locations.length}</div></div>
          <div><span style="color:var(--text-3);font-size:12px">Containers</span><div style="font-size:20px;font-weight:600;margin-top:2px">${containerCount}</div></div>
          <div><span style="color:var(--text-3);font-size:12px">Tracked Items</span><div style="font-size:20px;font-weight:600;margin-top:2px">${boms.length}</div></div>
        </div>
      </div>
    </div>
  `;
}

async function renderSettings(container) {
  const user = AuthModule.currentUser;
  
  container.innerHTML = `
    <div style="max-width:640px;margin:0 auto">
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><h3>Account</h3></div>
        <div class="card-body">
          <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:12px">
            <div class="flex items-center gap-3">
              <div class="avatar" style="width:40px;height:40px;font-size:16px">${initials(user?.name)}</div>
              <div>
                <div style="font-weight:500">${escapeHTML(user?.name)}</div>
                <div class="text-sm text-muted">${escapeHTML(user?.email)} &bull; ${escapeHTML(user?.role)}</div>
                <div class="text-xs text-muted" style="margin-top:6px">
                  <i class="fa-solid fa-clock" style="margin-right:4px"></i>
                  Last sign-in: ${
                    window.AuthModule?.currentSession?.startedAt
                      ? (HistoryModule?.timeAgo ? HistoryModule.timeAgo(window.AuthModule.currentSession.startedAt) : formatDate(window.AuthModule.currentSession.startedAt))
                      : '—'
                  }
                </div>
                <div class="text-xs text-muted" style="margin-top:2px">
                  <i class="fa-solid fa-display" style="margin-right:4px"></i>
                  This device: ${escapeHTML(window.AuthModule?.currentSession?.platform || '—')}
                </div>
              </div>
            </div>
            <button class="btn btn-secondary" onclick="AuthModule.signOut()"><i class="fa-solid fa-arrow-right-from-bracket"></i> Sign Out</button>
          </div>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px" id="teamAccessCard" hidden>
        <div class="card-header"><h3>Team Access</h3></div>
        <div class="card-body" id="teamAccessBody"></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><h3>Appearance</h3></div>
        <div class="card-body">
          <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:12px">
            <div>
              <div style="font-weight:500">Theme</div>
              <div class="text-sm text-muted">Pick the look that suits your shop.</div>
            </div>
            <select class="form-select" id="themeSelect" style="width:160px" aria-label="Theme">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="dracula">Dracula</option>
              <option value="oled">OLED Black</option>
              <option value="solarized">Solarized</option>
              <option value="cyberpunk">Cyberpunk</option>
              <option value="ocean">Ocean</option>
              <option value="forest">Forest</option>
            </select>
          </div>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><h3>Stock Status</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted" style="margin-bottom:12px">Stock is compared against each part's baseline. Within the tolerance counts as "at baseline"; outside it is above or below.</p>
          <div class="flex items-center gap-3 mb-3" style="flex-wrap:wrap">
            <span class="stock-chip stock-above" style="cursor:default" title="More than tolerance above baseline">Above baseline</span>
            <span class="stock-chip stock-green" style="cursor:default" title="Within tolerance of baseline">At baseline</span>
            <span class="stock-chip stock-red" style="cursor:default" title="More than tolerance below baseline">Below baseline</span>
          </div>
          <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:12px">
            <div>
              <label class="form-label" for="stockTolerance" style="margin-bottom:2px">Tolerance (&plusmn;%)</label>
              <div class="form-hint">e.g. 10 means 90–110% of baseline counts as "at baseline".</div>
            </div>
            <div class="flex items-center gap-2">
              <input type="number" class="form-input" id="stockTolerance" value="${window.__stockSettings?.tolerance ?? 10}" min="0" max="100" style="width:90px">
              <button class="btn btn-primary" id="saveThresholdsBtn"><i class="fa-solid fa-floppy-disk"></i> Save</button>
            </div>
          </div>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><h3>Performance</h3></div>
        <div class="card-body">
          <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:12px">
            <div>
              <div style="font-weight:500">Compress stored photos</div>
              <div class="text-sm text-muted">Shrinks existing photos, drawings, and zone images so pages load faster. New uploads are compressed automatically.</div>
            </div>
            <button class="btn btn-secondary" id="optimizePhotosBtn"><i class="fa-solid fa-bolt"></i> Compress</button>
          </div>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><h3>Backup &amp; Data</h3></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:16px">
          <div>
            <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:12px">
              <div>
                <div style="font-weight:500">Export data</div>
                <div class="text-sm text-muted">Download everything as a JSON backup. Backups include people names, emails, and contact info by default &mdash; uncheck the box below to strip PII before exporting for sharing.</div>
              </div>
              <button class="btn btn-secondary" id="exportBtn"><i class="fa-solid fa-download"></i> Export JSON</button>
            </div>
            <div style="margin-top:12px">
              <label class="flex items-center gap-2" style="cursor:pointer">
                <input type="checkbox" id="exportIncludePII" checked style="accent-color:var(--accent)">
                <span class="text-sm">Include email and contact info (PII)</span>
              </label>
              <label class="flex items-center gap-2" style="cursor:pointer;margin-top:6px">
                <input type="checkbox" id="exportAcknowledged" style="accent-color:var(--accent)">
                <span class="text-sm">I understand this backup may contain personally identifiable information.</span>
              </label>
            </div>
          </div>
          <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:12px;padding-top:16px;border-top:1px solid var(--border)">
            <div>
              <div style="font-weight:500">Import data</div>
              <div class="text-sm text-muted"><strong>Replaces</strong> all existing data with a backup file.</div>
            </div>
            <label class="btn btn-secondary" style="cursor:pointer">
              <i class="fa-solid fa-upload"></i> Choose File
              <input type="file" accept=".json" id="importFile" style="display:none"/>
            </label>
          </div>
          <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:12px;padding-top:16px;border-top:1px solid var(--border)">
            <div>
              <div style="font-weight:500">Sample data</div>
              <div class="text-sm text-muted"><strong>Replaces</strong> everything with a realistic demo database.</div>
            </div>
            <button class="btn btn-secondary" id="loadSampleBtn"><i class="fa-solid fa-flask"></i> Load Sample</button>
          </div>
          <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:12px;padding-top:16px;border-top:1px solid var(--border)">
            <div>
              <div style="font-weight:500">FRC example — 2026 robot</div>
              <div class="text-sm text-muted"><strong>Replaces</strong> projects/parts with the 2026 master part-tracking sheet: 6 subsystems, 168 numbered parts.</div>
            </div>
            <button class="btn btn-secondary" id="loadFrcBtn"><i class="fa-solid fa-robot"></i> Load FRC Example</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Danger Zone</h3></div>
        <div class="card-body">
          <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:12px">
            <div>
              <div style="font-weight:500">Clear all data</div>
              <div class="text-sm text-muted">Permanently deletes everything. Cannot be undone.</div>
            </div>
            <button class="btn btn-danger" id="clearBtn"><i class="fa-solid fa-trash"></i> Clear All Data</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Team access: mentors approve new sign-ups here
  if (AuthModule?.canPerform && AuthModule.canPerform('approve_users')) {
    try {
      const users = await DB.getAll('users');
      const pending = users.filter(u => u.status === 'pending');
      const approved = users.filter(u => u.status === 'approved');
      const card = document.getElementById('teamAccessCard');
      const body = document.getElementById('teamAccessBody');
      card.hidden = false;
      body.innerHTML = `
        <p class="text-sm text-muted" style="margin-bottom:${pending.length ? '12px' : '0'}">${approved.length} approved account${approved.length === 1 ? '' : 's'} · ${pending.length} waiting for approval.</p>
        ${pending.map(u => `
          <div class="flex items-center justify-between" style="padding:8px 0;border-top:1px solid var(--border);gap:12px">
            <div class="truncate">
              <div style="font-weight:500;font-size:13.5px">${escapeHTML(u.name || 'Unknown')}</div>
              <div class="text-xs text-muted truncate">${escapeHTML(u.email || '')}</div>
            </div>
            <button class="btn btn-primary btn-sm approve-user-btn" data-uid="${escapeAttr(u.id)}"><i class="fa-solid fa-check"></i> Approve</button>
          </div>
        `).join('')}
      `;
      body.querySelectorAll('.approve-user-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const u = users.find(x => x.id === btn.dataset.uid);
          if (!u || !confirm(`Approve ${u.name || 'this user'}? They will get access to the workspace.`)) return;
          u.status = 'approved';
          await DB.put('users', u);
          HistoryModule.log('approve', 'user', u.id, u.name, 'User approved for access');
          toast('User approved!', 'success');
          renderSettings(container);
        });
      });
    } catch (e) {
      console.error('Team access card failed:', e);
    }
  }

  document.getElementById('themeSelect').value = document.documentElement.getAttribute('data-theme') || 'dark';
  document.getElementById('themeSelect').addEventListener('change', (e) => {
    const t = e.target.value;
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('launchpad-theme', t);
  });

  document.getElementById('saveThresholdsBtn').addEventListener('click', async () => {
    const tolerance = Math.max(0, Math.min(100, parseInt(document.getElementById('stockTolerance').value)));
    if (isNaN(tolerance)) return toast('Enter a tolerance percentage', 'error');
    try {
      await DB.put('settings', { id: 'stockSettings', tolerance });
      window.__stockSettings = { tolerance };
      toast('Stock tolerance saved!', 'success');
    } catch (e) {
      toast('Failed to save: ' + e.message, 'error');
    }
  });

  document.getElementById('optimizePhotosBtn').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!confirm('Compress all stored photos and drawings? This re-encodes large images at a smaller size (originals are replaced).')) return;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Compressing…';
    try {
      let updated = 0, savedChars = 0;
      const jobs = [
        { store: 'parts', fields: ['photo'], listField: 'drawings' },
        { store: 'tools', fields: ['photo'] },
        { store: 'locations', fields: ['photo'] },
      ];
      for (const job of jobs) {
        const docs = await DB.getAll(job.store);
        for (const d of docs) {
          let before = 0, after = 0, changed = false;
          for (const field of job.fields) {
            if (d[field] && d[field].startsWith('data:image')) {
              before += d[field].length;
              const c = await compressDataUrl(d[field]);
              after += c.length;
              if (c !== d[field]) { d[field] = c; changed = true; }
            }
          }
          if (job.listField && Array.isArray(d[job.listField])) {
            for (let i = 0; i < d[job.listField].length; i++) {
              const img = d[job.listField][i];
              if (img && img.startsWith('data:image')) {
                before += img.length;
                const c = await compressDataUrl(img);
                after += c.length;
                if (c !== img) { d[job.listField][i] = c; changed = true; }
              }
            }
          }
          if (changed) {
            await DB.put(job.store, d);
            updated++;
            savedChars += Math.max(0, before - after);
          }
        }
      }
      // Also the workspace floorplan, stored in settings
      const settings = await DB.getAll('settings');
      const fp = settings.find(s => s.id === 'global_floorplan');
      if (fp?.value?.startsWith?.('data:image')) {
        const c = await compressDataUrl(fp.value, 1800);
        if (c !== fp.value) {
          savedChars += fp.value.length - c.length;
          fp.value = c;
          await DB.put('settings', fp);
          updated++;
        }
      }
      const savedMB = ((savedChars * 0.75) / (1024 * 1024)).toFixed(1);
      toast(updated ? `Compressed ${updated} items — saved ~${savedMB} MB` : 'Everything is already compact!', 'success');
    } catch (err) {
      console.error(err);
      toast('Compression failed: ' + err.message, 'error');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Compress';
  });

  document.getElementById('exportBtn').addEventListener('click', async () => {
    const includePII = document.getElementById('exportIncludePII').checked;
    const acknowledged = document.getElementById('exportAcknowledged').checked;

    // If PII is included, force an explicit acknowledgement so users understand
    // that the resulting JSON contains emails and contact info for the team.
    if (includePII && !acknowledged) {
      return toast('Please tick the acknowledgement box before exporting PII.', 'error');
    }

    const data = await DB.exportAll({ excludePII: !includePII });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `launchpad-backup-${includePII ? 'full' : 'no-pii'}-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(includePII ? 'Data exported (with PII).' : 'Data exported (PII excluded).', 'success');
  });

  document.getElementById('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (confirm('This will REPLACE all existing data. Continue?')) {
        await DB.importAll(data);
        toast('Data imported!', 'success');
        navigate('dashboard');
      }
    } catch (err) {
      toast('Invalid file: ' + err.message, 'error');
    }
  });

  document.getElementById('loadSampleBtn').addEventListener('click', async () => {
    if (confirm('This will REPLACE all existing data with sample data. Continue?')) {
      try {
        toast('Loading sample data...', 'info');
        const res = await fetch('sample_data.json');
        const data = await res.json();
        await DB.importAll(data);
        toast('Sample data loaded!', 'success');
        navigate('dashboard');
      } catch (err) {
        toast('Failed to load sample data: ' + err.message, 'error');
      }
    }
  });

  document.getElementById('loadFrcBtn').addEventListener('click', async () => {
    if (confirm('This will REPLACE existing projects, parts, and BOMs with the 2026 FRC example (6 subsystems, 168 parts). Continue?')) {
      try {
        toast('Loading FRC example…', 'info');
        const res = await fetch('example_frc_2026.json');
        const data = await res.json();
        await DB.importAll(data);
        toast('FRC example loaded!', 'success');
        SpreadsheetModule.pendingScope = 'proj_2026robot';
        navigate('spreadsheet');
      } catch (err) {
        toast('Failed to load FRC example: ' + err.message, 'error');
      }
    }
  });

  document.getElementById('clearBtn').addEventListener('click', async () => {
    if (confirm('Are you sure you want to permanently delete all data from Launchpad? This cannot be undone.')) {
      const stores = ['parts', 'projects', 'vendors', 'locations', 'tools', 'users', 'tasks', 'settings', 'bom_items'];
      for (const store of stores) {
        await DB.clearStore(store);
      }
      toast('All data cleared.', 'success');
      navigate('dashboard');
    }
  });
}

window.App = {
  async init() {
    // Theme init
    const savedTheme = localStorage.getItem('launchpad-theme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

    // Load stock settings (baseline tolerance) + managed categories
    window.__stockSettings = { tolerance: 10 };
    window.__categories = [];
    try {
      const settingsList = await DB.getAll('settings');
      const stock = settingsList.find(s => s.id === 'stockSettings');
      if (stock && stock.tolerance != null) window.__stockSettings = { tolerance: stock.tolerance };
      const cats = settingsList.find(s => s.id === 'categories');
      if (cats && Array.isArray(cats.list)) window.__categories = cats.list;
    } catch (e) {
      console.error("Failed to load settings:", e);
    }

    // Event delegation for stock chips quick edit
    document.body.addEventListener('click', async (e) => {
      const chip = e.target.closest('.stock-chip');
      if (chip) {
        e.preventDefault();
        e.stopPropagation();
        const partId = chip.dataset.partId;
        if (partId) {
          try {
            const partsList = await DB.getAll('parts');
            const part = partsList.find(p => p.id === partId);
            if (!part) return;
            
            const st = stockStatus(part.inStock || 0, part.needed || 0);
            const refPhoto = part.refPhotos?.[st.status];
            openModal('Quick Edit Stock', `
              <div style="display:flex; flex-direction:column; gap:12px; padding: 10px 0;">
                <div class="flex items-center gap-2">
                  ${getStockChip(part.inStock || 0, part.needed || 0, '')}
                  <span class="text-sm text-muted">${escapeHTML(st.label)}</span>
                </div>
                ${refPhoto ? `<div><div class="text-xs text-muted" style="margin-bottom:4px">Reference — what "${st.status} baseline" looks like:</div><img src="${safeImageSrc(refPhoto)}" style="width:100%;max-height:160px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in" onclick="showLightbox(this.src)"></div>` : ''}
                <div>
                  <label class="form-label">In Stock</label>
                  <input type="number" id="quickInStock" class="form-input" value="${part.inStock || 0}" min="0">
                </div>
                <div>
                  <label class="form-label">Baseline Parts</label>
                  <input type="number" id="quickNeeded" class="form-input" value="${part.needed || 0}" min="0">
                </div>
              </div>
            `, `
              <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
              <button class="btn btn-primary" id="saveQuickStockBtn">Save</button>
            `);
            
            document.getElementById('saveQuickStockBtn').addEventListener('click', async () => {
              const inStock = parseInt(document.getElementById('quickInStock').value) || 0;
              const needed = parseInt(document.getElementById('quickNeeded').value) || 0;
              
              part.inStock = inStock;
              part.needed = needed;
              await DB.put('parts', part);
              toast('Stock updated!', 'success');
              if (window.HistoryModule) {
                HistoryModule.log('update', 'part', partId, part.name, `Stock: ${inStock}/${needed}`);
              }
              closeModal();
              
              // Refresh active view
              if (currentView === 'parts' && window.PartsModule) {
                await PartsModule.loadData();
                PartsModule.renderView();
              } else if (currentView === 'spreadsheet' && window.SpreadsheetModule) {
                await SpreadsheetModule.loadData();
                SpreadsheetModule.renderRows();
              } else if (currentView === 'cnc' && window.CncModule) {
                await CncModule.loadData();
                CncModule.renderList();
              } else if (['dashboard', 'buy', 'containers', 'vendors'].includes(currentView)) {
                navigate(currentView);
              }
            });
          } catch (err) {
            console.error("Error loading part for quick edit:", err);
          }
        }
      }
    });

    // Sidebar nav clicks
    document.querySelectorAll('.nav-item[data-view]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(el.dataset.view);
      });
    });

    // Modal close
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    // Mobile sidebar toggle
    const toggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    
    function toggleSidebar(force) {
      const isOpen = sidebar.classList.toggle('open', force);
      if (sidebarOverlay) sidebarOverlay.classList.toggle('show', isOpen);
    }
    
    if (window.innerWidth <= 768) toggle.style.display = '';
    toggle.addEventListener('click', () => toggleSidebar());
    
    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', () => toggleSidebar(false));
    }
    
    // ── Touch gestures: edge-swipe right to open sidebar, swipe left to close ──
    let touchStartX = 0, touchStartY = 0, touchStartT = 0;
    document.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
      touchStartT = Date.now();
    }, {passive: true});

    document.addEventListener('touchend', e => {
      if (window.innerWidth > 768) return;
      // Ignore gestures inside canvases, horizontal scrollers, or open modals
      if (e.target.closest('canvas, .kanban, .table-wrap, .modal-overlay.open, .cmd-overlay.open, .tour-overlay.open')) return;

      const dx = e.changedTouches[0].screenX - touchStartX;
      const dy = e.changedTouches[0].screenY - touchStartY;
      const dt = Date.now() - touchStartT;
      // Require a mostly-horizontal, reasonably quick swipe
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6 || dt > 600) return;

      if (dx < 0 && sidebar.classList.contains('open')) {
        toggleSidebar(false);           // swipe left → close
      } else if (dx > 0 && !sidebar.classList.contains('open') && touchStartX < 40) {
        toggleSidebar(true);            // swipe right from left edge → open
      }
    }, {passive: true});
    
    window.addEventListener('resize', () => {
      toggle.style.display = window.innerWidth <= 768 ? '' : 'none';
      if (window.innerWidth > 768) toggleSidebar(false);
    });

    // Auto close sidebar on nav for mobile
    document.querySelectorAll('.nav-item[data-view]').forEach(el => {
      el.addEventListener('click', () => {
        if (window.innerWidth <= 768) toggleSidebar(false);
      });
    });

    // Help button
    document.getElementById('helpBtn').addEventListener('click', showHelpModal);

    // First-visit guided tour
    if (window.TourModule) TourModule.maybeAutoStart();

    // Hash routing
    const hash = location.hash.slice(1) || 'dashboard';
    navigate(hash);

    window.addEventListener('popstate', () => {
      navigate(location.hash.slice(1) || 'dashboard');
    });

async function showQuickAddSketchModal() {
  const parts = await DB.getAll('parts');
  if (parts.length === 0) {
    toast("Please add at least one part first.", "error");
    return;
  }
  const partOptions = parts.map(p => `<option value="${escapeAttr(p.id)}">${escapeHTML(p.name)}</option>`).join('');
  
  openModal('Quick Add Sketch', `
    <div style="display:flex; flex-direction:column; gap:12px; padding: 10px 0;">
      <div class="form-group">
        <label class="form-label">Select Part</label>
        <select class="form-select" id="quickSketchPartSelect">
          ${partOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Sketch Canvas</label>
        <div class="sketch-canvas-wrap">
          <canvas id="quickSketchCanvas" width="400" height="300" style="display:block;width:100%;cursor:crosshair" aria-label="Sketch drawing canvas"></canvas>
        </div>
      </div>
    </div>
  `, `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-secondary" onclick="window.clearQuickSketch()">Clear</button>
    <button class="btn btn-primary" onclick="window.saveQuickSketch()">Save Sketch</button>
  `);

  setTimeout(() => {
    const canvas = document.getElementById('quickSketchCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let drawing = false;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    };

    const start = (e) => { e.preventDefault(); drawing = true; const {x,y} = getPos(e); ctx.beginPath(); ctx.moveTo(x,y); };
    const move = (e) => { e.preventDefault(); if (!drawing) return; const {x,y} = getPos(e); ctx.lineTo(x,y); ctx.stroke(); };
    const stop = (e) => { if(e.cancelable) e.preventDefault(); drawing = false; };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', stop);
    canvas.addEventListener('mouseout', stop);

    canvas.addEventListener('touchstart', start, {passive:false});
    canvas.addEventListener('touchmove', move, {passive:false});
    canvas.addEventListener('touchend', stop);

    window.clearQuickSketch = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    window.saveQuickSketch = async () => {
      const partId = document.getElementById('quickSketchPartSelect').value;
      const dataUrl = canvas.toDataURL('image/png');
      const partsList = await DB.getAll('parts');
      const p = partsList.find(x => x.id === partId);
      if (!p) return;
      p.drawings = p.drawings || [];
      p.drawings.push(dataUrl);
      await DB.put('parts', p);
      toast('Sketch saved to drawings!', 'success');
      if (window.HistoryModule) {
        HistoryModule.log('update', 'part', partId, p.name, 'Added quick sketch');
      }
      closeModal();
      if (currentView === 'sketches' && window.SketchesModule) {
        await SketchesModule.loadData();
        SketchesModule.renderView();
      } else if (currentView === 'parts' && window.PartsModule) {
        await PartsModule.loadData();
        PartsModule.renderView();
      }
    };
  }, 100);
}
window.showQuickAddSketchModal = showQuickAddSketchModal;

    // Global FAB
    const fab = document.getElementById('globalFab');
    fab.style.display = '';
    fab.addEventListener('click', () => {
      openModal('Quick Add', `
        <div class="qa-grid">
          <button class="qa-tile" onclick="closeModal();navigate('parts').then(()=>document.getElementById('addPartBtn').click())">
            <i class="fa-solid fa-screwdriver-wrench text-blue" aria-hidden="true"></i>
            <span>Part</span>
          </button>
          <button class="qa-tile" onclick="closeModal();navigate('projects').then(()=>document.getElementById('addProjectBtn').click())">
            <i class="fa-solid fa-folder-plus text-amber" aria-hidden="true"></i>
            <span>Project</span>
          </button>
          <button class="qa-tile" onclick="closeModal();window.showQuickAddSketchModal()">
            <i class="fa-solid fa-pen-nib text-rose" aria-hidden="true"></i>
            <span>Sketch</span>
          </button>
        </div>
      `, '');
    });

    // Command Palette (Cmd+K)
    const cmdOverlay = document.getElementById('cmdOverlay');
    const cmdInput = document.getElementById('cmdInput');
    const cmdResults = document.getElementById('cmdResults');

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        cmdOverlay.classList.add('open');
        cmdInput.value = '';
        cmdResults.innerHTML = '';
        setTimeout(() => cmdInput.focus(), 50);
      }
      if (e.key === 'Escape' && cmdOverlay.classList.contains('open')) {
        cmdOverlay.classList.remove('open');
      }
    });

    cmdOverlay.addEventListener('click', (e) => {
      if (e.target === cmdOverlay) cmdOverlay.classList.remove('open');
    });

    cmdInput.addEventListener('input', async (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) { cmdResults.innerHTML = ''; return; }
      
      const [parts, projects] = await Promise.all([
        DB.getAll('parts'), DB.getAll('projects')
      ]);

      const results = [];
      parts.filter(p => p.name.toLowerCase().includes(q)).forEach(p => results.push({ type: 'Part', icon: 'fa-screwdriver-wrench', name: p.name, action: () => { navigate('parts').then(()=>PartsModule.showPartDetail(p.id)); } }));
      projects.filter(p => p.name.toLowerCase().includes(q)).forEach(p => results.push({ type: 'Project', icon: 'fa-folder', name: p.name, action: () => { navigate('projects').then(()=>ProjectsModule.showDetail(p.id)); } }));

      if (results.length === 0) {
        cmdResults.innerHTML = '<div class="text-muted text-center" style="padding:20px">No results found</div>';
      } else {
        cmdResults.innerHTML = results.slice(0, 10).map((r, i) => `
          <div class="cmd-item" tabindex="0" onclick="window.cmdAction(${i})">
            <i class="fa-solid ${escapeAttr(r.icon)}"></i>
            <div>
              <div style="font-size:14px;font-weight:500">${escapeHTML(r.name)}</div>
              <div style="font-size:11px;color:var(--text-3)">${escapeHTML(r.type)}</div>
            </div>
          </div>
        `).join('');
        
        window.cmdAction = (i) => {
          cmdOverlay.classList.remove('open');
          results[i].action();
        };
      }
    });

    // Secret Easter Egg
    document.addEventListener('keydown', (e) => {
      // Cmd + Shift + Option + K
      if (e.metaKey && e.shiftKey && e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const cat = document.createElement('img');
        cat.src = 'https://cataas.com/cat/gif';
        cat.style.position = 'fixed';
        cat.style.top = '-200px';
        cat.style.right = '50px';
        cat.style.width = '150px';
        cat.style.zIndex = '999999';
        cat.style.transition = 'top 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), transform 0.5s ease-in-out';
        cat.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
        cat.style.borderRadius = '12px';
        cat.style.transform = 'rotate(15deg)';
        document.body.appendChild(cat);
        
        setTimeout(() => { cat.style.top = '20px'; }, 100);
        
        // Remove after a bit
        setTimeout(() => {
          cat.style.top = '-200px';
          cat.style.transform = 'rotate(-15deg)';
          setTimeout(() => cat.remove(), 500);
        }, 3000);
      }
    });
  }
};
