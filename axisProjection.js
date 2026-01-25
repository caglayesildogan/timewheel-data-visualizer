// axisProjection.js
// Compute numeric ranges per axis and provide projection geometry
(function () {
  'use strict';

  // internal ranges: { key: { min, max } }
  let ranges = {};

  function getDateKey() {
    return window.__dateColumnKey || 'Date';
  }

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
  function findOne(csvData, date) {
    if (!csvData || !Array.isArray(csvData.rows)) return null;
    const dateKey = getDateKey();
    for (let i = 0; i < csvData.rows.length; i++) {
      const r = csvData.rows[i];
      const d = r[dateKey];
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
    const dateKey = getDateKey();

    for (let i = 0; i < csvData.rows.length; i++) {
      const r = csvData.rows[i];
      const d = r[dateKey];

      if (!(d instanceof Date)) continue;

      const t = d.getTime();
      if (t >= start && t <= end) {
        out.push(r);
      }
    }
    return out;
  }

  // Clamp a value to the range [0, 1]
  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  // Compute the intersection point of two infinite lines
  function intersectLines(n1, r1, n2, r2) {
    const det = n1.x * n2.y - n1.y * n2.x;
    if (Math.abs(det) < 1e-6) return null;
    const x = (r1 * n2.y - n1.y * r2) / det;
    const y = (n1.x * r2 - r1 * n2.x) / det;
    return { x, y };
  }

  // Compute all axis geometries including rotation and magnification effects
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

      const nx = Math.cos(radialAngle);
      const ny = Math.sin(radialAngle);
      const tx = -Math.sin(radialAngle);
      const ty = Math.cos(radialAngle);

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

    // Compute final axis length and center offset based on neighboring axis intersections
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


  // produce projection line geometry for the currently selected date
  function getProjections(currentDate, startDate, endDate, csvData, axes, containerWidth = 600, containerHeight = 600) {
    const out = [];
    if (!csvData || !axes) return out;

    let rows = [];
    let row = null;
    // If startDate/endDate are provided as Dates, use them. Otherwise treat as single day using currentDate
    if (startDate instanceof Date && endDate instanceof Date && startDate.getTime() !== endDate.getTime()) {
      rows = findAll(csvData, startDate, endDate);
      if (!rows || rows.length === 0) return out;
    } else if (startDate instanceof Date && endDate instanceof Date) {
      // single selected date
      const sel = new Date(startDate);
      row = findOne(csvData, sel);
      if (!row) return out;
    } else {
      // Fallback: single currentDate day
      const selDate = new Date(currentDate);
      row = findOne(csvData, selDate);
      if (!row) return out;
    }

    // Determine active axes (preserve order)
    const activeAxes = axes.filter(ax => ax.type === 'static' && ax.enabled);
    const total = activeAxes.length;
    if (total === 0) return out;

    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;
    const baseRadius = containerWidth * 0.38;
    let mag = 0;  // Use dynamic axis geometry to support rotation and magnification instead of a fixed axis length
    try {
      const st = (window.getControlsState && window.getControlsState()) || window.__controlsState;
      if (st && typeof st.magnification === 'number') mag = st.magnification;
    } catch(e){}
    const rotationDeg = window.axisOverlay ? window.axisOverlay.getRotationDeg() : 0;
    const geoms = computeAxisGeometries(total, baseRadius, rotationDeg, mag);

    activeAxes.forEach((ax, index) => {
      const key = ax.key;
      if (!(key in ranges)) return;
    
      const { min, max } = ranges[key];
    
        let rowList = [];
        if (rows && rows.length > 0) {
          const mode = (window.dateInteraction && window.dateInteraction.getMode) ? window.dateInteraction.getMode() : 'days';
          if (mode === 'years') {
            // In years-mode: include every day's value for the selected months (no aggregation)
            rows.forEach(r => {
              const d = r[getDateKey()];
              if (!d || !(d instanceof Date)) return;
              const v = safeNumber(r[key]);
              if (v === null) return;
              rowList.push({ date: d, value: v });
            });
            // sort by date
            rowList.sort((a,b) => a.date - b.date);
          } else {
            // default: keep daily rows
            rows.forEach(r => {
              const v = safeNumber(r[key]);
              if (v === null) return;
              rowList.push({ date: r[getDateKey()], value: v });
            });
          }
        } else if (row) {
          rowList = [{ date: row[getDateKey()], value: safeNumber(row[key]) }];
        }

        if (rowList.length === 0) return;

      // Use precomputed axis geometry so center position and length correctly reflect rotation and magnification
      const geom = geoms[index];
      const axisLength = geom.axisLength;
      const cx = centerX + geom.center.x + geom.tx * geom.midOffset;
      const cy = centerY + geom.center.y + geom.ty * geom.midOffset;
    
      const color = hexToRgba(ax.color || '#ffffff', 1.0);
    
      rowList.forEach((item, idx) => {
        const value = item.value;
        const rDate = item.date;
        if (!(rDate instanceof Date)) return;

        const t = (min === max) ? 0.5 : (value - min) / (max - min);
        const clamped = Math.min(Math.max(t, 0), 1);

        const localX = -axisLength / 2 + clamped * axisLength;
        const localY = -6;

        const px = cx + localX * Math.cos(geom.tangentAngle) - localY * Math.sin(geom.tangentAngle);
        const py = cy + localX * Math.sin(geom.tangentAngle) + localY * Math.cos(geom.tangentAngle);

        out.push({
          px, py, color, key,
          date: rDate,
          itemIndex: idx,
          totalItems: rowList.length
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
