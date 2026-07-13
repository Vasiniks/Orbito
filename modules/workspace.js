// workspace.js — Enhanced with photos, containers, walk-to-part navigation
const WorkspaceModule = {
  async render(container) {
    this.container = container;
    await this.loadData();
    this.renderView();
  },

  async loadData() {
    this.locations = await DB.getAll('locations');
    this.parts = await DB.getAll('parts');
    this.tools = await DB.getAll('tools');
    
    // Fetch global settings for floorplan
    this.settings = await DB.getAll('settings');
    this.floorplan = this.settings.find(s => s.id === 'global_floorplan')?.value || null;
  },

  renderView() {
    this.container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <h2 style="font-size:18px;font-weight:600">Workspace Map</h2>
        </div>
        <div class="toolbar-right">
          ${this.floorplan ? `
            <button class="btn btn-secondary" id="drawGlobalZonesBtn"><i class="fa-solid fa-draw-polygon"></i> Draw Zones on Map</button>
            <button class="btn btn-secondary" onclick="document.getElementById('floorplanInput').click()"><i class="fa-solid fa-image"></i> Change Floorplan</button>
          ` : `
            <button class="btn btn-primary" onclick="document.getElementById('floorplanInput').click()"><i class="fa-solid fa-upload"></i> Upload Floorplan</button>
          `}
          <input type="file" id="floorplanInput" accept="image/*" style="display:none">
        </div>
      </div>
      
      <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:300px">
          <div class="ws-map" id="workspaceMap" style="background-image:url('${this.floorplan || ''}'); background-size:contain; background-position:center; background-repeat:no-repeat;"></div>
          <div class="mt-4 flex gap-4 text-sm text-muted" style="flex-wrap:wrap">
            <div class="flex items-center gap-2"><span style="width:12px;height:12px;border-radius:2px;background:#3b82f6"></span> Storage</div>
            <div class="flex items-center gap-2"><span style="width:12px;height:12px;border-radius:2px;background:#10b981"></span> Workspace</div>
            <div class="flex items-center gap-2"><span style="width:12px;height:12px;border-radius:2px;background:#f59e0b"></span> Machine</div>
            <div class="flex items-center gap-2"><span style="width:12px;height:12px;border-radius:2px;background:#8b5cf6"></span> Other</div>
          </div>
        </div>
        <div style="width:320px;min-width:280px" id="zoneDetailPanel">
          <div class="empty-state" style="padding:40px 20px"><p>Click a zone on the map to see its contents.</p></div>
        </div>
      </div>
    `;

    if (document.getElementById('drawGlobalZonesBtn')) {
      document.getElementById('drawGlobalZonesBtn').addEventListener('click', () => this.drawGlobalZones());
    }

    document.getElementById('floorplanInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const data = await readFileAsDataURL(file, 1800); // floorplans need more detail
      await DB.put('settings', { id: 'global_floorplan', value: data });
      toast('Floorplan uploaded!', 'success');
      this.render(this.container);
    });

    this.renderMap();
  },

  drawGlobalZones() {
    const boxes = this.locations.map(loc => ({
      id: loc.id,
      name: loc.name,
      x: loc.x, y: loc.y, w: loc.w, h: loc.h
    }));

    AnnotateModule.open(this.floorplan, boxes, async (newBoxes) => {
      // Find deleted zones
      const newBoxIds = newBoxes.map(b => b.id);
      for (const loc of this.locations) {
        if (!newBoxIds.includes(loc.id)) {
          // Unassign parts/tools before delete
          for (const p of this.parts.filter(x => x.locationId === loc.id)) { p.locationId = null; p.containerId = null; await DB.put('parts', p); }
          for (const t of this.tools.filter(x => x.locationId === loc.id)) { t.locationId = null; await DB.put('tools', t); }
          await DB.delete('locations', loc.id);
          HistoryModule.log('delete', 'zone', loc.id, loc.name, 'Deleted via map draw');
        }
      }

      // Update or create zones
      for (const box of newBoxes) {
        const existing = this.locations.find(l => l.id === box.id);
        if (existing) {
          existing.x = box.x; existing.y = box.y; existing.w = box.w; existing.h = box.h; existing.name = box.name;
          await DB.put('locations', existing);
        } else {
          await DB.put('locations', {
            id: box.id, name: box.name,
            x: box.x, y: box.y, w: box.w, h: box.h,
            type: 'workspace', color: '#3b82f6', photo: '', containers: []
          });
          HistoryModule.log('create', 'zone', box.id, box.name, 'Created via map draw');
        }
      }

      toast('Zones saved to map!', 'success');
      await this.loadData();
      this.renderView();
    });
  },

  renderMap() {
    const map = document.getElementById('workspaceMap');
    
    if (this.locations.length === 0 && !this.floorplan) {
      map.innerHTML = `<div class="empty-state" style="height:100%"><i class="fa-solid fa-map-location-dot"></i><h3>No Floorplan</h3><p>Upload a floorplan photo to get started.</p></div>`;
      return;
    }
    if (this.locations.length === 0) {
      map.innerHTML = `<div class="empty-state" style="height:100%;background:rgba(0,0,0,0.5);"><i class="fa-solid fa-draw-polygon"></i><h3>No Zones</h3><p>Click "Draw Zones on Map" to outline areas.</p></div>`;
      return;
    }

    map.innerHTML = this.locations.map(loc => {
      const partsCount = this.parts.filter(p => p.locationId === loc.id).length;
      const toolsCount = this.tools.filter(t => t.locationId === loc.id).length;
      const hasPhoto = loc.photo ? `background-image:url('${loc.photo}');background-size:cover;background-position:center;` : '';
      const containerCount = (loc.containers || []).length;
      
      return `
        <div class="ws-zone ${loc.photo ? 'has-photo' : ''}" 
             style="left:${loc.x}%;top:${loc.y}%;width:${loc.w}%;height:${loc.h}%;${hasPhoto}${!hasPhoto ? `background-color:${loc.color}20;` : ''}border-color:${loc.color}80;color:${loc.color}" 
             onclick="WorkspaceModule.showDetail('${loc.id}')">
          <div class="ws-zone-title" ${hasPhoto ? 'style="background:rgba(0,0,0,0.6);color:#fff;padding:2px 6px;border-radius:4px;display:inline-block"' : ''}>${escapeHTML(loc.name)}</div>
          <div class="ws-zone-meta" ${hasPhoto ? 'style="background:rgba(0,0,0,0.5);color:#fff;padding:1px 4px;border-radius:3px;display:inline-block;font-size:10px"' : ''}>${partsCount}P | ${toolsCount}T${containerCount ? ` | ${containerCount}C` : ''}</div>
        </div>
      `;
    }).join('');
  },

  async showAddModal(id = null) {
    const loc = id ? this.locations.find(x => x.id === id) : { x: 10, y: 10, w: 20, h: 20, color: '#3b82f6', type: 'storage', containers: [] };
    
    const body = `
      <form id="zoneForm">
        <div class="form-group">
          <label class="form-label">Zone Name</label>
          <input type="text" class="form-input" id="zoneName" value="${escapeHTML(loc.name || '')}" required>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-select" id="zoneType" onchange="document.getElementById('zoneColor').value = this.options[this.selectedIndex].dataset.color">
              <option value="storage" data-color="#3b82f6" ${loc.type === 'storage' ? 'selected' : ''}>Storage</option>
              <option value="workspace" data-color="#10b981" ${loc.type === 'workspace' ? 'selected' : ''}>Workspace</option>
              <option value="machine" data-color="#f59e0b" ${loc.type === 'machine' ? 'selected' : ''}>Machine</option>
              <option value="other" data-color="#8b5cf6" ${loc.type === 'other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Color Hex</label>
            <input type="text" class="form-input" id="zoneColor" value="${escapeHTML(loc.color)}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Zone Photo</label>
          <div class="flex items-center gap-3">
            ${loc.photo ? `<img src="${loc.photo}" style="width:80px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">` : ''}
            <label class="btn btn-secondary btn-sm" style="cursor:pointer">
              <i class="fa-solid fa-camera"></i> ${loc.photo ? 'Change' : 'Upload'} Photo
              <input type="file" accept="image/*" id="zonePhotoInput" style="display:none">
            </label>
          </div>
          <input type="hidden" id="zonePhotoData" value="">
        </div>

        ${loc.photo ? `
          <div class="form-group">
            <label class="form-label">Containers <span class="text-muted text-xs">(${(loc.containers||[]).length} defined)</span></label>
            <button type="button" class="btn btn-secondary btn-sm" id="drawContainersBtn">
              <i class="fa-solid fa-draw-polygon"></i> Draw Containers on Photo
            </button>
          </div>
        ` : '<p class="text-sm text-muted mt-2"><i class="fa-solid fa-info-circle"></i> Upload a photo first, then you can draw container boundaries on it.</p>'}

        <h4 class="mt-4 mb-2 text-sm font-semibold text-muted">Position is managed by Map Drawer</h4>
        <div class="grid-4" style="display:none">
          <div class="form-group"><input type="number" id="zoneX" value="${loc.x}"></div>
          <div class="form-group"><input type="number" id="zoneY" value="${loc.y}"></div>
          <div class="form-group"><input type="number" id="zoneW" value="${loc.w}"></div>
          <div class="form-group"><input type="number" id="zoneH" value="${loc.h}"></div>
        </div>
      </form>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="WorkspaceModule.saveZone('${id || ''}', this)">Save Zone Details</button>
    `;
    openModal(id ? 'Edit Zone' : 'Add Zone', body, footer);

    // Photo upload handler
    const photoInput = document.getElementById('zonePhotoInput');
    if (photoInput) {
      photoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const data = await readFileAsDataURL(file);
        document.getElementById('zonePhotoData').value = data;
        toast('Photo loaded!', 'success');
      });
    }

    // Draw containers button
    const drawBtn = document.getElementById('drawContainersBtn');
    if (drawBtn) {
      this._tempContainers = JSON.parse(JSON.stringify(loc.containers || []));
      drawBtn.addEventListener('click', () => {
        const photoSrc = document.getElementById('zonePhotoData').value || loc.photo;
        AnnotateModule.open(photoSrc, this._tempContainers, (containers) => {
          this._tempContainers = containers;
          toast(`${containers.length} containers saved`, 'success');
          // Re-open the zone modal
          this.showAddModal(id);
        });
      });
    }
  },

  async saveZone(id, btn) {
    if (btn) btn.disabled = true;
    const name = document.getElementById('zoneName').value.trim();
    if (!name) {
      if (btn) btn.disabled = false;
      return toast('Name is required', 'error');
    }

    const newPhoto = document.getElementById('zonePhotoData').value;
    const existing = id ? this.locations.find(x => x.id === id) : {};

    const data = {
      id: id || undefined,
      name,
      type: document.getElementById('zoneType').value,
      color: document.getElementById('zoneColor').value,
      x: parseInt(document.getElementById('zoneX').value) || 10,
      y: parseInt(document.getElementById('zoneY').value) || 10,
      w: parseInt(document.getElementById('zoneW').value) || 20,
      h: parseInt(document.getElementById('zoneH').value) || 20,
      photo: newPhoto || existing.photo || '',
      containers: this._tempContainers || existing.containers || []
    };

    try {
      if (id) {
        await DB.put('locations', data);
        toast('Zone updated', 'success');
        HistoryModule.log('update', 'zone', id, name, `Type: ${data.type}, ${data.containers.length} containers`);
      } else {
        const newId = await DB.add('locations', data);
        toast('Zone added', 'success');
        HistoryModule.log('create', 'zone', newId, name, `Type: ${data.type}`);
      }
      
      this._tempContainers = null;
      closeModal();
      await this.loadData();
      this.renderView();
    } catch (err) {
      if (btn) btn.disabled = false;
      toast('Error saving zone', 'error');
    }
  },

  showDetail(id) {
    const loc = this.locations.find(x => x.id === id);
    if (!loc) return;

    const zParts = this.parts.filter(p => p.locationId === loc.id);
    const zTools = this.tools.filter(t => t.locationId === loc.id);
    const containers = loc.containers || [];

    this.renderMap();
    
    const panel = document.getElementById('zoneDetailPanel');
    panel.innerHTML = `
      <div class="card p-4 mb-4" style="border-top:4px solid ${loc.color}">
        <div class="flex justify-between items-start mb-2">
          <div>
            <h3 style="font-size:16px;font-weight:600">${escapeHTML(loc.name)}</h3>
            <span class="badge badge-gray text-xs">${loc.type}</span>
          </div>
          <button class="btn-icon btn-sm" onclick="WorkspaceModule.showAddModal('${loc.id}')" title="Edit Zone Details"><i class="fa-solid fa-pen"></i></button>
        </div>

        ${loc.photo ? `
          <div style="margin-top:12px;position:relative;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
            <img src="${loc.photo}" style="width:100%;display:block">
            ${containers.map((c, i) => {
              const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
              const color = colors[i % colors.length];
              return `<div style="position:absolute;left:${c.x}%;top:${c.y}%;width:${c.w}%;height:${c.h}%;border:2px solid ${color};background:${color}22;border-radius:3px;cursor:pointer" title="${escapeHTML(c.name)}">
                <span style="font-size:9px;background:${color};color:#fff;padding:1px 4px;border-radius:2px;position:absolute;top:-1px;left:-1px;white-space:nowrap">${escapeHTML(c.name)}</span>
              </div>`;
            }).join('')}
          </div>
        ` : ''}

        ${containers.length > 0 ? `
          <div style="margin-top:10px">
            <h4 class="text-xs font-semibold text-muted mb-1">Containers (${containers.length})</h4>
            ${containers.map(c => `<span class="badge badge-blue" style="margin:2px;font-size:10px">${escapeHTML(c.name)}</span>`).join('')}
          </div>
        ` : ''}
      </div>

      <h4 class="text-sm font-semibold mb-2">Tools (${zTools.length})</h4>
      <div class="card mb-4">
        ${zTools.length === 0 ? '<div class="p-3 text-sm text-muted">No tools here</div>' : zTools.map(t => `
          <div class="p-2 border-b text-sm flex justify-between items-center" style="border-bottom:1px solid var(--border)">
            <span>${escapeHTML(t.name)}</span>
            <span class="priority-dot priority-${t.condition==='good'?'low':t.condition==='maintenance'?'medium':'high'}"></span>
          </div>
        `).join('')}
      </div>

      <h4 class="text-sm font-semibold mb-2">Parts (${zParts.length})</h4>
      <div class="card">
        ${zParts.length === 0 ? '<div class="p-3 text-sm text-muted">No parts here</div>' : zParts.map(p => `
          <div class="p-2 border-b text-sm flex justify-between items-center" style="border-bottom:1px solid var(--border)">
            <span class="truncate" style="max-width:140px">${escapeHTML(p.name)}</span>
            <div class="flex items-center gap-2">
              <span class="${(p.inStock||0)<(p.needed||0)?'text-red':''}">${p.inStock||0}</span>
              <button class="btn-icon btn-sm" title="Walk to this part" onclick="WorkspaceModule.showWalkToPartModal('${p.id}')"><i class="fa-solid fa-route" style="font-size:11px"></i></button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  async showWalkToPartModal(partId) {
    const part = this.parts.find(p => p.id === partId);
    if (!part) { toast('Part not found', 'error'); return; }

    const loc = this.locations.find(l => l.id === part.locationId);
    if (!loc) { toast('This part has no assigned location', 'error'); return; }

    const containers = loc.containers || [];
    const container = part.containerId ? containers.find(c => c.name === part.containerId) : null;

    let step = 1;
    const totalSteps = container ? 3 : 2;

    const renderStep = () => {
      let stepContent = '';
      let stepTitle = '';

      if (step === 1) {
        stepTitle = `Step 1/${totalSteps}: Go to ${escapeHTML(loc.name)}`;
        stepContent = `
          <div class="walk-step">
            <div class="walk-step-icon"><i class="fa-solid fa-location-dot" style="font-size:32px;color:${loc.color}"></i></div>
            <h3 style="margin:12px 0 4px">${escapeHTML(loc.name)}</h3>
            <span class="badge badge-gray">${loc.type}</span>
            ${loc.photo ? `<img src="${loc.photo}" class="walk-photo" style="margin-top:12px;width:100%;max-height:300px;object-fit:cover;border-radius:8px">` : '<p class="text-muted mt-4">No photo available for this zone.</p>'}
            <p class="text-sm text-muted mt-3">Head to this area in your workspace.</p>
          </div>
        `;
      } else if (step === 2 && container) {
        stepTitle = `Step 2/${totalSteps}: Find ${escapeHTML(container.name)}`;
        const hasBox = container.x != null && container.w != null;
        stepContent = `
          <div class="walk-step">
            <div class="walk-step-icon"><i class="fa-solid fa-box-open" style="font-size:32px;color:var(--blue)"></i></div>
            <h3 style="margin:12px 0 4px">${escapeHTML(container.name)}</h3>
            <p class="text-sm text-muted">Inside ${escapeHTML(loc.name)}</p>
            ${container.photo ? `
              <div style="margin-top:12px;width:100%">
                <div class="text-xs text-muted" style="margin-bottom:4px;text-align:left">The container:</div>
                <img src="${container.photo}" style="width:100%;max-height:220px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in" onclick="showLightbox(this.src)" alt="Photo of ${escapeAttr(container.name)}">
              </div>
            ` : ''}
            ${loc.photo ? `
              <div style="width:100%">
                <div class="text-xs text-muted" style="margin:12px 0 4px;text-align:left">Where it is in ${escapeHTML(loc.name)}:</div>
                <div style="position:relative;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
                  <img src="${loc.photo}" style="width:100%;display:block;${hasBox ? 'filter:brightness(0.5)' : ''}">
                  ${hasBox ? `<div style="position:absolute;left:${container.x}%;top:${container.y}%;width:${container.w}%;height:${container.h}%;border:3px solid #3b82f6;background:rgba(59,130,246,0.3);border-radius:4px;animation:pulse-border 1.5s infinite"></div>` : ''}
                </div>
              </div>
            ` : ''}
            ${!container.photo && !loc.photo ? '<p class="text-muted mt-4">No photos yet — add one to the container or zone so this step can show the way.</p>' : ''}
            <p class="text-sm text-muted mt-3">Look for <strong>${escapeHTML(container.name)}</strong> in this area.</p>
          </div>
        `;
      } else {
        // Final step — arrived
        stepTitle = `Step ${totalSteps}/${totalSteps}: Confirm Arrival`;
        stepContent = `
          <div class="walk-step" style="text-align:center">
            <div class="walk-step-icon"><i class="fa-solid fa-flag-checkered" style="font-size:40px;color:var(--green)"></i></div>
            <h3 style="margin:12px 0 8px">Found ${escapeHTML(part.name)}?</h3>
            <p class="text-sm text-muted mb-4">Press the button below to confirm you've arrived.</p>
            <button class="btn btn-primary" style="width:100%;padding:14px;font-size:16px" onclick="WorkspaceModule.confirmArrived('${partId}')">
              <i class="fa-solid fa-check-circle"></i> I've Arrived!
            </button>
          </div>
        `;
      }

      openModal(stepTitle, stepContent, `
        ${step > 1 ? `<button class="btn btn-secondary" onclick="WorkspaceModule._walkStep=-1;WorkspaceModule._walkRender()"><i class="fa-solid fa-arrow-left"></i> Back</button>` : ''}
        <div style="flex:1"></div>
        ${step < totalSteps ? `<button class="btn btn-primary" onclick="WorkspaceModule._walkStep=1;WorkspaceModule._walkRender()">Next <i class="fa-solid fa-arrow-right"></i></button>` : ''}
      `);
    };

    this._walkStep = 0;
    this._walkRender = () => {
      step += this._walkStep;
      if (step < 1) step = 1;
      if (step > totalSteps) step = totalSteps;
      renderStep();
    };

    renderStep();
  },

  async confirmArrived(partId) {
    const part = this.parts.find(p => p.id === partId);
    try {
      await DB.add('walk_logs', {
        partId,
        partName: part?.name || '',
        userId: AuthModule.currentUser?.uid || '',
        userName: AuthModule.currentUser?.name || '',
        timestamp: Date.now()
      });
      HistoryModule.log('arrived', 'part', partId, part?.name || '', 'Confirmed arrival at part location');
      closeModal();
      toast('Arrival confirmed! 🎉', 'success');
    } catch (e) {
      toast('Error logging arrival: ' + e.message, 'error');
    }
  },

  async deleteZone(id) {
    if (!confirm('Delete this zone? Parts and tools will be marked as "No Location".')) return;
    
    const loc = this.locations.find(x => x.id === id);
    for (const p of this.parts.filter(x => x.locationId === id)) {
      p.locationId = null;
      p.containerId = null;
      await DB.put('parts', p);
    }
    for (const t of this.tools.filter(x => x.locationId === id)) {
      t.locationId = null;
      await DB.put('tools', t);
    }

    await DB.delete('locations', id);
    HistoryModule.log('delete', 'zone', id, loc?.name || '', '');
    toast('Zone deleted', 'success');
    closeModal();
    await this.loadData();
    this.renderView();
  }
};

window.WorkspaceModule = WorkspaceModule;
