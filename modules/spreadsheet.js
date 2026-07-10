// spreadsheet.js — chip-oriented editable spreadsheet with Master / per-subsystem scopes
const SS_MATERIALS = ['6061-T6 Aluminum', '7075 Aluminum', 'Polycarbonate', 'Delrin / Acetal', 'ABS', 'PLA', 'PETG', 'Steel', 'HDPE', 'Plywood', 'Carbon Fiber'];
const SS_MATERIAL_DATALIST = `<datalist id="ssMaterialList">${SS_MATERIALS.map(m => `<option value="${m}"></option>`).join('')}</datalist>`;

const SpreadsheetModule = {
  scope: 'all',        // 'all' | projectId (top-level project or subsystem)
  pendingScope: null,  // set by other views before navigate('spreadsheet')

  async render(container) {
    this.container = container;
    this.container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading Spreadsheet...</p></div>`;
    await this.loadData();
    if (this.pendingScope) { this.scope = this.pendingScope; this.pendingScope = null; }
    if (this.scope !== 'all' && !this.projects.find(p => p.id === this.scope)) this.scope = 'all';
    this.renderView();
  },

  async loadData() {
    [this.parts, this.vendors, this.locations, this.people, this.projects, this.boms] = await Promise.all([
      DB.getAll('parts'),
      DB.getAll('vendors'),
      DB.getAll('locations'),
      DB.getAll('users'),
      DB.getAll('projects'),
      DB.getAll('bom_items')
    ]);
  },

  // Scope helpers -----------------------------------------------------------

  scopeOptionsHTML() {
    const tops = this.projects.filter(p => !p.parentId);
    let html = `<option value="all" ${this.scope === 'all' ? 'selected' : ''}>Master — All Parts</option>`;
    tops.forEach(p => {
      const subs = this.projects.filter(s => s.parentId === p.id);
      if (subs.length) {
        html += `<optgroup label="${escapeHTML(p.name)}">`;
        html += `<option value="${p.id}" ${this.scope === p.id ? 'selected' : ''}>${escapeHTML(p.name)} — all systems</option>`;
        subs.forEach(s => {
          html += `<option value="${s.id}" ${this.scope === s.id ? 'selected' : ''}>&nbsp;&nbsp;↳ ${escapeHTML(s.name)}</option>`;
        });
        html += `</optgroup>`;
      } else {
        html += `<option value="${p.id}" ${this.scope === p.id ? 'selected' : ''}>${escapeHTML(p.name)}</option>`;
      }
    });
    return html;
  },

  scopeFamilyIds() {
    // The scoped project plus its subsystems (one level deep)
    return [this.scope, ...this.projects.filter(p => p.parentId === this.scope).map(p => p.id)];
  },

  renderView() {
    const scoped = this.scope !== 'all';
    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <select class="form-select" id="ssScope" style="width:230px" aria-label="Spreadsheet scope">
            ${this.scopeOptionsHTML()}
          </select>
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input type="text" id="ssSearch" placeholder="Search parts...">
          </div>
        </div>
        <div class="toolbar-right">
          <span class="text-xs text-muted" id="ssCount"></span>
          ${scoped ? `<button class="btn btn-secondary btn-sm" onclick="BomModule.pendingProject=SpreadsheetModule.scope;navigate('bom')"><i class="fa-solid fa-clipboard-list"></i> Open BOM</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="SpreadsheetModule.exportCSV()"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
        </div>
      </div>
      <div class="table-wrap" id="ssTableWrap" style="max-height:calc(100vh - 190px); overflow-y:auto;"></div>
      ${SS_MATERIAL_DATALIST}
    `;

    document.getElementById('ssScope').addEventListener('change', (e) => {
      this.scope = e.target.value;
      this.renderView();
    });
    document.getElementById('ssSearch').addEventListener('input', debounce(() => this.renderRows(), 150));
    this.renderRows();
  },

  renderRows() {
    const q = (document.getElementById('ssSearch')?.value || '').toLowerCase();
    if (this.scope === 'all') this.renderMasterRows(q);
    else this.renderScopedRows(q);
  },

  // Chip builders ------------------------------------------------------------

  chip(label, icon, onclick, title) {
    const empty = !label;
    return `<button class="ss-chip ${empty ? 'ss-chip-empty' : ''}" onclick="${onclick}" title="${title || 'Click to edit'}">
      ${icon ? `<i class="fa-solid ${icon}" aria-hidden="true"></i>` : ''}${empty ? '+' : escapeHTML(label)}
    </button>`;
  },

  nameCell(p) {
    const th = window.__stockThresholds || { high: 80, medium: 50, low: 10 };
    const perc = (p.needed || 0) ? ((p.inStock || 0) / p.needed) * 100 : 100;
    const nameCls = perc < th.low ? 'part-name-low' : perc < th.medium ? 'part-name-warn' : '';
    return `<button class="ss-name ${nameCls}" onclick="navigate('parts').then(()=>PartsModule.showPartDetail('${p.id}'))" title="Open part details">${escapeHTML(p.name)}</button>`;
  },

  // Master scope: every part, every field editable ---------------------------

  renderMasterRows(q) {
    const wrap = document.getElementById('ssTableWrap');
    const filtered = this.parts
      .filter(p => p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));

    document.getElementById('ssCount').textContent = `${filtered.length} parts`;

    if (filtered.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><i class="fa-solid fa-table-cells"></i><h3>No parts found</h3><p>Adjust your search, or add parts in the Parts Library.</p></div>`;
      return;
    }

    wrap.innerHTML = `
      <table class="spreadsheet-table" style="white-space:nowrap; width:max-content; min-width:100%;">
        <thead style="position:sticky; top:0; z-index:10; box-shadow:0 1px 0 var(--border);">
          <tr>
            <th>Part</th>
            <th>Category</th>
            <th>Stock</th>
            <th>Cost</th>
            <th>Value</th>
            <th>Vendor</th>
            <th>Location</th>
            <th>Container</th>
            <th>Assignee</th>
            <th>CAD</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(p => {
            const vendor = this.vendors.find(v => v.id === p.vendorId);
            const loc = this.locations.find(l => l.id === p.locationId);
            const assignee = this.people.find(u => u.id === p.assigneeId || u.uid === p.assigneeId);
            const totalVal = (p.inStock || 0) * (p.unitCost || 0);
            const e = (f) => `SpreadsheetModule.editPartCell('${p.id}','${f}')`;
            return `
              <tr>
                <td>${this.nameCell(p)}</td>
                <td>${this.chip(p.category, null, e('category'))}</td>
                <td>${getStockChip(p.inStock || 0, p.needed || 0, p.id)}</td>
                <td>${this.chip(p.unitCost != null && p.unitCost !== 0 ? formatCurrency(p.unitCost) : '', null, e('unitCost'))}</td>
                <td class="text-muted">${formatCurrency(totalVal)}</td>
                <td>${this.chip(vendor?.name, 'fa-store', e('vendorId'))}</td>
                <td>${this.chip(loc?.name, 'fa-location-dot', e('locationId'))}</td>
                <td>${this.chip(p.containerId, 'fa-box', e('containerId'))}</td>
                <td>${this.chip(assignee?.name, 'fa-user', e('assigneeId'))}</td>
                <td>${this.chip(p.onshapeUrl ? 'CAD' : '', 'fa-cube', e('onshapeUrl'))}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  },

  // Project / subsystem scope: BOM-driven rows, FRCBOM-style -----------------

  renderScopedRows(q) {
    const wrap = document.getElementById('ssTableWrap');
    const fam = this.scopeFamilyIds();
    const isParent = fam.length > 1;

    let items = this.boms.filter(b => fam.includes(b.projectId));
    items = items.map(b => ({ b, part: this.parts.find(p => p.id === b.partId) }))
      .filter(({ part }) => !q || (part && part.name.toLowerCase().includes(q)))
      .sort((x, y) => (x.part?.name || '').localeCompare(y.part?.name || ''));

    document.getElementById('ssCount').textContent = `${items.length} items`;

    if (items.length === 0) {
      const proj = this.projects.find(p => p.id === this.scope);
      wrap.innerHTML = `<div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><h3>No BOM items</h3><p>${escapeHTML(proj?.name || 'This system')} has no BOM items yet. Add them from the Bill of Materials page.</p><button class="btn btn-primary" onclick="BomModule.pendingProject=SpreadsheetModule.scope;navigate('bom')"><i class="fa-solid fa-clipboard-list"></i> Open BOM</button></div>`;
      return;
    }

    wrap.innerHTML = `
      <table class="spreadsheet-table" style="white-space:nowrap; width:max-content; min-width:100%;">
        <thead style="position:sticky; top:0; z-index:10; box-shadow:0 1px 0 var(--border);">
          <tr>
            <th>Part</th>
            ${isParent ? '<th>Subsystem</th>' : ''}
            <th>Type</th>
            <th>Material</th>
            <th>Machine</th>
            <th>Qty</th>
            <th>Stock</th>
            <th>Status</th>
            <th>Line Total</th>
            <th>Vendor</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(({ b, part }) => {
            const vendor = part ? this.vendors.find(v => v.id === part.vendorId) : null;
            const cost = part ? (part.unitCost || 0) * b.qtyNeeded : 0;
            const st = BOM_STATUS_MAP[b.status] || BOM_STATUS_MAP['not_started'];
            const isDone = b.status === 'installed';
            const inStock = part ? (part.inStock || 0) : 0;
            const short = !isDone && inStock < b.qtyNeeded;
            const critical = short && inStock === 0;
            const rowCls = critical ? 'row-stock-low' : short ? 'row-stock-warn' : '';
            const subProj = this.projects.find(p => p.id === b.projectId);
            const subLabel = b.projectId === this.scope ? 'Main' : (subProj?.name || '?');
            const eb = (f) => `SpreadsheetModule.editBomCell('${b.id}','${f}')`;
            return `
              <tr class="${rowCls}">
                <td>${part ? this.nameCell(part) : '<span class="text-muted">Unknown Part</span>'}</td>
                ${isParent ? `<td>${this.chip(subLabel, 'fa-diagram-project', eb('projectId'), 'Move to another subsystem')}</td>` : ''}
                <td><button class="badge badge-${b.type === 'inhouse' ? 'purple' : 'cyan'} bom-status-btn" onclick="SpreadsheetModule.toggleBomType('${b.id}')" title="Click to toggle COTS / In-house">${b.type === 'inhouse' ? 'In-house' : 'COTS'}</button></td>
                <td>${this.chip(b.material, 'fa-layer-group', eb('material'))}</td>
                <td>${this.chip(b.process, 'fa-gears', eb('process'))}</td>
                <td>${this.chip(String(b.qtyNeeded), null, eb('qtyNeeded'))}</td>
                <td>${part ? getStockChip(inStock, b.qtyNeeded, part.id) : '—'}</td>
                <td><button class="badge badge-${st.class} bom-status-btn" onclick="SpreadsheetModule.advanceBomStatus('${b.id}')" title="${isDone ? 'Installed — done!' : 'Click to advance status'}">${st.label}${isDone ? '' : ' <i class="fa-solid fa-angle-right" style="font-size:9px;opacity:0.7"></i>'}</button></td>
                <td class="text-muted">${formatCurrency(cost)}</td>
                <td>${part ? this.chip(vendor?.name, 'fa-store', `SpreadsheetModule.editPartCell('${part.id}','vendorId')`) : '—'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  },

  // Cell editors --------------------------------------------------------------

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
        input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } });
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
      case 'category':
        body = `<div class="form-group"><label class="form-label">Category</label><input type="text" class="form-input" id="ssCellInput" value="${escapeHTML(p.category || '')}"></div>`;
        apply = () => { p.category = document.getElementById('ssCellInput').value.trim(); };
        break;
      case 'unitCost':
        body = `<div class="form-group"><label class="form-label">Unit Cost ($)</label><input type="number" step="0.01" min="0" class="form-input" id="ssCellInput" value="${p.unitCost || ''}"></div>`;
        apply = () => { p.unitCost = parseFloat(document.getElementById('ssCellInput').value) || 0; };
        break;
      case 'onshapeUrl':
        body = `<div class="form-group"><label class="form-label">Onshape / CAD URL</label><input type="url" class="form-input" id="ssCellInput" value="${escapeHTML(p.onshapeUrl || '')}" placeholder="https://cad.onshape.com/..."></div>
          ${p.onshapeUrl ? `<a href="${escapeHTML(p.onshapeUrl)}" target="_blank" class="btn btn-secondary btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open current link</a>` : ''}`;
        apply = () => { p.onshapeUrl = document.getElementById('ssCellInput').value.trim() || null; };
        break;
      case 'vendorId':
        body = `<div class="form-group"><label class="form-label">Vendor</label>${selectHTML(this.vendors.map(v => ({ value: v.id, label: v.name })), p.vendorId)}</div>`;
        apply = () => { p.vendorId = document.getElementById('ssCellInput').value || null; };
        break;
      case 'locationId':
        body = `<div class="form-group"><label class="form-label">Location</label>${selectHTML(this.locations.map(l => ({ value: l.id, label: l.name })), p.locationId)}</div><p class="form-hint">Changing location clears the container.</p>`;
        apply = () => {
          const val = document.getElementById('ssCellInput').value || null;
          if (val !== p.locationId) p.containerId = null;
          p.locationId = val;
        };
        break;
      case 'containerId': {
        const loc = this.locations.find(l => l.id === p.locationId);
        if (!loc) return toast('Set a location first', 'error');
        body = `<div class="form-group"><label class="form-label">Container in ${escapeHTML(loc.name)}</label>${selectHTML((loc.containers || []).map(c => ({ value: c.name, label: c.name })), p.containerId)}</div>`;
        apply = () => { p.containerId = document.getElementById('ssCellInput').value || null; };
        break;
      }
      case 'assigneeId':
        body = `<div class="form-group"><label class="form-label">Assigned To</label>${selectHTML(this.people.filter(u => u.status === 'approved').map(u => ({ value: u.uid || u.id, label: u.name })), p.assigneeId, 'Unassigned')}</div>`;
        apply = () => { p.assigneeId = document.getElementById('ssCellInput').value || null; };
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
        body = `<div class="form-group"><label class="form-label">Material</label><input type="text" class="form-input" id="ssCellInput" list="ssMaterialListModal" value="${escapeHTML(item.material || '')}" placeholder="e.g. 6061-T6, Polycarb"><datalist id="ssMaterialListModal">${SS_MATERIALS.map(m => `<option value="${m}"></option>`).join('')}</datalist></div>`;
        apply = () => { item.material = document.getElementById('ssCellInput').value.trim(); };
        break;
      case 'process':
        body = `<div class="form-group"><label class="form-label">Machine / Process</label><input type="text" class="form-input" id="ssCellInput" list="ssMachineListModal" value="${escapeHTML(item.process || '')}" placeholder="e.g. CNC Mill, 3D Print"><datalist id="ssMachineListModal">${BOM_MACHINES.map(m => `<option value="${m}"></option>`).join('')}</datalist></div>`;
        apply = () => { item.process = document.getElementById('ssCellInput').value.trim(); };
        break;
      case 'projectId': {
        const proj = this.projects.find(p => p.id === item.projectId);
        const rootId = proj?.parentId || item.projectId;
        const fam = [rootId, ...this.projects.filter(p => p.parentId === rootId).map(p => p.id)];
        const opts = fam.map(id => {
          const pr = this.projects.find(p => p.id === id);
          return `<option value="${id}" ${id === item.projectId ? 'selected' : ''}>${escapeHTML(pr?.name || '?')}${id === rootId ? ' (main)' : ''}</option>`;
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

  async toggleBomType(itemId) {
    const item = this.boms.find(b => b.id === itemId);
    if (!item) return;
    item.type = (item.type || 'cots') === 'cots' ? 'inhouse' : 'cots';
    try {
      await DB.put('bom_items', item);
      const part = this.parts.find(p => p.id === item.partId);
      HistoryModule.log('update', 'bom_item', item.id, part?.name || 'Unknown Part', `Type → ${item.type === 'inhouse' ? 'In-house' : 'COTS'}`);
      this.renderRows();
    } catch (err) {
      toast('Error updating type', 'error');
    }
  },

  async advanceBomStatus(itemId) {
    const item = this.boms.find(b => b.id === itemId);
    if (!item) return;
    const idx = BOM_STATUS_ORDER.indexOf(item.status || 'not_started');
    if (idx >= BOM_STATUS_ORDER.length - 1) {
      return toast('Already installed — nice work!', 'info');
    }
    item.status = BOM_STATUS_ORDER[idx + 1];
    try {
      await DB.put('bom_items', item);
      const part = this.parts.find(p => p.id === item.partId);
      HistoryModule.log('update', 'bom_item', item.id, part?.name || 'Unknown Part', `Status → ${BOM_STATUS_MAP[item.status].label}`);
      toast(`${part?.name || 'Item'}: ${BOM_STATUS_MAP[item.status].label}`, 'success');
      this.renderRows();
    } catch (err) {
      toast('Error updating status', 'error');
    }
  },

  // Export --------------------------------------------------------------------

  exportCSV() {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    let csv, filename;

    if (this.scope === 'all') {
      csv = 'Part Name,Category,Stock,Needed,Unit Cost,Vendor,Location,Container,Assignee\n';
      this.parts.forEach(p => {
        const vendor = this.vendors.find(v => v.id === p.vendorId)?.name || '';
        const loc = this.locations.find(l => l.id === p.locationId)?.name || '';
        const assignee = this.people.find(u => u.id === p.assigneeId || u.uid === p.assigneeId)?.name || '';
        csv += [p.name, p.category || '', p.inStock || 0, p.needed || 0, p.unitCost || 0, vendor, loc, p.containerId || '', assignee].map(esc).join(',') + '\n';
      });
      filename = 'orbito-master-inventory.csv';
    } else {
      const fam = this.scopeFamilyIds();
      const scopeName = this.projects.find(p => p.id === this.scope)?.name || 'system';
      csv = 'Part Name,Subsystem,Type,Material,Machine,Qty Needed,In Stock,Status,Unit Cost,Line Total,Vendor\n';
      this.boms.filter(b => fam.includes(b.projectId)).forEach(b => {
        const part = this.parts.find(p => p.id === b.partId);
        const sub = this.projects.find(p => p.id === b.projectId)?.name || '';
        const vendor = part ? (this.vendors.find(v => v.id === part.vendorId)?.name || '') : '';
        const cost = part ? (part.unitCost || 0) : 0;
        csv += [part?.name || 'Unknown', sub, b.type === 'inhouse' ? 'In-house' : 'COTS', b.material || '', b.process || '', b.qtyNeeded, part?.inStock || 0, b.status, cost, cost * b.qtyNeeded, vendor].map(esc).join(',') + '\n';
      });
      filename = `orbito-${scopeName.replace(/\s+/g, '-').toLowerCase()}.csv`;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click(); URL.revokeObjectURL(url);
    toast('CSV Exported', 'success');
  }
};

window.SpreadsheetModule = SpreadsheetModule;
