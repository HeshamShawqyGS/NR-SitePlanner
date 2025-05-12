import geopandas as gpd
import os

# Hardcoded input file
input_file = "00-data\\geojson\\datazones2011_with_local_auth.geojson"
gdf = gpd.read_file(input_file)
base, ext = os.path.splitext(input_file)
output_file = f"{base}_removed{ext}"

# Print file paths for debugging
print(f"Reading from: {os.path.abspath(input_file)}")
print(f"Will write to: {os.path.abspath(output_file)}")

# Check if the columns exist before renaming
columns_to_rename = {}
if 'Name' in gdf.columns:
    columns_to_rename['Name'] = '2011Zones'
if 'local_auth' in gdf.columns:
    columns_to_rename['local_auth'] = 'CouncilArea'

# Rename the columns
gdf = gdf.rename(columns=columns_to_rename)

# Fields to remove
fields_to_remove = [
    'Shape_Area',
    'Shape_Leng',
    'StdAreaKm2',
    'StdAreaHa',
    'HHCnt2011',
    'ResPop2011',
    'TotPop2011'
]

# Remove specified fields if they exist
for field in fields_to_remove:
    if field in gdf.columns:
        gdf = gdf.drop(columns=[field])
        print(f"Removed field: {field}")
    else:
        print(f"Field not found: {field}")

# Print remaining columns for verification
print(f"Remaining columns: {list(gdf.columns)}")

# Save the modified GeoJSON
gdf.to_file(output_file, driver='GeoJSON')
print(f"Successfully saved modified GeoJSON to {output_file}")
