// tour.js — Guided onboarding tour with spotlight coach-marks
const TourModule = {
  steps: [
    {
      target: null,
      title: 'Welcome to Orbito! 👋',
      body: 'Orbito keeps your team\'s parts, projects, tools, and people in one place. This quick tour shows you around — it takes about a minute.',
    },
    {
      target: '.sidebar-nav',
      title: 'Navigation',
      body: 'Everything lives in the sidebar. The ☰ button up top collapses or opens it — on a phone you can also swipe right from the left edge.',
      openSidebar: true,
    },
    {
      target: '[data-view="projects"]',
      title: 'Projects',
      body: 'Create projects and subsystems (like Drivetrain or Intake). Each subsystem gets a numeric code that auto-numbers its parts.',
      openSidebar: true,
    },
    {
      target: '[data-view="parts"]',
      title: 'Parts Library',
      body: 'Your stock, plain and simple: photos, counts, locations, and containers. Use the +/− buttons for quick counts and the Containers button to manage bins.',
      openSidebar: true,
    },
    {
      target: '[data-view="spreadsheet"]',
      title: 'Master Spreadsheet',
      body: 'Every part your project needs, grouped by subsystem. Click any chip to edit it in place, and click a status to pick the next stage.',
      openSidebar: true,
    },
    {
      target: '[data-view="workspace"]',
      title: 'Workspace Map',
      body: 'Upload a floorplan, draw zones, and Orbito can walk anyone to the exact container a part lives in.',
      openSidebar: true,
    },
    {
      target: '#globalFab',
      title: 'Quick Add',
      body: 'The + button works from any page — add a part, task, project, or sketch in two taps.',
      closeSidebar: true,
    },
    {
      target: '#helpBtn',
      title: 'Need help later?',
      body: 'This button shows tips for whatever page you\'re on, and lets you replay this tour. Press Ctrl/Cmd+K anytime to search everything. Enjoy!',
      closeSidebar: true,
    },
  ],

  current: 0,
  active: false,

  maybeAutoStart() {
    if (!localStorage.getItem('launchpad-tour-done')) {
      // Small delay so the app shell has rendered
      setTimeout(() => this.start(), 600);
    }
  },

  start() {
    this.current = 0;
    this.active = true;
    this.ensureElements();
    this.showStep();
  },

  ensureElements() {
    if (document.getElementById('tourOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'tourOverlay';
    overlay.className = 'tour-overlay';
    overlay.innerHTML = `
      <div class="tour-spotlight" id="tourSpotlight"></div>
      <div class="tour-card" id="tourCard">
        <div class="tour-card-step" id="tourStepLabel"></div>
        <h3 id="tourTitle"></h3>
        <p id="tourBody"></p>
        <div class="tour-card-actions">
          <button class="btn btn-ghost btn-sm" id="tourSkipBtn">Skip tour</button>
          <div style="flex:1"></div>
          <button class="btn btn-secondary btn-sm" id="tourBackBtn"><i class="fa-solid fa-arrow-left"></i> Back</button>
          <button class="btn btn-primary btn-sm" id="tourNextBtn">Next <i class="fa-solid fa-arrow-right"></i></button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('tourSkipBtn').addEventListener('click', () => this.end());
    document.getElementById('tourBackBtn').addEventListener('click', () => { this.current = Math.max(0, this.current - 1); this.showStep(); });
    document.getElementById('tourNextBtn').addEventListener('click', () => {
      if (this.current >= this.steps.length - 1) return this.end();
      this.current++;
      this.showStep();
    });
    window.addEventListener('resize', () => { if (this.active) this.showStep(); });
  },

  showStep() {
    const step = this.steps[this.current];
    const overlay = document.getElementById('tourOverlay');
    const spotlight = document.getElementById('tourSpotlight');
    const card = document.getElementById('tourCard');
    overlay.classList.add('open');

    const isMobile = window.innerWidth <= 768;
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (isMobile && sidebar) {
      if (step.openSidebar) { sidebar.classList.add('open'); if (sidebarOverlay) sidebarOverlay.classList.remove('show'); }
      if (step.closeSidebar) { sidebar.classList.remove('open'); if (sidebarOverlay) sidebarOverlay.classList.remove('show'); }
    }

    document.getElementById('tourStepLabel').textContent = `Step ${this.current + 1} of ${this.steps.length}`;
    document.getElementById('tourTitle').textContent = step.title;
    document.getElementById('tourBody').textContent = step.body;
    document.getElementById('tourBackBtn').style.visibility = this.current === 0 ? 'hidden' : 'visible';
    document.getElementById('tourNextBtn').innerHTML = this.current >= this.steps.length - 1
      ? 'Finish <i class="fa-solid fa-check"></i>'
      : 'Next <i class="fa-solid fa-arrow-right"></i>';

    // Position spotlight + card (allow sidebar animation to settle)
    setTimeout(() => {
      const el = step.target ? document.querySelector(step.target) : null;
      if (el && el.offsetParent !== null || (el && getComputedStyle(el).position === 'fixed')) {
        const r = el.getBoundingClientRect();
        const pad = 8;
        spotlight.style.display = 'block';
        spotlight.style.left = (r.left - pad) + 'px';
        spotlight.style.top = (r.top - pad) + 'px';
        spotlight.style.width = (r.width + pad * 2) + 'px';
        spotlight.style.height = (r.height + pad * 2) + 'px';

        // Place card next to the target without going off screen
        const cw = Math.min(340, window.innerWidth - 24);
        card.style.maxWidth = cw + 'px';
        let left = r.right + 16;
        let top = r.top;
        if (left + cw > window.innerWidth - 12) left = Math.max(12, r.left - cw - 16);
        if (left < 12 || (left + cw > window.innerWidth - 12)) {
          // fall back: below or above the target, centered
          left = Math.min(Math.max(12, r.left), window.innerWidth - cw - 12);
          top = r.bottom + 16;
          if (top + 220 > window.innerHeight) top = Math.max(12, r.top - 220 - 16);
        }
        top = Math.min(Math.max(12, top), window.innerHeight - 220);
        card.style.left = left + 'px';
        card.style.top = top + 'px';
        card.style.transform = 'none';
      } else {
        // Centered step (welcome / no target)
        spotlight.style.display = 'none';
        card.style.maxWidth = Math.min(400, window.innerWidth - 24) + 'px';
        card.style.left = '50%';
        card.style.top = '50%';
        card.style.transform = 'translate(-50%, -50%)';
      }
    }, step.openSidebar || step.closeSidebar ? 280 : 0);
  },

  end() {
    this.active = false;
    localStorage.setItem('launchpad-tour-done', '1');
    const overlay = document.getElementById('tourOverlay');
    if (overlay) overlay.classList.remove('open');
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('open');
      const so = document.getElementById('sidebarOverlay');
      if (so) so.classList.remove('show');
    }
    toast('Tour complete! Press the ? button anytime for help.', 'success');
  }
};

window.TourModule = TourModule;
