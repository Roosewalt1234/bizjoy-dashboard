# FM Phase 8 Smoke Test Checklist

Use this checklist after applying the FM migrations and starting the app against a test Supabase project. Run the tests with an authenticated user that has Contracts permissions.

## Contract Master

- [ ] Create a normal home AMC contract and confirm the legacy fields still save.
- [ ] Create an FM contract with scope type, site name, site address, building type, billing cycle, VAT percent, and retention percent.
- [ ] Edit the FM contract and confirm existing contract payment rows remain intact.
- [ ] Open the contract detail workspace from the Contracts page.
- [ ] Confirm `contracts.ppm_schedule` is still visible/usable in the legacy contract flow where applicable.

## Service Categories

- [ ] Create a service category.
- [ ] Edit the category name/code/active flag.
- [ ] Delete a draft or test category that is not referenced by other FM records.

## Line Items

- [ ] Add a contract line item for the FM contract.
- [ ] Link the line item to a service category.
- [ ] Confirm monthly and annual amounts display correctly.
- [ ] Add the 48 Parkside line item template and confirm the expected monthly subtotal is AED 91,097.

## Assets

- [ ] Create an asset linked to the FM contract.
- [ ] Link the asset to a service category.
- [ ] Edit asset location, floor, zone, and criticality.
- [ ] Confirm the asset appears in the contract detail workspace.

## PPM

- [ ] Create a PPM schedule for a contract, category, and asset.
- [ ] Generate visits for the schedule.
- [ ] Confirm generated visits show planned date, due date, category, and asset.
- [ ] Convert one PPM visit to a work order.
- [ ] Confirm the PPM visit stores the work order link and changes to converted status.

## Work Orders / SLA

- [ ] Create an old-style work order without FM fields.
- [ ] Create a reactive FM work order with contract, asset, category, request type, priority, and reported time.
- [ ] Create a PPM-linked work order from a PPM visit.
- [ ] Mark a work order responded and confirm response SLA status is set.
- [ ] Mark a work order arrived.
- [ ] Mark a work order completed and confirm completion SLA status is set.
- [ ] Add a delay or SLA exclusion reason and confirm paused/exclusion handling does not crash.

## Manpower

- [ ] Add the 48 Parkside manpower template to a contract.
- [ ] Assign an employee to one manpower plan.
- [ ] Generate an attendance sheet for a selected date.
- [ ] Mark attendance rows present, absent, and late.
- [ ] Confirm shortage counts update based on required headcount versus present staff.

## Reports

- [ ] Generate a weekly report for the FM contract.
- [ ] View the weekly report and confirm work order, SLA, PPM, manpower, asset, and service report summaries render.
- [ ] Generate a monthly report for the FM contract.
- [ ] Confirm percentages display as zero instead of crashing when there is no source data.

## Invoice Pack

- [ ] Generate an invoice pack for the FM contract and month.
- [ ] Add 48 Parkside invoice lines.
- [ ] Confirm subtotal is AED 91,097 before VAT.
- [ ] Add a deduction row and confirm net payable decreases.
- [ ] Add an adjustment row and confirm net payable increases.
- [ ] Refresh pack data and confirm linked monthly report, work order, PPM, attendance, service report, and deduction summaries render.
- [ ] Mark the pack submitted.
- [ ] Mark the pack approved.
- [ ] Mark the pack invoiced.
- [ ] Mark the pack paid.
- [ ] Use Print / Save as PDF and confirm the print view is readable.

## Legacy

- [ ] Create a normal home AMC contract.
- [ ] Create an old-style work order with legacy priority values: Emergency, High, Medium, and Low.
- [ ] Create an old-style service report from a legacy work order.
- [ ] Confirm handyman hours log behavior still works when a service report is saved.
- [ ] Confirm customer links from contracts, work orders, and service reports still navigate correctly.
