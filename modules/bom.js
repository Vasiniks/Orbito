// bom.js
const BOM_STATUS_ORDER = ['not_started', 'ordered', 'in_stock', 'installed'];
const BOM_STATUS_MAP = {
  'not_started': { label: 'Not Started', class: 'gray' },
  'ordered':     { label: 'Ordered',     class: 'amber' },
  'in_stock':    { label: 'In Stock',    class: 'blue' },
  'installed':   { label: 'Installed',   class: 'green' }
};

const BomModule = {
  typeFilter: 'all', // all | cots | inhouse

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

  renderView() {
    const projOptions = this.projects.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');

    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <select class="form-select" id="bomProjectSelect" style="width:250px">
            <option value="">-- Select a Project --</option>
            ${projOptions}
          </select>
        </div>
        <div class="toolbar-right" id="bomActions" style="display:none">
          <button class="btn btn-secondary" id="exportBomBtn"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
          <button class="btn btn-secondary" id="importBomBtn"><i class="fa-solid fa-file-import"></i> Add All from Project</button>
          <button class="btn btn-primary" id="addBomItemBtn"><i class="fa-solid fa-plus"></i> Add Item</button>
        </div>
      </div>
      <div id="bomContent">
        <div class="empty-state"><i class="fa-solid fa-clipboard-list"></i><h3>Select a project</h3><p>Choose a project from the dropdown to view its BOM.</p></div>
      </div>
    `;

    document.getElementById('bomProjectSelect').addEventListener('change', (e) => this.renderBomForProject(e.target.value));
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

    const allItems = this.boms.filter(b => b.projectId === projectId);

    if (allItems.length === 0) {
      document.getElementById('bomContent').innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-clipboard-list"></i>
          <h3>No BOM items yet</h3>
          <p>Add parts this project needs, then track each one from ordering to installation.</p>
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

      return `
        <tr>
          <td data-label="Part">${escapeHTML(part ? part.name : 'Unknown Part')}</td>
          <td data-label="Type"><span class="badge badge-${b.type === 'inhouse' ? 'purple' : 'cyan'}">${b.type === 'inhouse' ? 'In-house' : 'COTS'}</span></td>
          <td data-label="Material">${escapeHTML(b.material || '—')}</td>
          <td data-label="Process">${escapeHTML(b.process || '—')}</td>
          <td data-label="Qty" class="text-right">${b.qtyNeeded}</td>
          <td data-label="In Stock" class="text-right">${part ? (part.inStock || 0) : 0}</td>
          <td data-label="Status">
            <button class="badge badge-${st.class} bom-status-btn" title="${isDone ? 'Installed — done!' : 'Click to advance to ' + BOM_STATUS_MAP[nextStatus].label}" onclick="BomModule.advanceStatus('${b.id}')">${st.label}${isDone ? '' : ' <i class="fa-solid fa-angle-right" style="font-size:9px;opacity:0.7"></i>'}</button>
          </td>
          <td data-label="Line Total" class="text-right">${formatCurrency(cost)}</td>
          <td data-label="Actions" class="text-right">
            <button class="btn-icon btn-sm" onclick="BomModule.showEditModal('${b.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-icon btn-sm text-red" style="color:var(--red)" onclick="BomModule.deleteItem('${b.id}')" title="Remove"><i class="fa-solid fa-trash"></i></button>
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
      this.renderBomForProject(item.projectId);
    } catch (err) {
      toast('Error updating status', 'error');
    }
  },

  async showAddModal(projectId) {
    const partOptions = this.parts.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
    
    const body = `
      <div class="form-group">
        <label class="form-label">Part</label>
        <select class="form-select" id="bomPartSelect">${partOptions}</select>
      </div>
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
          <label class="form-label">Process <span class="text-muted">(optional)</span></label>
          <input type="text" class="form-input" id="bomProcess" placeholder="e.g. CNC mill, 3D print, Order">
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

    const body = `
      <div class="form-group">
        <label class="form-label">Part</label>
        <input type="text" class="form-input" value="${escapeHTML(part ? part.name : 'Unknown')}" disabled>
      </div>
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
        <label class="form-label">Process</label>
        <input type="text" class="form-input" id="editBomProcess" value="${escapeHTML(item.process || '')}" placeholder="e.g. CNC mill, 3D print, Order">
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
    if (!partId) {
      if (btn) btn.disabled = false;
      return toast('Please select a part', 'error');
    }

    try {
      const newId = await DB.add('bom_items', {
        projectId, partId, qtyNeeded, status: 'not_started',
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

    try {
      await DB.put('bom_items', item);
      const part = this.parts.find(p => p.id === item.partId);
      HistoryModule.log('update', 'bom_item', id, part ? part.name : 'Unknown Part', `Status: ${item.status}, Qty: ${item.qtyNeeded}`);
      toast('Item updated', 'success');
      closeModal();
      await this.loadData();
      this.renderBomForProject(item.projectId);
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
    this.renderBomForProject(item.projectId);
  },

  exportCSV(projectId) {
    const items = this.boms.filter(b => b.projectId === projectId);
    const p = this.projects.find(x => x.id === projectId);
    
    let csv = 'Part Name,Type,Material,Process,Qty Needed,In Stock,Status,Unit Cost,Line Total\n';
    const esc = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
    items.forEach(b => {
      const part = this.parts.find(pt => pt.id === b.partId);
      const cost = part ? (part.unitCost || 0) : 0;
      csv += `${esc(part ? part.name : 'Unknown')},${b.type === 'inhouse' ? 'In-house' : 'COTS'},${esc(b.material)},${esc(b.process)},${b.qtyNeeded},${part ? part.inStock||0 : 0},${b.status},${cost},${cost * b.qtyNeeded}\n`;
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
