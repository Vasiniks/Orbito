// parts.js — Parts Library: pure stock tracking with containers, quick +/- and import/export
const PartsModule = {
  sortField: 'name',
  sortDir: 1,
  selectedParts: new Set(),
  selectMode: false,
  containerFilter: 'all',

  async render(container) {
    this.container = container;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    this.parts = await DB.getAll('parts');
    this.locations = await DB.getAll('locations');
  },

  // Every container across all locations: {name, locId, locName, photo, x,y,w,h}
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

    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input type="text" id="partsSearch" placeholder="Search parts...">
          </div>
          <select class="form-select" style="width:120px" id="partsFilter" aria-label="Stock filter">
            <option value="all">All Stock</option>
            <option value="restock">Below Baseline</option>
          </select>
          <select class="form-select" style="width:130px" id="locFilter" aria-label="Location filter">
            <option value="all">All Locations</option>
            ${this.locations.map(l => `<option value="${l.id}" ${locFilterVal === l.id ? 'selected' : ''}>${escapeHTML(l.name)}</option>`).join('')}
          </select>
          <select class="form-select" style="width:140px" id="containerFilter" aria-label="Container filter">
            <option value="all">All Containers</option>
            ${containers.map(c => `<option value="${escapeAttr(c.name)}" ${this.containerFilter === c.name ? 'selected' : ''}>${escapeHTML(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-danger btn-sm" id="bulkDeleteBtn" style="display:none"><i class="fa-solid fa-trash"></i> Delete Selected</button>
          <button class="btn-icon ${this.selectMode ? 'active-toggle' : ''}" id="selectModeBtn" title="Select multiple" aria-label="Toggle selection mode"><i class="fa-solid fa-square-check" aria-hidden="true"></i></button>
          <button class="btn btn-secondary btn-sm" id="containersBtn"><i class="fa-solid fa-box"></i> Containers</button>
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
    document.getElementById('locFilter').addEventListener('change', (e) => {
      this._locFilter = e.target.value;
      this.containerFilter = 'all';
      this.renderView();
    });
    document.getElementById('containerFilter').addEventListener('change', (e) => {
      this.containerFilter = e.target.value;
      this.renderTable();
    });
    document.getElementById('selectModeBtn').addEventListener('click', () => {
      this.selectMode = !this.selectMode;
      if (!this.selectMode) this.selectedParts.clear();
      this.renderView();
    });
    document.getElementById('containersBtn').addEventListener('click', () => this.showContainersModal());
    document.getElementById('partsDataBtn').addEventListener('click', (e) => {
      showPopMenu(e.target.closest('button'), [
        { label: 'Export CSV', icon: 'fa-file-csv', onClick: () => this.exportCSV() },
        { label: 'Export JSON', icon: 'fa-file-code', onClick: () => this.exportJSON() },
        { sep: true },
        { label: 'Import CSV', icon: 'fa-file-import', onClick: () => this.importFile('csv') },
        { label: 'Import JSON', icon: 'fa-file-import', onClick: () => this.importFile('json') },
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
    const locFilter = document.getElementById('locFilter').value;
    const contFilter = document.getElementById('containerFilter').value;

    let filtered = this.parts.filter(p => p.name.toLowerCase().includes(query) || (p.category && p.category.toLowerCase().includes(query)));
    if (filter === 'restock') filtered = filtered.filter(p => (p.inStock || 0) < (p.needed || 0));
    if (locFilter !== 'all') filtered = filtered.filter(p => p.locationId === locFilter);
    if (contFilter !== 'all') filtered = filtered.filter(p => p.containerId === contFilter);

    filtered.sort((a, b) => {
      let va = a[this.sortField] || '';
      let vb = b[this.sortField] || '';
      if (this.sortField === 'location') {
        va = this.locations.find(l => l.id === a.locationId)?.name || '';
        vb = this.locations.find(l => l.id === b.locationId)?.name || '';
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
            <th style="width:50px">Photo</th>
            <th style="cursor:pointer" onclick="PartsModule.toggleSort('name')">Name ${this.getSortIcon('name')}</th>
            <th style="cursor:pointer" onclick="PartsModule.toggleSort('category')">Category ${this.getSortIcon('category')}</th>
            <th style="cursor:pointer" onclick="PartsModule.toggleSort('location')">Location ${this.getSortIcon('location')}</th>
            <th style="cursor:pointer" onclick="PartsModule.toggleSort('inStock')">Stock ${this.getSortIcon('inStock')}</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(p => {
            const loc = this.locations.find(l => l.id === p.locationId);
            const th = window.__stockThresholds || { high: 80, medium: 50, low: 10 };
            const perc = (p.needed || 0) ? ((p.inStock || 0) / p.needed) * 100 : 100;
            const nameCls = perc < th.low ? 'part-name-low' : perc < th.medium ? 'part-name-warn' : '';
            const rowCls = perc < th.low ? 'row-stock-low' : perc < th.medium ? 'row-stock-warn' : '';
            return `
              <tr class="${rowCls}">
                ${this.selectMode ? `<td><input type="checkbox" class="part-cb" value="${p.id}" ${this.selectedParts.has(p.id) ? 'checked' : ''} onchange="PartsModule.toggleSelect('${p.id}')" aria-label="Select ${escapeAttr(p.name)}"></td>` : ''}
                <td data-label="Photo">
                  ${p.photo
                    ? `<button class="part-thumb" onclick="showLightbox(this.querySelector('img').src)" title="Expand photo" aria-label="Expand photo of ${escapeAttr(p.name)}"><img src="${p.photo}" alt=""></button>`
                    : '<div class="part-thumb part-thumb-empty"><i class="fa-solid fa-image" aria-hidden="true"></i></div>'}
                </td>
                <td data-label="Name" style="font-weight:500">
                  <a href="#" class="${nameCls}" onclick="event.preventDefault();PartsModule.showPartDetail('${p.id}')" style="color:var(--text-0);text-decoration:none">${escapeHTML(p.name)}</a>
                  ${(p.drawings && p.drawings.length) || p.onshapeUrl ? '<i class="fa-solid fa-paperclip text-muted" style="margin-left:4px;font-size:10px" title="Has drawings"></i>' : ''}
                </td>
                <td data-label="Category"><span class="badge badge-gray">${escapeHTML(p.category || '—')}</span></td>
                <td data-label="Location">${escapeHTML(loc ? loc.name : '—')}${p.containerId ? `<span class="text-muted text-xs"> › ${escapeHTML(p.containerId)}</span>` : ''}</td>
                <td data-label="Stock">
                  <div class="qty-cell">
                    <button class="qty-btn" onclick="PartsModule.step('${p.id}', -1)" title="Remove one" aria-label="Decrease stock of ${escapeAttr(p.name)}">−</button>
                    ${getStockChip(p.inStock || 0, p.needed || 0, p.id)}
                    <button class="qty-btn" onclick="PartsModule.step('${p.id}', 1)" title="Add one" aria-label="Increase stock of ${escapeAttr(p.name)}">+</button>
                  </div>
                </td>
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

  // ── Containers ──
  async showContainersModal() {
    const containers = this.allContainers();
    const cards = containers.map(c => {
      const count = this.parts.filter(p => p.containerId === c.name && p.locationId === c.locId).length;
      return `
        <div class="container-card">
          <button class="container-card-photo" style="cursor:${c.photo ? 'zoom-in' : 'default'}" data-loc="${escapeAttr(c.locId)}" data-name="${escapeAttr(c.name)}" aria-label="Container photo">
            ${c.photo ? `<img src="${c.photo}" alt="">` : '<i class="fa-solid fa-box-open" aria-hidden="true"></i>'}
          </button>
          <div class="container-card-body">
            <div style="font-weight:600;font-size:13px" class="truncate">${escapeHTML(c.name)}</div>
            <div class="text-xs text-muted truncate"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${escapeHTML(c.locName)}</div>
            <div class="text-xs text-muted">${count} part${count === 1 ? '' : 's'}</div>
          </div>
          <div class="container-card-actions">
            <button class="btn btn-secondary btn-sm" data-view-loc="${escapeAttr(c.locId)}" data-view-name="${escapeAttr(c.name)}"><i class="fa-solid fa-list" aria-hidden="true"></i> Parts</button>
            <button class="btn-icon btn-sm" data-edit-loc="${escapeAttr(c.locId)}" data-edit-name="${escapeAttr(c.name)}" title="Edit container" aria-label="Edit container"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
          </div>
        </div>
      `;
    }).join('');

    openModal('Containers', `
      ${containers.length === 0 ? '<div class="empty-state" style="padding:24px"><i class="fa-solid fa-box-open"></i><h3>No containers yet</h3><p>Containers live inside a workspace zone and hold parts — a bin, drawer, or shelf.</p></div>'
        : `<div class="container-grid">${cards}</div>`}
    `, `
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" id="newContainerBtn"><i class="fa-solid fa-plus"></i> New Container</button>
    `);

    // Wire up photo clicks / view / edit without inline JS string headaches
    document.querySelectorAll('.container-card-photo').forEach(el => {
      el.addEventListener('click', () => {
        const c = this.allContainers().find(x => x.locId === el.dataset.loc && x.name === el.dataset.name);
        if (c?.photo) showLightbox(c.photo);
      });
    });
    document.querySelectorAll('[data-view-loc]').forEach(el => {
      el.addEventListener('click', () => {
        closeModal();
        this._locFilter = el.dataset.viewLoc;
        this.containerFilter = el.dataset.viewName;
        this.renderView();
      });
    });
    document.querySelectorAll('[data-edit-loc]').forEach(el => {
      el.addEventListener('click', () => this.showContainerForm(el.dataset.editLoc, el.dataset.editName));
    });
    document.getElementById('newContainerBtn').addEventListener('click', () => this.showContainerForm());
  },

  showContainerForm(locId = null, name = null) {
    const editing = !!(locId && name);
    const loc = editing ? this.locations.find(l => l.id === locId) : null;
    const existing = editing ? (loc?.containers || []).find(c => c.name === name) : null;

    openModal(editing ? 'Edit Container' : 'New Container', `
      <div class="form-group">
        <label class="form-label">Container Name</label>
        <input type="text" class="form-input" id="contName" value="${escapeAttr(existing?.name || '')}" placeholder="e.g. Bin A3, Gearbox Drawer">
      </div>
      <div class="form-group">
        <label class="form-label">Location (in shop)</label>
        <select class="form-select" id="contLoc" ${editing ? 'disabled' : ''}>
          ${this.locations.map(l => `<option value="${l.id}" ${l.id === locId ? 'selected' : ''}>${escapeHTML(l.name)}</option>`).join('')}
        </select>
        ${this.locations.length === 0 ? '<div class="form-hint" style="color:var(--red)">No zones yet — create one on the Workspace Map first.</div>' : ''}
      </div>
      <div class="form-group">
        <label class="form-label">Photo <span class="text-muted">(what/where it is)</span></label>
        <label class="photo-upload" id="contPhotoUpload" style="aspect-ratio:2/1">
          ${existing?.photo ? `<img src="${existing.photo}">` : '<i class="fa-solid fa-camera"></i><span>Upload</span>'}
          <input type="file" accept="image/*" id="contPhotoInput">
        </label>
      </div>
    `, `
      ${editing ? `<button class="btn btn-danger btn-sm" id="deleteContBtn"><i class="fa-solid fa-trash"></i> Delete</button><div style="flex:1"></div>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="saveContBtn">${editing ? 'Save' : 'Create'}</button>
    `);

    let photo = existing?.photo || null;
    document.getElementById('contPhotoInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        photo = await readFileAsDataURL(file);
        document.getElementById('contPhotoUpload').innerHTML = `<img src="${photo}"><input type="file" accept="image/*" id="contPhotoInput2">`;
        document.getElementById('contPhotoInput2').addEventListener('change', async (e2) => {
          const f2 = e2.target.files[0];
          if (f2) { photo = await readFileAsDataURL(f2); document.querySelector('#contPhotoUpload img').src = photo; }
        });
      }
    });

    document.getElementById('saveContBtn').addEventListener('click', async () => {
      const newName = document.getElementById('contName').value.trim();
      const targetLocId = editing ? locId : document.getElementById('contLoc').value;
      const targetLoc = this.locations.find(l => l.id === targetLocId);
      if (!newName) return toast('Name is required', 'error');
      if (!targetLoc) return toast('Pick a location', 'error');

      targetLoc.containers = targetLoc.containers || [];
      const dupe = targetLoc.containers.find(c => c.name.toLowerCase() === newName.toLowerCase() && (!editing || c.name !== name));
      if (dupe) return toast('A container with that name already exists here', 'error');

      if (editing) {
        const c = targetLoc.containers.find(x => x.name === name);
        if (!c) return;
        const oldName = c.name;
        c.name = newName;
        c.photo = photo;
        // Keep part references in sync on rename
        if (oldName !== newName) {
          for (const p of this.parts.filter(x => x.locationId === targetLocId && x.containerId === oldName)) {
            p.containerId = newName;
            await DB.put('parts', p);
          }
        }
      } else {
        targetLoc.containers.push({ name: newName, photo });
      }
      await DB.put('locations', targetLoc);
      HistoryModule.log(editing ? 'update' : 'create', 'container', targetLocId, newName);
      toast(editing ? 'Container saved' : 'Container created', 'success');
      closeModal();
      await this.loadData();
      this.showContainersModal();
    });

    document.getElementById('deleteContBtn')?.addEventListener('click', async () => {
      const used = this.parts.filter(p => p.locationId === locId && p.containerId === name).length;
      if (used > 0) return toast(`${used} part${used === 1 ? ' is' : 's are'} in this container — move them first.`, 'error');
      if (!confirm('Delete this container?')) return;
      loc.containers = (loc.containers || []).filter(c => c.name !== name);
      await DB.put('locations', loc);
      toast('Container deleted', 'success');
      closeModal();
      await this.loadData();
      this.showContainersModal();
    });
  },

  // ── Add / Edit part ──
  async showAddModal() {
    this.showEditModal(null);
  },

  async showEditModal(id) {
    const p = id ? this.parts.find(x => x.id === id) : {};

    const locOpts = this.locations.map(l => `<option value="${l.id}" ${l.id === p.locationId ? 'selected' : ''}>${escapeHTML(l.name)}</option>`).join('');
    const selectedLoc = this.locations.find(l => l.id === p.locationId);
    const containerOpts = (selectedLoc?.containers || []).map(c => `<option value="${escapeAttr(c.name)}" ${c.name === p.containerId ? 'selected' : ''}>${escapeHTML(c.name)}</option>`).join('');

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
            </div>
            <div class="form-group">
              <label class="form-label">Category</label>
              <input type="text" class="form-input" id="partCategory" value="${escapeAttr(p.category || '')}">
            </div>
          </div>
        </div>
        <div class="form-group mt-3">
          <label class="form-label">Description</label>
          <textarea class="form-textarea" id="partDesc">${escapeHTML(p.description || '')}</textarea>
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
            <div class="form-hint">Stock colors compare against this.</div>
          </div>
          <div class="form-group">
            <label class="form-label">Unit Cost ($)</label>
            <input type="number" step="0.01" class="form-input" id="partCost" value="${p.unitCost || ''}">
          </div>
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

    document.getElementById('partPhotoInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        currentPhoto = await readFileAsDataURL(file);
        document.getElementById('partPhotoUpload').innerHTML = `<img src="${currentPhoto}"><input type="file" accept="image/*" id="partPhotoInput">`;
      }
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

      const data = {
        id: p.id,
        name,
        category: document.getElementById('partCategory').value.trim(),
        description: document.getElementById('partDesc').value.trim(),
        locationId: document.getElementById('partLocation').value || null,
        containerId: document.getElementById('partContainer').value || null,
        unitCost: parseFloat(document.getElementById('partCost').value) || 0,
        inStock: parseInt(document.getElementById('partInStock').value) || 0,
        needed: parseInt(document.getElementById('partNeeded').value) || 0,
        photo: currentPhoto,
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
    const drawings = p.drawings || [];

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
          <div><span class="text-muted text-xs">Location</span><div>${escapeHTML(loc?.name || '—')}${p.containerId ? ` › ${escapeHTML(p.containerId)}` : ''}</div></div>
          <div><span class="text-muted text-xs">Stock / Baseline</span><div>${getStockChip(p.inStock || 0, p.needed || 0, p.id)}</div></div>
          <div><span class="text-muted text-xs">Unit Cost</span><div>${formatCurrency(p.unitCost)}</div></div>
        </div>
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
    let csv = 'Name,Category,In Stock,Baseline,Unit Cost,Location,Container,Description,Onshape URL\n';
    this.parts.forEach(p => {
      const loc = this.locations.find(l => l.id === p.locationId)?.name || '';
      csv += [p.name, p.category || '', p.inStock || 0, p.needed || 0, p.unitCost || 0, loc, p.containerId || '', p.description || '', p.onshapeUrl || ''].map(esc).join(',') + '\n';
    });
    downloadFile('parts-library.csv', csv, 'text/csv');
    toast('CSV exported', 'success');
  },

  exportJSON() {
    const out = this.parts.map(p => ({
      name: p.name, category: p.category || '', inStock: p.inStock || 0, baseline: p.needed || 0,
      unitCost: p.unitCost || 0,
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
          baseline: col(['baseline', 'needed']), cost: col(['cost']), location: col(['location']),
          container: col(['container']), description: col(['description', 'notes']), onshape: col(['onshape', 'cad'])
        };
        if (ci.name === -1) return toast('CSV needs a "Name" column', 'error');
        rows = parsed.slice(1).map(r => ({
          name: r[ci.name], category: r[ci.category], inStock: r[ci.inStock], baseline: r[ci.baseline],
          unitCost: r[ci.cost], location: r[ci.location], container: r[ci.container],
          description: r[ci.description], onshapeUrl: r[ci.onshape]
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
        const existing = this.parts.find(p => p.name.toLowerCase() === name.toLowerCase());
        const patch = {
          name,
          category: (r.category || '').trim() || existing?.category || '',
          inStock: r.inStock !== undefined && r.inStock !== '' ? (parseInt(r.inStock) || 0) : (existing?.inStock || 0),
          needed: (r.baseline ?? r.needed) !== undefined && (r.baseline ?? r.needed) !== '' ? (parseInt(r.baseline ?? r.needed) || 0) : (existing?.needed || 0),
          unitCost: r.unitCost !== undefined && r.unitCost !== '' ? (parseFloat(r.unitCost) || 0) : (existing?.unitCost || 0),
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
