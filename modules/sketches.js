const SketchesModule = {
  async render(container) {
    this.container = container;
    this.container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading Sketches...</p></div>`;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    this.parts = await DB.getAll('parts');
  },

  renderView() {
    let sketches = [];
    this.parts.forEach(p => {
      if (p.drawings && p.drawings.length > 0) {
        p.drawings.forEach(d => {
          sketches.push({ partId: p.id, partName: p.name, image: d });
        });
      }
    });

    if (sketches.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-pen-nib"></i>
          <h3>No Sketches Found</h3>
          <p>Add sketches or drawings to parts to see them here.</p>
        </div>
      `;
      return;
    }

    this.container.innerHTML = `
      <div class="toolbar" style="margin-bottom: 20px;">
        <div class="toolbar-left">
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="sketchSearch" placeholder="Filter sketches by part name...">
          </div>
        </div>
        <div class="toolbar-right">
          <span class="text-sm text-muted">${sketches.length} Total Sketches</span>
        </div>
      </div>
      <div class="grid-4" id="sketchesGrid" style="gap: 16px;"></div>
    `;

    this.sketches = sketches;
    document.getElementById('sketchSearch').addEventListener('input', debounce(() => this.renderGrid(), 200));
    this.renderGrid();
  },

  renderGrid() {
    const query = document.getElementById('sketchSearch').value.toLowerCase();
    const filtered = this.sketches.filter(s => s.partName.toLowerCase().includes(query));
    
    const grid = document.getElementById('sketchesGrid');
    
    if (filtered.length === 0) {
      grid.innerHTML = `<div class="text-muted" style="grid-column: 1 / -1; text-align: center; padding: 40px;">No sketches match your search.</div>`;
      return;
    }

    grid.innerHTML = filtered.map(s => `
      <div class="card" style="cursor:pointer; overflow:hidden; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'" onclick="navigate('parts').then(()=>PartsModule.showPartDetail('${s.partId}'))">
        <div style="aspect-ratio: 4/3; background: var(--bg-1); display: flex; align-items: center; justify-content: center; border-bottom: 1px solid var(--border);">
          <img src="${safeImageSrc(s.image)}" style="max-width: 100%; max-height: 100%; object-fit: contain;">
        </div>
        <div class="card-body" style="padding: 12px;">
          <div class="text-sm font-medium truncate">${escapeHTML(s.partName)}</div>
        </div>
      </div>
    `).join('');
  }
};

window.SketchesModule = SketchesModule;
