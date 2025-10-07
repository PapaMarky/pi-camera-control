#!/usr/bin/env python3
import argparse
import glob
import json
import os
import subprocess
import sys

def parse_args():
    parser = argparse.ArgumentParser(
        'Make a directory full of images into a video',
        description='Two modes: (1) JSON mode: use --json with timelapse report file, '
                    '(2) Legacy mode: use --source with --type for manual configuration')

    parser.add_argument('--fps', type=int,
                        help='Frames Per Second of video. (default: 24)',
                        default=24)
    parser.add_argument('--type', help='type of image file (extension: png, jpg, etc). Required in legacy mode, auto-detected in JSON mode.')
    parser.add_argument('--output', help='name / path of output file (default: "output.mov"). Cannot be used with --json.', default='output.mov')
    parser.add_argument('--source', help='path to directory holding images. Required in legacy mode, auto-detected in JSON mode.')
    parser.add_argument('--json', help='path to timelapse JSON report file. Enables JSON mode where title, source, and type are extracted from the report.')
    parser.add_argument('--skip', type=int, default=0,
                        help='Number of frames to skip. Default is zero. Zero frames are skipped, so all frames are '
                             'used. If set to 1, everyother frame is used; if set to 2, every 3rd frame is used; etc.')
    parser.add_argument('--open', action='store_true', help='Try to open movie when finished')
#    darkgroup = parser.add_argument_group('Using Darkframe to clean up dead / hot pixels')
#    darkgroup.add_argument('--darkframe', help='specify a "dark frame" to subract from each frame to '
#                                            'eliminate "hot pixels"')
#    darkgroup.add_argument('--threshold', '-t', type=int, default=7,
#                        help='Threshold determines how large of a defect to try to fix')

    return parser.parse_args()

print(sys.argv)

config = parse_args()

# Validate arguments
if config.json:
    # Using JSON file mode
    if config.output != 'output.mov':
        print('ERROR: Cannot specify --output when using --json (output name is derived from JSON title)')
        sys.exit(1)
    if config.source:
        print('ERROR: Cannot specify --source when using --json (source directory is derived from JSON)')
        sys.exit(1)

    # Load and parse JSON file
    if not os.path.isfile(config.json):
        print(f'ERROR: JSON file does not exist: {config.json}')
        sys.exit(1)

    try:
        with open(config.json, 'r') as f:
            report = json.load(f)
    except Exception as e:
        print(f'ERROR: Failed to parse JSON file: {e}')
        sys.exit(1)

    # Extract required fields
    if 'title' not in report:
        print('ERROR: JSON file missing required field: title')
        sys.exit(1)
    if 'results' not in report:
        print('ERROR: JSON file missing required field: results')
        sys.exit(1)
    if 'firstImageName' not in report['results'] or not report['results']['firstImageName']:
        print('ERROR: JSON file missing required field: results.firstImageName')
        sys.exit(1)
    if 'lastImageName' not in report['results'] or not report['results']['lastImageName']:
        print('ERROR: JSON file missing required field: results.lastImageName')
        sys.exit(1)

    # Extract image info from firstImageName (e.g., "100CANON/IMG_0001.JPG")
    first_image = report['results']['firstImageName']

    # Get parent directory from the JSON file's location
    json_dir = os.path.dirname(os.path.abspath(config.json))

    # Extract the camera folder from firstImageName (e.g., "100CANON" from "100CANON/IMG_0001.JPG")
    image_dir = os.path.dirname(first_image)
    if not image_dir:
        print(f'ERROR: firstImageName must include parent directory (e.g., "100CANON/IMG_0001.JPG"): {first_image}')
        sys.exit(1)

    # Extract extension from filename
    _, ext = os.path.splitext(first_image)
    if not ext:
        print(f'ERROR: Cannot determine image extension from: {first_image}')
        sys.exit(1)

    # Remove leading dot from extension
    ext = ext.lstrip('.')

    # Set derived values
    config.type = ext
    config.source = os.path.join(json_dir, image_dir)

    # Generate output filename: <title>-fps<fps>.mp4
    safe_title = report['title'].replace('/', '_').replace('\\', '_')
    config.output = f"{safe_title}-fps{config.fps}.mp4"

    print(f'Using JSON mode:')
    print(f'  Title: {report["title"]}')
    print(f'  Source directory: {config.source} (from firstImageName: {image_dir})')
    print(f'  Image type: {config.type}')
    print(f'  Output file: {config.output}')
    print(f'  First image: {first_image}')
    print(f'  Last image: {report["results"]["lastImageName"]}')

else:
    # Legacy mode: require --source and --type
    if not config.source:
        print('ERROR: --source is required when not using --json')
        sys.exit(1)
    if not config.type:
        print('ERROR: --type is required when not using --json')
        sys.exit(1)

IMAGE_DIR = config.source

# Import heavy dependencies after argument parsing
import cv2
from datetime import datetime, timedelta
# from pilapse.darkframe import apply_darkframe, get_contours

# darkframe = None if config.darkframe is None else cv2.imread(config.darkframe)

if not os.path.isdir(IMAGE_DIR):
    print(f'image dir does not exist or is not a directory.')
    sys.exit(1)

filelist = glob.glob(os.path.join(IMAGE_DIR, f'*.{config.type}') )
filelist.sort()
total = len(filelist)

if len(filelist) < 1:
    print(f'No files found in {IMAGE_DIR}')
    sys.exit(1)

img1 = cv2.imread(filelist[0])


height, width, _ = img1.shape
print(f'Image Size: {width} x {height} ({total} frames)')
# dark_contours = None
# if darkframe is not None:
#     dh, dw, _ = darkframe.shape
#     if dh != height or dw != width:
#         print(f'Dark frame size must match input images.')
#         sys.exit(1)
#     dark_contours, _ = get_contours(darkframe, threshold=config.threshold)

img1 = None

# choose codec according to format needed
#fourcc = cv2.VideoWriter_fourcc(*'mp4v')
#fourcc = cv2.VideoWriter_fourcc(*'avc1')
#video = cv2.VideoWriter('video.avi', fourcc, 1, (width, height))


fps = config.fps

capSize = (width,height) # this is the size of my source video
fourcc = cv2.VideoWriter_fourcc('m', 'p', '4', 'v') # note the lower case
video = cv2.VideoWriter()
success = video.open(config.output,fourcc,fps,capSize,True)

start = datetime.now()
count = 0

skipped = 0
loop_start = datetime.now()
for file in filelist:
    if skipped < config.skip:
        skipped += 1
        count += 1
        continue
    skipped = 0
    img = cv2.imread(file)
    if img is None:
        print(f'Could not load {file}')
        continue
#    if darkframe is not None:
#        img = apply_darkframe(img, dark_contours)
    video.write(img)

    count += 1
    now = datetime.now()
    elapsed = now - start
    if elapsed.total_seconds() > 10:
        start = now
        loop_elapsed = now - loop_start
        fps = count/loop_elapsed.total_seconds()
        x = (total / fps) - loop_elapsed.total_seconds()
        remaining = str(timedelta(seconds=x)).split('.')[0]
        print(f'{count:5}/{total:5} {count/total*100:2.0f}%: {file} {remaining}')

cv2.destroyAllWindows()
video.release()

print(f'video written to {config.output}')

if config.open:
    print(f' - Opening movie')
    subprocess.Popen(['open', config.output])