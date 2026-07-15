// vendors.js — vendor directory: info, links, and the parts you buy from each
const VendorsModule = {
  async render(container) {
    this.container = container;
    await this.loadData();
    if (this.currentVendor) {
      const still = this.vendors.find(v => v.id === this.currentVendor.id);
      if (still) return this.showDetail(still.id);
      this.currentVendor = null;
    }
    this.renderView();
  },

  async loadData() {
    [this.vendors, this.parts] = await Promise.all([
      DB.getAll('vendors'),
      DB.getAll('parts')
    ]);
  },

  renderView() {
    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input type="text" id="vendorsSearch" placeholder="Search vendors...">
          </div>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-primary btn-sm" id="addVendorBtn"><i class="fa-solid fa-plus"></i> Add Vendor</button>
        </div>
      </div>
      <div id="vendorsGrid" class="grid-auto"></div>
    `;

    document.getElementById('addVendorBtn').addEventListener('click', () => this.showAddModal());
    document.getElementById('vendorsSearch').addEventListener('input', debounce((e) => this.renderGrid(e.target.value), 250));

    this.renderGrid();
  },

  renderGrid(query = '') {
    const grid = document.getElementById('vendorsGrid');
    const q = query.toLowerCase();
    const filtered = this.vendors.filter(v => v.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1"><i class="fa-solid fa-store"></i><h3>No vendors found</h3><p>Add vendors so parts can link to who sells them.</p><button class="btn btn-primary" onclick="VendorsModule.showAddModal()"><i class="fa-solid fa-plus"></i> Add Vendor</button></div>`;
      return;
    }

    grid.innerHTML = filtered.map(v => {
      const vParts = this.parts.filter(p => p.vendorId === v.id);
      const low = vParts.filter(p => stockStatus(p.inStock || 0, p.needed || 0).status === 'below').length;
      return `
        <div class="card" style="cursor:pointer" onclick="VendorsModule.showDetail('${v.id}')">
          <div class="card-body">
            <div class="flex items-center justify-between mb-3">
              <h3 style="font-size:15px;font-weight:600" class="truncate">${escapeHTML(v.name)}</h3>
              <div class="avatar" style="background:var(--blue-dim);color:var(--blue)"><i class="fa-solid fa-store"></i></div>
            </div>
            ${v.website ? `<a href="${escapeAttr(v.website)}" target="_blank" rel="noopener" class="text-sm text-accent truncate mb-2" style="display:block" onclick="event.stopPropagation()"><i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px"></i> ${escapeHTML(v.website.replace(/^https?:\/\//, ''))}</a>` : ''}
            <div class="text-xs text-muted mb-3 truncate"><i class="fa-solid fa-phone"></i> ${escapeHTML(v.contact || 'No contact info')}</div>
            <div class="flex gap-2">
              <span class="badge badge-gray">${vParts.length} part${vParts.length === 1 ? '' : 's'}</span>
              ${low ? `<span class="badge badge-red">${low} below baseline</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  async showAddModal(id = null) {
    const v = id ? this.vendors.find(x => x.id === id) : {};
    const body = `
      <form id="vendorForm">
        <div class="form-group">
          <label class="form-label">Name</label>
          <input type="text" class="form-input" id="vendorName" value="${escapeAttr(v.name || '')}" required>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Website / Store Link</label>
            <input type="url" class="form-input" id="vendorWeb" value="${escapeAttr(v.website || '')}" placeholder="https://…">
          </div>
          <div class="form-group">
            <label class="form-label">Contact Info (Phone/Email)</label>
            <input type="text" class="form-input" id="vendorContact" value="${escapeAttr(v.contact || '')}">
          </div>
        </div>
        <div class="form-group mt-2">
          <label class="form-label">Notes <span class="text-muted">(shipping times, account numbers, discounts…)</span></label>
          <textarea class="form-textarea" id="vendorNotes">${escapeHTML(v.notes || '')}</textarea>
        </div>
      </form>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="VendorsModule.saveVendor('${id || ''}', this)">Save Vendor</button>
    `;
    openModal(id ? 'Edit Vendor' : 'Add Vendor', body, footer);
  },

  async saveVendor(id, btn) {
    if (btn) btn.disabled = true;
    const name = document.getElementById('vendorName').value.trim();
    if (!name) {
      if (btn) btn.disabled = false;
      return toast('Name is required', 'error');
    }

    const data = {
      id: id || undefined,
      name,
      website: document.getElementById('vendorWeb').value.trim(),
      contact: document.getElementById('vendorContact').value.trim(),
      notes: document.getElementById('vendorNotes').value.trim()
    };

    try {
      if (id) {
        await DB.put('vendors', data);
        HistoryModule.log('update', 'vendor', id, data.name);
        toast('Vendor updated', 'success');
      } else {
        const newId = await DB.add('vendors', data);
        HistoryModule.log('create', 'vendor', newId || data.id || 'new', data.name);
        toast('Vendor added', 'success');
      }

      closeModal();
      await this.loadData();
      if (this.currentVendor && this.currentVendor.id === id) {
        this.showDetail(id);
      } else {
        this.renderView();
      }
    } catch (err) {
      if (btn) btn.disabled = false;
      toast('Error saving vendor', 'error');
    }
  },

  showDetail(id) {
    this.currentVendor = this.vendors.find(v => v.id === id);
    if (!this.currentVendor) return this.renderView();

    const v = this.currentVendor;
    const vParts = this.parts.filter(p => p.vendorId === v.id).sort((a, b) => a.name.localeCompare(b.name));

    this.container.innerHTML = `
      <div class="mb-4">
        <button class="btn btn-ghost mb-4" onclick="VendorsModule.currentVendor=null; VendorsModule.renderView()"><i class="fa-solid fa-arrow-left"></i> Back to Vendors</button>
        <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:12px">
          <div>
            <h2 style="font-size:24px;font-weight:700">${escapeHTML(v.name)}</h2>
            ${v.website ? `<a href="${escapeAttr(v.website)}" target="_blank" rel="noopener" class="text-accent mt-1" style="display:inline-block"><i class="fa-solid fa-arrow-up-right-from-square" style="font-size:11px"></i> ${escapeHTML(v.website)}</a>` : ''}
          </div>
          <div class="flex gap-2">
            ${v.website ? `<a href="${escapeAttr(v.website)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm"><i class="fa-solid fa-cart-shopping"></i> Visit Store</a>` : ''}
            <button class="btn btn-secondary btn-sm" onclick="VendorsModule.showAddModal('${v.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="btn btn-danger btn-sm" onclick="VendorsModule.deleteVendor('${v.id}')"><i class="fa-solid fa-trash"></i> Delete</button>
          </div>
        </div>
      </div>

      <div class="grid-2 mb-4">
        <div class="card"><div class="card-body">
          <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Contact Info</div>
          <div class="text-sm">${escapeHTML(v.contact || 'No contact info provided')}</div>
        </div></div>
        <div class="card"><div class="card-body">
          <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Notes</div>
          <div class="text-sm">${escapeHTML(v.notes || 'No notes')}</div>
        </div></div>
      </div>

      <h3 style="font-size:15px;font-weight:600;margin:20px 0 12px">Parts from ${escapeHTML(v.name)} (${vParts.length})</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th style="width:50px">Photo</th><th>Name</th><th>Category</th><th>Stock</th><th class="text-right">Unit Cost</th><th class="text-right">Buy</th></tr></thead>
          <tbody>
            ${vParts.length === 0 ? '<tr><td colspan="6" class="text-center" style="padding:24px;color:var(--text-3)">No parts linked to this vendor yet — set the vendor on a part in the Parts Library.</td></tr>' : vParts.map(p => `
              <tr class="${stockStatus(p.inStock || 0, p.needed || 0).status === 'below' ? 'row-stock-low' : ''}">
                <td data-label="Photo">${p.photo ? `<button class="part-thumb" onclick="showLightbox(this.querySelector('img').src)" aria-label="Expand photo"><img src="${safeImageSrc(p.photo)}" alt=""></button>` : '<div class="part-thumb part-thumb-empty"><i class="fa-solid fa-image" aria-hidden="true"></i></div>'}</td>
                <td data-label="Name" style="font-weight:500"><a href="#" onclick="event.preventDefault();navigate('parts').then(()=>PartsModule.showPartDetail('${p.id}'))" style="color:var(--text-0);text-decoration:none">${escapeHTML(p.name)}</a></td>
                <td data-label="Category"><span class="badge badge-gray">${escapeHTML(p.category || '—')}</span></td>
                <td data-label="Stock">${getStockChip(p.inStock || 0, p.needed || 0, p.id)}</td>
                <td data-label="Unit Cost" class="text-right">${formatCurrency(p.unitCost)}</td>
                <td data-label="Buy" class="text-right">${p.buyUrl ? `<a href="${escapeAttr(p.buyUrl)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm"><i class="fa-solid fa-cart-shopping"></i> Buy</a>` : '<span class="text-muted">—</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  async deleteVendor(id) {
    if (!confirm('Delete this vendor? Parts keep their data but lose the vendor link.')) return;
    const v = this.vendors.find(x => x.id === id);
    await DB.delete('vendors', id);
    if (v) HistoryModule.log('delete', 'vendor', id, v.name);
    toast('Vendor deleted', 'success');
    this.currentVendor = null;
    await this.loadData();
    this.renderView();
  }
};

window.VendorsModule = VendorsModule;
