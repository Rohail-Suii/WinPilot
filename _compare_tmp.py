#!/usr/bin/env python3
import difflib
import sys
import hashlib

file1 = r"d:\Freelance\My Projects\linkkdenjobapply\extension\background\service-worker.js"
file2 = r"d:\Freelance\My Projects\linkkdenjobapply\extension\dist\background.js"

# Read both files
with open(file1, 'r', encoding='utf-8') as f:
    content1 = f.read()

with open(file2, 'r', encoding='utf-8') as f:
    content2 = f.read()

# Check if files are identical by comparing hash
hash1 = hashlib.md5(content1.encode()).hexdigest()
hash2 = hashlib.md5(content2.encode()).hexdigest()

print(f"File 1: {file1}")
print(f"  Size: {len(content1)} bytes")
print(f"  Hash: {hash1}")
print(f"\nFile 2: {file2}")
print(f"  Size: {len(content2)} bytes")
print(f"  Hash: {hash2}")

if content1 == content2:
    print("\n✓ Files are IDENTICAL")
else:
    print("\n✗ Files are DIFFERENT")
    lines1 = content1.splitlines(keepends=True)
    lines2 = content2.splitlines(keepends=True)
    
    print(f"\nLine count: {len(lines1)} vs {len(lines2)}")
    
    diff = difflib.unified_diff(lines1, lines2, fromfile='service-worker.js', tofile='background.js', lineterm='')
    diff_list = list(diff)
    
    if diff_list:
        print(f"\nShowing first 100 diff lines:")
        for i, line in enumerate(diff_list[:100]):
            print(line)
        if len(diff_list) > 100:
            print(f"\n... and {len(diff_list) - 100} more diff lines")
    else:
        print("\nNo differences found")
