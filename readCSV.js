
// readCSV.js
// Simple CSV loader + parser
// Exposes window.readCSV with:
// - parseCSV(text, delimiter?) => { columns, types, rows, rawRows }#
// - loadCSVFromUrl(url, delimiter?) => Promise<parsedResult>
//
// The parser handles files that have a header row and optionally a second row
// that lists types (e.g. "Real", "Integer", "Date", "Time", "Category").
// If the second row contains known type tokens, it's used to type-convert values.

(function () {
	'use strict';

	const KNOWN_TYPES = new Set(['Real', 'Integer', 'Date', 'Time', 'Category', 'String']);

	function detectDelimiter(text) {
		// prefer semicolon if present (many files in this project use ';')
		if (text.indexOf(';') !== -1 && text.indexOf(',') !== -1) {
			// choose the one that appears more often
			return (text.split(';').length >= text.split(',').length) ? ';' : ',';
		}
		if (text.indexOf(';') !== -1) return ';';
		if (text.indexOf(',') !== -1) return ',';
		return '\n'; // fallback 
	}

	function stripBOM(s) {
		if (s && s.charCodeAt(0) === 0xfeff) return s.slice(1);
		return s;
	}

	function tryParseTypeToken(token) {
		token = token ? token.trim() : '';
		if (KNOWN_TYPES.has(token)) return token;
		return null;
	}

	function parseValueByType(value, type) {
		if (value === null || value === undefined) return null;
		const v = value.trim();
		if (v === '') return null;

		switch ((type || '').toLowerCase()) {
			case 'real':
				const f = parseFloat(v.replace(/,/g, '.'));
				return Number.isFinite(f) ? f : null;
			case 'integer':
				const i = parseInt(v, 10);
				return Number.isFinite(i) ? i : null;
			case 'date':
				// Accept ISO-ish strings like 1893-01-01 or full datetimes
				const d = new Date(v);
				return isNaN(d.getTime()) ? null : d;
			case 'time':
				// Try parse as Date/time. If it's only a time portion, return the string.
				const dt = new Date(v);
				if (!isNaN(dt.getTime())) return dt;
				return v;
			case 'category':
			case 'string':
				return v;
			default:
				// If no explicit type: try numeric, else date, else string
				const n = parseFloat(v.replace(/,/g, '.'));
				if (Number.isFinite(n)) return n;
				const dd = new Date(v);
				if (!isNaN(dd.getTime())) return dd;
				return v;
		}
	}

	function parseCSV(text, delimiter) {
		text = stripBOM(text || '');
		if (!delimiter) delimiter = detectDelimiter(text);

		// split lines, support CRLF
		const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
		if (rawLines.length === 0) return { columns: [], types: [], rows: [], rawRows: [] };

		// split first two lines to detect header and optional types
		const first = rawLines[0].split(delimiter).map(s => s.trim());
		let second = null;
		if (rawLines.length > 1) second = rawLines[1].split(delimiter).map(s => s.trim());

		let hasTypeRow = false;
		let types = new Array(first.length).fill(null);

		if (second) {
			// check whether most of the tokens in second match known type tokens
			const matches = second.reduce((acc, t) => acc + (tryParseTypeToken(t) ? 1 : 0), 0);
			if (matches >= Math.floor(first.length / 2)) {
				hasTypeRow = true;
				types = second.map(t => tryParseTypeToken(t) || null);
			}
		}

		const columns = first.slice();
		const dataStartIndex = hasTypeRow ? 2 : 1;

		const rawRows = [];
		const rows = [];

		for (let i = dataStartIndex; i < rawLines.length; i++) {
			const parts = rawLines[i].split(delimiter).map(s => s.trim());
			// if row length is different, try to pad with empty strings
			while (parts.length < columns.length) parts.push('');
			rawRows.push(parts);

			const obj = {};
			for (let c = 0; c < columns.length; c++) {
				const colName = columns[c] || `col${c}`;
				const type = types[c];
				obj[colName] = parseValueByType(parts[c] || '', type);
			}
			rows.push(obj);
		}

		return { columns, types, rows, rawRows };
	}

	async function loadCSVFromUrl(url, delimiter) {
		const res = await fetch(url, { cache: 'no-store' });
		if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
		const text = await res.text();
		return parseCSV(text, delimiter);
	}

	// expose API in browser global
	window.readCSV = {
		parseCSV,
		loadCSVFromUrl,
	};

})();
