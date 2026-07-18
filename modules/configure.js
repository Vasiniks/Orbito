// configure.js — shared dropdown data (categories, materials, machines) with per-tag
// colors, plus UI tab visibility. Tabbed, spreadsheet-like editing.
const CFG_PALETTE = ['blue', 'green', 'amber', 'purple', 'cyan', 'rose', 'red'];

const ConfigureModule = {
  activeTab: 'categories',

  LISTS: [
    {
      id: 'categories', label: 'Categories', icon: 'fa-tags',
      hint: 'Part categories offered in the Parts Library dropdown. Colors show on category chips.',
      global: '__categories', defaults: []
    },
    {
      id: 'materials', label: 'Materials', icon: 'fa-layer-group',
      hint: 'Material options in the spreadsheet (e.g. 1/8" Aluminum - Sheet).',
      global: '__materials', defaults: (window.SS_MATERIALS || [])
    },
    {
      id: 'machines', label: 'Machines', icon: 'fa-gears',
      hint: 'Machine/process options. Names containing CNC, Print, or Purchase drive the type chip.',
      global: '__machines', defaults: (typeof BOM_MACHINES !== 'undefined' ? BOM_MACHINES : [])
    },
  ],

  // Tabs the team can hide. Dashboard, Configure, and Settings always stay.
  TABS: [
    { key: 'projects', label: 'Projects' },
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
    // Working copies (saved explicitly per tab)
    this.lists = {};
    this.colors = {};
    this.LISTS.forEach(l => {
      const current = window[l.global];
      this.lists[l.id] = [...(current && current.length ? current : l.defaults)];
      this.colors[l.id] = { ...(window.__listColors?.[l.id] || {}) };
    });
    this.hiddenTabs = new Set(window.__hiddenTabs || []);
    this.renderView();
  },

  renderView() {
    const tabs = [...this.LISTS.map(l => ({ id: l.id, label: l.label, icon: l.icon })), { id: 'tabs', label: 'Visible Tabs', icon: 'fa-eye' }];

    this.container.innerHTML = `
      <div style="max-width:760px;margin:0 auto">
        <p class="text-sm text-muted mb-3">Shared configuration for the whole team. Removing an option never changes items already using it.</p>
        <div class="tab-group mb-4">
          ${tabs.map(t => `<button class="tab-btn ${this.activeTab === t.id ? 'active' : ''}" data-tab="${t.id}"><i class="fa-solid ${t.icon}" style="margin-right:5px"></i>${t.label}</button>`).join('')}
        </div>
        <div id="cfgTabContent"></div>
      </div>
    `;

    this.container.querySelectorAll('.tab-btn').forEach(b => {
      b.addEventListener('click', () => {
        this.activeTab = b.dataset.tab;
        this.renderView();
      });
    });

    if (this.activeTab === 'tabs') this.renderTabsEditor();
    else this.renderListEditor(this.LISTS.find(l => l.id === this.activeTab));
  },

  renderListEditor(l) {
    const content = document.getElementById('cfgTabContent');
    const items = this.lists[l.id];
    const colors = this.colors[l.id];

    content.innerHTML = `
      <div class="card">
        <div class="card-body">
          <p class="text-sm text-muted mb-3">${l.hint}</p>
          <div id="cfgRows">
            ${items.length === 0 ? '<div class="text-muted text-sm" style="padding:12px 0">Nothing yet — add options below.</div>' : items.map((name, i) => `
              <div class="cfg-row">
                <button class="cfg-swatch ${colors[name] ? 'tint-' + colors[name] : ''}" data-i="${i}" title="Pick a color" aria-label="Pick color for ${escapeAttr(name)}" style="${colors[name] ? '' : 'background:var(--bg-3)'}"></button>
                <span class="chip ${colors[name] ? 'tint-' + colors[name] : ''}" style="font-size:12px">${escapeHTML(name)}</span>
                <div style="flex:1"></div>
                <button class="btn-icon btn-sm cfg-del" data-i="${i}" title="Remove" aria-label="Remove ${escapeAttr(name)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
              </div>`).join('')}
          </div>
          <div class="flex gap-2 mt-3">
            <input type="text" class="form-input" id="cfgNewItem" placeholder="Add ${l.label.toLowerCase()}…" style="flex:1">
            <button class="btn btn-secondary" id="cfgAddBtn"><i class="fa-solid fa-plus"></i> Add</button>
          </div>
          <div class="flex gap-2 mt-3" style="justify-content:flex-end;flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" id="cfgGenColors"><i class="fa-solid fa-wand-magic-sparkles"></i> Generate colors</button>
            <button class="btn btn-ghost btn-sm" id="cfgClearColors">Clear colors</button>
            <button class="btn btn-primary btn-sm" id="cfgSaveList"><i class="fa-solid fa-floppy-disk"></i> Save ${l.label}</button>
          </div>
        </div>
      </div>
    `;

    content.querySelectorAll('.cfg-swatch').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = items[+b.dataset.i];
        const opts = [{ value: '', label: 'No color' }, ...CFG_PALETTE.map(c => ({ value: c, label: c[0].toUpperCase() + c.slice(1), color: c }))];
        showSelectMenu(b, opts, colors[name] || '', (v) => {
          if (v) colors[name] = v; else delete colors[name];
          this.renderView();
        }, 'Color for ' + name);
      });
    });
    content.querySelectorAll('.cfg-del').forEach(b => {
      b.addEventListener('click', () => {
        const name = items[+b.dataset.i];
        items.splice(+b.dataset.i, 1);
        delete colors[name];
        this.renderView();
      });
    });
    document.getElementById('cfgAddBtn').addEventListener('click', () => {
      const v = document.getElementById('cfgNewItem').value.trim();
      if (!v) return;
      if (!items.some(x => x.toLowerCase() === v.toLowerCase())) items.push(v);
      this.renderView();
      setTimeout(() => document.getElementById('cfgNewItem')?.focus(), 0);
    });
    document.getElementById('cfgNewItem').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('cfgAddBtn').click(); }
    });
    document.getElementById('cfgGenColors').addEventListener('click', () => {
      items.forEach((name, i) => { colors[name] = CFG_PALETTE[i % CFG_PALETTE.length]; });
      this.renderView();
      toast('Palette applied — hit Save to keep it', 'info');
    });
    document.getElementById('cfgClearColors').addEventListener('click', () => {
      Object.keys(colors).forEach(k => delete colors[k]);
      this.renderView();
    });
    document.getElementById('cfgSaveList').addEventListener('click', async () => {
      await DB.put('settings', { id: l.id, list: items, colors });
      window[l.global] = [...items];
      window.__listColors = window.__listColors || {};
      window.__listColors[l.id] = { ...colors };
      toast(`${l.label} saved`, 'success');
    });
  },

  renderTabsEditor() {
    const content = document.getElementById('cfgTabContent');
    content.innerHTML = `
      <div class="card">
        <div class="card-body">
          <p class="text-sm text-muted mb-3">Hide tabs your team doesn't use. Dashboard, Configure, and Settings always stay.</p>
          <div class="flex gap-3 mb-3" style="flex-wrap:wrap">
            ${this.TABS.map(t => `
              <label style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-size:13.5px;min-width:190px">
                <input type="checkbox" class="tab-vis-cb" value="${t.key}" ${this.hiddenTabs.has(t.key) ? '' : 'checked'} style="accent-color:var(--accent)"> ${t.label}
              </label>`).join('')}
          </div>
          <div class="text-right">
            <button class="btn btn-primary btn-sm" id="saveTabsBtn"><i class="fa-solid fa-floppy-disk"></i> Save Tabs</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('saveTabsBtn').addEventListener('click', async () => {
      const visible = new Set([...document.querySelectorAll('.tab-vis-cb:checked')].map(cb => cb.value));
      const hidden = this.TABS.map(t => t.key).filter(k => !visible.has(k));
      await DB.put('settings', { id: 'ui', hiddenTabs: hidden });
      window.__hiddenTabs = hidden;
      applyTabVisibility();
      this.hiddenTabs = new Set(hidden);
      toast('Tab visibility saved', 'success');
    });
  }
};

window.ConfigureModule = ConfigureModule;
