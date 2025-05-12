import pandas as pd

# Hardcoded input and output file paths
INPUT_FILE = "00-data\csv\key-services-travel-time.csv"  # Path to your input CSV file
OUTPUT_FILE = "00-data\csv\key-services-travel-time-average.csv"  # Path where the output CSV will be saved

def calculate_averages(input_file, output_file):
    """
    Read a CSV file, calculate the average of 'Value' column for each unique 'Name',
    and write the results to a new CSV file.
    
    Args:
        input_file (str): Path to the input CSV file
        output_file (str): Path to the output CSV file
    """
    try:
        # Read the CSV file
        print(f"Reading data from {input_file}...")
        df = pd.read_csv(input_file)
        
        # Check if required columns exist
        if 'Name' not in df.columns:
            print("Error: 'Name' column not found in the CSV file.")
            return
        
        if 'Value' not in df.columns:
            print("Error: 'Value' column not found in the CSV file.")
            return
        
        # Group by 'Name' and calculate the average of 'Value'
        print("Calculating averages...")
        result = df.groupby('Name')['Value'].mean().reset_index()
        
        # Write the result to a new CSV file
        print(f"Writing results to {output_file}...")
        result.to_csv(output_file, index=False)
        
        print(f"Process completed. Averages calculated for {len(result)} unique names.")
        print(f"Results saved to {output_file}")
        
    except Exception as e:
        print(f"An error occurred: {str(e)}")

if __name__ == "__main__":
    # Use the hardcoded file paths
    calculate_averages(INPUT_FILE, OUTPUT_FILE)
    print("Script execution completed.")