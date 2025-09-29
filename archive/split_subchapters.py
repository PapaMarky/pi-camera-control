#!/usr/bin/env python3
"""
Subchapter Splitting Tool for Canon Camera Control API Reference Chapter 4

This script splits Chapter 4 "Specifications of Each API" into separate subchapter files.
It identifies subchapters by the pattern "N.M. Subchapter Title" and creates individual
text files in the CanonDocs/text/ directory.
"""

import os
import re
from pathlib import Path

def split_subchapters():
    """Split Chapter 4 into separate subchapter files."""

    # Define file paths
    source_file = "CanonDocs/text/4. Specifications of Each API.txt"
    output_dir = Path("CanonDocs/text")

    # Check if source file exists
    if not os.path.exists(source_file):
        print(f"Error: Source file '{source_file}' not found.")
        print("Please run split_chapters.py first to create the chapter files.")
        return

    # Read the entire chapter
    with open(source_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    print(f"Read {len(lines)} lines from {source_file}")

    # Define subchapter pattern: "N.M. Subchapter Title"
    subchapter_pattern = re.compile(r'^(\d+)\.(\d+)\.\s+(.+)$')

    subchapters = []
    current_subchapter = None

    # Content before first subchapter (introduction text)
    intro_lines = []
    found_first_subchapter = False

    # Find all subchapters and their content
    for i, line in enumerate(lines):
        stripped_line = line.strip()
        match = subchapter_pattern.match(stripped_line)

        if match:
            if not found_first_subchapter:
                # Save introduction content before first subchapter
                if intro_lines:
                    intro_subchapter = {
                        'number': '4.0',
                        'title': 'Introduction',
                        'content': intro_lines.copy(),
                        'line_count': len(intro_lines)
                    }
                    subchapters.append(intro_subchapter)
                    print(f"Created introduction section: 4.0. Introduction ({len(intro_lines)} lines)")
                found_first_subchapter = True

            # Save previous subchapter if it exists
            if current_subchapter:
                end_line = i
                current_subchapter['content'] = lines[current_subchapter['start_line']:end_line]
                current_subchapter['line_count'] = len(current_subchapter['content'])
                subchapters.append(current_subchapter)

            # Start new subchapter
            chapter_num = match.group(1)
            section_num = match.group(2)
            section_title = match.group(3)
            current_subchapter = {
                'number': f"{chapter_num}.{section_num}",
                'title': section_title,
                'start_line': i,
                'content': None,
                'line_count': 0
            }
            print(f"Found subchapter {chapter_num}.{section_num}: {section_title} (line {i + 1})")
        else:
            # If we haven't found the first subchapter yet, add to intro
            if not found_first_subchapter:
                intro_lines.append(line)

    # Handle the last subchapter
    if current_subchapter:
        current_subchapter['content'] = lines[current_subchapter['start_line']:]
        current_subchapter['line_count'] = len(current_subchapter['content'])
        subchapters.append(current_subchapter)

    print(f"Found {len(subchapters)} subchapters total")

    # Write each subchapter to a separate file
    for subchapter in subchapters:
        # Create filename
        filename = f"{subchapter['number']}. {subchapter['title']}.txt"
        filepath = output_dir / filename

        # Write subchapter file
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(subchapter['content'])

        line_count = subchapter['line_count']
        print(f"Created: {filepath} ({line_count} lines)")

    # Remove the original large Chapter 4 file
    if os.path.exists(source_file):
        os.remove(source_file)
        print(f"\nRemoved original file: {source_file}")

    print(f"\nSubchapter split complete! Created {len(subchapters)} subchapter files in {output_dir}")

if __name__ == "__main__":
    split_subchapters()