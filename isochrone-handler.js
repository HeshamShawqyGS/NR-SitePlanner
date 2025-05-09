
// Improved Isochrone handler for Glasgow Mapping Application
// This file handles the isochrone analysis for public transport accessibility

// Mapbox token (using the same token as in data-handler.js)
const mapboxToken = 'pk.eyJ1IjoiaGVzaGFtc2hhd3F5IiwiYSI6ImNrdnBvY2UwcTFkNDkzM3FmbTFhenM0M3MifQ.ZqIuL9khfbCyOF3DU_IH5w';

// Time in minutes for the isochrone
const minutes = 8;

// Track if isochrones are currently displayed
let isochronesVisible = false;

// Generate isochrones for a selected land
async function generateIsochrones(feature) {
    if (!feature || !feature.properties.center) {
        alert('No valid plot selected for accessibility analysis');
        return;
    }
    
    const center = feature.properties.center;
    const map = dataHandler.map;
    
    // Clear any existing isochrones
    clearIsochrones();
    
    try {
        // Construct the Mapbox Isochrone API URL for public transport
        // Note: Mapbox doesn't have a direct "public transport" profile, but we can use "driving-traffic"
        // as a reasonable approximation for public transport in urban areas
        const url = `https://api.mapbox.com/isochrone/v1/mapbox/driving-traffic/${center[0]},${center[1]}?contours_minutes=${minutes}&polygons=true&access_token=${mapboxToken}&generalize=0`;
        
        // Fetch isochrone data
        const response = await fetch(url);
        const data = await response.json();
        
        // Add source if it doesn't exist
        if (!map.getSource('iso')) {
            map.addSource('iso', {
                type: 'geojson',
                data: data
            });
        } else {
            map.getSource('iso').setData(data);
        }
        
        // Add layer if it doesn't exist
        if (!map.getLayer('isoLayer')) {
            map.addLayer({
                'id': 'isoLayer',
                'type': 'fill',
                'source': 'iso',
                'layout': {},
                'paint': {
                    'fill-color': '#5a3fc0',
                    'fill-opacity': 0.3,
                    'fill-outline-color': '#5a3fc0'
                }
            }, 'empty-lands-outline'); // Add below the land outlines
        }
        
        // Update toggle button text
        const toggleButton = document.getElementById('isochrone-toggle');
        if (toggleButton) {
            toggleButton.textContent = `Hide ${minutes}-min Access`;
        }
        
        isochronesVisible = true;
        
        // Calculate and display the accessibility score
        calculateAccessibilityScore(data, feature);
        
        // Dispatch event for zone intersection handler
        document.dispatchEvent(new CustomEvent('isochroneGenerated', { 
            detail: { 
                isochroneData: data, 
                feature: feature 
            }
        }));
        
    } catch (error) {
        console.log('Error generating isochrones:', error);
        alert('Could not generate accessibility analysis. Please try again.');
    }
}

// Update the clearIsochrones function in isochrone-handler.js to also clear the intersection results
function clearIsochrones() {
    const map = dataHandler.map;
    if (!map) return;
    
    // Remove layer and source if they exist
    if (map.getLayer('isoLayer')) {
        map.removeLayer('isoLayer');
    }
    
    if (map.getSource('iso')) {
        map.removeSource('iso');
    }
    
    // Clean up intersecting zones if that handler is available
    if (window.isochroneIntersectionHandler && typeof isochroneIntersectionHandler.clearResults === 'function') {
        isochroneIntersectionHandler.clearResults();
    }
    
    // Update toggle button text
    const toggleButton = document.getElementById('isochrone-toggle');
    if (toggleButton) {
        toggleButton.textContent = `Show ${minutes}-min Access`;
    }
    
    // Remove score display
    const scoreContainer = document.getElementById('accessibility-score');
    if (scoreContainer) {
        scoreContainer.innerHTML = '';
    }
    
    isochronesVisible = false;
}

// Calculate a simple accessibility score based on isochrone area
function calculateAccessibilityScore(isochroneData, feature) {
    if (!isochroneData.features || isochroneData.features.length === 0) return;
    
    // Get the area of the isochrone polygon
    let area = 0;
    
    // Loop through all features (there might be multiple polygons)
    for (const isoFeature of isochroneData.features) {
        // Use a more accurate area calculation
        area += calculateGeoJSONArea(isoFeature);
    }
    
    // Base accessibility score from isochrone area (0-100)
    const areaScore = Math.min(100, Math.max(1, Math.sqrt(area) / 100));
    
    // Get house price and travel time data if available
    let housePrice = 0;
    let travelTime = 0;
    
    // Check if the feature has these properties (from zone intersection analysis)
    if (feature.properties) {
        // Use avgHousePrice property if available from isochrone intersection handler
        if ('avgHousePrice' in feature.properties && !isNaN(feature.properties.avgHousePrice)) {
            housePrice = feature.properties.avgHousePrice;
        } 
        // Or try housePrice property if available from zone finder
        else if ('housePrice' in feature.properties && !isNaN(feature.properties.housePrice)) {
            housePrice = feature.properties.housePrice;
        }
        
        // Use avgTravelTime property if available from isochrone intersection handler
        if ('avgTravelTime' in feature.properties && !isNaN(feature.properties.avgTravelTime)) {
            travelTime = feature.properties.avgTravelTime;
        } 
        // Or try travelTime property if available from zone finder
        else if ('travelTime' in feature.properties && !isNaN(feature.properties.travelTime)) {
            travelTime = feature.properties.travelTime;
        }
    }
    
    // Calculate price score (0-40 points)
    // Use average house price data from Glasgow (approximately £180,000 as average)
    // Higher price areas get higher scores (typically indicating better amenities/desirability)
    const avgGlasgowPrice = 180000;
    const maxPriceScore = 40;
    
    // Score increases with price but tapers off at high values
    let priceScore = 0;
    if (housePrice > 0) {
        // Logarithmic scoring to prevent extremely expensive areas from dominating
        priceScore = Math.min(maxPriceScore, 
                               maxPriceScore * Math.log(housePrice / avgGlasgowPrice + 0.5) / Math.log(3));
    }
    
    // Calculate travel time score (0-40 points)
    // Typical travel times in Glasgow range from 5-20 minutes
    // Lower travel times get higher scores
    const maxTimeScore = 40;
    const avgTravelTime = 15; // minutes
    
    // Score decreases as travel time increases
    let timeScore = 0;
    if (travelTime > 0) {
        // Inverse relationship - lower times = higher scores
        timeScore = Math.max(0, maxTimeScore * (1 - (travelTime / (avgTravelTime * 2))));
    }
    
    // Calculate combined score (Max 100 points)
    // - Area score: 0-20 points (shrink from original 0-100)
    // - Price score: 0-40 points
    // - Time score: 0-40 points
    const areaWeight = 0.2; // 20% weight for area
    const priceWeight = 0.4; // 40% weight for house price
    const timeWeight = 0.4;  // 40% weight for travel time
    
    const combinedScore = Math.round(
        areaScore * areaWeight +
        priceScore * priceWeight +
        timeScore * timeWeight
    );
    
    // Store individual component scores for display
    const scoreComponents = {
        area: Math.round(areaScore * areaWeight),
        price: Math.round(priceScore),
        time: Math.round(timeScore),
        total: combinedScore
    };
    
    // Display the score with components
    displayAccessibilityScore(combinedScore, feature, scoreComponents, {
        housePrice: housePrice,
        travelTime: travelTime,
        area: area
    });
}


// Calculate area of a GeoJSON feature in square meters
function calculateGeoJSONArea(feature) {
    if (!feature || !feature.geometry || !feature.geometry.coordinates) return 0;
    
    const coords = feature.geometry.coordinates;
    let area = 0;
    
    // Handle different geometry types
    if (feature.geometry.type === 'Polygon') {
        area = calculatePolygonArea(coords);
    } else if (feature.geometry.type === 'MultiPolygon') {
        for (const polygon of coords) {
            area += calculatePolygonArea(polygon);
        }
    }
    
    return area;
}

// Calculate area of a polygon in square meters
function calculatePolygonArea(polygonCoords) {
    if (!polygonCoords || polygonCoords.length === 0) return 0;
    
    // Get the outer ring of the polygon
    const ring = polygonCoords[0];
    if (!ring || ring.length < 4) return 0;
    
    // Calculate area using the Shoelace formula (Gauss's area formula)
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        const p1 = ring[i];
        const p2 = ring[i + 1];
        area += (p1[0] * p2[1]) - (p2[0] * p1[1]);
    }
    
    // Convert to square meters using an approximation
    // This is a rough approximation that works reasonably well for small areas
    const earthRadius = 6371000; // Earth radius in meters
    const degToRad = Math.PI / 180;
    
    // Get the center latitude of the polygon for the conversion
    let centerLat = 0;
    for (const point of ring) {
        centerLat += point[1];
    }
    centerLat /= ring.length;
    centerLat *= degToRad;
    
    // Convert square degrees to square meters
    const metersPerDegreeLatitude = earthRadius * degToRad;
    const metersPerDegreeLongitude = earthRadius * Math.cos(centerLat) * degToRad;
    
    return Math.abs(area) * metersPerDegreeLatitude * metersPerDegreeLongitude / 2;
}

// Updated display function to show component scores
function displayAccessibilityScore(score, feature, components, rawData) {
    // Create or get the score container
    let scoreContainer = document.getElementById('accessibility-score');
    
    if (!scoreContainer) {
        // Create the container if it doesn't exist
        scoreContainer = document.createElement('div');
        scoreContainer.id = 'accessibility-score';
        scoreContainer.className = 'score-container';
        
        // Add it to the right panel
        const rightPanel = document.getElementById('right-panel');
        if (rightPanel) {
            rightPanel.appendChild(scoreContainer);
        } else {
            // Create right panel if it doesn't exist
            createRightPanel();
            document.getElementById('right-panel').appendChild(scoreContainer);
        }
    }
    
    // Format currency for house price
    const formatCurrency = new Intl.NumberFormat('en-GB', { 
        style: 'currency', 
        currency: 'GBP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
    
    // Format numbers with one decimal place
    const formatNumber = new Intl.NumberFormat('en-GB', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    });
    
    const housePriceDisplay = rawData.housePrice ? formatCurrency.format(rawData.housePrice) : 'N/A';
    const travelTimeDisplay = rawData.travelTime ? `${formatNumber.format(rawData.travelTime)} min` : 'N/A';
    
    // Set the content
    scoreContainer.innerHTML = `
        <h3>Plot Development Score</h3>
        <p>Plot: ${feature.properties.description || 'Selected Land'}</p>
        
        <div class="score-display">
            <div class="score-number">${score}</div>
            <div class="score-bar">
                <div class="score-bar-fill" style="width: ${score}%; background-color: ${getScoreColor(score)};"></div>
            </div>
        </div>
        
        <div class="score-components">
            <div class="component">
                <div class="component-label">Accessibility (${components.area}/20)</div>
                <div class="component-bar">
                    <div class="component-fill" style="width: ${components.area * 5}%; background-color: #5a3fc0;"></div>
                </div>
            </div>
            <div class="component">
                <div class="component-label">House Price (${components.price}/40)</div>
                <div class="component-bar">
                    <div class="component-fill" style="width: ${components.price * 2.5}%; background-color: #4caf50;"></div>
                </div>
            </div>
            <div class="component">
                <div class="component-label">Travel Time (${components.time}/40)</div>
                <div class="component-bar">
                    <div class="component-fill" style="width: ${components.time * 2.5}%; background-color: #2196f3;"></div>
                </div>
            </div>
        </div>
        
        <div class="data-summary">
            <div><strong>Avg House Price:</strong> ${housePriceDisplay}</div>
            <div><strong>Avg Travel Time:</strong> ${travelTimeDisplay}</div>
            
        </div>
    
    `;
}


// Get color based on score (red to green gradient)
function getScoreColor(score) {
    if (score < 30) return '#f44336'; // Red for poor accessibility
    if (score < 60) return '#ff9800'; // Orange for moderate accessibility
    return '#4caf50'; // Green for good accessibility
}

// Create right panel for UI elements
function createRightPanel() {
    // Check if it already exists
    if (document.getElementById('right-panel')) return;
    
    // Create the right panel
    const rightPanel = document.createElement('div');
    rightPanel.id = 'right-panel';
    rightPanel.className = 'right-panel';
    
    // Add to body
    document.body.appendChild(rightPanel);
}

// Add isochrone toggle button to the UI
function addIsochroneToggle() {
    // Check if button already exists
    if (document.getElementById('isochrone-toggle')) return;
    
    // Create right panel if it doesn't exist
    createRightPanel();
    
    // Create toggle button
    const toggleButton = document.createElement('button');
    toggleButton.id = 'isochrone-toggle';
    toggleButton.className = 'isochrone-toggle';
    toggleButton.textContent = `Show ${minutes}-min Access`;
    
    // Add to right panel
    const rightPanel = document.getElementById('right-panel');
    rightPanel.appendChild(toggleButton);
    
    // Add click event
    toggleButton.addEventListener('click', () => {
        const selectedLand = dataHandler.getSelectedLand();
        
        if (selectedLand) {
            if (isochronesVisible) {
                // If isochrones are already shown, clear them
                clearIsochrones();
            } else {
                // Otherwise, generate new isochrones
                generateIsochrones(selectedLand);
            }
        } else {
            alert('Please select a plot first to analyze accessibility.');
        }
    });
}

// Add the new CSS styles for component bars
function addIsochroneStyles() {
    // Check if styles are already added
    if (document.getElementById('isochrone-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'isochrone-styles';
    style.textContent = `
        .right-panel {
            position: absolute;
            top: 10px;
            right: 10px;
            width: 300px;
            z-index: 10;
            display: flex;
            flex-direction: column;
        }
        
        .isochrone-toggle {
            margin: 10px;
            padding: 8px 16px;
            background-color: #5a3fc0;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
        }
        
        .isochrone-toggle:hover {
            background-color: #4a32a0;
        }
        
        .score-container {
            background: white;
            padding: 10px;
            border-radius: 4px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            margin: 10px;
        }
        
        .score-display {
            display: flex;
            align-items: center;
            margin: 15px 0;
        }
        
        .score-number {
            font-size: 24px;
            font-weight: bold;
            margin-right: 15px;
            min-width: 40px;
        }
        
        .score-bar {
            flex-grow: 1;
            height: 12px;
            background-color: #f0f0f0;
            border-radius: 6px;
            overflow: hidden;
        }
        
        .score-bar-fill {
            height: 100%;
            border-radius: 6px;
        }
        
        .score-components {
            margin: 15px 0;
        }
        
        .component {
            margin-bottom: 8px;
        }
        
        .component-label {
            font-size: 13px;
            margin-bottom: 3px;
            display: flex;
            justify-content: space-between;
        }
        
        .component-bar {
            height: 8px;
            background-color: #f0f0f0;
            border-radius: 4px;
            overflow: hidden;
        }
        
        .component-fill {
            height: 100%;
            border-radius: 4px;
        }
        
        .data-summary {
            font-size: 13px;
            margin: 15px 0;
            padding: 8px;
            background-color: #f9f9f9;
            border-radius: 4px;
        }
        
        .score-explanation {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
        }
    `;
    
    document.head.appendChild(style);
}

// Initialize isochrone functionality
function initializeIsochrones() {
    // Add CSS for isochrone UI
    addIsochroneStyles();
    
    // Add toggle button
    addIsochroneToggle();
    
    // Listen for land selection changes
    document.addEventListener('landSelectionChanged', (e) => {
        // If isochrones are visible, update them for the new selection
        if (isochronesVisible && e.detail && e.detail.feature) {
            generateIsochrones(e.detail.feature);
        } else {
            // Otherwise just clear existing isochrones
            clearIsochrones();
        }
    });
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', initializeIsochrones);
