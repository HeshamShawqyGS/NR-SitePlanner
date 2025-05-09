
#!/usr/bin/env python
"""
Spatial Intersection Analysis Script

This script identifies which data zones from datazones2011.geojson are located
within council zones from councilzones.geojson and assigns the local_auth attribute
from council zones to the corresponding data zones based on spatial intersection.
For data zones not within any council zone, it assigns values based on nearest council zone.
"""

import geopandas as gpd
import os
import sys
import pandas as pd
from shapely.geometry import Point
import numpy as np

def main():
    # File paths with correct directory structure
    datazones_file = "00-data\\geojson\\datazones2011.geojson"
    councilzones_file = "00-data\\geojson\\councilzones.geojson"
    output_file = "00-data\\geojson\\datazones2011_with_local_auth.geojson"
    
    # Define target CRS - EPSG:4326 (WGS 84)
    target_crs = "EPSG:4326"
    
    # Small buffer to use for intersection (in degrees for EPSG:4326)
    # This helps with precision issues at boundaries
    buffer_distance = 0.0001  # Approximately 10 meters at this latitude
    
    print(f"Reading data zones from: {datazones_file}")
    print(f"Reading council zones from: {councilzones_file}")
    
    # Check if input files exist
    if not os.path.exists(datazones_file):
        sys.exit(f"Error: File not found - {datazones_file}")
    if not os.path.exists(councilzones_file):
        sys.exit(f"Error: File not found - {councilzones_file}")
    
    try:
        # Read GeoJSON files using geopandas
        datazones_gdf = gpd.read_file(datazones_file)
        councilzones_gdf = gpd.read_file(councilzones_file)
        
        # Print column information
        print(f"Datazone columns: {datazones_gdf.columns.tolist()}")
        print(f"Council zones columns: {councilzones_gdf.columns.tolist()}")
        
        # Verify CRS and set to EPSG:4326 if not already
        print(f"Data zones CRS: {datazones_gdf.crs}")
        print(f"Council zones CRS: {councilzones_gdf.crs}")
        
        if datazones_gdf.crs != target_crs:
            print(f"Converting datazones CRS to {target_crs}")
            datazones_gdf = datazones_gdf.to_crs(target_crs)
        
        if councilzones_gdf.crs != target_crs:
            print(f"Converting councilzones CRS to {target_crs}")
            councilzones_gdf = councilzones_gdf.to_crs(target_crs)
        
        # Check if local_auth column exists in councilzones
        if 'local_auth' not in councilzones_gdf.columns:
            sys.exit("Error: 'local_auth' column not found in the council zones file")
        
        print(f"Processing {len(datazones_gdf)} data zones and {len(councilzones_gdf)} council zones...")
        
        # Fix any invalid geometries
        datazones_gdf['geometry'] = datazones_gdf['geometry'].buffer(0)
        councilzones_gdf['geometry'] = councilzones_gdf['geometry'].buffer(0)
        
        # Add local_auth column to datazones if it doesn't exist
        if 'local_auth' in datazones_gdf.columns:
            # Rename existing column to avoid conflicts
            datazones_gdf.rename(columns={'local_auth': 'local_auth_original'}, inplace=True)
        
        # Create a new local_auth column
        datazones_gdf['local_auth'] = None
        
        # Try different spatial predicates
        # First try 'within'
        print("Attempting spatial join with 'within' predicate...")
        # Use a suffix to avoid column name conflicts
        joined_gdf = gpd.sjoin(datazones_gdf, councilzones_gdf.rename(columns={'local_auth': 'council_local_auth'}), 
                              how="left", predicate="within")
        
        # Check if any matches were found
        match_count = joined_gdf.dropna(subset=['index_right']).shape[0]
        print(f"Found {match_count} matches with 'within' predicate")
        
        # Display all columns in joined dataframe
        print(f"Joined dataframe columns: {joined_gdf.columns.tolist()}")
        
        # Extract the local_auth from the joined dataframe
        if 'council_local_auth' in joined_gdf.columns:
            print("Found 'council_local_auth' column, copying values...")
            # Copy the joined local_auth value to the original dataframe
            datazones_gdf['local_auth'] = joined_gdf['council_local_auth']
        else:
            print("Warning: 'council_local_auth' column not found in the joined dataframe")
            # Look for any column containing 'local_auth'
            local_auth_cols = [col for col in joined_gdf.columns if 'local_auth' in col or 'council' in col]
            if local_auth_cols:
                print(f"Found potential local_auth columns: {local_auth_cols}")
                # Try each column
                for col in local_auth_cols:
                    if joined_gdf[col].notna().sum() > 0:
                        print(f"Using column '{col}' for local_auth values")
                        datazones_gdf['local_auth'] = joined_gdf[col]
                        break
        
        # Count assigned and unassigned zones
        assigned = datazones_gdf['local_auth'].notna().sum()
        unassigned = len(datazones_gdf) - assigned
        
        print(f"Successfully assigned local_auth to {assigned} data zones")
        if unassigned > 0:
            print(f"Warning: {unassigned} data zones could not be assigned a local_auth value")
            
            # Print some information about unassigned zones
            unassigned_zones = datazones_gdf[datazones_gdf['local_auth'].isna()]
            if len(unassigned_zones) > 0:
                print("Sample of unassigned zones:")
                for idx, zone in unassigned_zones.head(5).iterrows():
                    if 'DataZone' in zone:
                        print(f"  DataZone: {zone['DataZone']}")
        
        # Process the unassigned zones using nearest neighbor approach
        if unassigned > 0:
            print(f"Assigning nearest council zone to {unassigned} unassigned data zones...")
            
            # Create a copy of unassigned zones
            unassigned_zones = datazones_gdf[datazones_gdf['local_auth'].isna()].copy()
            
            # Calculate centroids for the unassigned zones for distance calculations
            unassigned_zones['centroid'] = unassigned_zones.geometry.centroid
            
            # Add nearest council zone for each unassigned zone
            for idx, unassigned_zone in unassigned_zones.iterrows():
                # Get centroid of the unassigned zone
                centroid = unassigned_zone['centroid']
                
                # Calculate distance to each council zone
                distances = councilzones_gdf.geometry.apply(lambda g: centroid.distance(g))
                
                # Find the index of the nearest council zone
                nearest_idx = distances.idxmin()
                
                # Get the local_auth of the nearest council zone
                nearest_local_auth = councilzones_gdf.loc[nearest_idx, 'local_auth']
                
                # Assign the local_auth to the unassigned zone
                datazones_gdf.loc[idx, 'local_auth'] = nearest_local_auth
            
            # Count again after nearest neighbor assignment
            assigned_after = datazones_gdf['local_auth'].notna().sum()
            print(f"After nearest neighbor assignment: {assigned_after} of {len(datazones_gdf)} data zones have local_auth values")
            
            # Print some examples of newly assigned zones
            newly_assigned = datazones_gdf.loc[unassigned_zones.index].head(5)
            print("Sample of newly assigned zones (using nearest council zone):")
            for idx, zone in newly_assigned.iterrows():
                if 'DataZone' in zone:
                    print(f"  DataZone: {zone['DataZone']}, assigned local_auth: {zone['local_auth']}")
        
        # Ensure the output has the correct CRS (EPSG:4326)
        datazones_gdf = datazones_gdf.to_crs(target_crs)
        
        # Drop any temporary columns like 'centroid'
        if 'centroid' in datazones_gdf.columns:
            datazones_gdf = datazones_gdf.drop(columns=['centroid'])
        
        # Save the updated datazones to a new GeoJSON file
        print(f"Saving results to: {output_file} with CRS: {target_crs}")
        datazones_gdf.to_file(output_file, driver="GeoJSON")
        
        # Verify the output success
        try:
            output_gdf = gpd.read_file(output_file)
            print(f"Output file CRS: {output_gdf.crs}")
            output_assigned = output_gdf['local_auth'].notna().sum()
            print(f"Verified {output_assigned} of {len(output_gdf)} data zones have local_auth values in output file")
            
            # Count unique local_auth values
            unique_values = output_gdf['local_auth'].nunique()
            print(f"Number of unique local_auth values in output: {unique_values}")
            
            # Print the distribution of local_auth values
            value_counts = output_gdf['local_auth'].value_counts().head(10)
            print("Top 10 most common local_auth values:")
            for auth, count in value_counts.items():
                print(f"  {auth}: {count} data zones")
        
        except Exception as e:
            print(f"Warning when verifying output: {str(e)}")
        
        print("Process completed successfully!")
        
    except Exception as e:
        import traceback
        print(f"Error during processing: {str(e)}")
        print(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()
