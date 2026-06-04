// projects.js
const ProjectsModule = {
  async render(container) {
    this.container = container;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    this.projects = await DB.getAll('projects');
    this.tasks = await DB.getAll('tasks');
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
      grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1"><i class="fa-solid fa-folder-open"></i><h3>No projects found</h3><p>Get started by adding your first project.</p></div>`;
      return;
    }

    grid.innerHTML = topProjects.map(p => {
      const subCount = this.projects.filter(sub => sub.parentId === p.id).length;
      const projTasks = this.tasks.filter(t => t.projectId === p.id);
      const doneTasks = projTasks.filter(t => t.status === 'done').length;
      const progress = projTasks.length ? Math.round((doneTasks / projTasks.length) * 100) : 0;
      
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
              <span><i class="fa-solid fa-folder-tree"></i> ${subCount} sub-projects</span>
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
            <option value="">None (Top-level)</option>
            ${parentOptions}
          </select>
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

    const proj = {
      name,
      description: document.getElementById('projDesc').value.trim(),
      status: document.getElementById('projStatus').value,
      deadline: document.getElementById('projDeadline').value ? new Date(document.getElementById('projDeadline').value).getTime() : null,
      parentId: document.getElementById('projParent').value || null
    };

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
    const boms = await DB.getAllByIndex('bom_items', 'projectId', p.id);
    const parts = await DB.getAll('parts');
    const projTasks = this.tasks.filter(t => t.projectId === p.id);

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
        <button class="tab active" onclick="ProjectsModule.switchTab('subs', this)">Sub-projects (${subs.length})</button>
        <button class="tab" onclick="ProjectsModule.switchTab('bom', this)">BOM (${boms.length})</button>
        <button class="tab" onclick="ProjectsModule.switchTab('tasks', this)">Tasks (${projTasks.length})</button>
      </div>

      <div id="tabContent"></div>
    `;

    this.tabData = { subs, boms, parts, projTasks };
    this.switchTab('subs', document.querySelector('.tab.active'));
  },

  switchTab(tab, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');

    const content = document.getElementById('tabContent');
    if (tab === 'subs') {
      content.innerHTML = `
        <div class="mb-4 text-right">
          <button class="btn btn-secondary" onclick="ProjectsModule.showAddModal('${this.currentProject.id}')"><i class="fa-solid fa-plus"></i> Add Sub-project</button>
        </div>
        ${this.tabData.subs.length === 0 ? '<div class="empty-state"><p>No sub-projects</p></div>' : `
          <div class="grid-3">
            ${this.tabData.subs.map(sub => `
              <div class="card p-4">
                <h4 style="font-weight:600">${escapeHTML(sub.name)}</h4>
                <p class="text-sm text-muted truncate mt-2">${escapeHTML(sub.description)}</p>
                <div class="mt-3"><span class="badge badge-gray">${sub.status || 'active'}</span></div>
              </div>
            `).join('')}
          </div>
        `}
      `;
    } else if (tab === 'bom') {
      content.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Part</th><th>Qty</th><th>Status</th></tr></thead>
            <tbody>
              ${this.tabData.boms.map(b => {
                const part = this.tabData.parts.find(pt => pt.id === b.partId);
                return `<tr>
                  <td>${escapeHTML(part ? part.name : 'Unknown')}</td>
                  <td>${b.qtyNeeded}</td>
                  <td><span class="badge badge-gray">${b.status}</span></td>
                </tr>`;
              }).join('') || '<tr><td colspan="3" class="text-center">No BOM items</td></tr>'}
            </tbody>
          </table>
        </div>
      `;
    } else if (tab === 'tasks') {
      content.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Task</th><th>Priority</th><th>Status</th></tr></thead>
            <tbody>
              ${this.tabData.projTasks.map(t => `
                <tr>
                  <td>${escapeHTML(t.title)}</td>
                  <td><span class="priority-dot priority-${t.priority}"></span> ${t.priority}</td>
                  <td><span class="badge badge-gray">${t.status}</span></td>
                </tr>
              `).join('') || '<tr><td colspan="3" class="text-center">No tasks</td></tr>'}
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

    // Clone subs
    const subs = this.projects.filter(sub => sub.parentId === id);
    for (const sub of subs) {
      const newSub = { ...sub };
      delete newSub.id;
      newSub.parentId = newId;
      await DB.add('projects', newSub);
    }

    // Clone BOM
    const boms = await DB.getAllByIndex('bom_items', 'projectId', id);
    for (const b of boms) {
      const newB = { ...b };
      delete newB.id;
      newB.projectId = newId;
      newB.status = 'not_started'; // reset status
      await DB.add('bom_items', newB);
    }

    // Clone Tasks
    const projTasks = this.tasks.filter(t => t.projectId === id);
    for (const t of projTasks) {
      const newT = { ...t };
      delete newT.id;
      newT.projectId = newId;
      newT.status = 'todo'; // reset status
      await DB.add('tasks', newT);
    }

    toast('Project duplicated successfully!', 'success');
    await this.loadData();
    this.showDetail(newId);
  }
};
