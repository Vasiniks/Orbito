const SearchModule = {
  async render(container) {
    this.container = container;
    this.container.innerHTML = `
      <div class="global-search-wrap">
        <div style="text-align: center; margin-bottom: 28px;">
          <h2 style="font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 6px;">Global Search</h2>
          <p class="text-muted text-sm">Search across parts, people, tasks, and projects.</p>
        </div>

        <div class="search-box">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input type="text" id="globalSearchInput" placeholder="Type what you are looking for..." aria-label="Global search">
        </div>

        <div id="searchResults" class="history-feed"></div>
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
    
    // Search parts
    this.data.parts.filter(p => p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q))).forEach(p => {
      results.push({
        type: 'Part',
        icon: 'fa-screwdriver-wrench',
        color: 'var(--blue)',
        title: p.name,
        subtitle: p.category || 'No Category',
        action: () => { navigate('parts').then(()=>PartsModule.showPartDetail(p.id)); }
      });
    });

    // Search Projects
    this.data.projects.filter(p => p.name.toLowerCase().includes(q)).forEach(p => {
      results.push({
        type: 'Project',
        icon: 'fa-folder',
        color: 'var(--accent)',
        title: p.name,
        subtitle: p.status || 'Active',
        action: () => { navigate('projects').then(()=>ProjectsModule.showDetail(p.id)); }
      });
    });

    // Search Tasks
    this.data.tasks.filter(t => t.title.toLowerCase().includes(q)).forEach(t => {
      results.push({
        type: 'Task',
        icon: 'fa-check',
        color: 'var(--purple)',
        title: t.title,
        subtitle: t.status,
        action: () => { navigate('tasks').then(()=>TasksModule.showAddModal(t.id)); }
      });
    });

    // Search People
    this.data.users.filter(u => u.name.toLowerCase().includes(q) || (u.role && u.role.toLowerCase().includes(q))).forEach(u => {
      results.push({
        type: 'Person',
        icon: 'fa-user',
        color: 'var(--green)',
        title: u.name,
        subtitle: u.role || 'Member',
        action: () => { navigate('people').then(()=>PeopleModule.showDetail(u.id)); }
      });
    });

    if (results.length === 0) {
      this.resultsContainer.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-ghost"></i>
          <h3>No results found</h3>
          <p>Try using different keywords.</p>
        </div>
      `;
      return;
    }

    this.resultsContainer.innerHTML = results.slice(0, 20).map((r, i) => `
      <div class="history-item card" style="cursor: pointer; padding: 12px; transition: background 0.15s; border-radius: var(--radius-md);" tabindex="0" onclick="window._globalSearchAction(${i})" onmouseover="this.style.background='var(--bg-3)'" onmouseout="this.style.background='var(--bg-2)'">
        <div class="history-icon" style="color: ${r.color}; background: var(--bg-1);">
          <i class="fa-solid ${r.icon}"></i>
        </div>
        <div class="history-body" style="justify-content: center;">
          <div class="history-text" style="font-weight: 500; font-size: 15px;">${escapeHTML(r.title)}</div>
          <div class="history-time" style="font-size: 13px;">${r.type} &bull; ${escapeHTML(r.subtitle)}</div>
        </div>
      </div>
    `).join('');

    window._globalSearchAction = (index) => {
      results[index].action();
    };
  }
};

window.SearchModule = SearchModule;
