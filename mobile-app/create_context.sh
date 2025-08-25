#!/bin/bash

# ==============================================================================
#  create_context.sh
#  A script to gather project source code into a single context file.
# ==============================================================================

# --- Configuration ---

# List of files and directories to include in the output.
# These are the top-level items we want to search within.
# We use ../ to look one directory up for 'supabase' and 'README.md'
INCLUDE_PATHS="app ../supabase package.json app.json babel.config.js tsconfig.json ../README.md"

# The name of the final output file.
OUTPUT_FILE="project_context.txt"

# --- Safety Check ---

# This script needs to be run from the root of your project directory.
# We'll check for a key file like 'package.json' to make sure.
if [ ! -f "package.json" ]; then
    echo "Error: 'package.json' not found in the current directory."
    echo "Please 'cd' into your project's root directory (e.g., 'mobile-app') and run this script again."
    exit 1
fi

echo "✅ Project root confirmed ('package.json' found)."
echo "Gathering files... this may take a moment."

# --- Execution ---

# Create or clear the output file to ensure we start fresh.
> "$OUTPUT_FILE"

# The core logic: find files based on INCLUDE_PATHS, excluding specified patterns.
find $INCLUDE_PATHS \
  -path '*/node_modules/*' -prune -o \
  -path '*/.expo/*' -prune -o \
  -path '*/.git/*' -prune -o \
  -name '*.lock' -prune -o \
  -name '.env*' -prune -o \
  -path 'supabase/functions/_shared/gemini-srvc.ts' -prune -o \
  -type f -print | while read -r file; do
    {
      echo "---"
      echo "File: $file"
      echo "---"
      cat "$file"
      echo
    } >> "$OUTPUT_FILE"
done

# --- Verification ---

# Check if the file was created and has content.
if [ -s "$OUTPUT_FILE" ]; then
    LINE_COUNT=$(wc -l < "$OUTPUT_FILE" | xargs) # xargs trims whitespace
    echo "🎉 Success! Project context has been written to $OUTPUT_FILE"
    echo "   The file contains $LINE_COUNT lines of text."
else
    echo "⚠️ Warning: The output file '$OUTPUT_FILE' was created but is empty."
    echo "   Please check your INCLUDE_PATHS variable in the script and ensure"
    echo "   the source files actually exist."
fi