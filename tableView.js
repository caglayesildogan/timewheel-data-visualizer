// tableView.js
// Extracted table / CSV related functionality from main.js
(function(){
  'use strict';

  // csvData and filteredRows are shared globals (declared in main.js),
  // but we'll assign into them when loading.

  function formatDateAsKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async function initTableView() {
    try {
      const parsed = await window.readCSV.loadCSVFromUrl('res/climate_small.csv', ';');
      window.csvData = parsed;

      // Extract first date from CSV and set currentDate via dateInteraction module
      if (parsed.rows && parsed.rows.length > 0) {
        const firstRowDate = parsed.rows[0].Date;
        if (firstRowDate instanceof Date) {
          // Use dateInteraction API to update date state
          window.dateInteraction.setCurrentDate(firstRowDate);
          window.dateInteraction.setStartDay(firstRowDate.getDate());
          window.dateInteraction.setEndDay(firstRowDate.getDate());

          // Update dayScale for the new month
          const daysInMonth = window.dateInteraction.getDaysInMonth();
          const dayScale = d3.scaleLinear()
            .domain([1, daysInMonth])
            .range([window.dateInteraction.getTimelineStart(), window.dateInteraction.getTimelineEnd()]);
          window.dateInteraction.setDayScale(dayScale);
          window.dateInteraction.updateDateDisplay();
        }
      }

      // compute ranges for axes and update projections
      if (window.axisProjection) {
        window.axisProjection.computeRanges(window.csvData, window.axisOverlay.getCurrentAxes());
        window.axisProjection.getProjections(window.dateInteraction.getCurrentDate(), window.dateInteraction.getStartDay(), window.dateInteraction.getEndDay(), window.csvData);
      }
      updateTableByDate();
    } catch (error) {
      console.error('Error loading CSV:', error);
      const container = document.getElementById('tableContainer');
      if (container) container.innerHTML =
        `<p style="color:#e6e6e6; padding:16px;">Error loading CSV: ${error.message}</p>`;
    }
  }

  function updateTableByDate() {
    if (!window.csvData) return;

    // Get date state from dateInteraction module
    const startDay = window.dateInteraction.getStartDay();
    const endDay = window.dateInteraction.getEndDay();
    const currentDate = window.dateInteraction.getCurrentDate();

    // Support date ranges: if startDay !== endDay, filter for all days in range
    const rangeStart = Math.min(startDay, endDay);
    const rangeEnd = Math.max(startDay, endDay);

    window.filteredRows = window.csvData.rows.filter(row => {
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
