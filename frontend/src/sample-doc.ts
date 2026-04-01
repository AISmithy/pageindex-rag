/**
 * Sample KYC document used for the demo flow.
 * Structured with numbered headings so the TreeBuilder correctly
 * produces a hierarchical PageIndex tree.
 */
export const SAMPLE_KYC_TEXT = `
1. Customer Identification

1.1 Personal Information
Full Name: James Alexander Morrison
Date of Birth: 22 September 1975
Nationality: British
Passport Number: PA1234567
Passport Expiry: 30 June 2028
National Insurance Number: AB 12 34 56 C
Tax Identification Number (TIN): 1234567890

The customer was identified through a certified copy of their current UK passport.
Identity verified by: Compliance Officer Rachel Chen on 15 January 2026.

1.2 Address Verification
Primary Residential Address: 14 Harrington Road, London, SW7 3EX, United Kingdom
Correspondence Address: Same as above
Proof of Address Document: British Gas utility bill dated 10 December 2025
Length of Residence: 8 years at current address
Previous Address: 7 Grosvenor Square, London, W1K 2HP (2010–2018)

2. Source Of Wealth

2.1 Employment Income
Current Employer: Morrison Capital Management Ltd (Company No. 09876543)
Position: Managing Director and Principal Shareholder (62% ownership)
Annual Salary: GBP 380,000 (gross)
Employment Start Date: March 2015
Business Activity: Private equity investment and asset management
Regulated by: Financial Conduct Authority (FRN: 789456)

2.2 Investment Portfolio
The customer maintains a diversified investment portfolio held across three custodian accounts:
- Barclays Wealth Management: GBP 4,200,000 (equities and fixed income)
- UBS Private Bank Zurich: CHF 2,800,000 (structured products)
- Interactive Brokers (US): USD 1,100,000 (ETFs and options)

Portfolio verified via statements dated Q4 2025. All holdings are in regulated instruments.

2.3 Inheritance
Customer received an inheritance of GBP 1,800,000 upon the death of their father, Robert Morrison,
in November 2020. Probate confirmed via Grant of Probate reference GP/2020/0034781.

3. Risk Assessment

3.1 Risk Profile
Based on the onboarding assessment conducted on 14 January 2026, the customer has been
assigned a MEDIUM-HIGH risk rating. Contributing factors:
- Complex corporate ownership structure (holding company in Jersey)
- Frequent international wire transfers (averaging 15 per month)
- Business relationships with counterparties in higher-risk jurisdictions (UAE, Singapore)
- High net worth individual with diversified international asset base

3.2 Enhanced Due Diligence Requirements
Given the Medium-High risk classification, the following enhanced measures apply:
- Senior management sign-off required for account opening (obtained: CFO David Park, 16 Jan 2026)
- Annual review cycle (reduced from standard 3-year cycle)
- Transaction monitoring threshold: GBP 50,000 (standard threshold: GBP 100,000)
- Source of funds verification required for all deposits exceeding GBP 25,000

4. Compliance Checks

4.1 PEP Screening
Screening Date: 15 January 2026
Screening Tool: Refinitiv World-Check One
Result: NOT IDENTIFIED as a Politically Exposed Person (PEP)
Close Associates Screening: No PEP connections identified
Family Members Screening: No PEP connections identified
Next Scheduled Screening: 15 January 2027 (annual)

4.2 Sanctions Screening
Screening Date: 15 January 2026
Lists Checked: OFAC SDN, EU Consolidated, UN Security Council, UK HMT, FATF
Result: NO MATCHES FOUND
Fuzzy-match threshold applied: 85% similarity
Adverse Media Check: No material negative results identified
Next Scheduled Screening: 15 January 2027 (annual)

5. Document Verification

5.1 Identity Documents
Passport (UK): Verified — Issue date 1 July 2023, Expiry 30 June 2028
Verification method: Manual review of certified copy + electronic chip verification (PassportCheck Pro)
Document Authenticity: PASS — No evidence of tampering or forgery

5.2 Address Documents
Utility Bill: British Gas, account number ending 8821, dated 10 December 2025
Address matches primary residential address: CONFIRMED
Document Authenticity: PASS

5.3 Corporate Documents (Morrison Capital Management Ltd)
Certificate of Incorporation: Filed 14 March 2015 at Companies House
Latest Confirmation Statement: Filed 1 December 2025
Ultimate Beneficial Owner (UBO): James Morrison (62%), Sarah Morrison (38%)

6. Account Details

6.1 Account Type and Purpose
Account Type: Corporate Investment Account (Multi-currency)
Account Purpose: Consolidation of investment returns and operating cashflows from Morrison Capital
Primary Account Currency: GBP
Additional Currencies: USD, EUR, CHF
Expected Annual Turnover: GBP 2,500,000 — GBP 3,500,000

6.2 Transaction Profile
Expected transaction types:
- Inbound wire transfers from corporate clients and investment counterparties
- Outbound wire transfers to custodian accounts and investment platforms
- Foreign exchange conversions (GBP/USD/EUR/CHF)
- Securities settlement payments

Expected frequency: 10–20 transactions per month
Expected average transaction value: GBP 75,000
Peak transaction value: GBP 500,000 (quarterly dividend repatriation)

6.3 Approval Status
Account Opening Approved: YES
Approval Date: 16 January 2026
Approving Officer: David Park (CFO)
Next Periodic Review Date: 16 January 2027
`.trim()

export const SAMPLE_FILENAME = 'Morrison_KYC_Package_2026.txt'
