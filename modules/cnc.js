// cnc.js — machine queue: every part waiting on a machine, CNC first
const CncModule = {
  machineFilter: 'cnc', // cnc | lathe | mill | print | all
  showFinished: false,

  MACHINE_TABS: [
    { key: 'cnc',   label: 'CNC',        icon: 'fa-gears' },
    { key: 'lathe', label: 'Lathe',      icon: 'fa-circle-notch' },
    { key: 'mill',  label: 'Manual Mill', icon: 'fa-industry' },
    { key: 'print', label: '3D Printer', icon: 'fa-cube' },
    { key: 'all',   label: 'All Machines', icon: 'fa-list' },
  ],

  async render(container) {
    this.container = container;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    [this.projects, this.parts, this.boms] = await Promise.all([
      DB.getAll('projects'),
      DB.getAll('parts'),
      DB.getAll('bom_items')
    ]);
  },

  machineMatch(filter, proc) {
    const p = (proc || '').toLowerCase();
    switch (filter) {
      case 'cnc':   return p.includes('cnc') || p.includes('router');
      case 'lathe': return p.includes('lathe');
      case 'mill':  return p.includes('mill') && !p.includes('cnc');
      case 'print': return p.includes('print');
      default:      return !!p && !p.includes('purchase') && !p.includes('order');
    }
  },

  renderView() {
    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="filter-chips" id="cncMachineChips">
            ${this.MACHINE_TABS.map(t => `
              <button class="filter-chip ${this.machineFilter === t.key ? 'active' : ''}" onclick="CncModule.setMachine('${t.key}')">
                <i class="fa-solid ${t.icon}" aria-hidden="true"></i> ${t.label}
              </button>`).join('')}
          </div>
        </div>
        <div class="toolbar-right">
          <label class="filter-chip" style="display:inline-flex;align-items:center;gap:7px;cursor:pointer">
            <input type="checkbox" id="cncShowFinished" ${this.showFinished ? 'checked' : ''} style="accent-color:var(--accent)"> Show finished
          </label>
          <button class="btn btn-secondary btn-sm" onclick="CncModule.exportCSV()"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
        </div>
      </div>
      <div id="cncContent"></div>
    `;
    document.getElementById('cncShowFinished').addEventListener('change', (e) => {
      this.showFinished = e.target.checked;
      this.renderList();
    });
    this.renderList();
  },

  setMachine(key) {
    this.machineFilter = key;
    this.renderView();
  },

  queueItems() {
    return this.boms
      .filter(b => this.machineMatch(this.machineFilter, b.process))
      .filter(b => b.status !== 'not_used')
      .filter(b => this.showFinished || !BOM_DONE_STATUSES.includes(b.status))
      .map(b => ({ b, part: this.parts.find(p => p.id === b.partId), proj: this.projects.find(p => p.id === b.projectId) }))
      .sort((x, y) => (x.b.partNumber || '￿').localeCompare(y.b.partNumber || '￿', undefined, { numeric: true }));
  },

  renderList() {
    const content = document.getElementById('cncContent');
    const items = this.queueItems();
    const machineLabel = this.MACHINE_TABS.find(t => t.key === this.machineFilter)?.label || 'Machine';

    // Queue stats on the full (unfinished-only aware) list
    const waiting = items.filter(({ b }) => !BOM_DONE_STATUSES.includes(b.status)).length;

    if (items.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-gears"></i>
          <h3>${machineLabel} queue is clear</h3>
          <p>${this.showFinished ? 'No BOM items use this machine yet.' : 'Nothing waiting — every item on this machine is done. Toggle "Show finished" to see completed parts.'}</p>
        </div>`;
      return;
    }

    content.innerHTML = `
      <p class="text-sm text-muted mb-3">${waiting} part${waiting === 1 ? '' : 's'} in the ${machineLabel} queue. Click a status to update it as parts come off the machine.</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Part #</th>
              <th>Part</th>
              <th>Subsystem</th>
              <th>Material</th>
              <th>Machine</th>
              <th class="text-right">Qty</th>
              <th>Assigned</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(({ b, part, proj }) => {
              const st = BOM_STATUS_MAP[b.status] || BOM_STATUS_MAP[bomLadder(b)[0]];
              const isDone = BOM_DONE_STATUSES.includes(b.status);
              const rowCls = isDone ? 'row-not-used' : '';
              const color = proj?.parentId ? subsystemColor(proj) : 'gray';
              return `
                <tr class="${rowCls}">
                  <td data-label="Part #">${getPartNumberChip(b.partNumber, color)}</td>
                  <td data-label="Part" style="font-weight:500">${escapeHTML(part?.name || 'Unknown Part')}${b.comments ? ` <i class="fa-solid fa-comment text-muted" style="font-size:10px" title="${escapeHTML(b.comments)}"></i>` : ''}</td>
                  <td data-label="Subsystem">${getSubsystemChip(proj, proj?.name || '?')}</td>
                  <td data-label="Material">${getMaterialChip(b.material)}</td>
                  <td data-label="Machine">${getProcessChip(b.process)}</td>
                  <td data-label="Qty" class="text-right">${b.qtyNeeded}</td>
                  <td data-label="Assigned">${b.assignee ? `<span class="text-sm">${escapeHTML(b.assignee)}</span>` : '<span class="text-muted">—</span>'}</td>
                  <td data-label="Status">
                    <button class="badge badge-${st.class} bom-status-btn" onclick="event.stopPropagation();CncModule.pickStatus('${b.id}', this)" title="Change status" aria-haspopup="menu">${st.label} <i class="fa-solid fa-angle-down" style="font-size:9px;opacity:0.7" aria-hidden="true"></i></button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  pickStatus(id, anchor) {
    const item = this.boms.find(b => b.id === id);
    if (!item) return;
    showStatusMenu(anchor, item.status, async (status) => {
      if (status === item.status) return;
      item.status = status;
      try {
        await DB.put('bom_items', item);
        const part = this.parts.find(p => p.id === item.partId);
        HistoryModule.log('update', 'bom_item', id, part?.name || 'Unknown Part', `Status → ${BOM_STATUS_MAP[status].label}`);
        toast(`${part?.name || 'Item'}: ${BOM_STATUS_MAP[status].label}`, 'success');
        this.renderList();
      } catch (err) {
        toast('Error updating status', 'error');
      }
    });
  },

  exportCSV() {
    const items = this.queueItems();
    const machineLabel = this.MACHINE_TABS.find(t => t.key === this.machineFilter)?.label || 'machines';
    const esc = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
    let csv = 'Part Number,Part Name,Subsystem,Material,Machine,Qty,Assigned To,Status\n';
    items.forEach(({ b, part, proj }) => {
      csv += [b.partNumber, part?.name || 'Unknown', proj?.name || '', b.material, b.process, b.qtyNeeded, b.assignee, BOM_STATUS_MAP[b.status]?.label || b.status].map(esc).join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${machineLabel.replace(/\s+/g, '-').toLowerCase()}-queue.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV Exported', 'success');
  }
};

window.CncModule = CncModule;
