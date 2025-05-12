import { fetch_empty_landsData, fetch_railway_stations, fetch_datazones } from './map-data.js';
import MapInteractions from './map-interactions.js';
import SimpleIsochrone from './isochrone.js';

// Initialize map
const mapboxToken = 'pk.eyJ1IjoiaGVzaGFtc2hhd3F5IiwiYSI6ImNrdnBvY2UwcTFkNDkzM3FmbTFhenM0M3MifQ.ZqIuL9khfbCyOF3DU_IH5w';
mapboxgl.accessToken = mapboxToken;

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/heshamshawqy/cm8yshq5b003p01qrfxz94kyd',
  center: [-4.2518, 55.8642],
  zoom: 12
});

// Load data when map is ready
map.on('load', async () => {
  // Initialize the interaction system
  const interactions = MapInteractions.init(map);
  
  // Initialize the isochrone handler
  const isochrone = SimpleIsochrone.init(map);
  
  // Fetch all data in parallel
  const [landsData, stationsData, datazonesData] = await Promise.all([
    fetch_empty_landsData(),
    fetch_railway_stations(),
    fetch_datazones()
  ]);

  // Add datazones layer
  map.addSource('datazones', {
    type: 'geojson',
    data: datazonesData
  });
  map.addLayer({
    id: 'datazones-fill',
    type: 'fill',
    source: 'datazones',
    paint: {
      'fill-color': '#fff',
      'fill-opacity': 0.3,
      'fill-outline-color': '#FF7700'
    },
    layout: {
      visibility: 'visible'
    }
  }); 
  
  // Add empty lands layer
  map.addSource('empty-lands', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: landsData.elements.map(el => ({
        type: 'Feature',
        properties: { id: el.id, ...el.tags },
        geometry: {
          type: 'Polygon',
          coordinates: [el.geometry?.map(node => [node.lon, node.lat])]
        }
      })).filter(f => f.geometry.coordinates[0]?.length > 0)
    }
  });
  map.addLayer({
    id: 'empty-lands-fill',
    type: 'fill',
    source: 'empty-lands',
    paint: {
      'fill-color': '#FF9900',
      'fill-opacity': 0.5,
      'fill-outline-color': '#FF7700'
    }
  });
  
  // Add railway stations layer
  map.addSource('railway-stations', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: stationsData.elements.map(el => ({
        type: 'Feature',
        properties: { id: el.id, name: el.tags?.name || 'Unnamed', ...el.tags },
        geometry: {
          type: 'Point',
          coordinates: [el.lon, el.lat]
        }
      }))
    }
  });
  map.addLayer({
    id: 'railway-stations-circle',
    type: 'circle',
    source: 'railway-stations',
    paint: {
      'circle-radius': 6,
      'circle-color': '#4264fb',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff'
    }
  });
  
  // Register click handlers for different layers with isochrone functionality
  interactions
    .registerClickHandler('empty-lands-fill', (e, feature, map) => {
      // Show popup and zoom
      MapInteractions.handlers.showPopupAndZoom(e, feature, map);
      
      // Generate isochrone for the selected feature
      isochrone.handleFeatureSelection(feature);
    })
    .registerClickHandler('railway-stations-circle', (e, feature, map) => {
      // Show popup and zoom
      MapInteractions.handlers.showPopupAndZoom(e, feature, map);
      
      // Generate isochrone for the selected feature
      isochrone.handleFeatureSelection(feature);
    });
});