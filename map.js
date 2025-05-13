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

// Track selected feature ids for each layer
let selectedEmptyLandId = null;
let selectedStationId = null;

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
      'fill-opacity': 0.1,
      'fill-outline-color': '#FF33CC'
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
      // Use feature-state for dynamic coloring
      'fill-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#FFD700', // Highlight color (gold/yellow)
        '#FF33CC'  // Default color
      ],
      'fill-opacity': 0.4,
      'fill-outline-color': '#FF33CC'
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
      // Use feature-state for dynamic coloring
      'circle-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#FFD700', // Highlight color (gold/yellow)
        '#6666CC'  // Default color
      ],
      'circle-radius': 6,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff'
    }
  });

  // Register click handlers for different layers with isochrone functionality
  interactions
    .registerClickHandler('empty-lands-fill', (e, feature, map) => {
      // Show popup and zoom
      MapInteractions.handlers.showPopupAndZoom(e, feature, map);

      // Highlight the selected empty land
      if (selectedEmptyLandId !== null) {
        map.setFeatureState(
          { source: 'empty-lands', id: selectedEmptyLandId },
          { selected: false }
        );
      }
      selectedEmptyLandId = feature.id;
      map.setFeatureState(
        { source: 'empty-lands', id: selectedEmptyLandId },
        { selected: true }
      );

      // Generate isochrone for the selected feature
      isochrone.handleFeatureSelection(feature);
    })
    .registerClickHandler('railway-stations-circle', (e, feature, map) => {
      // Show popup and zoom
      MapInteractions.handlers.showPopupAndZoom(e, feature, map);

      // Highlight the selected railway station
      if (selectedStationId !== null) {
        map.setFeatureState(
          { source: 'railway-stations', id: selectedStationId },
          { selected: false }
        );
      }
      selectedStationId = feature.id;
      map.setFeatureState(
        { source: 'railway-stations', id: selectedStationId },
        { selected: true }
      );

      // Generate isochrone for the selected feature
      isochrone.handleFeatureSelection(feature);
    });
});