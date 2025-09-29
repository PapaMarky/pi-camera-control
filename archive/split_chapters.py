#!/usr/bin/env python3
"""
Chapter Splitting Tool for Canon Camera Control API Reference

This script splits the Canon API documentation into separate chapter files.
It identifies chapters by the pattern "N. Chapter Title" and creates individual
text files in the CanonDocs/text/ directory.
"""

import os
import re
from pathlib import Path

def split_chapters():
    """Split the Canon API document into separate chapter files."""

    # Define file paths
    source_file = "CanonDocs/CameraControlAPI_Reference_v140_EN.txt"
    output_dir = Path("CanonDocs/text")

    # Check if source file exists
    if not os.path.exists(source_file):
        print(f"Error: Source file '{source_file}' not found.")
        return

    # Create output directory if it doesn't exist
    output_dir.mkdir(exist_ok=True)
    print(f"Created output directory: {output_dir}")

    # Read the entire document
    with open(source_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    print(f"Read {len(lines)} lines from {source_file}")

    # Define chapter pattern: "N. Chapter Title"
    chapter_pattern = re.compile(r'^(\d+)\.\s+(.+)$')

    chapters = []
    current_chapter = None

    # Find all chapters and their content (skip table of contents)
    # Start from line 988 where "1. Document Overview" actually begins
    start_scanning = False

    for i, line in enumerate(lines):
        stripped_line = line.strip()

        # Start scanning after we find the real "1. Document Overview"
        if not start_scanning and stripped_line == "1. Document Overview":
            start_scanning = True

        if start_scanning:
            match = chapter_pattern.match(stripped_line)

            if match:
                # Save previous chapter if it exists
                if current_chapter:
                    current_chapter['end_line'] = i
                    chapters.append(current_chapter)

                # Start new chapter
                chapter_num = match.group(1)
                chapter_title = match.group(2)
                current_chapter = {
                    'number': chapter_num,
                    'title': chapter_title,
                    'start_line': i,
                    'end_line': None
                }
                print(f"Found chapter {chapter_num}: {chapter_title} (line {i + 1})")

    # Handle the last chapter
    if current_chapter:
        current_chapter['end_line'] = len(lines)
        chapters.append(current_chapter)

    print(f"Found {len(chapters)} chapters total")

    # Write each chapter to a separate file
    for chapter in chapters:
        # Create filename
        filename = f"{chapter['number']}. {chapter['title']}.txt"
        filepath = output_dir / filename

        # Extract chapter content
        start = chapter['start_line']
        end = chapter['end_line']
        chapter_lines = lines[start:end]

        # Write chapter file
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(chapter_lines)

        line_count = len(chapter_lines)
        print(f"Created: {filepath} ({line_count} lines)")

    print(f"\nSplit complete! Created {len(chapters)} chapter files in {output_dir}")

if __name__ == "__main__":
    split_chapters()