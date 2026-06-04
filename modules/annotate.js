// annotate.js — Canvas-based boundary drawing tool for location photos
const AnnotateModule = {
  open(imageUrl, existingContainers, onSaveCallback) {
    if (!imageUrl) {
      toast('Upload a photo first before drawing containers.', 'error');
      return;
    }

    const containers = JSON.parse(JSON.stringify(existingContainers || []));

    openModal('Draw Containers', `
      <p class="text-sm text-muted" style="margin-bottom:12px">Click and drag on the image to draw container boundaries. Each box will be labeled.</p>
      <div class="annotate-wrap" style="position:relative;width:100%;overflow:hidden;border-radius:8px;border:1px solid var(--border)">
        <canvas id="annotateCanvas" style="width:100%;display:block;cursor:crosshair"></canvas>
      </div>
      <div id="containerList" style="margin-top:12px"></div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="saveContainersBtn"><i class="fa-solid fa-save"></i> Save Containers</button>
    `);

    const canvas = document.getElementById('annotateCanvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    let drawing = false;
    let startX = 0, startY = 0, curX = 0, curY = 0;

    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      this._redraw(ctx, img, containers, null);
    };
    img.src = imageUrl;

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    };

    const onStart = (e) => {
      e.preventDefault();
      drawing = true;
      const pos = getPos(e);
      startX = pos.x;
      startY = pos.y;
    };

    const onMove = (e) => {
      if (!drawing) return;
      e.preventDefault();
      const pos = getPos(e);
      curX = pos.x;
      curY = pos.y;
      this._redraw(ctx, img, containers, { x: startX, y: startY, w: curX - startX, h: curY - startY });
    };

    const onEnd = (e) => {
      if (!drawing) return;
      drawing = false;
      const pos = e.changedTouches ? {
        x: (e.changedTouches[0].clientX - canvas.getBoundingClientRect().left) * (canvas.width / canvas.getBoundingClientRect().width),
        y: (e.changedTouches[0].clientY - canvas.getBoundingClientRect().top) * (canvas.height / canvas.getBoundingClientRect().height)
      } : getPos(e);
      curX = pos.x;
      curY = pos.y;

      const w = Math.abs(curX - startX);
      const h = Math.abs(curY - startY);
      if (w < 10 || h < 10) return; // too small

      const name = prompt('Container name (e.g. "Shelf A", "Bin 3"):');
      if (!name) {
        this._redraw(ctx, img, containers, null);
        return;
      }

      containers.push({
        name,
        x: (Math.min(startX, curX) / canvas.width * 100),
        y: (Math.min(startY, curY) / canvas.height * 100),
        w: (w / canvas.width * 100),
        h: (h / canvas.height * 100)
      });

      this._redraw(ctx, img, containers, null);
      this._renderList(containers, ctx, img);
    };

    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onEnd);
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);

    this._renderList(containers, ctx, img);

    document.getElementById('saveContainersBtn').addEventListener('click', () => {
      closeModal();
      if (onSaveCallback) onSaveCallback(containers);
    });
  },

  _redraw(ctx, img, containers, activeRect) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(img, 0, 0);

    // Draw existing containers
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
    containers.forEach((c, i) => {
      const x = c.x / 100 * ctx.canvas.width;
      const y = c.y / 100 * ctx.canvas.height;
      const w = c.w / 100 * ctx.canvas.width;
      const h = c.h / 100 * ctx.canvas.height;
      const color = colors[i % colors.length];

      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = color + '33';
      ctx.fillRect(x, y, w, h);

      // Label
      ctx.fillStyle = color;
      const fontSize = Math.max(14, Math.min(24, ctx.canvas.width / 40));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = '#fff';
      const textW = ctx.measureText(c.name).width;
      ctx.fillStyle = color;
      ctx.fillRect(x, y - fontSize - 6, textW + 12, fontSize + 8);
      ctx.fillStyle = '#fff';
      ctx.fillText(c.name, x + 6, y - 4);
    });

    // Draw active rectangle
    if (activeRect) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(activeRect.x, activeRect.y, activeRect.w, activeRect.h);
      ctx.setLineDash([]);
    }
  },

  _renderList(containers, ctx, img) {
    const list = document.getElementById('containerList');
    if (!list) return;

    if (containers.length === 0) {
      list.innerHTML = '<p class="text-sm text-muted">No containers drawn yet. Click and drag on the image above.</p>';
      return;
    }

    list.innerHTML = containers.map((c, i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
        <span class="badge badge-blue" style="font-size:11px">${i + 1}</span>
        <span style="flex:1;font-size:13px;font-weight:500">${escapeHTML(c.name)}</span>
        <button class="btn-icon" title="Remove" onclick="AnnotateModule._removeContainer(${i})"><i class="fa-solid fa-trash text-red" style="font-size:12px"></i></button>
      </div>
    `).join('');

    // Store refs for removal
    this._currentContainers = containers;
    this._currentCtx = ctx;
    this._currentImg = img;
  },

  _removeContainer(index) {
    if (!this._currentContainers) return;
    this._currentContainers.splice(index, 1);
    this._redraw(this._currentCtx, this._currentImg, this._currentContainers, null);
    this._renderList(this._currentContainers, this._currentCtx, this._currentImg);
  }
};

window.AnnotateModule = AnnotateModule;
