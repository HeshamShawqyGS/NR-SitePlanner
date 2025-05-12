// Map interactions module
const MapInteractions = {
  // Store registered click handlers for different layers
  clickHandlers: {},
  
  // Initialize interactions for the map
  init(map) {
    this.map = map;
    
    // Generic click handler that delegates to registered handlers
    map.on('click', e => {
      // Get features at click point
      const features = map.queryRenderedFeatures(e.point);
      
      if (features.length > 0) {
        // Find the topmost feature's layer
        const layerId = features[0].layer.id;
        
        // If we have a handler for this layer, call it
        if (this.clickHandlers[layerId]) {
          this.clickHandlers[layerId](e, features[0], map);
        }
      }
    });
    
    return this;
  },
  
  // Register a click handler for a specific layer
  registerClickHandler(layerId, handler) {
    this.clickHandlers[layerId] = handler;
    
    // Set up hover effect for this layer
    this.setupHoverEffect(layerId);
    
    return this;
  },
  
  // Setup hover effect for a specific layer
  setupHoverEffect(layerId) {
    const map = this.map;
    
    // Remove any existing listeners to prevent duplicates
    map.off('mouseenter', layerId);
    map.off('mouseleave', layerId);
    
    // Add hover effect
    map.on('mouseenter', layerId, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    
    map.on('mouseleave', layerId, () => {
      map.getCanvas().style.cursor = '';
    });
  },
  
  // Predefined handlers
  handlers: {
    // Show popup with feature info
    showPopup(e, feature, map) {
      const props = feature.properties;
      
      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`<h3>${props.name || 'Feature ID: ' + props.id}</h3>`)
        .addTo(map);
    },
    
    

    // Zoom to feature
    zoomToFeature(e, feature, map) {
      const zoom_value = 14;
      // For point features
      if (feature.geometry.type === 'Point') {
        map.flyTo({
          center: feature.geometry.coordinates,
          zoom: zoom_value,
          duration: 1000
        });
      } 
      // For polygon features
      else if (feature.geometry.type === 'Polygon') {
        // Calculate center of the polygon
        const coordinates = feature.geometry.coordinates[0];
        let centerLng = 0;
        let centerLat = 0;
        
        // Average all coordinates to find the center
        coordinates.forEach(coord => {
          centerLng += coord[0];
          centerLat += coord[1];
        });
        
        centerLng /= coordinates.length;
        centerLat /= coordinates.length;
        
        // Use the same flyTo approach as for points
        map.flyTo({
          center: [centerLng, centerLat],
          zoom: zoom_value,
          duration: 1000
        });
      }
    },
    
    // Combined handler: show popup and zoom
    showPopupAndZoom(e, feature, map) {
      // MapInteractions.handlers.showPopup(e, feature, map);
      MapInteractions.handlers.zoomToFeature(e, feature, map);
    }
  }
};

export default MapInteractions;