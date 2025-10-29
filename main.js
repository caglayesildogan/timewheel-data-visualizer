// SVG Konfiguration
const svg = d3.select("#timewheel");
const width = 600;
const height = 600;
const centerX = width / 2;
const centerY = height / 2;

// Pfeilkonfiguration
const arrowStart = centerX - 100;
const arrowEnd = centerX + 100;
const arrowLength = arrowEnd - arrowStart;

// Datumskonfiguration
let currentDate = new Date();
let selectedDay = 1;

// Datumsnavigation
const prevMonthButton = document.getElementById('prevMonth');
const nextMonthButton = document.getElementById('nextMonth');
const dateDisplay = document.getElementById('dateDisplay');

function updateMonth(delta) {
    // Aktualisiere das Datum
    currentDate.setMonth(currentDate.getMonth() + delta);
    selectedDay = 1; // Setze immer auf den ersten Tag des Monats
    updateDisplay();
}

function getDaysInMonth() {
    return new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0
    ).getDate();
}

function updateDisplay() {
    // Aktualisiere Datumsanzeige
    const formattedDate = currentDate.toLocaleDateString('de-DE', { 
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    dateDisplay.textContent = formattedDate;
    
    // Lösche alte Markierungen
    dayMarks.selectAll("*").remove();
    
    // Zeichne neue Markierungen
    const daysInMonth = getDaysInMonth();
    dayScale.domain([1, daysInMonth]);
    
    d3.range(1, daysInMonth + 1).forEach(day => {
        const x = dayScale(day);
        dayMarks.append("line")
            .attr("x1", x)
            .attr("y1", centerY - 5)
            .attr("x2", x)
            .attr("y2", centerY + 5)
            .attr("stroke", "#555")
            .attr("stroke-width", 1);
        
        if (day % 5 === 0) {
            dayMarks.append("text")
                .attr("x", x)
                .attr("y", centerY + 20)
                .attr("text-anchor", "middle")
                .attr("fill", "#666")
                .attr("font-size", "12px")
                .text(day);
        }
    });
    
    // Aktualisiere Slider-Position
    const newX = dayScale(selectedDay);
    slider.selectAll("rect, circle")
        .attr("transform", `translate(${newX - arrowStart},0)`);
    updateDateDisplay(newX);
}

// Event Listener für Monatsnavigation
prevMonthButton.addEventListener('click', () => updateMonth(-1));
nextMonthButton.addEventListener('click', () => updateMonth(1));

const daysInMonth = getDaysInMonth();

// Skala für die Tage
const dayScale = d3.scaleLinear()
    .domain([1, daysInMonth])
    .range([arrowStart, arrowEnd]);

// Funktion zum Einschränken eines Wertes auf einen Bereich
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// Funktion zum Runden auf den nächsten Tag
const snapToDay = (x) => {
    const day = Math.round(dayScale.invert(x));
    return dayScale(clamp(day, 1, daysInMonth));
};

// Entferne die separate Datumsanzeige im SVG, da wir jetzt nur noch die Navigation oben nutzen

// Einfacher horizontaler Pfeil
svg.append("line")
    .attr("x1", arrowStart)
    .attr("y1", centerY)
    .attr("x2", arrowEnd)
    .attr("y2", centerY)
    .attr("stroke", "white")
    .attr("stroke-width", 3);

// Vertikaler Strich am Anfang des Pfeils
svg.append("line")
    .attr("x1", arrowStart)
    .attr("y1", centerY - 15)
    .attr("x2", arrowStart)
    .attr("y2", centerY + 15)
    .attr("stroke", "white")
    .attr("stroke-width", 3);

// Tagesmarkierungen
const dayMarks = svg.append("g");
d3.range(1, daysInMonth + 1).forEach(day => {
    const x = dayScale(day);
    dayMarks.append("line")
        .attr("x1", x)
        .attr("y1", centerY - 5)
        .attr("x2", x)
        .attr("y2", centerY + 5)
        .attr("stroke", "#555")
        .attr("stroke-width", 1);
    
    // Markiere jeden 5. Tag mit einer Zahl
    if (day % 5 === 0) {
        dayMarks.append("text")
            .attr("x", x)
            .attr("y", centerY + 20)
            .attr("text-anchor", "middle")
            .attr("fill", "#666")
            .attr("font-size", "12px")
            .text(day);
    }
});

// Pfeilspitze
svg.append("polygon")
    .attr("points", `${centerX + 100},${centerY} ${centerX + 85},${centerY - 10} ${centerX + 85},${centerY + 10}`)
    .attr("fill", "white");

// Schieberegler
const slider = svg.append("g")
    .attr("class", "slider")
    .style("cursor", "grab");

// Slider Hintergrund (größerer Bereich für bessere Bedienbarkeit)
slider.append("rect")
    .attr("x", arrowStart - 10)  // Starte am linken Ende des Pfeils
    .attr("y", centerY - 15)
    .attr("width", 20)
    .attr("height", 30)
    .attr("fill", "transparent"); // Unsichtbar, aber greifbar

// Slider Knopf
const sliderKnob = slider.append("circle")
    .attr("cx", arrowStart)      // Starte am linken Ende des Pfeils
    .attr("cy", centerY)
    .attr("r", 8)
    .attr("fill", "#fff")
    .attr("stroke", "#666")
    .attr("stroke-width", 2);

// Funktion zum Aktualisieren der Datumsanzeige
function updateDateDisplay(x) {
    const day = Math.round(dayScale.invert(x));
    selectedDay = day;
    currentDate.setDate(day);
    const formattedDate = currentDate.toLocaleDateString('de-DE', { 
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    dateDisplay.textContent = formattedDate;
}

// Drag Verhalten
const drag = d3.drag()
    .on("start", function() {
        d3.select(this).style("cursor", "grabbing");
    })
    .on("drag", function(event) {
        const snappedX = snapToDay(event.x);
        slider.selectAll("rect, circle")
            .attr("transform", `translate(${snappedX - arrowStart},0)`);
        updateDateDisplay(snappedX);
    })
    .on("end", function() {
        d3.select(this).style("cursor", "grab");
    });

// Drag dem Slider zuweisen
slider.call(drag);

// Initial date display
updateDateDisplay(arrowStart);