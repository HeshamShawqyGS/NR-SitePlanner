
import MapInteractions from './map-interactions.js';
import SidebarModule from './sidebar-module.js';

// Static Map for displaying pre-scored empty lands
const StaticMap = {
  init() {
    // Initialize map
    const mapboxToken = 'pk.eyJ1IjoiaGVzaGFtc2hhd3F5IiwiYSI6ImNrdnBvY2UwcTFkNDkzM3FmbTFhenM0M3MifQ.ZqIuL9khfbCyOF3DU_IH5w';
    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/heshamshawqy/cm8yshq5b003p01qrfxz94kyd',
      center: [-4.2518, 55.8642],
      zoom: 12
    });

    this.map = map;
    
    // Track selected feature
    this.selectedLandId = null;
    
    // Initialize sidebar
    this.sidebar = SidebarModule.init({
      id: 'static-map-sidebar',
      title: 'Network Rail Site Fit',
      logoPath: '00-data/assets/DT_Logo.png',
      defaultMessage: 'Click on a plot to view its score.',
      hasControls: false // No isochrone controls needed for static map
    });
    
    // Add Mapbox Geocoder control for searching
    const geocoder = new MapboxGeocoder({
      accessToken: mapboxgl.accessToken,
      mapboxgl: mapboxgl,
      marker: false
    });

    // Load data when map is ready
    map.on('load', async () => {
      map.addControl(geocoder, 'bottom-left');
      map.addControl(new mapboxgl.NavigationControl());
      
      // Initialize the interaction system
      const interactions = MapInteractions.init(map);
      
      // Load the pre-scored empty lands data
      await this.loadScoredEmptyLands();
      
      // Register click handler for the scored lands
      interactions.registerClickHandler('scored-lands-fill', (e, feature, map) => {
        // Show popup and zoom
        MapInteractions.handlers.showPopupAndZoom(e, feature, map);
        
        // Highlight the selected land
        this.highlightSelectedLand(feature);
        
        // Display the feature's score in the sidebar
        this.displayFeatureScore(feature);
      });
    });
    
    return this;
  },
  
  async loadScoredEmptyLands() {
    try {
      // Load the pre-scored GeoJSON file
      const response = await fetch('./00-data/geojson/scored-empty-lands.geojson');
      if (!response.ok) {
        throw new Error(`Failed to load scored empty lands: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log("Scored empty lands loaded:", data);
      
      // Add the scored lands source
      this.map.addSource('scored-lands', {
        type: 'geojson',
        data: data
      });
      
      // Add fill layer
      this.map.addLayer({
        id: 'scored-lands-fill',
        type: 'fill',
        source: 'scored-lands',
        paint: {
          // Use feature-state for dynamic highlighting
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#66FF99', // Highlight color
            // Color by overall score
            [
              'interpolate',
              ['linear'],
              ['get', 'overallScore'],
              0.3, '#FF0000', // Low score (red)
              0.5, '#FFFF00', // Medium score (yellow)
              0.6, '#00FF00'  // High score (green)
            ]
          ],
          'fill-opacity': 0.6,
          'fill-outline-color': '#000000'
        }
      });
      
      // Add outline layer for better visibility
      this.map.addLayer({
        id: 'scored-lands-outline',
        type: 'line',
        source: 'scored-lands',
        paint: {
          'line-color': '#000000',
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            2, // Wider line for selected feature
            0.5 // Default line width
          ]
        }
      });
      
      // Add legend
      this.addMapLegend();
      
    } catch (error) {
      console.error("Error loading scored empty lands:", error);
      this.sidebar.updateStatus(`<div class="error-message">Error loading data: ${error.message}</div>`);
    }
  },
  
  addMapLegend() {
    // Create a legend container
    const legend = document.createElement('div');
    legend.className = 'map-legend';
    legend.innerHTML = `
      <h4>Plot Score</h4>
      <div class="legend-item">
        <span class="legend-color" style="background-color: #00FF00;"></span>
        <span class="legend-label">High (100%)</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background-color: #FFFF00;"></span>
        <span class="legend-label">Medium (50%)</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background-color: #FF0000;"></span>
        <span class="legend-label">Low (0%)</span>
      </div>
    `;
    
    // Add legend to the map
    this.map.getContainer().appendChild(legend);
  },
  
  highlightSelectedLand(feature) {
    // First, remove the highlight from the previously selected land
    if (this.selectedLandId !== null) {
      this.map.setFeatureState(
        { source: 'scored-lands', id: this.selectedLandId },
        { selected: false }
      );
    }
    
    // Highlight the newly selected land
    this.selectedLandId = feature.id;
    this.map.setFeatureState(
      { source: 'scored-lands', id: this.selectedLandId },
      { selected: true }
    );
  },
  
  displayFeatureScore(feature) {
    // Basic feature info
    const featureName = feature.properties.name || `Plot #${feature.id}`;
    const landUse = feature.properties.landuse || 'Unknown';
    
    // Format area information
    let area = feature.properties.area;
    if (!area && feature.geometry.type === 'Polygon') {
      area = turf.area(feature);
    }
    
    // Pass the feature to the sidebar module
    this.sidebar.displayFeatureInfo(feature);
    
    // Create structured category scores with all data from the feature properties
    const structuredCategoryScores = this.createStructuredCategoryScores(feature.properties);
    
    // Extract score data and display it
    const scoreData = {
      overallScore: feature.properties.overallScore || 0,
      categoryScores: structuredCategoryScores,
      datazonesCount: feature.properties.datazonesCount
    };
    
    // Display the scores in the sidebar
    this.sidebar.displayPlotScores(scoreData);
  },
  
  createStructuredCategoryScores(properties) {
    // Define the category names as they appear in the properties
    const categoryNames = [
      'Eradicating_Child_Poverty',
      'Growing_the_Economy',
      'Tackling_the_Climate_Emergency',
      'Ensuring_High_Quality_and_Sustainable_Public_Services'
    ];
    
    const structuredScores = {};
    
    // Process each category
    categoryNames.forEach(categoryKey => {
      // Get the category score from properties
      let categoryScore = properties[categoryKey];
      
      // If the category score is a string (likely JSON), parse it
      if (typeof categoryScore === 'string') {
        try {
          categoryScore = JSON.parse(categoryScore);
        } catch (e) {
          console.error(`Error parsing category score for ${categoryKey}:`, e);
          categoryScore = { score: parseFloat(categoryScore) || 0 };
        }
      } 
      // If the category score is a number, create a simple object
      else if (typeof categoryScore === 'number') {
        categoryScore = { score: categoryScore };
      }
      // If undefined or null, create an empty object with zero score
      else if (!categoryScore) {
        categoryScore = { score: 0 };
      }
      
      // Ensure we have a count property (needed by sidebar module)
      if (typeof categoryScore.count === 'undefined') {
        categoryScore.count = 1; // At least one metric
      }
      
      // Create metrics array if it doesn't exist
      if (!Array.isArray(categoryScore.metrics)) {
        categoryScore.metrics = this.extractMetricsForCategory(categoryKey, properties);
      }
      
      structuredScores[categoryKey] = categoryScore;
    });
    
    return structuredScores;
  },
  
  extractMetricsForCategory(categoryKey, properties) {
    // Map of categories to their relevant metrics
    const categoryMetricMapping = {
      'Eradicating_Child_Poverty': [
        { key: 'HEALTH OUTCOMES', isNegative: true },
        { key: 'CHILDREN IN FAMILIES WITH LIMITED RESOURCES', isNegative: true },
        { key: 'CHILD BENEFIT', isNegative: true }
      ],
      'Growing_the_Economy': [
        { key: 'INDEX OF MULTIPLE DEPRIVATION', isNegative: true },
        { key: 'BUSINESS DEMOGRAPHY', isNegative: false },
        { key: 'ECONOMIC ACTIVITY', isNegative: false },
        { key: 'HOUSE SALES PRICE', isNegative: false },
        { key: 'EARNINGS', isNegative: false },
        { key: 'UNDEREMPLOYMENT', isNegative: false }
      ],
      'Tackling_the_Climate_Emergency': [
        { key: 'CAR OWNERSHIP', isNegative: false },
        { key: 'HOUSING QUALITY', isNegative: false },
        { key: 'ENERGY CONSUMPTION', isNegative: true },
        { key: 'POPULATION ESTIMATES', isNegative: false }
      ],
      'Ensuring_High_Quality_and_Sustainable_Public_Services': [
        { key: 'LOCAL SERVICE SATISFACTION', isNegative: false },
        { key: 'ACCESS TO PUBLIC TRANSPORT', isNegative: false },
        { key: 'BUS ACCESSIBILITY', isNegative: false },
        { key: 'GEOGRAPHIC ACCESS TO SERVICES INDICATOR', isNegative: true }
      ]
    };
    
    // Create labels mapping for more readable display
    const metricLabels = {
      'HEALTH OUTCOMES': 'Health Outcomes',
      'CHILDREN IN FAMILIES WITH LIMITED RESOURCES': 'Children in Families with Limited Resources',
      'CHILD BENEFIT': 'Child Benefit',
      'INDEX OF MULTIPLE DEPRIVATION': 'Income Indicators',
      'BUSINESS DEMOGRAPHY': 'Business Demography (Survival)',
      'ECONOMIC ACTIVITY': 'Economic Activity / Inactivity',
      'HOUSE SALES PRICE': 'House Sale Prices',
      'EARNINGS': 'Earnings',
      'UNDEREMPLOYMENT': 'Underemployment',
      'CAR OWNERSHIP': 'Car Ownership',
      'HOUSING QUALITY': 'Housing Quality',
      'ENERGY CONSUMPTION': 'Energy Consumption',
      'POPULATION ESTIMATES': 'Population Estimates',
      'LOCAL SERVICE SATISFACTION': 'Local Service Satisfaction',
      'ACCESS TO PUBLIC TRANSPORT': 'Access to Public Transport',
      'BUS ACCESSIBILITY': 'Bus Accessibility',
      'GEOGRAPHIC ACCESS TO SERVICES INDICATOR': 'Geographic Access to Services'
    };
    
    const metrics = [];
    
    // Get metric definitions for this category
    const categoryMetrics = categoryMetricMapping[categoryKey] || [];
    
    // Extract and format each metric
    categoryMetrics.forEach(metricDef => {
      const key = metricDef.key;
      const normKey = `norm_${key}`;
      const label = metricLabels[key] || key;
      
      // Get the normalized score (0-1) and raw value
      const normValue = parseFloat(properties[normKey]);
      const rawValue = parseFloat(properties[key]);
      
      if (!isNaN(normValue) && !isNaN(rawValue)) {
        // Calculate score based on whether it's a negative impact metric
        let score = metricDef.isNegative ? 1 - normValue : normValue;
        
        metrics.push({
          name: label,
          score: score,
          isNegative: metricDef.isNegative,
          rawValue: rawValue
        });
      }
    });
    
    return metrics;
  }
};

// Initialize the static map on page load
document.addEventListener('DOMContentLoaded', () => {
  StaticMap.init();
});

export default StaticMap;
