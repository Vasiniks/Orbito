// search.js — Global search page
const SearchModule = {
  async render(container) {
    this.container = container;
    this.container.innerHTML = `
      <div class="global-search-wrap">
        <div class="global-search-head">
          <h2>Global Search</h2>
          <p>Search across parts, projects, tasks, and people.</p>
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
    this.data = { parts: [], projects: [], users: [], tasks: [] };
    Promise.all([
      DB.getAll('parts'),
      DB.getAll('projects'),
      DB.getAll('users'),
      DB.getAll('tasks')
    ]).then(([parts, projects, users, tasks]) => {
      this.data.parts = parts;
      this.data.projects = projects;
      this.data.users = users;
      this.data.tasks = tasks;
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
      results.push({
        type: 'Part',
        icon: 'fa-screwdriver-wrench',
        color: 'var(--blue)',
        title: p.name,
        subtitle: p.category || 'No Category',
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

    this.data.tasks.filter(t => t.title.toLowerCase().includes(q)).forEach(t => {
      results.push({
        type: 'Task',
        icon: 'fa-check',
        color: 'var(--purple)',
        title: t.title,
        subtitle: t.status,
        action: () => { navigate('tasks').then(() => TasksModule.showAddModal(t.id)); }
      });
    });

    this.data.users.filter(u => u.name.toLowerCase().includes(q) || (u.role && u.role.toLowerCase().includes(q))).forEach(u => {
      results.push({
        type: 'Person',
        icon: 'fa-user',
        color: 'var(--green)',
        title: u.name,
        subtitle: u.role || 'Member',
        action: () => { navigate('people').then(() => PeopleModule.showDetail(u.id)); }
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
        <div>
          <div class="search-result-title">${escapeHTML(r.title)}</div>
          <div class="search-result-sub">${r.type} &bull; ${escapeHTML(r.subtitle)}</div>
        </div>
      </button>
    `).join('');

    window._globalSearchAction = (index) => {
      results[index].action();
    };
  }
};

window.SearchModule = SearchModule;
