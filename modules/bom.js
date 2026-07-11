// bom.js — FRC-style part tracking
// Common shop machines/processes. Free text is still allowed via the datalist input.
const BOM_MACHINES = ['CNC Router', 'CNC Mill', 'Lathe', 'Manual Mill', '3D Printer', 'Laser Cut', 'Saw', 'Drill Press', 'Sheet Metal / Bend', 'Weld', 'Hand Tools', 'Purchase'];
const BOM_MACHINE_DATALIST = `<datalist id="bomMachineList">${BOM_MACHINES.map(m => `<option value="${m}"></option>`).join('')}</datalist>`;

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

function getPartNumberChip(pn) {
  return pn ? `<span class="pn mono">${escapeHTML(pn)}</span>` : '<span class="text-muted">—</span>';
}

const BomModule = {
  typeFilter: 'all', // all | cnc | print | manufacture | cots
  pendingProject: null, // set by other views before navigate('bom')

  async render(container) {
    this.container = container;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    [this.projects, this.parts, this.boms, this.people] = await Promise.all([
      DB.getAll('projects'),
      DB.getAll('parts'),
      DB.getAll('bom_items'),
      DB.getAll('users')
    ]);
  },

  // Family = a project plus its subsystems (one level deep)
  familyIds(projectId) {
    return [projectId, ...this.projects.filter(p => p.parentId === projectId).map(p => p.id)];
  },

  currentProjectId() {
    return document.getElementById('bomProjectSelect')?.value || null;
  },

  projectLabel(p) {
    return (p.code ? p.code + ' · ' : '') + p.name;
  },

  projectOptionsHTML(selectedId) {
    const tops = this.projects.filter(p => !p.parentId);
    let html = '';
    tops.forEach(p => {
      const subs = this.projects.filter(s => s.parentId === p.id);
      if (subs.length) {
        html += `<optgroup label="${escapeHTML(p.name)}">`;
        html += `<option value="${p.id}" ${selectedId === p.id ? 'selected' : ''}>${escapeHTML(p.name)} — all systems</option>`;
        subs.forEach(s => {
          html += `<option value="${s.id}" ${selectedId === s.id ? 'selected' : ''}>&nbsp;&nbsp;↳ ${escapeHTML(this.projectLabel(s))}</option>`;
        });
        html += `</optgroup>`;
      } else {
        html += `<option value="${p.id}" ${selectedId === p.id ? 'selected' : ''}>${escapeHTML(p.name)}</option>`;
      }
    });
    return html;
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
    const preselect = this.pendingProject && this.projects.find(p => p.id === this.pendingProject) ? this.pendingProject : null;
    this.pendingProject = null;

    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <select class="form-select" id="bomProjectSelect" style="width:250px" aria-label="Select project or subsystem">
            <option value="">-- Select a Project --</option>
            ${this.projectOptionsHTML(preselect)}
          </select>
        </div>
        <div class="toolbar-right" id="bomActions" style="display:none">
          <button class="btn btn-secondary" id="sheetBomBtn"><i class="fa-solid fa-table-cells"></i> Spreadsheet</button>
          <button class="btn btn-secondary" id="exportBomBtn"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
          <button class="btn btn-secondary" id="importBomBtn"><i class="fa-solid fa-file-import"></i> Add All from Project</button>
          <button class="btn btn-primary" id="addBomItemBtn"><i class="fa-solid fa-plus"></i> Add Item</button>
        </div>
      </div>
      <div id="bomContent">
        <div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><h3>Select a project</h3><p>Choose a project or subsystem from the dropdown to view its BOM.</p></div>
      </div>
    `;

    document.getElementById('bomProjectSelect').addEventListener('change', (e) => this.renderBomForProject(e.target.value));
    if (preselect) this.renderBomForProject(preselect);
  },

  renderBomForProject(projectId) {
    if (!projectId) {
      document.getElementById('bomActions').style.display = 'none';
      document.getElementById('bomContent').innerHTML = '<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><h3>Select a project</h3><p>Choose a project from the dropdown to view its BOM.</p></div>';
      return;
    }

    document.getElementById('bomActions').style.display = '';
    document.getElementById('addBomItemBtn').onclick = () => this.showAddModal(projectId);
    document.getElementById('exportBomBtn').onclick = () => this.exportCSV(projectId);
    document.getElementById('importBomBtn').onclick = () => this.showImportAllFromProjectModal(projectId);
    document.getElementById('sheetBomBtn').onclick = () => { SpreadsheetModule.pendingScope = projectId; navigate('spreadsheet'); };

    const fam = this.familyIds(projectId);
    const isParent = fam.length > 1;
    const allItems = this.boms.filter(b => fam.includes(b.projectId));

    if (allItems.length === 0) {
      document.getElementById('bomContent').innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-clipboard-list"></i>
          <h3>No BOM items yet</h3>
          <p>Add parts this ${isParent ? 'project or its subsystems need' : 'system needs'}, then track each one through the shop.</p>
          <button class="btn btn-primary" onclick="BomModule.showAddModal('${projectId}')"><i class="fa-solid fa-plus"></i> Add First Item</button>
        </div>`;
      return;
    }

    // Stats always computed on the FULL list; filter only affects rows
    let totalCost = 0;
    let doneCount = 0;
    let notUsedCount = 0;
    const fabCounts = { cnc: 0, print: 0, manufacture: 0, cots: 0 };
    allItems.forEach(b => {
      const part = this.parts.find(p => p.id === b.partId);
      totalCost += part ? (part.unitCost || 0) * b.qtyNeeded : 0;
      if (BOM_DONE_STATUSES.includes(b.status)) doneCount++;
      if (b.status === 'not_used') notUsedCount++;
      fabCounts[bomFabType(b)]++;
    });
    const activeCount = allItems.length - notUsedCount;
    const pct = activeCount ? Math.round((doneCount / activeCount) * 100) : 0;

    const items = (this.typeFilter === 'all' ? allItems : allItems.filter(b => bomFabType(b) === this.typeFilter))
      .slice()
      .sort((a, b) => (a.partNumber || '￿').localeCompare(b.partNumber || '￿', undefined, { numeric: true }));

    const rows = items.map(b => {
      const part = this.parts.find(p => p.id === b.partId);
      const st = BOM_STATUS_MAP[b.status] || BOM_STATUS_MAP[bomLadder(b)[0]];
      const isDone = BOM_DONE_STATUSES.includes(b.status);
      const isNotUsed = b.status === 'not_used';
      const ladder = bomLadder(b);
      const idx = ladder.indexOf(b.status);
      const nextLabel = idx >= 0 && idx < ladder.length - 1 ? BOM_STATUS_MAP[ladder[idx + 1]].label : null;

      // Color the part by how short we are (skip once done / not used)
      const inStock = part ? (part.inStock || 0) : 0;
      const short = !isDone && !isNotUsed && inStock < b.qtyNeeded;
      const critical = short && inStock === 0;
      const nameCls = critical ? 'part-name-low' : short ? 'part-name-warn' : '';
      const rowCls = (critical ? 'row-stock-low' : short ? 'row-stock-warn' : '') + (isNotUsed ? ' row-not-used' : '');
      const subProj = this.projects.find(p => p.id === b.projectId);
      const subCell = isParent ? `<td data-label="Subsystem"><span class="chip"><i class="fa-solid fa-diagram-project" aria-hidden="true"></i>${b.projectId === projectId ? 'Main' : escapeHTML(subProj?.name || '?')}</span></td>` : '';

      return `
        <tr class="${rowCls}">
          <td data-label="Part #">${getPartNumberChip(b.partNumber)}</td>
          <td data-label="Part"><span class="${nameCls}">${escapeHTML(part ? part.name : 'Unknown Part')}</span></td>
          ${subCell}
          <td data-label="Type">${getFabChip(b)}</td>
          <td data-label="Material">${getMaterialChip(b.material)}</td>
          <td data-label="Machine">${getProcessChip(b.process)}</td>
          <td data-label="Qty" class="text-right">${b.qtyNeeded}</td>
          <td data-label="Stock">${part ? getStockChip(inStock, b.qtyNeeded, part.id) : '—'}</td>
          <td data-label="Assigned">${b.assignee ? `<span class="text-sm">${escapeHTML(b.assignee)}</span>` : '<span class="text-muted">—</span>'}</td>
          <td data-label="Verified">
            <button class="verify-chip ${b.verified ? 'on' : ''}" onclick="BomModule.toggleVerified('${b.id}')" title="${b.verified ? 'Verified — click to unverify' : 'Not verified — click to verify'}" aria-label="Toggle verified">
              <i class="fa-solid ${b.verified ? 'fa-check' : 'fa-minus'}" aria-hidden="true"></i>
            </button>
          </td>
          <td data-label="Status">
            <button class="badge badge-${st.class} bom-status-btn" title="${nextLabel ? 'Click to advance to ' + nextLabel : (isNotUsed ? 'Marked not used' : 'Done!')}" onclick="BomModule.advanceStatus('${b.id}')">${st.label}${nextLabel ? ' <i class="fa-solid fa-angle-right" style="font-size:9px;opacity:0.7"></i>' : ''}</button>
          </td>
          <td data-label="Actions" class="text-right">
            ${b.comments ? `<button class="btn-icon btn-sm" title="${escapeHTML(b.comments)}" aria-label="View comment" onclick="BomModule.showComment('${b.id}')"><i class="fa-solid fa-comment" aria-hidden="true"></i></button>` : ''}
            <button class="btn-icon btn-sm" onclick="BomModule.showEditModal('${b.id}')" title="Edit" aria-label="Edit BOM item"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
            <button class="btn-icon btn-sm" style="color:var(--red)" onclick="BomModule.deleteItem('${b.id}')" title="Remove" aria-label="Remove BOM item"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
          </td>
        </tr>
      `;
    }).join('');

    document.getElementById('bomContent').innerHTML = `
      <div class="card mb-4" style="padding:16px 20px">
        <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:12px">
          <div class="flex items-center gap-4" style="flex-wrap:wrap">
            <div><span class="text-xs text-muted">Parts</span><div style="font-size:20px;font-weight:700">${activeCount}</div></div>
            <div><span class="text-xs text-muted">Done</span><div style="font-size:20px;font-weight:700;color:var(--green)">${doneCount}</div></div>
            <div><span class="text-xs text-muted">CNC</span><div style="font-size:20px;font-weight:700;color:var(--purple)">${fabCounts.cnc}</div></div>
            <div><span class="text-xs text-muted">Manufacture</span><div style="font-size:20px;font-weight:700;color:var(--blue)">${fabCounts.manufacture}</div></div>
            <div><span class="text-xs text-muted">3D Printed</span><div style="font-size:20px;font-weight:700;color:var(--rose)">${fabCounts.print}</div></div>
            <div><span class="text-xs text-muted">COTS</span><div style="font-size:20px;font-weight:700;color:var(--cyan)">${fabCounts.cots}</div></div>
            ${totalCost > 0 ? `<div><span class="text-xs text-muted">Budget</span><div style="font-size:20px;font-weight:700">${formatCurrency(totalCost)}</div></div>` : ''}
          </div>
          <div style="min-width:180px;flex:1;max-width:320px">
            <div class="flex items-center justify-between text-xs text-muted" style="margin-bottom:4px"><span>Progress</span><span style="font-weight:700;color:var(--text-0)">${pct}%</span></div>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          </div>
        </div>
      </div>

      <div class="filter-chips mb-4">
        <button class="filter-chip ${this.typeFilter === 'all' ? 'active' : ''}" onclick="BomModule.setTypeFilter('${projectId}', 'all')">All (${allItems.length})</button>
        <button class="filter-chip ${this.typeFilter === 'cnc' ? 'active' : ''}" onclick="BomModule.setTypeFilter('${projectId}', 'cnc')">CNC (${fabCounts.cnc})</button>
        <button class="filter-chip ${this.typeFilter === 'manufacture' ? 'active' : ''}" onclick="BomModule.setTypeFilter('${projectId}', 'manufacture')">Manufacture (${fabCounts.manufacture})</button>
        <button class="filter-chip ${this.typeFilter === 'print' ? 'active' : ''}" onclick="BomModule.setTypeFilter('${projectId}', 'print')">3D Printed (${fabCounts.print})</button>
        <button class="filter-chip ${this.typeFilter === 'cots' ? 'active' : ''}" onclick="BomModule.setTypeFilter('${projectId}', 'cots')">COTS (${fabCounts.cots})</button>
      </div>

      ${items.length === 0 ? '<div class="empty-state" style="padding:30px"><p>No items match this filter.</p></div>' : `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Part #</th>
              <th>Part</th>
              ${isParent ? '<th>Subsystem</th>' : ''}
              <th>Type</th>
              <th>Material</th>
              <th>Machine</th>
              <th class="text-right">Qty</th>
              <th>Stock</th>
              <th>Assigned</th>
              <th>✓</th>
              <th>Status</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`}
    `;
  },

  setTypeFilter(projectId, filter) {
    this.typeFilter = filter;
    this.renderBomForProject(projectId);
  },

  showComment(id) {
    const item = this.boms.find(b => b.id === id);
    if (!item) return;
    const part = this.parts.find(p => p.id === item.partId);
    openModal(`Comment — ${escapeHTML(part?.name || 'Item')}`, `<p class="text-sm">${escapeHTML(item.comments || '')}</p>`, `
      <button class="btn btn-secondary" onclick="closeModal();BomModule.showEditModal('${id}')"><i class="fa-solid fa-pen"></i> Edit Item</button>
      <button class="btn btn-primary" onclick="closeModal()">Close</button>
    `);
  },

  async toggleVerified(id) {
    const item = this.boms.find(b => b.id === id);
    if (!item) return;
    item.verified = !item.verified;
    try {
      await DB.put('bom_items', item);
      const part = this.parts.find(p => p.id === item.partId);
      HistoryModule.log('update', 'bom_item', id, part?.name || 'Unknown Part', item.verified ? 'Verified' : 'Unverified');
      this.renderBomForProject(this.currentProjectId() || item.projectId);
    } catch (err) {
      toast('Error updating verified flag', 'error');
    }
  },

  async advanceStatus(id) {
    const item = this.boms.find(b => b.id === id);
    if (!item) return;
    if (item.status === 'not_used') {
      return toast('Marked "Not Used" — change it in Edit if that\'s wrong.', 'info');
    }
    const ladder = bomLadder(item);
    let idx = ladder.indexOf(item.status);
    if (idx === -1) {
      // Legacy status from the other ladder — translate by position
      const other = ladder === BOM_LADDERS.cots ? BOM_LADDERS.inhouse : BOM_LADDERS.cots;
      idx = other.indexOf(item.status);
    }
    if (idx === -1) idx = -1; // unknown → advance to first step
    if (idx >= ladder.length - 1) {
      return toast('Already done — nice work!', 'info');
    }
    item.status = ladder[idx + 1];
    try {
      await DB.put('bom_items', item);
      const part = this.parts.find(p => p.id === item.partId);
      HistoryModule.log('update', 'bom_item', id, part ? part.name : 'Unknown Part', `Status → ${BOM_STATUS_MAP[item.status].label}`);
      toast(`${part ? part.name : 'Item'}: ${BOM_STATUS_MAP[item.status].label}`, 'success');
      await this.loadData();
      this.renderBomForProject(this.currentProjectId() || item.projectId);
    } catch (err) {
      toast('Error updating status', 'error');
    }
  },

  peopleDatalist(id) {
    const names = this.people.filter(u => u.status === 'approved').map(u => u.name);
    return `<datalist id="${id}">${names.map(n => `<option value="${escapeHTML(n)}"></option>`).join('')}</datalist>`;
  },

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

  async showAddModal(projectId) {
    const partOptions = this.parts.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
    const fam = this.familyIds(projectId);
    const subsystemGroup = fam.length > 1 ? `
      <div class="form-group">
        <label class="form-label">Subsystem</label>
        <select class="form-select" id="bomSubsystem" onchange="document.getElementById('bomPartNumber').value = BomModule.nextPartNumber(this.value)">
          ${fam.map(id => {
            const pr = this.projects.find(p => p.id === id);
            return `<option value="${id}">${escapeHTML(this.projectLabel(pr || { name: '?' }))}${id === projectId ? ' (main)' : ''}</option>`;
          }).join('')}
        </select>
      </div>` : '';

    const body = `
      <div class="form-group">
        <label class="form-label">Part</label>
        <select class="form-select" id="bomPartSelect">${partOptions}</select>
      </div>
      ${subsystemGroup}
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Part Number</label>
          <input type="text" class="form-input mono" id="bomPartNumber" value="${this.nextPartNumber(projectId)}">
          <div class="form-hint">Auto-numbered by subsystem — edit if needed.</div>
        </div>
        <div class="form-group">
          <label class="form-label">Quantity Needed</label>
          <input type="number" class="form-input" id="bomQty" value="1" min="1">
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Material <span class="text-muted">(optional)</span></label>
          <input type="text" class="form-input" id="bomMaterial" list="ssMaterialListBom" placeholder="e.g. 1/8&quot; Aluminum - Sheet">
          <datalist id="ssMaterialListBom">${(window.SS_MATERIALS || []).map(m => `<option value="${m}"></option>`).join('')}</datalist>
        </div>
        <div class="form-group">
          <label class="form-label">Machine / Process</label>
          <input type="text" class="form-input" id="bomProcess" list="bomMachineList" placeholder="e.g. CNC Router, Lathe, Purchase">
          ${BOM_MACHINE_DATALIST}
          <div class="form-hint">Sets the type chip: CNC, 3D Printed, Manufacture, or COTS (Purchase).</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Assigned To <span class="text-muted">(optional)</span></label>
        <input type="text" class="form-input" id="bomAssignee" list="bomPeopleList" placeholder="Who's making it?">
        ${this.peopleDatalist('bomPeopleList')}
      </div>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="BomModule.saveItem('${projectId}', this)">Add Item</button>
    `;
    openModal('Add BOM Item', body, footer);
  },

  async showEditModal(id) {
    const item = this.boms.find(b => b.id === id);
    if (!item) return;
    const part = this.parts.find(p => p.id === item.partId);

    const proj = this.projects.find(p => p.id === item.projectId);
    const rootId = proj?.parentId || item.projectId;
    const fam = this.familyIds(rootId);
    const subsystemGroup = fam.length > 1 ? `
      <div class="form-group">
        <label class="form-label">Subsystem</label>
        <select class="form-select" id="editBomProject">
          ${fam.map(fid => {
            const pr = this.projects.find(p => p.id === fid);
            return `<option value="${fid}" ${fid === item.projectId ? 'selected' : ''}>${escapeHTML(this.projectLabel(pr || { name: '?' }))}${fid === rootId ? ' (main)' : ''}</option>`;
          }).join('')}
        </select>
      </div>` : '';

    const body = `
      <div class="form-group">
        <label class="form-label">Part</label>
        <input type="text" class="form-input" value="${escapeHTML(part ? part.name : 'Unknown')}" disabled>
      </div>
      ${subsystemGroup}
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Part Number</label>
          <input type="text" class="form-input mono" id="editBomPartNumber" value="${escapeHTML(item.partNumber || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Quantity Needed</label>
          <input type="number" class="form-input" id="editBomQty" value="${item.qtyNeeded}" min="1">
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Material</label>
          <input type="text" class="form-input" id="editBomMaterial" value="${escapeHTML(item.material || '')}" placeholder="e.g. 1/8&quot; Aluminum - Sheet">
        </div>
        <div class="form-group">
          <label class="form-label">Machine / Process</label>
          <input type="text" class="form-input" id="editBomProcess" list="bomMachineList" value="${escapeHTML(item.process || '')}" placeholder="e.g. CNC Router, Lathe">
          ${BOM_MACHINE_DATALIST}
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Assigned To</label>
          <input type="text" class="form-input" id="editBomAssignee" list="editBomPeopleList" value="${escapeHTML(item.assignee || '')}">
          ${this.peopleDatalist('editBomPeopleList')}
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="editBomStatus">${this.statusOptions(item.status || 'design')}</select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Comments</label>
        <textarea class="form-textarea" id="editBomComments" style="min-height:60px" placeholder="Tolerances, approvals, gotchas…">${escapeHTML(item.comments || '')}</textarea>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13.5px">
          <input type="checkbox" id="editBomVerified" ${item.verified ? 'checked' : ''}> Verified (dimensions checked against drawing)
        </label>
      </div>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="BomModule.updateItem('${id}', this)">Save Changes</button>
    `;
    openModal('Edit BOM Item', body, footer);
  },

  async saveItem(projectId, btn) {
    if (btn) btn.disabled = true;
    const partId = document.getElementById('bomPartSelect').value;
    const qtyNeeded = parseInt(document.getElementById('bomQty').value) || 1;
    const targetProjectId = document.getElementById('bomSubsystem')?.value || projectId;
    if (!partId) {
      if (btn) btn.disabled = false;
      return toast('Please select a part', 'error');
    }

    const process = document.getElementById('bomProcess').value.trim();
    const fab = bomFabType({ process, type: 'inhouse' });
    try {
      const newId = await DB.add('bom_items', {
        projectId: targetProjectId, partId, qtyNeeded,
        status: fab === 'cots' ? 'not_started' : 'design',
        type: fab === 'cots' ? 'cots' : 'inhouse',
        material: document.getElementById('bomMaterial').value.trim(),
        process,
        partNumber: document.getElementById('bomPartNumber').value.trim() || this.nextPartNumber(targetProjectId),
        assignee: document.getElementById('bomAssignee').value.trim(),
        verified: false,
        comments: ''
      });
      const part = this.parts.find(p => p.id === partId);
      HistoryModule.log('create', 'bom_item', newId || 'new', part ? part.name : 'Unknown Part');

      toast('Item added to BOM', 'success');
      closeModal();
      await this.loadData();
      this.renderBomForProject(projectId);
    } catch (err) {
      if (btn) btn.disabled = false;
      toast('Error saving BOM item', 'error');
    }
  },

  async updateItem(id, btn) {
    if (btn) btn.disabled = true;
    const item = this.boms.find(b => b.id === id);
    item.qtyNeeded = parseInt(document.getElementById('editBomQty').value) || 1;
    item.status = document.getElementById('editBomStatus').value;
    item.material = document.getElementById('editBomMaterial').value.trim();
    item.process = document.getElementById('editBomProcess').value.trim();
    item.partNumber = document.getElementById('editBomPartNumber').value.trim();
    item.assignee = document.getElementById('editBomAssignee').value.trim();
    item.comments = document.getElementById('editBomComments').value.trim();
    item.verified = document.getElementById('editBomVerified').checked;
    item.type = bomFabType(item) === 'cots' ? 'cots' : 'inhouse';
    const subSel = document.getElementById('editBomProject');
    if (subSel) item.projectId = subSel.value;

    try {
      await DB.put('bom_items', item);
      const part = this.parts.find(p => p.id === item.partId);
      HistoryModule.log('update', 'bom_item', id, part ? part.name : 'Unknown Part', `Status: ${item.status}, Qty: ${item.qtyNeeded}`);
      toast('Item updated', 'success');
      closeModal();
      await this.loadData();
      this.renderBomForProject(this.currentProjectId() || item.projectId);
    } catch (err) {
      if (btn) btn.disabled = false;
      toast('Error updating item', 'error');
    }
  },

  async deleteItem(id) {
    const item = this.boms.find(b => b.id === id);
    if (!item || !confirm('Remove item from BOM?')) return;

    await DB.delete('bom_items', id);
    const part = this.parts.find(p => p.id === item.partId);
    HistoryModule.log('delete', 'bom_item', id, part ? part.name : 'Unknown Part');
    toast('Item removed', 'success');
    await this.loadData();
    this.renderBomForProject(this.currentProjectId() || item.projectId);
  },

  exportCSV(projectId) {
    const fam = this.familyIds(projectId);
    const items = this.boms.filter(b => fam.includes(b.projectId))
      .slice()
      .sort((a, b) => (a.partNumber || '￿').localeCompare(b.partNumber || '￿', undefined, { numeric: true }));
    const p = this.projects.find(x => x.id === projectId);

    let csv = 'Part Number,Part Name,Subsystem,Type,Assigned To,Qty,In Stock,Material,Primary Machine,Verified,Status,Comments\n';
    const esc = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
    items.forEach(b => {
      const part = this.parts.find(pt => pt.id === b.partId);
      const sub = b.projectId === projectId ? 'Main' : (this.projects.find(x => x.id === b.projectId)?.name || '');
      csv += [
        esc(b.partNumber), esc(part ? part.name : 'Unknown'), esc(sub),
        esc(BOM_FAB_TYPES[bomFabType(b)].label), esc(b.assignee), b.qtyNeeded,
        part ? part.inStock || 0 : 0, esc(b.material), esc(b.process),
        b.verified ? 'TRUE' : 'FALSE', esc(BOM_STATUS_MAP[b.status]?.label || b.status), esc(b.comments)
      ].join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BOM_${p ? p.name : 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async showImportAllFromProjectModal(projectId) {
    const otherProjects = this.projects.filter(p => p.id !== projectId);
    if (otherProjects.length === 0) {
      return toast('No other projects available to import from', 'error');
    }
    const projOptions = otherProjects.map(p => `<option value="${p.id}">${escapeHTML(this.projectLabel(p))}</option>`).join('');

    const body = `
      <div class="form-group">
        <label class="form-label">Source Project</label>
        <select class="form-select" id="importBomSourceProjectSelect">${projOptions}</select>
      </div>
      <p class="text-sm text-muted">This will copy all BOM items from the selected project into the current project. Existing items in this project's BOM will not be duplicated.</p>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="BomModule.importAllFromProject('${projectId}', this)">Import Items</button>
    `;
    openModal('Add All from Project', body, footer);
  },

  async importAllFromProject(targetProjectId, btn) {
    if (btn) btn.disabled = true;
    const sourceProjectId = document.getElementById('importBomSourceProjectSelect').value;
    if (!sourceProjectId) {
      if (btn) btn.disabled = false;
      return toast('Please select a source project', 'error');
    }

    try {
      const sourceItems = this.boms.filter(b => b.projectId === sourceProjectId);
      const targetItems = this.boms.filter(b => b.projectId === targetProjectId);
      const targetPartIds = new Set(targetItems.map(b => b.partId));

      let addedCount = 0;
      for (const item of sourceItems) {
        if (!targetPartIds.has(item.partId)) {
          const fab = bomFabType(item);
          const pn = this.nextPartNumber(targetProjectId);
          const newItem = {
            projectId: targetProjectId,
            partId: item.partId,
            qtyNeeded: item.qtyNeeded,
            status: fab === 'cots' ? 'not_started' : 'design',
            type: item.type || 'cots',
            material: item.material || '',
            process: item.process || '',
            partNumber: pn,
            assignee: '',
            verified: false,
            comments: ''
          };
          const newId = await DB.add('bom_items', newItem);
          this.boms.push({ ...newItem, id: newId }); // so nextPartNumber sees it this loop
          const part = this.parts.find(p => p.id === item.partId);
          if (window.HistoryModule) {
            HistoryModule.log('create', 'bom_item', newId || 'new', part ? part.name : 'Unknown Part');
          }
          addedCount++;
        }
      }

      toast(`Successfully imported ${addedCount} items!`, 'success');
      closeModal();
      await this.loadData();
      this.renderBomForProject(targetProjectId);
    } catch (err) {
      console.error(err);
      if (btn) btn.disabled = false;
      toast('Failed to import items', 'error');
    }
  }
};
