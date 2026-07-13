// spreadsheet.js — the Master Spreadsheet: per-project part tracking (BOM merged in).
// Columns: Status | Part # | Sub | Type | Material | Machine | Qty | Stock | Assigned | Cost | Vendor | Location | Notes

// ── Shared part-tracking constants ──
const BOM_MACHINES = ['CNC Router', 'CNC Mill', 'Lathe', 'Manual Mill', '3D Printer', 'Laser Cut', 'Saw', 'Drill Press', 'Sheet Metal / Bend', 'Weld', 'Hand Tools', 'Purchase'];
const SS_MATERIALS = ['1/16" Aluminum - Sheet', '1/8" Aluminum - Sheet', '3/16" Aluminum - Sheet', '1/4" Aluminum - Sheet', '1x1 Aluminum Boxtube', '1x2 Aluminum Boxtube', '1/2" Aluminum - Hex', '3/8" Aluminum - Rod', '1" Aluminum - Angle', '3mm Polycarbonate', '6mm Polycarbonate', 'UHMW', 'Delrin / Acetal', 'PLA', 'PETG', 'ABS', 'CF-Nylon'];
window.SS_MATERIALS = SS_MATERIALS;

// Two status ladders: bought parts move through purchasing; fabricated parts
// move through the shop (Design → Released → Manufactured → Assembled).
const BOM_LADDERS = {
  cots:    ['not_started', 'ordered', 'in_stock', 'installed'],
  inhouse: ['design', 'released', 'manufactured', 'assembled']
};
const BOM_STATUS_ORDER = BOM_LADDERS.cots; // legacy alias
const BOM_STATUS_MAP = {
  'not_started':  { label: 'Not Started',  class: 'gray' },
  'ordered':      { label: 'Ordered',      class: 'amber' },
  'in_stock':     { label: 'In Stock',     class: 'blue' },
  'installed':    { label: 'Installed',    class: 'green' },
  'design':       { label: 'Design',       class: 'gray' },
  'released':     { label: 'Released',     class: 'amber' },
  'manufactured': { label: 'Manufactured', class: 'blue' },
  'assembled':    { label: 'Assembled',    class: 'green' },
  'not_used':     { label: 'Not Used',     class: 'rose' }
};
const BOM_DONE_STATUSES = ['installed', 'assembled'];

// Fabrication type is derived from the machine/process (FRCBOM-style)
const BOM_FAB_TYPES = {
  cnc:         { label: 'CNC',         class: 'purple' },
  print:       { label: '3D Printed',  class: 'rose' },
  manufacture: { label: 'Manufacture', class: 'blue' },
  cots:        { label: 'COTS',        class: 'cyan' }
};

function bomFabType(b) {
  const proc = (b.process || '').toLowerCase();
  if (proc.includes('cnc') || proc.includes('router')) return 'cnc';
  if (proc.includes('print')) return 'print';
  if (proc.includes('purchase') || proc.includes('order') || proc.includes('cots')) return 'cots';
  if (proc) return 'manufacture';
  return (b.type || 'cots') === 'cots' ? 'cots' : 'manufacture';
}

function getFabChip(b) {
  const ft = BOM_FAB_TYPES[bomFabType(b)];
  return `<span class="badge badge-${ft.class}">${ft.label}</span>`;
}

function bomLadder(b) {
  return bomFabType(b) === 'cots' ? BOM_LADDERS.cots : BOM_LADDERS.inhouse;
}

// Subsystem colors: 100 → blue, 200 → green, 300 → amber, …
const SUB_PALETTE = ['blue', 'green', 'amber', 'purple', 'cyan', 'rose', 'red'];
function subsystemColor(proj) {
  if (!proj || !proj.parentId) return 'gray';
  const code = parseInt(proj.code);
  const i = !isNaN(code) ? Math.max(0, Math.round(code / 100) - 1) : 0;
  return SUB_PALETTE[i % SUB_PALETTE.length];
}

function getPartNumberChip(pn, color) {
  if (!pn) return '<span class="text-muted">—</span>';
  return `<span class="pn mono ${color ? 'tint-' + color : ''}">${escapeHTML(pn)}</span>`;
}

function getSubsystemChip(proj, fallbackLabel = 'Main') {
  if (!proj || !proj.parentId) return `<span class="chip"><i class="fa-solid fa-diagram-project" aria-hidden="true"></i>${escapeHTML(fallbackLabel)}</span>`;
  const color = subsystemColor(proj);
  return `<span class="chip tint-${color}"><i class="fa-solid fa-diagram-project" aria-hidden="true"></i>${proj.code ? escapeHTML(proj.code) + ' · ' : ''}${escapeHTML(proj.name)}</span>`;
}

// ── Status popover: pick any status from a dropdown (no accidental one-click advance) ──
function closeStatusMenu() {
  document.getElementById('statusPopmenu')?.remove();
}
function showStatusMenu(anchor, current, onPick) {
  closeStatusMenu();
  const menu = document.createElement('div');
  menu.className = 'popmenu';
  menu.id = 'statusPopmenu';
  const groups = [
    { label: 'Fabricated', items: BOM_LADDERS.inhouse },
    { label: 'Purchased', items: BOM_LADDERS.cots },
    { label: '', items: ['not_used'] }
  ];
  menu.innerHTML = groups.map(g => `
    ${g.label ? `<div class="popmenu-label">${g.label}</div>` : '<div class="popmenu-sep"></div>'}
    ${g.items.map(s => `
      <button class="popmenu-item ${s === current ? 'active' : ''}" data-status="${s}">
        <span class="badge badge-${BOM_STATUS_MAP[s].class}">${BOM_STATUS_MAP[s].label}</span>
        ${s === current ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : ''}
      </button>`).join('')}
  `).join('');
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = Math.max(8, Math.min(window.innerHeight - menu.offsetHeight - 8, r.bottom + 4)) + 'px';
  menu.style.left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, r.left)) + 'px';
  menu.querySelectorAll('.popmenu-item').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const s = b.dataset.status;
      closeStatusMenu();
      onPick(s);
    });
  });
  setTimeout(() => {
    document.addEventListener('click', closeStatusMenu, { once: true });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') closeStatusMenu();
      document.removeEventListener('keydown', esc);
    });
  }, 0);
}

const SpreadsheetModule = {
  scope: null,          // top-level project id
  pendingScope: null,   // set by other views before navigate('spreadsheet')
  subFilter: 'all',     // 'all' | 'main' | subsystem project id
  typeFilter: 'all',    // all | cnc | manufacture | print | cots
  sortField: 'default', // default = subsystem then part number
  sortDir: 1,
  condensed: localStorage.getItem('launchpad-ss-condensed') === '1',

  async render(container) {
    this.container = container;
    this.container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading Spreadsheet...</p></div>`;
    await this.loadData();

    if (this.pendingScope) {
      const t = this.projects.find(p => p.id === this.pendingScope);
      if (t) {
        if (t.parentId) { this.scope = t.parentId; this.subFilter = t.id; }
        else { this.scope = t.id; this.subFilter = 'all'; }
      }
      this.pendingScope = null;
    }
    const tops = this.projects.filter(p => !p.parentId);
    if (!this.scope || !tops.find(p => p.id === this.scope)) {
      const remembered = localStorage.getItem('launchpad-ss-scope');
      this.scope = (remembered && tops.find(p => p.id === remembered)) ? remembered : (tops[0]?.id || null);
      this.subFilter = 'all';
    }
    this.renderView();
  },

  async loadData() {
    [this.parts, this.locations, this.projects, this.boms] = await Promise.all([
      DB.getAll('parts'),
      DB.getAll('locations'),
      DB.getAll('projects'),
      DB.getAll('bom_items')
    ]);
  },

  familyIds(projectId) {
    return [projectId, ...this.projects.filter(p => p.parentId === projectId).map(p => p.id)];
  },

  subsystems() {
    return this.projects
      .filter(p => p.parentId === this.scope)
      .sort((a, b) => (parseInt(a.code) || 999) - (parseInt(b.code) || 999));
  },

  // Next part number within a subsystem: <code>-NNN (e.g. 100-030)
  nextPartNumber(projectId) {
    const proj = this.projects.find(p => p.id === projectId);
    const code = proj?.code || '000';
    let max = 0;
    this.boms.filter(b => b.projectId === projectId).forEach(b => {
      const m = /^\d+-(\d+)$/.exec(b.partNumber || '');
      if (m) max = Math.max(max, parseInt(m[1]));
    });
    return `${code}-${String(max + 1).padStart(3, '0')}`;
  },

  renderView() {
    const tops = this.projects.filter(p => !p.parentId);
    if (!this.scope) {
      this.container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-table-cells"></i><h3>No project yet</h3><p>Create a project first — the master spreadsheet tracks its parts across subsystems.</p><button class="btn btn-primary" onclick="navigate('projects')"><i class="fa-solid fa-folder-plus"></i> Go to Projects</button></div>`;
      return;
    }
    localStorage.setItem('launchpad-ss-scope', this.scope);

    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          ${tops.length > 1 ? `
          <select class="form-select" id="ssScope" style="width:210px" aria-label="Project">
            ${tops.map(p => `<option value="${p.id}" ${p.id === this.scope ? 'selected' : ''}>${escapeHTML(p.name)}</option>`).join('')}
          </select>` : ''}
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input type="text" id="ssSearch" placeholder="Search part name or number…">
          </div>
        </div>
        <div class="toolbar-right">
          <button class="btn-icon ${this.condensed ? 'active-toggle' : ''}" id="ssCondensedBtn" title="${this.condensed ? 'Comfortable rows' : 'Condensed rows'}" aria-label="Toggle condensed view">
            <i class="fa-solid ${this.condensed ? 'fa-table-list' : 'fa-bars-staggered'}" aria-hidden="true"></i>
          </button>
          <button class="btn btn-secondary btn-sm" id="ssDataBtn"><i class="fa-solid fa-file-arrow-down"></i> Data</button>
          <button class="btn btn-primary btn-sm" onclick="SpreadsheetModule.showAddModal()"><i class="fa-solid fa-plus"></i> Add Item</button>
        </div>
      </div>
      <div id="ssStats"></div>
      <div id="ssFilters"></div>
      <div class="table-wrap ${this.condensed ? 'ss-condensed' : ''}" id="ssTableWrap" style="max-height:calc(100vh - 320px); overflow-y:auto;"></div>
    `;

    document.getElementById('ssScope')?.addEventListener('change', (e) => {
      this.scope = e.target.value;
      this.subFilter = 'all';
      this.renderView();
    });
    document.getElementById('ssSearch').addEventListener('input', debounce(() => this.renderRows(), 150));
    document.getElementById('ssCondensedBtn').addEventListener('click', () => {
      this.condensed = !this.condensed;
      localStorage.setItem('launchpad-ss-condensed', this.condensed ? '1' : '0');
      this.renderView();
    });
    document.getElementById('ssDataBtn').addEventListener('click', (e) => {
      showPopMenu(e.target.closest('button'), [
        { label: 'Export CSV', icon: 'fa-file-csv', onClick: () => this.exportCSV() },
        { label: 'Export JSON', icon: 'fa-file-code', onClick: () => this.exportJSON() },
        { sep: true },
        { label: 'Import CSV', icon: 'fa-file-import', onClick: () => this.importFile('csv') },
        { label: 'Import JSON', icon: 'fa-file-import', onClick: () => this.importFile('json') },
        { sep: true },
        { label: 'Auto-number missing part #s', icon: 'fa-hashtag', onClick: () => this.autoNumberMissing() },
      ]);
    });
    this.renderRows();
  },

  // ── data selection ──
  allScopeItems() {
    const fam = this.familyIds(this.scope);
    return this.boms
      .filter(b => fam.includes(b.projectId))
      .map(b => ({
        b,
        part: this.parts.find(p => p.id === b.partId),
        proj: this.projects.find(p => p.id === b.projectId)
      }));
  },

  sortValue(row, field) {
    const { b, part, proj } = row;
    switch (field) {
      case 'status': {
        if (b.status === 'not_used') return 99;
        const ladder = bomLadder(b);
        const i = ladder.indexOf(b.status);
        return i === -1 ? 50 : i;
      }
      case 'pn': return b.partNumber || '￿';
      case 'name': return (part?.name || '').toLowerCase();
      case 'type': return bomFabType(b);
      case 'material': return (b.material || '￿').toLowerCase();
      case 'machine': return (b.process || '￿').toLowerCase();
      case 'qty': return b.qtyNeeded || 0;
      case 'stock': return part?.inStock || 0;
      case 'cost': return part?.unitCost || 0;
      case 'location': return (this.locations.find(l => l.id === part?.locationId)?.name || '￿').toLowerCase();
      default: return 0;
    }
  },

  filteredItems() {
    const q = (document.getElementById('ssSearch')?.value || '').toLowerCase();
    let rows = this.allScopeItems();

    if (this.subFilter === 'main') rows = rows.filter(r => r.b.projectId === this.scope);
    else if (this.subFilter !== 'all') rows = rows.filter(r => r.b.projectId === this.subFilter);
    if (this.typeFilter !== 'all') rows = rows.filter(r => bomFabType(r.b) === this.typeFilter);
    if (q) rows = rows.filter(r => (r.part?.name || '').toLowerCase().includes(q) || (r.b.partNumber || '').toLowerCase().includes(q));

    const bySubThenPn = (x, y) => {
      const cx = x.b.projectId === this.scope ? -1 : (parseInt(x.proj?.code) || 999);
      const cy = y.b.projectId === this.scope ? -1 : (parseInt(y.proj?.code) || 999);
      if (cx !== cy) return cx - cy;
      return (x.b.partNumber || '￿').localeCompare(y.b.partNumber || '￿', undefined, { numeric: true });
    };

    if (this.sortField === 'default') {
      rows.sort(bySubThenPn);
    } else {
      rows.sort((x, y) => {
        const va = this.sortValue(x, this.sortField);
        const vb = this.sortValue(y, this.sortField);
        if (va < vb) return -1 * this.sortDir;
        if (va > vb) return 1 * this.sortDir;
        return bySubThenPn(x, y);
      });
    }
    return rows;
  },

  setSort(field) {
    if (this.sortField === field) {
      if (this.sortDir === 1) this.sortDir = -1;
      else { this.sortField = 'default'; this.sortDir = 1; } // third click resets to subsystem order
    } else {
      this.sortField = field;
      this.sortDir = 1;
    }
    this.renderRows();
  },

  sortIcon(field) {
    if (this.sortField !== field) return '<i class="fa-solid fa-sort" style="opacity:0.3;margin-left:4px" aria-hidden="true"></i>';
    return this.sortDir === 1
      ? '<i class="fa-solid fa-sort-up" style="margin-left:4px" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-sort-down" style="margin-left:4px" aria-hidden="true"></i>';
  },

  setSubFilter(v) { this.subFilter = v; this.renderRows(); },
  setTypeFilter(v) { this.typeFilter = v; this.renderRows(); },

  renderRows() {
    const all = this.allScopeItems();
    const rows = this.filteredItems();
    const subs = this.subsystems();

    // ── stats (whole project, unfiltered) ──
    let totalCost = 0, doneCount = 0, notUsedCount = 0;
    const fabCounts = { cnc: 0, print: 0, manufacture: 0, cots: 0 };
    all.forEach(({ b, part }) => {
      totalCost += part ? (part.unitCost || 0) * b.qtyNeeded : 0;
      if (BOM_DONE_STATUSES.includes(b.status)) doneCount++;
      if (b.status === 'not_used') notUsedCount++;
      fabCounts[bomFabType(b)]++;
    });
    const activeCount = all.length - notUsedCount;
    const pct = activeCount ? Math.round((doneCount / activeCount) * 100) : 0;

    document.getElementById('ssStats').innerHTML = all.length === 0 ? '' : `
      <div class="card mb-3" style="padding:14px 18px">
        <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:12px">
          <div class="flex items-center gap-4" style="flex-wrap:wrap">
            <div><span class="text-xs text-muted">Parts</span><div style="font-size:19px;font-weight:700">${activeCount}</div></div>
            <div><span class="text-xs text-muted">Done</span><div style="font-size:19px;font-weight:700;color:var(--green)">${doneCount}</div></div>
            <div><span class="text-xs text-muted">CNC</span><div style="font-size:19px;font-weight:700;color:var(--purple)">${fabCounts.cnc}</div></div>
            <div><span class="text-xs text-muted">Manufacture</span><div style="font-size:19px;font-weight:700;color:var(--blue)">${fabCounts.manufacture}</div></div>
            <div><span class="text-xs text-muted">3D Printed</span><div style="font-size:19px;font-weight:700;color:var(--rose)">${fabCounts.print}</div></div>
            <div><span class="text-xs text-muted">COTS</span><div style="font-size:19px;font-weight:700;color:var(--cyan)">${fabCounts.cots}</div></div>
            ${totalCost > 0 ? `<div><span class="text-xs text-muted">Budget</span><div style="font-size:19px;font-weight:700">${formatCurrency(totalCost)}</div></div>` : ''}
          </div>
          <div style="min-width:160px;flex:1;max-width:300px">
            <div class="flex items-center justify-between text-xs text-muted" style="margin-bottom:4px"><span>Progress</span><span style="font-weight:700;color:var(--text-0)">${pct}%</span></div>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          </div>
        </div>
      </div>
    `;

    // ── filter chips ──
    const mainCount = all.filter(r => r.b.projectId === this.scope).length;
    document.getElementById('ssFilters').innerHTML = all.length === 0 ? '' : `
      <div class="filter-chips mb-2">
        <button class="filter-chip ${this.subFilter === 'all' ? 'active' : ''}" onclick="SpreadsheetModule.setSubFilter('all')">All Systems (${all.length})</button>
        ${mainCount ? `<button class="filter-chip ${this.subFilter === 'main' ? 'active' : ''}" onclick="SpreadsheetModule.setSubFilter('main')">Main (${mainCount})</button>` : ''}
        ${subs.map(s => {
          const n = all.filter(r => r.b.projectId === s.id).length;
          const color = subsystemColor(s);
          return `<button class="filter-chip sub-chip-${color} ${this.subFilter === s.id ? 'active' : ''}" onclick="SpreadsheetModule.setSubFilter('${s.id}')">${s.code ? escapeHTML(s.code) + ' · ' : ''}${escapeHTML(s.name)} (${n})</button>`;
        }).join('')}
      </div>
      <div class="filter-chips mb-3">
        <button class="filter-chip ${this.typeFilter === 'all' ? 'active' : ''}" onclick="SpreadsheetModule.setTypeFilter('all')">All Types</button>
        <button class="filter-chip ${this.typeFilter === 'cnc' ? 'active' : ''}" onclick="SpreadsheetModule.setTypeFilter('cnc')">CNC (${fabCounts.cnc})</button>
        <button class="filter-chip ${this.typeFilter === 'manufacture' ? 'active' : ''}" onclick="SpreadsheetModule.setTypeFilter('manufacture')">Manufacture (${fabCounts.manufacture})</button>
        <button class="filter-chip ${this.typeFilter === 'print' ? 'active' : ''}" onclick="SpreadsheetModule.setTypeFilter('print')">3D Printed (${fabCounts.print})</button>
        <button class="filter-chip ${this.typeFilter === 'cots' ? 'active' : ''}" onclick="SpreadsheetModule.setTypeFilter('cots')">COTS (${fabCounts.cots})</button>
      </div>
    `;

    const wrap = document.getElementById('ssTableWrap');
    if (all.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><i class="fa-solid fa-table-cells"></i><h3>No parts tracked yet</h3><p>Add the parts this project needs — they'll be auto-numbered by subsystem.</p><button class="btn btn-primary" onclick="SpreadsheetModule.showAddModal()"><i class="fa-solid fa-plus"></i> Add First Item</button></div>`;
      return;
    }
    if (rows.length === 0) {
      wrap.innerHTML = `<div class="empty-state" style="padding:30px"><p>No items match this filter.</p></div>`;
      return;
    }

    const th = (field, label, cls = '') => `<th class="${cls}" style="cursor:pointer" onclick="SpreadsheetModule.setSort('${field}')">${label} ${this.sortIcon(field)}</th>`;
    const groupDividers = this.sortField === 'default' && this.subFilter === 'all';
    const COLS = 12;

    let lastGroup = null;
    const bodyHTML = rows.map((row) => {
      const { b, part, proj } = row;
      const isMain = b.projectId === this.scope;
      const groupId = isMain ? 'main' : b.projectId;
      let divider = '';
      if (groupDividers && groupId !== lastGroup) {
        lastGroup = groupId;
        const color = isMain ? 'gray' : subsystemColor(proj);
        const label = isMain ? 'Main' : `${proj?.code ? proj.code + ' · ' : ''}${proj?.name || '?'}`;
        const count = rows.filter(r => (r.b.projectId === this.scope ? 'main' : r.b.projectId) === groupId).length;
        divider = `<tr class="ss-group ss-group-${color}"><td colspan="${COLS}"><span class="ss-group-label tint-${color}">${escapeHTML(label)}</span><span class="ss-group-count">${count} parts</span></td></tr>`;
      }

      const st = BOM_STATUS_MAP[b.status] || BOM_STATUS_MAP[bomLadder(b)[0]];
      const isDone = BOM_DONE_STATUSES.includes(b.status);
      const isNotUsed = b.status === 'not_used';
      const inStock = part ? (part.inStock || 0) : 0;
      const short = !isDone && !isNotUsed && inStock < b.qtyNeeded;
      const critical = short && inStock === 0;
      const rowCls = (critical ? 'row-stock-low' : short ? 'row-stock-warn' : '') + (isNotUsed ? ' row-not-used' : '');
      const color = isMain ? 'gray' : subsystemColor(proj);
      const loc = part ? this.locations.find(l => l.id === part.locationId) : null;
      const eb = (f) => `SpreadsheetModule.editBomCell('${b.id}','${f}')`;
      const ep = (f) => part ? `SpreadsheetModule.editPartCell('${part.id}','${f}')` : '';

      return divider + `
        <tr class="${rowCls}">
          <td data-label="Status"><button class="badge badge-${st.class} bom-status-btn" onclick="event.stopPropagation();SpreadsheetModule.pickStatus('${b.id}', this)" title="Change status" aria-haspopup="menu">${st.label} <i class="fa-solid fa-angle-down" style="font-size:9px;opacity:0.7" aria-hidden="true"></i></button></td>
          <td data-label="Part #">${getPartNumberChip(b.partNumber, color)}</td>
          <td data-label="Part">${part ? `<button class="ss-name" onclick="navigate('parts').then(()=>PartsModule.showPartDetail('${part.id}'))" title="Open part details">${escapeHTML(part.name)}</button>` : '<span class="text-muted">Unknown Part</span>'}</td>
          <td data-label="Sub">${isMain ? getSubsystemChip(null, 'Main') : getSubsystemChip(proj)}</td>
          <td data-label="Type">${getFabChip(b)}</td>
          <td data-label="Material">${this.chip(b.material, 'fa-layer-group', eb('material'))}</td>
          <td data-label="Machine">${this.chip(b.process, 'fa-gears', eb('process'))}</td>
          <td data-label="Qty">${this.chip(String(b.qtyNeeded), null, eb('qtyNeeded'))}</td>
          <td data-label="Stock">${part ? getStockChip(inStock, b.qtyNeeded, part.id) : '—'}</td>
          <td data-label="Cost">${part ? this.chip(part.unitCost ? formatCurrency(part.unitCost) : '', null, ep('unitCost')) : '—'}</td>
          <td data-label="Location">${part ? this.chip(loc?.name, 'fa-location-dot', ep('locationId')) : '—'}</td>
          <td data-label="Notes" class="text-right">
            <div class="flex items-center justify-end gap-1">
              ${this.chip(b.comments ? (b.comments.length > 26 ? b.comments.slice(0, 24) + '…' : b.comments) : '', 'fa-comment', eb('comments'), b.comments || 'Add a note')}
              <button class="btn-icon btn-sm" onclick="SpreadsheetModule.showEditModal('${b.id}')" title="Edit all fields" aria-label="Edit item"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
              <button class="btn-icon btn-sm" style="color:var(--red)" onclick="SpreadsheetModule.deleteItem('${b.id}')" title="Remove" aria-label="Remove item"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    wrap.innerHTML = `
      <table class="spreadsheet-table" style="white-space:nowrap; width:max-content; min-width:100%;">
        <thead style="position:sticky; top:0; z-index:10; box-shadow:0 1px 0 var(--border);">
          <tr>
            ${th('status', 'Status')}
            ${th('pn', 'Part #')}
            ${th('name', 'Part')}
            ${th('type', 'Sub', '')}
            ${th('type', 'Type')}
            ${th('material', 'Material')}
            ${th('machine', 'Machine')}
            ${th('qty', 'Qty')}
            ${th('stock', 'Stock')}
            ${th('cost', 'Cost')}
            ${th('location', 'Location')}
            <th class="text-right">Notes</th>
          </tr>
        </thead>
        <tbody>${bodyHTML}</tbody>
      </table>
    `;
  },

  // ── chips ──
  chip(label, icon, onclick, title) {
    const empty = !label;
    return `<button class="ss-chip ${empty ? 'ss-chip-empty' : ''}" onclick="${onclick}" title="${escapeHTML(title || 'Click to edit')}">
      ${icon ? `<i class="fa-solid ${icon}" aria-hidden="true"></i>` : ''}${empty ? '+' : escapeHTML(label)}
    </button>`;
  },

  // ── status picker ──
  pickStatus(itemId, anchor) {
    const item = this.boms.find(b => b.id === itemId);
    if (!item) return;
    showStatusMenu(anchor, item.status, async (status) => {
      if (status === item.status) return;
      item.status = status;
      try {
        await DB.put('bom_items', item);
        const part = this.parts.find(p => p.id === item.partId);
        HistoryModule.log('update', 'bom_item', item.id, part?.name || 'Unknown Part', `Status → ${BOM_STATUS_MAP[status].label}`);
        toast(`${part?.name || 'Item'}: ${BOM_STATUS_MAP[status].label}`, 'success');
        this.renderRows();
      } catch (err) {
        toast('Error updating status', 'error');
      }
    });
  },

  // ── cell editors ──
  _editor(title, bodyHTML, onSave) {
    openModal(title, bodyHTML, `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="ssCellSave">Save</button>
    `);
    const save = async () => {
      const btn = document.getElementById('ssCellSave');
      btn.disabled = true;
      try {
        await onSave();
        closeModal();
        await this.loadData();
        this.renderRows();
      } catch (err) {
        btn.disabled = false;
        toast('Error saving', 'error');
      }
    };
    document.getElementById('ssCellSave').addEventListener('click', save);
    setTimeout(() => {
      const input = document.getElementById('ssCellInput');
      if (input) {
        input.focus();
        if (input.select) try { input.select(); } catch (e) {}
        input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && input.tagName !== 'TEXTAREA') { ev.preventDefault(); save(); } });
      }
    }, 60);
  },

  async editPartCell(partId, field) {
    const p = this.parts.find(x => x.id === partId);
    if (!p) return;

    const selectHTML = (opts, current, noneLabel = 'None') =>
      `<select class="form-select" id="ssCellInput"><option value="">${noneLabel}</option>${opts.map(o => `<option value="${o.value}" ${o.value === current ? 'selected' : ''}>${escapeHTML(o.label)}</option>`).join('')}</select>`;

    let body = '';
    let apply = null;

    switch (field) {
      case 'unitCost':
        body = `<div class="form-group"><label class="form-label">Unit Cost ($)</label><input type="number" step="0.01" min="0" class="form-input" id="ssCellInput" value="${p.unitCost || ''}"></div>`;
        apply = () => { p.unitCost = parseFloat(document.getElementById('ssCellInput').value) || 0; };
        break;
      case 'locationId':
        body = `<div class="form-group"><label class="form-label">Location</label>${selectHTML(this.locations.map(l => ({ value: l.id, label: l.name })), p.locationId)}</div><p class="form-hint">Changing location clears the container.</p>`;
        apply = () => {
          const val = document.getElementById('ssCellInput').value || null;
          if (val !== p.locationId) p.containerId = null;
          p.locationId = val;
        };
        break;
      default:
        return;
    }

    this._editor(`Edit: ${p.name}`, body, async () => {
      apply();
      await DB.put('parts', p);
      HistoryModule.log('update', 'part', p.id, p.name, `Edited ${field} via spreadsheet`);
      toast('Saved', 'success');
    });
  },

  async editBomCell(itemId, field) {
    const item = this.boms.find(b => b.id === itemId);
    if (!item) return;
    const part = this.parts.find(p => p.id === item.partId);
    const partName = part ? part.name : 'Unknown Part';

    let body = '';
    let apply = null;

    switch (field) {
      case 'qtyNeeded':
        body = `<div class="form-group"><label class="form-label">Quantity Needed</label><input type="number" min="1" class="form-input" id="ssCellInput" value="${item.qtyNeeded}"></div>`;
        apply = () => { item.qtyNeeded = parseInt(document.getElementById('ssCellInput').value) || 1; };
        break;
      case 'material':
        body = `<div class="form-group"><label class="form-label">Material</label><input type="text" class="form-input" id="ssCellInput" list="ssMaterialListModal" value="${escapeHTML(item.material || '')}" placeholder="e.g. 1/8&quot; Aluminum - Sheet"><datalist id="ssMaterialListModal">${SS_MATERIALS.map(m => `<option value="${m}"></option>`).join('')}</datalist></div>`;
        apply = () => { item.material = document.getElementById('ssCellInput').value.trim(); };
        break;
      case 'process':
        body = `<div class="form-group"><label class="form-label">Machine / Process</label><input type="text" class="form-input" id="ssCellInput" list="ssMachineListModal" value="${escapeHTML(item.process || '')}" placeholder="e.g. CNC Router, Lathe, Purchase"><datalist id="ssMachineListModal">${BOM_MACHINES.map(m => `<option value="${m}"></option>`).join('')}</datalist><div class="form-hint">Sets the type chip: CNC, 3D Printed, Manufacture, or COTS (Purchase).</div></div>`;
        apply = () => {
          item.process = document.getElementById('ssCellInput').value.trim();
          item.type = bomFabType(item) === 'cots' ? 'cots' : 'inhouse';
        };
        break;
      case 'partNumber':
        body = `<div class="form-group"><label class="form-label">Part Number</label><input type="text" class="form-input mono" id="ssCellInput" value="${escapeHTML(item.partNumber || '')}" placeholder="e.g. 100-001"></div>`;
        apply = () => { item.partNumber = document.getElementById('ssCellInput').value.trim(); };
        break;
      case 'comments':
        body = `<div class="form-group"><label class="form-label">Notes / Comments</label><textarea class="form-textarea" id="ssCellInput" style="min-height:70px" placeholder="Tolerances, approvals, gotchas…">${escapeHTML(item.comments || '')}</textarea></div>`;
        apply = () => { item.comments = document.getElementById('ssCellInput').value.trim(); };
        break;
      case 'projectId': {
        const fam = this.familyIds(this.scope);
        const opts = fam.map(id => {
          const pr = this.projects.find(p => p.id === id);
          return `<option value="${id}" ${id === item.projectId ? 'selected' : ''}>${escapeHTML(pr?.code ? pr.code + ' · ' + pr.name : pr?.name || '?')}${id === this.scope ? ' (main)' : ''}</option>`;
        }).join('');
        body = `<div class="form-group"><label class="form-label">Subsystem</label><select class="form-select" id="ssCellInput">${opts}</select></div>`;
        apply = () => { item.projectId = document.getElementById('ssCellInput').value; };
        break;
      }
      default:
        return;
    }

    this._editor(`Edit: ${partName}`, body, async () => {
      apply();
      await DB.put('bom_items', item);
      HistoryModule.log('update', 'bom_item', item.id, partName, `Edited ${field} via spreadsheet`);
      toast('Saved', 'success');
    });
  },

  // ── add / edit / delete items ──
  statusOptions(selected) {
    return `
      <optgroup label="Fabricated">
        ${BOM_LADDERS.inhouse.map(s => `<option value="${s}" ${selected === s ? 'selected' : ''}>${BOM_STATUS_MAP[s].label}</option>`).join('')}
      </optgroup>
      <optgroup label="Purchased">
        ${BOM_LADDERS.cots.map(s => `<option value="${s}" ${selected === s ? 'selected' : ''}>${BOM_STATUS_MAP[s].label}</option>`).join('')}
      </optgroup>
      <option value="not_used" ${selected === 'not_used' ? 'selected' : ''}>Not Used</option>
    `;
  },

  showAddModal() {
    const fam = this.familyIds(this.scope);
    const defaultSub = (this.subFilter !== 'all' && this.subFilter !== 'main' && fam.includes(this.subFilter)) ? this.subFilter : this.scope;
    const body = `
      <div class="form-group">
        <label class="form-label">Part Name</label>
        <input type="text" class="form-input" id="ssAddPartName" list="ssAddPartsList" placeholder="Type a name — new names create a new part" autocomplete="off">
        <datalist id="ssAddPartsList">${this.parts.map(p => `<option value="${escapeHTML(p.name)}"></option>`).join('')}</datalist>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Subsystem</label>
          <select class="form-select" id="ssAddSubsystem" onchange="document.getElementById('ssAddPartNumber').value = SpreadsheetModule.nextPartNumber(this.value)">
            ${fam.map(id => {
              const pr = this.projects.find(p => p.id === id);
              return `<option value="${id}" ${id === defaultSub ? 'selected' : ''}>${escapeHTML(pr?.code && pr.parentId ? pr.code + ' · ' + pr.name : pr?.name || '?')}${id === this.scope ? ' (main)' : ''}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Part Number</label>
          <input type="text" class="form-input mono" id="ssAddPartNumber" value="${this.nextPartNumber(defaultSub)}">
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Quantity</label>
          <input type="number" class="form-input" id="ssAddQty" value="1" min="1">
        </div>
        <div class="form-group">
          <label class="form-label">Machine / Process</label>
          <input type="text" class="form-input" id="ssAddProcess" list="ssAddMachineList" placeholder="e.g. CNC Router, Purchase">
          <datalist id="ssAddMachineList">${BOM_MACHINES.map(m => `<option value="${m}"></option>`).join('')}</datalist>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Material <span class="text-muted">(optional)</span></label>
        <input type="text" class="form-input" id="ssAddMaterial" list="ssAddMaterialList" placeholder="e.g. 1/8&quot; Aluminum - Sheet">
        <datalist id="ssAddMaterialList">${SS_MATERIALS.map(m => `<option value="${m}"></option>`).join('')}</datalist>
      </div>
    `;
    openModal('Add Item', body, `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="SpreadsheetModule.saveNewItem(this)">Add Item</button>
    `);
    setTimeout(() => document.getElementById('ssAddPartName')?.focus(), 60);
  },

  async saveNewItem(btn) {
    if (btn) btn.disabled = true;
    const name = document.getElementById('ssAddPartName').value.trim();
    if (!name) {
      if (btn) btn.disabled = false;
      return toast('Part name is required', 'error');
    }
    const targetProjectId = document.getElementById('ssAddSubsystem').value;
    const qtyNeeded = parseInt(document.getElementById('ssAddQty').value) || 1;
    const process = document.getElementById('ssAddProcess').value.trim();
    const fab = bomFabType({ process, type: 'inhouse' });

    try {
      // Reuse an existing part with this exact name, or create one
      let part = this.parts.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (!part) {
        const proj = this.projects.find(p => p.id === targetProjectId);
        const partId = await DB.add('parts', {
          name, category: proj?.name || '', description: '',
          vendorId: null, assigneeId: null, locationId: null, containerId: null,
          unitCost: 0, inStock: 0, needed: qtyNeeded, photo: null, onshapeUrl: null, drawings: []
        });
        part = { id: partId, name };
        HistoryModule.log('create', 'part', partId, name);
      }

      const newId = await DB.add('bom_items', {
        projectId: targetProjectId,
        partId: part.id,
        qtyNeeded,
        status: fab === 'cots' ? 'not_started' : 'design',
        type: fab === 'cots' ? 'cots' : 'inhouse',
        material: document.getElementById('ssAddMaterial').value.trim(),
        process,
        partNumber: document.getElementById('ssAddPartNumber').value.trim() || this.nextPartNumber(targetProjectId),
        comments: ''
      });
      HistoryModule.log('create', 'bom_item', newId || 'new', name);
      toast('Item added', 'success');
      closeModal();
      await this.loadData();
      this.renderRows();
    } catch (err) {
      if (btn) btn.disabled = false;
      toast('Error adding item', 'error');
    }
  },

  showEditModal(id) {
    const item = this.boms.find(b => b.id === id);
    if (!item) return;
    const part = this.parts.find(p => p.id === item.partId);
    const fam = this.familyIds(this.scope);

    const body = `
      <div class="form-group">
        <label class="form-label">Part</label>
        <input type="text" class="form-input" value="${escapeHTML(part ? part.name : 'Unknown')}" disabled>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Subsystem</label>
          <select class="form-select" id="editBomProject">
            ${fam.map(fid => {
              const pr = this.projects.find(p => p.id === fid);
              return `<option value="${fid}" ${fid === item.projectId ? 'selected' : ''}>${escapeHTML(pr?.code && pr.parentId ? pr.code + ' · ' + pr.name : pr?.name || '?')}${fid === this.scope ? ' (main)' : ''}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Part Number</label>
          <input type="text" class="form-input mono" id="editBomPartNumber" value="${escapeHTML(item.partNumber || '')}">
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Quantity Needed</label>
          <input type="number" class="form-input" id="editBomQty" value="${item.qtyNeeded}" min="1">
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="editBomStatus">${this.statusOptions(item.status || 'design')}</select>
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Material</label>
          <input type="text" class="form-input" id="editBomMaterial" list="editBomMaterialList" value="${escapeHTML(item.material || '')}">
          <datalist id="editBomMaterialList">${SS_MATERIALS.map(m => `<option value="${m}"></option>`).join('')}</datalist>
        </div>
        <div class="form-group">
          <label class="form-label">Machine / Process</label>
          <input type="text" class="form-input" id="editBomProcess" list="editBomMachineList" value="${escapeHTML(item.process || '')}">
          <datalist id="editBomMachineList">${BOM_MACHINES.map(m => `<option value="${m}"></option>`).join('')}</datalist>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notes / Comments</label>
        <textarea class="form-textarea" id="editBomComments" style="min-height:60px" placeholder="Tolerances, approvals, gotchas…">${escapeHTML(item.comments || '')}</textarea>
      </div>
    `;
    openModal('Edit Item', body, `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="SpreadsheetModule.updateItem('${id}', this)">Save Changes</button>
    `);
  },

  async updateItem(id, btn) {
    if (btn) btn.disabled = true;
    const item = this.boms.find(b => b.id === id);
    item.projectId = document.getElementById('editBomProject').value;
    item.partNumber = document.getElementById('editBomPartNumber').value.trim();
    item.qtyNeeded = parseInt(document.getElementById('editBomQty').value) || 1;
    item.status = document.getElementById('editBomStatus').value;
    item.material = document.getElementById('editBomMaterial').value.trim();
    item.process = document.getElementById('editBomProcess').value.trim();
    item.comments = document.getElementById('editBomComments').value.trim();
    item.type = bomFabType(item) === 'cots' ? 'cots' : 'inhouse';

    try {
      await DB.put('bom_items', item);
      const part = this.parts.find(p => p.id === item.partId);
      HistoryModule.log('update', 'bom_item', id, part ? part.name : 'Unknown Part', `Status: ${item.status}, Qty: ${item.qtyNeeded}`);
      toast('Item updated', 'success');
      closeModal();
      await this.loadData();
      this.renderRows();
    } catch (err) {
      if (btn) btn.disabled = false;
      toast('Error updating item', 'error');
    }
  },

  async deleteItem(id) {
    const item = this.boms.find(b => b.id === id);
    if (!item || !confirm('Remove this item from the spreadsheet?')) return;
    await DB.delete('bom_items', id);
    const part = this.parts.find(p => p.id === item.partId);
    HistoryModule.log('delete', 'bom_item', id, part ? part.name : 'Unknown Part');
    toast('Item removed', 'success');
    await this.loadData();
    this.renderRows();
  },

  // ── export / import / auto-number ──
  exportRows() {
    return this.filteredItems().map(({ b, part, proj }) => ({
      status: BOM_STATUS_MAP[b.status]?.label || b.status,
      partNumber: b.partNumber || '',
      name: part?.name || 'Unknown',
      subsystem: b.projectId === this.scope ? 'Main' : (proj?.name || ''),
      type: BOM_FAB_TYPES[bomFabType(b)].label,
      material: b.material || '',
      machine: b.process || '',
      qty: b.qtyNeeded,
      inStock: part?.inStock || 0,
      unitCost: part?.unitCost || 0,
      location: part ? (this.locations.find(l => l.id === part.locationId)?.name || '') : '',
      notes: b.comments || ''
    }));
  },

  scopeFileName(ext) {
    const scopeName = this.projects.find(p => p.id === this.scope)?.name || 'project';
    return `${scopeName.replace(/\s+/g, '-').toLowerCase()}-master-spreadsheet.${ext}`;
  },

  exportCSV() {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    let csv = 'Status,Part Number,Part Name,Subsystem,Type,Material,Machine,Qty,In Stock,Unit Cost,Location,Notes\n';
    this.exportRows().forEach(r => {
      csv += [r.status, r.partNumber, r.name, r.subsystem, r.type, r.material, r.machine, r.qty, r.inStock, r.unitCost, r.location, r.notes].map(esc).join(',') + '\n';
    });
    downloadFile(this.scopeFileName('csv'), csv, 'text/csv');
    toast('CSV exported', 'success');
  },

  exportJSON() {
    downloadFile(this.scopeFileName('json'), JSON.stringify(this.exportRows(), null, 2), 'application/json');
    toast('JSON exported', 'success');
  },

  _statusKeyFromLabel(label) {
    const l = String(label || '').toLowerCase().trim();
    const hit = Object.entries(BOM_STATUS_MAP).find(([k, v]) => v.label.toLowerCase() === l || k === l);
    return hit ? hit[0] : null;
  },

  async importFile(kind) {
    const file = await pickFile(kind === 'csv' ? '.csv' : '.json');
    if (!file) return;
    try {
      const text = await file.text();
      let rows = [];
      if (kind === 'csv') {
        const parsed = parseCSV(text);
        if (parsed.length < 2) return toast('CSV has no data rows', 'error');
        const header = parsed[0].map(h => h.toLowerCase().trim());
        const col = (names) => header.findIndex(h => names.some(n => h.includes(n)));
        const ci = {
          status: col(['status']), partNumber: col(['part number', 'part #', 'part no']),
          name: col(['part name', 'name']), subsystem: col(['subsystem', 'sub']),
          material: col(['material']), machine: col(['machine', 'process']),
          qty: col(['qty', 'quantity']), inStock: col(['in stock', 'stock']),
          unitCost: col(['cost']), notes: col(['notes', 'comment'])
        };
        if (ci.name === -1) return toast('CSV needs a "Part Name" column', 'error');
        rows = parsed.slice(1).map(r => ({
          status: r[ci.status], partNumber: r[ci.partNumber], name: r[ci.name], subsystem: r[ci.subsystem],
          material: r[ci.material], machine: r[ci.machine], qty: r[ci.qty], inStock: r[ci.inStock],
          unitCost: r[ci.unitCost], notes: r[ci.notes]
        }));
      } else {
        const data = JSON.parse(text);
        rows = Array.isArray(data) ? data : (data.items || []);
      }

      const fam = this.familyIds(this.scope);
      const famProjects = fam.map(id => this.projects.find(p => p.id === id)).filter(Boolean);
      const findSub = (label) => {
        const l = String(label || '').toLowerCase().trim();
        if (!l || l === 'main') return this.scope;
        const hit = famProjects.find(p => p.name.toLowerCase() === l || String(p.code) === l);
        return hit ? hit.id : this.scope;
      };

      let added = 0, updated = 0;
      for (const r of rows) {
        const name = (r.name || '').trim();
        if (!name) continue;
        const projectId = findSub(r.subsystem);
        const machine = (r.machine ?? r.process ?? '').toString().trim();
        const pn = (r.partNumber || '').trim();

        // Part: reuse by name, else create
        let part = this.parts.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (!part) {
          const proj = this.projects.find(p => p.id === projectId);
          const partId = await DB.add('parts', {
            name, category: proj?.name || '', description: '',
            locationId: null, containerId: null, unitCost: parseFloat(r.unitCost) || 0,
            inStock: parseInt(r.inStock) || 0, needed: parseInt(r.qty) || 0,
            photo: null, onshapeUrl: null, drawings: []
          });
          part = { id: partId, name };
          this.parts.push(part);
        } else {
          let changed = false;
          if (r.inStock !== undefined && r.inStock !== '' && !isNaN(parseInt(r.inStock))) { part.inStock = parseInt(r.inStock); changed = true; }
          if (r.unitCost !== undefined && r.unitCost !== '' && !isNaN(parseFloat(r.unitCost))) { part.unitCost = parseFloat(r.unitCost); changed = true; }
          if (changed) await DB.put('parts', part);
        }

        // Item: match by part number within scope, else by part within scope, else create
        let item = pn ? this.boms.find(b => fam.includes(b.projectId) && (b.partNumber || '') === pn) : null;
        if (!item) item = this.boms.find(b => fam.includes(b.projectId) && b.partId === part.id);

        const statusKey = this._statusKeyFromLabel(r.status);
        const fields = {
          projectId,
          partId: part.id,
          qtyNeeded: parseInt(r.qty) || item?.qtyNeeded || 1,
          material: (r.material ?? item?.material ?? '').toString().trim(),
          process: machine || item?.process || '',
          partNumber: pn || item?.partNumber || this.nextPartNumber(projectId),
          comments: (r.notes ?? item?.comments ?? '').toString().trim()
        };
        fields.type = bomFabType(fields) === 'cots' ? 'cots' : 'inhouse';
        fields.status = statusKey || item?.status || (fields.type === 'cots' ? 'not_started' : 'design');

        if (item) {
          Object.assign(item, fields);
          await DB.put('bom_items', item);
          updated++;
        } else {
          const newItem = { ...fields };
          const newId = await DB.add('bom_items', newItem);
          this.boms.push({ ...newItem, id: newId });
          added++;
        }
      }
      HistoryModule.log('update', 'bom_item', 'import', 'Spreadsheet import', `${added} added, ${updated} updated`);
      toast(`Imported: ${added} added, ${updated} updated`, 'success');
      await this.loadData();
      this.renderRows();
    } catch (err) {
      console.error(err);
      toast('Import failed: ' + err.message, 'error');
    }
  },

  // Assign part numbers to items that don't have one — never touches existing IDs
  async autoNumberMissing() {
    const fam = this.familyIds(this.scope);
    const missing = this.boms.filter(b => fam.includes(b.projectId) && !(b.partNumber || '').trim());
    if (missing.length === 0) return toast('Every item already has a part number', 'info');

    // Track the running max per subsystem so consecutive assignments don't collide
    const counters = {};
    const maxFor = (projectId) => {
      if (counters[projectId] === undefined) {
        let max = 0;
        this.boms.filter(b => b.projectId === projectId).forEach(b => {
          const m = /^\d+-(\d+)$/.exec(b.partNumber || '');
          if (m) max = Math.max(max, parseInt(m[1]));
        });
        counters[projectId] = max;
      }
      return ++counters[projectId];
    };

    for (const item of missing) {
      const proj = this.projects.find(p => p.id === item.projectId);
      const code = proj?.code || '000';
      item.partNumber = `${code}-${String(maxFor(item.projectId)).padStart(3, '0')}`;
      await DB.put('bom_items', item);
    }
    HistoryModule.log('update', 'bom_item', 'autonumber', 'Auto-number', `${missing.length} items numbered`);
    toast(`Numbered ${missing.length} item${missing.length === 1 ? '' : 's'}`, 'success');
    await this.loadData();
    this.renderRows();
  }
};

window.SpreadsheetModule = SpreadsheetModule;
