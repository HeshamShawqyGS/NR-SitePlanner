
import json
import numpy as np
import os
from collections import defaultdict

def normalize_geojson_features(input_file, output_file=None, exclude_fields=None, 
                              method='minmax', quantile_range=(0.05, 0.95), 
                              prefix='norm'):
    
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
    property_values = defaultdict(list)
    
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
    
    # Calculate statistics for each property based on the chosen method
    property_stats = {}
    for key, values in property_values.items():
        if values:  # Only if we have numeric values
            values_array = np.array(values)
            
            property_stats[key] = {
                'min': np.min(values_array),
                'max': np.max(values_array),
                'mean': np.mean(values_array),
                'std': np.std(values_array),
                'q_low': np.quantile(values_array, quantile_range[0]) if len(values_array) > 1 else np.min(values_array),
                'q_high': np.quantile(values_array, quantile_range[1]) if len(values_array) > 1 else np.max(values_array),
                'median': np.median(values_array),
                'histogram': np.histogram(values_array, bins=10)[0].tolist()
            }
    
    # Add normalized properties to each feature
    for feature in geojson_data['features']:
        if 'properties' in feature and feature['properties']:
            for key in property_stats:
                if key in feature['properties'] and feature['properties'][key] is not None:
                    try:
                        value = float(feature['properties'][key])
                        stats = property_stats[key]
                        
                        # Apply the selected normalization method
                        if method == 'minmax':
                            # Standard min-max scaling
                            if stats['max'] > stats['min']:
                                normalized = (value - stats['min']) / (stats['max'] - stats['min'])
                            else:
                                normalized = 0.5  # Default if all values are the same
                                
                        elif method == 'robust':
                            # Robust scaling using quantiles
                            q_range = stats['q_high'] - stats['q_low']
                            if q_range > 0:
                                normalized = (value - stats['q_low']) / q_range
                                # Clip values to [0, 1] range
                                normalized = max(0, min(1, normalized))
                            else:
                                normalized = 0.5
                                
                        elif method == 'zscore':
                            # Z-score normalization
                            if stats['std'] > 0:
                                normalized = (value - stats['mean']) / stats['std']
                                # Convert to 0-1 range (approximately, assuming normal distribution)
                                normalized = 1 / (1 + np.exp(-normalized))  # Sigmoid function
                            else:
                                normalized = 0.5
                                
                        elif method == 'quantile':
                            # Quantile-based normalization
                            # Find the position of the value in the sorted array
                            sorted_values = sorted(property_values[key])
                            position = sorted_values.index(value) if value in sorted_values else 0
                            normalized = position / max(1, len(sorted_values) - 1)
                        
                        else:
                            raise ValueError(f"Unknown normalization method: {method}")
                            
                        # Add the normalized value with the specified prefix
                        feature['properties'][f'{prefix}_{key}'] = normalized
                    except (ValueError, TypeError):
                        # Skip non-numeric values
                        pass
    
    # Write the updated GeoJSON to the output file
    with open(output_file, 'w') as f:
        json.dump(geojson_data, f)
    
    # Print summary statistics
    print(f"Normalized GeoJSON saved to: {output_file}")
    print(f"Normalization method: {method}")
    print(f"Normalized {len(property_stats)} properties, excluded {len(exclude_fields)} properties")
    
    # Print distribution information for a few properties
    for key in list(property_stats.keys())[:3]:  # Show first 3 properties
        hist = property_stats[key]['histogram']
        print(f"\nDistribution for '{key}':")
        print(f"  Min: {property_stats[key]['min']:.2f}, Max: {property_stats[key]['max']:.2f}")
        print(f"  Mean: {property_stats[key]['mean']:.2f}, Median: {property_stats[key]['median']:.2f}")
        print(f"  {quantile_range[0]*100}%: {property_stats[key]['q_low']:.2f}, {quantile_range[1]*100}%: {property_stats[key]['q_high']:.2f}")
        print(f"  Histogram: {hist}")
    
    return output_file

if __name__ == "__main__":
    # Path to your GeoJSON file
    input_file = "./00-data/geojson/datazones2011_data.geojson"
    output_file = "./00-data/geojson/datazones2011_data_normalized.geojson"
    # Fields to exclude from normalization
    exclude_fields = ["CouncilArea", "2011Zones", "DataZone", "geometry"]
    
    # Normalize the features using robust scaling to handle outliers better
    normalize_geojson_features(
        input_file, 
        output_file, 
        exclude_fields=exclude_fields,
        method='robust',  # Options: 'minmax', 'robust', 'zscore', 'quantile'
        quantile_range=(0.1, 0.9),  # Ignore bottom 5% and top 5% for robust scaling
        prefix='norm'  # Prefix for normalized properties
    )
