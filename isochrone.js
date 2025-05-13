// Simple Isochrone Handler
const SimpleIsochrone = {
  profile: 'walking',
  minutes: 15,
  marker: null,
  datazonesWithinIsochrone: [],
  
  init(map) {
    this.map = map;
    this.marker = new mapboxgl.Marker({ color: '#6666CC' });
    
    // Create and inject the sidebar HTML
    this.createSidebar();
    
    if (map.loaded()) {
      this.setupMapLayers();
    } else {
      map.on('load', () => this.setupMapLayers());
    }
    
    this.setupEventListeners();
    return this;
  },
  
  createSidebar() {
    // Check if sidebar already exists
    let sidebar = document.getElementById('isochrone-sidebar');
    
    if (!sidebar) {
      // Create the sidebar element
      sidebar = document.createElement('div');
      sidebar.id = 'isochrone-sidebar';
      sidebar.className = 'sidebar';
      
      // Set the HTML content - using the same style as the results HTML
      sidebar.innerHTML = this.getSidebarHTML();
      
      // Append to the document body or a specific container
      document.body.appendChild(sidebar);
    }
  },
  
  getSidebarHTML() {
    return `
      <div class="isochrone-branding">
        <span class="isochrone-title">Network Rail Site Fit</span>
        <img src="00-data/assets/DT_Logo.png" alt="DT Logo" class="isochrone-logo" />
      </div>
      <div class="isochrone-container">
        <div class="isochrone-controls">
          <div class="duration-display">
            <span>Walking time: <strong id="duration-value">15 minutes</strong></span>
          </div>
          <div class="slider-container">
            <span>5m</span>
            <input type="range" id="duration-slider" min="5" max="30" step="5" value="15">
            <span>30m</span>
          </div>
        </div>
        <div id="isochrone-area" class="area-message"></div>
        <div id="isochrone-status" class="status-message">
          Click on a plot to get the plot score.
        </div>
      </div>
    `;
  },

  
  setupMapLayers() {
    this.map.addSource('iso', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    
    this.map.addLayer({
      id: 'isoLayer',
      type: 'fill',
      source: 'iso',
      layout: {},
      paint: {
        'fill-color': '#FF725A',
        'fill-opacity': 0.3,
      }
    });

    this.map.addLayer({
      id: 'isoLayer-outline',
      type: 'line',
      source: 'iso',
      layout: {},
      paint: {
        'line-color': '#FF725A',
        'line-width':2,
      }
    });
  },
  

  setupEventListeners() {
    const slider = document.getElementById('duration-slider');
    
    slider.addEventListener('input', (event) => {
      this.minutes = parseInt(event.target.value);
      document.getElementById('duration-value').textContent = `${this.minutes} minutes`;
      
      if (this.marker.getLngLat()) {
        this.getIso();
      }
    });
  },
  

  
  handleFeatureSelection(feature) {
    let coordinates;

    if (feature.geometry.type === 'Point') {
      coordinates = feature.geometry.coordinates;
    } else if (feature.geometry.type === 'Polygon') {
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

    this.marker.setLngLat(coordinates).addTo(this.map);

    const featureName = feature.properties.name || `Feature #${feature.properties.id}`;
    const statusElement = document.getElementById('isochrone-status');
    if (statusElement) {
      statusElement.textContent = `Selected: ${featureName}`;
    }

    // Calculate area if not present
    let area = feature.properties.area;
    if (
      (typeof area === 'undefined' || area === null || isNaN(area)) &&
      feature.geometry.type === 'Polygon'
    ) {
      // Use Turf.js to calculate area in square meters
      area = turf.area(feature);
      // Optionally, you can set it back to the feature for future use:
      // feature.properties.area = area;
    }

    // Debug: log the area
    console.log('Calculated area (sqm):', area);

  const areaElement = document.getElementById('isochrone-area');
  if (areaElement) {
    if (typeof area !== 'undefined' && area !== null && !isNaN(area)) {
      let areaText = '';
      if (area > 10000) {
        areaText = `${Math.round(area / 10000)} ha`;
      } else {
        areaText = `${Math.round(area).toLocaleString()} m²`;
      }
      areaElement.innerHTML = `<strong>Area:</strong> ${areaText}`;
    } else {
      areaElement.innerHTML = '';
      console.log('Area property is missing or invalid for this feature.');
    }
  }

    this.getIso();
  },
  async getIso() {
    const lngLat = this.marker.getLngLat();
    const urlBase = 'https://api.mapbox.com/isochrone/v1/mapbox/';
    const url = `${urlBase}${this.profile}/${lngLat.lng},${lngLat.lat}?contours_minutes=${this.minutes}&denoise=0.2&polygons=true&access_token=${mapboxgl.accessToken}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (this.map.getSource('iso')) {
      this.map.getSource('iso').setData(data);
      
      if (data.features && data.features.length > 0) {
        this.analyzeDatazonesWithinIsochrone(data.features[0]);
      }
    }
  },
  
  analyzeDatazonesWithinIsochrone(isochroneFeature) {
    const datazonesSource = this.map.getSource('datazones');
    if (!datazonesSource) return;
    
    const datazones = this.map.querySourceFeatures('datazones');
    if (!datazones || datazones.length === 0) return;
    
    this.datazonesWithinIsochrone = [];
    
    const isochronePolygon = isochroneFeature.geometry.coordinates[0];
    if (!isochronePolygon || !Array.isArray(isochronePolygon)) return;
    
    const datazonesWithin = datazones.filter(datazone => {
      if (!datazone || !datazone.geometry || !datazone.geometry.coordinates) return false;
      
      const centroid = this.calculateCentroid(datazone);
      if (!centroid) return false;
      
      return this.pointInPolygon(centroid, isochronePolygon);
    });
    
    this.datazonesWithinIsochrone = datazonesWithin;
    
    if (this.map.getSource('datazones-within')) {
      this.map.getSource('datazones-within').setData({
        type: 'FeatureCollection',
        features: datazonesWithin
      });
    }
    
    this.calculateDatazoneStatistics();
  },
  
  calculateCentroid(feature) {
    if (!feature || !feature.geometry || feature.geometry.type !== 'Polygon') return null;
    
    const coordinates = feature.geometry.coordinates[0];
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length === 0) return null;
    
    let sumX = 0, sumY = 0;
    
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
  },
  
  pointInPolygon(point, polygon) {
    if (!point || !Array.isArray(point) || point.length < 2) return false;
    if (!polygon || !Array.isArray(polygon) || polygon.length < 3) return false;
    
    let inside = false;
    const x = point[0];
    const y = point[1];
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
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
  },
  
  calculateDatazoneStatistics() {
    const zones = this.datazonesWithinIsochrone || [];

    if (!zones.length) {
      this.updateStatisticsDisplay('No datazones found within this walking distance');
      return;
    }

    const categories = [
      {
        heading: 'Eradicating Child Poverty',
        metrics: [
          { key: 'HEALTH OUTCOMES',
            label: 'Health Outcomes',
            format: (sum, count) => count > 0 ? (sum/count).toFixed(1) + ' % of Population Prescribed Drugs for anxiety ' : 'N/A'
          },
          { key: 'CHILDREN IN FAMILIES WITH LIMITED RESOURCES',
            label: 'Children in Families with Limited Resources',
            format: (sum, count) => count > 0 ? (sum/count).toFixed(1) + ' % of Children ' : 'N/A'
          },
          { key: 'CHILD BENEFIT',
            label: 'Child Benefit',
            format: (sum, count) => count > 0 ? sum.toFixed(0) + ' Children Count ' : 'N/A'
          },
        ]
      },
      {
        heading: 'Growing the Economy',
        metrics: [
          { key: 'INDEX OF MULTIPLE DEPRIVATION',
            label: 'Income Indicators',
            format: (sum, count) => count>0 ? (sum/count).toFixed(1) + ' % of People ' : 'N/A'
          },
          { key: 'BUSINESS DEMOGRAPHY',
            label: 'Business Demography (Survival)',
            format: (sum, count) => count>0 ? (sum/count).toFixed(2) + ' Business Survival Rate ' : 'N/A'
          },
          { key: 'ECONOMIC ACTIVITY',
            label: 'Economic Activity / Inactivity',
            format: (sum, count) => count>0 ? (sum/count).toFixed(1) + ' % of Population ' : 'N/A'
          },
          { key: 'HOUSE SALES PRICE',
            label: 'House Sale Prices',
            format: (sum, count) => count>0 ? '£' + Math.round(sum/count).toLocaleString() : 'N/A'
          },
          { key: 'EARNINGS',
            label: 'Earnings',
            format: (sum, count) => count>0 ? '£'+(sum/count).toFixed(0) : 'N/A'
          },
          { key: 'UNDEREMPLOYMENT',
            label: 'Underemployment',
            format: (sum, count) => count>0 ? (sum/count).toFixed(1)+' % of People Employed ' : 'N/A'
          },
        ]
      },
      {
        heading: 'Tackling the Climate Emergency',
        metrics: [
          { key: 'CAR OWNERSHIP',
            label: 'Car Ownership',
            format: (sum, count) => count>0 ? (sum/count).toFixed(0)+' % of Households ' : 'N/A'
          },
          { key: 'HOUSING QUALITY',
            label: 'Housing Quality',
            format: (sum, count) => count>0 ? (sum/count).toFixed(1) + ' % of Dwellings ' : 'N/A'
          },
          { key: 'ENERGY CONSUMPTION',
            label: 'Energy Consumption',
            format: (sum, count) => count>0 ? Math.round(sum/count).toLocaleString() + ' GWh ' : 'N/A'
          },
          { key: 'POPULATION ESTIMATES',
            label: 'Population Estimates',
            format: (sum, count) => count>0 ? Math.round(sum).toLocaleString() + ' Population Count ' : 'N/A'
          },
        ]
      },
      {
        heading: 'Ensuring High Quality and Sustainable Public Services',
        metrics: [
          { key: 'LOCAL SERVICE SATISFACTION',
            label: 'Local Service Satisfaction',
            format: (sum, count) => count>0 ? (sum/count).toFixed(1) + ' % of Satisfied Adults ' : 'N/A'
          },
          { key: 'ACCESS TO PUBLIC TRANSPORT',
            label: 'Access to Public Transport',
            format: (sum, count) => count>0 ? (sum/count).toFixed(1) + ' % of Satisfied Adults ' : 'N/A'
          },
          { key: 'BUS ACCESSIBILITY',
            label: 'Bus Accessibility',
            format: (sum, count) => count>0 ? (sum/count).toFixed(2) + ' Count of Busses during Weekdays ' : 'N/A'
          },
          { key: 'GEOGRAPHIC ACCESS TO SERVICES INDICATOR',
            label: 'Geographic Access to Services',
            format: (sum, count) => count>0 ? (sum/count).toFixed(1) + ' Travel time to GPs in Minutes ' : 'N/A'
          },
        ]
      }
    ];

    const stats = {};
    categories.forEach(cat =>
      cat.metrics.forEach(m => {
        stats[m.key] = { total: 0, count: 0 };
      })
    );

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

    const scoreData = this.calculatePlotScores(zones, categories);
    
    let html = this.getResultsHTML(zones, this.minutes, stats, categories, scoreData);

    this.updateStatisticsDisplay(html);
  },

  getResultsHTML(zones, minutes, stats, categories, scoreData) {
    return `
      <div class="isochrone-results">
        <div class="summary-section">
          <h2>Plot Analysis</h2>
          <p><strong>${zones.length}</strong> datazones within ${minutes} min walk</p>
        </div>
        <div class="score-section">
          <h3>Plot Scores</h3>
          <div class="total-score">
            <div class="score-label">Overall Plot Score</div>
            <div class="score-bar-container">
              <div class="score-bar overall-score" style="width: ${scoreData.overallScore * 100}%"></div>
              <div class="score-value">${(scoreData.overallScore * 100).toFixed(1)}%</div>
            </div>
          </div>
          
          <div class="category-scores-header">Category Scores:</div>
          <div class="category-scores">
            ${this.getCategoryScoresHTML(scoreData)}
          </div>
        </div>
        
        <div class="metrics-section">
          <details>
            <summary>View Detailed Metrics</summary>
            <div class="metrics-content">
              ${this.getCategoryDetailsHTML(categories, stats)}
            </div>
          </details>
        </div>
      </div>
    `;
  },
  
  getCategoryScoresHTML(scoreData) {
    let html = '';
    
    Object.keys(scoreData.categoryScores).forEach(key => {
      const category = scoreData.categoryScores[key];
      if (category.count > 0) {
        const categoryName = key.replace(/_/g, ' ');
        const scorePercentage = (category.score * 100).toFixed(1);
        
        let colorClass = 'medium-score';
        if (category.score >= 0.7) colorClass = 'high-score';
        if (category.score < 0.4) colorClass = 'low-score';
        
        html += `
          <div class="category-score">
            <div class="score-label">${categoryName}</div>
            <div class="score-bar-container">
              <div class="score-bar ${colorClass}" style="width: ${scorePercentage}%"></div>
              <div class="score-value">${scorePercentage}%</div>
            </div>
          </div>
        `;
      }
    });
    
    return html;
  },
  
  getCategoryDetailsHTML(categories, stats) {
    let html = '';
    
    categories.forEach(cat => {
      html += `
        <details class="category-details">
          <summary>${cat.heading}</summary>
          <div class="metrics-list">
      `;
      
      cat.metrics.forEach(m => {
        const { total, count } = stats[m.key];
        html += `<div><strong>${m.label}:</strong> ${m.format(total, count)}</div>`;
      });
      
      html += `
          </div>
        </details>
      `;
    });
    
    return html;
  },

  updateStatisticsDisplay(html) {
    const statusElement = document.getElementById('isochrone-status');
    if (statusElement) {
      statusElement.innerHTML = html;
    }
  },
  
  calculatePlotScores(zones, categories) {
    if (!zones.length) {
      return {
        overallScore: 0,
        categoryScores: {}
      };
    }
    
    const negativeImpactMetrics = [
      'norm_CHILDREN IN FAMILIES WITH LIMITED RESOURCES',
      'norm_INDEX OF MULTIPLE DEPRIVATION',
      'norm_ENERGY CONSUMPTION',
      'norm_CHILD BENEFIT',
      'norm_HEALTH OUTCOMES',
      'norm_GEOGRAPHIC ACCESS TO SERVICES INDICATOR',
    ];
    
    const categoryScores = {};
    let totalScore = 0;
    let totalMetricsCount = 0;
    
    categories.forEach(category => {
      const categoryKey = category.heading.replace(/\s+/g, '_');
      categoryScores[categoryKey] = {
        score: 0,
        count: 0,
        metrics: []
      };
      
      category.metrics.forEach(metric => {
        const normKey = `norm_${metric.key}`;
        let metricSum = 0;
        let metricCount = 0;
        
        zones.forEach(zone => {
          const props = zone.properties || {};
          const normValue = parseFloat(props[normKey]);
          
          if (!isNaN(normValue)) {
            metricSum += normValue;
            metricCount++;
          }
        });
        
        if (metricCount > 0) {
          const avgValue = metricSum / metricCount;
          const isNegative = negativeImpactMetrics.includes(normKey);
          const metricScore = isNegative ? (1 - avgValue) : avgValue;
          
          categoryScores[categoryKey].score += metricScore;
          categoryScores[categoryKey].count++;
          categoryScores[categoryKey].metrics.push({
            name: metric.label,
            score: metricScore,
            isNegative
          });
          
          totalScore += metricScore;
          totalMetricsCount++;
        }
      });
      
      if (categoryScores[categoryKey].count > 0) {
        categoryScores[categoryKey].score = categoryScores[categoryKey].score / categoryScores[categoryKey].count;
      }
    });
    
    const overallScore = totalMetricsCount > 0 ? totalScore / totalMetricsCount : 0;
    
    return {
      overallScore,
      categoryScores
    };
  }
};

export default SimpleIsochrone;