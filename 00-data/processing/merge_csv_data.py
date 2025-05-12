import geopandas as gpd
import pandas as pd
import os
import glob
import sys

def main():
    # File paths
    geojson_file = "00-data\\geojson\\datazones2011_with_local_auth_removed.geojson"
    csv_folder = "00-data\\csv"
    output_file = "00-data\\geojson\\datazones2011_enriched.geojson"
    
    # Check if input files exist
    if not os.path.exists(geojson_file):
        sys.exit(f"Error: GeoJSON file not found - {geojson_file}")
    if not os.path.exists(csv_folder):
        sys.exit(f"Error: CSV folder not found - {csv_folder}")
    
    # Read GeoJSON file
    print(f"Reading GeoJSON file: {geojson_file}")
    gdf = gpd.read_file(geojson_file)
    
    # Get list of all CSV files in the folder
    csv_files = glob.glob(os.path.join(csv_folder, "*.csv"))
    print(f"Found {len(csv_files)} CSV files to process")
    
    if len(csv_files) == 0:
        sys.exit(f"No CSV files found in {csv_folder}")
    
    # Process each CSV file
    for csv_file in csv_files:
        file_name = os.path.basename(csv_file)
        file_base = os.path.splitext(file_name)[0]  # Use as field name
        
        print(f"Processing: {file_name}")
        
        try:
            # Read CSV file
            df = pd.read_csv(csv_file)
            
            # Check if CSV has at least 2 columns
            if len(df.columns) < 2:
                print(f"  Warning: {file_name} has fewer than 2 columns, skipping")
                continue
            
            # Extract the first two columns
            id_col = df.columns[0]
            value_col = df.columns[1]
            
            # Create a mapping dictionary for faster lookups
            data_dict = dict(zip(df[id_col], df[value_col]))
            
            # Determine if this CSV matches with 2011Zones or CouncilArea
            match_type = None
            if any(zone in data_dict for zone in gdf['2011Zones'].unique()):
                match_type = '2011Zones'
            elif any(council in data_dict for council in gdf['CouncilArea'].unique()):
                match_type = 'CouncilArea'
            else:
                print(f"  Warning: {file_name} doesn't match any 2011Zones or CouncilArea values, skipping")
                continue
            
            print(f"  Matching on: {match_type}")
            
            # Create new column in GeoJSON
            gdf[file_base] = gdf[match_type].map(data_dict)
            
            # Report how many values were matched
            matched_count = gdf[file_base].notna().sum()
            print(f"  Added column '{file_base}' with {matched_count} matched values out of {len(gdf)} rows")
            
        except Exception as e:
            print(f"  Error processing {file_name}: {e}")
    
    # Save the enriched GeoJSON
    print(f"Saving enriched GeoJSON to: {output_file}")
    gdf.to_file(output_file, driver='GeoJSON')
    print(f"Successfully saved enriched GeoJSON with {len(gdf.columns)} columns")
    
    # Print summary of added columns
    original_cols = ['2011Zones', 'CouncilArea', 'geometry']
    new_cols = [col for col in gdf.columns if col not in original_cols]
    print(f"Added {len(new_cols)} new columns: {', '.join(new_cols)}")

if __name__ == "__main__":
    main()
