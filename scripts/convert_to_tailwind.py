#!/usr/bin/env python3
"""
Auto-convert styled-components to Tailwind CSS.
Handles common patterns and leaves complex cases as inline styles.
"""

import re
import sys
from pathlib import Path

def convert_css_to_tailwind(css_block):
    """Convert CSS properties to Tailwind classes."""
    classes = []
    
    # Display
    if re.search(r'display:\s*flex', css_block):
        classes.append('flex')
    if re.search(r'display:\s*inline-flex', css_block):
        classes.append('inline-flex')
    if re.search(r'display:\s*grid', css_block):
        classes.append('grid')
    if re.search(r'display:\s*none', css_block):
        classes.append('hidden')
        
    # Flex direction
    if re.search(r'flex-direction:\s*column', css_block):
        classes.append('flex-col')
    if re.search(r'flex-direction:\s*row', css_block):
        classes.append('flex-row')
        
    # Alignment
    if re.search(r'align-items:\s*center', css_block):
        classes.append('items-center')
    if re.search(r'align-items:\s*flex-start', css_block):
        classes.append('items-start')
    if re.search(r'align-items:\s*flex-end', css_block):
        classes.append('items-end')
    if re.search(r'align-items:\s*stretch', css_block):
        classes.append('items-stretch')
        
    # Justify content
    if re.search(r'justify-content:\s*center', css_block):
        classes.append('justify-center')
    if re.search(r'justify-content:\s*space-between', css_block):
        classes.append('justify-between')
    if re.search(r'justify-content:\s*flex-start', css_block):
        classes.append('justify-start')
    if re.search(r'justify-content:\s*flex-end', css_block):
        classes.append('justify-end')
        
    # Flex properties
    if re.search(r'flex:\s*1', css_block):
        classes.append('flex-1')
    if re.search(r'flex-shrink:\s*0', css_block):
        classes.append('shrink-0')
        
    # Gap
    gap_match = re.search(r'gap:\s*(\d+)px', css_block)
    if gap_match:
        px = int(gap_match.group(1))
        classes.append(f'gap-{px//4}')
        
    # Padding
    padding_match = re.search(r'padding:\s*(\d+)px', css_block)
    if padding_match:
        px = int(padding_match.group(1))
        classes.append(f'p-{px//4}')
        
    # Margin
    if re.search(r'margin:\s*0', css_block):
        classes.append('m-0')
    if re.search(r'margin:\s*auto', css_block):
        classes.append('m-auto')
        
    # Position
    if re.search(r'position:\s*relative', css_block):
        classes.append('relative')
    if re.search(r'position:\s*absolute', css_block):
        classes.append('absolute')
    if re.search(r'position:\s*fixed', css_block):
        classes.append('fixed')
        
    # Sizing
    if re.search(r'width:\s*100%', css_block):
        classes.append('w-full')
    if re.search(r'height:\s*100%', css_block):
        classes.append('h-full')
    if re.search(r'min-width:\s*0', css_block):
        classes.append('min-w-0')
        
    # Overflow
    if re.search(r'overflow:\s*hidden', css_block):
        classes.append('overflow-hidden')
    if re.search(r'overflow:\s*auto', css_block):
        classes.append('overflow-auto')
    if re.search(r'overflow-y:\s*auto', css_block):
        classes.append('overflow-y-auto')
        
    # Cursor
    if re.search(r'cursor:\s*pointer', css_block):
        classes.append('cursor-pointer')
        
    # Border radius
    if re.search(r'border-radius:\s*4px', css_block):
        classes.append('rounded')
    if re.search(r'border-radius:\s*8px', css_block):
        classes.append('rounded-lg')
        
    # Text alignment
    if re.search(r'text-align:\s*center', css_block):
        classes.append('text-center')
        
    # Font weight
    if re.search(r'font-weight:\s*bold', css_block):
        classes.append('font-bold')
    if re.search(r'font-weight:\s*600', css_block):
        classes.append('font-semibold')
        
    # Font size
    if re.search(r'font-size:\s*12px', css_block):
        classes.append('text-xs')
    if re.search(r'font-size:\s*14px', css_block):
        classes.append('text-sm')
    if re.search(r'font-size:\s*16px', css_block):
        classes.append('text-base')
        
    return ' '.join(classes)

def convert_file(filepath):
    """Convert a single file from styled-components to Tailwind."""
    content = filepath.read_text()
    original = content
    
    # Remove emotion imports
    content = re.sub(r'import\s+styled\s+from\s+["\']@emotion/styled["\'];?\n?', '', content)
    content = re.sub(r'import\s+{\s*css\s*}\s+from\s+["\']@emotion/react["\'];?\n?', '', content)
    
    # Add cn utility import if not present and file has JSX
    if '.tsx' in filepath.name and 'className=' in content and 'cn(' not in content:
        # Find the last import statement
        last_import = list(re.finditer(r'^import\s+.*?;?\n', content, re.MULTILINE))
        if last_import:
            insert_pos = last_import[-1].end()
            content = content[:insert_pos] + 'import { cn } from "@/lib/utils";\n' + content[insert_pos:]
    
    # Find all styled components
    styled_pattern = r'const\s+(\w+)\s*=\s*styled\.(\w+)`([^`]+)`';
    
    for match in re.finditer(styled_pattern, content, re.DOTALL):
        component_name = match.group(1)
        html_tag = match.group(2)
        css_block = match.group(3)
        
        # Convert CSS to Tailwind classes
        tailwind_classes = convert_css_to_tailwind(css_block)
        
        # Remove the styled component definition
        content = content.replace(match.group(0), f'// {component_name} converted to inline className')
        
        # Replace usages with div/span + className
        # Simple pattern: <ComponentName> -> <div className="...">
        # Complex patterns with props will need manual review
        usage_pattern = rf'<{component_name}(\s+[^>]*)?>'
        
        def replace_usage(m):
            existing_attrs = m.group(1) or ''
            if 'className=' in existing_attrs:
                # Has existing className, need to merge - mark for manual review
                return f'<{html_tag}{existing_attrs} /* TODO: merge with: {tailwind_classes} */>'
            else:
                return f'<{html_tag}{existing_attrs} className="{tailwind_classes}">'
        
        content = re.sub(usage_pattern, replace_usage, content)
        
        # Replace closing tags
        content = content.replace(f'</{component_name}>', f'</{html_tag}>')
    
    # Only write if changes were made
    if content != original:
        filepath.write_text(content)
        return True
    return False

def main():
    if len(sys.argv) > 1:
        # Convert specific file
        filepath = Path(sys.argv[1])
        if filepath.exists():
            if convert_file(filepath):
                print(f"Converted: {filepath}")
            else:
                print(f"No changes: {filepath}")
    else:
        # Convert all TSX files
        src_dir = Path("src")
        count = 0
        for filepath in src_dir.rglob("*.tsx"):
            if convert_file(filepath):
                print(f"Converted: {filepath}")
                count += 1
        print(f"\nConverted {count} files")

if __name__ == "__main__":
    main()

