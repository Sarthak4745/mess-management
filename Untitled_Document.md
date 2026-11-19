Implement the following changes in the existing project. IMPORTANT: Do not remove, redesign, or rewrite any existing functionality that is unrelated to these requirements; inspect the existing frontend/backend/database flow first, then make only the minimum necessary code changes. Preserve all existing UI, routes, APIs, authentication, database structure, and working features unless a change below specifically requires modifying them.

FRONT PAGE / HOSTEL CARDS:
1. Add a "Notice" button to the front page.
2. When the Notice button is clicked, fetch the notices posted by the admin and display them inside a scrollable popup/modal.
3. The notice popup must support multiple notices and scrolling when there are many notices.
4. Fix the existing notice ticker bar because it is currently not visible; make sure it properly displays available notices on the front page.
5. Remove the menu/mess-menu visibility from the top/header portion of the hostel card. Do not remove the actual "View Mess Menu" functionality if it is used elsewhere; only remove the unwanted menu display from the top of the hostel card.
6. Keep the hostel-card carousel behavior already fixed: never create/render blank or placeholder cards at the beginning or end, and calculate the visible cards from the actual hostel count.
7. Hostel capacity must never accept or display a negative value. Add proper frontend and backend validation so negative capacity cannot be saved, and handle invalid existing values safely.

ADMIN / DATA FUNCTIONALITY:
8. Admin pricing changes must actually affect the relevant student/billing calculations. Trace the existing pricing flow from admin update → database → backend calculation → frontend display and fix the broken data flow rather than hardcoding values.
9. Remove the "Modified by Jade" text/label wherever it is being displayed. Do not remove legitimate audit functionality unless that text is specifically the unwanted UI label.
10. Aadhar number and phone number fields must have proper fixed-length validation:
   - Aadhar: exactly 12 digits.
   - Phone number: exactly 10 digits.
   - Accept digits only and prevent invalid-length values from being saved.
   - Apply validation on both frontend and backend so it cannot be bypassed.
11. When student data is removed/deleted, provide an Undo option as a temporary popup/toast. The Undo action must restore the deleted student/data correctly using the existing database structure and should not create duplicate records.
12. Fix the Admin Dashboard "Total Eating" and "Total Skipping" statistics because they are currently not visible/working. Trace the existing attendance/food-preference data and make the dashboard calculate and display the correct values for the current day.
13. Fix the "Failed to save bill" error when viewing/saving a bill. Trace the complete bill request from frontend → API → backend → database and fix the actual cause rather than hiding the error.
14. Fix Balance and Pending calculations. They are currently changing/reducing by an apparently random number. Find the incorrect calculation/data source and make the values deterministic and based only on the actual bill, payment, due, and pricing data.
15. When the "Clean" operation is performed, the student's outstanding due/balance must be explicitly set to 0. Do NOT perform an additional subtraction/addition/random adjustment during clean; cleaning means the due should simply become exactly 0.

IMPLEMENTATION RULES:
- First inspect the existing code and identify the relevant files, routes, models, API calls, and database fields.
- Do not create duplicate APIs, models, components, or calculations if an existing one can be fixed.
- Reuse the existing database fields and architecture wherever possible.
- Keep the current UI design and styling unless a requested change requires a UI modification.
- Do not remove existing features just to make the new features work.
- Do not replace working code with a completely new implementation.
- Fix root causes instead of adding temporary/hardcoded workarounds.
- Validate important values on BOTH frontend and backend.
- Make sure frontend field names, backend field names, API request/response fields, and MongoDB/database fields remain consistent.
- After making changes, check for related regressions caused by the modifications.
- Only modify code that is actually necessary for these requirements. Do not generate unnecessary files, duplicate code, unused functions, or unrelated refactoring.
- Preserve all existing functionality not explicitly mentioned above.
- Do not remove any existing code unless it is obsolete, directly conflicting with these requirements, or required to fix the issue.
- If an existing implementation already partially solves one of these requirements, modify it instead of replacing it.
- Do not use random/default values to make a calculation appear correct.
- Do not hide errors; fix the underlying API/database/calculation issue.
- Keep the implementation production-safe and consistent with the existing project architecture.

Before finishing, verify each requirement individually and ensure the existing application still works after the changes.