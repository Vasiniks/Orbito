// projects.js
const ProjectsModule = {
  async render(container) {
    this.container = container;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    this.projects = await DB.getAll('projects');
    this.allBoms = await DB.getAll('bom_items');
  },

  renderView() {
    const topProjects = this.projects.filter(p => !p.parentId);

    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="projectsSearch" placeholder="Search projects...">
          </div>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-primary" id="addProjectBtn"><i class="fa-solid fa-plus"></i> Add Project</button>
        </div>
      </div>
      <div id="projectsGrid" class="grid-3"></div>
    `;

    document.getElementById('addProjectBtn').addEventListener('click', () => this.showAddModal());
    document.getElementById('projectsSearch').addEventListener('input', debounce((e) => this.renderGrid(e.target.value), 250));

    this.renderGrid();
  },

  renderGrid(query = '') {
    const grid = document.getElementById('projectsGrid');
    const q = query.toLowerCase();
    const topProjects = this.projects.filter(p => !p.parentId && p.name.toLowerCase().includes(q));

    if (topProjects.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1"><i class="fa-solid fa-folder-open"></i><h3>No projects found</h3><p>Get started by adding your first project.</p><button class="btn btn-primary" onclick="ProjectsModule.showAddModal()"><i class="fa-solid fa-plus"></i> Add Project</button></div>`;
      return;
    }

    grid.innerHTML = topProjects.map(p => {
      const subCount = this.projects.filter(sub => sub.parentId === p.id).length;
      const famIds = [p.id, ...this.projects.filter(sub => sub.parentId === p.id).map(s => s.id)];
      const famBoms = this.allBoms.filter(b => famIds.includes(b.projectId) && b.status !== 'not_used');
      const doneBoms = famBoms.filter(b => BOM_DONE_STATUSES.includes(b.status)).length;
      const progress = famBoms.length ? Math.round((doneBoms / famBoms.length) * 100) : 0;
      
      return `
        <div class="card" style="cursor:pointer" onclick="ProjectsModule.showDetail('${p.id}')">
          <div class="card-body">
            <div class="flex items-center justify-between mb-4">
              <h3 style="font-size:16px;font-weight:600" class="truncate">${escapeHTML(p.name)}</h3>
              <span class="badge badge-${p.status === 'active' ? 'green' : p.status === 'completed' ? 'blue' : 'gray'}">${p.status || 'active'}</span>
            </div>
            <p class="text-sm text-muted mb-4 truncate">${escapeHTML(p.description || 'No description')}</p>
            <div class="flex items-center justify-between text-xs text-muted mb-2">
              <span><i class="fa-regular fa-calendar"></i> ${formatDate(p.deadline)}</span>
              <span><i class="fa-solid fa-diagram-project"></i> ${subCount} subsystem${subCount === 1 ? '' : 's'}</span>
            </div>
            <div class="progress-bar mt-3">
              <div class="progress-fill" style="width:${progress}%"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  async showAddModal(parentId = null) {
    const parentOptions = this.projects.filter(p => !p.parentId).map(p => `<option value="${p.id}" ${p.id === parentId ? 'selected' : ''}>${escapeHTML(p.name)}</option>`).join('');
    
    const body = `
      <form id="projectForm">
        <div class="form-group">
          <label class="form-label">Name</label>
          <input type="text" class="form-input" id="projName" required>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea class="form-textarea" id="projDesc"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-select" id="projStatus">
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="paused">Paused</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Deadline</label>
            <input type="date" class="form-input" id="projDeadline">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Parent Project (Optional)</label>
          <select class="form-select" id="projParent">
            <option value="">None (Top-level project)</option>
            ${parentOptions}
          </select>
          <div class="form-hint">Pick a parent to make this a subsystem (e.g. Elevator or Arm inside Robot). Subsystems get their own BOM and spreadsheet.</div>
        </div>
      </form>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ProjectsModule.saveProject(this)">Save Project</button>
    `;
    openModal('Add Project', body, footer);
  },

  async saveProject(btn) {
    if (btn) btn.disabled = true;
    const name = document.getElementById('projName').value.trim();
    if (!name) {
      if (btn) btn.disabled = false;
      return toast('Name is required', 'error');
    }

    const parentId = document.getElementById('projParent').value || null;
    const proj = {
      name,
      description: document.getElementById('projDesc').value.trim(),
      status: document.getElementById('projStatus').value,
      deadline: document.getElementById('projDeadline').value ? new Date(document.getElementById('projDeadline').value).getTime() : null,
      parentId
    };

    // Subsystems get a numeric code (100, 200, …) used to auto-number parts
    if (parentId) {
      const siblingCodes = this.projects
        .filter(p => p.parentId === parentId)
        .map(p => parseInt(p.code))
        .filter(n => !isNaN(n));
      proj.code = String((siblingCodes.length ? Math.max(...siblingCodes) : 0) + 100);
    }

    try {
      await DB.add('projects', proj);
      toast('Project added', 'success');
      closeModal();
      await this.loadData();
      
      if (this.currentProject) {
        this.showDetail(this.currentProject.id);
      } else {
        this.renderView();
      }
    } catch (err) {
      if (btn) btn.disabled = false;
      toast('Error saving project', 'error');
    }
  },

  async showDetail(id) {
    this.currentProject = this.projects.find(p => p.id === id);
    if (!this.currentProject) return this.renderView();

    const p = this.currentProject;
    const subs = this.projects.filter(sub => sub.parentId === p.id);
    const allBoms = await DB.getAll('bom_items');
    const famIds = [p.id, ...subs.map(s => s.id)];
    const boms = allBoms.filter(b => famIds.includes(b.projectId));
    const parts = await DB.getAll('parts');

    this.container.innerHTML = `
      <div class="mb-4">
        <button class="btn btn-ghost mb-4" onclick="ProjectsModule.currentProject=null; ProjectsModule.renderView()"><i class="fa-solid fa-arrow-left"></i> Back to Projects</button>
        <div class="flex items-center justify-between">
          <div>
            <h2 style="font-size:24px;font-weight:700">${escapeHTML(p.name)}</h2>
            <p class="text-muted mt-2">${escapeHTML(p.description || 'No description')}</p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary" onclick="ProjectsModule.duplicateProject('${p.id}')"><i class="fa-solid fa-copy"></i> Duplicate</button>
            <button class="btn btn-danger" onclick="ProjectsModule.deleteProject('${p.id}')"><i class="fa-solid fa-trash"></i> Delete</button>
          </div>
        </div>
      </div>

      <div class="tabs">
        <button class="tab active" onclick="ProjectsModule.switchTab('subs', this)">Subsystems (${subs.length})</button>
        <button class="tab" onclick="ProjectsModule.switchTab('bom', this)">Parts (${boms.length})</button>
      </div>

      <div id="tabContent"></div>
    `;

    this.tabData = { subs, boms, parts, allBoms };
    this.switchTab('subs', document.querySelector('.tab.active'));
  },

  switchTab(tab, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');

    const content = document.getElementById('tabContent');
    if (tab === 'subs') {
      content.innerHTML = `
        <div class="mb-4 flex items-center justify-between" style="flex-wrap:wrap;gap:8px">
          <p class="text-sm text-muted">Each subsystem gets its own BOM and spreadsheet; the project rolls them all up.</p>
          <button class="btn btn-secondary" onclick="ProjectsModule.showAddModal('${this.currentProject.id}')"><i class="fa-solid fa-plus"></i> Add Subsystem</button>
        </div>
        ${this.tabData.subs.length === 0 ? '<div class="empty-state"><i class="fa-solid fa-diagram-project"></i><h3>No subsystems yet</h3><p>Break this project into systems like Elevator, Arm, or Drivetrain — each gets its own BOM and spreadsheet.</p></div>' : `
          <div class="grid-3">
            ${this.tabData.subs.map(sub => {
              const subBoms = this.tabData.allBoms ? this.tabData.allBoms.filter(b => b.projectId === sub.id) : [];
              const subColor = subsystemColor(sub);
              return `
              <div class="card" style="border-top:3px solid var(--${subColor === 'amber' ? 'accent' : subColor})">
                <div class="card-body">
                  <div class="flex items-center justify-between mb-2">
                    <h4 style="font-weight:600" class="truncate">${sub.code ? `<span class="pn mono tint-${subColor}" style="margin-right:6px">${escapeHTML(sub.code)}</span>` : ''}${escapeHTML(sub.name)}</h4>
                    <span class="badge badge-gray">${sub.status || 'active'}</span>
                  </div>
                  <p class="text-sm text-muted truncate">${escapeHTML(sub.description || 'No description')}</p>
                  <div class="text-xs text-muted mt-2">${subBoms.length} BOM item${subBoms.length === 1 ? '' : 's'}</div>
                  <div class="flex gap-2 mt-3" style="padding-top:12px;border-top:1px solid var(--border)">
                    <button class="btn btn-secondary btn-sm" onclick="SpreadsheetModule.pendingScope='${sub.id}';navigate('spreadsheet')"><i class="fa-solid fa-table-cells"></i> Spreadsheet</button>
                  </div>
                </div>
              </div>
            `;}).join('')}
          </div>
        `}
      `;
    } else if (tab === 'bom') {
      const boms = this.tabData.boms;
      const done = boms.filter(b => BOM_DONE_STATUSES.includes(b.status)).length;
      const active = boms.filter(b => b.status !== 'not_used').length;
      const pct = active ? Math.round((done / active) * 100) : 0;
      const statusMap = BOM_STATUS_MAP;
      // Index parts by id so the BOM table joins in O(1) per row rather than
      // scanning the full parts list for every line.
      const partById = new Map(this.tabData.parts.map(p => [p.id, p]));
      content.innerHTML = `
        ${boms.length > 0 ? `
          <div class="flex items-center gap-3 mb-4" style="flex-wrap:wrap">
            <div style="flex:1;min-width:200px">
              <div class="flex items-center justify-between text-xs text-muted" style="margin-bottom:4px"><span>${done} of ${active} done</span><span style="font-weight:700;color:var(--text-0)">${pct}%</span></div>
              <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="SpreadsheetModule.pendingScope='${this.currentProject.id}';navigate('spreadsheet')"><i class="fa-solid fa-table-cells"></i> Open Spreadsheet</button>
          </div>
        ` : ''}
        <div class="table-wrap">
          <table>
            <thead><tr><th>Part</th>${this.tabData.subs.length ? '<th>Subsystem</th>' : ''}<th>Type</th><th>Qty</th><th>Status</th></tr></thead>
            <tbody>
              ${boms.map(b => {
                const part = partById.get(b.partId);
                const st = statusMap[b.status] || statusMap['not_started'];
                const sub = this.tabData.subs.find(s => s.id === b.projectId);
                const subCell = this.tabData.subs.length ? `<td data-label="Subsystem"><span class="chip"><i class="fa-solid fa-diagram-project" aria-hidden="true"></i>${sub ? escapeHTML(sub.name) : 'Main'}</span></td>` : '';
                return `<tr>
                  <td data-label="Part">${escapeHTML(part ? part.name : 'Unknown')}</td>
                  ${subCell}
                  <td data-label="Type"><span class="badge badge-${b.type === 'inhouse' ? 'purple' : 'cyan'}">${b.type === 'inhouse' ? 'In-house' : 'COTS'}</span></td>
                  <td data-label="Qty">${b.qtyNeeded}</td>
                  <td data-label="Status"><span class="badge badge-${st.class}">${st.label}</span></td>
                </tr>`;
              }).join('') || `<tr><td colspan="${this.tabData.subs.length ? 5 : 4}" class="text-center" style="padding:24px;color:var(--text-3)">No parts tracked yet — open the Master Spreadsheet to add some.</td></tr>`}
            </tbody>
          </table>
        </div>
      `;
    }
  },

  async deleteProject(id) {
    if (!confirm('Delete this project and all sub-projects?')) return;
    
    const subs = this.projects.filter(sub => sub.parentId === id);
    for (const sub of subs) await DB.delete('projects', sub.id);
    
    await DB.delete('projects', id);
    toast('Project deleted', 'success');
    this.currentProject = null;
    await this.loadData();
    this.renderView();
  },

  async duplicateProject(id) {
    const p = this.projects.find(x => x.id === id);
    if (!p || !confirm(`Duplicate "${p.name}" as a new Project Template?`)) return;

    toast('Duplicating project...', 'info');

    // Clone parent
    const newProj = { ...p };
    delete newProj.id;
    newProj.name = newProj.name + ' (Copy)';
    const newId = await DB.add('projects', newProj);

    // Clone subsystems, keeping a map so their BOM items follow them
    const subs = this.projects.filter(sub => sub.parentId === id);
    const subIdMap = { [id]: newId };
    for (const sub of subs) {
      const newSub = { ...sub };
      delete newSub.id;
      newSub.parentId = newId;
      const newSubId = await DB.add('projects', newSub);
      subIdMap[sub.id] = newSubId;
    }

    // Clone BOM items for the project and every subsystem
    const allBoms = await DB.getAll('bom_items');
    const boms = allBoms.filter(b => subIdMap[b.projectId]);
    for (const b of boms) {
      const newB = { ...b };
      delete newB.id;
      newB.projectId = subIdMap[b.projectId];
      newB.status = 'not_started'; // reset status
      await DB.add('bom_items', newB);
    }

    toast('Project duplicated successfully!', 'success');
    await this.loadData();
    this.showDetail(newId);
  }
};
