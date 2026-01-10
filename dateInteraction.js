(function() {
  'use strict';

  // State - will be accessed from main.js
  let currentDate = new Date();
  // `startDay` / `endDay` are used as generic tick indices depending on mode:
  // - days: 1..daysInMonth -> day of month
  // - months: 1..12 -> month index
  // - years: 1..(12*yearCount) -> month index across multiple years
  let startDay = 1;
  let endDay = 1;
  let dragMode = null; // 'move', 'left', 'right'
  let isDragging = false;
  let mode = 'days'; // 'days' | 'months' | 'years'
  let yearCount = 1; // used when mode === 'years'

  const canvas = document.getElementById('glCanvas');
  const prevMonthButton = document.getElementById('prevMonth');
  const nextMonthButton = document.getElementById('nextMonth');
  const dateDisplay = document.getElementById('dateDisplay');

  // Timeline config
  const renderer = window.webglRenderer;
  const centerX = renderer.getCenterX();
  const centerY = renderer.getCenterY();
  const DPR = renderer.getDPR();
  const timelineStart = centerX - 100 * DPR;
  const timelineEnd = centerX + 100 * DPR;
  const timelineLength = timelineEnd - timelineStart;

  // Scale for mapping days to x positions
  let dayScale = d3.scaleLinear()
    .domain([1, 31])  // Standard month with 31 days - will be updated dynamically
    .range([timelineStart, timelineEnd]);

  // Helper functions
  function getDaysInMonth() {
    return new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    ).getDate();
  }

  function getTickCount() {
    if (mode === 'days') return getDaysInMonth();
    if (mode === 'months') return 12;
    if (mode === 'years') return 12 * Math.max(1, yearCount);
    return getDaysInMonth();
  }

  function setMode(m) {
    if (!['days','months','years'].includes(m)) return;
    mode = m;
    // reset selection to safe defaults
    startDay = 1; endDay = 1;
    // update scale domain
    dayScale.domain([1, getTickCount()]);
    updateDateDisplay();
  }

  function getMode() { return mode; }

  function setYearCount(n) {
    yearCount = Math.max(1, Math.min(5, Math.floor(Number(n) || 1)));
    // when changing year count adjust domain
    dayScale.domain([1, getTickCount()]);
    startDay = Math.min(startDay, getTickCount());
    endDay = Math.min(endDay, getTickCount());
    updateDateDisplay();
  }

  function getYearCount() { return yearCount; }

  // Convert a JavaScript Date -> timeline X position depending on current mode
  function dateToX(date) {
    if (!(date instanceof Date)) return null;
    if (mode === 'days') {
      return dayScale(date.getDate());
    }
    // base month for months/years mapping is currentDate's month/year
    const baseYear = currentDate.getFullYear();
    const baseMonth = currentDate.getMonth();
    const offset = (date.getFullYear() - baseYear) * 12 + (date.getMonth() - baseMonth) + 1; // 1-based
    return dayScale(offset);
  }

  function getStartDate() {
    if (mode === 'days') {
      const sd = new Date(currentDate);
      sd.setDate(startDay);
      return sd;
    }
    // months/years -> compute month offset
    const base = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const sd = new Date(base);
    sd.setMonth(base.getMonth() + (startDay - 1));
    sd.setDate(1);
    return sd;
  }

  function getEndDate() {
    if (mode === 'days') {
      const ed = new Date(currentDate);
      ed.setDate(endDay);
      return ed;
    }
    // months/years -> compute month offset and set to last day of that month
    const base = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const ed = new Date(base);
    ed.setMonth(base.getMonth() + (endDay - 1) + 1); // go to next month
    ed.setDate(0); // last day of previous month
    return ed;
  }

  function updateMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    startDay = 1; endDay = 1;
    // Update dayScale domain depending on mode
    dayScale.domain([1, getTickCount()]);
    
    // Update the date display
    updateDateDisplay();
    
    // Update the table with the new month
    window.updateTableByDate && window.updateTableByDate();
  }

  function updateDateDisplay() {
    console.log('updateDateDisplay:', { startDay, endDay, currentDate });
    
    const startDate = getStartDate();
    const endDate = getEndDate();

    if (mode === 'days') {
      if (startDay === endDay) {
        dateDisplay.textContent = startDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
      } else {
        const startStr = startDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
        const endStr = endDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
        dateDisplay.textContent = `${startStr} - ${endStr}`;
      }
    } else if (mode === 'months') {
      if (startDay === endDay) {
        dateDisplay.textContent = startDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      } else {
        const startStr = startDate.toLocaleDateString('de-DE', { month: 'long' });
        const endStr = endDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
        dateDisplay.textContent = `${startStr} - ${endStr}`;
      }
    } else if (mode === 'years') {
      if (startDay === endDay) {
        dateDisplay.textContent = startDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      } else {
        const startStr = startDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
        const endStr = endDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
        dateDisplay.textContent = `${startStr} - ${endStr}`;
      }
    }
    
    // Update the table view
    window.updateTableByDate && window.updateTableByDate();
    
    // Update projections for the (new) selected date
    if (window.axisProjection) {
      window.axisProjection.getProjections(currentDate, getStartDate(), getEndDate(), window.csvData);
    }
  }

  function isOverSliderEdge(x, y) {
    const currentStartX = dayScale(startDay);
    const currentEndX = dayScale(endDay);
    const sliderWidth = 16;
    const edgeWidth = 5;  // Edge sensitivity in pixels

    // Check vertical position
    if (y >= centerY - sliderWidth / 2 && y <= centerY + sliderWidth / 2) {
      // Check horizontal position
      if (currentStartX === currentEndX) {
        // Single day case: treat as a square slider
        if (x >= currentStartX + edgeWidth && x <= currentEndX + sliderWidth - edgeWidth/2) {
          return 'move';
        }
        // Edges for resizing
        if (x >= currentStartX - edgeWidth/2 && x < currentStartX + edgeWidth/2) {
          return 'left';
        }
        if (x <= currentEndX + sliderWidth + edgeWidth/2 && x > currentEndX + sliderWidth - edgeWidth/2) {
          return 'right';
        }
        return null;
      }

      // Range case
      if (x >= currentStartX + edgeWidth && x <= currentEndX + sliderWidth/2 - edgeWidth) {
        return 'move';
      }

      // Edges for resizing
      if (x >= currentStartX - edgeWidth/2 && x <= currentStartX + edgeWidth/2) {
        return 'left';
      }
      if (x >= currentEndX + sliderWidth/2 - edgeWidth && x <= currentEndX + sliderWidth/2 + edgeWidth) {
        return 'right';
      }
    }
    return null;
  }

  function handleDrag(e) {
    if (!isDragging || !dragMode) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newDay = Math.round(dayScale.invert(x));
    const ticks = getTickCount();
    
    console.log('Dragging:', { dragMode, newDay, startDay, endDay });

    switch (dragMode) {
      case 'left':
        // Allow the left edge to be moved up to (and including) endDay
        const newStartDay = Math.min(Math.max(1, newDay), endDay);
        if (newStartDay !== startDay) {
          startDay = newStartDay;
          if (endDay < startDay) endDay = startDay;
          updateDateDisplay();
        }
        break;
        
      case 'right':
        // Allow the right edge to be moved down to (and including) startDay
        const newEndDay = Math.max(Math.min(ticks, newDay), startDay);
        if (newEndDay !== endDay) {
          endDay = newEndDay;
          if (startDay > endDay) startDay = endDay;
          updateDateDisplay();
        }
        break;
        
      case 'move':
        const width = endDay - startDay;
        let newStart = Math.round(newDay - width / 2);

        // Limit within ticks bounds
        if (newStart < 1) newStart = 1;
        if (newStart + width > ticks) newStart = ticks - width;
        
        if (newStart !== startDay) {
          startDay = newStart;
          endDay = newStart + width;
          updateDateDisplay();
        }
        break;
    }
  }

  // Start canvas in "grab" mode
  canvas.style.cursor = "grab";

  // Event Listeners
  prevMonthButton.addEventListener('click', () => updateMonth(-1));
  nextMonthButton.addEventListener('click', () => updateMonth(1));

  // Mouse Event Handler
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

  // Expose the interaction interface
  window.dateInteraction = {
    getCurrentDate: () => currentDate,
    setCurrentDate: (date) => { currentDate = new Date(date); },
    getStartDay: () => startDay,
    setStartDay: (day) => { startDay = day; },
    getEndDay: () => endDay,
    setEndDay: (day) => { endDay = day; },
    getDayScale: () => dayScale,
    setDayScale: (scale) => { dayScale = scale; },
    getDaysInMonth,
    // new APIs for mode-aware behavior
    getTickCount,
    setMode,
    getMode,
    setYearCount,
    getYearCount,
    dateToX,
    getStartDate,
    getEndDate,
    getTimelineStart: () => timelineStart,
    getTimelineEnd: () => timelineEnd,
    getCenterY: () => centerY,
    updateDateDisplay,
    isOverSliderEdge,
    getIsDragging: () => isDragging,
    getDragMode: () => dragMode
  };

})();
