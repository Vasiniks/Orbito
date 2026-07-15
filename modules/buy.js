// buy.js — Buy List: everything below baseline, with vendors, links, and cost estimates
const BuyModule = {
  vendorFilter: 'all',

  async render(container) {
    this.container = container;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    [this.parts, this.vendors] = await Promise.all([
      DB.getAll('parts'),
      DB.getAll('vendors')
    ]);
  },

  // Parts below baseline, with how many to buy to get back to baseline
  buyRows() {
    return this.parts
      .filter(p => stockStatus(p.inStock || 0, p.needed || 0).status === 'below')
      .map(p => ({
        p,
        need: Math.max(0, (p.needed || 0) - (p.inStock || 0)),
        vendor: this.vendors.find(v => v.id === p.vendorId) || null
      }))
      .filter(r => this.vendorFilter === 'all'
        || (this.vendorFilter === 'none' ? !r.vendor : r.vendor?.id === this.vendorFilter))
      .sort((a, b) => {
        const va = a.vendor?.name || '￿';
        const vb = b.vendor?.name || '￿';
        if (va !== vb) return va.localeCompare(vb);
        return a.p.name.localeCompare(b.p.name);
      });
  },

  renderView() {
    const rows = this.buyRows();
    const allBelow = this.parts.filter(p => stockStatus(p.inStock || 0, p.needed || 0).status === 'below');
    const total = rows.reduce((s, r) => s + r.need * (r.p.unitCost || 0), 0);
    const noVendorCount = allBelow.filter(p => !this.vendors.find(v => v.id === p.vendorId)).length;

    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <select class="form-select" style="width:180px" id="buyVendorFilter" aria-label="Vendor filter">
            <option value="all">All Vendors</option>
            ${this.vendors.map(v => `<option value="${v.id}" ${this.vendorFilter === v.id ? 'selected' : ''}>${escapeHTML(v.name)}</option>`).join('')}
            ${noVendorCount ? `<option value="none" ${this.vendorFilter === 'none' ? 'selected' : ''}>No vendor set</option>` : ''}
          </select>
          <span class="text-sm text-muted">${rows.length} part${rows.length === 1 ? '' : 's'} to buy${total > 0 ? ` · est. ${formatCurrency(total)}` : ''}</span>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-secondary btn-sm" onclick="BuyModule.exportCSV()"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
        </div>
      </div>

      ${rows.length === 0 ? `
        <div class="empty-state">
          <i class="fa-solid fa-cart-shopping"></i>
          <h3>Nothing to buy</h3>
          <p>${allBelow.length === 0 ? 'Every part is at or above its baseline. Nice.' : 'No parts match this vendor filter.'}</p>
        </div>` : `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:50px">Photo</th>
                <th>Part</th>
                <th>Category</th>
                <th>Stock</th>
                <th class="text-right">To Buy</th>
                <th>Vendor</th>
                <th class="text-right">Est. Cost</th>
                <th class="text-right">Link</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(({ p, need, vendor }) => `
                <tr>
                  <td data-label="Photo">${p.photo ? `<button class="part-thumb" onclick="showLightbox(this.querySelector('img').src)" aria-label="Expand photo"><img src="${safeImageSrc(p.photo)}" alt=""></button>` : '<div class="part-thumb part-thumb-empty"><i class="fa-solid fa-image" aria-hidden="true"></i></div>'}</td>
                  <td data-label="Part" style="font-weight:500"><a href="#" onclick="event.preventDefault();navigate('parts').then(()=>PartsModule.showPartDetail('${p.id}'))" style="color:var(--text-0);text-decoration:none">${escapeHTML(p.name)}</a></td>
                  <td data-label="Category"><span class="badge badge-gray">${escapeHTML(p.category || '—')}</span></td>
                  <td data-label="Stock">${getStockChip(p.inStock || 0, p.needed || 0, p.id)}</td>
                  <td data-label="To Buy" class="text-right" style="font-weight:700">${need}</td>
                  <td data-label="Vendor">${vendor ? `<span class="chip chip-vendor"><i class="fa-solid fa-store" aria-hidden="true"></i>${escapeHTML(vendor.name)}</span>` : '<span class="text-muted">—</span>'}</td>
                  <td data-label="Est. Cost" class="text-right">${p.unitCost ? formatCurrency(need * p.unitCost) : '—'}</td>
                  <td data-label="Link" class="text-right">
                    ${p.buyUrl ? `<a href="${escapeAttr(p.buyUrl)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm"><i class="fa-solid fa-cart-shopping"></i> Buy</a>`
                      : vendor?.website ? `<a href="${escapeAttr(vendor.website)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm"><i class="fa-solid fa-store"></i> Store</a>`
                      : '<span class="text-muted">—</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <p class="text-xs text-muted mt-3">"To Buy" restores each part to its baseline. Set buy links and vendors on parts in the Parts Library.</p>`}
    `;

    document.getElementById('buyVendorFilter').addEventListener('change', (e) => {
      this.vendorFilter = e.target.value;
      this.renderView();
    });
  },

  exportCSV() {
    const rows = this.buyRows();
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    let csv = 'Part,Category,In Stock,Baseline,To Buy,Vendor,Unit Cost,Est. Cost,Buy Link\n';
    rows.forEach(({ p, need, vendor }) => {
      csv += [p.name, p.category || '', p.inStock || 0, p.needed || 0, need, vendor?.name || '', p.unitCost || 0, (need * (p.unitCost || 0)).toFixed(2), p.buyUrl || vendor?.website || ''].map(esc).join(',') + '\n';
    });
    downloadFile('buy-list.csv', csv, 'text/csv');
    toast('Buy list exported', 'success');
  }
};

window.BuyModule = BuyModule;
