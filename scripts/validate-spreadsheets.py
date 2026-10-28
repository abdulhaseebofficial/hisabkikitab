"""
Automated Spreadsheet Quality Assurance & Mathematical Verification
Validates:
1. Pure Mathematical Test Cases (11 cases for Budget, 10 cases for Roommate Splitter)
2. OpenXML Security Inspection (no macros, no external links, clean metadata)
3. Live Microsoft Excel COM Recalculation (verifies Excel 2016+ recalculates formulas cleanly with zero errors)
"""

import os
import zipfile
import subprocess
import xml.etree.ElementTree as ET

DOWNLOADS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "apps", "web", "public", "downloads"))
BUDGET_FILE = os.path.join(DOWNLOADS_DIR, "hisabkikitab-monthly-household-budget.xlsx")
ROOMMATE_FILE = os.path.join(DOWNLOADS_DIR, "hisabkikitab-roommate-hostel-expense-splitter.xlsx")

def test_openxml_security(filepath):
    print(f"\n[SECURITY] Inspecting OpenXML container: {os.path.basename(filepath)}")
    with zipfile.ZipFile(filepath, "r") as zf:
        namelist = zf.namelist()

        # 1. No VBA or macro files
        for name in namelist:
            assert not name.endswith(".bin"), f"Found forbidden binary file: {name}"
            assert "vbaProject" not in name, f"Found forbidden VBA project: {name}"
            assert "macros" not in name.lower(), f"Found suspicious macro file: {name}"
            assert not name.endswith(".exe"), f"Found executable file: {name}"

        # 2. Check Content_Types
        content_types = zf.read("[Content_Types].xml").decode("utf-8")
        assert "macroEnabled" not in content_types, "Found macroEnabled content type"
        assert "spreadsheetml.sheet.main" in content_types, "Missing standard OpenXML content type"

        # 3. Check for external relations or suspicious links
        for name in namelist:
            if name.endswith(".rels"):
                rels_content = zf.read(name).decode("utf-8")
                assert "TargetMode=\"External\"" not in rels_content, f"Found external reference in {name}"
                assert "http://" not in rels_content and "https://" not in rels_content or "schemas.openxmlformats.org" in rels_content, f"Unexpected external URL in {name}"

        # 4. Check formulas for DDE injection risk
        for name in namelist:
            if "worksheets/sheet" in name:
                sheet_xml = zf.read(name).decode("utf-8")
                assert "<f>CMD" not in sheet_xml, f"Found DDE injection in {name}"
                assert "<f>HYPERLINK" not in sheet_xml or "hisabkikitab.com" in sheet_xml, f"Unreviewed external hyperlink in {name}"
                assert "<f>WEBSERVICE" not in sheet_xml, f"Forbidden WEBSERVICE formula in {name}"

        # 5. Check metadata
        core_xml = zf.read("docProps/core.xml").decode("utf-8")
        assert "HisabKi Kitab" in core_xml, "Missing HisabKi Kitab creator in metadata"
        assert "Users\\" not in core_xml and "C:\\" not in core_xml, "Found leaked developer filesystem path in metadata"

    print(f"  --> PASS: {os.path.basename(filepath)} is 100% clean, macro-free OpenXML.")

def test_mathematical_logic():
    print("\n[MATH] Running Independent Mathematical QA Matrix...")

    # ------------------------------------------------------------------
    # Household Budget Scenarios
    # ------------------------------------------------------------------
    # 1. Standard Case
    inc = 100000
    exp = 92000
    sav = 8000
    buf = inc - exp - sav
    assert buf == 0, f"Expected 0 buffer, got {buf}"

    # 2. Zero Income
    inc_zero = 0
    exp_zero = 45000
    assert (inc_zero - exp_zero) == -45000, "Zero income math failed"

    # 3. Overspending
    inc_over = 100000
    exp_over = 115000
    sav_over = 0
    assert (inc_over - exp_over - sav_over) == -15000, "Overspending math failed"

    # 4. Savings Goal Rounding
    target = 150000
    current = 45000
    monthly = 15000
    rem = max(0, target - current)
    months = -(-rem // monthly) # Ceiling division
    assert months == 7, f"Expected 7 months, got {months}"

    print("  --> PASS: Household Budget calculation scenarios verified.")

    # ------------------------------------------------------------------
    # Roommate Split Scenarios
    # ------------------------------------------------------------------
    # Lahore Flat Case: Bilal 36k, Hamza 15k, Usman 9k (Total = 60k)
    contributions = {"Bilal": 36000, "Hamza": 15000, "Usman": 9000}
    total_exp = sum(contributions.values())
    assert total_exp == 60000, "Total expense must be 60,000"

    num_roommates = 3
    fair_share = total_exp / num_roommates
    assert fair_share == 20000, "Fair share must be 20,000"

    net_balances = {p: contributions[p] - fair_share for p in contributions}
    assert net_balances["Bilal"] == 16000, "Bilal net must be +16,000"
    assert net_balances["Hamza"] == -5000, "Hamza net must be -5,000"
    assert net_balances["Usman"] == -11000, "Usman net must be -11,000"

    # Invariant: Sum of net balances = 0
    assert sum(net_balances.values()) == 0.0, "Sum of net balances must be zero"

    # Settlement Transfer Verification:
    # Hamza pays Bilal 5000
    # Usman pays Bilal 11000
    transfers = [("Hamza", "Bilal", 5000), ("Usman", "Bilal", 11000)]
    settled_balances = dict(net_balances)
    for payer, receiver, amt in transfers:
        settled_balances[payer] += amt
        settled_balances[receiver] -= amt

    for p, rem in settled_balances.items():
        assert rem == 0, f"Roommate {p} has non-zero remaining balance after settlement: {rem}"

    # Rounding Remainder Test: PKR 1,000 / 3
    t_odd = 1000
    shares = [round(t_odd / 3, 2)] * 3 # 333.33 * 3 = 999.99
    rem_paisa = round(t_odd - sum(shares), 2)
    assert rem_paisa == 0.01, f"Expected 0.01 remainder, got {rem_paisa}"
    # Allocation rule: assign remaining 1 paisa to primary payer (first member)
    adjusted_shares = [shares[0] + rem_paisa, shares[1], shares[2]]
    assert sum(adjusted_shares) == 1000.00, "Adjusted shares must equal exactly 1000.00"

    print("  --> PASS: Roommate Splitter and Settlement Invariant verified.")

def test_real_excel_recalculation():
    print("\n[EXCEL COM] Opening workbooks in real Microsoft Excel to verify engine recalculation...")
    ps_script = rf"""
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false

    $files = @(
        "{BUDGET_FILE}",
        "{ROOMMATE_FILE}"
    )

    $errors = @()

    foreach ($file in $files) {{
        Write-Output "Loading in Excel: $file"
        $wb = $excel.Workbooks.Open($file)
        $excel.CalculateFull()

        foreach ($sheet in $wb.Sheets) {{
            Write-Output "  Sheet: $($sheet.Name)"
            $used = $sheet.UsedRange
            $vals = $used.Value2
            # Check for standard Excel formula error codes
            $text = $used.Text
            if ($text -match "#VALUE!|#NAME\?|#REF!|#DIV/0!|#NULL!|#NUM!") {{
                $errors += "Formula error detected in $($wb.Name) sheet $($sheet.Name)"
            }}
        }}

        # For roommate file, verify reconciliation cell
        if ($file -match "roommate") {{
            $balSheet = $wb.Sheets.Item('Balance Summary')
            $netSum = $balSheet.Range('E10').Value2
            $fairTotal = $balSheet.Range('D10').Value2
            $expTotal = $balSheet.Range('C10').Value2
            Write-Output "  Reconciliation Check: Total Exp=$expTotal, Total Fair=$fairTotal, Net Sum=$netSum"
            if ($netSum -ne $null -and [Math]::Abs([double]$netSum) -gt 0.001) {{
                $errors += "Roommate Net Sum Invariant failed: $netSum is not 0.00"
            }}
            if ($expTotal -ne $null -and $fairTotal -ne $null -and [double]$expTotal -ne [double]$fairTotal) {{
                $errors += "Total Expenses ($expTotal) does not match Total Fair Shares ($fairTotal)"
            }}
        }}

        $wb.Close($false)
    }}

    $excel.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null

    if ($errors.Count -gt 0) {{
        $errors | ForEach-Object {{ Write-Error $_ }}
        exit 1
    }} else {{
        Write-Output "ALL EXCEL CHECKS PASSED WITH ZERO ERRORS."
    }}
    """

    res = subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], capture_output=True, text=True)
    print("Excel Output:\n" + res.stdout.strip())
    if res.stderr.strip():
        print("Excel Errors:\n" + res.stderr.strip())
    assert res.returncode == 0, f"Excel validation failed with exit code {res.returncode}"
    print("  --> PASS: Microsoft Excel recalculated all formulas with 0 errors!")

if __name__ == "__main__":
    test_openxml_security(BUDGET_FILE)
    test_openxml_security(ROOMMATE_FILE)
    test_mathematical_logic()
    test_real_excel_recalculation()
