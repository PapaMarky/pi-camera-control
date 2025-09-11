#!/usr/bin/env python3
"""
PDF Structure Examiner
Examines a PDF to understand its structure and find potential section breaks.
"""

import sys
import os
from PyPDF2 import PdfReader

def examine_pdf(input_path):
    """Examine PDF structure and content."""
    
    try:
        reader = PdfReader(input_path)
        total_pages = len(reader.pages)
        print(f"PDF has {total_pages} pages")
        
        # Check for bookmarks
        if reader.outline:
            print(f"Found {len(reader.outline)} top-level bookmarks")
            for i, bookmark in enumerate(reader.outline[:10]):  # Show first 10
                print(f"  {i+1}: {bookmark.title}")
            if len(reader.outline) > 10:
                print(f"  ... and {len(reader.outline) - 10} more")
        else:
            print("No bookmarks found")
        
        # Check metadata
        if reader.metadata:
            print("\nMetadata:")
            for key, value in reader.metadata.items():
                print(f"  {key}: {value}")
        
        # Sample first few pages to look for TOC
        print(f"\nSampling first 20 pages for table of contents patterns:")
        toc_patterns = []
        
        for page_num in range(min(20, total_pages)):
            try:
                page = reader.pages[page_num]
                text = page.extract_text()
                
                # Look for common TOC patterns
                lines = text.split('\n')
                for line in lines:
                    line = line.strip()
                    # Look for lines with page numbers at the end
                    if line and (line.endswith('...') or 
                               any(line.endswith(f'...{i}') for i in range(1, 1000)) or
                               any(line.endswith(f'{i}') and line[:-len(str(i))].strip().endswith('.') 
                                   for i in range(1, 1000))):
                        toc_patterns.append((page_num + 1, line))
                        
            except Exception as e:
                print(f"Error reading page {page_num + 1}: {e}")
        
        if toc_patterns:
            print(f"Found {len(toc_patterns)} potential TOC entries:")
            for page, pattern in toc_patterns[:15]:  # Show first 15
                print(f"  Page {page}: {pattern[:80]}...")
            if len(toc_patterns) > 15:
                print(f"  ... and {len(toc_patterns) - 15} more")
        else:
            print("No obvious TOC patterns found")
            
        # Sample some middle pages to understand content structure
        print(f"\nSampling content from pages 50, 100, 200 for structure:")
        sample_pages = [49, 99, 199]  # 0-based
        
        for page_num in sample_pages:
            if page_num < total_pages:
                try:
                    page = reader.pages[page_num]
                    text = page.extract_text()
                    lines = text.split('\n')[:10]  # First 10 lines
                    print(f"\nPage {page_num + 1} sample:")
                    for line in lines:
                        if line.strip():
                            print(f"  {line.strip()[:80]}")
                except Exception as e:
                    print(f"Error reading page {page_num + 1}: {e}")
        
        return True
        
    except Exception as e:
        print(f"Error examining PDF: {e}")
        return False

def main():
    if len(sys.argv) != 2:
        print("Usage: python examine_pdf.py <input_pdf>")
        sys.exit(1)
    
    input_pdf = sys.argv[1]
    
    if not os.path.exists(input_pdf):
        print(f"Error: Input file '{input_pdf}' not found")
        sys.exit(1)
    
    print(f"Examining {input_pdf}...")
    examine_pdf(input_pdf)

if __name__ == "__main__":
    main()