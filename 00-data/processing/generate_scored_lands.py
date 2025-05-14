import os
import json
import time
import requests
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point, Polygon, shape
from shapely.ops import transform
import pyproj
from functools import partial
import numpy as np
from tqdm import tqdm
import multiprocessing
from concurrent.futures import ProcessPoolExecutor, as_completed

def query_overpass_api(osm_bounding_zone="55.5,-4.8,56.0,-2.8"):
    """
    Query Overpass API for empty lands in the specified bounding box.
    
    Args:
        bbox (str): Bounding box in format "south,west,north,east"
    
    Returns:
        dict: JSON response from Overpass API
    """
    print("Querying Overpass API for empty lands...")
    
    # Overpass query for empty lands (landuse=brownfield, landuse=vacant, etc.)
    overpass_query = f"""
    [out:json][timeout:300];
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

        // Network Rail properties
        way["operator"~"Network Rail|network rail"]${osm_bounding_zone};
        way["owner"~"Network Rail|network rail"]${osm_bounding_zone};

        // Also search for nodes and relations
        node["landuse"~"brownfield|greenfield|vacant|construction|landfill"]${osm_bounding_zone};
        relation["landuse"~"brownfield|greenfield|vacant|construction|landfill"]${osm_bounding_zone};
        );
    out body;
    >;
    out skel qt;
    """
    
    # Make the request to Overpass API
    response = requests.post(
        "https://overpass-api.de/api/interpreter",
        data={"data": overpass_query}
    )
    
    if response.status_code != 200:
        raise Exception(f"Overpass API request failed with status code {response.status_code}")
    
    return response.json()

def convert_osm_to_geojson(osm_data):
    """
    Convert OSM data to GeoJSON format.
    
    Args:
        osm_data (dict): OSM data from Overpass API
    
    Returns:
        dict: GeoJSON FeatureCollection
    """
    print("Converting OSM data to GeoJSON...")
    
    # Extract ways and their nodes
    nodes = {}
    for element in osm_data["elements"]:
        if element["type"] == "node":
            nodes[element["id"]] = (element["lon"], element["lat"])
    
    # Create GeoJSON features
    features = []
    
    for element in osm_data["elements"]:
        if element["type"] == "way" and "tags" in element and "nodes" in element:
            # Get coordinates for the way
            coords = []
            for node_id in element["nodes"]:
                if node_id in nodes:
                    coords.append(nodes[node_id])
            
            # Skip ways with insufficient nodes
            if len(coords) < 3:
                continue
            
            # Ensure the polygon is closed
            if coords[0] != coords[-1]:
                coords.append(coords[0])
            
            # Create GeoJSON feature
            feature = {
                "type": "Feature",
                "id": element["id"],
                "properties": element.get("tags", {}),
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [coords]
                }
            }
            features.append(feature)
    
    return {
        "type": "FeatureCollection",
        "features": features
    }

def calculate_buffer_radius(minutes, speed_meters_per_minute=80):
    """
    Calculate buffer radius in meters based on walking time.
    
    Args:
        minutes (int): Walking time in minutes
        speed_meters_per_minute (int): Walking speed in meters per minute
    
    Returns:
        float: Buffer radius in meters
    """
    return minutes * speed_meters_per_minute

def calculate_plot_score(intersecting_datazones):
    """
    Calculate plot score based on intersecting datazones.
    
    Args:
        intersecting_datazones (GeoDataFrame): Datazones that intersect with the buffer
    
    Returns:
        dict: Score data with overall score and flattened metrics
    """
    # Define categories and metrics
    categories = [
        {
            "heading": "Eradicating_Child_Poverty",
            "metrics": [
                "HEALTH OUTCOMES",
                "CHILDREN IN FAMILIES WITH LIMITED RESOURCES",
                "CHILD BENEFIT"
            ]
        },
        {
            "heading": "Growing_the_Economy",
            "metrics": [
                "INDEX OF MULTIPLE DEPRIVATION",
                "BUSINESS DEMOGRAPHY",
                "ECONOMIC ACTIVITY",
                "HOUSE SALES PRICE",
                "EARNINGS",
                "UNDEREMPLOYMENT"
            ]
        },
        {
            "heading": "Tackling_the_Climate_Emergency",
            "metrics": [
                "CAR OWNERSHIP",
                "HOUSING QUALITY",
                "ENERGY CONSUMPTION",
                "POPULATION ESTIMATES"
            ]
        },
        {
            "heading": "Ensuring_High_Quality_and_Sustainable_Public_Services",
            "metrics": [
                "LOCAL SERVICE SATISFACTION",
                "ACCESS TO PUBLIC TRANSPORT",
                "BUS ACCESSIBILITY",
                "GEOGRAPHIC ACCESS TO SERVICES INDICATOR"
            ]
        }
    ]
    
    # Define metrics with negative impact (where higher values are worse)
    negative_impact_metrics = [
        "norm_CHILDREN IN FAMILIES WITH LIMITED RESOURCES",
        "norm_INDEX OF MULTIPLE DEPRIVATION",
        "norm_ENERGY CONSUMPTION",
        "norm_CHILD BENEFIT",
        "norm_HEALTH OUTCOMES",
        "norm_GEOGRAPHIC ACCESS TO SERVICES INDICATOR"
    ]
    
    if len(intersecting_datazones) == 0:
        return {
            "overallScore": 0,
            "datazonesCount": 0
        }
    
    # Initialize result dictionary
    result = {
        "overallScore": 0,
        "datazonesCount": len(intersecting_datazones)
    }
    
    # Initialize category scores
    category_scores = {}
    for category in categories:
        category_scores[category["heading"]] = {
            "score": 0,
            "count": 0
        }
    
    # Calculate scores for each metric
    total_score = 0
    total_metrics_count = 0
    
    # List of all metrics we want to include
    all_metrics = []
    for category in categories:
        all_metrics.extend(category["metrics"])
    
    # Add raw values for each metric
    for metric in all_metrics:
        norm_key = f"norm_{metric}"
        
        # Skip if the normalized metric doesn't exist in the dataframe
        if norm_key not in intersecting_datazones.columns:
            continue
        
        # Calculate average normalized value for this metric
        norm_values = intersecting_datazones[norm_key].dropna()
        
        # Get raw values if they exist
        if metric in intersecting_datazones.columns:
            raw_values = intersecting_datazones[metric].dropna()
            if len(raw_values) > 0:
                result[metric] = float(raw_values.mean())
        
        # Add normalized values
        if len(norm_values) > 0:
            result[norm_key] = float(norm_values.mean())
            
            # Calculate metric score for overall score
            is_negative = norm_key in negative_impact_metrics
            metric_score = (1 - result[norm_key]) if is_negative else result[norm_key]
            
            total_score += metric_score
            total_metrics_count += 1
            
            # Find which category this metric belongs to and update its score
            for category in categories:
                if metric in category["metrics"]:
                    cat_key = category["heading"]
                    category_scores[cat_key]["score"] += metric_score
                    category_scores[cat_key]["count"] += 1
                    break
    
    # Calculate overall score
    if total_metrics_count > 0:
        result["overallScore"] = float(total_score / total_metrics_count)
    
    # Calculate category scores and add them to the result
    for cat_key, cat_data in category_scores.items():
        if cat_data["count"] > 0:
            result[cat_key] = float(cat_data["score"] / cat_data["count"])
    
    # Add DataZone if available
    if "DataZone" in intersecting_datazones.columns:
        # Get the most common datazone
        result["DataZone"] = intersecting_datazones["DataZone"].value_counts().index[0]
    
    return result

def process_land_chunk(chunk_data):
    """
    Process a chunk of empty lands and calculate scores.
    
    Args:
        chunk_data (tuple): Tuple containing (chunk_df, datazones_gdf, buffer_radius, start_index)
    
    Returns:
        GeoDataFrame: Processed chunk with scores
    """
    chunk_df, datazones_gdf, buffer_radius, start_index = chunk_data
    
    # Create a spatial index for datazones
    datazones_sindex = datazones_gdf.sindex
    
    # Process each empty land in the chunk
    for i, (idx, row) in enumerate(chunk_df.iterrows()):
        # Add index ID
        chunk_df.at[idx, 'id'] = start_index + i
        
        # Calculate area in square meters if not present
        if 'area' not in chunk_df.columns:
            chunk_df.at[idx, 'area'] = int(row.geometry.area)
        
        # Calculate centroid
        centroid = row.geometry.centroid
        
        # Create buffer around centroid (simulating walking distance)
        buffer = centroid.buffer(buffer_radius)
        
        # Find datazones that intersect with this buffer using spatial index
        possible_matches_idx = list(datazones_sindex.intersection(buffer.bounds))
        
        if possible_matches_idx:
            possible_matches = datazones_gdf.iloc[possible_matches_idx]
            # Use vectorized operation for intersection test
            mask = possible_matches.intersects(buffer)
            intersecting_datazones = possible_matches[mask]
            
            # Calculate score based on these datazones
            score_data = calculate_plot_score(intersecting_datazones)
            
            # Add score data to the empty land's properties
            for key, value in score_data.items():
                chunk_df.at[idx, key] = value
        else:
            # No intersecting datazones
            chunk_df.at[idx, 'overallScore'] = 0
            chunk_df.at[idx, 'datazonesCount'] = 0
    
    return chunk_df

def process_empty_lands(empty_lands_gdf, datazones_gdf, walking_radius_minutes=15):
    """
    Process empty lands and calculate scores based on surrounding datazones.
    Uses parallel processing to speed up calculations.
    
    Args:
        empty_lands_gdf (GeoDataFrame): GeoDataFrame of empty lands
        datazones_gdf (GeoDataFrame): GeoDataFrame of datazones
        walking_radius_minutes (int): Walking time in minutes
    
    Returns:
        GeoDataFrame: GeoDataFrame with scores added to properties
    """
    print("Processing empty lands for static scoring...")
    
    # Store original CRS for later conversion back
    original_crs = empty_lands_gdf.crs
    
    # Ensure both GeoDataFrames are in the same CRS
    if empty_lands_gdf.crs != datazones_gdf.crs:
        empty_lands_gdf = empty_lands_gdf.to_crs(datazones_gdf.crs)
    
    # Calculate buffer radius in meters
    buffer_radius = calculate_buffer_radius(walking_radius_minutes)
    
    # Prepare datazones for faster processing
    # Convert to projected CRS for more accurate spatial operations if not already
    if datazones_gdf.crs == "EPSG:4326":
        # Use a suitable projected CRS for your area
        datazones_gdf = datazones_gdf.to_crs("EPSG:27700")  # British National Grid
        empty_lands_gdf = empty_lands_gdf.to_crs("EPSG:27700")
    
    # Create spatial index for datazones if using rtree
    print("Creating spatial index for datazones...")
    
    # Determine number of processes to use (leave one core free)
    num_processes = max(1, multiprocessing.cpu_count() - 1)
    print(f"Using {num_processes} processes for parallel processing")
    
    # Split the dataframe into chunks for parallel processing
    chunk_size = max(1, len(empty_lands_gdf) // num_processes)
    chunks = [empty_lands_gdf.iloc[i:i + chunk_size].copy() for i in range(0, len(empty_lands_gdf), chunk_size)]
    
    # Prepare arguments for parallel processing, including start index for each chunk
    start_indices = [i * chunk_size for i in range(len(chunks))]
    chunk_args = [(chunk, datazones_gdf, buffer_radius, start_idx) for chunk, start_idx in zip(chunks, start_indices)]
    
    # Process chunks in parallel
    results = []
    with ProcessPoolExecutor(max_workers=num_processes) as executor:
        futures = [executor.submit(process_land_chunk, arg) for arg in chunk_args]
        
        # Show progress
        for future in tqdm(as_completed(futures), total=len(futures), desc="Processing chunks"):
            results.append(future.result())
    
    # Combine results
    if results:
        combined_gdf = pd.concat(results)
        
        # Convert back to original CRS
        if combined_gdf.crs != original_crs:
            print(f"Converting results back to original CRS: {original_crs}")
            combined_gdf = combined_gdf.to_crs(original_crs)
        
        return combined_gdf
    else:
        # If no results, convert empty_lands_gdf back to original CRS
        if empty_lands_gdf.crs != original_crs:
            empty_lands_gdf = empty_lands_gdf.to_crs(original_crs)
        return empty_lands_gdf

def main():
    """Main function to run the script."""
    start_time = time.time()
    
    # Create output directory if it doesn't exist
    os.makedirs("00-data", exist_ok=True)
    os.makedirs("00-data/geojson", exist_ok=True)
    
    # Step 1: Query Overpass API for empty lands
    try:
        # Check if we already have the data cached
        if os.path.exists("00-data/empty-lands-raw.json"):
            print("Loading empty lands from cache...")
            with open("00-data/empty-lands-raw.json", "r") as f:
                osm_data = json.load(f)
        else:
            # Query Overpass API
            osm_data = query_overpass_api()
            
            # Save raw data for future use
            with open("00-data/empty-lands-raw.json", "w") as f:
                json.dump(osm_data, f)
    except Exception as e:
        print(f"Error querying Overpass API: {e}")
        return
    
    # Step 2: Convert OSM data to GeoJSON
    try:
        empty_lands_geojson = convert_osm_to_geojson(osm_data)
        
        # Save intermediate GeoJSON for reference
        with open("00-data/empty-lands.geojson", "w") as f:
            json.dump(empty_lands_geojson, f)
    except Exception as e:
        print(f"Error converting OSM data to GeoJSON: {e}")
        return
    
    # Step 3: Load datazones
    try:
        datazones_file = "./00-data/geojson/datazones2011_data_normalized.geojson"
        print(f"Loading datazones from {datazones_file}...")
        datazones_gdf = gpd.read_file(datazones_file)
    except Exception as e:
        print(f"Error loading datazones: {e}")
        return
    
    # Step 4: Convert empty lands GeoJSON to GeoDataFrame
    try:
        empty_lands_gdf = gpd.GeoDataFrame.from_features(empty_lands_geojson["features"])
        
        # Set CRS to match datazones (assuming WGS84)
        if empty_lands_gdf.crs is None:
            empty_lands_gdf.crs = "EPSG:4326"
            print(f"Setting empty lands CRS to: {empty_lands_gdf.crs}")
        else:
            print(f"Empty lands CRS is: {empty_lands_gdf.crs}")
    except Exception as e:
        print(f"Error creating GeoDataFrame from empty lands: {e}")
        return
    
    # Step 5: Process empty lands and calculate scores
    try:
        # Keep only the geometry column and drop all other properties
        empty_lands_gdf = empty_lands_gdf[['geometry']]
        
        scored_lands_gdf = process_empty_lands(empty_lands_gdf, datazones_gdf)
        print(f"Processed lands CRS: {scored_lands_gdf.crs}")
    except Exception as e:
        print(f"Error processing empty lands: {e}")
        return
    
    # Step 6: Save the result to a GeoJSON file
    try:
        output_file = "./00-data/geojson/scored-empty-lands.geojson"
        
        # Explicitly include CRS in the GeoJSON
        geo_json_dict = json.loads(scored_lands_gdf.to_json())
        
        # Add CRS information to the GeoJSON
        if scored_lands_gdf.crs:
            crs_name = scored_lands_gdf.crs.to_string()
            geo_json_dict["crs"] = {
                "type": "name",
                "properties": {
                    "name": crs_name
                }
            }
            print(f"Adding CRS to GeoJSON: {crs_name}")
        
        # Save to file
        with open(output_file, "w") as f:
            json.dump(geo_json_dict, f, indent=2)
        
        print(f"Successfully saved scored lands to {output_file}")
        print(f"Total features: {len(scored_lands_gdf)}")
    except Exception as e:
        print(f"Error saving scored lands: {e}")
        return
    
    # Step 7: Generate statistics
    try:
        avg_score = scored_lands_gdf['overallScore'].mean()
        min_score = scored_lands_gdf['overallScore'].min()
        max_score = scored_lands_gdf['overallScore'].max()
        
        print("\nScore Statistics:")
        print(f"Average Score: {avg_score:.2f}")
        print(f"Min Score: {min_score:.2f}")
        print(f"Max Score: {max_score:.2f}")
    except Exception as e:
        print(f"Error generating statistics: {e}")
    
    end_time = time.time()
    print(f"\nTotal processing time: {end_time - start_time:.2f} seconds")

if __name__ == "__main__":
    main()