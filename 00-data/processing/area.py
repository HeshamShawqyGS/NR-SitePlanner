import geopandas as gpd

# Hardcoded input and output file paths
input_geojson = "./00-data/geojson/datazones2011_data_normalized.geojson"
output_geojson = "./00-data/geojson/datazones2011_data_normalized_with_id_area.geojson"

# Read the GeoJSON file
gdf = gpd.read_file(input_geojson)

# Add a unique id as the first column
gdf.insert(0, 'id', range(len(gdf)))

# Project to a CRS with meters as units for accurate area calculation (e.g., British National Grid)
# EPSG:27700 is common for the UK; change if your data is elsewhere
gdf_projected = gdf.to_crs(epsg=27700)

# Calculate area in square meters and add as a new column
gdf['area'] = gdf_projected.geometry.area

# Save to GeoJSON
gdf.to_file(output_geojson, driver='GeoJSON')
