import sys
import os
import zipfile
import re

file_path = "App Database.xlsx"

def inspect_via_zip():
    print("Method: zipfile (fallback)")
    try:
        with zipfile.ZipFile(file_path, 'r') as z:
            # workbook.xml contains the sheet names
            if 'xl/workbook.xml' in z.namelist():
                with z.open('xl/workbook.xml') as f:
                    content = f.read().decode('utf-8')
                    # Regex to find sheet names and state: <sheet ... name="SheetName" ... state="hidden" ... />
                    # We capture the whole tag to parse attributes
                    sheet_tags = re.findall(r'<sheet [^>]*>', content)
                    for tag in sheet_tags:
                        name_match = re.search(r'name="([^"]+)"', tag)
                        state_match = re.search(r'state="([^"]+)"', tag)
                        
                        name = name_match.group(1) if name_match else "Unknown"
                        state = state_match.group(1) if state_match else "visible"
                        
                        print(f"Sheet: {name} (State: {state})")
            else:
                print("Error: xl/workbook.xml not found in zip.")
    except Exception as e:
        print(f"zipfile error: {e}")

if not os.path.exists(file_path):
    print(f"File not found: {file_path}")
    sys.exit(1)

inspect_via_zip()
