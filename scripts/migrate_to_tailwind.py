#!/usr/bin/env python3
"""
Script to help migrate styled-components to Tailwind CSS.
This performs basic conversions and leaves complex cases for manual review.
"""

import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple

# Mapping of common CSS properties to Tailwind classes
CSS_TO_TAILWIND: Dict[str, str] = {
    # Display
    r'display:\s*flex': 'flex',
    r'display:\s*inline-flex': 'inline-flex',
    r'display:\s*block': 'block',
    r'display:\s*inline-block': 'inline-block',
    r'display:\s*none': 'hidden',
    r'display:\s*grid': 'grid',
    
    # Flex properties
    r'flex-direction:\s*column': 'flex-col',
    r'flex-direction:\s*row': 'flex-row',
    r'align-items:\s*center': 'items-center',
    r'align-items:\s*flex-start': 'items-start',
    r'align-items:\s*flex-end': 'items-end',
    r'align-items:\s*stretch': 'items-stretch',
    r'justify-content:\s*center': 'justify-center',
    r'justify-content:\s*space-between': 'justify-between',
    r'justify-content:\s*space-around': 'justify-around',
    r'justify-content:\s*flex-start': 'justify-start',
    r'justify-content:\s*flex-end': 'justify-end',
    r'flex:\s*1': 'flex-1',
    r'flex-wrap:\s*wrap': 'flex-wrap',
    r'flex-shrink:\s*0': 'shrink-0',
    r'flex-grow:\s*1': 'grow',
    
    # Spacing (generic patterns)
    r'gap:\s*4px': 'gap-1',
    r'gap:\s*8px': 'gap-2',
    r'gap:\s*12px': 'gap-3',
    r'gap:\s*16px': 'gap-4',
    r'gap:\s*20px': 'gap-5',
    r'gap:\s*24px': 'gap-6',
    
    r'padding:\s*4px': 'p-1',
    r'padding:\s*8px': 'p-2',
    r'padding:\s*12px': 'p-3',
    r'padding:\s*16px': 'p-4',
    r'padding:\s*20px': 'p-5',
    r'padding:\s*24px': 'p-6',
    
    r'margin:\s*0': 'm-0',
    r'margin:\s*auto': 'm-auto',
    
    # Positioning
    r'position:\s*relative': 'relative',
    r'position:\s*absolute': 'absolute',
    r'position:\s*fixed': 'fixed',
    r'position:\s*sticky': 'sticky',
    
    # Sizing
    r'width:\s*100%': 'w-full',
    r'height:\s*100%': 'h-full',
    r'min-width:\s*0': 'min-w-0',
    r'max-width:\s*100%': 'max-w-full',
    
    # Text
    r'text-align:\s*center': 'text-center',
    r'text-align:\s*left': 'text-left',
    r'text-align:\s*right': 'text-right',
    r'font-weight:\s*bold': 'font-bold',
    r'font-weight:\s*600': 'font-semibold',
    r'font-weight:\s*500': 'font-medium',
    r'font-size:\s*12px': 'text-xs',
    r'font-size:\s*14px': 'text-sm',
    r'font-size:\s*16px': 'text-base',
    r'font-size:\s*18px': 'text-lg',
    r'font-size:\s*20px': 'text-xl',
    r'text-decoration:\s*none': 'no-underline',
    r'text-decoration:\s*underline': 'underline',
    r'white-space:\s*nowrap': 'whitespace-nowrap',
    r'text-overflow:\s*ellipsis': 'truncate',
    r'overflow:\s*hidden': 'overflow-hidden',
    r'overflow:\s*auto': 'overflow-auto',
    r'overflow-y:\s*auto': 'overflow-y-auto',
    r'overflow-x:\s*auto': 'overflow-x-auto',
    
    # Cursor
    r'cursor:\s*pointer': 'cursor-pointer',
    r'cursor:\s*default': 'cursor-default',
    r'cursor:\s*not-allowed': 'cursor-not-allowed',
    
    # Border
    r'border-radius:\s*4px': 'rounded',
    r'border-radius:\s*8px': 'rounded-lg',
    r'border-radius:\s*50%': 'rounded-full',
    
    # Opacity & transitions
    r'opacity:\s*0\.5': 'opacity-50',
    r'transition:\s*all\s+0\.15s\s+ease': 'transition-all duration-150',
    r'transition:\s*all\s+0\.2s\s+ease': 'transition-all duration-200',
}

# Color variable mapping
COLOR_VAR_TO_TAILWIND: Dict[str, str] = {
    'var(--color-plan-mode)': 'text-plan-mode',
    'var(--color-plan-mode-hover)': 'text-plan-mode-hover',
    'var(--color-plan-mode-light)': 'text-plan-mode-light',
    'var(--color-exec-mode)': 'text-exec-mode',
    'var(--color-exec-mode-hover)': 'text-exec-mode-hover',
    'var(--color-background)': 'bg-background',
    'var(--color-background-secondary)': 'bg-background-secondary',
    'var(--color-border)': 'border-border',
    'var(--color-text)': 'text-foreground',
    'var(--color-text-secondary)': 'text-foreground-secondary',
    'var(--color-button-bg)': 'bg-button-bg',
    'var(--color-button-text)': 'text-button-text',
    'var(--color-button-hover-bg)': 'bg-button-hover',
    'var(--color-error)': 'text-error',
    'var(--color-error-bg)': 'bg-error-bg',
}


def extract_styled_component(content: str, component_name: str) -> Tuple[str, str]:
    """Extract a styled component definition and its CSS."""
    # Match: const Component = styled.div`...`
    pattern = rf'const\s+{component_name}\s*=\s*styled\.\w+`([^`]+)`'
    match = re.search(pattern, content, re.DOTALL)
    if match:
        return match.group(0), match.group(1)
    
    # Match template literal version: styled.div`...`
    pattern = rf'const\s+{component_name}\s*=\s*styled\.\w+`([^`]+)`'
    match = re.search(pattern, content, re.DOTALL)
    if match:
        return match.group(0), match.group(1)
    
    return "", ""


def css_to_tailwind_classes(css: str) -> List[str]:
    """Convert CSS properties to Tailwind classes."""
    classes = []
    
    # Remove comments
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.DOTALL)
    
    # Apply mappings
    for css_pattern, tailwind_class in CSS_TO_TAILWIND.items():
        if re.search(css_pattern, css, re.IGNORECASE):
            classes.append(tailwind_class)
            # Remove matched CSS from string to avoid duplication
            css = re.sub(css_pattern, '', css, flags=re.IGNORECASE)
    
    return classes


def main():
    """Main migration function."""
    if len(sys.argv) < 2:
        print("Usage: python migrate_to_tailwind.py <file.tsx>")
        sys.exit(1)
    
    file_path = Path(sys.argv[1])
    if not file_path.exists():
        print(f"Error: File {file_path} not found")
        sys.exit(1)
    
    content = file_path.read_text()
    
    # Find all styled component definitions
    styled_components = re.findall(r'const\s+(\w+)\s*=\s*styled\.\w+', content)
    
    print(f"\nFound {len(styled_components)} styled components in {file_path.name}:")
    for comp in styled_components:
        full_def, css = extract_styled_component(content, comp)
        if css:
            classes = css_to_tailwind_classes(css)
            print(f"\n{comp}:")
            print(f"  Suggested classes: {' '.join(classes)}")
            print(f"  Remaining CSS to convert manually:")
            # Show lines that weren't converted
            for line in css.strip().split('\n'):
                line = line.strip()
                if line and not any(re.search(pattern, line) for pattern in CSS_TO_TAILWIND.keys()):
                    print(f"    {line}")


if __name__ == "__main__":
    main()

