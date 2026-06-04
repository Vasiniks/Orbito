// vendors.js
const VendorsModule = {
  async render(container) {
    this.container = container;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    this.vendors = await DB.getAll('vendors');
    this.parts = await DB.getAll('parts');
  },

  renderView() {
    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="vendorsSearch" placeholder="Search vendors...">
          </div>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-primary" id="addVendorBtn"><i class="fa-solid fa-plus"></i> Add Vendor</button>
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
    const filtered = this.vendors.filter(v => v.name.toLowerCase().includes(q));

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1"><i class="fa-solid fa-store"></i><h3>No vendors found</h3><p>Add some vendors to link with your parts.</p></div>`;
      return;
    }

    grid.innerHTML = filtered.map(v => {
      const partsCount = this.parts.filter(p => p.vendorId === v.id).length;
      return `
        <div class="card" style="cursor:pointer" onclick="VendorsModule.showDetail('${v.id}')">
          <div class="card-body">
            <div class="flex items-center justify-between mb-3">
              <h3 style="font-size:15px;font-weight:600" class="truncate">${escapeHTML(v.name)}</h3>
              <div class="avatar" style="background:var(--blue-dim);color:var(--blue)"><i class="fa-solid fa-store"></i></div>
            </div>
            ${v.website ? `<a href="${escapeHTML(v.website)}" target="_blank" class="text-sm text-accent truncate block mb-2" onclick="event.stopPropagation()">${escapeHTML(v.website)}</a>` : ''}
            <div class="text-xs text-muted mb-4 truncate"><i class="fa-solid fa-phone"></i> ${escapeHTML(v.contact || 'No contact info')}</div>
            <p class="text-sm text-muted truncate mb-3">${escapeHTML(v.notes || '')}</p>
            <div class="text-xs text-muted"><span class="badge badge-gray">${partsCount} parts</span></div>
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
          <input type="text" class="form-input" id="vendorName" value="${escapeHTML(v.name || '')}" required>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Website</label>
            <input type="url" class="form-input" id="vendorWeb" value="${escapeHTML(v.website || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Contact Info (Phone/Email)</label>
            <input type="text" class="form-input" id="vendorContact" value="${escapeHTML(v.contact || '')}">
          </div>
        </div>
        <div class="form-group mt-2">
          <label class="form-label">Notes</label>
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
    const vParts = this.parts.filter(p => p.vendorId === v.id);

    this.container.innerHTML = `
      <div class="mb-4">
        <button class="btn btn-ghost mb-4" onclick="VendorsModule.currentVendor=null; VendorsModule.renderView()"><i class="fa-solid fa-arrow-left"></i> Back to Vendors</button>
        <div class="flex items-center justify-between">
          <div>
            <h2 style="font-size:24px;font-weight:700">${escapeHTML(v.name)}</h2>
            ${v.website ? `<a href="${escapeHTML(v.website)}" target="_blank" class="text-accent mt-1 block">${escapeHTML(v.website)}</a>` : ''}
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary" onclick="VendorsModule.showAddModal('${v.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="btn btn-danger" onclick="VendorsModule.deleteVendor('${v.id}')"><i class="fa-solid fa-trash"></i> Delete</button>
          </div>
        </div>
      </div>
      
      <div class="grid-2 mb-4">
        <div class="card p-4">
          <div class="text-xs text-muted uppercase tracking-wider mb-2">Contact Info</div>
          <div>${escapeHTML(v.contact || 'No contact info provided')}</div>
        </div>
        <div class="card p-4">
          <div class="text-xs text-muted uppercase tracking-wider mb-2">Notes</div>
          <div>${escapeHTML(v.notes || 'No notes')}</div>
        </div>
      </div>

      <h3 style="font-size:16px;font-weight:600;margin:24px 0 16px">Parts from this Vendor (${vParts.length})</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Photo</th><th>Name</th><th>Category</th><th>Unit Cost</th></tr></thead>
          <tbody>
            ${vParts.map(p => `
              <tr>
                <td style="width:50px">
                  <div style="width:32px;height:32px;border-radius:4px;background:var(--bg-3);overflow:hidden">
                    ${p.photo ? `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover">` : ''}
                  </div>
                </td>
                <td>${escapeHTML(p.name)}</td>
                <td><span class="badge badge-gray">${escapeHTML(p.category || '—')}</span></td>
                <td>${formatCurrency(p.unitCost)}</td>
              </tr>
            `).join('') || '<tr><td colspan="4" class="text-center">No parts linked to this vendor</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  },

  async deleteVendor(id) {
    if (!confirm('Delete this vendor?')) return;
    const v = this.vendors.find(x => x.id === id);
    await DB.delete('vendors', id);
    if (v) HistoryModule.log('delete', 'vendor', id, v.name);
    toast('Vendor deleted', 'success');
    this.currentVendor = null;
    await this.loadData();
    this.renderView();
  }
};
