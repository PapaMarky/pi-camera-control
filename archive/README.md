# Archive

This directory contains legacy code, proof-of-concepts, and unrelated utilities that are preserved for reference but not part of the active codebase.

## Directories

### `poc/` - Proof of Concept
Contains the original Python implementation that was used to validate the concept before the Node.js rewrite.

#### `interval.py`
Original Python intervalometer implementation using Canon CCAPI.

**Historical significance:**
- First working implementation of Canon R50 intervalometer
- Validated CCAPI endpoints and timing requirements
- Established manual focus and long exposure techniques

**Status:** Superseded by Node.js implementation in `src/`

### `misc/` - Miscellaneous Utilities
Contains various utility scripts that are unrelated to camera control.

#### `copy-timelapse-images.sh`
Script for manually copying timelapse images between locations.

#### PDF Utilities
- `debug_bookmarks.py` - PDF bookmark debugging
- `examine_pdf.py` - PDF structure analysis
- `split_large_pdfs.py` - PDF splitting utility
- `split_pdf_toc.py` - PDF table of contents processing

**Note:** These PDF utilities appear to be unrelated to the camera control project and may have been included accidentally.

## Purpose

This archive serves to:

1. **Preserve development history** - Shows evolution from Python PoC to Node.js production
2. **Maintain reference implementations** - Original Python code may be useful for comparison
3. **Avoid data loss** - Rather than deleting potentially useful code, archive it
4. **Clean active codebase** - Remove non-essential files from main project

## Usage

These files are **not** part of the active Pi Camera Control system and should not be executed on production systems.

For reference or testing purposes only:
```bash
# Example: Run original Python PoC (requires Python dependencies)
cd archive/poc/
python3 interval.py --help
```

## Maintenance

Files in this archive should:
- Be kept for historical reference
- Not be modified unless absolutely necessary
- Not be included in production builds or Debian packages
- Be periodically reviewed for relevance