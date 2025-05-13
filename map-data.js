// Define the bounding zone as a string in the format needed by Overpass API
const osm_bounding_zone = "(55.5,-4.8,56.0,-2.8)";

async function fetch_empty_landsData() {

    // Query for empty lands in Glasgow area
    const overpassQuery = `
    [out:json];
    (
    // Railway-related and disused/abandoned lands
    way["railway"]["disused"="yes"]${osm_bounding_zone};
    way["landuse"="railway"]${osm_bounding_zone};
    way["disused"="yes"]${osm_bounding_zone};
    way["abandoned"="yes"]${osm_bounding_zone};
    way["abandoned:landuse"]${osm_bounding_zone};
    way["disused:landuse"]${osm_bounding_zone};

    // Brownfield, greenfield, vacant, construction, landfill, etc.
    way["landuse"~"brownfield|greenfield|vacant|construction|landfill"]${osm_bounding_zone};
    way["brownfield"="yes"]${osm_bounding_zone};
    way["vacant"="yes"]${osm_bounding_zone};

    // Other possibly empty/unused lands
    // way["landuse"~"industrial|military|recreation_ground|allotments|cemetery"]${osm_bounding_zone};
    // way["leisure"="park"]${osm_bounding_zone};
    // way["amenity"="parking"]${osm_bounding_zone};
    // way["surface"="unpaved"]${osm_bounding_zone};

    // Network Rail properties
    // way["operator"~"Network Rail|network rail"]${osm_bounding_zone};
    // way["owner"~"Network Rail|network rail"]${osm_bounding_zone};

    // Also search for nodes and relations
    // node["landuse"~"brownfield|greenfield|vacant|construction|landfill"]${osm_bounding_zone};
    // relation["landuse"~"brownfield|greenfield|vacant|construction|landfill"]${osm_bounding_zone};
    );
    out geom;
    `;
    
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
    const response = await fetch(url);
    const data = await response.json();
    console.log("Empty lands data received:", data);
    
    return data;
}

async function fetch_railway_stations() {
    // Query for railway stations in Glasgow area
    const stationsQuery = `
        [out:json];
        (
            node["railway"="station"]${osm_bounding_zone};
        );
        out geom;
    `;
    
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(stationsQuery)}`;
    const response = await fetch(url);
    const data = await response.json();
    console.log("Railway stations data received:", data);
    
    return data;
}

async function fetch_datazones() {
    try {
        // Path to the GeoJSON file
        const filePath = './00-data/geojson/datazones2011_data_normalized.geojson';
        
        // Fetch the file
        const response = await fetch(filePath);
        
        // Check if the response is ok
        if (!response.ok) {
            throw new Error(`Failed to load datazones: ${response.status} ${response.statusText}`);
        }
        
        // Parse the JSON
        const data = await response.json();
        console.log("Datazones data loaded:", data);
        
        return data;
    } catch (error) {
        console.error("Error loading datazones data:", error);
        throw error;
    }
}

// Export the functions to be used in other files
export {
    fetch_empty_landsData,
    fetch_railway_stations,
    fetch_datazones,
};