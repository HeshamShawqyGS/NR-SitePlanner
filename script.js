// Mapbox token
mapboxgl.accessToken = 'pk.eyJ1IjoiaGVzaGFtc2hhd3F5IiwiYSI6ImNrdnBvY2UwcTFkNDkzM3FmbTFhenM0M3MifQ.ZqIuL9khfbCyOF3DU_IH5w';

// Global variables
let map, geojsonData;
let pricesByName = {};
let travelTimesByName = {};
// Note: We're using dataHandler from data-handler.js, so no declaration here

// Parse CSV data
function parseCSV(csvText, targetObject) {
    const lines = csvText.split('\n');
    const headers = lines[0].split(',');
    
    // Find column indices
    const valueIndex = headers.findIndex(h => h.trim() === 'Value');
    const nameIndex = headers.findIndex(h => h.trim() === 'Name');
    
    // Process each line
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = lines[i].split(',');
        const zoneName = values[nameIndex].trim();
        const value = parseFloat(values[valueIndex]);
        
        if (zoneName && !isNaN(value)) {
            targetObject[zoneName] = value;
        }
    }
    
    return Object.keys(targetObject).length;
}

// Merge data into GeoJSON
function mergeData() {
    let priceMatched = 0, pricePartial = 0, priceUnmatched = 0;
    let timeMatched = 0, timePartial = 0, timeUnmatched = 0;
    
    geojsonData.features.forEach(feature => {
        const zoneName = feature.properties.Name;
        
        // Process house prices
        if (pricesByName[zoneName]) {
            feature.properties.MeanHousePrice = pricesByName[zoneName];
            priceMatched++;
        } else {
            // Try partial match
            const dashIndex = zoneName.indexOf(' - ');
            if (dashIndex !== -1) {
                const baseName = zoneName.substring(0, dashIndex).trim();
                if (pricesByName[baseName]) {
                    feature.properties.MeanHousePrice = pricesByName[baseName];
                    pricePartial++;
                } else {
                    feature.properties.MeanHousePrice = 0;
                    priceUnmatched++;
                }
            } else {
                feature.properties.MeanHousePrice = 0;
                priceUnmatched++;
            }
        }
        
        // Process travel times
        if (travelTimesByName[zoneName]) {
            feature.properties.AvgTravelTime = travelTimesByName[zoneName];
            timeMatched++;
        } else {
            // Try partial match
            const dashIndex = zoneName.indexOf(' - ');
            if (dashIndex !== -1) {
                const baseName = zoneName.substring(0, dashIndex).trim();
                if (travelTimesByName[baseName]) {
                    feature.properties.AvgTravelTime = travelTimesByName[baseName];
                    timePartial++;
                } else {
                    feature.properties.AvgTravelTime = 0;
                    timeUnmatched++;
                }
            } else {
                feature.properties.AvgTravelTime = 0;
                timeUnmatched++;
            }
        }
    });
    
    console.log(`Prices: ${priceMatched} matched, ${pricePartial} partial, ${priceUnmatched} unmatched`);
    console.log(`Travel: ${timeMatched} matched, ${timePartial} partial, ${timeUnmatched} unmatched`);
    return geojsonData;
}

// Set up the map
function setupMap() {
    // Create the map instance
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/heshamshawqy/cm8yshq5b003p01qrfxz94kyd',
        center: [-4.2518, 55.8642],
        zoom: 12
    });
    
    // Use the dataHandler instance from data-handler.js
    dataHandler.map = map;  // Use our map instance instead of creating new one
    
    map.on('load', async () => {
        // Add data source for datazones
        map.addSource('data-zones', {
            type: 'geojson',
            data: geojsonData
        });
        
        // Add fill layer for datazones
        map.addLayer({
            'id': 'data-zone-boundaries',
            'type': 'fill',
            'source': 'data-zones',
            'paint': {
                'fill-color': '#c6dbef',
                'fill-opacity': 0.0,
                'fill-outline-color': '#000'
            }
        });
        
        // Add outline layer for datazones
        map.addLayer({
            'id': 'data-zone-outlines',
            'type': 'line',
            'source': 'data-zones',
            'paint': {
                'line-color': '#D3D3D3',
                'line-width': 0.1
            }
        });
        
        // Fetch and render empty lands and railway stations using DataHandler
        try {
            await dataHandler.fetchData();
            dataHandler.renderData();
            setupLandInteractions();
            setupStationInteractions();
            setupUIControls();
        } catch (error) {
            console.error('Error loading data:', error);
        }
    });
    
    // Add navigation controls
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
}

// Setup interactions for lands
function setupLandInteractions() {
    // Add click event for empty lands
    map.on('click', 'empty-lands', (e) => {
        const id = e.features[0].properties.id;
        const feature = dataHandler.toggleLandSelection(id);
        
        // Show land info in the UI
        if (feature && feature.properties.selected) {
            showLandInfo(feature);
            
            // Generate isochrones for the selected land if isochrone-handler.js is loaded
            if (typeof generateIsochrones === 'function') {
                generateIsochrones(feature);
            }
        } else {
            hideLandInfo();
            
            // Clear isochrones if isochrone-handler.js is loaded
            if (typeof clearIsochrones === 'function') {
                clearIsochrones();
            }
        }
    });
    
    // Change cursor on hover
    map.on('mouseenter', 'empty-lands', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    
    map.on('mouseleave', 'empty-lands', () => {
        map.getCanvas().style.cursor = '';
    });
}

// Setup interactions for railway stations
function setupStationInteractions() {
    // Station click behavior
    map.on('click', 'railway-stations', (e) => {
        const coordinates = e.features[0].geometry.coordinates.slice();
        const properties = e.features[0].properties;
        
        // Create a fake feature for isochrone generation
        const stationFeature = {
            properties: {
                id: properties.id,
                name: properties.name,
                description: `${properties.name} Railway Station`,
                center: coordinates // Use the station's coordinates as the center
            }
        };
        
        // Generate isochrones for the station if isochrone-handler.js is loaded
        if (typeof generateIsochrones === 'function') {
            // Clear any existing isochrones
            if (typeof clearIsochrones === 'function') {
                clearIsochrones();
            }
            
            // Generate new isochrones for this station
            generateIsochrones(stationFeature);
        }
        
        // Create popup content
        const popupContent = `
            <h3>${properties.name}</h3>
            <p>Station Type: ${properties.type || 'N/A'}</p>
            <p>Operator: ${properties.operator || 'N/A'}</p>
        `;
        
        // Create and show popup
        const popup = new mapboxgl.Popup()
            .setLngLat(coordinates)
            .setHTML(popupContent)
            .addTo(map);
        
        // Add event listener to the button in the popup
        // We need to wait for the popup to be added to the DOM
        setTimeout(() => {
            const isochroneBtn = document.getElementById('station-isochrone-btn');
            if (isochroneBtn) {
                isochroneBtn.addEventListener('click', () => {
                    if (typeof generateIsochrones === 'function') {
                        generateIsochrones(stationFeature);
                    }
                    popup.remove();
                });
            }
        }, 100);
    });
    
    // Change cursor on hover for stations
    map.on('mouseenter', 'railway-stations', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    
    map.on('mouseleave', 'railway-stations', () => {
        map.getCanvas().style.cursor = '';
    });
}

// Show land information in the UI
function showLandInfo(feature) {
    const props = feature.properties;
    const infoBox = document.getElementById('land-info');
    
    if (!infoBox) {
        createLandInfoPanel();
        showLandInfo(feature);
        return;
    }
    
    // Format the area to be more readable
    const area = props.area ? Math.round(props.area) : 'N/A';
    
    infoBox.innerHTML = `
        <h2>Land Information</h2>
        <table>
            <tr><td>ID:</td><td>${props.id || 'N/A'}</td></tr>
            <tr><td>Area:</td><td>${area} sq.m</td></tr>
            <tr><td>Owner:</td><td>${props.owner || 'N/A'}</td></tr>
            <tr><td>Description:</td><td>${props.description || 'N/A'}</td></tr>
        </table>
    `;
    
    infoBox.style.display = 'block';
    
    // Add event listener for the isochrone button
    const isochroneBtn = document.getElementById('land-isochrone-btn');
    if (isochroneBtn) {
        isochroneBtn.addEventListener('click', () => {
            if (typeof generateIsochrones === 'function') {
                generateIsochrones(feature);
            }
        });
    }
}

// Hide land information panel
function hideLandInfo() {
    const infoBox = document.getElementById('land-info');
    if (infoBox) {
        infoBox.style.display = 'none';
    }
}

// Create UI controls for layer toggling
function setupUIControls() {
    // Create the UI elements if they don't exist
    if (!document.getElementById('layer-controls')) {
        createLayerControls();
    }
    
    if (!document.getElementById('land-info')) {
        createLandInfoPanel();
    }
    
    // Add event listeners for layer toggles
    document.getElementById('toggle-datazones').addEventListener('change', (e) => {
        const visibility = e.target.checked ? 'visible' : 'none';
        map.setLayoutProperty('data-zone-boundaries', 'visibility', visibility);
        map.setLayoutProperty('data-zone-outlines', 'visibility', visibility);
    });
    
    document.getElementById('toggle-empty-lands').addEventListener('change', (e) => {
        const visibility = e.target.checked ? 'visible' : 'none';
        map.setLayoutProperty('empty-lands', 'visibility', visibility);
        map.setLayoutProperty('empty-lands-outline', 'visibility', visibility);
    });
    
    document.getElementById('toggle-stations').addEventListener('change', (e) => {
        const visibility = e.target.checked ? 'visible' : 'none';
        map.setLayoutProperty('railway-stations', 'visibility', visibility);
        map.setLayoutProperty('railway-stations-labels', 'visibility', visibility);
    });
    
}

// Create layer control panel
function createLayerControls() {
    const controlPanel = document.createElement('div');
    controlPanel.id = 'layer-controls';
    controlPanel.className = 'map-overlay';
    controlPanel.innerHTML = `
        <h3>Layer Controls</h3>
        <div>
            <input type="checkbox" id="toggle-datazones" checked>
            <label for="toggle-datazones">Data Zones</label>
        </div>
        <div>
            <input type="checkbox" id="toggle-empty-lands" checked>
            <label for="toggle-empty-lands">Empty Lands</label>
        </div>
        <div>
            <input type="checkbox" id="toggle-stations" checked>
            <label for="toggle-stations">Railway Stations</label>
        </div>
    `;
    document.body.appendChild(controlPanel);
}

// Create land information panel
function createLandInfoPanel() {
    const infoBox = document.createElement('div');
    infoBox.id = 'land-info';
    infoBox.className = 'map-overlay info-box';
    infoBox.style.display = 'none';
    document.body.appendChild(infoBox);
}

// Check if isochrone-handler.js is loaded and initialize it
function checkAndInitializeIsochrones() {
    if (typeof initializeIsochrones === 'function') {
        // Initialize isochrones functionality
        initializeIsochrones();
        console.log('Isochrone functionality initialized');
    } else {
        console.warn('Isochrone handler not loaded');
    }
}

// Load data and initialize map
async function init() {
    try {
        // Get house prices data
        const pricesResponse = await fetch('../00-data/csv/house-sales-prices.csv');
        const pricesText = await pricesResponse.text();
        const pricesCount = parseCSV(pricesText, pricesByName);
        console.log(`Loaded ${pricesCount} house price zones`);
        
        // Get travel times data
        const travelResponse = await fetch('../00-data/csv/key-services-travel-time-average.csv');
        const travelText = await travelResponse.text();
        const travelCount = parseCSV(travelText, travelTimesByName);
        console.log(`Loaded ${travelCount} travel time zones`);
        
        // Get GeoJSON data
        const geojsonResponse = await fetch('../00-data/geojson/datazones2011.geojson');
        geojsonData = await geojsonResponse.json();
        
        // Merge data and setup map
        geojsonData = mergeData();
        setupMap();
        
        // Initialize isochrones after a short delay to ensure scripts are loaded
        setTimeout(checkAndInitializeIsochrones, 500);
    } catch (error) {
        console.error('Error initializing application:', error);
    }
}

// Start when page loads
window.onload = init;