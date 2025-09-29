#!/usr/bin/env python3
"""
Canon EOS R50 Support Annotator

This script annotates Canon API documentation markdown files with Canon EOS R50 support information.
It adds support annotations at the section level and method-specific restrictions where applicable.
"""

import json
import re
import os
from pathlib import Path
from typing import Dict, List, Tuple, Set
from dataclasses import dataclass


@dataclass
class ApiSupport:
    """Represents API support information for a specific endpoint."""
    path: str
    get: bool
    post: bool
    put: bool
    delete: bool
    version: str


class R50SupportAnnotator:
    """Handles annotation of Canon EOS R50 support in API documentation."""

    def __init__(self, json_file: str):
        """
        Initialize with R50 support data.

        Args:
            json_file: Path to the Canon EOS R50 support JSON file
        """
        self.support_data: Dict[str, ApiSupport] = {}
        self.load_support_data(json_file)

    def load_support_data(self, json_file: str) -> None:
        """Load and parse the R50 support JSON data."""
        with open(json_file, 'r', encoding='utf-8') as f:
            content = f.read()

        # The file has some debug output at the top, extract just the JSON
        json_start = content.find('{')
        if json_start == -1:
            raise ValueError("No JSON found in support file")

        json_content = content[json_start:]
        data = json.loads(json_content)

        # Process each version
        for version, endpoints in data.items():
            for endpoint in endpoints:
                # Create normalized path (remove /ccapi/verXXX prefix)
                path = endpoint['path']
                # Remove the version prefix to create a generic path
                normalized_path = re.sub(r'^/ccapi/ver\d+', '', path)

                api_support = ApiSupport(
                    path=normalized_path,
                    get=endpoint.get('get', False),
                    post=endpoint.get('post', False),
                    put=endpoint.get('put', False),
                    delete=endpoint.get('delete', False),
                    version=version
                )

                # Use normalized path as key, but keep version info
                key = f"{normalized_path}#{version}"
                self.support_data[key] = api_support

                # Also create a version-agnostic key
                self.support_data[normalized_path] = api_support

        print(f"Loaded {len(self.support_data)} API support entries")

    def extract_uri_from_section(self, section_content: str) -> str:
        """Extract the API URI from a documentation section."""
        # Look for URI patterns in the section
        uri_patterns = [
            r'`http://\[IPAddress\]:\[Port\]/ccapi/\[Version\](.*?)`',
            r'http://\[IPAddress\]:\[Port\]/ccapi/\[Version\](.*?)(?:\s|$)',
            r'```\s*http://\[IPAddress\]:\[Port\]/ccapi/\[Version\](.*?)\s*```'
        ]

        for pattern in uri_patterns:
            match = re.search(pattern, section_content, re.MULTILINE | re.DOTALL)
            if match:
                return match.group(1).strip()

        return ""

    def is_api_supported(self, uri_path: str) -> Tuple[bool, ApiSupport]:
        """
        Check if an API endpoint is supported by Canon EOS R50.

        Returns:
            Tuple of (is_supported, support_details)
        """
        # Try exact match first
        if uri_path in self.support_data:
            support = self.support_data[uri_path]
            is_supported = support.get or support.post or support.put or support.delete
            return is_supported, support

        # Try with different version keys
        for version in ['ver100', 'ver110', 'ver130']:
            key = f"{uri_path}#{version}"
            if key in self.support_data:
                support = self.support_data[key]
                is_supported = support.get or support.post or support.put or support.delete
                return is_supported, support

        return False, None

    def get_method_support(self, uri_path: str, method: str) -> bool:
        """Check if a specific HTTP method is supported for an endpoint."""
        _, support = self.is_api_supported(uri_path)
        if not support:
            return False

        method_lower = method.lower()
        return getattr(support, method_lower, False)

    def annotate_markdown_file(self, file_path: str) -> int:
        """
        Annotate a single markdown file with R50 support information.

        Returns:
            Number of annotations added
        """
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Split content into lines for easier processing
        lines = content.split('\n')
        new_lines = []
        annotations_added = 0

        i = 0
        while i < len(lines):
            line = lines[i]

            # Check for section headers (## 4.X.Y. Title)
            section_match = re.match(r'^## (\d+\.\d+(?:\.\d+)?)\.\s+(.+)$', line)
            if section_match:
                section_number = section_match.group(1)
                section_title = section_match.group(2)

                # Add the section header line
                new_lines.append(line)

                # Look ahead to find the URI and determine support
                uri_content = ""
                j = i + 1
                while j < len(lines) and j < i + 20:  # Look ahead max 20 lines
                    if lines[j].startswith('##'):  # Next section
                        break
                    uri_content += lines[j] + '\n'
                    j += 1

                uri_path = self.extract_uri_from_section(uri_content)
                if uri_path:
                    is_supported, support_details = self.is_api_supported(uri_path)

                    if is_supported:
                        new_lines.append("")
                        new_lines.append("**Supported by Canon EOS R50**")
                        new_lines.append("")
                        annotations_added += 1
                        print(f"  ✅ {section_number} - {section_title} (supported)")
                    else:
                        print(f"  ❌ {section_number} - {section_title} (not supported)")
                else:
                    print(f"  ⚠️  {section_number} - {section_title} (no URI found)")

            # Check for HTTP method headers (### GET, ### POST, etc.)
            elif re.match(r'^### (GET|POST|PUT|DELETE)$', line):
                method = line.replace('### ', '').strip()

                # Find the current section's URI by looking backwards
                current_uri = ""
                for back_i in range(i - 1, max(0, i - 50), -1):
                    if lines[back_i].startswith('##'):
                        # Found section start, extract URI from this section
                        section_content = '\n'.join(lines[back_i:i])
                        current_uri = self.extract_uri_from_section(section_content)
                        break

                new_lines.append(line)

                # Check if this specific method is NOT supported
                if current_uri:
                    method_supported = self.get_method_support(current_uri, method)
                    if not method_supported:
                        # Check if the API itself is supported (for context)
                        api_supported, _ = self.is_api_supported(current_uri)
                        if api_supported:  # Only add method restriction if API is otherwise supported
                            new_lines.append("")
                            new_lines.append(f"**NOT SUPPORTED by Canon EOS R50**")
                            new_lines.append("")
                            annotations_added += 1
                            print(f"    🚫 {method} method not supported for {current_uri}")
            else:
                new_lines.append(line)

            i += 1

        # Write the modified content back
        modified_content = '\n'.join(new_lines)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(modified_content)

        return annotations_added

    def process_all_markdown_files(self, markdown_dir: str) -> None:
        """Process all 4.* markdown files in the specified directory."""
        markdown_path = Path(markdown_dir)

        # Find all 4.* markdown files
        files = list(markdown_path.glob('4.*.md'))
        files.sort()

        if not files:
            print(f"No 4.* markdown files found in {markdown_dir}")
            return

        print(f"Found {len(files)} files to process:")
        for file in files:
            print(f"  - {file.name}")
        print()

        total_annotations = 0

        for file_path in files:
            print(f"Processing: {file_path.name}")
            annotations = self.annotate_markdown_file(str(file_path))
            total_annotations += annotations
            print(f"  Added {annotations} annotations\n")

        print(f"✨ Complete! Added {total_annotations} total annotations across {len(files)} files")

    def validate_annotations(self, markdown_dir: str) -> None:
        """Validate that annotations were added correctly."""
        markdown_path = Path(markdown_dir)
        files = list(markdown_path.glob('4.*.md'))

        supported_count = 0
        not_supported_count = 0

        for file_path in files:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Count annotations
            supported_matches = re.findall(r'\*\*Supported by Canon EOS R50\*\*', content)
            not_supported_matches = re.findall(r'\*\*NOT SUPPORTED by Canon EOS R50\*\*', content)

            supported_count += len(supported_matches)
            not_supported_count += len(not_supported_matches)

        print(f"\n📊 Validation Results:")
        print(f"  - Supported API annotations: {supported_count}")
        print(f"  - Method restriction annotations: {not_supported_count}")
        print(f"  - Total annotations: {supported_count + not_supported_count}")


def main():
    """Main entry point."""
    import sys

    if len(sys.argv) < 2:
        print("Usage: python3 annotate_r50_support.py <markdown_directory> [json_file]")
        print("\nExample:")
        print("  python3 annotate_r50_support.py CanonDocs/markdown/")
        sys.exit(1)

    markdown_dir = sys.argv[1]
    json_file = sys.argv[2] if len(sys.argv) > 2 else "CanonDocs/markdown/Canon_EOS_R50_supported_ccapi.json"

    if not os.path.exists(markdown_dir):
        print(f"Error: Markdown directory '{markdown_dir}' not found")
        sys.exit(1)

    if not os.path.exists(json_file):
        print(f"Error: JSON support file '{json_file}' not found")
        sys.exit(1)

    print("🔧 Canon EOS R50 Support Annotator")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"Markdown directory: {markdown_dir}")
    print(f"Support data file: {json_file}")
    print()

    try:
        annotator = R50SupportAnnotator(json_file)
        annotator.process_all_markdown_files(markdown_dir)
        annotator.validate_annotations(markdown_dir)

    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()