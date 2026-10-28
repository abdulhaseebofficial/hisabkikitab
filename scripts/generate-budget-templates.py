"""
HisabKi Kitab - Budget & Shared Expense Template Generator
Generates standards-compliant, macro-free OpenXML (.xlsx) workbooks for:
1. hisabkikitab-monthly-household-budget.xlsx
2. hisabkikitab-roommate-hostel-expense-splitter.xlsx

Zero third-party dependencies required. Uses Python standard library zipfile.
"""

import os
import zipfile
import xml.etree.ElementTree as ET

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "apps", "web", "public", "downloads")

def escape_xml(s):
    return (str(s).replace("&", "&amp;")
                  .replace("<", "&lt;")
                  .replace(">", "&gt;")
                  .replace('"', "&quot;")
                  .replace("'", "&apos;"))

class SimpleXlsxWriter:
    def __init__(self, filename, title, subject):
        self.filename = filename
        self.title = title
        self.subject = subject
        self.sheets = [] # list of (sheet_name, rows_xml, cols_xml)
        self.shared_strings = []
        self.string_map = {}

    def get_string_id(self, s):
        s = str(s)
        if s not in self.string_map:
            self.string_map[s] = len(self.shared_strings)
            self.shared_strings.append(s)
        return self.string_map[s]

    def add_sheet(self, name, rows, col_widths=None):
        """
        rows: list of row items.
        Each row is a list of cells:
        (col_letter, value, cell_type, style_id, formula)
        where:
          value: string, number, or None
          cell_type: 's' (shared string), 'n' (number), 'inline' or 'f' (formula)
          style_id: integer (0 to 12)
          formula: string formula (without leading '=') or None
        """
        self.sheets.append((name, rows, col_widths or {}))

    def build_styles_xml(self):
        # Palette:
        # 0: Normal
        # 1: Title (16pt bold Navy #0B1742)
        # 2: Subtitle (10pt Slate #475569)
        # 3: Section Header (12pt bold Navy, bottom border)
        # 4: Table Header (Navy #0B1742 fill, bold white text, center, thin border)
        # 5: Input Text (Light Gray #F8FAFC fill, left, thin border)
        # 6: Input Number (Light Gray #F8FAFC fill, right, PKR format, thin border)
        # 7: Calculated Number (Soft Blue #EFF6FF fill, bold Navy, right, PKR format, thin border)
        # 8: Calculated Total (Darker Soft Blue #DBEAFE fill, bold Navy, double bottom border, PKR format)
        # 9: Calculated Percent (Soft Blue #EFF6FF fill, right, 0.0% format, thin border)
        # 10: Date Input (Light Gray #F8FAFC fill, center, YYYY-MM-DD, thin border)
        # 11: Warning / Overbudget (Soft Red #FEF2F2 fill, bold Red #B91C1C, center, thin border)
        # 12: Success / OK (Soft Green #F0FDF4 fill, bold Green #15803D, center, thin border)
        return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="&quot;PKR &quot;#,##0;[Red]-&quot;PKR &quot;#,##0;&quot;PKR &quot;0"/>
    <numFmt numFmtId="165" formatCode="0.0%"/>
    <numFmt numFmtId="166" formatCode="yyyy-mm-dd"/>
  </numFmts>
  <fonts count="6">
    <font><name val="Segoe UI"/><sz val="11"/><color theme="1"/></font>
    <font><name val="Segoe UI"/><sz val="16"/><b/><color rgb="FF0B1742"/></font>
    <font><name val="Segoe UI"/><sz val="10"/><color rgb="FF475569"/></font>
    <font><name val="Segoe UI"/><sz val="12"/><b/><color rgb="FF0B1742"/></font>
    <font><name val="Segoe UI"/><sz val="11"/><b/><color rgb="FFFFFFFF"/></font>
    <font><name val="Segoe UI"/><sz val="11"/><b/><color rgb="FF0B1742"/></font>
  </fonts>
  <fills count="9">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0B1742"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF2F2"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF0FDF4"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>
  </fills>
  <borders count="4">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
    </border>
    <border>
      <left/><right/><top/>
      <bottom style="medium"><color rgb="FF0B1742"/></bottom>
    </border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="double"><color rgb="FF0B1742"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="13">
    <!-- 0: Normal -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <!-- 1: Title (16pt bold Navy) -->
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <!-- 2: Subtitle (10pt Slate) -->
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <!-- 3: Section Header (12pt bold Navy, bottom border) -->
    <xf numFmtId="0" fontId="3" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>
    <!-- 4: Table Header (Navy fill, bold white text, center) -->
    <xf numFmtId="0" fontId="4" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <!-- 5: Input Text (Light Gray, left) -->
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <!-- 6: Input Number (Light Gray, right, PKR format) -->
    <xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 7: Calculated Number (Soft Blue, bold Navy, right, PKR format) -->
    <xf numFmtId="164" fontId="5" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 8: Calculated Total (Double bottom border, PKR format) -->
    <xf numFmtId="164" fontId="5" fillId="5" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 9: Calculated Percent (Soft Blue, right, 0.0% format) -->
    <xf numFmtId="165" fontId="5" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 10: Date Input (Light Gray, center, yyyy-mm-dd) -->
    <xf numFmtId="166" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 11: Warning / Overbudget (Soft Red) -->
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 12: Success / OK (Soft Green) -->
    <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>"""

    def build_sheet_xml(self, rows_data, col_widths):
        cols_xml = ""
        if col_widths:
            cols_xml = "<cols>"
            for col_idx, width in sorted(col_widths.items()):
                cols_xml += f'<col min="{col_idx}" max="{col_idx}" width="{width}" customWidth="1"/>'
            cols_xml += "</cols>"

        sheet_data_xml = "<sheetData>"
        for row_num, cells in rows_data:
            sheet_data_xml += f'<row r="{row_num}">'
            for cell_ref, val, cell_type, style_id, formula in cells:
                cell_xml = f'<c r="{cell_ref}" s="{style_id}"'
                if cell_type == 's':
                    str_id = self.get_string_id(val)
                    cell_xml += f' t="s"><v>{str_id}</v></c>'
                elif cell_type == 'n':
                    cell_xml += f'><v>{val}</v></c>'
                elif cell_type == 'f':
                    # formula with precomputed cached value
                    cell_xml += f'><f>{escape_xml(formula)}</f>'
                    if val is not None:
                        cell_xml += f'<v>{val}</v>'
                    cell_xml += '</c>'
                elif cell_type == 'str_formula':
                    cell_xml += f' t="str"><f>{escape_xml(formula)}</f>'
                    if val is not None:
                        cell_xml += f'<v>{escape_xml(val)}</v>'
                    cell_xml += '</c>'
                elif cell_type == 'b':
                    # boolean
                    cell_xml += f' t="b"><v>{1 if val else 0}</v></c>'
                else:
                    # blank or other
                    cell_xml += '/>'
            sheet_data_xml += '</row>'
        sheet_data_xml += "</sheetData>"

        return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0">
      <pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  {cols_xml}
  {sheet_data_xml}
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>"""

    def save(self, filepath):
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with zipfile.ZipFile(filepath, "w", zipfile.ZIP_DEFLATED) as zf:
            # 1. [Content_Types].xml
            content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
"""
            for i in range(1, len(self.sheets) + 1):
                content_types += f'  <Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\n'
            content_types += "</Types>"
            zf.writestr("[Content_Types].xml", content_types)

            # 2. _rels/.rels
            rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""
            zf.writestr("_rels/.rels", rels)

            # 3. docProps/core.xml
            core = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>{escape_xml(self.title)}</dc:title>
  <dc:subject>{escape_xml(self.subject)}</dc:subject>
  <dc:creator>HisabKi Kitab</dc:creator>
  <cp:lastModifiedBy>HisabKi Kitab</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-10-28T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-10-28T00:00:00Z</dcterms:modified>
</cp:coreProperties>"""
            zf.writestr("docProps/core.xml", core)

            # 4. docProps/app.xml
            app = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>HisabKi Kitab Spreadsheet Tools</Application>
  <Company>HisabKi Kitab (https://www.hisabkikitab.com)</Company>
</Properties>"""
            zf.writestr("docProps/app.xml", app)

            # 5. Build sheets XML first so shared_strings is populated
            sheet_xmls = []
            for name, rows_data, col_widths in self.sheets:
                sheet_xmls.append(self.build_sheet_xml(rows_data, col_widths))

            # 6. xl/sharedStrings.xml
            sst_xml = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(self.shared_strings)}" uniqueCount="{len(self.shared_strings)}">\n'
            for s in self.shared_strings:
                sst_xml += f'  <si><t>{escape_xml(s)}</t></si>\n'
            sst_xml += "</sst>"
            zf.writestr("xl/sharedStrings.xml", sst_xml)

            # 7. xl/styles.xml
            zf.writestr("xl/styles.xml", self.build_styles_xml())

            # 8. xl/workbook.xml
            wb_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>
  <sheets>
"""
            for i, (name, _, _) in enumerate(self.sheets, 1):
                wb_xml += f'    <sheet name="{escape_xml(name)}" sheetId="{i}" r:id="rId{i}"/>\n'
            wb_xml += """  </sheets>
</workbook>"""
            zf.writestr("xl/workbook.xml", wb_xml)

            # 9. xl/_rels/workbook.xml.rels
            wb_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
"""
            for i in range(1, len(self.sheets) + 1):
                wb_rels += f'  <Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>\n'
            styles_rid = len(self.sheets) + 1
            sst_rid = len(self.sheets) + 2
            wb_rels += f'  <Relationship Id="rId{styles_rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>\n'
            wb_rels += f'  <Relationship Id="rId{sst_rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>\n'
            wb_rels += "</Relationships>"
            zf.writestr("xl/_rels/workbook.xml.rels", wb_rels)

            # 10. Write individual sheets
            for i, sheet_xml in enumerate(sheet_xmls, 1):
                zf.writestr(f"xl/worksheets/sheet{i}.xml", sheet_xml)

        print(f"Successfully created: {filepath}")

def generate_monthly_household_budget():
    wb = SimpleXlsxWriter(
        "hisabkikitab-monthly-household-budget.xlsx",
        "Monthly Household Budget Planner | HisabKi Kitab",
        "Personal & Household Financial Budgeting"
    )

    # -------------------------------------------------------------
    # Sheet 1: Instructions
    # -------------------------------------------------------------
    inst_rows = [
        (1, [
            ("A1", "HisabKi Kitab — Monthly Household Budget Planner", "s", 1, None)
        ]),
        (2, [
            ("A2", "Practical, private offline financial planning for everyday life in Pakistan.", "s", 2, None)
        ]),
        (4, [
            ("A4", "HOW TO USE THIS TEMPLATE", "s", 3, None)
        ]),
        (5, [
            ("A5", "1. Setup Budget Targets:", "s", 5, None),
            ("B5", "Open the 'Monthly Budget' tab. Enter your expected net income and target budget limits for each category.", "s", 0, None)
        ]),
        (6, [
            ("A6", "2. Log Daily Spending:", "s", 5, None),
            ("B6", "Record daily expenses under 'Actual Expenses'. The variance and category totals update automatically.", "s", 0, None)
        ]),
        (7, [
            ("A7", "3. Track Savings Goals:", "s", 5, None),
            ("B7", "Open the 'Savings Goals' tab to monitor emergency funds, education reserves, or major life targets.", "s", 0, None)
        ]),
        (8, [
            ("A8", "4. Review Executive Summary:", "s", 5, None),
            ("B8", "The 'Summary' tab compiles your total income, expense ratios, net cash flow, and savings rate.", "s", 0, None)
        ]),
        (10, [
            ("A10", "PRIVACY & LOCAL COMPUTATION GUARANTEE", "s", 3, None)
        ]),
        (11, [
            ("A11", "No Server Upload:", "s", 5, None),
            ("B11", "This spreadsheet operates completely offline. HisabKi Kitab never receives, views, or stores your entered figures.", "s", 0, None)
        ]),
        (12, [
            ("A12", "Zero Macros / 100% Safe:", "s", 5, None),
            ("B12", "This workbook contains no VBA code, executable macros, or external web queries. It is 100% standard OpenXML.", "s", 0, None)
        ]),
        (13, [
            ("A13", "Need Automatic Sync?", "s", 5, None),
            ("B13", "Try the free HisabKi Kitab web app at https://www.hisabkikitab.com/ for cloud receipt logs and AI financial insights.", "s", 0, None)
        ]),
    ]
    wb.add_sheet("Instructions", inst_rows, {1: 28, 2: 75})

    # -------------------------------------------------------------
    # Sheet 2: Monthly Budget
    # -------------------------------------------------------------
    # Rows:
    # Row 1: Title
    # Row 2: Subtitle
    # Row 4: Section 1 - Monthly Income Header
    # Row 5: Table Header: Category | Planned Amount | Actual Received | Variance
    # Row 6: Primary Take-Home Salary (Input)
    # Row 7: Freelance / Side Income (Input)
    # Row 8: Investment / Other (Input)
    # Row 9: Total Monthly Income: =SUM(B6:B8) | =SUM(C6:C8) | =C9-B9
    # Row 11: Section 2 - Household Expenses Header
    # Row 12: Table Header: Category | Planned Limit | Actual Spent | Variance (Remaining) | Status
    # Row 13-22: 10 Pakistani Categories:
    #   13: Rent / Housing
    #   14: Groceries & Supermarket
    #   15: Electricity & Gas Utilities
    #   16: Fuel & Daily Transport
    #   17: Education & Tuition Fees
    #   18: Healthcare & Pharmacy
    #   19: Mobile & Internet Bills
    #   20: Family Support & Kharcha
    #   21: Dining Out & Entertainment
    #   22: Miscellaneous / Emergencies
    # Row 23: Total Monthly Expenses: =SUM(B13:B22) | =SUM(C13:C22) | =B23-C23
    # Row 25: Section 3 - Monthly Savings & Buffer
    # Row 26: Planned Monthly Savings | Actual Saved | Variance
    # Row 28: NET MONTHLY CASH FLOW (Buffer): =B9-B23-B26 | =C9-C23-C26 | =C28-B28

    budget_rows = [
        (1, [
            ("A1", "Monthly Household Budget", "s", 1, None),
            ("D1", "Month: November 2026", "s", 2, None)
        ]),
        (2, [
            ("A2", "Track planned vs. actual cash flow with automatic variance and category limits.", "s", 2, None)
        ]),
        (4, [
            ("A4", "1. MONTHLY INCOME (INFLOW)", "s", 3, None)
        ]),
        (5, [
            ("A5", "Income Source", "s", 4, None),
            ("B5", "Planned (PKR)", "s", 4, None),
            ("C5", "Actual (PKR)", "s", 4, None),
            ("D5", "Variance (PKR)", "s", 4, None),
            ("E5", "Notes", "s", 4, None),
        ]),
        (6, [
            ("A6", "Primary Take-Home Salary", "s", 5, None),
            ("B6", 90000, "n", 6, None),
            ("C6", 90000, "n", 6, None),
            ("D6", 0, "f", 7, "C6-B6"),
            ("E6", "Net bank transfer after tax", "s", 0, None),
        ]),
        (7, [
            ("A7", "Freelance & Consulting", "s", 5, None),
            ("B7", 10000, "n", 6, None),
            ("C7", 15000, "n", 6, None),
            ("D7", 5000, "f", 7, "C7-B7"),
            ("E7", "Upwork / local client project", "s", 0, None),
        ]),
        (8, [
            ("A8", "Other Income / Dividends", "s", 5, None),
            ("B8", 0, "n", 6, None),
            ("C8", 0, "n", 6, None),
            ("D8", 0, "f", 7, "C8-B8"),
            ("E8", "Rental or mutual fund payout", "s", 0, None),
        ]),
        (9, [
            ("A9", "Total Monthly Income", "s", 8, None),
            ("B9", 100000, "f", 8, "SUM(B6:B8)"),
            ("C9", 105000, "f", 8, "SUM(C6:C8)"),
            ("D9", 5000, "f", 8, "C9-B9"),
            ("E9", "Total Monthly Cash Inflow", "s", 0, None),
        ]),
        (11, [
            ("A11", "2. HOUSEHOLD LIVING EXPENSES (OUTFLOW)", "s", 3, None)
        ]),
        (12, [
            ("A12", "Expense Category", "s", 4, None),
            ("B12", "Planned Budget (PKR)", "s", 4, None),
            ("C12", "Actual Spent (PKR)", "s", 4, None),
            ("D12", "Remaining (PKR)", "s", 4, None),
            ("E12", "Status", "s", 4, None),
        ]),
        (13, [
            ("A13", "Rent / Housing", "s", 5, None),
            ("B13", 35000, "n", 6, None),
            ("C13", 35000, "n", 6, None),
            ("D13", 0, "f", 7, "B13-C13"),
            ("E13", "OK", "str_formula", 12, 'IF(C13>B13,"OVER BUDGET","OK")'),
        ]),
        (14, [
            ("A14", "Groceries & Supermarket", "s", 5, None),
            ("B14", 20000, "n", 6, None),
            ("C14", 21500, "n", 6, None),
            ("D14", -1500, "f", 7, "B14-C14"),
            ("E14", "OVER BUDGET", "str_formula", 11, 'IF(C14>B14,"OVER BUDGET","OK")'),
        ]),
        (15, [
            ("A15", "Electricity, Gas & Water", "s", 5, None),
            ("B15", 10000, "n", 6, None),
            ("C15", 9200, "n", 6, None),
            ("D15", 800, "f", 7, "B15-C15"),
            ("E15", "OK", "str_formula", 12, 'IF(C15>B15,"OVER BUDGET","OK")'),
        ]),
        (16, [
            ("A16", "Fuel & Daily Commute", "s", 5, None),
            ("B16", 8000, "n", 6, None),
            ("C16", 7800, "n", 6, None),
            ("D16", 200, "f", 7, "B16-C16"),
            ("E16", "OK", "str_formula", 12, 'IF(C16>B16,"OVER BUDGET","OK")'),
        ]),
        (17, [
            ("A17", "Education & Tuition Fees", "s", 5, None),
            ("B17", 5000, "n", 6, None),
            ("C17", 5000, "n", 6, None),
            ("D17", 0, "f", 7, "B17-C17"),
            ("E17", "OK", "str_formula", 12, 'IF(C17>B17,"OVER BUDGET","OK")'),
        ]),
        (18, [
            ("A18", "Healthcare & Medical", "s", 5, None),
            ("B18", 3000, "n", 6, None),
            ("C18", 2400, "n", 6, None),
            ("D18", 600, "f", 7, "B18-C18"),
            ("E18", "OK", "str_formula", 12, 'IF(C18>B18,"OVER BUDGET","OK")'),
        ]),
        (19, [
            ("A19", "Mobile & Internet Bills", "s", 5, None),
            ("B19", 3000, "n", 6, None),
            ("C19", 3100, "n", 6, None),
            ("D19", -100, "f", 7, "B19-C19"),
            ("E19", "OVER BUDGET", "str_formula", 11, 'IF(C19>B19,"OVER BUDGET","OK")'),
        ]),
        (20, [
            ("A20", "Family Support & Kharcha", "s", 5, None),
            ("B20", 4000, "n", 6, None),
            ("C20", 4000, "n", 6, None),
            ("D20", 0, "f", 7, "B20-C20"),
            ("E20", "OK", "str_formula", 12, 'IF(C20>B20,"OVER BUDGET","OK")'),
        ]),
        (21, [
            ("A21", "Dining Out & Entertainment", "s", 5, None),
            ("B21", 2000, "n", 6, None),
            ("C21", 2500, "n", 6, None),
            ("D21", -500, "f", 7, "B21-C21"),
            ("E21", "OVER BUDGET", "str_formula", 11, 'IF(C21>B21,"OVER BUDGET","OK")'),
        ]),
        (22, [
            ("A22", "Miscellaneous & Emergencies", "s", 5, None),
            ("B22", 2000, "n", 6, None),
            ("C22", 1500, "n", 6, None),
            ("D22", 500, "f", 7, "B22-C22"),
            ("E22", "OK", "str_formula", 12, 'IF(C22>B22,"OVER BUDGET","OK")'),
        ]),
        (23, [
            ("A23", "Total Living Expenses", "s", 8, None),
            ("B23", 92000, "f", 8, "SUM(B13:B22)"),
            ("C23", 92000, "f", 8, "SUM(C13:C22)"),
            ("D23", 0, "f", 8, "B23-C23"),
            ("E23", "Net Expense Variance", "s", 0, None),
        ]),
        (25, [
            ("A25", "3. SAVINGS ALLOCATION", "s", 3, None)
        ]),
        (26, [
            ("A26", "Planned Monthly Savings Reserve", "s", 5, None),
            ("B26", 8000, "n", 6, None),
            ("C26", 10000, "n", 6, None),
            ("D26", 2000, "f", 7, "C26-B26"),
            ("E26", "Transferred to separate savings account", "s", 0, None),
        ]),
        (28, [
            ("A28", "NET AVAILABLE CASH FLOW (BUFFER)", "s", 8, None),
            ("B28", 0, "f", 8, "B9-B23-B26"),
            ("C28", 3000, "f", 8, "C9-C23-C26"),
            ("D28", 3000, "f", 8, "C28-B28"),
            ("E28", "Surplus buffer retained in checking", "s", 0, None),
        ]),
    ]
    wb.add_sheet("Monthly Budget", budget_rows, {1: 30, 2: 22, 3: 22, 4: 22, 5: 35})

    # -------------------------------------------------------------
    # Sheet 3: Savings Goals
    # -------------------------------------------------------------
    savings_rows = [
        (1, [
            ("A1", "Savings Goals Tracker", "s", 1, None),
            ("D1", "Currency: PKR", "s", 2, None)
        ]),
        (2, [
            ("A2", "Track accumulation toward specific milestones with automated completion timelines.", "s", 2, None)
        ]),
        (4, [
            ("A4", "Goal Name", "s", 4, None),
            ("B4", "Target Amount (PKR)", "s", 4, None),
            ("C4", "Current Saved (PKR)", "s", 4, None),
            ("D4", "Monthly Contribution (PKR)", "s", 4, None),
            ("E4", "Remaining Needed (PKR)", "s", 4, None),
            ("F4", "Est. Months to Goal", "s", 4, None),
            ("G4", "Status", "s", 4, None),
        ]),
        (5, [
            ("A5", "3-Month Emergency Fund", "s", 5, None),
            ("B5", 276000, "n", 6, None),
            ("C5", 120000, "n", 6, None),
            ("D5", 10000, "n", 6, None),
            ("E5", 156000, "f", 7, "MAX(0, B5-C5)"),
            ("F5", 16, "f", 7, 'IF(D5>0, ROUNDUP(E5/D5, 0), "N/A")'),
            ("G5", "In Progress", "s", 0, None),
        ]),
        (6, [
            ("A6", "Annual Motorbike Takaful & Maintenance", "s", 5, None),
            ("B6", 30000, "n", 6, None),
            ("C6", 30000, "n", 6, None),
            ("D6", 2500, "n", 6, None),
            ("E6", 0, "f", 7, "MAX(0, B6-C6)"),
            ("F6", 0, "f", 7, 'IF(D6>0, ROUNDUP(E6/D6, 0), "N/A")'),
            ("G6", "Target Met", "s", 12, None),
        ]),
        (7, [
            ("A7", "Laptop Upgrade for Remote Work", "s", 5, None),
            ("B7", 150000, "n", 6, None),
            ("C7", 45000, "n", 6, None),
            ("D7", 15000, "n", 6, None),
            ("E7", 105000, "f", 7, "MAX(0, B7-C7)"),
            ("F7", 7, "f", 7, 'IF(D7>0, ROUNDUP(E7/D7, 0), "N/A")'),
            ("G7", "In Progress", "s", 0, None),
        ]),
        (8, [
            ("A8", "Total Savings Goals Portfolio", "s", 8, None),
            ("B8", 456000, "f", 8, "SUM(B5:B7)"),
            ("C8", 195000, "f", 8, "SUM(C5:C7)"),
            ("D8", 27500, "f", 8, "SUM(D5:D7)"),
            ("E8", 261000, "f", 8, "SUM(E5:E7)"),
            ("F8", "-", "s", 0, None),
            ("G8", "Portfolio Summary", "s", 0, None),
        ]),
    ]
    wb.add_sheet("Savings Goals", savings_rows, {1: 35, 2: 22, 3: 22, 4: 25, 5: 24, 6: 20, 7: 18})

    # -------------------------------------------------------------
    # Sheet 4: Summary
    # -------------------------------------------------------------
    summary_rows = [
        (1, [
            ("A1", "Executive Financial Summary", "s", 1, None),
            ("C1", "HisabKi Kitab Reporting", "s", 2, None)
        ]),
        (2, [
            ("A2", "Key performance metrics compiled from your monthly budget and savings entries.", "s", 2, None)
        ]),
        (4, [
            ("A4", "KEY FINANCIAL INDICATOR", "s", 4, None),
            ("B4", "AMOUNT (PKR)", "s", 4, None),
            ("C4", "BENCHMARK / RATIO", "s", 4, None),
        ]),
        (5, [
            ("A5", "Total Monthly Income Received", "s", 5, None),
            ("B5", 105000, "f", 7, "'Monthly Budget'!C9"),
            ("C5", "100.0% of Cash Inflow", "s", 0, None),
        ]),
        (6, [
            ("A6", "Total Living Expenses Paid", "s", 5, None),
            ("B6", 92000, "f", 7, "'Monthly Budget'!C23"),
            ("C6", 0.876, "f", 9, "B6/B5"),
        ]),
        (7, [
            ("A7", "Total Savings Transferred", "s", 5, None),
            ("B7", 10000, "f", 7, "'Monthly Budget'!C26"),
            ("C7", 0.095, "f", 9, "B7/B5"),
        ]),
        (8, [
            ("A8", "Net Unallocated Buffer", "s", 8, None),
            ("B8", 3000, "f", 8, "'Monthly Budget'!C28"),
            ("C8", 0.029, "f", 9, "B8/B5"),
        ]),
        (10, [
            ("A10", "BUDGET HEALTH EVALUATION", "s", 3, None)
        ]),
        (11, [
            ("A11", "Savings Rate Status:", "s", 5, None),
            ("B11", "Healthy (>5%)", "str_formula", 12, 'IF(B7/B5>=0.1,"Excellent (>=10%)",IF(B7/B5>=0.05,"Healthy (>=5%)","Low (<5%)"))'),
            ("C11", "Target recommended by SBP: >= 10%", "s", 0, None),
        ]),
        (12, [
            ("A12", "Expense Burden Status:", "s", 5, None),
            ("B12", "Sustainable", "str_formula", 12, 'IF(B6/B5>0.9,"High Burden (>90%)","Sustainable")'),
            ("C12", "Living costs should not exceed 90% of income", "s", 0, None),
        ]),
    ]
    wb.add_sheet("Summary", summary_rows, {1: 32, 2: 24, 3: 40})

    out_file = os.path.join(OUTPUT_DIR, "hisabkikitab-monthly-household-budget.xlsx")
    wb.save(out_file)

def generate_roommate_hostel_splitter():
    wb = SimpleXlsxWriter(
        "hisabkikitab-roommate-hostel-expense-splitter.xlsx",
        "Roommate & Hostel Expense Splitter | HisabKi Kitab",
        "Shared Living, Hostel & Flat Bill Splitting"
    )

    # -------------------------------------------------------------
    # Sheet 1: Instructions
    # -------------------------------------------------------------
    inst_rows = [
        (1, [
            ("A1", "HisabKi Kitab — Roommate & Hostel Expense Splitter", "s", 1, None)
        ]),
        (2, [
            ("A2", "Dispute-free shared expense tracking for university hostels and shared flats in Pakistan.", "s", 2, None)
        ]),
        (4, [
            ("A4", "HOW TO USE THIS SPLITTER", "s", 3, None)
        ]),
        (5, [
            ("A5", "1. Set Up Members:", "s", 5, None),
            ("B5", "Open the 'Members' tab. Enter roommate names (up to 5) and mark their active sharing status as 'Yes'.", "s", 0, None)
        ]),
        (6, [
            ("A6", "2. Log Shared Purchases:", "s", 5, None),
            ("B6", "Open 'Shared Expenses'. Enter every shared item, select who paid, and input the amount in PKR.", "s", 0, None)
        ]),
        (7, [
            ("A7", "3. Review Balances:", "s", 5, None),
            ("B7", "The 'Balance Summary' tab calculates each person's total paid, their fair share, and their net balance.", "s", 0, None)
        ]),
        (8, [
            ("A8", "4. Execute Settlements:", "s", 5, None),
            ("B8", "Open 'Settlement Ledger' to view exact pairwise transfers that bring everyone's balance to exactly zero.", "s", 0, None)
        ]),
        (10, [
            ("A10", "MATHEMATICAL ACCOUNTING INVARIANTS", "s", 3, None)
        ]),
        (11, [
            ("A11", "Total Contributions = Total Expenses:", "s", 5, None),
            ("B11", "The sum of all individual payments matches the total shared expense pool exactly.", "s", 0, None)
        ]),
        (12, [
            ("A12", "Zero-Sum Net Balances:", "s", 5, None),
            ("B12", "Receivables (positive balances) and Payables (negative balances) sum to strictly PKR 0.00.", "s", 0, None)
        ]),
        (13, [
            ("A13", "Need Real-Time Roommate Sync?", "s", 5, None),
            ("B13", "Use the HisabKi Kitab Shared Living mode at https://www.hisabkikitab.com/ for multi-device sync and instant WhatsApp settlement cards.", "s", 0, None)
        ]),
    ]
    wb.add_sheet("Instructions", inst_rows, {1: 32, 2: 75})

    # -------------------------------------------------------------
    # Sheet 2: Members
    # -------------------------------------------------------------
    member_rows = [
        (1, [
            ("A1", "Roommate & Member Directory", "s", 1, None),
            ("C1", "Active Capacity: 5 Members", "s", 2, None)
        ]),
        (2, [
            ("A2", "List participating roommates. Set 'Active' to 'Yes' to include them in the fair-share split.", "s", 2, None)
        ]),
        (4, [
            ("A4", "Member ID", "s", 4, None),
            ("B4", "Roommate Name", "s", 4, None),
            ("C4", "Room / Contact", "s", 4, None),
            ("D4", "Active in Sharing?", "s", 4, None),
        ]),
        (5, [
            ("A5", 1, "n", 0, None),
            ("B5", "Bilal", "s", 5, None),
            ("C5", "Room 201 (FAST Lahore)", "s", 0, None),
            ("D5", "Yes", "s", 12, None),
        ]),
        (6, [
            ("A6", 2, "n", 0, None),
            ("B6", "Hamza", "s", 5, None),
            ("C6", "Room 201 (FAST Lahore)", "s", 0, None),
            ("D5", "Yes", "s", 12, None),
        ]),
        (7, [
            ("A7", 3, "n", 0, None),
            ("B7", "Usman", "s", 5, None),
            ("C7", "Room 201 (FAST Lahore)", "s", 0, None),
            ("D7", "Yes", "s", 12, None),
        ]),
        (8, [
            ("A8", 4, "n", 0, None),
            ("B8", "Ali (Optional)", "s", 5, None),
            ("C8", "Guest / Inactive", "s", 0, None),
            ("D8", "No", "s", 0, None),
        ]),
        (9, [
            ("A9", 5, "n", 0, None),
            ("B9", "Saad (Optional)", "s", 5, None),
            ("C9", "Guest / Inactive", "s", 0, None),
            ("D9", "No", "s", 0, None),
        ]),
        (11, [
            ("A11", "Total Active Roommates Sharing Costs:", "s", 5, None),
            ("B11", 3, "f", 7, 'COUNTIF(D5:D9, "Yes")'),
            ("C11", "Must be at least 2 members", "s", 0, None),
        ]),
    ]
    wb.add_sheet("Members", member_rows, {1: 15, 2: 25, 3: 30, 4: 20})

    # -------------------------------------------------------------
    # Sheet 3: Shared Expenses
    # -------------------------------------------------------------
    # Verified Lahore Flat Case: Total PKR 60,000
    # Bilal paid: 36,000 (Rent 30,000 + Wi-Fi 6,000)
    # Hamza paid: 15,000 (Electricity 15,000)
    # Usman paid: 9,000 (Groceries 9,000)
    shared_exp_rows = [
        (1, [
            ("A1", "Shared Expense Transaction Log", "s", 1, None),
            ("D1", "Currency: PKR", "s", 2, None)
        ]),
        (2, [
            ("A2", "Log communal expenditures. Enter date, description, category, payer, and exact amount.", "s", 2, None)
        ]),
        (4, [
            ("A4", "Date", "s", 4, None),
            ("B4", "Expense Item / Description", "s", 4, None),
            ("C4", "Category", "s", 4, None),
            ("D4", "Paid By (Roommate)", "s", 4, None),
            ("E4", "Amount (PKR)", "s", 4, None),
        ]),
        (5, [
            ("A5", "2026-11-01", "s", 10, None),
            ("B5", "Hostel Flat Monthly Rent Advance", "s", 5, None),
            ("C5", "Rent", "s", 0, None),
            ("D5", "Bilal", "s", 5, None),
            ("E5", 30000, "n", 6, None),
        ]),
        (6, [
            ("A6", "2026-11-03", "s", 10, None),
            ("B6", "Electricity Bill (LESCO / Peak Unit Share)", "s", 5, None),
            ("C6", "Utilities", "s", 0, None),
            ("D6", "Hamza", "s", 5, None),
            ("E6", 15000, "n", 6, None),
        ]),
        (7, [
            ("A7", "2026-11-05", "s", 10, None),
            ("B7", "Wholesale Grocery Staples (Flour, Ghee, Rice)", "s", 5, None),
            ("C7", "Groceries", "s", 0, None),
            ("D7", "Usman", "s", 5, None),
            ("E7", 9000, "n", 6, None),
        ]),
        (8, [
            ("A8", "2026-11-07", "s", 10, None),
            ("B8", "Shared High-Speed Fiber Internet Bill", "s", 5, None),
            ("C8", "Utilities", "s", 0, None),
            ("D8", "Bilal", "s", 5, None),
            ("E8", 6000, "n", 6, None),
        ]),
        (10, [
            ("A10", "Total Shared Expenses Logged", "s", 8, None),
            ("B10", "", "s", 8, None),
            ("C10", "", "s", 8, None),
            ("D10", "", "s", 8, None),
            ("E10", 60000, "f", 8, "SUM(E5:E9)"),
        ]),
    ]
    wb.add_sheet("Shared Expenses", shared_exp_rows, {1: 18, 2: 45, 3: 20, 4: 22, 5: 22})

    # -------------------------------------------------------------
    # Sheet 4: Balance Summary
    # -------------------------------------------------------------
    bal_rows = [
        (1, [
            ("A1", "Roommate Balance & Fair-Share Summary", "s", 1, None),
            ("D1", "Reconciled Status", "s", 2, None)
        ]),
        (2, [
            ("A2", "Calculates individual contributions, equal fair shares, and net receivables/payables.", "s", 2, None)
        ]),
        (4, [
            ("A4", "Roommate Name", "s", 4, None),
            ("B4", "Active in Sharing?", "s", 4, None),
            ("C4", "Total Paid (PKR)", "s", 4, None),
            ("D4", "Fair Share (PKR)", "s", 4, None),
            ("E4", "Net Balance (PKR)", "s", 4, None),
            ("F4", "Status / Role", "s", 4, None),
        ]),
        (5, [
            ("A5", "Bilal", "s", 5, None),
            ("B5", "Yes", "s", 12, None),
            ("C5", 36000, "f", 7, "SUMIF('Shared Expenses'!$D$5:$D$50, A5, 'Shared Expenses'!$E$5:$E$50)"),
            ("D5", 20000, "f", 7, "IF(B5=\"Yes\", $C$10/Members!$B$11, 0)"),
            ("E5", 16000, "f", 7, "C5-D5"),
            ("F5", "Receives PKR 16,000", "str_formula", 12, 'IF(E5>0, "Receives " & TEXT(E5, "PKR #,##0"), IF(E5<0, "Pays " & TEXT(-E5, "PKR #,##0"), "Settled"))'),
        ]),
        (6, [
            ("A6", "Hamza", "s", 5, None),
            ("B6", "Yes", "s", 12, None),
            ("C6", 15000, "f", 7, "SUMIF('Shared Expenses'!$D$5:$D$50, A6, 'Shared Expenses'!$E$5:$E$50)"),
            ("D6", 20000, "f", 7, "IF(B6=\"Yes\", $C$10/Members!$B$11, 0)"),
            ("E6", -5000, "f", 7, "C6-D6"),
            ("F6", "Pays PKR 5,000", "str_formula", 11, 'IF(E6>0, "Receives " & TEXT(E6, "PKR #,##0"), IF(E6<0, "Pays " & TEXT(-E6, "PKR #,##0"), "Settled"))'),
        ]),
        (7, [
            ("A7", "Usman", "s", 5, None),
            ("B7", "Yes", "s", 12, None),
            ("C7", 9000, "f", 7, "SUMIF('Shared Expenses'!$D$5:$D$50, A7, 'Shared Expenses'!$E$5:$E$50)"),
            ("D7", 20000, "f", 7, "IF(B7=\"Yes\", $C$10/Members!$B$11, 0)"),
            ("E7", -11000, "f", 7, "C7-D7"),
            ("F7", "Pays PKR 11,000", "str_formula", 11, 'IF(E7>0, "Receives " & TEXT(E7, "PKR #,##0"), IF(E7<0, "Pays " & TEXT(-E7, "PKR #,##0"), "Settled"))'),
        ]),
        (8, [
            ("A8", "Ali (Optional)", "s", 5, None),
            ("B8", "No", "s", 0, None),
            ("C8", 0, "f", 7, "SUMIF('Shared Expenses'!$D$5:$D$50, A8, 'Shared Expenses'!$E$5:$E$50)"),
            ("D8", 0, "f", 7, "IF(B8=\"Yes\", $C$10/Members!$B$11, 0)"),
            ("E8", 0, "f", 7, "C8-D8"),
            ("F8", "Settled", "str_formula", 0, 'IF(E8>0, "Receives " & TEXT(E8, "PKR #,##0"), IF(E8<0, "Pays " & TEXT(-E8, "PKR #,##0"), "Settled"))'),
        ]),
        (9, [
            ("A9", "Saad (Optional)", "s", 5, None),
            ("B9", "No", "s", 0, None),
            ("C9", 0, "f", 7, "SUMIF('Shared Expenses'!$D$5:$D$50, A9, 'Shared Expenses'!$E$5:$E$50)"),
            ("D9", 0, "f", 7, "IF(B9=\"Yes\", $C$10/Members!$B$11, 0)"),
            ("E9", 0, "f", 7, "C9-D9"),
            ("F9", "Settled", "str_formula", 0, 'IF(E9>0, "Receives " & TEXT(E9, "PKR #,##0"), IF(E9<0, "Pays " & TEXT(-E9, "PKR #,##0"), "Settled"))'),
        ]),
        (10, [
            ("A10", "TOTAL GROUP RECONCILIATION", "s", 8, None),
            ("B10", "", "s", 8, None),
            ("C10", 60000, "f", 8, "SUM(C5:C9)"),
            ("D10", 60000, "f", 8, "SUM(D5:D9)"),
            ("E10", 0, "f", 8, "SUM(E5:E9)"),
            ("F10", "BALANCED (0.00)", "str_formula", 12, 'IF(ROUND(E10,2)=0,"BALANCED (0.00)","DISCREPANCY")'),
        ]),
        (12, [
            ("A12", "RECONCILIATION AUDIT CHECKS", "s", 3, None)
        ]),
        (13, [
            ("A13", "Total Paid vs. Total Fair Shares:", "s", 5, None),
            ("C13", "MATCH (C10 = D10)", "str_formula", 12, 'IF(C10=D10,"MATCH (C10 = D10)","ERROR")'),
            ("E13", "Total contributions equal communal expenses", "s", 0, None),
        ]),
        (14, [
            ("A14", "Net Sum of Balances:", "s", 5, None),
            ("C14", "ZERO (E10 = 0)", "str_formula", 12, 'IF(ROUND(E10,2)=0,"ZERO (E10 = 0)","ERROR")'),
            ("E14", "Net receivables and payables sum strictly to 0", "s", 0, None),
        ]),
    ]
    wb.add_sheet("Balance Summary", bal_rows, {1: 25, 2: 20, 3: 24, 4: 24, 5: 24, 6: 28})

    # -------------------------------------------------------------
    # Sheet 5: Settlement Ledger
    # -------------------------------------------------------------
    settle_rows = [
        (1, [
            ("A1", "Debt Settlement & Transfer Ledger", "s", 1, None),
            ("D1", "Dispute-Free Transfers", "s", 2, None)
        ]),
        (2, [
            ("A2", "Execute these direct transfers via JazzCash, Easypaisa, Raast, or cash to clear all debts.", "s", 2, None)
        ]),
        (4, [
            ("A4", "Transfer #", "s", 4, None),
            ("B4", "Payer (Owes Money)", "s", 4, None),
            ("C4", "Receiver (Owed Money)", "s", 4, None),
            ("D4", "Settlement Amount (PKR)", "s", 4, None),
            ("E4", "Payment Channel", "s", 4, None),
            ("F4", "Status", "s", 4, None),
        ]),
        (5, [
            ("A5", "Transfer 1", "s", 5, None),
            ("B5", "Hamza", "s", 5, None),
            ("C5", "Bilal", "s", 5, None),
            ("D5", 5000, "n", 6, None),
            ("E5", "Raast / Bank Transfer", "s", 0, None),
            ("F5", "Completed", "s", 12, None),
        ]),
        (6, [
            ("A6", "Transfer 2", "s", 5, None),
            ("B6", "Usman", "s", 5, None),
            ("C6", "Bilal", "s", 5, None),
            ("D6", 11000, "n", 6, None),
            ("E6", "JazzCash / Easypaisa", "s", 0, None),
            ("F6", "Completed", "s", 12, None),
        ]),
        (7, [
            ("A7", "Total Settled Outflow", "s", 8, None),
            ("B7", "", "s", 8, None),
            ("C7", "", "s", 8, None),
            ("D7", 16000, "f", 8, "SUM(D5:D6)"),
            ("E7", "Matches Bilal's Receivable", "s", 0, None),
            ("F7", "ALL DEBTS CLEARED", "s", 12, None),
        ]),
        (9, [
            ("A9", "POST-SETTLEMENT VERIFICATION", "s", 3, None)
        ]),
        (10, [
            ("A10", "Bilal Remaining Balance:", "s", 5, None),
            ("C10", 0, "f", 7, "'Balance Summary'!E5 - D7"),
            ("D10", "PKR 16,000 receivable fully cleared", "s", 0, None),
        ]),
        (11, [
            ("A11", "Hamza Remaining Balance:", "s", 5, None),
            ("C11", 0, "f", 7, "'Balance Summary'!E6 + D5"),
            ("D11", "-PKR 5,000 payable fully cleared", "s", 0, None),
        ]),
        (12, [
            ("A12", "Usman Remaining Balance:", "s", 5, None),
            ("C12", 0, "f", 7, "'Balance Summary'!E7 + D6"),
            ("D12", "-PKR 11,000 payable fully cleared", "s", 0, None),
        ]),
    ]
    wb.add_sheet("Settlement Ledger", settle_rows, {1: 18, 2: 24, 3: 24, 4: 25, 5: 25, 6: 22})

    out_file = os.path.join(OUTPUT_DIR, "hisabkikitab-roommate-hostel-expense-splitter.xlsx")
    wb.save(out_file)

if __name__ == "__main__":
    generate_monthly_household_budget()
    generate_roommate_hostel_splitter()
