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
  { key: 'AvgTemp',           type: 'static',  color: '#ef4444', enabled: true },
  { key: 'MaxTemp',           type: 'static',  color: '#f59e0b', enabled: true },
  { key: 'MinTemp',           type: 'static',  color: '#3b82f6', enabled: true },
  { key: 'Precipitation',     type: 'static',  color: '#eab308', enabled: true },
  { key: 'RelHumidity',       type: 'static',  color: '#a855f7', enabled: true },
  { key: 'CloudCover',        type: 'static',  color: '#10b981', enabled: true },
  { key: 'SunshineDuration',  type: 'static',  color: '#f97316', enabled: true },
  { key: 'AirPressure',       type: 'static',  color: '#22d3ee', enabled: true }
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
      cb.addEventListener('change', (e) => {
        ax.enabled = e.target.checked;
        notify();
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

// Starte die Anwendung
init();
initControlsUI();

// Starte den Render-Loop
requestAnimationFrame(render);