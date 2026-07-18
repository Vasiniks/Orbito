// configure.js — shared dropdown data with grouped editing and instant save.
// Categories: flat list with per-category color (categories ARE the top level).
// Materials/Machines: family groups (Aluminum, Steel, CNC, …) holding the
// specific options; color lives on the group only and flows to every option's
// chip. Every change saves immediately — no Save button to forget, so deleted
// options stay deleted (spreadsheet cells still using one show an error chip).
const CFG_PALETTE = ['blue', 'green', 'amber', 'purple', 'cyan', 'rose', 'red'];

const ConfigureModule = {
  activeTab: 'categories',

  // Keyword families used once to organize a legacy flat list into groups.
  MATERIAL_FAMILIES: [
    ['Aluminum', /alum/i],
    ['Steel', /steel|stainless|titanium/i],
    ['Plastic', /plastic|poly|delrin|abs|petg|\bpla\b|nylon|acrylic|lexan|hdpe|uhmw|pvc/i],
    ['Wood', /wood|plywood|mdf|balsa/i],
  ],
  MACHINE_FAMILIES: [
    ['CNC', /cnc|router|omio|haas/i],
    ['3D Printing', /print/i],
    ['Purchase / COTS', /purchase|cots|buy|vendor/i],
    ['Manual', /mill|lathe|drill|saw|hand|manual|grind|band|water/i],
  ],

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

    // Categories: configured list (may be empty on purpose) merged with any
    // categories already used on parts — fixes "category exists in Inventory
    // but is missing in Configure".
    this.cats = Array.isArray(window.__categories) ? [...window.__categories] : [];
    this.catColors = { ...(window.__listColors?.categories || {}) };
    try {
      const parts = await DB.getAll('parts');
      const used = [...new Set(parts.map(p => (p.category || '').trim()).filter(Boolean))];
      const missing = used.filter(c => !this.cats.some(x => x.toLowerCase() === c.toLowerCase()));
      if (missing.length || !Array.isArray(window.__categories)) {
        this.cats.push(...missing);
        await this.saveCategories(true);
      }
    } catch (e) { console.warn('Could not merge part categories:', e); }

    // Materials / machines: use saved groups, or organize the flat list into
    // families once (existing per-item colors promote to their group).
    this.groups = {
      materials: this.loadGroups('materials', cfgMaterials(), this.MATERIAL_FAMILIES),
      machines: this.loadGroups('machines', cfgMachines(), this.MACHINE_FAMILIES),
    };
    // Persist a first-time migration so the structure sticks for everyone
    if (!window.__listGroups?.materials) await this.saveGrouped('materials', true);
    if (!window.__listGroups?.machines) await this.saveGrouped('machines', true);

    this.hiddenTabs = new Set(window.__hiddenTabs || []);
    this.renderView();
  },

  loadGroups(kind, flatList, families) {
    const saved = window.__listGroups?.[kind];
    if (Array.isArray(saved)) return saved.map(g => ({ name: g.name, color: g.color || '', items: [...(g.items || [])] }));
    // Migrate: bucket the flat list into keyword families
    const groups = families.map(([name]) => ({ name, color: '', items: [] }));
    const other = { name: 'Other', color: '', items: [] };
    (flatList || []).forEach(item => {
      const fam = families.find(([, re]) => re.test(item));
      (fam ? groups[families.indexOf(fam)] : other).items.push(item);
    });
    if (other.items.length) groups.push(other);
    const nonEmpty = groups.filter(g => g.items.length);
    // Group color: most common existing item color, else spread the palette
    const oldColors = window.__listColors?.[kind] || {};
    nonEmpty.forEach((g, i) => {
      const tally = {};
      g.items.forEach(it => { const c = oldColors[it]; if (c) tally[c] = (tally[c] || 0) + 1; });
      const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
      g.color = best ? best[0] : CFG_PALETTE[i % CFG_PALETTE.length];
    });
    return nonEmpty;
  },

  // ── persistence (instant) ──────────────────────────────────────────────
  async saveCategories(quiet) {
    Object.keys(this.catColors).forEach(k => { if (!this.cats.includes(k)) delete this.catColors[k]; });
    await DB.putReplace('settings', { id: 'categories', list: [...this.cats], colors: { ...this.catColors } });
    window.__categories = [...this.cats];
    window.__listColors = window.__listColors || {};
    window.__listColors.categories = { ...this.catColors };
    if (!quiet) this.flashSaved();
  },

  async saveGrouped(kind, quiet) {
    const groups = this.groups[kind];
    const list = groups.flatMap(g => g.items);
    const colors = {};
    groups.forEach(g => { if (g.color) g.items.forEach(it => { colors[it] = g.color; }); });
    await DB.putReplace('settings', { id: kind, groups: groups.map(g => ({ name: g.name, color: g.color, items: [...g.items] })), list, colors });
    window['__' + kind] = list;
    window.__listColors = window.__listColors || {};
    window.__listColors[kind] = colors;
    window.__listGroups = window.__listGroups || {};
    window.__listGroups[kind] = groups;
    if (!quiet) this.flashSaved();
  },

  flashSaved() {
    const el = document.getElementById('cfgSavedFlash');
    if (!el) return;
    el.style.opacity = '1';
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => { el.style.opacity = '0'; }, 1400);
  },

  // ── shell ──────────────────────────────────────────────────────────────
  renderView() {
    const tabs = [
      { id: 'categories', label: 'Categories', icon: 'fa-tags' },
      { id: 'materials', label: 'Materials', icon: 'fa-layer-group' },
      { id: 'machines', label: 'Machines', icon: 'fa-gears' },
      { id: 'tabs', label: 'Visible Tabs', icon: 'fa-eye' },
    ];
    this.container.innerHTML = `
      <div class="flex items-center gap-3" style="flex-wrap:wrap">
        <div class="tab-group" style="flex:1;min-width:260px">
          ${tabs.map(t => `<button class="tab-btn ${this.activeTab === t.id ? 'active' : ''}" data-tab="${t.id}"><i class="fa-solid ${t.icon}" style="margin-right:5px" aria-hidden="true"></i>${t.label}</button>`).join('')}
        </div>
        <span id="cfgSavedFlash" class="text-sm" style="color:var(--green);opacity:0;transition:opacity 0.4s"><i class="fa-solid fa-check" aria-hidden="true"></i> Saved</span>
      </div>
      <p class="text-sm text-muted" style="margin:10px 0 16px">Shared by the whole team — every change saves instantly. Removing an option never edits items already using it; those cells flag the missing option instead.</p>
      <div id="cfgTabContent"></div>
    `;
    this.container.querySelectorAll('.tab-btn').forEach(b => {
      b.addEventListener('click', () => { this.activeTab = b.dataset.tab; this.renderView(); });
    });

    if (this.activeTab === 'tabs') this.renderTabsEditor();
    else if (this.activeTab === 'categories') this.renderCategories();
    else this.renderGrouped(this.activeTab);
  },

  // ── categories (flat, per-category color) ──────────────────────────────
  renderCategories() {
    const content = document.getElementById('cfgTabContent');
    content.innerHTML = `
      <div class="card">
        <div class="card-body">
          <p class="text-sm text-muted mb-3">Part categories for the Parts Library. Categories already used on parts are pulled in automatically. Click a swatch to color a category — the color shows on its chips.</p>
          <div class="cfg-cat-grid">
            ${this.cats.length === 0 ? '<div class="text-muted text-sm" style="padding:10px 0">Nothing yet — add categories below.</div>' : this.cats.map((name, i) => `
              <div class="cfg-row">
                <button class="cfg-swatch ${this.catColors[name] ? 'tint-' + this.catColors[name] : ''}" data-i="${i}" title="Pick a color" aria-label="Pick color for ${escapeAttr(name)}" style="${this.catColors[name] ? '' : 'background:var(--bg-3)'}"></button>
                <span class="chip ${this.catColors[name] ? 'tint-' + this.catColors[name] : ''}" style="font-size:12px">${escapeHTML(name)}</span>
                <div style="flex:1"></div>
                <button class="btn-icon btn-sm cfg-del" data-i="${i}" title="Remove" aria-label="Remove ${escapeAttr(name)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
              </div>`).join('')}
          </div>
          <div class="flex gap-2 mt-3" style="flex-wrap:wrap">
            <input type="text" class="form-input" id="cfgNewCat" placeholder="Add category…" style="flex:1;max-width:340px;min-width:180px">
            <button class="btn btn-secondary" id="cfgAddCat"><i class="fa-solid fa-plus"></i> Add</button>
            <div style="flex:1"></div>
            <button class="btn btn-secondary btn-sm" id="cfgGenCatColors"><i class="fa-solid fa-wand-magic-sparkles"></i> Auto-color</button>
            <button class="btn btn-ghost btn-sm" id="cfgClearCatColors">Clear colors</button>
          </div>
        </div>
      </div>
    `;
    content.querySelectorAll('.cfg-swatch').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = this.cats[+b.dataset.i];
        const opts = [{ value: '', label: 'No color' }, ...CFG_PALETTE.map(c => ({ value: c, label: c[0].toUpperCase() + c.slice(1), color: c }))];
        showSelectMenu(b, opts, this.catColors[name] || '', async (v) => {
          if (v) this.catColors[name] = v; else delete this.catColors[name];
          await this.saveCategories();
          this.renderView();
        }, 'Color for ' + name);
      });
    });
    content.querySelectorAll('.cfg-del').forEach(b => {
      b.addEventListener('click', async () => {
        this.cats.splice(+b.dataset.i, 1);
        await this.saveCategories();
        this.renderView();
      });
    });
    const add = async () => {
      const input = document.getElementById('cfgNewCat');
      const v = input.value.trim();
      if (!v) return;
      if (!this.cats.some(x => x.toLowerCase() === v.toLowerCase())) {
        this.cats.push(v);
        await this.saveCategories();
      }
      this.renderView();
      setTimeout(() => document.getElementById('cfgNewCat')?.focus(), 0);
    };
    document.getElementById('cfgAddCat').addEventListener('click', add);
    document.getElementById('cfgNewCat').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    document.getElementById('cfgGenCatColors').addEventListener('click', async () => {
      this.cats.forEach((name, i) => { this.catColors[name] = CFG_PALETTE[i % CFG_PALETTE.length]; });
      await this.saveCategories();
      this.renderView();
    });
    document.getElementById('cfgClearCatColors').addEventListener('click', async () => {
      Object.keys(this.catColors).forEach(k => delete this.catColors[k]);
      await this.saveCategories();
      this.renderView();
    });
  },

  // ── materials / machines (grouped, color on the group) ─────────────────
  renderGrouped(kind) {
    const content = document.getElementById('cfgTabContent');
    const groups = this.groups[kind];
    const noun = kind === 'materials' ? 'material' : 'machine';

    content.innerHTML = `
      <p class="text-sm text-muted mb-3">${kind === 'materials'
        ? 'Materials are organized by family — the family color shows on every material chip in the spreadsheet.'
        : 'Machines and processes by family. Names containing CNC, Print, or Purchase drive the type chip.'}</p>
      <div class="cfg-groups">
        ${groups.map((g, gi) => `
          <div class="card cfg-group">
            <div class="cfg-group-head">
              <button class="cfg-swatch ${g.color ? 'tint-' + g.color : ''}" data-g="${gi}" title="Group color" aria-label="Pick color for ${escapeAttr(g.name)}" style="${g.color ? '' : 'background:var(--bg-3)'}"></button>
              <button class="cfg-group-name ${g.color ? 'tint-' + g.color : ''}" data-g="${gi}" title="Rename group">${escapeHTML(g.name)}</button>
              <span class="text-xs text-muted" style="flex-shrink:0">${g.items.length}</span>
              <div style="flex:1"></div>
              <button class="btn-icon btn-sm cfg-group-del" data-g="${gi}" title="Delete group" aria-label="Delete group ${escapeAttr(g.name)}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
            </div>
            <div class="cfg-group-body">
              ${g.items.map((it, ii) => `
                <div class="cfg-row">
                  <span style="font-size:12.5px">${escapeHTML(it)}</span>
                  <div style="flex:1"></div>
                  <button class="btn-icon btn-sm cfg-item-del" data-g="${gi}" data-i="${ii}" title="Remove" aria-label="Remove ${escapeAttr(it)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                </div>`).join('') || '<div class="text-muted text-xs" style="padding:6px 0">No options yet.</div>'}
              <input type="text" class="form-input cfg-item-add" data-g="${gi}" placeholder="Add ${noun}… (Enter)" style="margin-top:8px;font-size:12.5px;padding:6px 10px">
            </div>
          </div>`).join('')}
        <div class="card cfg-group cfg-group-new">
          <div class="cfg-group-body" style="display:flex;flex-direction:column;gap:8px;justify-content:center;min-height:120px">
            <div class="text-sm text-muted">New group (e.g. ${kind === 'materials' ? 'Aluminum, Composite' : 'CNC, Manual'})</div>
            <div class="flex gap-2">
              <input type="text" class="form-input" id="cfgNewGroup" placeholder="Group name…" style="flex:1;font-size:12.5px;padding:6px 10px">
              <button class="btn btn-secondary btn-sm" id="cfgAddGroup"><i class="fa-solid fa-plus"></i> Add</button>
            </div>
          </div>
        </div>
      </div>
      <div class="flex gap-2 mt-3" style="justify-content:flex-end;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" id="cfgGenColors"><i class="fa-solid fa-wand-magic-sparkles"></i> Auto-color groups</button>
        <button class="btn btn-ghost btn-sm" id="cfgClearColors">Clear colors</button>
      </div>
    `;

    content.querySelectorAll('.cfg-swatch[data-g]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const g = groups[+b.dataset.g];
        const opts = [{ value: '', label: 'No color' }, ...CFG_PALETTE.map(c => ({ value: c, label: c[0].toUpperCase() + c.slice(1), color: c }))];
        showSelectMenu(b, opts, g.color || '', async (v) => {
          g.color = v;
          await this.saveGrouped(kind);
          this.renderView();
        }, 'Color for ' + g.name);
      });
    });
    content.querySelectorAll('.cfg-group-name').forEach(btn => {
      btn.addEventListener('click', () => {
        const g = groups[+btn.dataset.g];
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-input';
        input.value = g.name;
        input.style.cssText = 'max-width:150px;font-size:13px;padding:4px 8px';
        btn.replaceWith(input);
        input.focus();
        input.select();
        const commit = async () => {
          const v = input.value.trim();
          if (v && v !== g.name) { g.name = v; await this.saveGrouped(kind); }
          this.renderView();
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
          if (e.key === 'Escape') { input.removeEventListener('blur', commit); this.renderView(); }
        });
      });
    });
    content.querySelectorAll('.cfg-group-del').forEach(b => {
      b.addEventListener('click', async () => {
        const gi = +b.dataset.g;
        const g = groups[gi];
        if (g.items.length && !confirm(`Delete group "${g.name}" and its ${g.items.length} option${g.items.length === 1 ? '' : 's'}? Spreadsheet cells using them will flag an error until re-picked.`)) return;
        groups.splice(gi, 1);
        await this.saveGrouped(kind);
        this.renderView();
      });
    });
    content.querySelectorAll('.cfg-item-del').forEach(b => {
      b.addEventListener('click', async () => {
        groups[+b.dataset.g].items.splice(+b.dataset.i, 1);
        await this.saveGrouped(kind);
        this.renderView();
      });
    });
    content.querySelectorAll('.cfg-item-add').forEach(input => {
      input.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const v = input.value.trim();
        if (!v) return;
        const all = groups.flatMap(x => x.items);
        if (!all.some(x => x.toLowerCase() === v.toLowerCase())) {
          groups[+input.dataset.g].items.push(v);
          await this.saveGrouped(kind);
        }
        const gi = input.dataset.g;
        this.renderView();
        setTimeout(() => document.querySelector(`.cfg-item-add[data-g="${gi}"]`)?.focus(), 0);
      });
    });
    const addGroup = async () => {
      const input = document.getElementById('cfgNewGroup');
      const v = input.value.trim();
      if (!v) return;
      if (!groups.some(x => x.name.toLowerCase() === v.toLowerCase())) {
        groups.push({ name: v, color: CFG_PALETTE[groups.length % CFG_PALETTE.length], items: [] });
        await this.saveGrouped(kind);
      }
      this.renderView();
    };
    document.getElementById('cfgAddGroup').addEventListener('click', addGroup);
    document.getElementById('cfgNewGroup').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addGroup(); } });
    document.getElementById('cfgGenColors').addEventListener('click', async () => {
      groups.forEach((g, i) => { g.color = CFG_PALETTE[i % CFG_PALETTE.length]; });
      await this.saveGrouped(kind);
      this.renderView();
    });
    document.getElementById('cfgClearColors').addEventListener('click', async () => {
      groups.forEach(g => { g.color = ''; });
      await this.saveGrouped(kind);
      this.renderView();
    });
  },

  // ── visible tabs (instant save) ────────────────────────────────────────
  renderTabsEditor() {
    const content = document.getElementById('cfgTabContent');
    content.innerHTML = `
      <div class="card">
        <div class="card-body">
          <p class="text-sm text-muted mb-3">Hide tabs your team doesn't use. Dashboard, Configure, and Settings always stay. Changes apply immediately.</p>
          <div class="flex gap-3" style="flex-wrap:wrap">
            ${this.TABS.map(t => `
              <label style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-size:13.5px;min-width:190px">
                <input type="checkbox" class="tab-vis-cb" value="${t.key}" ${this.hiddenTabs.has(t.key) ? '' : 'checked'} style="accent-color:var(--accent)"> ${t.label}
              </label>`).join('')}
          </div>
        </div>
      </div>
    `;
    content.querySelectorAll('.tab-vis-cb').forEach(cb => {
      cb.addEventListener('change', async () => {
        const visible = new Set([...content.querySelectorAll('.tab-vis-cb:checked')].map(x => x.value));
        const hidden = this.TABS.map(t => t.key).filter(k => !visible.has(k));
        await DB.putReplace('settings', { id: 'ui', hiddenTabs: hidden, defaultProject: window.__defaultProject || null });
        window.__hiddenTabs = hidden;
        this.hiddenTabs = new Set(hidden);
        applyTabVisibility();
        this.flashSaved();
      });
    });
  }
};

window.ConfigureModule = ConfigureModule;
