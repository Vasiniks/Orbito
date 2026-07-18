// search.js — Global search page
const SearchModule = {
  async render(container) {
    this.container = container;
    this.container.innerHTML = `
      <div class="global-search-wrap">
        <div class="global-search-head">
          <h2>Global Search</h2>
          <p>Search across parts and projects.</p>
        </div>

        <div class="search-box">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input type="text" id="globalSearchInput" placeholder="Type what you are looking for…" aria-label="Global search">
        </div>
        <p class="global-search-kbd">Tip: press <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>K</kbd> to search from anywhere.</p>

        <div id="searchResults" class="search-results" role="list" aria-live="polite"></div>
      </div>
    `;

    this.searchInput = document.getElementById('globalSearchInput');
    this.resultsContainer = document.getElementById('searchResults');

    this.searchInput.addEventListener('input', debounce(() => this.performSearch(), 250));

    // Load all data async
    this.data = { parts: [], projects: [], locations: [] };
    Promise.all([
      DB.getAll('parts'),
      DB.getAll('projects'),
      DB.getAll('locations')
    ]).then(([parts, projects, locations]) => {
      this.data.parts = parts;
      this.data.projects = projects;
      this.data.locations = locations;
      this.searchInput.focus();
    });
  },

  performSearch() {
    const q = this.searchInput.value.toLowerCase().trim();
    if (!q) {
      this.resultsContainer.innerHTML = '';
      return;
    }

    const results = [];

    this.data.parts.filter(p => p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q))).forEach(p => {
      const loc = this.data.locations.find(l => l.id === p.locationId);
      results.push({
        type: 'Part',
        icon: 'fa-screwdriver-wrench',
        color: 'var(--blue)',
        title: p.name,
        subtitle: [p.category, loc ? loc.name + (p.containerId ? ' › ' + p.containerId : '') : null].filter(Boolean).join(' · ') || 'No details',
        right: getStockChip(p.inStock || 0, p.needed || 0, p.id),
        action: () => { navigate('parts').then(() => PartsModule.showPartDetail(p.id)); }
      });
    });

    this.data.projects.filter(p => p.name.toLowerCase().includes(q)).forEach(p => {
      results.push({
        type: 'Project',
        icon: 'fa-folder',
        color: 'var(--accent)',
        title: p.name,
        subtitle: p.status || 'Active',
        action: () => { navigate('projects').then(() => ProjectsModule.showDetail(p.id)); }
      });
    });

    if (results.length === 0) {
      this.resultsContainer.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-magnifying-glass"></i>
          <h3>No results found</h3>
          <p>Try using different keywords.</p>
        </div>
      `;
      return;
    }

    this.resultsContainer.innerHTML = results.slice(0, 20).map((r, i) => `
      <button class="search-result" role="listitem" onclick="window._globalSearchAction(${i})">
        <div class="search-result-icon" style="color:${r.color}" aria-hidden="true">
          <i class="fa-solid ${r.icon}"></i>
        </div>
        <div style="min-width:0">
          <div class="search-result-title truncate">${escapeHTML(r.title)}</div>
          <div class="search-result-sub truncate">${r.type} &bull; ${escapeHTML(r.subtitle)}</div>
        </div>
        <div style="margin-left:auto;flex-shrink:0">${r.right || ''}</div>
      </button>
    `).join('');

    window._globalSearchAction = (index) => {
      results[index].action();
    };
  }
};

window.SearchModule = SearchModule;
