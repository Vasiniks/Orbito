// bom.js
// Common shop machines/processes (FRCBOM-style). Free text is still allowed via the datalist input.
const BOM_MACHINES = ['CNC Mill', 'CNC Router', 'Lathe', '3D Print', 'Laser Cut', 'Saw', 'Drill Press', 'Sheet Metal / Bend', 'Weld', 'Hand Tools', 'Order (COTS)'];
const BOM_MACHINE_DATALIST = `<datalist id="bomMachineList">${BOM_MACHINES.map(m => `<option value="${m}"></option>`).join('')}</datalist>`;

const BOM_STATUS_ORDER = ['not_started', 'ordered', 'in_stock', 'installed'];
const BOM_STATUS_MAP = {
  'not_started': { label: 'Not Started', class: 'gray' },
  'ordered':     { label: 'Ordered',     class: 'amber' },
  'in_stock':    { label: 'In Stock',    class: 'blue' },
  'installed':   { label: 'Installed',   class: 'green' }
};

const BomModule = {
  typeFilter: 'all', // all | cots | inhouse
  pendingProject: null, // set by other views before navigate('bom')

  async render(container) {
    this.container = container;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    this.projects = await DB.getAll('projects');
    this.parts = await DB.getAll('parts');
    this.boms = await DB.getAll('bom_items');
  },

  // Family = a project plus its subsystems (one level deep)
  familyIds(projectId) {
    return [projectId, ...this.projects.filter(p => p.parentId === projectId).map(p => p.id)];
  },

  currentProjectId() {
    return document.getElementById('bomProjectSelect')?.value || null;
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
          html += `<option value="${s.id}" ${selectedId === s.id ? 'selected' : ''}>&nbsp;&nbsp;↳ ${escapeHTML(s.name)}</option>`;
        });
        html += `</optgroup>`;
      } else {
        html += `<option value="${p.id}" ${selectedId === p.id ? 'selected' : ''}>${escapeHTML(p.name)}</option>`;
      }
    });
    return html;
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
          <p>Add parts this ${isParent ? 'project or its subsystems need' : 'system needs'}, then track each one from ordering to installation.</p>
          <button class="btn btn-primary" onclick="BomModule.showAddModal('${projectId}')"><i class="fa-solid fa-plus"></i> Add First Item</button>
        </div>`;
      return;
    }

    // Stats always computed on the FULL list; filter only affects rows
    let totalCost = 0;
    let completedCount = 0;
    let cotsCount = 0;
    allItems.forEach(b => {
      const part = this.parts.find(p => p.id === b.partId);
      totalCost += part ? (part.unitCost || 0) * b.qtyNeeded : 0;
      if (b.status === 'installed') completedCount++;
      if (b.type === 'cots') cotsCount++;
    });
    const pct = Math.round((completedCount / allItems.length) * 100);

    const items = this.typeFilter === 'all' ? allItems : allItems.filter(b => (b.type || 'cots') === this.typeFilter);

    const rows = items.map(b => {
      const part = this.parts.find(p => p.id === b.partId);
      const cost = part ? (part.unitCost || 0) * b.qtyNeeded : 0;
      const st = BOM_STATUS_MAP[b.status] || BOM_STATUS_MAP['not_started'];
      const isDone = b.status === 'installed';
      const nextStatus = BOM_STATUS_ORDER[Math.min(BOM_STATUS_ORDER.indexOf(b.status || 'not_started') + 1, BOM_STATUS_ORDER.length - 1)];

      // Color the part by how short we are (skip once installed)
      const inStock = part ? (part.inStock || 0) : 0;
      const short = !isDone && inStock < b.qtyNeeded;
      const critical = short && inStock === 0;
      const nameCls = critical ? 'part-name-low' : short ? 'part-name-warn' : '';
      const rowCls = critical ? 'row-stock-low' : short ? 'row-stock-warn' : '';
      const subProj = this.projects.find(p => p.id === b.projectId);
      const subCell = isParent ? `<td data-label="Subsystem"><span class="chip"><i class="fa-solid fa-diagram-project" aria-hidden="true"></i>${b.projectId === projectId ? 'Main' : escapeHTML(subProj?.name || '?')}</span></td>` : '';

      return `
        <tr class="${rowCls}">
          <td data-label="Part"><span class="${nameCls}">${escapeHTML(part ? part.name : 'Unknown Part')}</span></td>
          ${subCell}
          <td data-label="Type"><span class="badge badge-${b.type === 'inhouse' ? 'purple' : 'cyan'}">${b.type === 'inhouse' ? 'In-house' : 'COTS'}</span></td>
          <td data-label="Material">${getMaterialChip(b.material)}</td>
          <td data-label="Process">${getProcessChip(b.process)}</td>
          <td data-label="Qty" class="text-right">${b.qtyNeeded}</td>
          <td data-label="In Stock" class="text-right"><span class="${nameCls}">${inStock}</span></td>
          <td data-label="Status">
            <button class="badge badge-${st.class} bom-status-btn" title="${isDone ? 'Installed — done!' : 'Click to advance to ' + BOM_STATUS_MAP[nextStatus].label}" onclick="BomModule.advanceStatus('${b.id}')">${st.label}${isDone ? '' : ' <i class="fa-solid fa-angle-right" style="font-size:9px;opacity:0.7"></i>'}</button>
          </td>
          <td data-label="Line Total" class="text-right">${formatCurrency(cost)}</td>
          <td data-label="Actions" class="text-right">
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
            <div><span class="text-xs text-muted">Total</span><div style="font-size:20px;font-weight:700">${allItems.length}</div></div>
            <div><span class="text-xs text-muted">Installed</span><div style="font-size:20px;font-weight:700;color:var(--green)">${completedCount}</div></div>
            <div><span class="text-xs text-muted">COTS</span><div style="font-size:20px;font-weight:700;color:var(--cyan)">${cotsCount}</div></div>
            <div><span class="text-xs text-muted">In-house</span><div style="font-size:20px;font-weight:700;color:var(--purple)">${allItems.length - cotsCount}</div></div>
            <div><span class="text-xs text-muted">Budget</span><div style="font-size:20px;font-weight:700">${formatCurrency(totalCost)}</div></div>
          </div>
          <div style="min-width:180px;flex:1;max-width:320px">
            <div class="flex items-center justify-between text-xs text-muted" style="margin-bottom:4px"><span>Progress</span><span style="font-weight:700;color:var(--text-0)">${pct}%</span></div>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          </div>
        </div>
      </div>

      <div class="filter-chips mb-4">
        <button class="filter-chip ${this.typeFilter === 'all' ? 'active' : ''}" onclick="BomModule.setTypeFilter('${projectId}', 'all')">All (${allItems.length})</button>
        <button class="filter-chip ${this.typeFilter === 'cots' ? 'active' : ''}" onclick="BomModule.setTypeFilter('${projectId}', 'cots')">COTS (${cotsCount})</button>
        <button class="filter-chip ${this.typeFilter === 'inhouse' ? 'active' : ''}" onclick="BomModule.setTypeFilter('${projectId}', 'inhouse')">In-house (${allItems.length - cotsCount})</button>
      </div>

      ${items.length === 0 ? '<div class="empty-state" style="padding:30px"><p>No items match this filter.</p></div>' : `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Part</th>
              ${isParent ? '<th>Subsystem</th>' : ''}
              <th>Type</th>
              <th>Material</th>
              <th>Process</th>
              <th class="text-right">Qty</th>
              <th class="text-right">In Stock</th>
              <th>Status</th>
              <th class="text-right">Line Total</th>
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

  async advanceStatus(id) {
    const item = this.boms.find(b => b.id === id);
    if (!item) return;
    const idx = BOM_STATUS_ORDER.indexOf(item.status || 'not_started');
    if (idx >= BOM_STATUS_ORDER.length - 1) {
      return toast('Already installed — nice work!', 'info');
    }
    item.status = BOM_STATUS_ORDER[idx + 1];
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

  async showAddModal(projectId) {
    const partOptions = this.parts.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
    const fam = this.familyIds(projectId);
    const subsystemGroup = fam.length > 1 ? `
      <div class="form-group">
        <label class="form-label">Subsystem</label>
        <select class="form-select" id="bomSubsystem">
          ${fam.map(id => {
            const pr = this.projects.find(p => p.id === id);
            return `<option value="${id}">${escapeHTML(pr?.name || '?')}${id === projectId ? ' (main)' : ''}</option>`;
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
          <label class="form-label">Quantity Needed</label>
          <input type="number" class="form-input" id="bomQty" value="1" min="1">
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="bomType">
            <option value="cots">COTS (bought)</option>
            <option value="inhouse">In-house (made)</option>
          </select>
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Material <span class="text-muted">(optional)</span></label>
          <input type="text" class="form-input" id="bomMaterial" placeholder="e.g. 6061-T6, Polycarb">
        </div>
        <div class="form-group">
          <label class="form-label">Machine / Process <span class="text-muted">(optional)</span></label>
          <input type="text" class="form-input" id="bomProcess" list="bomMachineList" placeholder="e.g. CNC Mill, 3D Print, Order">
          ${BOM_MACHINE_DATALIST}
          <div class="form-hint">Pick a machine from the list or type your own.</div>
        </div>
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
            return `<option value="${fid}" ${fid === item.projectId ? 'selected' : ''}>${escapeHTML(pr?.name || '?')}${fid === rootId ? ' (main)' : ''}</option>`;
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
          <label class="form-label">Quantity Needed</label>
          <input type="number" class="form-input" id="editBomQty" value="${item.qtyNeeded}" min="1">
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="editBomStatus">
            <option value="not_started" ${item.status === 'not_started' ? 'selected' : ''}>Not Started</option>
            <option value="ordered" ${item.status === 'ordered' ? 'selected' : ''}>Ordered</option>
            <option value="in_stock" ${item.status === 'in_stock' ? 'selected' : ''}>In Stock</option>
            <option value="installed" ${item.status === 'installed' ? 'selected' : ''}>Installed</option>
          </select>
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="editBomType">
            <option value="cots" ${(item.type || 'cots') === 'cots' ? 'selected' : ''}>COTS (bought)</option>
            <option value="inhouse" ${item.type === 'inhouse' ? 'selected' : ''}>In-house (made)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Material</label>
          <input type="text" class="form-input" id="editBomMaterial" value="${escapeHTML(item.material || '')}" placeholder="e.g. 6061-T6">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Machine / Process</label>
        <input type="text" class="form-input" id="editBomProcess" list="bomMachineList" value="${escapeHTML(item.process || '')}" placeholder="e.g. CNC Mill, 3D Print, Order">
        ${BOM_MACHINE_DATALIST}
        <div class="form-hint">Pick a machine from the list or type your own.</div>
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

    try {
      const newId = await DB.add('bom_items', {
        projectId: targetProjectId, partId, qtyNeeded, status: 'not_started',
        type: document.getElementById('bomType').value,
        material: document.getElementById('bomMaterial').value.trim(),
        process: document.getElementById('bomProcess').value.trim()
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
    item.type = document.getElementById('editBomType').value;
    item.material = document.getElementById('editBomMaterial').value.trim();
    item.process = document.getElementById('editBomProcess').value.trim();
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
    const items = this.boms.filter(b => fam.includes(b.projectId));
    const p = this.projects.find(x => x.id === projectId);

    let csv = 'Part Name,Subsystem,Type,Material,Machine/Process,Qty Needed,In Stock,Status,Unit Cost,Line Total\n';
    const esc = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
    items.forEach(b => {
      const part = this.parts.find(pt => pt.id === b.partId);
      const cost = part ? (part.unitCost || 0) : 0;
      const sub = b.projectId === projectId ? 'Main' : (this.projects.find(x => x.id === b.projectId)?.name || '');
      csv += `${esc(part ? part.name : 'Unknown')},${esc(sub)},${b.type === 'inhouse' ? 'In-house' : 'COTS'},${esc(b.material)},${esc(b.process)},${b.qtyNeeded},${part ? part.inStock||0 : 0},${b.status},${cost},${cost * b.qtyNeeded}\n`;
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
    const projOptions = otherProjects.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
    
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
          const newId = await DB.add('bom_items', {
            projectId: targetProjectId,
            partId: item.partId,
            qtyNeeded: item.qtyNeeded,
            status: 'not_started',
            type: item.type || 'cots',
            material: item.material || '',
            process: item.process || ''
          });
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
