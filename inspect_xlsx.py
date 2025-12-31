import sys
import os
import zipfile
import re

file_path = "App Database.xlsx"

def inspect_via_openpyxl():
    try:
        import openpyxl
        wb = openpyxl.load_workbook(file_path, read_only=True)
        print("Method: openpyxl")
        for sheet in wb.sheetnames:
            print(f"Sheet: {sheet}")
        return True
    except ImportError:
        return False
    except Exception as e:
        print(f"openpyxl error: {e}")
        return False

def inspect_via_zip():
    print("Method: zipfile (fallback)")
    try:
        with zipfile.ZipFile(file_path, 'r') as z:
            # workbook.xml contains the sheet names
            if 'xl/workbook.xml' in z.namelist():
                with z.open('xl/workbook.xml') as f:
                    content = f.read().decode('utf-8')
                    # Regex to find sheet names: <sheet ... name="SheetName" ... />
                    # Simplified regex, might need adjustment for namespaces but usually 'name' attribute is standard
                    sheets = re.findall(r'<sheet [^>]*name="([^"]+)"', content)
                    for sheet in sheets:
                        print(f"Sheet: {sheet}")
            else:
                print("Error: xl/workbook.xml not found in zip.")
    except Exception as e:
        print(f"zipfile error: {e}")

if not os.path.exists(file_path):
    print(f"File not found: {file_path}")
    sys.exit(1)

if not inspect_via_openpyxl():
    inspect_via_zip()
