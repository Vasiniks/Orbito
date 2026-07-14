// containers.js — dedicated Containers tab: bins/drawers/shelves with photos, locations, and their parts
const ContainersModule = {
  selected: null, // { locId, name } when viewing one container

  async render(container) {
    this.container = container;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    [this.parts, this.locations] = await Promise.all([
      DB.getAll('parts'),
      DB.getAll('locations')
    ]);
  },

  allContainers() {
    const out = [];
    this.locations.forEach(l => (l.containers || []).forEach(c => {
      out.push({ ...c, locId: l.id, locName: l.name });
    }));
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },

  partsIn(c) {
    return this.parts.filter(p => p.locationId === c.locId && p.containerId === c.name);
  },

  renderView() {
    if (this.selected) return this.renderDetail();

    const q = (this._q || '').toLowerCase();
    const locFilter = this._locFilter || 'all';
    let containers = this.allContainers();
    if (locFilter !== 'all') containers = containers.filter(c => c.locId === locFilter);
    if (q) containers = containers.filter(c => c.name.toLowerCase().includes(q));

    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input type="text" id="contSearch" placeholder="Search containers..." value="${escapeAttr(this._q || '')}">
          </div>
          <select class="form-select" style="width:150px" id="contLocFilter" aria-label="Location filter">
            <option value="all">All Locations</option>
            ${this.locations.map(l => `<option value="${l.id}" ${locFilter === l.id ? 'selected' : ''}>${escapeHTML(l.name)}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-primary btn-sm" id="newContBtn"><i class="fa-solid fa-plus"></i> New Container</button>
        </div>
      </div>
      ${containers.length === 0 ? `
        <div class="empty-state">
          <i class="fa-solid fa-box-open"></i>
          <h3>No containers${q || locFilter !== 'all' ? ' match' : ' yet'}</h3>
          <p>Containers live inside a workspace zone and hold parts — a bin, drawer, or shelf. Give each one a photo so Find Part can show the way.</p>
          <button class="btn btn-primary" onclick="ContainersModule.showForm()"><i class="fa-solid fa-plus"></i> New Container</button>
        </div>` : `
        <div class="grid-auto" id="containersGrid">
          ${containers.map(c => {
            const count = this.partsIn(c).length;
            const low = this.partsIn(c).filter(p => stockStatus(p.inStock || 0, p.needed || 0).status === 'below').length;
            return `
              <div class="card" style="overflow:hidden;cursor:pointer" onclick="ContainersModule.open('${escapeAttr(c.locId)}','${escapeAttr(c.name)}')">
                <div class="container-card-photo" style="aspect-ratio:5/2">
                  ${c.photo ? `<img src="${c.photo}" alt="">` : '<i class="fa-solid fa-box-open" aria-hidden="true"></i>'}
                </div>
                <div class="card-body" style="padding:12px 14px">
                  <div class="flex items-center justify-between gap-2">
                    <div style="font-weight:600" class="truncate">${escapeHTML(c.name)}</div>
                    <button class="btn-icon btn-sm" onclick="event.stopPropagation();ContainersModule.showForm('${escapeAttr(c.locId)}','${escapeAttr(c.name)}')" title="Edit container" aria-label="Edit ${escapeAttr(c.name)}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
                  </div>
                  <div class="text-xs text-muted truncate mt-2"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${escapeHTML(c.locName)}</div>
                  <div class="text-xs text-muted mt-2">${count} part${count === 1 ? '' : 's'}${low ? ` · <span style="color:var(--red)">${low} below baseline</span>` : ''}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>`}
    `;

    document.getElementById('contSearch').addEventListener('input', debounce((e) => { this._q = e.target.value; this.renderView(); }, 200));
    document.getElementById('contLocFilter').addEventListener('change', (e) => { this._locFilter = e.target.value; this.renderView(); });
    document.getElementById('newContBtn').addEventListener('click', () => this.showForm());
  },

  open(locId, name) {
    this.selected = { locId, name };
    this.renderDetail();
  },

  renderDetail() {
    const { locId, name } = this.selected;
    const loc = this.locations.find(l => l.id === locId);
    const c = (loc?.containers || []).find(x => x.name === name);
    if (!loc || !c) { this.selected = null; return this.renderView(); }
    const parts = this.partsIn({ locId, name });

    this.container.innerHTML = `
      <button class="btn btn-ghost mb-4" onclick="ContainersModule.selected=null;ContainersModule.renderView()"><i class="fa-solid fa-arrow-left"></i> All Containers</button>
      <div class="flex gap-4 mb-4" style="flex-wrap:wrap;align-items:flex-start">
        <div style="width:260px;max-width:100%">
          <div class="container-card-photo" style="aspect-ratio:4/3;border-radius:var(--radius-lg);border:1px solid var(--border);cursor:${c.photo ? 'zoom-in' : 'default'}" id="contDetailPhoto">
            ${c.photo ? `<img src="${c.photo}" alt="Photo of ${escapeAttr(c.name)}">` : '<i class="fa-solid fa-box-open" aria-hidden="true"></i>'}
          </div>
        </div>
        <div style="flex:1;min-width:220px">
          <h2 style="font-size:22px;font-weight:700">${escapeHTML(c.name)}</h2>
          <div class="text-sm text-muted mt-2"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${escapeHTML(loc.name)}</div>
          <div class="text-sm text-muted mt-2">${parts.length} part${parts.length === 1 ? '' : 's'} inside</div>
          <div class="flex gap-2 mt-3">
            <button class="btn btn-secondary btn-sm" onclick="ContainersModule.showForm('${escapeAttr(locId)}','${escapeAttr(name)}')"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="btn btn-secondary btn-sm" onclick="PartsModule._locFilter='${escapeAttr(locId)}';PartsModule.containerFilter='${escapeAttr(name)}';navigate('parts')"><i class="fa-solid fa-screwdriver-wrench"></i> Open in Parts Library</button>
          </div>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr><th style="width:50px">Photo</th><th>Name</th><th>Category</th><th>Stock</th></tr></thead>
          <tbody>
            ${parts.length === 0 ? '<tr><td colspan="4" class="text-center" style="padding:24px;color:var(--text-3)">No parts assigned to this container yet.</td></tr>' : parts.map(p => `
              <tr>
                <td data-label="Photo">${p.photo ? `<button class="part-thumb" onclick="showLightbox(this.querySelector('img').src)" aria-label="Expand photo"><img src="${p.photo}" alt=""></button>` : '<div class="part-thumb part-thumb-empty"><i class="fa-solid fa-image" aria-hidden="true"></i></div>'}</td>
                <td data-label="Name" style="font-weight:500"><a href="#" onclick="event.preventDefault();navigate('parts').then(()=>PartsModule.showPartDetail('${p.id}'))" style="color:var(--text-0);text-decoration:none">${escapeHTML(p.name)}</a></td>
                <td data-label="Category"><span class="badge badge-gray">${escapeHTML(p.category || '—')}</span></td>
                <td data-label="Stock">${getStockChip(p.inStock || 0, p.needed || 0, p.id)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Wire the photo lightbox without inlining the (huge) data URL
    const photoEl = document.getElementById('contDetailPhoto');
    if (c.photo && photoEl) {
      photoEl.onclick = () => showLightbox(c.photo);
    }
  },

  showForm(locId = null, name = null) {
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
    const wirePhotoInput = (inputId) => {
      document.getElementById(inputId)?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        photo = await readFileAsDataURL(file);
        document.getElementById('contPhotoUpload').innerHTML = `<img src="${photo}"><input type="file" accept="image/*" id="contPhotoInput2">`;
        wirePhotoInput('contPhotoInput2');
      });
    };
    wirePhotoInput('contPhotoInput');

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
          if (this.selected && this.selected.name === oldName) this.selected.name = newName;
        }
      } else {
        targetLoc.containers.push({ name: newName, photo });
      }
      await DB.put('locations', targetLoc);
      HistoryModule.log(editing ? 'update' : 'create', 'container', targetLocId, newName);
      toast(editing ? 'Container saved' : 'Container created', 'success');
      closeModal();
      await this.loadData();
      this.renderView();
    });

    document.getElementById('deleteContBtn')?.addEventListener('click', async () => {
      const used = this.parts.filter(p => p.locationId === locId && p.containerId === name).length;
      if (used > 0) return toast(`${used} part${used === 1 ? ' is' : 's are'} in this container — move them first.`, 'error');
      if (!confirm('Delete this container?')) return;
      loc.containers = (loc.containers || []).filter(c => c.name !== name);
      await DB.put('locations', loc);
      toast('Container deleted', 'success');
      closeModal();
      this.selected = null;
      await this.loadData();
      this.renderView();
    });
  }
};

window.ContainersModule = ContainersModule;
