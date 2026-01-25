// tableView.js
// Extracted table / CSV related functionality from main.js
(function(){
  'use strict';

  // Detect the Date column in a CSV dataset using column names, types, or parsed values
  function findDateKeyFromCSV(csvData) {
    if (!csvData || !Array.isArray(csvData.columns)) return null;
    const columns = csvData.columns;
    const types = Array.isArray(csvData.types) ? csvData.types : [];
    const lowerIndex = columns.findIndex(c => String(c).toLowerCase() === 'date');
    if (lowerIndex >= 0) return columns[lowerIndex];

    const typeIndex = types.findIndex(t => String(t).toLowerCase() === 'date');
    if (typeIndex >= 0) return columns[typeIndex];

    const firstRow = csvData.rows && csvData.rows[0];
    if (firstRow) {
      for (let i = 0; i < columns.length; i++) {
        if (firstRow[columns[i]] instanceof Date) return columns[i];
      }
    }
    return null;
  }

  function formatDateAsKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Available datasets with source path and CSV parsing options
  const DATASETS = [
    { label: 'Climate (extended)', url: 'res/climate_small_extended.csv', delimiter: ';' },
    { label: 'Major Cryptocurrency Daily Price', url: 'res/BNB_USD_daily_data.csv', delimiter: ',' }
  ];

  // Populate the dataset dropdown and load the selected dataset on change
  function populateDatasetSelect() {
    const select = document.getElementById('datasetSelect');
    if (!select) return;
    select.innerHTML = '';
    DATASETS.forEach((ds, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = ds.label;
      select.appendChild(opt);
    });
    select.value = '0';
    select.addEventListener('change', () => {
      const idx = Number(select.value);
      const ds = DATASETS[idx];
      if (!ds) return;
      loadDataset(ds);
    });
  }

  // Apply parsed CSV data, auto-configure axes, and validate presence of a Date column
  function applyParsedData(parsed) {
    window.csvData = parsed;

    if (window.controls && window.controls.autoConfigureAxes) {
      window.controls.autoConfigureAxes(parsed);
    }

    const dateKey = findDateKeyFromCSV(parsed);
    if (dateKey) window.__dateColumnKey = dateKey;
    if (!dateKey) {
      delete window.__dateColumnKey;
      const container = document.getElementById('tableContainer');
      if (container) {
        container.innerHTML = '<p style="color:#e6e6e6; padding:16px;">This dataset has no Date column. Please select a dataset with dates.</p>';
      }
      return;
    }

    // Extract first date from CSV and set currentDate via dateInteraction module
    if (parsed.rows && parsed.rows.length > 0) {
      const key = window.__dateColumnKey || 'Date';
      const firstRowDate = parsed.rows[0][key];
      if (firstRowDate instanceof Date) {
        // Use dateInteraction API to update date state
        window.dateInteraction.setCurrentDate(firstRowDate);
          window.dateInteraction.setStartDay(firstRowDate.getDate());
          window.dateInteraction.setEndDay(firstRowDate.getDate());

          // Update scale domain for the current mode
          const ticks = window.dateInteraction.getTickCount ? window.dateInteraction.getTickCount() : window.dateInteraction.getDaysInMonth();
          const dayScale = d3.scaleLinear()
            .domain([1, ticks])
            .range([window.dateInteraction.getTimelineStart(), window.dateInteraction.getTimelineEnd()]);
          window.dateInteraction.setDayScale(dayScale);
          window.dateInteraction.updateDateDisplay();
      }
    }

    // Compute ranges for axes and update projections
    if (window.axisProjection) {
      window.axisProjection.computeRanges(window.csvData, window.axisOverlay.getCurrentAxes());
      if (window.axisProjection.getProjections) {
        window.axisProjection.getProjections(window.dateInteraction.getCurrentDate(), window.dateInteraction.getStartDate(), window.dateInteraction.getEndDate(), window.csvData);
      }
    }
    if (window.axisOverlay && window.axisOverlay.updateAxisHTML) {
      window.axisOverlay.updateAxisHTML();
    }
    updateTableByDate();
  }

  // Fetch, parse, and apply the selected dataset with error handling
  async function loadDataset(ds) {
    try {
      const parsed = await window.readCSV.loadCSVFromUrl(ds.url, ds.delimiter);
      applyParsedData(parsed);
    } catch (error) {
      console.error('Error loading CSV:', error);
      const container = document.getElementById('tableContainer');
      if (container) container.innerHTML =
        `<p style="color:#e6e6e6; padding:16px;">Error loading CSV: ${error.message}</p>`;
    }
  }

  // Initialize dataset selection UI and load the initial dataset
  async function initTableView() {
    try {
      populateDatasetSelect();
      const select = document.getElementById('datasetSelect');
      const initialIndex = select ? Number(select.value) || 0 : 0;
      const ds = DATASETS[initialIndex] || DATASETS[0];
      await loadDataset(ds);
    } catch (error) {
      console.error('Error loading CSV:', error);
      const container = document.getElementById('tableContainer');
      if (container) container.innerHTML =
        `<p style="color:#e6e6e6; padding:16px;">Error loading CSV: ${error.message}</p>`;
    }
  }

  function updateTableByDate() {
    if (!window.csvData) return;

    // Get the current date range and resolve the Date column used for filtering
    const startDate = window.dateInteraction.getStartDate();
    const endDate = window.dateInteraction.getEndDate();
    const dateKey = window.__dateColumnKey || 'Date';

    // Apply date range filtering to the dataset
    window.filteredRows = window.csvData.rows.filter(row => {
      if (!row[dateKey] || !(row[dateKey] instanceof Date)) return false;
      const d = row[dateKey];
      return d.getTime() >= startDate.getTime() && d.getTime() <= endDate.getTime();
    });

    renderTable();
  }

  function renderTable() {
    if (!window.csvData) return;

    const container = document.getElementById('tableContainer');

    if (!window.filteredRows || window.filteredRows.length === 0) {
      if (container) container.innerHTML = '<p style="color:#9aa0a6; padding:16px; text-align:center;">Keine Daten für diesen Zeitraum</p>';
      return;
    }

    // Get date state from dateInteraction module
    const startDay = window.dateInteraction.getStartDay();
    const endDay = window.dateInteraction.getEndDay();
    const rangeStart = Math.min(startDay, endDay);
    const rangeEnd = Math.max(startDay, endDay);
    let html = '';
    html += '<table><thead><tr>';
    window.csvData.columns.forEach(col => {
      html += `<th>${escapeHtml(col)}</th>`;
    });
    html += '</tr></thead><tbody>';

    window.filteredRows.forEach(row => {
      html += '<tr>';
      window.csvData.columns.forEach(col => {
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
    if (container) container.innerHTML = html;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  window.tableView = {
    initTableView,
    updateTableByDate,
    renderTable,
    escapeHtml
  };

})();
