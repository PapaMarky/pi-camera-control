#!/usr/bin/env python3
"""
PDF Splitter using Table of Contents
Splits a PDF into sections based on the embedded table of contents/bookmarks.
"""

import sys
import os
import re
from pathlib import Path
from PyPDF2 import PdfReader, PdfWriter

def sanitize_filename(title):
    """Convert bookmark title to a safe filename."""
    # Remove or replace invalid filename characters
    title = re.sub(r'[^\w\s-]', '', title)
    title = re.sub(r'[-\s]+', '_', title)
    return title.strip('_').lower()

def get_page_number(reader, destination):
    """Extract page number from a bookmark destination."""
    try:
        if hasattr(destination, 'page'):
            # Get the page object
            page_ref = destination.page
            
            # Handle indirect object reference
            if hasattr(page_ref, 'get_object'):
                page_obj = page_ref.get_object()
            else:
                page_obj = page_ref
            
            # Find page index
            for i, page in enumerate(reader.pages):
                if page == page_obj:
                    return i
                    
        elif isinstance(destination, list) and len(destination) > 0:
            # Indirect page reference
            page_obj = destination[0]
            if hasattr(page_obj, 'get_object'):
                page_obj = page_obj.get_object()
            
            for i, page in enumerate(reader.pages):
                if page == page_obj:
                    return i
    except Exception as e:
        print(f"Error getting page number: {e}")
    return None

def extract_bookmarks(reader, bookmarks=None, level=0):
    """Recursively extract bookmarks and their page numbers."""
    if bookmarks is None:
        bookmarks = reader.outline
    
    sections = []
    
    for item in bookmarks:
        if isinstance(item, list):
            # Nested bookmarks
            sections.extend(extract_bookmarks(reader, item, level + 1))
        else:
            # Individual bookmark
            try:
                title = item.title
                page_num = get_page_number(reader, item)
                
                if page_num is not None:
                    sections.append({
                        'title': title,
                        'page': page_num,
                        'level': level,
                        'filename': sanitize_filename(title)
                    })
            except AttributeError:
                # Handle different bookmark object types
                print(f"Skipping bookmark item: {type(item)}")
                continue
    
    return sections

def split_pdf_by_toc(input_path, output_dir, max_level=2):
    """Split PDF based on table of contents."""
    
    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    try:
        reader = PdfReader(input_path)
        total_pages = len(reader.pages)
        print(f"Input PDF has {total_pages} pages")
        
        # Extract bookmarks
        sections = extract_bookmarks(reader)
        
        if not sections:
            print("No bookmarks found in PDF")
            return False
        
        # Filter sections by level and sort by page number
        filtered_sections = [s for s in sections if s['level'] <= max_level]
        filtered_sections.sort(key=lambda x: x['page'])
        
        print(f"Found {len(filtered_sections)} sections to extract:")
        for section in filtered_sections:
            print(f"  {'  ' * section['level']}{section['title']} (page {section['page'] + 1})")
        
        # Create sections
        for i, section in enumerate(filtered_sections):
            start_page = section['page']
            
            # Determine end page (start of next section or end of document)
            if i + 1 < len(filtered_sections):
                end_page = filtered_sections[i + 1]['page']
            else:
                end_page = total_pages
            
            # Create filename with level prefix for organization
            level_prefix = f"{section['level']:02d}"
            filename = f"{level_prefix}_{section['filename']}.pdf"
            output_filename = output_path / filename
            
            try:
                writer = PdfWriter()
                
                # Add pages
                for page_num in range(start_page, end_page):
                    writer.add_page(reader.pages[page_num])
                
                # Write file
                with open(output_filename, 'wb') as output_file:
                    writer.write(output_file)
                
                pages_count = end_page - start_page
                print(f"Created {filename} ({pages_count} pages: {start_page + 1}-{end_page})")
                
            except Exception as e:
                print(f"Error creating {filename}: {e}")
        
        return True
        
    except Exception as e:
        print(f"Error processing PDF: {e}")
        return False

def main():
    if len(sys.argv) < 3 or len(sys.argv) > 4:
        print("Usage: python split_pdf_toc.py <input_pdf> <output_directory> [max_level]")
        print("  max_level: Maximum bookmark level to include (default: 2)")
        print("Example: python split_pdf_toc.py manual.pdf ./sections/ 1")
        sys.exit(1)
    
    input_pdf = sys.argv[1]
    output_dir = sys.argv[2]
    max_level = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    
    if not os.path.exists(input_pdf):
        print(f"Error: Input file '{input_pdf}' not found")
        sys.exit(1)
    
    print(f"Splitting {input_pdf} using table of contents (max level: {max_level})")
    success = split_pdf_by_toc(input_pdf, output_dir, max_level)
    
    if success:
        print("PDF splitting completed successfully!")
    else:
        print("PDF splitting failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()