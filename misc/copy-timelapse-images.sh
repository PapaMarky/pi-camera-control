#!/bin/bash

# Script to copy and rename Canon timelapse images with directory prefixes
# Usage: ./copy-timelapse-images.sh

SOURCE_BASE="/Volumes/EOS_DIGITAL/DCIM"
DEST_DIR="/Users/mark/Pictures/timelapse/CanonEOS-R50/Halkins/20250906-PoolDance/frames"

echo "Copying timelapse images with directory prefixes..."

# Create destination directory if it doesn't exist
mkdir -p "$DEST_DIR"

# Function to copy files from a directory with prefix
copy_with_prefix() {
    local source_dir="$1"
    local dir_number="$2"
    
    if [ ! -d "$source_dir" ]; then
        echo "Warning: Directory $source_dir not found, skipping..."
        return
    fi
    
    local file_count=$(find "$source_dir" -name "IMG_*.JPG" -o -name "IMG_*.jpg" | wc -l)
    if [ "$file_count" -eq 0 ]; then
        echo "No IMG_*.JPG files found in $source_dir"
        return
    fi
    
    echo "Processing $file_count files from $source_dir..."
    
    # Copy and rename files
    file_count=0
    for file in "$source_dir"/IMG_*.JPG "$source_dir"/IMG_*.jpg; do
        if [ -f "$file" ]; then
            # Extract just the filename
            filename=$(basename "$file")
            
            # Extract the number part (e.g., 9876 from IMG_9876.JPG)
            if [[ $filename =~ IMG_([0-9]+)\.(JPG|jpg) ]]; then
                img_number="${BASH_REMATCH[1]}"
                extension="${BASH_REMATCH[2]}"
                
                # Create new filename with directory prefix
                new_filename="IMG_${dir_number}_${img_number}.${extension}"
                
                # Copy to destination
                file_count=$((file_count+1))
                cp "$file" "$DEST_DIR/$new_filename"
                status=$?
                if [[ $status == 0 ]]; then
                  if [[ $(( $file_count % 200 )) == 0 ]]; then
                    echo "Copied: $(basename "$file") -> $new_filename: File number $file_count"
                  fi
                else
                  echo cp "$file" "$DEST_DIR/$new_filename"
                  echo "FAILED ($status) to copy $(basename "$file") -> $new_filename: File number $file_count"
                fi
            else
                echo "Warning: Couldn't parse filename: $filename"
            fi
        fi
    done
    echo "Copied $file_count images from $source_dir to $DEST_DIR"
}

# Process both directories
echo "=== Processing 100CANON directory ==="
copy_with_prefix "$SOURCE_BASE/100CANON" "100"

echo ""
echo "=== Processing 101CANON directory ==="
copy_with_prefix "$SOURCE_BASE/101CANON" "101"

echo ""
echo "=== Summary ==="
total_files=$(find "$DEST_DIR" -name "IMG_*.JPG" -o -name "IMG_*.jpg" | wc -l)
echo "Total files copied: $total_files"
echo "Destination: $DEST_DIR"

# Show first and last few files for verification
echo ""
echo "First 5 files (sorted):"
find "$DEST_DIR" -name "IMG_*.JPG" -o -name "IMG_*.jpg" | sort | head -5

echo ""
echo "Last 5 files (sorted):"
find "$DEST_DIR" -name "IMG_*.JPG" -o -name "IMG_*.jpg" | sort | tail -5