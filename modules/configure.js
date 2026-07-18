// configure.js — shared dropdown data (categories, materials, machines) and UI tab visibility
const ConfigureModule = {
  LISTS: [
    {
      id: 'categories', label: 'Categories', icon: 'fa-tags',
      hint: 'Part categories offered in the Parts Library dropdown.',
      global: '__categories', defaults: []
    },
    {
      id: 'materials', label: 'Materials', icon: 'fa-layer-group',
      hint: 'Material suggestions in the spreadsheet (e.g. 1/8" Aluminum - Sheet).',
      global: '__materials', defaults: (window.SS_MATERIALS || [])
    },
    {
      id: 'machines', label: 'Machines / Processes', icon: 'fa-gears',
      hint: 'Machine suggestions in the spreadsheet. Names containing CNC, Print, or Purchase drive the type chip.',
      global: '__machines', defaults: (typeof BOM_MACHINES !== 'undefined' ? BOM_MACHINES : [])
    },
  ],

  // Tabs the team can hide. Dashboard, Configure, and Settings always stay.
  TABS: [
    { key: 'projects', label: 'Projects' },
    { key: 'search', label: 'Global Search' },
    { key: 'parts', label: 'Parts Library' },
    { key: 'buy', label: 'Buy List' },
    { key: 'containers', label: 'Containers' },
    { key: 'spreadsheet', label: 'Master Spreadsheet' },
    { key: 'cnc', label: 'CNC List' },
    { key: 'vendors', label: 'Vendors' },
    { key: 'tools', label: 'Tools' },
    { key: 'sketches', label: 'Global Sketches' },
    { key: 'accounts', label: 'Accounts' },
    { key: 'history', label: 'Activity' },
    { key: 'workspace', label: 'Workspace Map' },
  ],

  async render(container) {
    this.container = container;
    // Working copies (saved explicitly per section)
    this.lists = {};
    this.LISTS.forEach(l => {
      const current = window[l.global];
      this.lists[l.id] = [...(current && current.length ? current : l.defaults)];
    });
    this.hiddenTabs = new Set(window.__hiddenTabs || []);
    this.renderView();
  },

  renderView() {
    this.container.innerHTML = `
      <div style="max-width:720px;margin:0 auto">
        <p class="text-sm text-muted mb-4">Shared configuration for the whole team — dropdown options and which tabs show in the sidebar. Removing an option never changes parts that already use it.</p>
        ${this.LISTS.map(l => this.listCard(l)).join('')}

        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><h3><i class="fa-solid fa-eye" style="margin-right:6px"></i>Visible Tabs</h3></div>
          <div class="card-body">
            <p class="text-sm text-muted mb-3">Hide tabs your team doesn't use. Dashboard, Configure, and Settings always stay.</p>
            <div class="flex gap-3 mb-3" style="flex-wrap:wrap">
              ${this.TABS.map(t => `
                <label style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-size:13.5px;min-width:180px">
                  <input type="checkbox" class="tab-vis-cb" value="${t.key}" ${this.hiddenTabs.has(t.key) ? '' : 'checked'} style="accent-color:var(--accent)"> ${t.label}
                </label>`).join('')}
            </div>
            <div class="text-right">
              <button class="btn btn-primary btn-sm" id="saveTabsBtn"><i class="fa-solid fa-floppy-disk"></i> Save Tabs</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.LISTS.forEach(l => this.wireListCard(l));

    document.getElementById('saveTabsBtn').addEventListener('click', async () => {
      const visible = new Set([...document.querySelectorAll('.tab-vis-cb:checked')].map(cb => cb.value));
      const hidden = this.TABS.map(t => t.key).filter(k => !visible.has(k));
      await DB.put('settings', { id: 'ui', hiddenTabs: hidden });
      window.__hiddenTabs = hidden;
      applyTabVisibility();
      this.hiddenTabs = new Set(hidden);
      toast('Tab visibility saved', 'success');
    });
  },

  listCard(l) {
    const items = this.lists[l.id];
    return `
      <div class="card" style="margin-bottom:16px" id="listCard_${l.id}">
        <div class="card-header"><h3><i class="fa-solid ${l.icon}" style="margin-right:6px"></i>${l.label}</h3></div>
        <div class="card-body">
          <p class="text-sm text-muted mb-3">${l.hint}</p>
          <div class="flex gap-2 mb-3" style="flex-wrap:wrap" id="chips_${l.id}">
            ${items.length === 0 ? '<span class="text-muted text-sm">Nothing yet — add options below.</span>' : items.map((c, i) => `
              <span class="chip" style="padding:4px 10px">
                ${escapeHTML(c)}
                <button class="list-del" data-list="${l.id}" data-i="${i}" title="Remove" aria-label="Remove ${escapeAttr(c)}" style="border:none;background:none;color:var(--text-3);cursor:pointer;margin-left:2px;font-size:11px"><i class="fa-solid fa-xmark"></i></button>
              </span>`).join('')}
          </div>
          <div class="flex gap-2">
            <input type="text" class="form-input" id="newItem_${l.id}" placeholder="Add ${l.label.toLowerCase()}…" style="flex:1">
            <button class="btn btn-secondary" id="addItem_${l.id}"><i class="fa-solid fa-plus"></i> Add</button>
            <button class="btn btn-primary" id="saveList_${l.id}"><i class="fa-solid fa-floppy-disk"></i> Save</button>
          </div>
        </div>
      </div>
    `;
  },

  wireListCard(l) {
    const card = document.getElementById(`listCard_${l.id}`);
    const rerender = () => {
      card.outerHTML = this.listCard(l);
      this.wireListCard(l);
    };

    card.querySelector(`#addItem_${l.id}`).addEventListener('click', () => {
      const inp = card.querySelector(`#newItem_${l.id}`);
      const v = inp.value.trim();
      if (!v) return;
      if (!this.lists[l.id].some(x => x.toLowerCase() === v.toLowerCase())) this.lists[l.id].push(v);
      rerender();
      document.getElementById(`newItem_${l.id}`).focus();
    });
    card.querySelector(`#newItem_${l.id}`).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById(`addItem_${l.id}`).click(); }
    });
    card.querySelectorAll('.list-del').forEach(b => {
      b.addEventListener('click', () => {
        this.lists[l.id].splice(parseInt(b.dataset.i), 1);
        rerender();
      });
    });
    card.querySelector(`#saveList_${l.id}`).addEventListener('click', async () => {
      await DB.put('settings', { id: l.id, list: this.lists[l.id] });
      window[l.global] = [...this.lists[l.id]];
      toast(`${l.label} saved`, 'success');
    });
  }
};

window.ConfigureModule = ConfigureModule;
