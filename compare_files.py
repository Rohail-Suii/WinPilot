#!/usr/bin/env python3
import difflib
import sys

file1 = r"d:\Freelance\My Projects\linkkdenjobapply\extension\background\service-worker.js"
file2 = r"d:\Freelance\My Projects\linkkdenjobapply\extension\dist\background.js"

# Read both files
with open(file1, 'r', encoding='utf-8') as f:
    content1 = f.readlines()

with open(file2, 'r', encoding='utf-8') as f:
    content2 = f.readlines()

# Check if files are identical
if content1 == content2:
    print("✓ Files are IDENTICAL")
    sys.exit(0)

# Files are different - show differences
print("✗ Files are DIFFERENT\n")
print(f"File 1: {file1}")
print(f"  Lines: {len(content1)}")
print(f"File 2: {file2}")
print(f"  Lines: {len(content2)}\n")

# Generate unified diff
diff = difflib.unified_diff(content1, content2, lineterm='', 
                           fromfile='service-worker.js', tofile='background.js')

print("=" * 80)
print("DIFFERENCES:")
print("=" * 80)

diff_lines = list(diff)
if diff_lines:
    for line in diff_lines:
        print(line)
else:
    print("No differences found (possibly whitespace only)")

# Also check for whitespace-only differences
content1_stripped = [line.rstrip() for line in content1]
content2_stripped = [line.rstrip() for line in content2]

if content1_stripped == content2_stripped:
    print("\n" + "=" * 80)
    print("NOTE: Files differ only in trailing whitespace or line endings")
    print("=" * 80)

# Summary statistics
num_lines_added = len([line for line in diff_lines if line.startswith('+')])
num_lines_removed = len([line for line in diff_lines if line.startswith('-')])
num_lines_changed = max(num_lines_added, num_lines_removed)

print("\n" + "=" * 80)
print(f"Summary: {num_lines_changed} lines differ")
print("=" * 80)
