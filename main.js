// WebGL Konfiguration
const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl', { antialias: true });
const width = 600;
const height = 600;
const centerX = width / 2;
const centerY = height / 2;

// support High-DPI displays
const DPR = window.devicePixelRatio || 1;
canvas.style.width = width + 'px';
canvas.style.height = height + 'px';
canvas.width = Math.floor(width * DPR);
canvas.height = Math.floor(height * DPR);

// Ensure canvas internal pixel size matches our drawing resolution
canvas.width = width;
canvas.height = height;

if (!gl) {
    alert('WebGL nicht verfügbar');
    throw new Error('WebGL nicht verfügbar');
}

// === CONTROL PANEL STATE (sidebar) ===
const DEFAULT_AXES = [
  { key: 'Date',              type: 'scroll',  color: '#9ca3af', enabled: true,  isTime: true },
  { key: 'AvgTemp',           type: 'static',  color: '#ef4444', enabled: false },
  { key: 'MaxTemp',           type: 'static',  color: '#f59e0b', enabled: false },
  { key: 'MinTemp',           type: 'static',  color: '#3b82f6', enabled: false },
  { key: 'Precipitation',     type: 'static',  color: '#eab308', enabled: false },
  { key: 'RelHumidity',       type: 'static',  color: '#a855f7', enabled: false },
  { key: 'CloudCover',        type: 'static',  color: '#10b981', enabled: false },
  { key: 'SunshineDuration',  type: 'static',  color: '#f97316', enabled: false },
  { key: 'AirPressure',       type: 'static',  color: '#22d3ee', enabled: false }
];

let __controlsState = {
  arrangement: 'coordinatesWheel',
  linking: 'none',
  axes: JSON.parse(JSON.stringify(DEFAULT_AXES)),
  selectedIndex: 0
};

// The control panel calls this whenever the user changes something.
// We just replace our local state.
window.onControlsChange = (st) => {
  __controlsState = JSON.parse(JSON.stringify(st));
  updateTableByDate();
  updateAxisHTML();
};

// Handy for debugging in DevTools:
window.getControlsState = () => JSON.parse(JSON.stringify(__controlsState));


// Enable alpha blending
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

// Shader Source Code
const vertexShaderSource = `
    attribute vec2 a_position;
    uniform vec2 u_resolution;
    
    void main() {
        vec2 zeroToOne = a_position / u_resolution;
        vec2 clipSpace = zeroToOne * 2.0 - 1.0;
        gl_Position = vec4(clipSpace.x, -clipSpace.y, 0, 1);
    }
`;

const fragmentShaderSource = `
    precision mediump float;
    uniform vec4 u_color;
    
    void main() {
        gl_FragColor = u_color;
    }
`;

// Shader Kompilierung
function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader Kompilierungsfehler:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

// Shader Program erstellen
const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Shader Program Linkfehler:', gl.getProgramInfoLog(program));
    throw new Error('Shader Program konnte nicht erstellt werden');
}

// Programm aktivieren
gl.useProgram(program);

// Attribute und Uniforms Location
const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
const resolutionUniformLocation = gl.getUniformLocation(program, 'u_resolution');
const colorUniformLocation = gl.getUniformLocation(program, 'u_color');

// Buffer für die Position (allocate once)
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

// allocate a reasonably large dynamic buffer once (bytes)
gl.bufferData(gl.ARRAY_BUFFER, 256 * 1024, gl.DYNAMIC_DRAW);

// setup attribute pointer once
gl.enableVertexAttribArray(positionAttributeLocation);
gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

// Timeline Konfiguration
const timelineStart = centerX - 100 * DPR;
const timelineEnd = centerX + 100 * DPR;   // Hier hab ich DPR hinzugefügt
const timelineLength = timelineEnd - timelineStart;

// Datumskonfiguration und Interaktion
let currentDate = new Date();
let startDay = 1;
let endDay = 1;
let dragMode = null; // 'move', 'left', 'right'
let isDragging = false;

// Skala für die Tage
let dayScale = d3.scaleLinear()
    .domain([1, 31])  // Standard-Monatslänge, wird später aktualisiert
    .range([timelineStart, timelineEnd]);

// Datumsnavigation
const prevMonthButton = document.getElementById('prevMonth');
const nextMonthButton = document.getElementById('nextMonth');
const dateDisplay = document.getElementById('dateDisplay');

function updateMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    startDay = 1;
    endDay = 1;
    const daysInMonth = getDaysInMonth();
    
    // Aktualisiere die Skala
    dayScale.domain([1, daysInMonth]);
    
    // Aktualisiere die Anzeige
    updateDateDisplay();
    
    // Aktualisiere die Tabelle mit dem neuen Datum
    updateTableByDate();
}

function getDaysInMonth() {
    return new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0
    ).getDate();
}

function updateDisplay() {
    const daysInMonth = getDaysInMonth();
    
    // Aktualisiere die Skala
    dayScale = d3.scaleLinear()
        .domain([1, daysInMonth])
        .range([timelineStart, timelineEnd]);
    
    // Aktualisiere das Datum
    updateDateDisplay();
}

// Event Listener für Monatsnavigation
prevMonthButton.addEventListener('click', () => updateMonth(-1));
nextMonthButton.addEventListener('click', () => updateMonth(1));

// Funktion zum Einschränken eines Wertes auf einen Bereich
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// Funktion zum Runden auf den nächsten Tag
const snapToDay = (x) => {
    const daysInMonth = getDaysInMonth();
    const day = Math.round(dayScale.invert(x));
    return dayScale(clamp(day, 1, daysInMonth));
};

// Der Canvas startet im "grab" Modus
canvas.style.cursor = "grab";

// WebGL Rendering Funktionen
function drawLine(x1, y1, x2, y2, color, width = 2.0) {
    // Berechne die Richtung und Länge der Linie
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);
    
    // Berechne die vier Ecken des Linien-Rechtecks
    const cosa = Math.cos(angle);
    const sina = Math.sin(angle);
    const wx = (width / 2) * sina;
    const wy = (width / 2) * cosa;
    
    // Definiere die Vertices für das Rechteck
    const vertices = new Float32Array([
        x1 - wx, y1 + wy,  // links oben
        x1 + wx, y1 - wy,  // links unten
        x2 - wx, y2 + wy,  // rechts oben
        x2 + wx, y2 - wy   // rechts unten
    ]);

    // Buffer und Attribute aktualisieren
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    
    // Uniforms setzen
    gl.uniform2f(resolutionUniformLocation, canvas.width, canvas.height);
    gl.uniform4fv(colorUniformLocation, color);
    
    // Zeichnen
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// Funktion zum Zeichnen eines gefüllten Kreises
function drawCircle(x, y, radius, color) {
    const segments = 32;
    const vertices = new Float32Array(segments * 3 * 2);
    
    for (let i = 0; i < segments; i++) {
        const angle1 = (i / segments) * Math.PI * 2;
        const angle2 = ((i + 1) / segments) * Math.PI * 2;
        
        vertices[i * 6] = x;
        vertices[i * 6 + 1] = y;
        
        vertices[i * 6 + 2] = x + Math.cos(angle1) * radius;
        vertices[i * 6 + 3] = y + Math.sin(angle1) * radius;
        
        vertices[i * 6 + 4] = x + Math.cos(angle2) * radius;
        vertices[i * 6 + 5] = y + Math.sin(angle2) * radius;
    }
    
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    
    gl.uniform2f(resolutionUniformLocation, canvas.width, canvas.height);
    gl.uniform4fv(colorUniformLocation, color);
    
    gl.drawArrays(gl.TRIANGLES, 0, segments * 3);
}

//  RADIAL AXIS HTML OVERLAY

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

// Create a single axis HTML element and place it around the wheel
function createAxisHTML(ax, index, total) {
  const container = document.getElementById("wheelContainer");
  if (!container) return;

  const containerWidth  = container.clientWidth  || 600;
  const containerHeight = container.clientHeight || 600;

  const centerX = containerWidth  / 2;
  const centerY = containerHeight / 2;

  // Radius of the circle on which the axes are placed
  const radius = containerWidth * 0.38; // biraz oynayabilirsin

  // GEOMETRY

  // Radial angle: where the axis center lies relative to the wheel center
  // index 0: at the top (–90°), others follow clockwise
  const radialAngle = -Math.PI / 2 + (index / total) * (2 * Math.PI);

  // Tangent angle: make the axis tangent to the circle
  const tangentAngle = radialAngle + Math.PI / 2; // +90°

  // Axis center point (center of the polygon edge)
  const cx = centerX + Math.cos(radialAngle) * radius;
  const cy = centerY + Math.sin(radialAngle) * radius;

  // Axis length (same for all for now; can be varied by index later)
  const axisLength = containerWidth * 0.35; // gerekirse küçült/büyüt

  // DOM ELEMENT

  const el = document.createElement("div");
  el.className = "axis-container";

  el.style.position = "absolute";
  el.style.width  = axisLength + "px";
  el.style.height = "20px"; // çizgi + label yüksekliği

  // Place the element so that its center (50%, 50%) sits on (cx, cy)
  el.style.left = (cx - axisLength / 2) + "px";
  el.style.top  = (cy - 10) + "px"; // 10 = height/2

  el.style.transformOrigin = "50% 50%";
  el.style.transform = `rotate(${tangentAngle * 180 / Math.PI}deg)`;

  el.innerHTML = `
    <div class="axis-line"></div>
    <div class="axis-label">${ax.key}</div>
  `;

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


function render() {
    if (!dayScale) return;  // Warte bis dayScale initialisiert ist
    
    // Canvas und WebGL-Kontext vorbereiten
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.133, 0.133, 0.133, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Hauptlinie (Timeline) zeichnen
    drawLine(timelineStart, centerY, timelineEnd - 15, centerY, [1, 1, 1, 1], 3);

    // Pfeilspitze am Ende der Timeline
    const arrowSize = 15;
    drawLine(timelineEnd, centerY, timelineEnd - arrowSize, centerY - arrowSize/2, [1, 1, 1, 1], 3);
    drawLine(timelineEnd, centerY, timelineEnd - arrowSize, centerY + arrowSize/2, [1, 1, 1, 1], 3);

    // Vertikaler Strich am Anfang der Timeline
    drawLine(timelineStart, centerY - 10, timelineStart, centerY + 10, [1, 1, 1, 1], 2);

    // Tagesmarkierungen zeichnen
    const daysInMonth = getDaysInMonth();
    for (let day = 1; day <= daysInMonth; day++) {
        const x = dayScale(day);
        
        if (day % 5 === 0) {
            // Etwas längere Markierung für jeden 5. Tag
            drawLine(x, centerY - 7, x, centerY + 7, [0.4, 0.4, 0.4, 1], 1);
        } else {
            // Normale Tagesmarkierung
            drawLine(x, centerY - 5, x, centerY + 5, [0.4, 0.4, 0.4, 1], 1);
        }
    }

    // Slider zeichnen
    const startX = dayScale(startDay);
    const endX = dayScale(endDay);
    const sliderHeight = 16;
    const halfSize = sliderHeight / 2;
    
    // Debug-Ausgabe
    console.log('Slider Position:', { startDay, endDay, startX, endX });
    
    if (startX === endX) {
        // Einzelner Tag - zeichne quadratischen Slider
        
        drawLine(startX , centerY, endX + sliderHeight, centerY, [1, 1, 1, 1], sliderHeight);
        
        // Weiße Kanten
        drawLine(startX, centerY - sliderHeight/2, startX + sliderHeight, centerY + sliderHeight/2, [1, 1, 1, 1], 2);
        drawLine(startX, centerY - sliderHeight/2, startX + sliderHeight, centerY + sliderHeight/2, [1, 1, 1, 1], 2);
        drawLine(startX, centerY - sliderHeight/2, startX + sliderHeight, centerY - sliderHeight/2, [1, 1, 1, 1], 2);
        drawLine(startX, centerY + sliderHeight/2, startX + sliderHeight, centerY + sliderHeight/2, [1, 1, 1, 1], 2);
    } else {
        // Zeitraum - zeichne ausgedehnten Slider
        // Grauer Hintergrund
        drawLine(startX, centerY, endX + halfSize, centerY, [1, 1, 1, 1], sliderHeight);
        
        // Weiße Kanten
        drawLine(startX, centerY - sliderHeight/2, startX + halfSize, centerY + sliderHeight/2, [1, 1, 1, 1], 2);
        drawLine(endX, centerY - sliderHeight/2, endX + halfSize, centerY + sliderHeight/2, [1, 1, 1, 1], 2);
        drawLine(startX, centerY - sliderHeight/2, endX + halfSize, centerY - sliderHeight/2, [1, 1, 1, 1], 2);
        drawLine(startX, centerY + sliderHeight/2, endX + halfSize, centerY + sliderHeight/2, [1, 1, 1, 1], 2);
    } 

    requestAnimationFrame(render);
}

// Funktion zum Aktualisieren der Datumsanzeige
function updateDateDisplay() {
    console.log('updateDateDisplay:', { startDay, endDay, currentDate });
    
    const startDate = new Date(currentDate);
    startDate.setDate(startDay);
    const endDate = new Date(currentDate);
    endDate.setDate(endDay);
    
    if (startDay === endDay) {
        // Einzelner Tag
        dateDisplay.textContent = startDate.toLocaleDateString('de-DE', { 
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    } else {
        // Zeitraum
        const startStr = startDate.toLocaleDateString('de-DE', { 
            day: 'numeric',
            month: 'long'
        });
        const endStr = endDate.toLocaleDateString('de-DE', { 
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        dateDisplay.textContent = `${startStr} - ${endStr}`;
    }
    
    // Aktualisiere die Tabelle mit dem neuen Datum
    updateTableByDate();
}

// === Control Panel UI ===
// Wires up the sidebar elements
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
      // Each axis row is clickable to select it.

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

      // When the checkbox is clicked, prevent the parent <li> click event from being triggered.
      cb.addEventListener('click', (ev) => {
        ev.stopPropagation();
      });   

      cb.addEventListener('change', (e) => {
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
  // Set the dropdowns to reflect the current control state
  arrangementEl.value = __controlsState.arrangement;
  linkingEl.value     = __controlsState.linking;
  axisTypeEl.value    = __controlsState.axes[__controlsState.selectedIndex]?.type ?? 'static';

  // Event bindings: This function binds all event listeners for the control panel elements.
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
    arrangementEl.value = __controlsState.arrangement;
    linkingEl.value     = __controlsState.linking;
    axisTypeEl.value    = __controlsState.axes[0].type;
    renderAxisList(); notify();
  });

  renderAxisList();
  notify();
}


// Mouse Event Handler

function isOverSliderEdge(x, y) {
    const currentStartX = dayScale(startDay);
    const currentEndX = dayScale(endDay);
    const sliderWidth = 16;
    const edgeWidth = 5;  // Kanten-Griffbreite
    const moveHit = 4;   // Halbbreite des mittleren Move-Griffs für Single-Day (halbe Breite)

    // Prüfe, ob der Maus-y innerhalb des Sliders liegt
    if (y >= centerY - sliderWidth / 2 && y <= centerY + sliderWidth / 2) {
        // Sonderfall: einzelner Tag -> kleine mittlere Fläche als Verschieben behandeln
        if (currentStartX === currentEndX) {
            // Für einen Ein-Tages-Slider: kleineren mittleren Move-Bereich verwenden
            if (x >= currentStartX + edgeWidth && x <= currentEndX + sliderWidth - edgeWidth/2) {
                return 'move';
            }
            // Kanten zum Größenändern bleiben erreichbar: links/rechts innerhalb edgeWidth
            if (x >= currentStartX - edgeWidth/2 && x < currentStartX + edgeWidth/2) {
                return 'left';
            }
            if (x <= currentEndX + sliderWidth + edgeWidth/2 && x > currentEndX + sliderWidth - edgeWidth/2) {
                return 'right';
            }
            return null;
        }

        // Normaler Bereich: großer Mittelbereich zum Verschieben
        if (x >= currentStartX + edgeWidth && x <= currentEndX + sliderWidth/2 - edgeWidth) {
            return 'move';
        }

        // Kanten zum Größenändern
        if (x >= currentStartX - edgeWidth/2 && x <= currentStartX + edgeWidth/2) {
            return 'left';
        }
        if (x >= currentEndX + sliderWidth/2 - edgeWidth && x <= currentEndX + sliderWidth/2 + edgeWidth) {
            return 'right';
        }
    }
    return null;
}


canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (isDragging) {
        handleDrag(e);
    } else {
        const edge = isOverSliderEdge(x, y);
        if (edge === 'left' || edge === 'right') {
            canvas.style.cursor = 'ew-resize';
        } else if (edge === 'move') {
            canvas.style.cursor = 'grab';
        } else {
            canvas.style.cursor = 'default';
        }
    }
});

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    dragMode = isOverSliderEdge(x, y);
    if (dragMode) {
        isDragging = true;
        if (dragMode === 'move') {
            canvas.style.cursor = 'grabbing';
        }
    }
});

document.addEventListener('mouseup', (e) => {
    // Compute cursor and stop dragging using the real event parameter (avoid undefined global `event`).
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    isDragging = false;
    dragMode = null;

    const edge = isOverSliderEdge(x, y);
    if (edge === 'move') {
        canvas.style.cursor = 'grab';
    } else if (edge === 'left' || edge === 'right') {
        canvas.style.cursor = 'ew-resize';
    } else {
        canvas.style.cursor = 'default';
    }
});

function handleDrag(e) {
    if (!isDragging || !dragMode) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newDay = Math.round(dayScale.invert(x));
    const daysInMonth = getDaysInMonth();
    
    console.log('Dragging:', { dragMode, newDay, startDay, endDay });

    switch (dragMode) {
        case 'left':
            // Allow the left edge to be moved up to (and including) endDay
            // so the range can collapse to a single day.
            const newStartDay = Math.min(Math.max(1, newDay), endDay);
            if (newStartDay !== startDay) {
                startDay = newStartDay;
                // Ensure endDay is not before startDay (defensive)
                if (endDay < startDay) endDay = startDay;
                updateDateDisplay();
            }
            break;
            
        case 'right':
            // Allow the right edge to be moved down to (and including) startDay
            // so the range can collapse to a single day.
            const newEndDay = Math.max(Math.min(daysInMonth, newDay), startDay);
            if (newEndDay !== endDay) {
                endDay = newEndDay;
                // Defensive: ensure startDay is not after endDay
                if (startDay > endDay) startDay = endDay;
                updateDateDisplay();
            }
            break;
            
        case 'move':
            const width = endDay - startDay;
            let newStart = Math.round(newDay - width / 2);
            
            // Begrenze die Position innerhalb des Monats
            if (newStart < 1) newStart = 1;
            if (newStart + width > daysInMonth) newStart = daysInMonth - width;
            
            if (newStart !== startDay) {
                startDay = newStart;
                endDay = newStart + width;
                updateDateDisplay();
            }
            break;
    }
}

// Initialisierung
function init() {
    // Initialisiere die dayScale mit der korrekten Anzahl von Tagen
    const daysInMonth = getDaysInMonth();
    console.log('Initializing with days:', daysInMonth);
    
    dayScale.domain([1, daysInMonth]);
    
    startDay = 1;
    endDay = 1;
    
    // Aktualisiere die Anzeige
    updateDateDisplay();
}

// === TABLE VIEW FUNCTIONALITY ===
let csvData = null;
let filteredRows = [];

// Helper function to format date as YYYY-MM-DD
function formatDateAsKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function initTableView() {
    try {
        const parsed = await window.readCSV.loadCSVFromUrl('res/climate_small.csv', ';');
        csvData = parsed;

        // Extract first date from CSV and set currentDate
        if (parsed.rows && parsed.rows.length > 0) {
            const firstRowDate = parsed.rows[0].Date;
            if (firstRowDate instanceof Date) {
                currentDate = new Date(firstRowDate);
                startDay = currentDate.getDate();
                endDay = startDay;
                
                // Update dayScale for the new month
                const daysInMonth = getDaysInMonth();
                dayScale.domain([1, daysInMonth]);
                updateDateDisplay();
            }
        }
        
        updateTableByDate();
    } catch (error) {
        console.error('Error loading CSV:', error);
        document.getElementById('tableContainer').innerHTML = 
            `<p style="color:#e6e6e6; padding:16px;">Error loading CSV: ${error.message}</p>`;
    }
}

function updateTableByDate() {
    if (!csvData) return;

    // Support date ranges: if startDay !== endDay, filter for all days in range
    const rangeStart = Math.min(startDay, endDay);
    const rangeEnd = Math.max(startDay, endDay);
    
    filteredRows = csvData.rows.filter(row => {
        if (!row.Date || !(row.Date instanceof Date)) return false;
        const rowDateKey = formatDateAsKey(row.Date);
        
        // Build date range to check against
        const rowDate = new Date(row.Date);
        const rowMonth = rowDate.getMonth();
        const currentMonth = currentDate.getMonth();
        const rowYear = rowDate.getFullYear();
        const currentYear = currentDate.getFullYear();
        
        // Check if row is in the same month/year as currentDate
        if (rowYear !== currentYear || rowMonth !== currentMonth) {
            return false;
        }
        
        // Check if row day is within the selected range
        const rowDay = rowDate.getDate();
        return rowDay >= rangeStart && rowDay <= rangeEnd;
    });
    
    renderTable();
}

function renderTable() {
    if (!csvData) return;

    const container = document.getElementById('tableContainer');
    
    if (filteredRows.length === 0) {
        container.innerHTML = '<p style="color:#9aa0a6; padding:16px; text-align:center;">Keine Daten für diesen Zeitraum</p>';
        return;
    }

    // Build range header
    const rangeStart = Math.min(startDay, endDay);
    const rangeEnd = Math.max(startDay, endDay);
    let rangeInfo = '';

    let html = rangeInfo + '<table><thead><tr>';
    csvData.columns.forEach(col => {
        html += `<th>${escapeHtml(col)}</th>`;
    });
    html += '</tr></thead><tbody>';

    filteredRows.forEach(row => {
        html += '<tr>';
        csvData.columns.forEach(col => {
            const value = row[col];
            let displayValue = '';
            if (value === null || value === undefined) {
                displayValue = '—';
            } else if (value instanceof Date) {
                displayValue = value.toISOString().split('T')[0];
            } else if (typeof value === 'number') {
                displayValue = value.toFixed(2);
            } else {
                displayValue = String(value);
            }
            html += `<td>${escapeHtml(displayValue)}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Starte die Anwendung
init();
initControlsUI();
initTableView();

// Starte den Render-Loop
requestAnimationFrame(render);