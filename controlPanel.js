(function(){
  'use strict';

  // === CONTROL PANEL STATE (sidebar) ===
  const DEFAULT_AXES = [
    { key: 'Date',              type: 'scroll',  color: '#9ca3af',   enabled: true,  isTime: true },
    { key: 'AvgTemp',           type: 'static',  color: '#ef4444',   enabled: true },
    { key: 'MaxTemp',           type: 'static',  color: '#f59e0b',   enabled: true },
    { key: 'MinTemp',           type: 'static',  color: '#3b82f6',   enabled: true },
    { key: 'Precipitation',     type: 'static',  color: '#eab308',   enabled: true },
    { key: 'RelHumidity',       type: 'static',  color: '#a855f7',   enabled: true },
    { key: 'CloudCover',        type: 'static',  color: '#25bd32ff', enabled: false },
    { key: 'SunshineDuration',  type: 'static',  color: '#e3680bff', enabled: false },
    { key: 'AirPressure',       type: 'static',  color: '#22d3ee',   enabled: false },
    { key: 'Wind',              type: 'static',  color: '#0d4912ff', enabled: false },
    { key: 'VaporContent',      type: 'static',  color: '#ec4899',   enabled: false }
  ];

  let __controlsState = {
    arrangement: 'coordinatesWheel',
    linking: 'none',
    axes: JSON.parse(JSON.stringify(DEFAULT_AXES)),
    selectedIndex: 0,
    rotation: 0 // degrees, 0..360 - controls the radial rotation of axes
  };

  // Expose __controlsState to window for use in other modules
  window.__controlsState = __controlsState;

  // The control panel calls this whenever the user changes something.
  // We just replace our local state.
  window.onControlsChange = (st) => {
    __controlsState = JSON.parse(JSON.stringify(st));
    window.__controlsState = __controlsState;  // Keep window version in sync
    window.updateTableByDate && window.updateTableByDate();
    window.axisOverlay && window.axisOverlay.updateAxisHTML && window.axisOverlay.updateAxisHTML();
  };

  // Handy for debugging in DevTools:
  window.getControlsState = () => JSON.parse(JSON.stringify(__controlsState));

  function initControlsUI() {
    // Grab all interactive elements from index.html.
    const $ = s => document.querySelector(s);
    const axisListEl   = $('#axisList');
    const arrangementEl= $('#arrangement');
    const axisTypeEl   = $('#axisType');
    const linkingEl    = $('#linking');
    const btnUp        = $('#btnUp');
    const btnDown      = $('#btnDown');
    const btnRemove    = $('#btnRemove');
    const btnAddAll    = $('#btnAddAll');
    const btnReset     = $('#btnReset');

    function notify() { window.onControlsChange(__controlsState); }

    // Called after any structural change (reorder, remove, toggle).
    function renderAxisList() {
      axisListEl.innerHTML = '';
      __controlsState.axes.forEach((ax, i) => {
        const li = document.createElement('li');
        li.className = 'axis-item' + (i === __controlsState.selectedIndex ? ' selected' : '');
        li.dataset.index = i;

        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.style.background = ax.color;

        const meta = document.createElement('div');
        meta.className = 'axis-meta';
        const name = document.createElement('div');
        name.className = 'axis-name';
        name.textContent = ax.key;
        const sub = document.createElement('div');
        sub.className = 'axis-sub';
        sub.textContent = (ax.type === 'scroll' ? 'Scroll Axis' : 'Static Axis') + (ax.isTime ? ' • time' : '');

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!ax.enabled;
        cb.title = 'Enable/Disable axis';

        cb.addEventListener('click', (ev) => { ev.stopPropagation(); });

        const MAX_STATIC_AXES = 8;
        const MIN_STATIC_AXES = 5;
        cb.addEventListener('change', (e) => {
          const willEnable = e.target.checked;

          // Only limit "static" axes (attributes). Date/scroll is not counted.
          if (ax.type === 'static') {
            const enabledStaticCount = __controlsState.axes.filter(a => a.type === 'static' && a.enabled).length;

            // MIN: If already 5 static axes enabled, block disabling the 5th
            if (!willEnable && enabledStaticCount <= MIN_STATIC_AXES) {
              e.target.checked = true; // revert checkbox
              alert(`Minimum ${MIN_STATIC_AXES} attributes must be selected.`);
              return;
            }

            // MAX: If already 8 static axes enabled, block enabling the 9th
            if (willEnable && enabledStaticCount >= MAX_STATIC_AXES) {
              e.target.checked = false; // revert checkbox
              alert(`Maximum ${MAX_STATIC_AXES} attributes can be selected.`);
              return;
            }
          }
          ax.enabled = e.target.checked;
          notify();
          updateAxisHTML();        
        });

        meta.appendChild(name); meta.appendChild(sub);
        li.appendChild(chip); li.appendChild(meta); li.appendChild(cb);

        li.addEventListener('click', () => {
          __controlsState.selectedIndex = i;
          axisTypeEl.value = __controlsState.axes[i].type;
          renderAxisList();
        });

        axisListEl.appendChild(li);
      });
    }

    // Initial values
    arrangementEl.value = __controlsState.arrangement;
    linkingEl.value     = __controlsState.linking;
    axisTypeEl.value    = __controlsState.axes[__controlsState.selectedIndex]?.type ?? 'static';

    // Event bindings
    arrangementEl.addEventListener('change', (e) => { __controlsState.arrangement = e.target.value; notify(); });
    linkingEl.addEventListener('change', (e) => { __controlsState.linking = e.target.value; notify(); });
    axisTypeEl.addEventListener('change', (e) => {
      const ax = __controlsState.axes[__controlsState.selectedIndex];
      if (!ax) return;
      ax.type = e.target.value;
      ax.isTime = (ax.key === 'Date' && ax.type === 'scroll') || !!ax.isTime;
      renderAxisList(); notify();
    });
    btnUp.addEventListener('click', () => {
      const i = __controlsState.selectedIndex; if (i <= 0) return;
      [__controlsState.axes[i-1], __controlsState.axes[i]] = [__controlsState.axes[i], __controlsState.axes[i-1]];
      __controlsState.selectedIndex = i-1; renderAxisList(); notify();
    });
    btnDown.addEventListener('click', () => {
      const i = __controlsState.selectedIndex; if (i >= __controlsState.axes.length-1) return;
      [__controlsState.axes[i+1], __controlsState.axes[i]] = [__controlsState.axes[i], __controlsState.axes[i+1]];
      __controlsState.selectedIndex = i+1; renderAxisList(); notify();
    });
    btnRemove.addEventListener('click', () => {
      if (__controlsState.axes.length <= 1) return;
      __controlsState.axes.splice(__controlsState.selectedIndex, 1);
      __controlsState.selectedIndex = Math.max(0, __controlsState.selectedIndex - 1);
      renderAxisList(); notify();
    });
    btnAddAll.addEventListener('click', () => {
      const existing = new Set(__controlsState.axes.map(a => a.key));
      DEFAULT_AXES.forEach(ax => { if (!existing.has(ax.key)) __controlsState.axes.push(JSON.parse(JSON.stringify(ax))); });
      renderAxisList(); notify();
    });
    btnReset.addEventListener('click', () => {
      __controlsState = {
        arrangement: 'coordinatesWheel',
        linking: 'none',
        axes: JSON.parse(JSON.stringify(DEFAULT_AXES)),
        selectedIndex: 0                   
      };
      // Reset rotation slider
      const rot = document.getElementById('rotationSlider');  
      const rotVal = document.getElementById('rotationValue');
      if (rot) rot.value = 0;
      if (rotVal) rotVal.textContent = '0°';

      arrangementEl.value = __controlsState.arrangement;
      linkingEl.value     = __controlsState.linking;
      axisTypeEl.value    = __controlsState.axes[0].type;
      renderAxisList(); notify();
    });

    // Rotation slider (0..360°)
    (function createRotationControl(){
      const rotationContainer = document.createElement('div');
      rotationContainer.className = 'control-row rotation-container';

      const lbl = document.createElement('label');
      lbl.htmlFor = 'rotationSlider';
      lbl.className = 'rotation-label';
      lbl.textContent = 'Rotation:';

      const valueSpan = document.createElement('span');
      valueSpan.id = 'rotationValue';
      valueSpan.className = 'rotation-value';
      valueSpan.textContent = String(__controlsState.rotation || 0) + '°';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.id = 'rotationSlider';
      slider.min = 0;
      slider.max = 360;
      slider.step = 1;
      slider.value = __controlsState.rotation || 0;
      slider.className = 'rotation-slider';

      slider.addEventListener('input', (e) => {
        const v = Number(e.target.value);
        __controlsState.rotation = v;
        valueSpan.textContent = v + '°';
        notify();
        updateAxisHTML();
      });

      rotationContainer.appendChild(lbl);
      rotationContainer.appendChild(slider);
      rotationContainer.appendChild(valueSpan);

      try {
        arrangementEl.insertAdjacentElement('afterend', rotationContainer);
      } catch (err) {
        document.body.appendChild(rotationContainer);
      }
    })();

    renderAxisList();
    notify();
    window.axisOverlay && window.axisOverlay.updateAxisHTML && window.axisOverlay.updateAxisHTML();
  }

  window.controls = {
    initControlsUI,
    DEFAULT_AXES
  };

})();
