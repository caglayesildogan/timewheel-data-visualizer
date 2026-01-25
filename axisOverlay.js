(function() {
  'use strict';

  // Get the current axis list from the control panel state
  function getCurrentAxes() {
    if (typeof window.getControlsState === 'function') {
      const st = window.getControlsState();
      if (st && Array.isArray(st.axes)) return st.axes;
    }
    if (window.__controlsState && Array.isArray(window.__controlsState.axes)) {
      return window.__controlsState.axes;
    }
    if (typeof __controlsState !== 'undefined' &&
        __controlsState && Array.isArray(__controlsState.axes)) {
      return __controlsState.axes;
    }
    return [];
  }

  // Return current rotation (degrees) from the control state
  function getRotationDeg() {
    if (typeof window.getControlsState === 'function') {
      const st = window.getControlsState();
      if (st && typeof st.rotation === 'number') return st.rotation;
    }
    if (window.__controlsState && typeof window.__controlsState.rotation === 'number') return window.__controlsState.rotation;
    if (typeof __controlsState !== 'undefined' && typeof __controlsState.rotation === 'number') return __controlsState.rotation;
    return 0;
  }

  // Reads the current magnification value from the global control state
  function getMagnification() {
    if (typeof window.getControlsState === 'function') {
      const st = window.getControlsState();
      if (st && typeof st.magnification === 'number') return st.magnification;
    }
    if (window.__controlsState && typeof window.__controlsState.magnification === 'number') return window.__controlsState.magnification;
    if (typeof __controlsState !== 'undefined' && typeof __controlsState.magnification === 'number') return __controlsState.magnification;
    return 0;
  }

  // Clamps a value between 0 and 1
  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  // Formats a range value for display on the axis
  function formatRangeValue(v) {
    if (!Number.isFinite(v)) return '';
    const abs = Math.abs(v);
    let maxDecimals = 2;
    if (abs >= 1000) maxDecimals = 0;
    else if (abs >= 100) maxDecimals = 1;
    else if (abs < 1) maxDecimals = 3;
    return v.toLocaleString('en-US', {
      maximumFractionDigits: maxDecimals,
      minimumFractionDigits: 0
    });
  }

  // Computes the intersection point of two infinite lines
  // Returns null if the lines are parallel
  function intersectLines(n1, r1, n2, r2) {
    const det = n1.x * n2.y - n1.y * n2.x;
    if (Math.abs(det) < 1e-6) return null;
    const x = (r1 * n2.y - n1.y * r2) / det;
    const y = (n1.x * r2 - r1 * n2.x) / det;
    return { x, y };
  }

  // Computes geometry data for all axes based on rotation and magnification
  function computeAxisGeometries(total, baseRadius, rotationDeg, magnification) {
    const m = clamp01(magnification / 100);
    const rotationRad = rotationDeg * Math.PI / 180;
    const geoms = [];
    const normals = [];
    const radii = [];

    for (let i = 0; i < total; i++) {
      const radialAngle = -Math.PI / 2 + rotationRad + (i / total) * (2 * Math.PI);
      const tangentAngle = radialAngle + Math.PI / 2;
      const w = Math.abs(Math.sin(radialAngle)); 
      // Shape target:
      const radiusScale = 0.18 * (1 - w) - 0.22 * w;
      const diagW = Math.SQRT1_2; 
      let bias;
      if (w <= diagW) {
        const t = w / diagW;
        bias = 3 - t * 1; 
      } else {
        const t = (w - diagW) / (1 - diagW);
        bias = 0 - t * 5; 
      }
      const k = 0.03;
      const radius = baseRadius * (1 + m * (radiusScale + k * bias));

      // Axis Direction Vectors
      const nx = Math.cos(radialAngle);
      const ny = Math.sin(radialAngle);
      const tx = -Math.sin(radialAngle);
      const ty = Math.cos(radialAngle);

      // Store Axis Geometry Data
      normals.push({ x: nx, y: ny });
      radii.push(radius);
      geoms.push({
        radialAngle,
        tangentAngle,
        radius,
        nx,
        ny,
        tx,
        ty
      });
    }

    // Compute axis lengths and mid offsets based on intersections with neighbors
    const baseAxisLength = 2 * baseRadius * Math.tan(Math.PI / total) + 2;
    for (let i = 0; i < total; i++) {
      const prev = (i - 1 + total) % total;
      const next = (i + 1) % total;
      const n = normals[i];
      const center = { x: n.x * radii[i], y: n.y * radii[i] };
      const prevPt = intersectLines(n, radii[i], normals[prev], radii[prev]);
      const nextPt = intersectLines(n, radii[i], normals[next], radii[next]);

      // If intersection fails, use default axis length
      if (!prevPt || !nextPt) {
        geoms[i].axisLength = baseAxisLength;
        geoms[i].midOffset = 0;
        geoms[i].center = center;
        continue;
      }

      // Project intersection points onto the tangent to find extents
      const sPrev = (prevPt.x - center.x) * geoms[i].tx + (prevPt.y - center.y) * geoms[i].ty;
      const sNext = (nextPt.x - center.x) * geoms[i].tx + (nextPt.y - center.y) * geoms[i].ty;
      const sMin = Math.min(sPrev, sNext);
      const sMax = Math.max(sPrev, sNext);
      const axisLength = Math.max(10, sMax - sMin);

      geoms[i].axisLength = axisLength;
      geoms[i].midOffset = (sMin + sMax) / 2;
      geoms[i].center = center;
    }

    return geoms;
  }

  // Create a single axis HTML element and place it around the wheel
  function createAxisHTML(ax, geom, container, centerX, centerY) {
    const axisLength = geom.axisLength;
    const cx = centerX + geom.center.x + geom.tx * geom.midOffset;
    const cy = centerY + geom.center.y + geom.ty * geom.midOffset;
    // Get range data from axisProjection module
    const ranges = window.axisProjection && window.axisProjection._getRanges ? window.axisProjection._getRanges() : null; 
    const range = ranges && ranges[ax.key] ? ranges[ax.key] : null;

    // DOM ELEMENT
    const el = document.createElement("div");
    el.className = "axis-container";

    el.style.position = "absolute";
    el.style.width  = axisLength + "px";
    el.style.height = "20px";

    // Place the element so that its center (50%, 50%) sits on (cx, cy)
    el.style.left = (cx - axisLength / 2) + "px";
    el.style.top  = (cy - 10) + "px"; // 10 = height/2

    el.style.transformOrigin = "50% 50%";
    el.style.transform = `rotate(${geom.tangentAngle * 180 / Math.PI}deg)`;

    // Inner HTML
    const minLabel = range ? formatRangeValue(range.min) : '';
    const maxLabel = range ? formatRangeValue(range.max) : '';
    const rangeHTML = range ? `
      <div class="axis-range axis-range-min">
        <span class="axis-value">${minLabel}</span>
      </div>
      <div class="axis-range axis-range-max">
        <span class="axis-value">${maxLabel}</span>
      </div>
    ` : '';

    el.innerHTML = `
      <div class="axis-line"></div>
      ${rangeHTML}                        
      <div class="axis-label">${ax.key}</div>
    `;

    // expose the axis key on the DOM element for projection logic
    el.dataset.key = ax.key;

    container.appendChild(el);
  }

  // Rebuild all axis HTML elements based on the currently selected attributes
  function updateAxisHTML() {
    const container = document.getElementById("wheelContainer");
    if (!container) return;

    // Remove all previous axis containers
    container.querySelectorAll(".axis-container").forEach(node => node.remove());

    const axes = getCurrentAxes();
    if (!axes.length) return;

    // Compute ranges for all axes
    if (window.axisProjection && window.axisProjection.computeRanges && window.csvData) {
      window.axisProjection.computeRanges(window.csvData, axes);
    }

    // Only use static + enabled axes
    let activeAxes = axes.filter(ax => ax.type === 'static' && ax.enabled);

    // Debug log
    console.log('updateAxisHTML - activeAxes:', activeAxes.map(a => a.key));

    // Limit: only render if the number of axes is between 5 and 8
    if (activeAxes.length < 5 || activeAxes.length > 8) {
      // For now: if fewer than 5 or more than 8, do not render any axes
      return;
    }

    // Use the order from the control panel: index 0 → top, then clockwise around the wheel
    const containerWidth  = container.clientWidth  || 600;
    const containerHeight = container.clientHeight || 600;
    const centerX = containerWidth  / 2;
    const centerY = containerHeight / 2;
    const baseRadius = containerWidth * 0.38;
    const geoms = computeAxisGeometries(
      activeAxes.length,
      baseRadius,
      getRotationDeg(),
      getMagnification()
    );

    activeAxes.forEach((ax, i) => {
      createAxisHTML(ax, geoms[i], container, centerX, centerY);
    });
  }

  // Expose the axis overlay interface
  window.axisOverlay = {
    getCurrentAxes,
    getRotationDeg,
    getMagnification,
    createAxisHTML,
    updateAxisHTML
  };

})();
