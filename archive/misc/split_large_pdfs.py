#!/usr/bin/env python3
"""
Split large PDF sections into smaller chunks for better readability
"""

import sys
import os
from pathlib import Path
from PyPDF2 import PdfReader, PdfWriter
import argparse

def get_file_size_mb(file_path):
    """Get file size in MB"""
    return os.path.getsize(file_path) / (1024 * 1024)

def split_pdf_by_pages(input_path, output_dir, pages_per_chunk=25):
    """Split a PDF into chunks of specified page count"""
    try:
        reader = PdfReader(input_path)
        total_pages = len(reader.pages)
        
        if total_pages <= pages_per_chunk:
            print(f"Skipping {input_path.name}: only {total_pages} pages")
            return []
        
        print(f"Splitting {input_path.name} ({total_pages} pages) into chunks of {pages_per_chunk} pages")
        
        output_files = []
        chunk_number = 1
        
        for start_page in range(0, total_pages, pages_per_chunk):
            end_page = min(start_page + pages_per_chunk, total_pages)
            
            # Create chunk filename
            base_name = input_path.stem
            chunk_filename = f"{base_name}_part{chunk_number:02d}_pages{start_page+1}-{end_page}.pdf"
            chunk_path = output_dir / chunk_filename
            
            # Create writer for this chunk
            writer = PdfWriter()
            
            # Add pages to this chunk
            for page_idx in range(start_page, end_page):
                writer.add_page(reader.pages[page_idx])
            
            # Write the chunk
            with open(chunk_path, 'wb') as output_file:
                writer.write(output_file)
            
            chunk_size_mb = get_file_size_mb(chunk_path)
            print(f"  Created {chunk_filename} ({chunk_size_mb:.1f} MB, {end_page - start_page} pages)")
            output_files.append(chunk_path)
            
            chunk_number += 1
        
        return output_files
        
    except Exception as e:
        print(f"Error splitting {input_path}: {e}")
        return []

def process_large_pdfs(input_dir, size_threshold_mb=0.5, pages_per_chunk=25):
    """Process all PDFs larger than threshold"""
    input_path = Path(input_dir)
    
    if not input_path.exists():
        print(f"Directory {input_dir} does not exist")
        return
    
    # Find large PDFs
    large_pdfs = []
    for pdf_file in input_path.glob("*.pdf"):
        size_mb = get_file_size_mb(pdf_file)
        if size_mb > size_threshold_mb:
            large_pdfs.append((pdf_file, size_mb))
    
    if not large_pdfs:
        print(f"No PDFs larger than {size_threshold_mb} MB found")
        return
    
    print(f"Found {len(large_pdfs)} PDFs larger than {size_threshold_mb} MB:")
    for pdf_file, size_mb in large_pdfs:
        print(f"  {pdf_file.name}: {size_mb:.1f} MB")
    
    print(f"\\nSplitting large PDFs into chunks of {pages_per_chunk} pages...")
    
    # Process each large PDF
    total_created = 0
    for pdf_file, size_mb in large_pdfs:
        print(f"\\nProcessing {pdf_file.name} ({size_mb:.1f} MB)...")
        
        chunks = split_pdf_by_pages(pdf_file, input_path, pages_per_chunk)
        
        if chunks:
            print(f"  Successfully split into {len(chunks)} chunks")
            total_created += len(chunks)
            
            # Move original file to backup
            backup_name = pdf_file.stem + "_ORIGINAL.pdf"
            backup_path = input_path / backup_name
            pdf_file.rename(backup_path)
            print(f"  Original moved to {backup_name}")
        else:
            print(f"  Failed to split {pdf_file.name}")
    
    print(f"\\nSummary: Created {total_created} smaller PDF chunks")

def main():
    parser = argparse.ArgumentParser(description="Split large PDF sections into smaller chunks")
    parser.add_argument("input_dir", help="Directory containing PDF files to process")
    parser.add_argument("--size-threshold", type=float, default=0.5, 
                       help="Size threshold in MB for splitting (default: 0.5)")
    parser.add_argument("--pages-per-chunk", type=int, default=25,
                       help="Number of pages per chunk (default: 25)")
    
    args = parser.parse_args()
    
    process_large_pdfs(args.input_dir, args.size_threshold, args.pages_per_chunk)

if __name__ == "__main__":
    main()