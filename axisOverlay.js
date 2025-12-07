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

  // Create a single axis HTML element and place it around the wheel
  function createAxisHTML(ax, index, total) {
    const container = document.getElementById("wheelContainer");
    if (!container) return;

    const containerWidth  = container.clientWidth  || 600;
    const containerHeight = container.clientHeight || 600;

    const centerX = containerWidth  / 2;
    const centerY = containerHeight / 2;

    // Radius of the circle on which the axes are placed
    const radius = containerWidth * 0.38;

    // GEOMETRY
    // Radial angle: where the axis center lies relative to the wheel center
    const rotationDeg = getRotationDeg();
    const rotationRad = rotationDeg * Math.PI / 180;
    const radialAngle = -Math.PI / 2 + rotationRad + (index / total) * (2 * Math.PI);

    // Tangent angle: make the axis tangent to the circle
    const tangentAngle = radialAngle + Math.PI / 2; // +90°

    // Axis center point (center of the polygon edge)
    const cx = centerX + Math.cos(radialAngle) * radius;
    const cy = centerY + Math.sin(radialAngle) * radius;

    // Axis length
    const axisLength = containerWidth * 0.35;

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
    el.style.transform = `rotate(${tangentAngle * 180 / Math.PI}deg)`;

    el.innerHTML = `
      <div class="axis-line"></div>
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
    activeAxes.forEach((ax, i) => {
      createAxisHTML(ax, i, activeAxes.length);
    });
  }

  // Expose the axis overlay interface
  window.axisOverlay = {
    getCurrentAxes,
    getRotationDeg,
    createAxisHTML,
    updateAxisHTML
  };

})();
