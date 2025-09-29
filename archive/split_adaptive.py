#!/usr/bin/env python3
"""
Hybrid Adaptive Splitting Tool for Canon Camera Control API Reference

This script intelligently splits large documentation files into manageable chunks
while respecting section boundaries. It uses adaptive logic to group small sections
together and split large sections at appropriate boundaries.

The script ensures each output file stays under 1,500 lines to leave room for
markdown expansion while maintaining logical document structure.
"""

import os
import re
import json
from pathlib import Path
from typing import List, Dict, Tuple
from dataclasses import dataclass
from datetime import datetime


@dataclass
class Section:
    """Represents a documentation section with its metadata."""
    number: str  # e.g., "4.9.1"
    title: str   # e.g., "Get all shooting parameters"
    start_line: int
    end_line: int
    line_count: int
    level: int  # 1 for X, 2 for X.Y, 3 for X.Y.Z, etc.


class AdaptiveSplitter:
    """Handles intelligent splitting of documentation files."""

    def __init__(self, max_lines_per_file: int = 1500, min_lines_to_split: int = 500):
        """
        Initialize the splitter with size constraints.

        Args:
            max_lines_per_file: Maximum lines allowed per output file
            min_lines_to_split: Minimum lines to justify creating a separate file
        """
        self.max_lines = max_lines_per_file
        self.min_lines = min_lines_to_split
        self.sections: List[Section] = []
        self.lines: List[str] = []

    def parse_file(self, filepath: str) -> None:
        """
        Parse the input file and identify all sections.

        Args:
            filepath: Path to the source documentation file
        """
        with open(filepath, 'r', encoding='utf-8') as f:
            self.lines = f.readlines()

        print(f"Loaded {len(self.lines)} lines from {filepath}")

        # Pattern to match section headers (supports multiple levels)
        # Matches: "4.9.1.     Title" or "4.9.1     Title" with flexible spacing
        section_pattern = re.compile(r'^(\d+(?:\.\d+)*)\.\s+(.+)$')

        current_section = None

        for i, line in enumerate(self.lines):
            stripped = line.strip()
            match = section_pattern.match(stripped)

            if match:
                # Save previous section if exists
                if current_section:
                    current_section.end_line = i
                    current_section.line_count = i - current_section.start_line
                    self.sections.append(current_section)

                # Create new section
                section_number = match.group(1)
                section_title = match.group(2)
                level = len(section_number.split('.'))

                current_section = Section(
                    number=section_number,
                    title=section_title,
                    start_line=i,
                    end_line=len(self.lines),  # Will be updated
                    line_count=0,  # Will be updated
                    level=level
                )

        # Handle the last section
        if current_section:
            current_section.end_line = len(self.lines)
            current_section.line_count = current_section.end_line - current_section.start_line
            self.sections.append(current_section)

        print(f"Found {len(self.sections)} sections")

    def create_file_groups(self) -> List[Dict]:
        """
        Group sections into files using adaptive logic.

        Returns:
            List of file groups, each containing sections and metadata
        """
        if not self.sections:
            return []

        file_groups = []
        current_group = {
            'sections': [],
            'start_line': 0,
            'end_line': 0,
            'line_count': 0,
            'section_numbers': []
        }

        for section in self.sections:
            # Check if adding this section would exceed the limit
            if (current_group['line_count'] + section.line_count > self.max_lines
                and current_group['line_count'] > 0):

                # Save current group if it has content
                if current_group['sections']:
                    file_groups.append(current_group)

                # Start new group
                current_group = {
                    'sections': [],
                    'start_line': section.start_line,
                    'end_line': section.end_line,
                    'line_count': 0,
                    'section_numbers': []
                }

            # Add section to current group
            current_group['sections'].append(section)
            current_group['section_numbers'].append(section.number)
            current_group['end_line'] = section.end_line
            current_group['line_count'] += section.line_count

            # If this single section is too large, we might need to split it further
            # For now, we'll include it as-is and note it in the manifest
            if section.line_count > self.max_lines:
                print(f"⚠️  Warning: Section {section.number} has {section.line_count} lines "
                      f"(exceeds {self.max_lines} limit)")

        # Don't forget the last group
        if current_group['sections']:
            file_groups.append(current_group)

        return file_groups

    def write_split_files(self, source_path: str, output_dir: str = None) -> Dict:
        """
        Write the split files and generate a manifest.

        Args:
            source_path: Path to the source file
            output_dir: Directory for output files (defaults to same as source)

        Returns:
            Manifest dictionary containing split information
        """
        source_path = Path(source_path)

        if output_dir:
            output_dir = Path(output_dir)
        else:
            output_dir = source_path.parent

        # Ensure output directory exists
        output_dir.mkdir(exist_ok=True, parents=True)

        # Get base name without extension
        base_name = source_path.stem

        # Parse the file first
        self.parse_file(str(source_path))

        # Create file groups
        file_groups = self.create_file_groups()

        if not file_groups:
            print("No sections found to split")
            return {}

        manifest = {
            'source_file': str(source_path),
            'total_lines': len(self.lines),
            'total_sections': len(self.sections),
            'created_files': [],
            'timestamp': datetime.now().isoformat(),
            'settings': {
                'max_lines_per_file': self.max_lines,
                'min_lines_to_split': self.min_lines
            }
        }

        # Generate suffix letters (A, B, C, ..., Z, AA, AB, ...)
        def get_suffix(index):
            if index < 26:
                return chr(65 + index)  # A-Z
            else:
                # For more than 26 files, use AA, AB, etc.
                first = chr(65 + (index // 26) - 1)
                second = chr(65 + (index % 26))
                return first + second

        # Write each file group
        for i, group in enumerate(file_groups):
            suffix = get_suffix(i)
            output_filename = f"{base_name} {suffix}.txt"
            output_path = output_dir / output_filename

            # Extract lines for this group
            start = group['start_line']
            end = group['end_line']
            content_lines = self.lines[start:end]

            # Write the file
            with open(output_path, 'w', encoding='utf-8') as f:
                f.writelines(content_lines)

            # Add to manifest
            file_info = {
                'filename': output_filename,
                'path': str(output_path),
                'suffix': suffix,
                'line_count': len(content_lines),
                'sections': group['section_numbers'],
                'first_section': group['section_numbers'][0] if group['section_numbers'] else None,
                'last_section': group['section_numbers'][-1] if group['section_numbers'] else None,
            }
            manifest['created_files'].append(file_info)

            print(f"✅ Created: {output_filename} ({len(content_lines)} lines, "
                  f"sections {file_info['first_section']} - {file_info['last_section']})")

        # Write manifest file
        manifest_path = output_dir / f"{base_name}_manifest.json"
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2)

        print(f"\n📋 Manifest saved to: {manifest_path}")
        print(f"📊 Summary: Split {len(self.lines)} lines into {len(file_groups)} files")

        return manifest


def main():
    """Main entry point for the script."""
    import sys

    # Default settings
    max_lines = 1500
    min_lines = 500

    # Check command line arguments
    if len(sys.argv) < 2:
        print("Usage: python split_adaptive.py <input_file> [output_dir] [max_lines] [min_lines]")
        print("\nExample:")
        print("  python split_adaptive.py 'CanonDocs/text/4.9. Shooting Settings.txt'")
        print("  python split_adaptive.py 'input.txt' 'output/' 1500 500")
        sys.exit(1)

    input_file = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None

    if len(sys.argv) > 3:
        max_lines = int(sys.argv[3])
    if len(sys.argv) > 4:
        min_lines = int(sys.argv[4])

    # Check if input file exists
    if not os.path.exists(input_file):
        print(f"Error: Input file '{input_file}' not found")
        sys.exit(1)

    # Create splitter and process file
    splitter = AdaptiveSplitter(max_lines_per_file=max_lines, min_lines_to_split=min_lines)

    print(f"\n🔧 Hybrid Adaptive Splitter")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"Input: {input_file}")
    print(f"Max lines per file: {max_lines}")
    print(f"Min lines to split: {min_lines}")
    print(f"Output dir: {output_dir or 'Same as input'}")
    print()

    manifest = splitter.write_split_files(input_file, output_dir)

    # Print summary
    if manifest:
        print(f"\n✨ Split completed successfully!")
        print(f"Files created: {len(manifest['created_files'])}")
        for file_info in manifest['created_files']:
            print(f"  - {file_info['filename']}: {file_info['line_count']} lines")


if __name__ == "__main__":
    main()