// Simple Isochrone Handler
const SimpleIsochrone = {
  // Default values
  profile: 'walking', // Only walking mode
  minutes: 15,
  marker: null,
  datazonesWithinIsochrone: [], // Store datazones within current isochrone
  
  // Initialize the handler
  init(map) {
    this.map = map;
    
    // Create a marker to show the query point
    this.marker = new mapboxgl.Marker({
      color: '#5a3fc0'
    });
    
    // Set up the map layers for isochrone
    if (map.loaded()) {
      this.setupMapLayers();
    } else {
      map.on('load', () => {
        this.setupMapLayers();
      });
    }
    
    this.setupEventListeners();
    return this;
  },
  
  // Set up the map layers for isochrone
  setupMapLayers() {
    // Add isochrone source
    this.map.addSource('iso', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    });
    
    // Add isochrone layer
    this.map.addLayer({
      id: 'isoLayer',
      type: 'fill',
      source: 'iso',
      layout: {},
      paint: {
        'fill-color': '#5a3fc0',
        'fill-opacity': 0.3
      }
    });
    
    // // Add a layer for highlighting datazones within isochrone
    // this.map.addSource('datazones-within', {
    //   type: 'geojson',
    //   data: {
    //     type: 'FeatureCollection',
    //     features: []
    //   }
    // });
    
    // this.map.addLayer({
    //   id: 'datazones-within-outline',
    //   type: 'line',
    //   source: 'datazones-within',
    //   paint: {
    //     'line-color': '#5a3fc0',
    //     'line-width': 2
    //   }
    // });
  },
  
  // Set up event listeners for the controls
  setupEventListeners() {
    // Get the slider element
    const slider = document.getElementById('duration-slider');
    
    // Add event listener for slider changes
    slider.addEventListener('input', (event) => {
      this.minutes = parseInt(event.target.value);
      document.getElementById('duration-value').textContent = `${this.minutes} minutes`;
      
      // If we have a marker on the map, update the isochrone
      if (this.marker.getLngLat()) {
        this.getIso();
      }
    });
  },
  
  // Handle feature selection
  handleFeatureSelection(feature) {
    let coordinates;
    
    // Get coordinates based on feature type
    if (feature.geometry.type === 'Point') {
      coordinates = feature.geometry.coordinates;
    } else if (feature.geometry.type === 'Polygon') {
      // Calculate center of polygon
      const polygonCoords = feature.geometry.coordinates[0];
      let sumLng = 0, sumLat = 0;
      
      polygonCoords.forEach(coord => {
        sumLng += coord[0];
        sumLat += coord[1];
      });
      
      coordinates = [
        sumLng / polygonCoords.length,
        sumLat / polygonCoords.length
      ];
    }
    
    // Update marker position
    this.marker.setLngLat(coordinates).addTo(this.map);
    
    // Update status message with feature name
    const featureName = feature.properties.name || `Feature #${feature.properties.id}`;
    const statusElement = document.getElementById('isochrone-status');
    if (statusElement) {
      statusElement.textContent = `Selected: ${featureName}`;
    }

    // Generate isochrone
    this.getIso();
  },
  
  // Get isochrone from Mapbox API
  async getIso() {
    try {
      const lngLat = this.marker.getLngLat();
      const urlBase = 'https://api.mapbox.com/isochrone/v1/mapbox/';
      
      // Construct the API URL
      const url = `${urlBase}${this.profile}/${lngLat.lng},${lngLat.lat}?contours_minutes=${this.minutes}&denoise=0.2&polygons=true&access_token=${mapboxgl.accessToken}`;
      
      // Fetch the isochrone data
      const response = await fetch(url);
      const data = await response.json();
      
      // Check if the source exists before setting data
      if (this.map.getSource('iso')) {
        this.map.getSource('iso').setData(data);
        
        // After updating the isochrone, analyze datazones within it
        if (data.features && data.features.length > 0) {
          this.analyzeDatazonesWithinIsochrone(data.features[0]);
        }
      } else {
        console.warn('Isochrone source not found. Make sure the map is fully loaded.');
      }
    } catch (error) {
      console.error('Error generating isochrone:', error);
    }
  },
  
  // Analyze datazones within the isochrone boundary
  analyzeDatazonesWithinIsochrone(isochroneFeature) {
    try {
      // Get the datazones source
      const datazonesSource = this.map.getSource('datazones');
      if (!datazonesSource) {
        console.warn('Datazones source not found');
        return;
      }
      
      // Get the datazones data
      const datazones = this.map.querySourceFeatures('datazones');
      if (!datazones || datazones.length === 0) {
        console.warn('No datazones found in source');
        return;
      }
      
      // Reset the datazones within isochrone
      this.datazonesWithinIsochrone = [];
      
      // Get the isochrone polygon coordinates
      const isochronePolygon = isochroneFeature.geometry.coordinates[0];
      if (!isochronePolygon || !Array.isArray(isochronePolygon)) {
        console.warn('Invalid isochrone polygon geometry');
        return;
      }
      
      // Filter datazones whose centroids are within the isochrone
      const datazonesWithin = datazones.filter(datazone => {
        // Skip invalid features
        if (!datazone || !datazone.geometry || !datazone.geometry.coordinates) {
          return false;
        }
        
        // Calculate centroid of the datazone
        const centroid = this.calculateCentroid(datazone);
        
        // Skip if centroid calculation failed
        if (!centroid) {
          return false;
        }
        
        // Check if the centroid is within the isochrone polygon
        return this.pointInPolygon(centroid, isochronePolygon);
      });
      
      // Store the datazones within the isochrone
      this.datazonesWithinIsochrone = datazonesWithin;
      
      // Update the datazones-within source
      if (this.map.getSource('datazones-within')) {
        this.map.getSource('datazones-within').setData({
          type: 'FeatureCollection',
          features: datazonesWithin
        });
      }
      
      // Calculate and display statistics
      this.calculateDatazoneStatistics();
    } catch (error) {
      console.error('Error analyzing datazones:', error);
      this.updateStatisticsDisplay('Error analyzing datazones within walking distance');
    }
  },
  
  // Calculate centroid of a GeoJSON feature
  calculateCentroid(feature) {
    try {
      // Check if feature has valid geometry
      if (!feature || !feature.geometry || feature.geometry.type !== 'Polygon') {
        return null;
      }
      
      // Check if coordinates array exists and has elements
      const coordinates = feature.geometry.coordinates[0];
      if (!coordinates || !Array.isArray(coordinates) || coordinates.length === 0) {
        return null;
      }
      
      let sumX = 0;
      let sumY = 0;
      
      coordinates.forEach(coord => {
        if (Array.isArray(coord) && coord.length >= 2) {
          sumX += coord[0];
          sumY += coord[1];
        }
      });
      
      if (coordinates.length > 0) {
        return [sumX / coordinates.length, sumY / coordinates.length];
      }
      
      return null;
    } catch (error) {
      console.error('Error calculating centroid:', error);
      return null;
    }
  },
  
  // Check if a point is inside a polygon using ray casting algorithm
  pointInPolygon(point, polygon) {
    try {
      // Validate inputs
      if (!point || !Array.isArray(point) || point.length < 2) {
        return false;
      }
      
      if (!polygon || !Array.isArray(polygon) || polygon.length < 3) {
        return false;
      }
      
      // Ray casting algorithm
      let inside = false;
      const x = point[0];
      const y = point[1];
      
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        // Ensure polygon points are valid
        if (!polygon[i] || !polygon[j] || 
            !Array.isArray(polygon[i]) || !Array.isArray(polygon[j]) ||
            polygon[i].length < 2 || polygon[j].length < 2) {
          continue;
        }
        
        const xi = polygon[i][0];
        const yi = polygon[i][1];
        const xj = polygon[j][0];
        const yj = polygon[j][1];
        
        const intersect = ((yi > y) !== (yj > y)) && 
                          (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        
        if (intersect) inside = !inside;
      }
      
      return inside;
    } catch (error) {
      console.error('Error in point-in-polygon test:', error);
      return false;
    }
  },
  
  // Calculate statistics from datazones within isochrone
  calculateDatazoneStatistics() {
    const zones = this.datazonesWithinIsochrone || [];

    if (!zones.length) {
      this.updateStatisticsDisplay(
        'No datazones found within this walking distance'
      );
      return;
    }

    // 1) CONFIG: categories → list of metrics
    const categories = [
      {
        heading: 'Eradicating Child Poverty',
        metrics: [
          { key: 'HEALTH OUTCOMES',
            label: 'Health Outcomes',
            format: (sum, count) =>
              count > 0 ? (sum/count).toFixed(1) : 'N/A'
          },
          { key: 'CHILDREN IN FAMILIES WITH LIMITED RESOURCES',
            label: 'Children in Families with Limited Resources',
            format: (sum, count) =>
              count > 0 ? (sum/count).toFixed(1) : 'N/A'
          },
          { key: 'CHILD BENEFIT',
            label: 'Child Benefit',
            format: (sum, count) =>
              count > 0 ? sum.toFixed(0) : 'N/A'
          },
        ]
      },
      {
        heading: 'Growing the Economy',
        metrics: [
          { key: 'INDEX OF MULTIPLE DEPRIVATION',
            label: 'Income Indicators',
            format: (sum, count) =>
              count>0 ? (sum/count).toFixed(1) : 'N/A'
          },
          { key: 'BUSINESS DEMOGRAPHY',
            label: 'Business Demography (Survival)',
            format: (sum, count) =>
              count>0 ? (sum/count).toFixed(2) : 'N/A'
          },
          { key: 'ECONOMIC ACTIVITY',
            label: 'Economic Activity / Inactivity',
            format: (sum, count) =>
              count>0 ? (sum/count).toFixed(1) : 'N/A'
          },
          { key: 'HOUSE SALES PRICE',
            label: 'House Sale Prices',
            format: (sum, count) =>
              count>0 ? Math.round(sum/count).toLocaleString() : 'N/A'
          },
          { key: 'EARNINGS',
            label: 'Earnings',
            format: (sum, count) =>
              count>0 ? '£'+(sum/count).toFixed(0) : 'N/A'
          },
          { key: 'UNDEREMPLOYMENT',
            label: 'Underemployment',
            format: (sum, count) =>
              count>0 ? (sum/count).toFixed(1)+'%' : 'N/A'
          },
        ]
      },
      {
        heading: 'Tackling the Climate Emergency',
        metrics: [
          { key: 'CAR OWNERSHIP',
            label: 'Car Ownership',
            format: (sum, count) =>
              count>0 ? (sum/count).toFixed(0)+'%' : 'N/A'
          },
          { key: 'HOUSING QUALITY',
            label: 'Housing Quality',
            format: (sum, count) =>
              count>0 ? (sum/count).toFixed(1) : 'N/A'
          },
          { key: 'ENERGY CONSUMPTION',
            label: 'Energy Consumption',
            format: (sum, count) =>
              count>0 ? Math.round(sum/count).toLocaleString() : 'N/A'
          },
          { key: 'POPULATION ESTIMATES',
            label: 'Population Estimates',
            format: (sum, count) =>
              count>0 ? Math.round(sum).toLocaleString() : 'N/A'
          },
        ]
      },
      {
        heading: 'Ensuring High Quality and Sustainable Public Services',
        metrics: [
          { key: 'LOCAL SERVICE SATISFACTION',
            label: 'Local Service Satisfaction',
            format: (sum, count) =>
              count>0 ? (sum/count).toFixed(1) : 'N/A'
          },
          { key: 'ACCESS TO PUBLIC TRANSPORT',
            label: 'Access to Public Transport',
            format: (sum, count) =>
              count>0 ? (sum/count).toFixed(1) : 'N/A'
          },
          { key: 'BUS ACCESSIBILITY',
            label: 'Bus Accessibility',
            format: (sum, count) =>
              count>0 ? (sum/count).toFixed(2) : 'N/A'
          },
          { key: 'GEOGRAPHIC ACCESS TO SERVICES INDICATOR',
            label: 'Geographic Access to Services',
            format: (sum, count) =>
              count>0 ? (sum/count).toFixed(1) : 'N/A'
          },
        ]
      }
    ];

    // 2) INITIALIZE counters
    const stats = {};
    categories.forEach(cat =>
      cat.metrics.forEach(m => {
        stats[m.key] = { total: 0, count: 0 };
      })
    );

    // 3) AGGREGATE all zones in a single pass
    zones.forEach(zone => {
      const props = zone.properties || {};
      Object.keys(stats).forEach(key => {
        const v = parseFloat(props[key]);
        if (!isNaN(v)) {
          stats[key].total += v;
          stats[key].count += 1;
        }
      });
    });

    // 4) BUILD your HTML output
    let html = `<strong>Datazones within ${this.minutes} min walk:</strong> ${zones.length}<br>`;

    categories.forEach(cat => {
      html += `<br><h3>${cat.heading}</h3>`;
      cat.metrics.forEach(m => {
        const { total, count } = stats[m.key];
        html += `<strong>${m.label}:</strong> ${m.format(total, count)}<br>`;
      });
    });

    // 5) RENDER
    this.updateStatisticsDisplay(html);
  },

  // Update the statistics display
  updateStatisticsDisplay(html) {
    try {
      const statusElement = document.getElementById('isochrone-status');
      if (statusElement) {
        statusElement.innerHTML = html;
      }
    } catch (error) {
      console.error('Error updating statistics display:', error);
    }
  }
};

export default SimpleIsochrone;