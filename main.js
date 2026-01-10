(function() {
  'use strict';

  // Get access to the modules
  const renderer = window.webglRenderer;
  const dateInt = window.dateInteraction;
  const axisOverlay = window.axisOverlay;

  if (!renderer || !dateInt || !axisOverlay) {
    console.error('Main modules not loaded. Make sure webglRenderer, dateInteraction, and axisOverlay are loaded before main.js');
    return;
  }

  // === RENDER LOOP ===
  function render() {
    if (!dateInt.getDayScale()) return;  // Wait until dayScale is initialized

    const gl = renderer.getContext();
    const canvas = renderer.getCanvas();
    const width = renderer.getWidth();
    const height = renderer.getHeight();
    const centerX = renderer.getCenterX();
    const centerY = renderer.getCenterY();

    // Prepare canvas and WebGL state
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.133, 0.133, 0.133, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const timelineStart = dateInt.getTimelineStart();
    const timelineEnd = dateInt.getTimelineEnd();
    const dayScale = dateInt.getDayScale();
    const currentDate = dateInt.getCurrentDate();
    const startDate = dateInt.getStartDate ? dateInt.getStartDate() : null;
    const endDate = dateInt.getEndDate ? dateInt.getEndDate() : null;
    const tickCount = dateInt.getTickCount ? dateInt.getTickCount() : dateInt.getDaysInMonth();
    const startTick = dateInt.getStartDay();
    const endTick = dateInt.getEndDay();

    // Draw timeline base line
    renderer.addLineToBuffer(timelineStart, centerY, timelineEnd - 15, centerY, [1, 1, 1, 1], 3);

    // Draw arrow at the end of the timeline
    const arrowSize = 15;
    renderer.addLineToBuffer(timelineEnd, centerY, timelineEnd - arrowSize, centerY - arrowSize/2, [1, 1, 1, 1], 3);
    renderer.addLineToBuffer(timelineEnd, centerY, timelineEnd - arrowSize, centerY + arrowSize/2, [1, 1, 1, 1], 3);

    // Draw left end cap
    renderer.addLineToBuffer(timelineStart, centerY - 10, timelineStart, centerY + 10, [1, 1, 1, 1], 2);

    // Draw timeline markers (tick-based: days, months, or months across years)
    for (let t = 1; t <= tickCount; t++) {
      const x = dayScale(t);
      if (t % Math.max(1, Math.floor(tickCount/12)) === 0) {
        renderer.addLineToBuffer(x, centerY - 7, x, centerY + 7, [0.4, 0.4, 0.4, 1], 1);
      } else {
        renderer.addLineToBuffer(x, centerY - 5, x, centerY + 5, [0.4, 0.4, 0.4, 1], 1);
      }
    }

    // Draw selected day range slider
    const startX = dayScale(startTick);
    const endX = dayScale(endTick);
    const sliderHeight = 16;
    const halfSize = sliderHeight / 2;
    
    if (startX === endX) {
      // Single day - draw a small square slider
      renderer.addLineToBuffer(startX , centerY, endX + sliderHeight, centerY, [1, 1, 1, 1], sliderHeight);
      
      // White edges
      renderer.addLineToBuffer(startX, centerY - sliderHeight/2, startX + sliderHeight, centerY + sliderHeight/2, [1, 1, 1, 1], 2);
      renderer.addLineToBuffer(startX, centerY - sliderHeight/2, startX + sliderHeight, centerY + sliderHeight/2, [1, 1, 1, 1], 2);
      renderer.addLineToBuffer(startX, centerY - sliderHeight/2, startX + sliderHeight, centerY - sliderHeight/2, [1, 1, 1, 1], 2);
      renderer.addLineToBuffer(startX, centerY + sliderHeight/2, startX + sliderHeight, centerY + sliderHeight/2, [1, 1, 1, 1], 2);
    } else {
      // Date range - draw a rectangular slider
      renderer.addLineToBuffer(startX, centerY, endX + halfSize, centerY, [1, 1, 1, 1], sliderHeight);
      
      // White edges
      renderer.addLineToBuffer(startX, centerY - sliderHeight/2, startX + halfSize, centerY + sliderHeight/2, [1, 1, 1, 1], 2);
      renderer.addLineToBuffer(endX, centerY - sliderHeight/2, endX + halfSize, centerY + sliderHeight/2, [1, 1, 1, 1], 2);
      renderer.addLineToBuffer(startX, centerY - sliderHeight/2, endX + halfSize, centerY - sliderHeight/2, [1, 1, 1, 1], 2);
      renderer.addLineToBuffer(startX, centerY + sliderHeight/2, endX + halfSize, centerY + sliderHeight/2, [1, 1, 1, 1], 2);
    }

    // Draw axis projection lines
    try {
      const container = document.getElementById('wheelContainer');
      const cw = container ? container.clientWidth || 600 : 600;
      const ch = container ? container.clientHeight || 600 : 600;
      if (window.axisProjection && window.csvData) {
        const projections = window.axisProjection.getProjections(currentDate, startDate, endDate, window.csvData, axisOverlay.getCurrentAxes(), cw, ch);
          projections.forEach(p => {
            const date = p.date instanceof Date ? p.date : null;
            if (!date) return;

            const timelineX = dateInt.dateToX ? dateInt.dateToX(date) : dayScale(date.getDate());
          // connection color - same as axis but semi-transparent
          const connColor = [p.color[0], p.color[1], p.color[2], 0.7];
          renderer.addLineToBuffer(p.px, p.py, timelineX, centerY, connColor, 1);
        });
      }
    } catch (e) {
      console.warn('projection draw error', e);
    }
    
    // Flush all lines to render them in one batch
    renderer.flushLineBuffer();

    requestAnimationFrame(render);
  }

  // === TABLE VIEW WRAPPERS ===
  window.updateTableByDate = () => {
    if (window.tableView && window.tableView.updateTableByDate) {
      window.tableView.updateTableByDate();
    }
  };

  // === INITIALIZATION ===
  function init() {
    // Initialize the dayScale with the correct number of days
    const daysInMonth = dateInt.getDaysInMonth();
    console.log('Initializing with days:', daysInMonth);
    
    const dayScale = d3.scaleLinear()
      .domain([1, daysInMonth])
      .range([dateInt.getTimelineStart(), dateInt.getTimelineEnd()]);
    
    dateInt.setDayScale(dayScale);
    dateInt.setStartDay(1);
    dateInt.setEndDay(1);
    
    // Update display
    dateInt.updateDateDisplay();
  }

  // Start initialization
  init();
  window.controls && window.controls.initControlsUI && window.controls.initControlsUI();
  window.tableView && window.tableView.initTableView && window.tableView.initTableView();

  // Start the render loop
  requestAnimationFrame(render);

})();
