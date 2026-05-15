# TimeWheel – Interactive Time-Series Visualization

TimeWheel is a browser-based visualization tool for exploring multivariate time-series datasets in an interactive circular coordinate-wheel layout.

The project combines WebGL rendering, dynamic axis configuration, CSV-based data loading, and synchronized table visualization to help users analyze temporal patterns across multiple variables.

## Concept
The application displays a selected time range on a central timeline. Numeric attributes are arranged as static axes around a circular layout. For each selected date or date range, values are normalized according to their axis-specific minimum and maximum values and projected onto the corresponding axis. Colored connection lines visually link these projected values to the timeline. This allows users to compare multiple variables at once and observe how they change over time.

## Features

- Interactive circular coordinate-wheel visualization
- WebGL-based rendering for smooth performance
- Dynamic axis management (add, remove, reorder)
- CSV dataset loading and automatic type detection
- Automatic detection of date and numeric columns
- Interactive date-range filtering
- Synchronized table view
- Support for multiple datasets
- Modular JavaScript architecture

## Technologies

- JavaScript (ES6)
- WebGL
- D3.js v7
- HTML5
- CSS3
- Canvas API

## How It Works

1. A CSV dataset is loaded.
2. Date and numeric columns are detected automatically.
3. Numeric values are normalized and mapped onto circular axes.
4. Users select a date or date range on the timeline.
5. WebGL renders projection lines and data markers.
6. The table updates based on the selected time range.

### VS Code Live Server

1. Install the Live Server extension
2. Open the project folder
3. Open `index.html` with Live Server






