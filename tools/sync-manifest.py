#!/usr/bin/env python3
"""
Extract article metadata from HTML files and update manifest.js
This script is designed to be called from GitHub Actions workflows.
"""

import json
import re
import sys
import os
from pathlib import Path
from datetime import date as date_module

def extract_article_meta(html_file_path):
    """Extract metadata from an article HTML file."""
    try:
        with open(html_file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Match the script tag with id="article-meta"
        # Using [\s\S]*? to match across line boundaries
        pattern = r'<script[^>]+id=["\']article-meta["\'][^>]*>([\s\S]*?)</script>'
        match = re.search(pattern, content)
        
        if not match:
            print(f"  ⚠ No <script id=\"article-meta\"> found - skipping", file=sys.stderr)
            return None
        
        # Extract and parse the JSON
        json_str = match.group(1).strip()
        if not json_str:
            print(f"  ⚠ Empty <script id=\"article-meta\"> - skipping", file=sys.stderr)
            return None
        
        meta = json.loads(json_str)
        return meta
    
    except json.JSONDecodeError as e:
        print(f"  ⚠ Invalid JSON in <script id=\"article-meta\">: {e} - skipping", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  ⚠ Error reading file: {e} - skipping", file=sys.stderr)
        return None

def parse_manifest(manifest_path):
    """Parse manifest.js and return the list of entries."""
    with open(manifest_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract the JS array from window.LIBRARY_MANIFEST = [...];
    match = re.search(r'window\.LIBRARY_MANIFEST\s*=\s*(\[[\s\S]*?\])\s*;', content)
    if not match:
        raise ValueError("Could not parse manifest.js format")
    
    js_array_str = match.group(1)
    
    # Convert JS object literals to JSON
    # Replace unquoted keys with quoted keys: `id:` -> `"id":`
    json_str = re.sub(r'(\w+)\s*:', r'"\1":', js_array_str)
    
    entries = json.loads(json_str)
    return entries

def write_manifest(manifest_path, entries):
    """Write entries to manifest.js in the proper format."""
    # Build the JS assignment
    lines = ['// ═══════════════════════════════════════════════════════════',
             '//  LIBRARY MANIFEST — Add a new object for every article.',
             '//  Run the Article Makers to get the exact line to paste.',
             '// ═══════════════════════════════════════════════════════════',
             'window.LIBRARY_MANIFEST = [']
    
    for i, entry in enumerate(entries):
        lines.append('  {')
        lines.append(f'    id: "{entry["id"]}",')
        lines.append(f'    title: "{entry["title"]}",')
        lines.append(f'    category: "{entry["category"]}",')
        lines.append(f'    readTime: "{entry["readTime"]}",')
        lines.append(f'    desc: "{entry["desc"]}",')
        lines.append(f'    file: "{entry["file"]}",')
        lines.append(f'    date: "{entry["date"]}"')
        if i < len(entries) - 1:
            lines.append('  },')
        else:
            lines.append('  }')
    
    lines.append('];')
    
    with open(manifest_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

def build_manifest_entry(article_id, meta):
    """Build a manifest entry dict from metadata."""
    # Handle both 'desc' and 'description' keys
    desc = meta.get('desc', '') or meta.get('description', '')
    title = meta.get('title', '')
    category = meta.get('category', 'General')
    read_time = meta.get('readTime', '5 min')
    date = meta.get('date', '')
    
    # Use today's date if not set
    if not date:
        date = date_module.today().isoformat()
    
    entry = {
        'id': article_id,
        'title': title,
        'category': category,
        'readTime': read_time,
        'desc': desc,
        'file': f'articles/{article_id}.html',
        'date': date
    }
    
    return entry

def main():
    """Main function to sync articles with manifest."""
    articles_dir = Path('articles')
    manifest_path = Path('manifest.js')
    
    if not articles_dir.exists():
        print("Error: articles/ directory not found", file=sys.stderr)
        sys.exit(1)
    
    if not manifest_path.exists():
        print("Error: manifest.js not found", file=sys.stderr)
        sys.exit(1)
    
    # Parse existing manifest
    try:
        existing_entries = parse_manifest(manifest_path)
        existing_map = {e['id']: e for e in existing_entries}
        print(f"Existing manifest entries: {len(existing_entries)}")
    except Exception as e:
        print(f"Error parsing manifest: {e}", file=sys.stderr)
        sys.exit(1)
    
    added = 0
    updated = 0
    skipped = 0
    changes = []
    new_entries = []
    
    # Process each HTML file
    html_files = sorted(articles_dir.glob('*.html'))
    
    for html_file in html_files:
        article_id = html_file.stem
        print(f"\nProcessing: {html_file} (id: {article_id})")
        
        # Extract metadata
        meta = extract_article_meta(html_file)
        if meta is None:
            skipped += 1
            continue
        
        title = meta.get('title', '')
        category = meta.get('category', 'General')
        read_time = meta.get('readTime', '5 min')
        date = meta.get('date', '')
        
        if not date:
            date = date_module.today().isoformat()
        
        print(f"  Title:    {title}")
        print(f"  Category: {category}")
        print(f"  ReadTime: {read_time}")
        print(f"  Date:     {date}")
        
        # Build entry
        entry = build_manifest_entry(article_id, meta)
        new_entries.append(entry)
        
        if article_id in existing_map:
            print(f"  -> Already in manifest - checking for updates...")
            # Check if content changed
            old = existing_map[article_id]
            if (old.get('title') != entry['title'] or 
                old.get('category') != entry['category'] or
                old.get('readTime') != entry['readTime'] or
                old.get('desc') != entry['desc']):
                updated += 1
                changes.append(f"  ✏️ Updated: {article_id} ({title})")
            else:
                print(f"     (no changes detected)")
        else:
            print(f"  -> New article - adding to manifest...")
            added += 1
            changes.append(f"  ✅ Added: {article_id} ({title})")
    
    # Write the new manifest with all entries
    if new_entries:
        write_manifest(manifest_path, new_entries)
    
    # Output results for GitHub Actions
    print(f"\n=== Summary ===")
    print(f"Added:   {added}")
    print(f"Updated: {updated}")
    print(f"Skipped: {skipped}")
    if changes:
        print(f"Changes:")
        for change in changes:
            print(change)
    
    # Write outputs for GitHub Actions
    github_output = os.environ.get('GITHUB_OUTPUT')
    if github_output:
        with open(github_output, 'a', encoding='utf-8') as f:
            f.write(f"added={added}\n")
            f.write(f"updated={updated}\n")
            f.write(f"has_changes={'true' if (added + updated) > 0 else 'false'}\n")
    
    # Exit with error code if there were critical failures
    if skipped > 0 and added == 0 and updated == 0:
        sys.exit(1)

if __name__ == '__main__':
    main()
