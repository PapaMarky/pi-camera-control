
# TODO 
* When AWB(?) is colortemperature, I should be able to select the color temperature to use.
  * FIND THE ccapi endpoints
* Improve time sync:
  * allow sync from wlan
  * If pi is reliablity gets low AND not running a timelapse, sync pi from camera.
  * relability, high to low: client on ap, client on wan, camera, pi
* Camera controls
  * Turn off / on screen
  * Turn off / on viewfinder.
* Photo time: min, ave, max
  * More info about how long photos are taking when setting up for timelapse.
* During timelapse:
  * Test shot, live view and settings update should be disabled (they could interfere with the timelapse)
* Without camera connected:
  * Should be able to view images in "test shot". We need to rethink the UI. Add separate "view images" function?
* First image captured should be stored as both first and last. Subsequent images update last.

## Completed
* ~~File names in timelapse report should include directory name. (not full path)~~ FIXED
  * "/ccapi/ver110/contents/sd/100CANON/IMG_0042.JPG" → "100CANON/IMG_0042.JPG"
* ~~Camera showed low battery, UI showed 100%.~~ FIXED: Using ver100/battery endpoint now


rsync -avz --exclude='.git' --exclude='node_modules' --exclude='*.log' --exclude='.DS_Store' .  pi@picontrol-002.local:/home/pi/pi-camera-control/

iw reg set JP

# Boot a bricked Pi
For Raspberry Pi, you can add these parameters to /boot/cmdline.txt to boot in safe mode or recovery mode:

Safe mode options:
- init=/bin/bash - Boot to a basic shell
- single - Boot to single-user mode
- 3 - Boot to runlevel 3 (text mode, no GUI)

For your specific situation (WiFi issue):
- systemd.mask=hostapd.service - Prevent hostapd from starting
- systemd.mask=NetworkManager.service - Prevent NetworkManager from starting
- net.ifnames=0 - Use old-style interface names

Most common safe boot:
Add init=/bin/bash to the end of the existing line in /boot/cmdline.txt

This will boot you to a root shell where you can fix the WiFi configuration before normal services start.


console=serial0,115200 console=tty1 root=PARTUUID=6152dc80-02 rootfstype=ext4 fsck.repair=yes rootwait ipv6.disable\
=1 cfg80211.ieee80211_regdom=JP

Wi-Fi is currently blocked by rfkill.
Use raspi-config to set the country before ues.


We are in the process of converting the CCAPI documentation to markdown format and are working on chapter 4, section 5. We are working from
source text documents in CanonDocs/text. The text documents are generated from PDF so are poorly formatted and difficult to understand.

Convert "CanonDocs/text/4.5. Camera Settings A.txt" to markdown. Put the converted file into "CanonDocs/markdown/4.5. Camera Settings A.md"
Our goal in converting to markdown is to make the documents easier to read and understand so we can use them as a resource for the
pi-camera-controller project. Our goal does not include making any improvements or corrections to the original text of the source documents. 
IMPORTANT: We want the markdown to be identical to the source text documents so that I
can easily compare the generated documents to the originals. The source documents have spelling errors. Keep a list of spelling errors that you
notice, BUT DO NOT FIX THEM in the markdown. Exeptions: The original document contains Japanese versions of "[", "]", and "...".
Convert these Japanese characters to the English forms. 
IMPORTANT: There are
JSON examples through out the original document. These are just examples and are sometimes partial. They are not necessarily correctly
formatted. DO NOT FIX JSON FORMATTING ERRORS. For each converted documment, create an errata document listing your findings so I can 
check and fix them by hand. Include and Japanese characters other than the ones listed above. Entries in the errata document
should include at least: 1) the line number within the generated markdown file where the error can be found in the markdown, 2) a discription
of the error, 3) the text of the markdown file surrounding the error. The purpose of the errata entries is to help me find 
the errors _IN THE GENERATED MARKDOWN_ so that I can review them.

----
Claude was having trouble staying on task when we worked on this yesterday. I think it was
because section 4.5 is too large for claude to keep in "memory". I am in the process of splitting section 4.5 into smaller documents. Use
@"CanonDocs/markdown/4.5. Camera Settings A.md" as an example of how to format the output and @"CanonDocs/text/4.5. Camera Settings A.txt"
as an example of the input. And then convert @"CanonDocs/text/4.5. Camera Settings B.txt"

----

We have a text file containing detailed documentation about Canon's CCAPI which would be a valuable resource while 
working on pi-camera-controller. The text file was generated from PDF, and so the formatting is difficult to read and 
understand. Our ultimate goal is to convert the file to markdown so that it is easier to read. 

The file is too large for claude's Read command to ingest. (> 2000 lines) Our immediate goal is to break the large file
down into a set of files that are small enough for claude to Read and then convert into markdown. 

The actual conversion to markdown will come later, but when we choose a size for the split files (sub-files), we need to 
be aware that the new sub-files will be used to generate markdown, and the resulting markdown must also be small enough 
for claude's Read command.

The source file contains clearly defined sections. Each section begins with a well-defined section header of the form:
"4.9.1.     Get all shooting parameters" where "4.9.1" is the section number. I want each sub-file to start with a
section header.

I propose that we write a python script that splits the file using a multi-pass approach. Pass one would build an index
with all the section headers and the line number where the section header was found. From that index the script would 
determine which section headers will start new sub-files. Then pass two would open a the first subfile, write the
lines of the source file up to the first section header determined to start a new subfile at which point it would start
a new output file.

Analyse my proposal and offer one or more improved counterproposals. IMPORTANT: Each counterproposal must work with
the limitations of the Read command and limitations of any other of claude's tools that I might not be aware of.