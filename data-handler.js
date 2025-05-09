// Data handler for the Glasgow Mapping Application
class DataHandler {
    constructor() {
        this.mapboxToken = 'pk.eyJ1IjoiaGVzaGFtc2hhd3F5IiwiYSI6ImNrdnBvY2UwcTFkNDkzM3FmbTFhenM0M3MifQ.ZqIuL9khfbCyOF3DU_IH5w';
        this.map = null;
        this.emptyLands = { type: 'FeatureCollection', features: [] };
        this.railwayStations = { type: 'FeatureCollection', features: [] };
        this.selectedLandId = null; // Track the currently selected land
    }

    // Initialize the Mapbox map
    initializeMap() {
        mapboxgl.accessToken = this.mapboxToken;
        
        this.map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/heshamshawqy/cm8yshq5b003p01qrfxz94kyd',
            center: [-4.2518, 55.8642],
            zoom: 12
        });
        
        return this.map;
    }
    
    // Fetch data from Overpass API
    async fetchData() {
        await this.fetchEmptyLandsData();
        await this.fetchRailwayStations();
    }
    
    // Fetch empty lands data from Overpass API
    async fetchEmptyLandsData() {
        // Query for empty lands in Glasgow area
        const overpassQuery = `
            [out:json];
            (
              // Railway-related lands
              way["railway"]["disused"="yes"](55.8,-4.4,55.9,-4.1);
              way["landuse"="railway"](55.8,-4.4,55.9,-4.1);
              
              // Brownfield and vacant lands
              way["landuse"="brownfield"](55.8,-4.4,55.9,-4.1);
              way["landuse"="vacant"](55.8,-4.4,55.9,-4.1);
              
              // Network Rail properties
              way["operator"~"Network Rail|network rail"](55.8,-4.4,55.9,-4.1);
              way["owner"~"Network Rail|network rail"](55.8,-4.4,55.9,-4.1);
            );
            out geom;
        `;
        
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        this.processEmptyLandsData(data);
    }
    
    // Fetch railway stations from Overpass API
    async fetchRailwayStations() {
        // Query for railway stations in Glasgow area
        const stationsQuery = `
            [out:json];
            (
              node["railway"="station"](55.8,-4.4,55.9,-4.1);
              node["railway"="subway_entrance"](55.8,-4.4,55.9,-4.1);
              node["railway"="halt"](55.8,-4.4,55.9,-4.1);
              node["railway"="tram_stop"](55.8,-4.4,55.9,-4.1);
            );
            out geom;
        `;
        
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(stationsQuery)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        this.processStationsData(data);
    }
    
    // Process railway stations data
    processStationsData(data) {
        this.railwayStations.features = [];
        
        for (const element of data.elements) {
            if (element.type === 'node') {
                const feature = {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [element.lon, element.lat]
                    },
                    properties: {
                        id: element.id || `station-${this.railwayStations.features.length}`,
                        name: element.tags?.name || 'Unnamed Station',
                        type: element.tags?.railway || 'station',
                        operator: element.tags?.operator || 'Unknown',
                        description: `${element.tags?.name || 'Railway Station'} (${element.tags?.railway || 'station'})`
                    }
                };
                
                this.railwayStations.features.push(feature);
            }
        }
    }
    
    // Process Overpass API data into GeoJSON format for empty lands
    processEmptyLandsData(data) {
        this.emptyLands.features = [];
        
        for (const element of data.elements) {
            if (element.type === 'way' && element.geometry) {
                const coordinates = [element.geometry.map(node => [node.lon, node.lat])];
                
                // Close the polygon if needed
                if (coordinates[0].length > 2) {
                    const first = coordinates[0][0];
                    const last = coordinates[0][coordinates[0].length - 1];
                    if (first[0] !== last[0] || first[1] !== last[1]) {
                        coordinates[0].push(coordinates[0][0]);
                    }
                }
                
                // Only create valid polygons
                if (coordinates[0].length >= 4) {
                    const area = this.calculateAreaInSquareMeters(coordinates);
                    
                    // Create description
                    let description = '';
                    if (element.tags) {
                        const tags = element.tags;
                        if (tags.name) description += tags.name + ': ';
                        if (tags.landuse) description += 'Land use: ' + tags.landuse + '. ';
                        if (tags.railway) description += 'Railway: ' + tags.railway + '. ';
                        if (tags.disused) description += 'Disused: ' + tags.disused + '. ';
                    }
                    
                    // Calculate center point for camera movement
                    const center = this.calculateCenter(coordinates[0]);
                    
                    const feature = {
                        type: 'Feature',
                        geometry: {
                            type: 'Polygon',
                            coordinates: coordinates
                        },
                        properties: {
                            id: element.id || `land-${this.emptyLands.features.length}`,
                            owner: element.tags?.owner || element.tags?.operator || 'Network Rail',
                            area: area,
                            description: description || 'Potential development site',
                            selected: false,
                            center: center // Store center for camera movement
                        }
                    };
                    
                    this.emptyLands.features.push(feature);
                }
            }
        }
    }
    
    // Calculate center point of a polygon
    calculateCenter(points) {
        let sumX = 0;
        let sumY = 0;
        
        for (const point of points) {
            sumX += point[0];
            sumY += point[1];
        }
        
        return [sumX / points.length, sumY / points.length];
    }
    
    // Calculate area in square meters using the Haversine formula
    calculateAreaInSquareMeters(coordinates) {
        if (!coordinates || !coordinates[0] || coordinates[0].length < 3) {
            return 0;
        }
        
        const polygon = coordinates[0];
        const earthRadius = 6371000; // Earth radius in meters
        
        // Convert polygon to radians
        const polygonRad = polygon.map(point => [
            (point[0] * Math.PI) / 180,
            (point[1] * Math.PI) / 180
        ]);
        
        let area = 0;
        
        // Calculate area using the spherical excess formula
        for (let i = 0; i < polygonRad.length - 1; i++) {
            const p1 = polygonRad[i];
            const p2 = polygonRad[i + 1];
            area += (p2[0] - p1[0]) * Math.sin((p1[1] + p2[1]) / 2);
        }
        
        area = Math.abs(area * earthRadius * earthRadius / 2);
        
        return area;
    }
    
    // Render data on the map
    renderData() {
        if (this.map.loaded()) {
            this.addDataLayers();
        } else {
            this.map.on('load', () => {
                this.addDataLayers();
            });
        }
    }

    // Add data layers to the map
    addDataLayers() {
        // Add empty lands layer
        this.map.addSource('empty-lands-source', {
            type: 'geojson',
            data: this.emptyLands
        });
        
        // Add layer for empty lands
        this.map.addLayer({
            id: 'empty-lands',
            type: 'fill',
            source: 'empty-lands-source',
            paint: {
                'fill-color': [
                    'case',
                    ['boolean', ['get', 'selected'], false],
                    '#ff9900', // Orange for selected
                    '#FD3DB5'  // Blue for unselected
                ],
                'fill-opacity': 0.5,
                'fill-outline-color': '#fff'
            }
        });
        
        // Add outline layer
        this.map.addLayer({
            id: 'empty-lands-outline',
            type: 'line',
            source: 'empty-lands-source',
            paint: {
                'line-color': '#fff',
                'line-width': 1
            }
        });
        
        // Add railway stations layer
        this.map.addSource('railway-stations-source', {
            type: 'geojson',
            data: this.railwayStations
        });
        
        // Add layer for railway stations
        this.map.addLayer({
            id: 'railway-stations',
            type: 'circle',
            source: 'railway-stations-source',
            paint: {
                'circle-radius': 5,
                'circle-color': '#3388ff', // Red for stations
                'circle-stroke-width': 1,
                'circle-stroke-color': '#ffffff'
            }
        });
        
        // Add labels for stations
        this.map.addLayer({
            id: 'railway-stations-labels',
            type: 'symbol',
            source: 'railway-stations-source',
            layout: {
                'text-field': ['get', 'name'],
                'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
                'text-offset': [0, 1.5],
                'text-anchor': 'top',
                'text-size': 12
            },
            paint: {
                'text-color': '#333',
                'text-halo-color': '#fff',
                'text-halo-width': 1
            }
        });
    }
    
    // Select a land (deselect any previously selected land)
    selectLand(id) {
        // First, deselect the currently selected land if any
        if (this.selectedLandId !== null) {
            const oldIndex = this.emptyLands.features.findIndex(f => f.properties.id === this.selectedLandId);
            if (oldIndex !== -1) {
                this.emptyLands.features[oldIndex].properties.selected = false;
            }
        }
        
        // Now select the new land
        const newIndex = this.emptyLands.features.findIndex(f => f.properties.id === id);
        
        if (newIndex !== -1) {
            // Select the new land
            this.emptyLands.features[newIndex].properties.selected = true;
            this.selectedLandId = id;
            
            // Update the map
            this.map.getSource('empty-lands-source').setData(this.emptyLands);
            
            // Fly to the selected feature
            const feature = this.emptyLands.features[newIndex];
            if (feature.properties.center) {
                this.flyToFeature(feature);
            }
            
            // Dispatch event that selection changed
            document.dispatchEvent(new CustomEvent('landSelectionChanged', { 
                detail: { selected: true, feature: feature }
            }));
            
            return feature;
        }
        
        return null;
    }

    // Deselect the currently selected land
    deselectLand() {
        if (this.selectedLandId !== null) {
            const index = this.emptyLands.features.findIndex(f => f.properties.id === this.selectedLandId);
            
            if (index !== -1) {
                this.emptyLands.features[index].properties.selected = false;
                const feature = this.emptyLands.features[index];
                this.selectedLandId = null;
                
                // Update the map
                this.map.getSource('empty-lands-source').setData(this.emptyLands);
                
                // Dispatch event that selection changed
                document.dispatchEvent(new CustomEvent('landSelectionChanged', { 
                    detail: { selected: false, feature: null }
                }));
                
                return feature;
            }
        }
        
        return null;
    }

    // Toggle selection state of a land
    toggleLandSelection(id) {
        // Check if this land is already selected
        const isCurrentlySelected = this.selectedLandId === id;
        
        if (isCurrentlySelected) {
            // If it's already selected, deselect it
            return this.deselectLand();
        } else {
            // Otherwise, select it (and deselect any previously selected land)
            return this.selectLand(id);
        }
    }
    // Fly to a feature
    flyToFeature(feature) {
        const center = feature.properties.center;
        
        if (center) {
            this.map.flyTo({
                center: center,
                zoom: 14,
                essential: true
            });
        }
    }
    
    // Get all empty lands
    getEmptyLands() {
        return this.emptyLands.features;
    }
    
    // Get the currently selected land
    getSelectedLand() {
        if (this.selectedLandId === null) return null;
        
        return this.emptyLands.features.find(f => f.properties.id === this.selectedLandId);
    }
    
    // Get all railway stations
    getRailwayStations() {
        return this.railwayStations.features;
    }
    
    // Search for lands by description
    searchLands(query) {
        if (!query) return this.emptyLands.features;
        
        const lowerQuery = query.toLowerCase();
        return this.emptyLands.features.filter(feature => {
            const description = feature.properties.description.toLowerCase();
            const owner = feature.properties.owner.toLowerCase();
            return description.includes(lowerQuery) || owner.includes(lowerQuery);
        });
    }
}

// Create a data handler instance
const dataHandler = new DataHandler();