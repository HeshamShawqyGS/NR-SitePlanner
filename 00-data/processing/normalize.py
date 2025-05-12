import json
import numpy as np
import os

def normalize_geojson_features(input_file, output_file=None, exclude_fields=None):
    # Set default output file if not provided
    if output_file is None:
        base, ext = os.path.splitext(input_file)
        output_file = f"{base}_normalized{ext}"
    
    # Set default exclude_fields if not provided
    if exclude_fields is None:
        exclude_fields = []
    
    # Read the GeoJSON file
    with open(input_file, 'r') as f:
        geojson_data = json.load(f)
    
    # Check if it's a valid GeoJSON with features
    if 'features' not in geojson_data:
        raise ValueError("The GeoJSON file doesn't contain a 'features' array")
    
    # Extract all property keys (excluding geometry and specified exclusions)
    all_keys = set()
    for feature in geojson_data['features']:
        if 'properties' in feature and feature['properties']:
            # Add keys that are not in the exclude list
            all_keys.update(k for k in feature['properties'].keys() 
                           if k not in exclude_fields)
    
    # For each property, collect all values to normalize
    property_values = {key: [] for key in all_keys}
    
    for feature in geojson_data['features']:
        if 'properties' in feature and feature['properties']:
            for key in all_keys:
                if key in feature['properties'] and feature['properties'][key] is not None:
                    try:
                        # Try to convert to float for normalization
                        value = float(feature['properties'][key])
                        property_values[key].append(value)
                    except (ValueError, TypeError):
                        # Skip non-numeric values
                        pass
    
    # Calculate min and max for each property
    property_stats = {}
    for key, values in property_values.items():
        if values:  # Only if we have numeric values
            property_stats[key] = {
                'min': min(values),
                'max': max(values)
            }
    
    # Add normalized properties to each feature
    for feature in geojson_data['features']:
        if 'properties' in feature and feature['properties']:
            for key in property_stats:
                if key in feature['properties'] and feature['properties'][key] is not None:
                    try:
                        value = float(feature['properties'][key])
                        min_val = property_stats[key]['min']
                        max_val = property_stats[key]['max']
                        
                        # Avoid division by zero
                        if max_val > min_val:
                            normalized = (value - min_val) / (max_val - min_val)
                        else:
                            normalized = 0.0
                            
                        # Add the normalized value with a prefix
                        feature['properties'][f'norm_{key}'] = normalized
                    except (ValueError, TypeError):
                        # Skip non-numeric values
                        pass
    
    # Write the updated GeoJSON to the output file
    with open(output_file, 'w') as f:
        json.dump(geojson_data, f)
    
    print(f"Normalized GeoJSON saved to: {output_file}")
    print(f"Normalized {len(property_stats)} properties, excluded {len(exclude_fields)} properties")
    return output_file

if __name__ == "__main__":
    # Path to your GeoJSON file
    input_file = "./00-data/geojson/datazones2011_data.geojson"
    output_file = "./00-data/geojson/datazones2011_data_normalized.geojson"
    # Fields to exclude from normalization
    exclude_fields = ["CouncilArea", "2011Zones", "DataZone", "geometry"]
    
    # Normalize the features
    normalize_geojson_features(input_file, output_file, exclude_fields=exclude_fields)