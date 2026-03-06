# Canvas M8 Content Shifter

Automatically manages Canvas M8 timeline by shifting old content right and deleting ancient entries.

## Timeline Layout

```
[Zone 1: Active]  →  [Zone 2: Previous]  →  [Zone 3: Older]  →  [DELETED]
   (x=0-800)            (x=920-1720)          (x=1840-2640)
      ↓ 120px padding       ↓ 120px padding
```

- **Zone 1** (0-800): Latest content + Eyeball indicator (800px wide)
- **Padding** (800-920): 120px gap
- **Zone 2** (920-1720): Previous entry (800px wide)
- **Padding** (1720-1840): 120px gap
- **Zone 3** (1840-2640): Older entry (800px wide)
- **Beyond 2760**: Auto-deleted

## Usage

### Shift content before adding new:

```bash
cd ~/build/canvas-m8
python3 bin/shift_content.py
```

### Options:

```bash
# Custom shift amount (default is 920)
python3 bin/shift_content.py --amount 1000

# Keep more/fewer entries (default is 3)
python3 bin/shift_content.py --max-entries 5

# Dry run (preview changes)
python3 bin/shift_content.py --dry-run

# Include eyeball in shift (usually don't do this)
python3 bin/shift_content.py --include-eyeball

# Only shift content up to X coordinate
python3 bin/shift_content.py --max-x 2000
```

## Integration with Ambiguity Loop

The ambiguity loop can call this before posting updates:

```python
import subprocess

# Shift existing content right
subprocess.run([
    "python3", 
    "/home/rsbohn/build/canvas-m8/bin/shift_content.py"
])

# Now post new content at x=100-1000
# ...
```

## Configuration

Edit `bin/shift_content.py` to change defaults:

```python
ACTIVE_WIDTH = 800               # pixels wide for active area
PADDING = 120                    # pixels padding between entries
DEFAULT_SHIFT_AMOUNT = 920       # ACTIVE_WIDTH + PADDING
MAX_ENTRIES = 3                  # keep only this many entries
ENTRY_WIDTH = 920                # each entry zone width
```
