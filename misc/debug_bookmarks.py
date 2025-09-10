#!/usr/bin/env python3
"""
Debug PDF bookmarks structure
"""

import sys
from PyPDF2 import PdfReader

def debug_bookmarks(input_path):
    reader = PdfReader(input_path)
    
    print(f"PDF has {len(reader.pages)} pages")
    print(f"Outline type: {type(reader.outline)}")
    print(f"Outline length: {len(reader.outline) if reader.outline else 0}")
    
    if reader.outline:
        for i, item in enumerate(reader.outline[:5]):
            print(f"\nBookmark {i}:")
            print(f"  Type: {type(item)}")
            print(f"  Dir: {dir(item)[:10]}...")  # First 10 attributes
            
            if hasattr(item, 'title'):
                print(f"  Title: {item.title}")
            if hasattr(item, 'page'):
                print(f"  Page: {item.page}")
            if hasattr(item, 'get'):
                print(f"  Keys: {list(item.keys()) if hasattr(item, 'keys') else 'No keys'}")

if __name__ == "__main__":
    debug_bookmarks(sys.argv[1])