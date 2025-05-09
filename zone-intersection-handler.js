
// Simplified Isochrone Intersection Handler
// This file finds data zones that intersect with an isochrone boundary
// and displays only the average values

class IsochroneIntersectionHandler {
    constructor() {
        this.rightPanelId = 'right-panel';
        this.resultsContainerId = 'isochrone-intersection-results';
    }

    // Initialize the handler
    initialize() {
        // Listen for isochrone generation events
        document.addEventListener('isochroneGenerated', (e) => {
            if (e.detail && e.detail.isochroneData && e.detail.feature) {
                this.findIntersectingZones(e.detail.isochroneData, e.detail.feature);
            }
        });
        
        // Add minimal styles matching the zone finder
        const style = document.createElement('style');
        style.textContent = `
            .results-container {
                background: white;
                padding: 10px;
                border-radius: 4px;
                box-shadow: 0 0 10px rgba(0,0,0,0.1);
                margin: 10px;
            }
            
            .results-stat {
                display: flex;
                justify-content: space-between;
                margin: 10px 0;
                padding: 5px 0;
                border-bottom: 1px solid #eee;
            }
            
            .stat-label {
                font-weight: bold;
            }
            
            .stat-value {
                font-size: 16px;
                color: #1a73e8;
            }
            
            .results-explanation {
                font-size: 12px;
                color: #666;
                margin-top: 5px;
            }
        `;
        document.head.appendChild(style);
    }

    // Find zones that intersect with the isochrone
    findIntersectingZones(isochroneData, feature) {
        if (!isochroneData || !isochroneData.features || isochroneData.features.length === 0) {
            console.log('No isochrone data available');
            return [];
        }
        
        if (!geojsonData || !geojsonData.features) {
            console.log('No geojson data available');
            return [];
        }

        // Create a combined isochrone polygon
        const isochroneFeatures = [];
        for (const isoFeature of isochroneData.features) {
            if (isoFeature.geometry.type === 'Polygon') {
                isochroneFeatures.push(turf.polygon(isoFeature.geometry.coordinates));
            } else if (isoFeature.geometry.type === 'MultiPolygon') {
                for (const coords of isoFeature.geometry.coordinates) {
                    isochroneFeatures.push(turf.polygon(coords));
                }
            }
        }
        
        // Create a combined polygon if multiple polygons exist
        let isochronePolygon;
        if (isochroneFeatures.length === 1) {
            isochronePolygon = isochroneFeatures[0];
        } else if (isochroneFeatures.length > 1) {
            // Combine using union
            isochronePolygon = isochroneFeatures.reduce((combined, polygon) => {
                if (!combined) return polygon;
                try {
                    return turf.union(combined, polygon);
                } catch (e) {
                    return combined;
                }
            }, null);
        } else {
            console.log('No valid isochrone geometries');
            return [];
        }
        
        // Find intersecting zones
        const intersectingZones = [];
        let totalHousePrice = 0;
        let totalTravelTime = 0;

        // Use simple isochrone bbox for quick filtering
        const isochroneBbox = turf.bbox(isochronePolygon);
        
        // Check each zone for intersection
        for (const zone of geojsonData.features) {
            if (!zone.geometry) continue;
            
            try {
                // Quick bbox check first
                const zoneBbox = turf.bbox(zone);
                if (!this.bboxesIntersect(isochroneBbox, zoneBbox)) {
                    continue; // Skip if bounding boxes don't intersect
                }
                
                // Perform actual intersection check
                let zonePolygon;
                let intersects = false;
                
                if (zone.geometry.type === 'Polygon') {
                    zonePolygon = turf.polygon(zone.geometry.coordinates);
                    intersects = turf.booleanIntersects(isochronePolygon, zonePolygon);
                } else if (zone.geometry.type === 'MultiPolygon') {
                    for (const coords of zone.geometry.coordinates) {
                        const polyPart = turf.polygon(coords);
                        if (turf.booleanIntersects(isochronePolygon, polyPart)) {
                            intersects = true;
                            break;
                        }
                    }
                }
                
                if (intersects) {
                    intersectingZones.push(zone);
                    
                    // Add up the values for calculating averages
                    if (zone.properties) {
                        if (!isNaN(zone.properties.MeanHousePrice)) {
                            totalHousePrice += zone.properties.MeanHousePrice;
                        }
                        
                        if (!isNaN(zone.properties.AvgTravelTime)) {
                            totalTravelTime += zone.properties.AvgTravelTime;
                        }
                    }
                }
            } catch (err) {
                // Skip errors and continue with next zone
                continue;
            }
        }
        
        // Calculate averages
        const zoneCount = intersectingZones.length;
        const avgHousePrice = zoneCount > 0 ? totalHousePrice / zoneCount : 0;
        const avgTravelTime = zoneCount > 0 ? totalTravelTime / zoneCount : 0;
        
        // Prepare results object
        const results = {
            count: zoneCount,
            avgHousePrice: avgHousePrice,
            avgTravelTime: avgTravelTime
        };
        
        // Display the results
        this.displayIntersectionResults(results, feature);
        
        // Update the feature with the aggregated data
        if (feature && feature.properties) {
            feature.properties.intersectingZones = zoneCount;
            feature.properties.avgHousePrice = avgHousePrice;
            feature.properties.avgTravelTime = avgTravelTime;
            
            // Update in the data handler if available
            if (dataHandler && dataHandler.selectedLandId) {
                const index = dataHandler.emptyLands.features.findIndex(
                    f => f.properties.id === dataHandler.selectedLandId
                );
                
                if (index !== -1) {
                    // Update properties
                    dataHandler.emptyLands.features[index].properties.intersectingZones = zoneCount;
                    dataHandler.emptyLands.features[index].properties.avgHousePrice = avgHousePrice;
                    dataHandler.emptyLands.features[index].properties.avgTravelTime = avgTravelTime;
                    
                    // Update map source if needed
                    if (dataHandler.map && dataHandler.map.getSource('empty-lands-source')) {
                        dataHandler.map.getSource('empty-lands-source').setData(dataHandler.emptyLands);
                    }
                }
            }
        }
        
        // Highlight all intersecting zones
        this.highlightIntersectingZones(intersectingZones);
        
        return results;
    }
    
    // Fast check if two bounding boxes intersect
    bboxesIntersect(bbox1, bbox2) {
        return !(
            bbox1[2] < bbox2[0] || // bbox1 is left of bbox2
            bbox1[0] > bbox2[2] || // bbox1 is right of bbox2
            bbox1[3] < bbox2[1] || // bbox1 is above bbox2
            bbox1[1] > bbox2[3]    // bbox1 is below bbox2
        );
    }
    
    // Display the intersection results (matched to zone finder style)
    displayIntersectionResults(results, feature) {
        // Create or get the results container
        let resultsContainer = document.getElementById(this.resultsContainerId);
        
        if (!resultsContainer) {
            // Create container if it doesn't exist
            resultsContainer = document.createElement('div');
            resultsContainer.id = this.resultsContainerId;
            resultsContainer.className = 'results-container';
            
            // Add it to the right panel
            const rightPanel = document.getElementById(this.rightPanelId);
            if (rightPanel) {
                rightPanel.appendChild(resultsContainer);
            } else {
                // Create right panel if it doesn't exist
                const rightPanel = document.createElement('div');
                rightPanel.id = this.rightPanelId;
                rightPanel.className = 'right-panel';
                document.body.appendChild(rightPanel);
                rightPanel.appendChild(resultsContainer);
            }
        }
        
        // Format currencies and numbers
        const formatCurrency = new Intl.NumberFormat('en-GB', { 
            style: 'currency', 
            currency: 'GBP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
        
        const formatNumber = new Intl.NumberFormat('en-GB', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        });
        
        // Set the content - matching the style from the zone finder
        resultsContainer.innerHTML = `
        `;
    }
    
    // Highlight intersecting zones on the map
    highlightIntersectingZones(zones) {
        const map = dataHandler.map;
        
        // Remove existing highlight if any
        if (map.getLayer('intersecting-zones')) {
            map.removeLayer('intersecting-zones');
        }
        
        if (map.getSource('intersecting-zones-source')) {
            map.removeSource('intersecting-zones-source');
        }
        
        // Create a FeatureCollection from the zones
        const featureCollection = {
            type: 'FeatureCollection',
            features: zones
        };
        
        // Add the new source and layer
        map.addSource('intersecting-zones-source', {
            type: 'geojson',
            data: featureCollection
        });
        
        map.addLayer({
            id: 'intersecting-zones',
            type: 'line',
            source: 'intersecting-zones-source',
            paint: {
                'line-color': '#ff9900',
                'line-width': 2,
                'line-dasharray': [3, 2]
            }
        });
    }
    
    // Clear highlights and results
    clearResults() {
        const map = dataHandler.map;
        
        // Remove zone highlights
        if (map.getLayer('intersecting-zones')) {
            map.removeLayer('intersecting-zones');
        }
        
        if (map.getSource('intersecting-zones-source')) {
            map.removeSource('intersecting-zones-source');
        }
        
        // Clear results container
        const resultsContainer = document.getElementById(this.resultsContainerId);
        if (resultsContainer) {
            resultsContainer.innerHTML = '';
        }
    }
}

// Create and initialize the handler
const isochroneIntersectionHandler = new IsochroneIntersectionHandler();
document.addEventListener('DOMContentLoaded', () => {
    isochroneIntersectionHandler.initialize();
});
