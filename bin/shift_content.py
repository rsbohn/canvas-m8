#!/usr/bin/env python3
"""
Canvas M8 Content Shifter

Shifts existing content to the right to make room for new content,
while keeping the eyeball in place for visual continuity.
"""

import json
import urllib.request
from typing import Optional


CANVAS_URL = "http://localhost:6809"
EYEBALL_ID_PREFIX = "pi-agent-eyeball"
ACTIVE_WIDTH = 800  # pixels wide for active area
PADDING = 120  # pixels padding between entries
DEFAULT_SHIFT_AMOUNT = ACTIVE_WIDTH + PADDING  # 920 pixels total shift
MAX_ENTRIES = 3  # keep only this many entries
ENTRY_WIDTH = DEFAULT_SHIFT_AMOUNT  # each entry zone width


def get_board() -> dict:
    """Fetch the current board state."""
    req = urllib.request.Request(f"{CANVAS_URL}/api/board")
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read())


def put_board(board: dict) -> bool:
    """Save the board state."""
    data = json.dumps(board).encode('utf-8')
    req = urllib.request.Request(
        f"{CANVAS_URL}/api/board",
        data=data,
        headers={"Content-Type": "application/json"},
        method="PUT"
    )
    
    with urllib.request.urlopen(req) as response:
        return response.status == 200


def is_eyeball_element(element: dict) -> bool:
    """Check if an element is part of the eyeball."""
    element_id = element.get("id", "")
    return element_id.startswith(EYEBALL_ID_PREFIX)


def shift_content_right(shift_amount: int = DEFAULT_SHIFT_AMOUNT, 
                        exclude_eyeball: bool = True,
                        max_x: Optional[int] = None,
                        max_entries: int = MAX_ENTRIES) -> dict:
    """
    Shift all canvas content to the right and delete old entries.
    
    Args:
        shift_amount: Pixels to shift right
        exclude_eyeball: If True, don't move eyeball elements
        max_x: Only shift elements with x <= max_x (None = shift all)
        max_entries: Maximum number of entries to keep (delete older)
    
    Returns:
        dict with 'shifted', 'deleted', 'skipped', 'total' counts
    """
    board = get_board()
    elements = board.get("elements", [])
    
    # Calculate deletion threshold
    # After shifting, anything beyond (max_entries * ENTRY_WIDTH) gets deleted
    delete_threshold = max_entries * ENTRY_WIDTH
    
    shifted = 0
    deleted = 0
    skipped = 0
    
    for element in elements:
        # Skip already deleted elements
        if element.get("isDeleted", False):
            continue
        
        # Skip eyeball if requested
        if exclude_eyeball and is_eyeball_element(element):
            skipped += 1
            continue
        
        # Skip elements beyond max_x threshold (don't shift or delete)
        if max_x is not None and element.get("x", 0) > max_x:
            skipped += 1
            continue
        
        # Shift the element first
        old_x = element.get("x", 0)
        new_x = old_x + shift_amount
        element["x"] = new_x
        shifted += 1
        
        # Delete if beyond threshold after shifting
        if new_x > delete_threshold:
            element["isDeleted"] = True
            deleted += 1
    
    # Save the board
    success = put_board(board)
    
    return {
        "success": success,
        "shifted": shifted,
        "deleted": deleted,
        "skipped": skipped,
        "total": len([e for e in elements if not e.get("isDeleted", False)])
    }


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Shift Canvas M8 content to the right")
    parser.add_argument("--amount", type=int, default=DEFAULT_SHIFT_AMOUNT,
                       help=f"Pixels to shift right (default: {DEFAULT_SHIFT_AMOUNT})")
    parser.add_argument("--max-entries", type=int, default=MAX_ENTRIES,
                       help=f"Maximum entries to keep (default: {MAX_ENTRIES})")
    parser.add_argument("--include-eyeball", action="store_true",
                       help="Also shift the eyeball (default: keep it in place)")
    parser.add_argument("--max-x", type=int,
                       help="Only shift elements with x <= max_x")
    parser.add_argument("--dry-run", action="store_true",
                       help="Show what would be done without doing it")
    
    args = parser.parse_args()
    
    delete_threshold = args.max_entries * ENTRY_WIDTH
    
    if args.dry_run:
        board = get_board()
        elements = [e for e in board.get("elements", []) if not e.get("isDeleted", False)]
        
        print(f"[DRY RUN] Would shift content by {args.amount} pixels")
        print(f"Maximum entries: {args.max_entries} (delete beyond x={delete_threshold})")
        print(f"Total active elements: {len(elements)}")
        
        to_shift = 0
        to_delete = 0
        to_skip = 0
        
        for element in elements:
            if not args.include_eyeball and is_eyeball_element(element):
                to_skip += 1
                continue
            if args.max_x is not None and element.get("x", 0) > args.max_x:
                to_skip += 1
                continue
            
            new_x = element.get("x", 0) + args.amount
            to_shift += 1
            
            if new_x > delete_threshold:
                to_delete += 1
        
        print(f"Would shift: {to_shift}")
        print(f"Would delete: {to_delete}")
        print(f"Would skip: {to_skip}")
        return
    
    print(f"Shifting Canvas M8 content by {args.amount} pixels...")
    print(f"Keeping {args.max_entries} entries (deleting beyond x={delete_threshold})")
    
    result = shift_content_right(
        shift_amount=args.amount,
        exclude_eyeball=not args.include_eyeball,
        max_x=args.max_x,
        max_entries=args.max_entries
    )
    
    if result["success"]:
        print(f"✓ Content shifted successfully")
        print(f"  Shifted: {result['shifted']} elements")
        print(f"  Deleted: {result['deleted']} old elements")
        print(f"  Skipped: {result['skipped']} elements")
        print(f"  Remaining: {result['total']} elements")
    else:
        print("✗ Failed to update board")


if __name__ == "__main__":
    main()
