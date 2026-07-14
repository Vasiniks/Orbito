// parts.js — Parts Library: stock tracking with baseline status, containers, vendors & import/export
const PartsModule = {
  sortField: 'name',
  sortDir: 1,
  selectedParts: new Set(),
  selectMode: false,
  containerFilter: 'all',
  hiddenCols: new Set(JSON.parse(localStorage.getItem('launchpad-parts-cols') || '[]')),

  HIDEABLE_COLS: [
    { key: 'photo', label: 'Photo' },
    { key: 'category', label: 'Category' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'location', label: 'Location' },
    { key: 'stock', label: 'Stock' },
  ],

  async render(container) {
    this.container = container;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    [this.parts, this.locations, this.vendors] = await Promise.all([
      DB.getAll('parts'),
      DB.getAll('locations'),
      DB.getAll('vendors')
    ]);
  },

  col(key) { return !this.hiddenCols.has(key); },

  // All known categories: managed list + whatever exists on parts
  allCategories() {
    const set = new Set((window.__categories || []).map(c => c.trim()).filter(Boolean));
    this.parts.forEach(p => { if (p.category) set.add(p.category.trim()); });
    return [...set].sort((a, b) => a.localeCompare(b));
  },

  // Every container across all locations
  allContainers() {
    const out = [];
    this.locations.forEach(l => (l.containers || []).forEach(c => {
      out.push({ ...c, locId: l.id, locName: l.name });
    }));
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },

  renderView() {
    const locFilterVal = this._locFilter || 'all';
    const containers = this.allContainers().filter(c => locFilterVal === 'all' || c.locId === locFilterVal);
    const cats = this.allCategories();

    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-box" style="max-width:220px">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input type="text" id="partsSearch" placeholder="Search parts...">
          </div>
          <select class="form-select" style="width:130px" id="partsFilter" aria-label="Stock status filter">
            <option value="all">All Stock</option>
            <option value="below">Below Baseline</option>
            <option value="at">At Baseline</option>
            <option value="above">Above Baseline</option>
          </select>
          <select class="form-select" style="width:130px" id="catFilter" aria-label="Category filter">
            <option value="all">All Categories</option>
            ${cats.map(c => `<option value="${escapeAttr(c)}" ${this._catFilter === c ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('')}
          </select>
          <select class="form-select" style="width:125px" id="vendorFilter" aria-label="Vendor filter">
            <option value="all">All Vendors</option>
            ${this.vendors.map(v => `<option value="${v.id}" ${this._vendorFilter === v.id ? 'selected' : ''}>${escapeHTML(v.name)}</option>`).join('')}
          </select>
          <select class="form-select" style="width:125px" id="locFilter" aria-label="Location filter">
            <option value="all">All Locations</option>
            ${this.locations.map(l => `<option value="${l.id}" ${locFilterVal === l.id ? 'selected' : ''}>${escapeHTML(l.name)}</option>`).join('')}
          </select>
          <select class="form-select" style="width:135px" id="containerFilter" aria-label="Container filter">
            <option value="all">All Containers</option>
            ${containers.map(c => `<option value="${escapeAttr(c.name)}" ${this.containerFilter === c.name ? 'selected' : ''}>${escapeHTML(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-danger btn-sm" id="bulkDeleteBtn" style="display:none"><i class="fa-solid fa-trash"></i> Delete Selected</button>
          <button class="btn-icon" id="colsBtn" title="Show / hide columns" aria-label="Show or hide columns"><i class="fa-solid fa-table-columns" aria-hidden="true"></i></button>
          <button class="btn-icon ${this.selectMode ? 'active-toggle' : ''}" id="selectModeBtn" title="Select multiple" aria-label="Toggle selection mode"><i class="fa-solid fa-square-check" aria-hidden="true"></i></button>
          <button class="btn btn-secondary btn-sm" onclick="navigate('containers')"><i class="fa-solid fa-box"></i> Containers</button>
          <button class="btn btn-secondary btn-sm" id="partsDataBtn"><i class="fa-solid fa-file-arrow-down"></i> Data</button>
          <button class="btn btn-primary btn-sm" id="addPartBtn"><i class="fa-solid fa-plus"></i> Add Part</button>
        </div>
      </div>
      <div class="table-wrap" id="partsTableWrap"></div>
    `;

    document.getElementById('addPartBtn').addEventListener('click', () => this.showAddModal());
    document.getElementById('bulkDeleteBtn').addEventListener('click', () => this.bulkDelete());
    document.getElementById('partsSearch').addEventListener('input', debounce(() => this.renderTable(), 250));
    document.getElementById('partsFilter').addEventListener('change', () => this.renderTable());
    document.getElementById('catFilter').addEventListener('change', (e) => { this._catFilter = e.target.value; this.renderTable(); });
    document.getElementById('vendorFilter').addEventListener('change', (e) => { this._vendorFilter = e.target.value; this.renderTable(); });
    document.getElementById('locFilter').addEventListener('change', (e) => {
      this._locFilter = e.target.value;
      this.containerFilter = 'all';
      this.renderView();
    });
    document.getElementById('containerFilter').addEventListener('change', (e) => {
      this.containerFilter = e.target.value;
      this.renderTable();
    });
    document.getElementById('colsBtn').addEventListener('click', (e) => {
      showColumnMenu(e.target.closest('button'), this.HIDEABLE_COLS, this.hiddenCols, () => {
        localStorage.setItem('launchpad-parts-cols', JSON.stringify([...this.hiddenCols]));
        this.renderTable();
      });
    });
    document.getElementById('selectModeBtn').addEventListener('click', () => {
      this.selectMode = !this.selectMode;
      if (!this.selectMode) this.selectedParts.clear();
      this.renderView();
    });
    document.getElementById('partsDataBtn').addEventListener('click', (e) => {
      showPopMenu(e.target.closest('button'), [
        { label: 'Export CSV', icon: 'fa-file-csv', onClick: () => this.exportCSV() },
        { label: 'Export JSON', icon: 'fa-file-code', onClick: () => this.exportJSON() },
        { sep: true },
        { label: 'Import CSV', icon: 'fa-file-import', onClick: () => this.importFile('csv') },
        { label: 'Import JSON', icon: 'fa-file-import', onClick: () => this.importFile('json') },
        { sep: true },
        { label: 'Manage Categories', icon: 'fa-tags', onClick: () => this.showCategoriesModal() },
      ]);
    });

    this.renderTable();
  },

  toggleSort(field) {
    if (this.sortField === field) this.sortDir *= -1;
    else { this.sortField = field; this.sortDir = 1; }
    this.renderTable();
  },

  toggleSelect(id) {
    if (id === 'all') {
      const checkboxes = document.querySelectorAll('.part-cb');
      const selectAll = document.getElementById('selectAllCb').checked;
      checkboxes.forEach(cb => {
        cb.checked = selectAll;
        if (selectAll) this.selectedParts.add(cb.value);
        else this.selectedParts.delete(cb.value);
      });
    } else {
      if (this.selectedParts.has(id)) this.selectedParts.delete(id);
      else this.selectedParts.add(id);
    }
    const bulkBtn = document.getElementById('bulkDeleteBtn');
    if (bulkBtn) bulkBtn.style.display = this.selectedParts.size > 0 ? '' : 'none';
  },

  async bulkDelete() {
    if (this.selectedParts.size === 0) return;
    if (!confirm(`Delete ${this.selectedParts.size} parts?`)) return;
    for (const id of this.selectedParts) {
      const part = this.parts.find(p => p.id === id);
      await DB.delete('parts', id);
      HistoryModule.log('delete', 'part', id, part?.name || '', 'Bulk delete');
    }
    this.selectedParts.clear();
    this.selectMode = false;
    toast('Parts deleted', 'success');
    await this.loadData();
    this.renderView();
  },

  getSortIcon(field) {
    if (this.sortField !== field) return '<i class="fa-solid fa-sort" style="opacity:0.3;margin-left:4px" aria-hidden="true"></i>';
    return this.sortDir === 1 ? '<i class="fa-solid fa-sort-up" style="margin-left:4px" aria-hidden="true"></i>' : '<i class="fa-solid fa-sort-down" style="margin-left:4px" aria-hidden="true"></i>';
  },

  renderTable() {
    const query = document.getElementById('partsSearch').value.toLowerCase();
    const filter = document.getElementById('partsFilter').value;
    const catFilter = document.getElementById('catFilter').value;
    const vendorFilter = document.getElementById('vendorFilter').value;
    const locFilter = document.getElementById('locFilter').value;
    const contFilter = document.getElementById('containerFilter').value;

    let filtered = this.parts.filter(p => p.name.toLowerCase().includes(query) || (p.category && p.category.toLowerCase().includes(query)));
    if (filter !== 'all') filtered = filtered.filter(p => stockStatus(p.inStock || 0, p.needed || 0).status === filter);
    if (catFilter !== 'all') filtered = filtered.filter(p => (p.category || '') === catFilter);
    if (vendorFilter !== 'all') filtered = filtered.filter(p => p.vendorId === vendorFilter);
    if (locFilter !== 'all') filtered = filtered.filter(p => p.locationId === locFilter);
    if (contFilter !== 'all') filtered = filtered.filter(p => p.containerId === contFilter);

    filtered.sort((a, b) => {
      let va = a[this.sortField] || '';
      let vb = b[this.sortField] || '';
      if (this.sortField === 'location') {
        va = this.locations.find(l => l.id === a.locationId)?.name || '';
        vb = this.locations.find(l => l.id === b.locationId)?.name || '';
      } else if (this.sortField === 'vendor') {
        va = this.vendors.find(v => v.id === a.vendorId)?.name || '';
        vb = this.vendors.find(v => v.id === b.vendorId)?.name || '';
      }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return -1 * this.sortDir;
      if (va > vb) return 1 * this.sortDir;
      return 0;
    });

    const wrap = document.getElementById('partsTableWrap');
    if (filtered.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><i class="fa-solid fa-screwdriver-wrench"></i><h3>No parts found</h3><p>Adjust your filters or add some parts to your inventory.</p><button class="btn btn-primary" onclick="PartsModule.showAddModal()"><i class="fa-solid fa-plus"></i> Add Part</button></div>`;
      return;
    }

    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            ${this.selectMode ? `<th style="width:40px"><input type="checkbox" id="selectAllCb" onchange="PartsModule.toggleSelect('all')" aria-label="Select all"></th>` : ''}
            ${this.col('photo') ? '<th style="width:50px">Photo</th>' : ''}
            <th style="cursor:pointer" onclick="PartsModule.toggleSort('name')">Name ${this.getSortIcon('name')}</th>
            ${this.col('category') ? `<th style="cursor:pointer" onclick="PartsModule.toggleSort('category')">Category ${this.getSortIcon('category')}</th>` : ''}
            ${this.col('vendor') ? `<th style="cursor:pointer" onclick="PartsModule.toggleSort('vendor')">Vendor ${this.getSortIcon('vendor')}</th>` : ''}
            ${this.col('location') ? `<th style="cursor:pointer" onclick="PartsModule.toggleSort('location')">Location ${this.getSortIcon('location')}</th>` : ''}
            ${this.col('stock') ? `<th style="cursor:pointer" onclick="PartsModule.toggleSort('inStock')">Stock ${this.getSortIcon('inStock')}</th>` : ''}
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(p => {
            const loc = this.locations.find(l => l.id === p.locationId);
            const vendor = this.vendors.find(v => v.id === p.vendorId);
            const st = stockStatus(p.inStock || 0, p.needed || 0);
            const nameCls = st.status === 'below' ? 'part-name-low' : '';
            const rowCls = st.status === 'below' ? 'row-stock-low' : '';
            return `
              <tr class="${rowCls}">
                ${this.selectMode ? `<td><input type="checkbox" class="part-cb" value="${p.id}" ${this.selectedParts.has(p.id) ? 'checked' : ''} onchange="PartsModule.toggleSelect('${p.id}')" aria-label="Select ${escapeAttr(p.name)}"></td>` : ''}
                ${this.col('photo') ? `<td data-label="Photo">
                  ${p.photo
                    ? `<button class="part-thumb" onclick="showLightbox(this.querySelector('img').src)" title="Expand photo" aria-label="Expand photo of ${escapeAttr(p.name)}"><img src="${p.photo}" alt=""></button>`
                    : '<div class="part-thumb part-thumb-empty"><i class="fa-solid fa-image" aria-hidden="true"></i></div>'}
                </td>` : ''}
                <td data-label="Name" style="font-weight:500">
                  <a href="#" class="${nameCls}" onclick="event.preventDefault();PartsModule.showPartDetail('${p.id}')" style="color:var(--text-0);text-decoration:none">${escapeHTML(p.name)}</a>
                  ${(p.drawings && p.drawings.length) || p.onshapeUrl ? '<i class="fa-solid fa-paperclip text-muted" style="margin-left:4px;font-size:10px" title="Has drawings"></i>' : ''}
                </td>
                ${this.col('category') ? `<td data-label="Category"><span class="badge badge-gray">${escapeHTML(p.category || '—')}</span></td>` : ''}
                ${this.col('vendor') ? `<td data-label="Vendor">
                  ${vendor ? `<span class="chip chip-vendor"><i class="fa-solid fa-store" aria-hidden="true"></i>${escapeHTML(vendor.name)}</span>` : '<span class="text-muted">—</span>'}
                  ${p.buyUrl ? `<a href="${escapeAttr(p.buyUrl)}" target="_blank" rel="noopener" class="btn-icon btn-sm" style="display:inline-grid;vertical-align:middle;margin-left:4px" title="Buy link" aria-label="Open buy link for ${escapeAttr(p.name)}"><i class="fa-solid fa-cart-shopping" aria-hidden="true" style="font-size:11px"></i></a>` : ''}
                </td>` : ''}
                ${this.col('location') ? `<td data-label="Location">${escapeHTML(loc ? loc.name : '—')}${p.containerId ? `<span class="text-muted text-xs"> › ${escapeHTML(p.containerId)}</span>` : ''}</td>` : ''}
                ${this.col('stock') ? `<td data-label="Stock">
                  <div class="qty-cell">
                    <button class="qty-btn" onclick="PartsModule.step('${p.id}', -1)" title="Remove one" aria-label="Decrease stock of ${escapeAttr(p.name)}">−</button>
                    ${getStockChip(p.inStock || 0, p.needed || 0, p.id)}
                    <button class="qty-btn" onclick="PartsModule.step('${p.id}', 1)" title="Add one" aria-label="Increase stock of ${escapeAttr(p.name)}">+</button>
                  </div>
                </td>` : ''}
                <td data-label="Actions" class="text-right">
                  <div class="flex items-center justify-end gap-1">
                    ${p.locationId ? `<button class="btn-icon btn-sm" onclick="PartsModule.findPart('${p.id}')" title="Find Part" aria-label="Find ${escapeAttr(p.name)}"><i class="fa-solid fa-route" aria-hidden="true"></i></button>` : ''}
                    <button class="btn-icon btn-sm" onclick="PartsModule.showEditModal('${p.id}')" title="Edit" aria-label="Edit ${escapeAttr(p.name)}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
                    <button class="btn-icon btn-sm" style="color:var(--red)" onclick="PartsModule.deletePart('${p.id}')" title="Delete" aria-label="Delete ${escapeAttr(p.name)}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  },

  // Quick +/- stock stepper
  async step(id, delta) {
    const p = this.parts.find(x => x.id === id);
    if (!p) return;
    const next = Math.max(0, (p.inStock || 0) + delta);
    if (next === p.inStock) return;
    p.inStock = next;
    try {
      await DB.put('parts', p);
      HistoryModule.log('update', 'part', id, p.name, `Stock ${delta > 0 ? '+1' : '-1'} → ${next}`);
      this.renderTable();
    } catch (err) {
      toast('Error updating stock', 'error');
    }
  },

  // ── Categories ──
  async showCategoriesModal() {
    const managed = [...(window.__categories || [])];
    const inUse = this.allCategories();

    const renderBody = () => `
      <p class="text-sm text-muted mb-3">Categories appear as a dropdown when adding parts. Removing one here doesn't change parts already using it.</p>
      <div class="flex gap-2 mb-3" style="flex-wrap:wrap" id="catChips">
        ${inUse.length === 0 ? '<span class="text-muted text-sm">No categories yet.</span>' : inUse.map(c => `
          <span class="chip" style="padding:4px 10px">
            ${escapeHTML(c)}
            ${managed.includes(c) ? `<button class="cat-del" data-cat="${escapeAttr(c)}" title="Remove from list" aria-label="Remove ${escapeAttr(c)}" style="border:none;background:none;color:var(--text-3);cursor:pointer;margin-left:2px;font-size:11px"><i class="fa-solid fa-xmark"></i></button>` : ''}
          </span>`).join('')}
      </div>
      <div class="flex gap-2">
        <input type="text" class="form-input" id="newCatInput" placeholder="New category…" style="flex:1">
        <button class="btn btn-secondary" id="addCatBtn"><i class="fa-solid fa-plus"></i> Add</button>
      </div>
    `;

    openModal('Manage Categories', renderBody(), `
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" id="saveCatsBtn">Save</button>
    `);

    const wire = () => {
      document.getElementById('addCatBtn').onclick = () => {
        const v = document.getElementById('newCatInput').value.trim();
        if (!v) return;
        if (!managed.includes(v)) managed.push(v);
        document.getElementById('modalBody').innerHTML = renderBody();
        wire();
        document.getElementById('newCatInput').focus();
      };
      document.getElementById('newCatInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addCatBtn').click(); }
      });
      document.querySelectorAll('.cat-del').forEach(b => {
        b.addEventListener('click', () => {
          const i = managed.indexOf(b.dataset.cat);
          if (i !== -1) managed.splice(i, 1);
          document.getElementById('modalBody').innerHTML = renderBody();
          wire();
        });
      });
    };
    wire();

    document.getElementById('saveCatsBtn').addEventListener('click', async () => {
      await DB.put('settings', { id: 'categories', list: managed });
      window.__categories = managed;
      toast('Categories saved', 'success');
      closeModal();
      this.renderView();
    });
  },

  // ── Add / Edit part ──
  async showAddModal() {
    this.showEditModal(null);
  },

  async showEditModal(id) {
    const p = id ? this.parts.find(x => x.id === id) : {};

    const cats = this.allCategories();
    const locOpts = this.locations.map(l => `<option value="${l.id}" ${l.id === p.locationId ? 'selected' : ''}>${escapeHTML(l.name)}</option>`).join('');
    const vendorOpts = this.vendors.map(v => `<option value="${v.id}" ${v.id === p.vendorId ? 'selected' : ''}>${escapeHTML(v.name)}</option>`).join('');
    const selectedLoc = this.locations.find(l => l.id === p.locationId);
    const containerOpts = (selectedLoc?.containers || []).map(c => `<option value="${escapeAttr(c.name)}" ${c.name === p.containerId ? 'selected' : ''}>${escapeHTML(c.name)}</option>`).join('');
    const refPhotos = { ...(p.refPhotos || {}) };

    const refSlot = (key, label) => `
      <div style="flex:1;min-width:0">
        <label class="photo-upload ref-slot" id="refSlot_${key}" style="aspect-ratio:4/3">
          ${refPhotos[key] ? `<img src="${refPhotos[key]}">` : `<i class="fa-solid fa-camera"></i><span style="font-size:11px">${label}</span>`}
          <input type="file" accept="image/*" data-ref="${key}" class="ref-input">
        </label>
        <div class="text-xs text-muted text-center mt-2" style="margin-top:4px">${label}</div>
      </div>
    `;

    const body = `
      <form id="partForm">
        <div class="flex gap-4">
          <div style="width:140px">
            <label class="form-label">Photo</label>
            <label class="photo-upload" id="partPhotoUpload">
              ${p.photo ? `<img src="${p.photo}">` : '<i class="fa-solid fa-camera"></i><span>Upload</span>'}
              <input type="file" accept="image/*" id="partPhotoInput">
            </label>
          </div>
          <div style="flex:1">
            <div class="form-group">
              <label class="form-label">Name</label>
              <input type="text" class="form-input" id="partName" value="${escapeAttr(p.name || '')}" required>
              <div class="form-hint" id="dupWarning" style="color:var(--accent);display:none"></div>
            </div>
            <div class="form-group">
              <label class="form-label">Category</label>
              <input type="text" class="form-input" id="partCategory" list="partCatList" value="${escapeAttr(p.category || '')}" placeholder="Pick or type a new one">
              <datalist id="partCatList">${cats.map(c => `<option value="${escapeAttr(c)}"></option>`).join('')}</datalist>
            </div>
          </div>
        </div>
        <div class="form-group mt-3">
          <label class="form-label">Description</label>
          <textarea class="form-textarea" id="partDesc">${escapeHTML(p.description || '')}</textarea>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Vendor</label>
            <select class="form-select" id="partVendor"><option value="">None</option>${vendorOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Buy Link</label>
            <input type="url" class="form-input" id="partBuyUrl" value="${escapeAttr(p.buyUrl || '')}" placeholder="https://…">
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Location</label>
            <select class="form-select" id="partLocation" onchange="PartsModule._updateContainerOpts()"><option value="">None</option>${locOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Container</label>
            <select class="form-select" id="partContainer"><option value="">None</option>${containerOpts}</select>
          </div>
        </div>
        <div class="grid-3">
          <div class="form-group">
            <label class="form-label">In Stock</label>
            <input type="number" class="form-input" id="partInStock" value="${p.inStock || 0}" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Baseline Parts</label>
            <input type="number" class="form-input" id="partNeeded" value="${p.needed || 0}" min="0">
            <div class="form-hint">Status compares stock to this ±${window.__stockSettings?.tolerance ?? 10}%.</div>
          </div>
          <div class="form-group">
            <label class="form-label">Unit Cost ($)</label>
            <input type="number" step="0.01" class="form-input" id="partCost" value="${p.unitCost || ''}">
          </div>
        </div>

        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
        <h4 class="text-sm font-semibold mb-2"><i class="fa-solid fa-images"></i> Reference Photos <span class="text-muted" style="font-weight:400">(what each stock status looks like)</span></h4>
        <div class="flex gap-3 mb-3">
          ${refSlot('above', 'Above baseline')}
          ${refSlot('at', 'At baseline')}
          ${refSlot('below', 'Below baseline')}
        </div>

        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
        <h4 class="text-sm font-semibold mb-2"><i class="fa-solid fa-drafting-compass"></i> Drawings & CAD</h4>
        <div class="form-group">
          <label class="form-label">Onshape URL</label>
          <input type="url" class="form-input" id="partOnshape" value="${escapeAttr(p.onshapeUrl || '')}" placeholder="https://cad.onshape.com/...">
        </div>
        <div class="form-group">
          <label class="form-label">Drawings / Sketches</label>
          <div id="drawingsPreview" class="flex gap-2" style="flex-wrap:wrap;margin-bottom:8px">
            ${(p.drawings || []).map((d, i) => `
              <div style="position:relative;width:60px;height:60px;border-radius:4px;overflow:hidden;border:1px solid var(--border)">
                <img src="${d}" style="width:100%;height:100%;object-fit:cover">
                <button type="button" class="btn-icon" style="position:absolute;top:1px;right:1px;width:18px;height:18px;font-size:10px;background:var(--red);color:#fff;border-radius:50%" onclick="PartsModule._removeDrawing(${i})" aria-label="Remove drawing"><i class="fa-solid fa-xmark"></i></button>
              </div>
            `).join('')}
          </div>
          <label class="btn btn-secondary btn-sm" style="cursor:pointer">
            <i class="fa-solid fa-image"></i> Add Drawing
            <input type="file" accept="image/*" id="drawingInput" multiple style="display:none">
          </label>
        </div>
      </form>
    `;

    let currentPhoto = p.photo || null;
    this._currentDrawings = [...(p.drawings || [])];

    const footer = `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="savePartBtn">Save Part</button>
    `;

    openModal(id ? 'Edit Part' : 'Add Part', body, footer);

    // Live duplicate warning while typing a name
    document.getElementById('partName').addEventListener('input', debounce(() => {
      const warn = document.getElementById('dupWarning');
      if (!warn) return;
      const match = findSimilarPart(document.getElementById('partName').value, this.parts, id);
      if (match) {
        warn.style.display = '';
        warn.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${match.exact ? 'A part with this name already exists' : 'Similar part exists'}: <strong>${escapeHTML(match.part.name)}</strong>`;
      } else {
        warn.style.display = 'none';
      }
    }, 200));

    document.getElementById('partPhotoInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        currentPhoto = await readFileAsDataURL(file);
        document.getElementById('partPhotoUpload').innerHTML = `<img src="${currentPhoto}"><input type="file" accept="image/*" id="partPhotoInput">`;
      }
    });

    document.querySelectorAll('.ref-input').forEach(inp => {
      inp.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const key = inp.dataset.ref;
        refPhotos[key] = await readFileAsDataURL(file, 900);
        const slot = document.getElementById(`refSlot_${key}`);
        const img = slot.querySelector('img');
        if (img) img.src = refPhotos[key];
        else slot.insertAdjacentHTML('afterbegin', `<img src="${refPhotos[key]}">`);
      });
    });

    document.getElementById('drawingInput').addEventListener('change', async (e) => {
      for (const file of e.target.files) {
        const data = await readFileAsDataURL(file);
        this._currentDrawings.push(data);
      }
      this._refreshDrawingsPreview();
    });

    document.getElementById('savePartBtn').addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      btn.disabled = true;

      const name = document.getElementById('partName').value.trim();
      if (!name) {
        btn.disabled = false;
        return toast('Name is required', 'error');
      }

      // Duplicate catcher: block silent duplicates, allow deliberate ones
      const match = findSimilarPart(name, this.parts, id);
      if (match && match.exact) {
        if (!confirm(`A part named "${match.part.name}" already exists.\n\nAdd this as a separate duplicate anyway?`)) {
          btn.disabled = false;
          return;
        }
      } else if (match && !id) {
        if (!confirm(`Similar part already exists: "${match.part.name}".\n\nAdd "${name}" as a new part anyway?`)) {
          btn.disabled = false;
          return;
        }
      }

      const data = {
        id: p.id,
        name,
        category: document.getElementById('partCategory').value.trim(),
        description: document.getElementById('partDesc').value.trim(),
        vendorId: document.getElementById('partVendor').value || null,
        buyUrl: document.getElementById('partBuyUrl').value.trim() || null,
        locationId: document.getElementById('partLocation').value || null,
        containerId: document.getElementById('partContainer').value || null,
        unitCost: parseFloat(document.getElementById('partCost').value) || 0,
        inStock: parseInt(document.getElementById('partInStock').value) || 0,
        needed: parseInt(document.getElementById('partNeeded').value) || 0,
        photo: currentPhoto,
        refPhotos,
        onshapeUrl: document.getElementById('partOnshape').value.trim() || null,
        drawings: this._currentDrawings
      };

      try {
        if (id) {
          await DB.put('parts', data);
          toast('Part updated', 'success');
          HistoryModule.log('update', 'part', id, name);
        } else {
          const newId = await DB.add('parts', data);
          toast('Part added', 'success');
          HistoryModule.log('create', 'part', newId, name);
        }

        closeModal();
        await this.loadData();
        this.renderView();
      } catch (err) {
        btn.disabled = false;
        toast('Error saving part', 'error');
      }
    });
  },

  _updateContainerOpts() {
    const locId = document.getElementById('partLocation').value;
    const loc = this.locations.find(l => l.id === locId);
    const sel = document.getElementById('partContainer');
    sel.innerHTML = '<option value="">None</option>' + (loc?.containers || []).map(c => `<option value="${escapeAttr(c.name)}">${escapeHTML(c.name)}</option>`).join('');
  },

  _removeDrawing(index) {
    this._currentDrawings.splice(index, 1);
    this._refreshDrawingsPreview();
  },

  _refreshDrawingsPreview() {
    const el = document.getElementById('drawingsPreview');
    if (!el) return;
    el.innerHTML = this._currentDrawings.map((d, i) => `
      <div style="position:relative;width:60px;height:60px;border-radius:4px;overflow:hidden;border:1px solid var(--border)">
        <img src="${d}" style="width:100%;height:100%;object-fit:cover">
        <button type="button" class="btn-icon" style="position:absolute;top:1px;right:1px;width:18px;height:18px;font-size:10px;background:var(--red);color:#fff;border-radius:50%" onclick="PartsModule._removeDrawing(${i})" aria-label="Remove drawing"><i class="fa-solid fa-xmark"></i></button>
      </div>
    `).join('');
  },

  showPartDetail(id) {
    const p = this.parts.find(x => x.id === id);
    if (!p) return;

    const loc = this.locations.find(l => l.id === p.locationId);
    const vendor = this.vendors.find(v => v.id === p.vendorId);
    const drawings = p.drawings || [];
    const st = stockStatus(p.inStock || 0, p.needed || 0);
    const refPhoto = p.refPhotos?.[st.status];

    openModal(escapeHTML(p.name), `
      <div class="tab-group mb-4">
        <button class="tab-btn active" onclick="PartsModule._switchDetailTab('info', this)">Info</button>
        <button class="tab-btn" onclick="PartsModule._switchDetailTab('drawings', this)">Drawings (${drawings.length})</button>
        <button class="tab-btn" onclick="PartsModule._switchDetailTab('sketch', this); PartsModule._initSketchCanvas();">Sketch Pad</button>
      </div>

      <div id="partDetailInfo">
        ${p.photo ? `<img src="${p.photo}" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-bottom:12px;cursor:zoom-in" onclick="showLightbox(this.src)" alt="Photo of ${escapeAttr(p.name)}">` : ''}
        <div class="grid-2" style="gap:12px">
          <div><span class="text-muted text-xs">Category</span><div>${escapeHTML(p.category || '—')}</div></div>
          <div><span class="text-muted text-xs">Vendor</span><div>${vendor ? escapeHTML(vendor.name) : '—'}${p.buyUrl ? ` <a href="${escapeAttr(p.buyUrl)}" target="_blank" rel="noopener" class="text-accent" style="margin-left:6px"><i class="fa-solid fa-cart-shopping"></i> Buy</a>` : ''}</div></div>
          <div><span class="text-muted text-xs">Location</span><div>${escapeHTML(loc?.name || '—')}${p.containerId ? ` › ${escapeHTML(p.containerId)}` : ''}</div></div>
          <div><span class="text-muted text-xs">Unit Cost</span><div>${formatCurrency(p.unitCost)}</div></div>
          <div><span class="text-muted text-xs">Stock / Baseline</span><div>${getStockChip(p.inStock || 0, p.needed || 0, p.id)}</div></div>
          <div><span class="text-muted text-xs">Status</span><div class="text-sm">${escapeHTML(st.label)}</div></div>
        </div>
        ${refPhoto ? `<div class="mt-3"><span class="text-muted text-xs">Reference — current status (${st.status} baseline)</span><img src="${refPhoto}" style="width:100%;max-height:160px;object-fit:cover;border-radius:8px;margin-top:4px;cursor:zoom-in;border:1px solid var(--border)" onclick="showLightbox(this.src)"></div>` : ''}
        ${p.description ? `<div class="mt-3"><span class="text-muted text-xs">Description</span><p class="text-sm">${escapeHTML(p.description)}</p></div>` : ''}
        ${p.onshapeUrl ? `<a href="${escapeAttr(p.onshapeUrl)}" target="_blank" class="btn btn-secondary btn-sm mt-3"><i class="fa-solid fa-cube"></i> Open in Onshape</a>` : ''}
      </div>

      <div id="partDetailDrawings" style="display:none">
        ${drawings.length === 0 ? '<div class="empty-state" style="padding:30px"><p>No drawings attached.</p></div>' : `
          <div class="grid-2" style="gap:8px">
            ${drawings.map(d => `<img src="${d}" style="width:100%;border-radius:6px;border:1px solid var(--border);cursor:zoom-in" onclick="showLightbox(this.src)" alt="Drawing">`).join('')}
          </div>
        `}
        ${p.onshapeUrl ? `<a href="${escapeAttr(p.onshapeUrl)}" target="_blank" class="btn btn-secondary btn-sm mt-3"><i class="fa-solid fa-cube"></i> Open in Onshape</a>` : ''}
      </div>

      <div id="partDetailSketch" style="display:none">
        <p class="text-sm text-muted mb-2">Draw a quick sketch or diagram for this part.</p>
        <div class="sketch-canvas-wrap">
          <canvas id="sketchCanvas" width="400" height="300" style="display:block;width:100%;cursor:crosshair" aria-label="Sketch drawing canvas"></canvas>
        </div>
        <div class="sketch-actions">
          <button class="btn btn-ghost" onclick="PartsModule._clearSketch()"><i class="fa-solid fa-eraser"></i> Clear</button>
          <button class="btn btn-primary" onclick="PartsModule._saveSketch('${p.id}')"><i class="fa-solid fa-floppy-disk"></i> Save to Drawings</button>
        </div>
      </div>
    `, `
      ${p.locationId ? `<button class="btn btn-secondary" onclick="closeModal();PartsModule.findPart('${p.id}')"><i class="fa-solid fa-route"></i> Find Part</button>` : ''}
      <div style="flex:1"></div>
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
    `);
  },

  _switchDetailTab(tab, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('partDetailInfo').style.display = tab === 'info' ? '' : 'none';
    document.getElementById('partDetailDrawings').style.display = tab === 'drawings' ? '' : 'none';
    document.getElementById('partDetailSketch').style.display = tab === 'sketch' ? '' : 'none';
  },

  _initSketchCanvas() {
    const canvas = document.getElementById('sketchCanvas');
    if (!canvas || canvas.dataset.init) return;
    canvas.dataset.init = 'true';
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

    const start = (e) => { e.preventDefault(); drawing = true; const { x, y } = getPos(e); ctx.beginPath(); ctx.moveTo(x, y); };
    const move = (e) => { e.preventDefault(); if (!drawing) return; const { x, y } = getPos(e); ctx.lineTo(x, y); ctx.stroke(); };
    const stop = (e) => { if (e.cancelable) e.preventDefault(); drawing = false; };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', stop);
    canvas.addEventListener('mouseout', stop);

    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', stop);
  },

  _clearSketch() {
    const canvas = document.getElementById('sketchCanvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  },

  async _saveSketch(id) {
    const canvas = document.getElementById('sketchCanvas');
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const p = this.parts.find(x => x.id === id);
    if (!p) return;

    p.drawings = p.drawings || [];
    p.drawings.push(dataUrl);
    await DB.put('parts', p);
    toast('Sketch saved to drawings!', 'success');
    HistoryModule.log('update', 'part', id, p.name, 'Added sketch');

    this._clearSketch();
    closeModal();
    this.showPartDetail(id);
  },

  async findPart(id) {
    // Delegate to WorkspaceModule
    if (!WorkspaceModule.parts || !WorkspaceModule.locations) {
      WorkspaceModule.parts = await DB.getAll('parts');
      WorkspaceModule.locations = await DB.getAll('locations');
    }
    WorkspaceModule.showWalkToPartModal(id);
  },

  async deletePart(id) {
    if (!confirm('Are you sure you want to delete this part?')) return;
    const part = this.parts.find(p => p.id === id);
    await DB.delete('parts', id);
    HistoryModule.log('delete', 'part', id, part?.name || '');
    toast('Part deleted', 'success');
    await this.loadData();
    this.renderView();
  },

  // ── Import / Export ──
  exportCSV() {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    let csv = 'Name,Category,In Stock,Baseline,Unit Cost,Vendor,Buy Link,Location,Container,Description,Onshape URL\n';
    this.parts.forEach(p => {
      const loc = this.locations.find(l => l.id === p.locationId)?.name || '';
      const vendor = this.vendors.find(v => v.id === p.vendorId)?.name || '';
      csv += [p.name, p.category || '', p.inStock || 0, p.needed || 0, p.unitCost || 0, vendor, p.buyUrl || '', loc, p.containerId || '', p.description || '', p.onshapeUrl || ''].map(esc).join(',') + '\n';
    });
    downloadFile('parts-library.csv', csv, 'text/csv');
    toast('CSV exported', 'success');
  },

  exportJSON() {
    const out = this.parts.map(p => ({
      name: p.name, category: p.category || '', inStock: p.inStock || 0, baseline: p.needed || 0,
      unitCost: p.unitCost || 0,
      vendor: this.vendors.find(v => v.id === p.vendorId)?.name || '',
      buyUrl: p.buyUrl || '',
      location: this.locations.find(l => l.id === p.locationId)?.name || '',
      container: p.containerId || '',
      description: p.description || '', onshapeUrl: p.onshapeUrl || ''
    }));
    downloadFile('parts-library.json', JSON.stringify(out, null, 2), 'application/json');
    toast('JSON exported', 'success');
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
          name: col(['name']), category: col(['category']), inStock: col(['in stock', 'stock']),
          baseline: col(['baseline', 'needed']), cost: col(['cost']), vendor: col(['vendor']),
          buyUrl: col(['buy', 'link', 'url']), location: col(['location']),
          container: col(['container']), description: col(['description', 'notes']), onshape: col(['onshape', 'cad'])
        };
        if (ci.name === -1) return toast('CSV needs a "Name" column', 'error');
        rows = parsed.slice(1).map(r => ({
          name: r[ci.name], category: r[ci.category], inStock: r[ci.inStock], baseline: r[ci.baseline],
          unitCost: r[ci.cost], vendor: r[ci.vendor], buyUrl: r[ci.buyUrl], location: r[ci.location],
          container: r[ci.container], description: r[ci.description], onshapeUrl: r[ci.onshape]
        }));
      } else {
        const data = JSON.parse(text);
        rows = Array.isArray(data) ? data : (data.parts || []);
      }

      let added = 0, updated = 0;
      for (const r of rows) {
        const name = (r.name || '').trim();
        if (!name) continue;
        const loc = r.location ? this.locations.find(l => l.name.toLowerCase() === String(r.location).toLowerCase()) : null;
        const vendor = r.vendor ? this.vendors.find(v => v.name.toLowerCase() === String(r.vendor).toLowerCase()) : null;
        const existing = this.parts.find(p => p.name.toLowerCase() === name.toLowerCase());
        const patch = {
          name,
          category: (r.category || '').trim() || existing?.category || '',
          inStock: r.inStock !== undefined && r.inStock !== '' ? (parseInt(r.inStock) || 0) : (existing?.inStock || 0),
          needed: (r.baseline ?? r.needed) !== undefined && (r.baseline ?? r.needed) !== '' ? (parseInt(r.baseline ?? r.needed) || 0) : (existing?.needed || 0),
          unitCost: r.unitCost !== undefined && r.unitCost !== '' ? (parseFloat(r.unitCost) || 0) : (existing?.unitCost || 0),
          vendorId: vendor ? vendor.id : (existing?.vendorId || null),
          buyUrl: (r.buyUrl || '').trim() || existing?.buyUrl || null,
          locationId: loc ? loc.id : (existing?.locationId || null),
          containerId: (r.container || '').trim() || existing?.containerId || null,
          description: (r.description || '').trim() || existing?.description || '',
          onshapeUrl: (r.onshapeUrl || '').trim() || existing?.onshapeUrl || null
        };
        if (existing) {
          await DB.put('parts', { ...existing, ...patch });
          updated++;
        } else {
          await DB.add('parts', { ...patch, photo: null, drawings: [] });
          added++;
        }
      }
      HistoryModule.log('update', 'part', 'import', 'Parts import', `${added} added, ${updated} updated`);
      toast(`Imported: ${added} added, ${updated} updated`, 'success');
      await this.loadData();
      this.renderView();
    } catch (err) {
      console.error(err);
      toast('Import failed: ' + err.message, 'error');
    }
  }
};

window.PartsModule = PartsModule;
