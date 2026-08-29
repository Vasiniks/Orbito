// groups.js — organizing people into working groups for tasks.
// Deliberately separate from Accounts: these are shop assignments, not logins.
// A person here needs no account, and changing a group never touches a user's
// access. Structure: top-level groups (Build, Design, Programming) each holding
// sub-boxes (Prototyping, Manufacturing, …); people are chips dragged between
// boxes, or moved from the chip menu on touch devices.
const GROUP_POSITIONS = ['101', '201', 'Lead', 'Mentor'];
const GROUP_SUBTEAMS = ['Build', 'Design', 'Programming'];
const SUBTEAM_TINT = { Build: 'blue', Design: 'purple', Programming: 'green' };

const DEFAULT_GROUPS = [
  { name: 'Build', subs: ['Prototyping', 'Manufacturing'] },
  { name: 'Design', subs: ['CAD', 'Drawings'] },
  { name: 'Programming', subs: ['Software', 'Controls'] },
];

const GroupsModule = {
  async render(container) {
    this.container = container;
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading Groups…</p></div>`;
    await this.loadData();
    await this.seedIfEmpty();
    this.renderView();
  },

  async loadData() {
    [this.groups, this.people, this.users] = await Promise.all([
      DB.getAll('groups'),
      DB.getAll('group_people'),
      DB.getAll('users').catch(() => [])
    ]);
  },

  // First run: lay out the default boxes and bring the roster in as chips.
  async seedIfEmpty() {
    if (this.groups.length === 0) {
      const writes = [];
      DEFAULT_GROUPS.forEach((g, i) => {
        const parentId = uid();
        writes.push({ id: parentId, name: g.name, parentId: null, order: i });
        g.subs.forEach((sub, j) => writes.push({ id: uid(), name: sub, parentId, order: j }));
      });
      await Promise.all(writes.map(g => DB.put('groups', g)));
      this.groups = writes;
    }
    if (this.people.length === 0 && this.users.length) {
      const seeded = this.users
        .filter(u => u.status === 'approved' && u.name)
        .map((u, i) => ({
          id: uid(),
          name: u.name,
          subteams: [],
          position: u.role === 'Mentor' ? 'Mentor' : '101',
          groupId: null,
          order: i,
          userId: u.id || u.uid || null
        }));
      if (seeded.length) {
        await Promise.all(seeded.map(p => DB.put('group_people', p)));
        this.people = seeded;
      }
    }
  },

  topGroups() {
    return this.groups.filter(g => !g.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },
  subGroups(parentId) {
    return this.groups.filter(g => g.parentId === parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },
  peopleIn(groupId) {
    return this.people.filter(p => p.groupId === groupId).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  },
  unassigned() {
    const ids = new Set(this.groups.map(g => g.id));
    return this.people.filter(p => !p.groupId || !ids.has(p.groupId)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  },

  // ── rendering ──────────────────────────────────────────────────────────
  renderView() {
    const tops = this.topGroups();
    const pool = this.unassigned();

    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <p class="text-sm text-muted" style="margin:0">Drag a person onto a box to assign them. Separate from Accounts — no one's login changes.</p>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-secondary btn-sm" id="grpAddPerson"><i class="fa-solid fa-user-plus"></i> Add Person</button>
          <button class="btn btn-primary btn-sm" id="grpAddGroup"><i class="fa-solid fa-plus"></i> New Group</button>
        </div>
      </div>

      <div class="card grp-pool ${pool.length ? '' : 'grp-pool-empty'}" data-drop="">
        <div class="card-header" style="display:flex;align-items:center;gap:10px">
          <h3 style="margin:0">Unassigned</h3>
          <span class="ss-group-count">${pool.length}</span>
        </div>
        <div class="card-body grp-chips" data-drop="">
          ${pool.length ? pool.map(p => this.chipHTML(p)).join('') : '<span class="text-sm text-muted">Everyone is in a group. Drop a chip here to unassign.</span>'}
        </div>
      </div>

      ${tops.length === 0 ? `
        <div class="empty-state">
          <i class="fa-solid fa-people-group"></i>
          <h3>No groups yet</h3>
          <p>Groups organize who is working on what — Build, Design, Programming, and whatever your team needs.</p>
          <button class="btn btn-primary" onclick="GroupsModule.addGroup()"><i class="fa-solid fa-plus"></i> New Group</button>
        </div>` : `
        <div class="grp-grid">
          ${tops.map(g => this.groupCardHTML(g)).join('')}
        </div>`}
    `;

    document.getElementById('grpAddGroup').addEventListener('click', () => this.addGroup());
    document.getElementById('grpAddPerson').addEventListener('click', () => this.editPerson(null));
    this.wireDnD();
  },

  groupCardHTML(g) {
    const subs = this.subGroups(g.id);
    const direct = this.peopleIn(g.id);
    const total = direct.length + subs.reduce((n, s) => n + this.peopleIn(s.id).length, 0);
    return `
      <div class="card grp-card">
        <div class="grp-head">
          <h3>${escapeHTML(g.name)}</h3>
          <span class="ss-group-count">${total}</span>
          <div style="flex:1"></div>
          <button class="btn-icon btn-sm" onclick="GroupsModule.addSub('${g.id}')" title="Add a box inside" aria-label="Add box inside ${escapeAttr(g.name)}"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
          <button class="btn-icon btn-sm" onclick="GroupsModule.renameGroup('${g.id}')" title="Rename" aria-label="Rename ${escapeAttr(g.name)}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
          <button class="btn-icon btn-sm" style="color:var(--red)" onclick="GroupsModule.deleteGroup('${g.id}')" title="Delete" aria-label="Delete ${escapeAttr(g.name)}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
        </div>
        <div class="grp-body">
          <div class="grp-chips grp-direct" data-drop="${g.id}">
            ${direct.map(p => this.chipHTML(p)).join('') || '<span class="text-xs text-muted">Drop people here</span>'}
          </div>
          ${subs.length ? `<div class="grp-subs">
            ${subs.map(s => `
              <div class="grp-sub" data-drop="${s.id}">
                <div class="grp-sub-head">
                  <span class="grp-sub-name">${escapeHTML(s.name)}</span>
                  <span class="ss-group-count">${this.peopleIn(s.id).length}</span>
                  <div style="flex:1"></div>
                  <button class="btn-icon btn-sm" onclick="GroupsModule.renameGroup('${s.id}')" title="Rename box" aria-label="Rename ${escapeAttr(s.name)}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
                  <button class="btn-icon btn-sm" style="color:var(--red)" onclick="GroupsModule.deleteGroup('${s.id}')" title="Delete box" aria-label="Delete ${escapeAttr(s.name)}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
                </div>
                <div class="grp-chips" data-drop="${s.id}">
                  ${this.peopleIn(s.id).map(p => this.chipHTML(p)).join('') || '<span class="text-xs text-muted">Drop people here</span>'}
                </div>
              </div>`).join('')}
          </div>` : ''}
        </div>
      </div>`;
  },

  chipHTML(p) {
    const tint = SUBTEAM_TINT[(p.subteams || [])[0]] || '';
    const meta = [...(p.subteams || []), p.position].filter(Boolean).join(' · ');
    return `
      <button class="grp-chip ${tint ? 'tint-' + tint : ''}" draggable="true" data-person="${escapeAttr(p.id)}"
              onclick="GroupsModule.editPerson('${p.id}')" title="Edit ${escapeAttr(p.name)}">
        <i class="fa-solid fa-grip-vertical grp-chip-grip" aria-hidden="true"></i>
        <span class="grp-chip-name">${escapeHTML(p.name)}</span>
        ${meta ? `<span class="grp-chip-meta">${escapeHTML(meta)}</span>` : ''}
      </button>`;
  },

  // ── drag & drop (mouse); the chip modal covers touch ───────────────────
  wireDnD() {
    const root = this.container;
    const clear = () => root.querySelectorAll('.grp-drop-active').forEach(el => el.classList.remove('grp-drop-active'));

    root.querySelectorAll('.grp-chip').forEach(chip => {
      chip.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', chip.dataset.person);
        chip.classList.add('grp-dragging');
      });
      chip.addEventListener('dragend', () => { chip.classList.remove('grp-dragging'); clear(); });
    });

    root.querySelectorAll('[data-drop]').forEach(zone => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        clear();
        zone.classList.add('grp-drop-active');
      });
      zone.addEventListener('dragleave', (e) => {
        if (!zone.contains(e.relatedTarget)) zone.classList.remove('grp-drop-active');
      });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clear();
        const personId = e.dataTransfer.getData('text/plain');
        if (personId) this.movePerson(personId, zone.dataset.drop || null);
      });
    });
  },

  async movePerson(personId, groupId) {
    const p = this.people.find(x => x.id === personId);
    if (!p || p.groupId === (groupId || null)) return;
    p.groupId = groupId || null;
    try {
      await DB.put('group_people', p);
      const g = this.groups.find(x => x.id === groupId);
      toast(`${p.name} → ${g ? g.name : 'Unassigned'}`, 'success');
      this.renderView();
    } catch (e) {
      toast('Could not move person', 'error');
      await this.loadData();
      this.renderView();
    }
  },

  // ── people ─────────────────────────────────────────────────────────────
  editPerson(id) {
    const p = id ? this.people.find(x => x.id === id) : null;
    const groupOpts = [
      { id: '', label: 'Unassigned' },
      ...this.topGroups().flatMap(g => [
        { id: g.id, label: g.name },
        ...this.subGroups(g.id).map(s => ({ id: s.id, label: `${g.name} › ${s.name}` }))
      ])
    ];
    const body = `
      <div class="form-group">
        <label class="form-label">Name</label>
        <input type="text" class="form-input" id="grpName" value="${escapeAttr(p?.name || '')}" placeholder="Full name">
      </div>
      <div class="form-group">
        <label class="form-label">Subteams</label>
        <div class="flex gap-3" style="flex-wrap:wrap">
          ${GROUP_SUBTEAMS.map(t => `
            <label style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-size:13.5px">
              <input type="checkbox" class="grp-subteam" value="${t}" ${(p?.subteams || []).includes(t) ? 'checked' : ''} style="accent-color:var(--accent)"> ${t}
            </label>`).join('')}
        </div>
        <div class="form-hint">A person can be on more than one subteam.</div>
      </div>
      <div class="form-group">
        <label class="form-label">Position</label>
        <select class="form-select" id="grpPosition">
          ${GROUP_POSITIONS.map(x => `<option value="${x}" ${p?.position === x ? 'selected' : ''}>${x}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Group</label>
        <select class="form-select" id="grpGroup">
          ${groupOpts.map(o => `<option value="${o.id}" ${(p?.groupId || '') === o.id ? 'selected' : ''}>${escapeHTML(o.label)}</option>`).join('')}
        </select>
        <div class="form-hint">On a phone, use this instead of dragging.</div>
      </div>
    `;
    openModal(p ? `Edit ${p.name}` : 'Add Person', body, `
      ${p ? `<button class="btn btn-ghost" style="color:var(--red);margin-right:auto" onclick="GroupsModule.deletePerson('${p.id}')">Remove</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="grpSavePerson">Save</button>
    `);
    document.getElementById('grpSavePerson').addEventListener('click', async () => {
      const name = document.getElementById('grpName').value.trim();
      if (!name) return toast('Name is required', 'error');
      const rec = p || { id: uid(), order: this.people.length };
      rec.name = name;
      rec.subteams = [...document.querySelectorAll('.grp-subteam:checked')].map(cb => cb.value);
      rec.position = document.getElementById('grpPosition').value;
      rec.groupId = document.getElementById('grpGroup').value || null;
      try {
        await DB.put('group_people', rec);
        if (!p) this.people.push(rec);
        closeModal();
        toast('Saved', 'success');
        await this.loadData();
        this.renderView();
      } catch (e) {
        toast('Could not save', 'error');
      }
    });
  },

  async deletePerson(id) {
    const p = this.people.find(x => x.id === id);
    if (!p || !confirm(`Remove ${p.name} from Groups? Their account and access are untouched.`)) return;
    try {
      await DB.delete('group_people', id);
      closeModal();
      await this.loadData();
      this.renderView();
      toast(`${p.name} removed from Groups`, 'info');
    } catch (e) {
      toast('Could not remove', 'error');
    }
  },

  // ── groups ─────────────────────────────────────────────────────────────
  addGroup() { this._groupPrompt('New Group', '', async (name) => {
    await DB.put('groups', { id: uid(), name, parentId: null, order: this.topGroups().length });
  }); },

  addSub(parentId) { this._groupPrompt('New box', '', async (name) => {
    await DB.put('groups', { id: uid(), name, parentId, order: this.subGroups(parentId).length });
  }); },

  renameGroup(id) {
    const g = this.groups.find(x => x.id === id);
    if (!g) return;
    this._groupPrompt('Rename', g.name, async (name) => {
      g.name = name;
      await DB.put('groups', g);
    });
  },

  async deleteGroup(id) {
    const g = this.groups.find(x => x.id === id);
    if (!g) return;
    const subs = this.subGroups(id);
    const affected = [...this.peopleIn(id), ...subs.flatMap(s => this.peopleIn(s.id))];
    const parts = [];
    if (subs.length) parts.push(`${subs.length} box${subs.length === 1 ? '' : 'es'} inside`);
    if (affected.length) parts.push(`${affected.length} person chip${affected.length === 1 ? '' : 's'} move back to Unassigned`);
    if (!confirm(`Delete "${g.name}"?${parts.length ? ' ' + parts.join(', ') + '.' : ''} Nobody's account is affected.`)) return;
    try {
      await Promise.all(affected.map(p => { p.groupId = null; return DB.put('group_people', p); }));
      await Promise.all(subs.map(s => DB.delete('groups', s.id)));
      await DB.delete('groups', id);
      await this.loadData();
      this.renderView();
      toast(`"${g.name}" deleted`, 'info');
    } catch (e) {
      toast('Could not delete group', 'error');
    }
  },

  _groupPrompt(title, current, save) {
    openModal(title, `
      <div class="form-group">
        <label class="form-label">Name</label>
        <input type="text" class="form-input" id="grpGroupName" value="${escapeAttr(current)}" placeholder="e.g. Prototyping">
      </div>`, `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="grpGroupSave">Save</button>
    `);
    const input = document.getElementById('grpGroupName');
    setTimeout(() => { input.focus(); input.select(); }, 50);
    const go = async () => {
      const name = input.value.trim();
      if (!name) return toast('Name is required', 'error');
      try {
        await save(name);
        closeModal();
        await this.loadData();
        this.renderView();
      } catch (e) {
        toast('Could not save', 'error');
      }
    };
    document.getElementById('grpGroupSave').addEventListener('click', go);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  }
};

window.GroupsModule = GroupsModule;
