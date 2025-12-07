// axisProjection.js
// Compute numeric ranges per axis and provide projection geometry
(function () {
  'use strict';

  // internal ranges: { key: { min, max } }
  let ranges = {};

  function safeNumber(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    if (v instanceof Date) return null;
    const n = parseFloat(String(v).replace(/,/g, '.'));
    return Number.isFinite(n) ? n : null;
  }

  // compute min/max for every axis key present in axes array
  function computeRanges(csvData, axes) {
    ranges = {};
    if (!csvData || !Array.isArray(csvData.rows) || !axes) return ranges;

    axes.forEach(ax => {
      const key = ax.key;
      let min = Infinity, max = -Infinity;
      let found = false;
      csvData.rows.forEach(r => {
        const v = safeNumber(r[key]);
        if (v === null) return;
        found = true;
        if (v < min) min = v;
        if (v > max) max = v;
      });
      if (found) ranges[key] = { min, max };
    });
    console.log('axisProjection: computed ranges', ranges);
    return ranges;
  }

  // helper to find the CSV row that matches a JS Date (year, month, day)
  /// FIXME: needs to be advanced to handle date ranges
  function findOne(csvData, date) {
    if (!csvData || !Array.isArray(csvData.rows)) return null;
    for (let i = 0; i < csvData.rows.length; i++) {
      const r = csvData.rows[i];
      const d = r.Date;
      if (!(d instanceof Date)) continue;
      if (d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth() && d.getDate() === date.getDate()) return r;
    }
    return null;
  }

  function findAll(csvData, startDate, endDate) {
    const out = [];
    if (!csvData || !Array.isArray(csvData.rows)) return out;

    const start = startDate.getTime();
    const end = endDate.getTime();

    for (let i = 0; i < csvData.rows.length; i++) {
      const r = csvData.rows[i];
      const d = r.Date;

      if (!(d instanceof Date)) continue;

      const t = d.getTime();
      if (t >= start && t <= end) {
        out.push(r);
      }
    }
    return out;
  }


  // produce projection line geometry for the currently selected date
  // axes: array of axis descriptors (only static+enabled will be used)
  // containerWidth/Height: pixel size of the wheel container
  // returns array of { x1,y1,x2,y2, color }
  function getProjections(currentDate, startDay, endDay, csvData, axes, containerWidth = 600, containerHeight = 600) {
    const out = [];
    if (!csvData || !axes) return out;

    let rows = [];
    let row = null;

    if (startDay !== endDay) {
      // Zeitraum
      const startDate = new Date(currentDate);
      const endDate = new Date(currentDate);
      startDate.setDate(startDay);
      endDate.setDate(endDay);

      rows = findAll(csvData, startDate, endDate);
      if (!rows || rows.length === 0) return out;

    } else {
      // Einzelnes Datum
      const selDate = new Date(currentDate);
      selDate.setDate(startDay);
      row = findOne(csvData, selDate);
      if (!row) return out;
    }

    // Determine active axes (preserve order)
    const activeAxes = axes.filter(ax => ax.type === 'static' && ax.enabled);
    const total = activeAxes.length;
    if (total === 0) return out;

    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;
    const radius = containerWidth * 0.38;
    const axisLength = containerWidth * 0.35;

    activeAxes.forEach((ax, index) => {
      const key = ax.key;
      if (!(key in ranges)) return;
    
      const { min, max } = ranges[key];
    
      // welcher Fall?
      const valueList = (startDay !== endDay)
          ? rows.map(r => safeNumber(r[key])).filter(v => v !== null)
          : [ safeNumber(row[key]) ];
    
      if (valueList.length === 0) return;
    
      // Geometrie der Achse
      const rotationDeg = window.axisOverlay ? window.axisOverlay.getRotationDeg() : 0;
      const rotationRad = rotationDeg * Math.PI / 180;
      const radialAngle = -Math.PI / 2 + rotationRad + (index / total) * (2 * Math.PI);
      const tangentAngle = radialAngle + Math.PI / 2;
    
      const cx = centerX + Math.cos(radialAngle) * radius;
      const cy = centerY + Math.sin(radialAngle) * radius;
    
      const color = hexToRgba(ax.color || '#ffffff', 1.0);
    
      // Für jeden Wert eine Projektion erzeugen
      valueList.forEach((value, idx) => {
        // In range-case benutzen wir rows[idx], bei Einzel-Datum benutzen wir die variable `row`
        const r = (startDay !== endDay) ? rows[idx] : row;
        if (!r || !(r.Date instanceof Date)) return;

        const t = (min === max) ? 0.5 : (value - min) / (max - min);
        const clamped = Math.min(Math.max(t, 0), 1);

        const localX = -axisLength / 2 + clamped * axisLength;
        const localY = -6;

        const px = cx + localX * Math.cos(tangentAngle) - localY * Math.sin(tangentAngle);
        const py = cy + localX * Math.sin(tangentAngle) + localY * Math.cos(tangentAngle);

        out.push({
          px, py, color, key,
          date: r.Date   // ← Datum mitgeben
        });
      });
    });

    return out;
  }

  function hexToRgba(hex, alpha = 1.0) {
    if (!hex) return [1,1,1,alpha];
    const h = hex.replace('#','');
    const bigint = parseInt(h.length===3 ? h.split('').map(c=>c+c).join('') : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return [r/255, g/255, b/255, alpha];
  }

  window.axisProjection = {
    computeRanges,
    getProjections,
    _getRanges: () => ranges
  };

})();
