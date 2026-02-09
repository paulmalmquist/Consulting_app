# Business OS — Execution-Grade Test Plan

Version: 1.0
Date: 2026-02-09
Classification: QA Runbook / Release Gate / Audit Artifact

---

## 1. Environment & Preconditions

### 1.1 Backend Environment Variable Validation

**TC-1.1.1: DATABASE_URL missing causes immediate exit**
- Preconditions: backend/.env exists but DATABASE_URL is unset or empty
- Actions: Run `uvicorn app.main:app`
- Expected: Process exits with code 1; stderr contains "FATAL: DATABASE_URL is not set. Exiting."
- Fail: Process starts, or exits silently, or exits with different message

**TC-1.1.2: DATABASE_URL set with invalid connection string**
- Preconditions: DATABASE_URL=postgresql://invalid:invalid@localhost:5432/nonexistent
- Actions: Run `uvicorn app.main:app`, then call `GET /health`
- Expected: Server starts (config.py does not validate connectivity at startup); /health returns `{"ok": true}`; first DB-touching endpoint returns 500 with connection error
- Fail: Server refuses to start on invalid DATABASE_URL format

**TC-1.1.3: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY empty**
- Preconditions: DATABASE_URL is valid; SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are empty strings
- Actions: Start server; call POST /api/documents/init-upload with valid payload
- Expected: Server starts; init-upload creates DB records; signed URL generation falls back to `{base_url}/object/{bucket}/{storage_key}` (empty base_url produces malformed URL)
- Fail: Server refuses to start; or init-upload crashes without returning any response

**TC-1.1.4: STORAGE_BUCKET defaults to "documents"**
- Preconditions: STORAGE_BUCKET is not set in .env
- Actions: Start server; call POST /api/documents/init-upload
- Expected: document_version.bucket column is "documents"
- Fail: bucket is empty or different default

**TC-1.1.5: ALLOWED_ORIGINS parsed correctly with multiple origins**
- Preconditions: ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
- Actions: Start server; send OPTIONS request from http://localhost:3001
- Expected: CORS preflight succeeds; Access-Control-Allow-Origin includes http://localhost:3001
- Fail: CORS rejects the origin

**TC-1.1.6: Frontend .env.example contains all required variables**
- Actions: Read repo-b/.env.example
- Expected: Contains NEXT_PUBLIC_API_BASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, BUSINESS_OS_API_URL, DEMO_INVITE_CODE
- Fail: Any required variable missing

**TC-1.1.7: Backend .env.example contains all required variables**
- Actions: Read backend/.env.example
- Expected: Contains DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STORAGE_BUCKET, ALLOWED_ORIGINS
- Fail: Any required variable missing

### 1.2 Backend Health & Startup

**TC-1.2.1: Health endpoint returns OK**
- Preconditions: Server running with valid DATABASE_URL
- Actions: GET /health
- Expected: HTTP 200; body `{"ok": true}`
- Fail: Non-200 status or different body

**TC-1.2.2: All routers are mounted**
- Actions: GET /openapi.json
- Expected: Paths include /health, /api/businesses, /api/templates, /api/documents, /api/documents/init-upload, /api/documents/complete-upload, /api/executions/run, /api/executions, /api/departments, /api/businesses/{business_id}/departments, /api/businesses/{business_id}/departments/{dept_key}/capabilities
- Fail: Any expected path missing

**TC-1.2.3: CORS middleware is active**
- Actions: Send OPTIONS request with Origin: http://localhost:3000
- Expected: Response includes Access-Control-Allow-Origin, Access-Control-Allow-Methods includes GET/POST, Access-Control-Allow-Credentials is true
- Fail: Missing CORS headers

### 1.3 Supabase Connectivity

**TC-1.3.1: Database connection succeeds**
- Preconditions: Valid DATABASE_URL pointing to Supabase Postgres
- Actions: GET /api/departments
- Expected: HTTP 200; returns array (possibly empty if seed not applied)
- Fail: 500 error with connection failure

**TC-1.3.2: Schema migration applied correctly**
- Preconditions: business_os_schema.sql has been applied
- Actions: Query app.departments, app.capabilities, app.businesses, app.business_departments, app.business_capabilities, app.executions
- Expected: All tables exist; departments table has 7 seeded rows (finance, operations, hr, sales, legal, it, marketing); capabilities table has at least 25 seeded rows
- Fail: Any table missing or seed data absent

**TC-1.3.3: app.documents table has business_id and department_id columns**
- Actions: SELECT column_name FROM information_schema.columns WHERE table_schema='app' AND table_name='documents' AND column_name IN ('business_id','department_id')
- Expected: Both columns exist, both nullable
- Fail: Either column missing

### 1.4 Auth / Session Availability

**TC-1.4.1: Middleware protects /app routes**
- Preconditions: No demo_lab_session cookie
- Actions: Navigate to /app
- Expected: Redirect to /login
- Fail: Page renders without redirect

**TC-1.4.2: Middleware protects /onboarding routes**
- Preconditions: No demo_lab_session cookie
- Actions: Navigate to /onboarding
- Expected: Redirect to /login
- Fail: Page renders without redirect

**TC-1.4.3: Middleware protects /documents routes**
- Preconditions: No demo_lab_session cookie
- Actions: Navigate to /documents
- Expected: Redirect to /login
- Fail: Page renders without redirect

**TC-1.4.4: Authenticated user passes middleware**
- Preconditions: demo_lab_session cookie set
- Actions: Navigate to /app
- Expected: Page renders (no redirect)
- Fail: Redirect to /login

**TC-1.4.5: Unprotected routes remain accessible**
- Actions: Navigate to /login without any cookies
- Expected: Login page renders
- Fail: Redirect or 403

---

## 2. Onboarding & Business Creation

### 2.1 Business Creation Form

**TC-2.1.1: Create Business form renders all fields**
- Preconditions: Authenticated; navigate to /onboarding
- Actions: Observe the "Create Your Business" step
- Expected: Business Name input (text), Slug input (text), Region dropdown (select with us/eu/apac options), Continue button
- Fail: Any field missing or incorrect type

**TC-2.1.2: Continue button disabled when name is empty**
- Actions: Leave Business Name empty
- Expected: Continue button has disabled attribute, opacity-40 class, cursor-not-allowed
- Fail: Button is clickable

**TC-2.1.3: Continue button enabled when name has content**
- Actions: Type "Acme Corp" in Business Name
- Expected: Continue button is enabled
- Fail: Button remains disabled

**TC-2.1.4: Slug auto-generates from name**
- Actions: Type "Acme Corp International" in Business Name
- Expected: Slug field automatically populates with "acme-corp-international"
- Fail: Slug empty, incorrect transformation, or contains uppercase/special chars

**TC-2.1.5: Slug handles special characters**
- Actions: Type "Acme & Co. #1 (Test)" in Business Name
- Expected: Slug becomes "acme-co-1-test" (strips special chars, collapses hyphens, trims leading/trailing hyphens)
- Fail: Slug contains &, ., #, (, ), or consecutive hyphens

**TC-2.1.6: Slug is editable independently**
- Actions: Type "Acme Corp" (slug auto-fills "acme-corp"); manually change slug to "custom-slug"
- Expected: Slug field shows "custom-slug"
- Fail: Slug reverts on next render

**TC-2.1.7: Slug overwritten when name changes after manual edit**
- Actions: Type "Acme Corp" (slug auto-fills); manually edit slug; then change name to "Beta Corp"
- Expected: Slug re-generates to "beta-corp" (useEffect on bizName re-fires setBizSlug)
- Note: This is CURRENT BEHAVIOR based on code analysis — the slug always re-derives from name. Document as known behavior.
- Fail: Slug retains manually-edited value after name change (this would indicate a different implementation)

**TC-2.1.8: Region dropdown defaults to "us"**
- Actions: Load /onboarding
- Expected: Region shows "United States" selected
- Fail: Different default

**TC-2.1.9: Region dropdown has all three options**
- Actions: Open region dropdown
- Expected: United States (us), Europe (eu), Asia-Pacific (apac)
- Fail: Missing options

### 2.2 Setup Path Selection

**TC-2.2.1: Choose screen renders after Continue**
- Actions: Fill name; click Continue
- Expected: "Choose Setup Path" screen with Template and Custom cards
- Fail: Step does not advance

**TC-2.2.2: Back button returns to Create step**
- Actions: On Choose screen, click "← Back"
- Expected: Returns to Create Business form with previously entered values preserved
- Fail: Form fields reset

**TC-2.2.3: Template card navigates to template-pick**
- Actions: Click "Template" card
- Expected: Step advances to template selection
- Fail: No navigation

**TC-2.2.4: Custom card navigates to custom-depts**
- Actions: Click "Custom" card
- Expected: Step advances to department picker
- Fail: No navigation

### 2.3 Template-Based Provisioning

**TC-2.3.1: Templates loaded from backend**
- Preconditions: Backend running; GET /api/templates returns 3 templates
- Actions: Navigate to template-pick step
- Expected: Three template cards render: Starter, Growth, Enterprise; each shows description and department badges
- Fail: Templates missing, hardcoded, or loading forever

**TC-2.3.2: Template card shows department badges with icons**
- Actions: Observe Starter template card
- Expected: Badges for Finance ($), Operations (⚙), Human Resources (👤)
- Fail: Missing badges or wrong icons

**TC-2.3.3: Selecting template advances to review**
- Actions: Click on Growth template
- Expected: Navigates to template-review step; selectedTemplate is Growth
- Fail: No navigation or wrong template selected

**TC-2.3.4: Template review shows top bar preview**
- Preconditions: Growth template selected
- Actions: Observe review screen
- Expected: Top Bar Preview shows badges for Finance, Operations, Human Resources, Sales, Marketing
- Fail: Preview missing or shows wrong departments

**TC-2.3.5: Template review shows department/capability tree**
- Actions: Observe review screen
- Expected: Each department is expandable; shows ON/OFF toggle; capabilities listed under each enabled department
- Fail: Tree missing, departments not expandable, or capabilities not shown

**TC-2.3.6: Toggling department OFF hides capabilities**
- Actions: Click Finance department toggle to OFF
- Expected: Finance department shows "OFF" badge; Finance capabilities section collapses
- Fail: Capabilities still visible or department state doesn't change

**TC-2.3.7: Toggling department back ON re-shows capabilities**
- Actions: Toggle Finance OFF, then ON again
- Expected: Finance capabilities reappear
- Fail: Capabilities don't reappear

**TC-2.3.8: Toggling individual capability OFF/ON**
- Actions: Toggle "Invoice Processing" capability OFF under Finance
- Expected: Capability shows "OFF" badge; remains in list
- Fail: Capability disappears or state doesn't toggle

**TC-2.3.9: Provision button disabled when zero departments enabled**
- Actions: Toggle all departments OFF
- Expected: "Provision Business" button is disabled
- Fail: Button is clickable

**TC-2.3.10: Provisioning calls correct backend endpoints**
- Actions: Click "Provision Business" with Growth template, all departments ON
- Expected:
  1. POST /api/businesses with {name, slug, region} -> returns business_id
  2. POST /api/businesses/{id}/apply-template with {template_key: "growth", enabled_departments: [...], enabled_capabilities: [...]}
  3. localStorage "bos_business_id" set to business_id
  4. Router navigates to /app/finance (first department)
- Fail: Any step missing, wrong order, or wrong payload

**TC-2.3.11: Provisioning error displays error message**
- Preconditions: Backend returns 500 on POST /api/businesses
- Actions: Click "Provision Business"
- Expected: Red error banner shows with message from backend; form remains interactive; loading state clears
- Fail: Error not shown, page crashes, or loading spinner stuck

**TC-2.3.12: Duplicate slug returns meaningful error**
- Preconditions: Business with slug "acme-corp" already exists
- Actions: Create another business with same name/slug
- Expected: Error message displayed (unique constraint violation from Postgres)
- Fail: Silent failure or unhelpful error

### 2.4 Custom Provisioning

**TC-2.4.1: Department picker shows all catalog departments**
- Preconditions: Backend returns 7 departments from GET /api/departments
- Actions: Navigate to custom-depts step
- Expected: 7 department rows with icons and labels, sorted by sort_order (Finance 10, Operations 20, HR 30, Sales 40, Legal 50, IT 60, Marketing 70)
- Fail: Missing departments, wrong order, or hardcoded

**TC-2.4.2: Multi-select departments**
- Actions: Click Finance, then Sales, then IT
- Expected: All three show "Selected" badge with sky-blue border
- Fail: Only one selected (radio behavior) or selection not visible

**TC-2.4.3: Deselect department**
- Actions: Click a selected department
- Expected: Selection removed; "Selected" badge disappears
- Fail: Department stays selected

**TC-2.4.4: Next button disabled with zero departments**
- Actions: Ensure no departments selected
- Expected: "Next: Capabilities" button disabled
- Fail: Button clickable

**TC-2.4.5: Capabilities loaded for selected departments**
- Actions: Select Finance and Sales; click Next
- Expected: Capabilities step shows Finance and Sales sections; each section lists capabilities from backend
- Fail: Capabilities not loaded, missing sections, or wrong department grouping

**TC-2.4.6: Capability selection across departments**
- Actions: Select "Invoice Processing" under Finance; select "Generate Proposal" under Sales
- Expected: Both show "ON" badge; customCaps set has both keys
- Fail: Cross-department selection lost

**TC-2.4.7: Review button disabled with zero capabilities**
- Actions: Ensure no capabilities selected
- Expected: "Review Configuration" button disabled
- Fail: Button clickable

**TC-2.4.8: Custom review shows accurate preview**
- Actions: Select Finance + Sales with 3 capabilities total; go to review
- Expected: Top Bar Preview shows Finance and Sales badges; capability tree shows exactly the 3 selected capabilities
- Fail: Wrong departments or capabilities shown

**TC-2.4.9: Custom provisioning calls correct endpoints**
- Actions: Click "Provision Business"
- Expected:
  1. POST /api/businesses with {name, slug, region}
  2. POST /api/businesses/{id}/apply-custom with {enabled_departments: ["finance","sales"], enabled_capabilities: ["invoice_processing","proposal_gen",...]}
  3. localStorage set
  4. Router navigates to /app/finance
- Fail: Wrong endpoint or payload

### 2.5 Backend Write Verification

**TC-2.5.1: Business row created correctly**
- Actions: After provisioning, query app.businesses
- Expected: Row exists with correct name, slug, region; tenant_id references valid app.tenants row; created_at is recent
- Fail: Missing row or wrong data

**TC-2.5.2: Tenant row created**
- Actions: Query app.tenants for the tenant_id from the business
- Expected: Tenant exists with name matching business name
- Fail: Tenant missing

**TC-2.5.3: business_departments rows match selected departments**
- Actions: Query app.business_departments WHERE business_id = {id}
- Expected: One row per enabled department; enabled = true; department_id references valid app.departments row
- Fail: Missing rows, extra rows, or wrong department_ids

**TC-2.5.4: business_capabilities rows match selected capabilities**
- Actions: Query app.business_capabilities WHERE business_id = {id}
- Expected: One row per enabled capability; enabled = true; capability_id references valid app.capabilities row
- Fail: Missing rows or wrong capability_ids

**TC-2.5.5: ON CONFLICT upsert behavior for apply-template**
- Actions: Call apply-template twice for the same business with different departments
- Expected: Second call succeeds; new departments added; previously enabled departments remain enabled (ON CONFLICT DO UPDATE SET enabled = true)
- Fail: Duplicate key error or previously enabled departments lost

**TC-2.5.6: ON CONFLICT upsert behavior for apply-custom**
- Actions: Call apply-custom twice for same business with overlapping capabilities
- Expected: No error; final state has union of both calls' capabilities enabled
- Fail: Error or data corruption

**TC-2.5.7: Enterprise template "__all__" capabilities handling**
- Actions: Apply enterprise template to a business
- Expected: app.business_capabilities has rows for ALL capabilities across ALL 7 departments
- Fail: Missing capabilities; SQL error from "__all__" string comparison

### 2.6 Routing After Provisioning

**TC-2.6.1: Template provisioning routes to first template department**
- Preconditions: Starter template (departments: finance, operations, hr)
- Expected: Router navigates to /app/finance
- Fail: Routes to /app or wrong department

**TC-2.6.2: Custom provisioning routes to first selected department**
- Preconditions: Custom with Sales selected first (insertion order from Set)
- Expected: Router navigates to /app/sales (or first department in Set iteration order)
- Fail: Routes to /app or no navigation

**TC-2.6.3: Provisioning with no departments routes to /app**
- Preconditions: This state should be prevented by disabled button, but if forced
- Expected: Router navigates to /app; /app shows "No Departments Provisioned" message
- Fail: Crash or blank page

---

## 3. Data-Driven Navigation

### 3.1 Top Bar

**TC-3.1.1: Top bar renders departments from backend data**
- Preconditions: Business provisioned with Starter template (Finance, Operations, HR)
- Actions: Navigate to /app/finance
- Expected: Top bar shows exactly 3 department tabs: Finance, Operations, Human Resources; each with correct icon
- Fail: More or fewer tabs; hardcoded departments; wrong labels or icons

**TC-3.1.2: Department ordering matches sort_order**
- Preconditions: Finance (sort_order 10), Operations (20), HR (30)
- Expected: Left-to-right order: Finance, Operations, Human Resources
- Fail: Wrong order

**TC-3.1.3: sort_order_override takes precedence**
- Preconditions: business_departments row for HR has sort_order_override = 5
- Expected: HR appears first (order 5), then Finance (10), then Operations (20)
- Fail: HR not in first position (SQL uses COALESCE(bd.sort_order_override, d.sort_order))

**TC-3.1.4: Active department highlighted**
- Actions: Navigate to /app/operations
- Expected: Operations tab has bg-sky-600 text-white classes; others have text-slate-300
- Fail: No visual distinction or wrong tab highlighted

**TC-3.1.5: Clicking department tab changes route**
- Actions: Click "Human Resources" tab
- Expected: URL changes to /app/hr; main content updates
- Fail: No navigation or URL doesn't change

**TC-3.1.6: Department icons render from DB icon field**
- Preconditions: Finance has icon "dollar-sign"
- Expected: Finance tab shows "$" (from ICON_MAP)
- Fail: Shows default folder icon or no icon

**TC-3.1.7: Unknown icon falls back to folder**
- Preconditions: Department with icon "unknown-value" in DB
- Expected: Tab shows "📁" (default fallback)
- Fail: Missing icon or error

**TC-3.1.8: Loading state shows skeleton placeholders**
- Preconditions: Slow network / departments loading
- Expected: Three pulse-animated skeleton blocks while loadingDepartments is true
- Fail: Empty bar with no feedback

### 3.2 Absence Behavior

**TC-3.2.1: Unprovisioned department not in top bar**
- Preconditions: Business has Finance and HR enabled; Legal not enabled
- Expected: Top bar shows only Finance and HR; Legal does not appear
- Fail: Legal tab visible

**TC-3.2.2: Direct URL to unprovisioned department shows Not Provisioned**
- Actions: Navigate directly to /app/legal (not provisioned)
- Expected: Main panel shows "Not Provisioned" heading with text 'The department "legal" is not enabled for this business.'
- Fail: 404, blank page, or renders as if provisioned

**TC-3.2.3: Direct URL to unprovisioned capability shows Capability Not Found**
- Preconditions: Navigate to /app/finance/capability/nonexistent_cap
- Expected: "Capability Not Found" heading with message '"nonexistent_cap" is not enabled for Finance.' and "Back to Finance" link
- Fail: 404, blank page, or renders execution surface

**TC-3.2.4: Disabled (enabled=false) department not shown**
- Preconditions: business_departments row exists for Legal but enabled=false
- Expected: Legal not in top bar (query filters WHERE bd.enabled = true)
- Fail: Legal appears

**TC-3.2.5: Disabled capability not in sidebar**
- Preconditions: business_capabilities row exists for invoice_processing but enabled=false
- Expected: Invoice Processing not in sidebar (query filters WHERE bc.enabled = true)
- Fail: Capability appears

### 3.3 Sidebar

**TC-3.3.1: Sidebar renders capabilities from backend**
- Preconditions: Finance department selected; has 4 capabilities enabled
- Expected: Sidebar shows Invoice Processing (▸), Expense Review (▸), Documents (📄), Run History (🕐)
- Fail: Missing capabilities, wrong icons, or hardcoded

**TC-3.3.2: Capability ordering matches sort_order**
- Preconditions: Invoice Processing (10), Expense Review (20), Documents (90), History (95)
- Expected: Listed in that order top to bottom
- Fail: Wrong order

**TC-3.3.3: Active capability highlighted**
- Actions: Navigate to /app/finance/capability/invoice_processing
- Expected: Invoice Processing has bg-slate-800 text-white; others text-slate-300
- Fail: No highlight or wrong item

**TC-3.3.4: Clicking capability changes route**
- Actions: Click "Expense Review" in sidebar
- Expected: URL changes to /app/finance/capability/expense_review; main panel updates
- Fail: No navigation

**TC-3.3.5: No department selected shows prompt**
- Actions: Navigate to /app (no deptKey in URL)
- Expected: Sidebar shows "Select a department above."
- Fail: Empty sidebar with no guidance

**TC-3.3.6: Department with zero capabilities shows message**
- Preconditions: Department enabled but all capabilities disabled
- Expected: Sidebar shows "No capabilities enabled."
- Fail: Empty sidebar with no message

### 3.4 No Hardcoded Menu Verification

**TC-3.4.1: Grep frontend source for hardcoded department keys**
- Actions: Search all .tsx/.ts files for string literals "finance", "operations", "hr", "sales", "legal", "it", "marketing" used in menu/nav rendering
- Expected: No occurrences in TopBar, Sidebar, or AppShell components (only in onboarding template flow, which is acceptable as it comes from backend /api/templates)
- Fail: Department keys hardcoded in navigation components

**TC-3.4.2: Grep for hardcoded capability keys in navigation**
- Actions: Search Sidebar.tsx, TopBar.tsx, BosAppShell.tsx for capability key strings
- Expected: Zero hardcoded capability keys; all driven by capabilities array from context
- Fail: Any hardcoded capability name

---

## 4. Department Landing (Main Panel)

**TC-4.1.1: Landing page renders department label and description**
- Actions: Navigate to /app/finance
- Expected: H1 shows "Finance"; description shows "Department overview and quick actions"
- Fail: Wrong label or missing description

**TC-4.1.2: Quick Actions section shows action-type capabilities**
- Preconditions: Finance has invoice_processing (action), expense_review (action), finance_documents (document_view), finance_history (history)
- Expected: Quick Actions section shows only Invoice Processing and Expense Review (kind === "action"); Documents and History excluded
- Fail: Non-action capabilities shown in Quick Actions

**TC-4.1.3: Quick Action cards link to capability routes**
- Actions: Click "Invoice Processing" card
- Expected: Navigates to /app/finance/capability/invoice_processing
- Fail: No navigation or wrong route

**TC-4.1.4: Quick Action cards show correct subtitle**
- Expected: Each card shows "Run action" for kind=action
- Fail: Wrong or missing subtitle

**TC-4.1.5: Recent Runs section shows last 5 executions**
- Preconditions: 8 executions exist for this department
- Expected: Exactly 5 execution rows shown; each shows truncated ID, date, and status badge
- Fail: More than 5, or all 8 shown

**TC-4.1.6: Recent Runs empty state**
- Preconditions: No executions for this department
- Expected: Shows "No runs yet. Use a quick action above to create one."
- Fail: Empty section with no message

**TC-4.1.7: Execution status badges**
- Preconditions: Executions with status completed, failed, queued
- Expected: completed = green (emerald-900/emerald-300), failed = red (red-900/red-300), queued = yellow (yellow-900/yellow-300)
- Fail: Wrong colors

**TC-4.1.8: Recent Documents section shows last 5 documents**
- Preconditions: 10 documents exist for this department
- Expected: Exactly 5 document rows; each shows title, version number, status, date
- Fail: More than 5

**TC-4.1.9: Recent Documents "View all" link**
- Actions: Click "View all" link
- Expected: Navigates to /documents?department={department_id}
- Fail: Wrong URL or no link

**TC-4.1.10: Recent Documents empty state**
- Preconditions: No documents for this department
- Expected: Shows "No documents yet."
- Fail: Empty section with no message

**TC-4.1.11: Data correctly scoped by business_id AND department_id**
- Preconditions: Two businesses exist; each has documents and executions
- Actions: Navigate to department landing for Business A
- Expected: Only Business A's documents/executions shown
- Fail: Documents/executions from Business B appear

**TC-4.1.12: Loading skeletons shown during data fetch**
- Preconditions: Slow network
- Expected: Skeleton pulse animations for Quick Actions, Recent Runs, and Recent Documents
- Fail: Empty sections with no loading indicator

---

## 5. Execution Surfaces

### 5.1 Schema-Driven Input Rendering

**TC-5.1.1: Execution surface renders inputs from metadata_json**
- Preconditions: Navigate to /app/finance/capability/invoice_processing; metadata_json.inputs = [{name:"vendor",type:"text",label:"Vendor Name"},{name:"amount",type:"number",label:"Amount"},{name:"invoice_file",type:"file",label:"Invoice PDF"}]
- Expected: Form shows three fields: text input for Vendor Name, number input for Amount, file input for Invoice PDF
- Fail: Fields missing, wrong types, or generic JSON textarea shown

**TC-5.1.2: Text input renders correctly**
- Expected: <input type="text"> with correct label, bg-slate-900 styling, focus ring
- Fail: Wrong input type

**TC-5.1.3: Number input renders correctly**
- Expected: <input type="number"> for "amount" field
- Fail: Renders as text input

**TC-5.1.4: Textarea input renders correctly**
- Preconditions: Capability with metadata_json containing type:"textarea" (e.g., proposal_gen "scope" field)
- Expected: <textarea rows="3"> with resize-y
- Fail: Text input instead of textarea

**TC-5.1.5: File input renders correctly**
- Expected: File input with styled file button; no accept restrictions (generic)
- Fail: Missing file input

**TC-5.1.6: File selection shows filename and size**
- Actions: Select a file (test.pdf, 150KB)
- Expected: Shows "test.pdf (150.0 KB)" below file input
- Fail: No file info displayed

**TC-5.1.7: Fallback JSON textarea when no metadata_json.inputs**
- Preconditions: Capability with metadata_json = {} (no inputs array)
- Expected: Single textarea labeled "Input JSON" with default value "{}", font-mono class
- Fail: Empty form or crash

### 5.2 Execution Run

**TC-5.2.1: Run button calls POST /api/executions/run**
- Actions: Fill inputs; click "Run"
- Expected: POST /api/executions/run called with {business_id, department_id, capability_id, inputs_json}
- Fail: Wrong endpoint or missing fields

**TC-5.2.2: Run button shows loading state**
- Actions: Click "Run"
- Expected: Button text changes to "Running..."; button disabled
- Fail: Button remains "Run" or is still clickable

**TC-5.2.3: Successful execution shows result panel**
- Expected: Result section appears with Run ID (UUID), Status badge ("completed" green), and Outputs JSON block
- Fail: Result not shown

**TC-5.2.4: Run ID is a valid UUID**
- Expected: run_id matches UUID v4 format (8-4-4-4-12 hex)
- Fail: Invalid format

**TC-5.2.5: Stub execution status is "completed"**
- Expected: Status shown as "completed" (current stub behavior)
- Note: When real execution engine is integrated, this test must be updated to verify queued → running → completed transitions
- Fail: Different status

**TC-5.2.6: Outputs JSON contains stub message**
- Expected: outputs_json includes {"message": "Execution completed successfully (stub)", "processed_inputs": [...]}
- Fail: Missing or different output structure

**TC-5.2.7: processed_inputs reflects actual input keys**
- Actions: Submit with inputs {vendor: "Acme", amount: "500"}
- Expected: processed_inputs = ["vendor", "amount"]
- Fail: Wrong keys or empty array

**TC-5.2.8: Each run creates new execution_id**
- Actions: Click "Run" twice
- Expected: Two different run_ids returned; two rows in app.executions table
- Fail: Same run_id or only one row

**TC-5.2.9: File upload during execution**
- Actions: Select a file for "invoice_file" field; click Run
- Expected:
  1. POST /api/documents/init-upload called
  2. PUT to signed URL
  3. POST /api/documents/complete-upload called
  4. Document ID stored in inputs_json
  5. POST /api/executions/run called with document_id in inputs
- Fail: File not uploaded or document_id missing from execution inputs

**TC-5.2.10: Upload status indicator during file upload**
- Actions: Select file; click Run
- Expected: Text shows "Uploading {filename}..." during upload phase
- Fail: No upload progress indicator

**TC-5.2.11: Invalid JSON in fallback textarea**
- Preconditions: Capability with no input schema; type "not valid json" in textarea
- Actions: Click Run
- Expected: Error message "Invalid JSON input" displayed; no API call made; running state cleared
- Fail: API called with invalid data or no error shown

**TC-5.2.12: Backend error during execution**
- Preconditions: Backend returns 500 on /api/executions/run
- Expected: Error banner shows with message; result panel not shown
- Fail: No error shown or crash

**TC-5.2.13: Execution with empty inputs**
- Actions: Click Run without filling any fields
- Expected: Execution succeeds with empty string values for text fields; no files uploaded
- Fail: Validation error preventing empty execution (there is no frontend validation)

---

## 6. Documents & Unstructured Repository

### 6.1 Document Listing

**TC-6.1.1: List documents for business**
- Actions: GET /api/documents?business_id={id}
- Expected: Returns array of DocumentOut objects; each has document_id, business_id, title, status, created_at, latest_version_number, latest_content_type, latest_size_bytes
- Fail: 500 error or missing fields

**TC-6.1.2: List documents filtered by department**
- Actions: GET /api/documents?business_id={id}&department_id={dept_id}
- Expected: Only documents with matching department_id returned
- Fail: Documents from other departments included

**TC-6.1.3: Documents ordered by created_at DESC**
- Expected: Most recent document first
- Fail: Wrong order

**TC-6.1.4: Latest version info via LATERAL join**
- Preconditions: Document with 3 versions
- Expected: latest_version_number = 3; latest_content_type and latest_size_bytes from version 3
- Fail: Shows version 1 data

**TC-6.1.5: Document with no versions**
- Preconditions: Document exists but all versions deleted (edge case)
- Expected: latest_version_number is null; document still appears in list
- Fail: Document missing from list or error

### 6.2 Signed Upload Flow

**TC-6.2.1: init-upload creates document and version**
- Actions: POST /api/documents/init-upload with {business_id, filename: "report.pdf", content_type: "application/pdf"}
- Expected:
  - HTTP 200
  - Response has document_id, version_id, storage_key, signed_upload_url
  - app.documents row created with status='draft', classification='other', domain='general'
  - app.document_versions row created with state='uploading', version_number=1
- Fail: Missing rows, wrong status/state, or error

**TC-6.2.2: Storage key format correctness**
- Preconditions: business has tenant_id "t1", business_id "b1", department_id "d1", document created with id "doc1", version "v1"
- Expected: storage_key = "tenant/t1/business/b1/department/d1/document/doc1/v/v1/report.pdf"
- Fail: Wrong format or missing segments

**TC-6.2.3: Storage key with null department_id**
- Actions: init-upload with department_id omitted
- Expected: storage_key uses "general" for department segment: "tenant/{t}/business/{b}/department/general/document/{d}/v/{v}/{filename}"
- Fail: "null" or "None" in path

**TC-6.2.4: Storage key uniqueness**
- Actions: Two init-upload calls for same file
- Expected: Different document_ids and version_ids; therefore different storage keys
- Fail: Duplicate storage keys

**TC-6.2.5: Version number auto-increment**
- Actions: Create document via init-upload; then call init-upload again for a new document (creates new doc row each time per current implementation)
- Expected: First version is 1
- Note: Current implementation creates a NEW document row per init-upload call. Versioning of same document would require passing existing document_id (not currently supported). This is documented behavior.
- Fail: Version number is 0 or negative

**TC-6.2.6: object_key updated from "pending" to real key**
- Actions: After init-upload, query document_versions
- Expected: object_key is the full storage path, NOT "pending"
- Fail: object_key still "pending"

**TC-6.2.7: Signed upload URL generated**
- Expected: signed_upload_url is a non-empty string starting with https:// (when SUPABASE_URL is configured)
- Fail: Empty URL or malformed

**TC-6.2.8: Signed upload URL fallback when Supabase returns non-200**
- Preconditions: SUPABASE_URL set but Supabase returns 400 on sign endpoint
- Expected: Falls back to direct URL format: `{base}/object/{bucket}/{key}`
- Fail: Error thrown or empty URL

**TC-6.2.9: complete-upload updates version state**
- Actions: POST /api/documents/complete-upload with {document_id, version_id, sha256: "abc123", byte_size: 1024}
- Expected:
  - HTTP 200 with {ok: true}
  - document_versions row: state='available', size_bytes=1024, content_hash='abc123', finalized_at is set
- Fail: State not updated or fields missing

**TC-6.2.10: complete-upload with nonexistent version_id**
- Actions: POST with random UUID for version_id
- Expected: HTTP 404 with detail "Version not found"
- Fail: 200 or different error

**TC-6.2.11: complete-upload with mismatched document_id/version_id**
- Actions: POST with valid version_id but wrong document_id
- Expected: HTTP 404 (WHERE clause matches both)
- Fail: 200

**TC-6.2.12: init-upload with nonexistent business_id**
- Actions: POST with random UUID for business_id
- Expected: HTTP 404 with detail "Business not found"
- Fail: 200 or 500

### 6.3 Client-Side Upload Flow

**TC-6.3.1: File selection triggers upload flow**
- Actions: In DocumentsView, select a file via file input
- Expected: Upload begins immediately (onChange handler); "Uploading..." text shown
- Fail: Nothing happens

**TC-6.3.2: Three-step upload sequence**
- Actions: Select file
- Expected:
  1. POST /api/documents/init-upload
  2. PUT to signed_upload_url with file body and Content-Type header
  3. SHA-256 computed client-side
  4. POST /api/documents/complete-upload with sha256 and byte_size
- Fail: Any step skipped or wrong order

**TC-6.3.3: SHA-256 computation via Web Crypto**
- Actions: Upload a known file
- Expected: sha256 matches independently computed hash of file
- Fail: Wrong hash

**TC-6.3.4: byte_size matches actual file size**
- Actions: Upload 2048-byte file
- Expected: complete-upload body has byte_size: 2048
- Fail: Wrong size

**TC-6.3.5: Upload success message and list refresh**
- Expected: Green "Uploaded {filename} successfully" message; document list refreshes showing new document
- Fail: No success message or list not refreshed

**TC-6.3.6: Upload failure shows error**
- Preconditions: Backend unavailable
- Expected: Red error message
- Fail: No error shown

**TC-6.3.7: File input cleared after upload**
- Expected: File input value reset to empty (fileRef.current.value = "")
- Fail: Previous file still shown in input

**TC-6.3.8: Upload disabled during in-progress upload**
- Expected: File input has disabled attribute during upload
- Fail: Can select another file mid-upload

### 6.4 Version History

**TC-6.4.1: Clicking document shows detail panel**
- Actions: Click a document in the list
- Expected: Detail panel appears showing title, status, created date, and versions list
- Fail: No panel or wrong document info

**TC-6.4.2: Versions listed in descending order**
- Preconditions: Document with versions 1, 2, 3
- Expected: Version 3 first, then 2, then 1
- Fail: Wrong order

**TC-6.4.3: Version shows state, filename, and size**
- Expected: Each version row shows "v{n} · {state}", original_filename, and size in KB
- Fail: Missing fields

**TC-6.4.4: Download button only for "available" state**
- Preconditions: Version with state='available' and another with state='uploading'
- Expected: Download button shown only for available version
- Fail: Download button on uploading version

**TC-6.4.5: Download generates signed URL and opens**
- Actions: Click "Download"
- Expected: GET /api/documents/{id}/versions/{vid}/download-url called; window.open called with signed URL
- Fail: No download or wrong URL

**TC-6.4.6: Close button dismisses detail panel**
- Actions: Click "Close" on detail panel
- Expected: Panel disappears; document list remains
- Fail: Panel persists

### 6.5 Storage Key Integrity

**TC-6.5.1: No storage key collision across uploads**
- Actions: Upload 100 files
- Expected: All storage keys unique (guaranteed by UUID generation for document_id and version_id)
- Fail: Any duplicate

**TC-6.5.2: Storage key does not contain double slashes**
- Expected: No "//" in storage key
- Fail: Double slashes present (would indicate null interpolation)

**TC-6.5.3: Filename preserved in storage key**
- Actions: Upload "quarterly_report.xlsx"
- Expected: Storage key ends with "/quarterly_report.xlsx"
- Fail: Filename mangled or missing

### 6.6 No Destructive Deletes

**TC-6.6.1: No DELETE endpoint for documents**
- Actions: Review /api/documents routes
- Expected: No DELETE method exposed
- Fail: DELETE endpoint exists without explicit requirement

**TC-6.6.2: No DELETE endpoint for document versions**
- Actions: Review routes
- Expected: No version DELETE endpoint
- Fail: DELETE endpoint exists

**TC-6.6.3: Document status cannot be set to deleted via API**
- Expected: Only transitions available are via init-upload (draft) and complete-upload (available)
- Fail: Arbitrary status updates allowed

---

## 7. Security & Scoping

### 7.1 Business Scoping

**TC-7.1.1: GET departments scoped to business_id**
- Actions: GET /api/businesses/{business_A_id}/departments
- Expected: Only departments linked to Business A via business_departments
- Fail: Departments from Business B appear

**TC-7.1.2: GET capabilities scoped to business_id and dept_key**
- Actions: GET /api/businesses/{business_A_id}/departments/finance/capabilities
- Expected: Only capabilities linked to Business A for finance
- Fail: Capabilities from Business B appear

**TC-7.1.3: Documents scoped to business_id**
- Actions: GET /api/documents?business_id={A}
- Expected: Only documents with business_id = A
- Fail: Documents from business B appear

**TC-7.1.4: Executions scoped to business_id**
- Actions: GET /api/executions?business_id={A}
- Expected: Only executions with business_id = A
- Fail: Executions from business B appear

**TC-7.1.5: Frontend localStorage isolation**
- Actions: Check that switching business_id in localStorage changes all loaded data
- Expected: Departments, capabilities, documents, executions all refresh for new business
- Fail: Stale data from previous business

### 7.2 Auth Enforcement

**TC-7.2.1: Frontend middleware rejects unauthenticated access to /app**
- Preconditions: No demo_lab_session cookie
- Expected: Redirect to /login
- Fail: Page accessible

**TC-7.2.2: Backend has no auth middleware (explicit TODO)**
- Actions: Call any backend endpoint without authentication headers
- Expected: Request succeeds (backend currently has no auth enforcement)
- Note: This is a KNOWN GAP. TODO exists for RLS/tenant enforcement. Future tests must verify backend auth when implemented.
- Fail: N/A (documenting current state)

**TC-7.2.3: No secrets in frontend bundle**
- Actions: Build frontend; search .next output for SUPABASE_SERVICE_ROLE_KEY patterns
- Expected: No service role keys in client bundles; only NEXT_PUBLIC_ prefixed vars
- Fail: Service role key found in client code

### 7.3 Cross-Business Data Leakage

**TC-7.3.1: Cannot list Business B documents with Business A's ID**
- Actions: GET /api/documents?business_id={A}
- Expected: Zero documents belonging to Business B
- Fail: Any Business B documents returned

**TC-7.3.2: Cannot create execution for wrong business_id**
- Actions: POST /api/executions/run with business_id=A, department_id from Business B
- Expected: Execution created but references will be inconsistent (no FK validation against business_departments in current implementation)
- Note: This is a KNOWN GAP. Current backend does not validate that department_id belongs to the specified business_id. Future test must verify this constraint.
- Fail: N/A (documenting current gap)

**TC-7.3.3: Document init-upload validates business_id exists**
- Actions: POST /api/documents/init-upload with nonexistent business_id
- Expected: HTTP 404
- Fail: Document created without valid business

---

## 8. Mobile-Specific UX (iPhone Width <= 390px)

### 8.1 Top Bar

**TC-8.1.1: Top bar horizontally scrollable on mobile**
- Preconditions: 7 departments enabled; viewport width 375px
- Expected: Department tabs overflow horizontally; scroll is possible; scrollbar hidden (scrollbar-hide class)
- Fail: Tabs wrap to multiple lines or are truncated

**TC-8.1.2: Scroll snap behavior**
- Actions: Swipe horizontally on top bar
- Expected: Smooth scroll; tabs accessible via touch swipe
- Fail: Scroll stutters or doesn't respond

**TC-8.1.3: Hamburger button visible on mobile**
- Preconditions: Viewport < 1024px (lg breakpoint)
- Expected: Hamburger icon (three horizontal lines) visible in top bar
- Fail: Hamburger hidden

**TC-8.1.4: Hamburger hidden on desktop**
- Preconditions: Viewport >= 1024px
- Expected: Hamburger not visible (lg:hidden class)
- Fail: Hamburger visible on desktop

**TC-8.1.5: Brand text hidden on mobile**
- Preconditions: Viewport < 640px (sm breakpoint)
- Expected: "Business OS" text hidden (hidden sm:block class)
- Fail: Text visible, taking space from department tabs

**TC-8.1.6: Department tabs remain tappable**
- Actions: Tap each department tab on mobile
- Expected: Each tap navigates correctly; no overlapping elements stealing touches
- Fail: Taps on tabs don't register or navigate wrong

**TC-8.1.7: "Docs" link hidden on mobile**
- Preconditions: Viewport < 640px
- Expected: "Docs" link hidden (hidden sm:block)
- Fail: Link visible, taking space

### 8.2 Sidebar Drawer

**TC-8.2.1: Sidebar hidden on mobile by default**
- Expected: No sidebar visible; -translate-x-full applied
- Fail: Sidebar visible

**TC-8.2.2: Hamburger opens sidebar drawer**
- Actions: Tap hamburger
- Expected: Sidebar slides in from left (translate-x-0); w-64 width; z-50
- Fail: Sidebar doesn't open

**TC-8.2.3: Overlay renders when drawer open**
- Expected: Semi-transparent overlay (bg-black/50) covers viewport behind drawer; z-40
- Fail: No overlay

**TC-8.2.4: Clicking overlay closes drawer**
- Actions: Tap overlay area
- Expected: Drawer closes (onClose called); overlay disappears
- Fail: Drawer stays open

**TC-8.2.5: Close button in drawer header**
- Expected: X icon button in drawer header; tapping closes drawer
- Fail: No close button or doesn't work

**TC-8.2.6: Selecting capability closes drawer**
- Actions: Open drawer; tap a capability
- Expected: Drawer closes; page navigates to capability route
- Fail: Drawer stays open after selection

**TC-8.2.7: Body scroll locked when drawer open**
- Expected: document.body.style.overflow = "hidden" when sidebarOpen; restored to "" when closed
- Fail: Background scrolls while drawer is open

**TC-8.2.8: Drawer closes on route change**
- Actions: Open drawer; navigate via top bar department tab
- Expected: Drawer closes (useEffect on deptKey/capKey sets setSidebarOpen(false))
- Fail: Drawer stays open on new route

**TC-8.2.9: Desktop sidebar visible permanently**
- Preconditions: Viewport >= 1024px
- Expected: Sidebar visible as w-56 aside (hidden lg:flex); no drawer behavior
- Fail: Sidebar hidden on desktop

### 8.3 Layout & Touch

**TC-8.3.1: No fixed heights causing overflow**
- Actions: Load department landing on 375px viewport
- Expected: Content scrolls naturally; no cut-off elements
- Fail: Content overflows or is hidden

**TC-8.3.2: Main panel scrollable independently**
- Expected: Main content area has overflow-y-auto; scrolls independently of top bar
- Fail: Top bar scrolls with content

**TC-8.3.3: CTAs visible without precision scrolling**
- Actions: On mobile, navigate to execution surface
- Expected: "Run" button visible or reachable by normal scrolling
- Fail: Button hidden below fold with no scroll indicator

**TC-8.3.4: Forms are single-column on mobile**
- Expected: All form inputs stack vertically; no horizontal overflow
- Fail: Inputs side-by-side causing horizontal scroll

**TC-8.3.5: Touch targets minimum 44px**
- Actions: Measure touch targets for buttons, links, tabs
- Expected: All interactive elements have at least 44x44px effective touch area (py-2 or py-2.5 on most buttons)
- Fail: Buttons smaller than 44px that are difficult to tap

**TC-8.3.6: No dead taps**
- Actions: Tap every visible interactive element
- Expected: Every element either navigates, toggles, or performs action
- Fail: Any element that appears interactive but does nothing

**TC-8.3.7: Safe area inset padding applied**
- Expected: Main content has pb-safe class; CSS uses env(safe-area-inset-bottom)
- Fail: Content hidden behind iPhone home indicator

**TC-8.3.8: Viewport meta tag correct**
- Expected: Root layout exports viewport = {width: "device-width", initialScale: 1, viewportFit: "cover"}
- Fail: Missing viewportFit or wrong values

### 8.4 Mobile Document Operations

**TC-8.4.1: File upload works on mobile**
- Actions: Tap file input on mobile; select photo/document from camera roll
- Expected: Upload flow completes; success message shown
- Fail: File picker doesn't open or upload fails

**TC-8.4.2: Document list scrollable on mobile**
- Expected: Document list scrolls within main panel
- Fail: List overflows or cuts off

**TC-8.4.3: Document detail panel legible on mobile**
- Expected: Detail panel fits within viewport width; no horizontal overflow
- Fail: Panel wider than screen

---

## 9. Routing & State Consistency

### 9.1 Refresh Behavior

**TC-9.1.1: Refresh on /app recovers state from localStorage**
- Preconditions: businessId in localStorage
- Actions: Hard refresh on /app
- Expected: BusinessProvider reads localStorage; departments load; redirects to first department
- Fail: "No Business Configured" shown despite localStorage having businessId

**TC-9.1.2: Refresh on /app/finance preserves department selection**
- Actions: Hard refresh on /app/finance
- Expected: Page loads; Finance tab active in top bar; Finance landing shown
- Fail: Redirects to /app or shows wrong department

**TC-9.1.3: Refresh on /app/finance/capability/invoice_processing**
- Actions: Hard refresh on capability URL
- Expected: Page loads; Finance active in top bar; Invoice Processing active in sidebar; execution surface shown
- Fail: Blank page or capability not found

**TC-9.1.4: Refresh on /documents preserves filter**
- Actions: Navigate to /documents?department={id}; hard refresh
- Expected: Department filter preserved in URL; filtered list shown
- Fail: Filter lost

**TC-9.1.5: Refresh on /onboarding**
- Actions: Hard refresh on /onboarding
- Expected: Onboarding page loads from step 1
- Fail: Crash or wrong step

### 9.2 Back/Forward Navigation

**TC-9.2.1: Browser back from capability to department**
- Actions: Navigate /app/finance -> /app/finance/capability/invoice_processing; click browser Back
- Expected: Returns to /app/finance department landing
- Fail: Goes to wrong page or doesn't navigate

**TC-9.2.2: Browser back from department to department**
- Actions: Navigate /app/finance -> /app/hr; click Back
- Expected: Returns to /app/finance
- Fail: Goes to /app or wrong department

**TC-9.2.3: Browser forward after back**
- Actions: Navigate forward after going back
- Expected: Returns to previous forward route
- Fail: Forward navigation broken

**TC-9.2.4: Back navigation in onboarding steps**
- Note: Onboarding uses React state for steps, not URL. Browser back navigates AWAY from /onboarding entirely.
- Actions: On step "choose", click browser Back
- Expected: Navigates away from /onboarding to previous route
- Fail: N/A — this is expected behavior (in-page state machine, not route-per-step)

### 9.3 Deep Linking

**TC-9.3.1: Deep link to /app/hr/capability/onboard_employee**
- Preconditions: Business provisioned with HR and onboard_employee capability
- Actions: Open URL directly in new tab
- Expected: HR department active; onboard_employee execution surface shown; sidebar shows HR capabilities
- Fail: Blank page, wrong department, or capability not found

**TC-9.3.2: Deep link to /documents?department={id}**
- Expected: Documents page loads with department filter applied
- Fail: Filter not applied

**TC-9.3.3: Deep link to nonexistent department**
- Actions: Navigate to /app/nonexistent
- Expected: "Not Provisioned" message for "nonexistent"
- Fail: Crash

**TC-9.3.4: Deep link to nonexistent capability**
- Actions: Navigate to /app/finance/capability/nonexistent
- Expected: "Capability Not Found" message
- Fail: Crash

### 9.4 Invalid Routes

**TC-9.4.1: /app with no businessId in localStorage**
- Actions: Clear localStorage; navigate to /app
- Expected: "No Business Configured" message with link to /onboarding
- Fail: Crash or infinite loading

**TC-9.4.2: /app with invalid (deleted) businessId in localStorage**
- Actions: Set localStorage to UUID that doesn't exist in DB
- Expected: Departments fetch fails gracefully (catch sets empty array); "No Departments Provisioned" shown
- Fail: Infinite loading or crash

---

## 10. Error Handling & Resilience

### 10.1 Backend Unavailable

**TC-10.1.1: Onboarding with backend down**
- Actions: Navigate to /onboarding with backend unreachable
- Expected: Template list empty (fetch failed silently); department list empty; user can still type business name; provisioning will fail with clear error
- Fail: Crash or blocked UI

**TC-10.1.2: App shell with backend down**
- Actions: Navigate to /app with backend unreachable
- Expected: Department list empty (loading finishes); "No Departments Provisioned" or skeleton states
- Fail: Infinite spinner or crash

**TC-10.1.3: Document upload with backend down**
- Actions: Select file; init-upload fails
- Expected: Red error message shown; UI remains usable
- Fail: Crash or silent failure

**TC-10.1.4: Execution run with backend down**
- Actions: Click Run; backend unreachable
- Expected: Error message shown; button returns to "Run" state
- Fail: Stuck in "Running..." state

### 10.2 Supabase Storage Unavailable

**TC-10.2.1: init-upload succeeds but signed URL from invalid Supabase**
- Preconditions: DB works but SUPABASE_URL is wrong
- Expected: init-upload returns fallback URL; PUT to fallback URL will fail; complete-upload not called; upload error shown to user
- Fail: Silent failure with no error message

**TC-10.2.2: Signed download URL generation fails**
- Preconditions: Supabase Storage unreachable
- Expected: Download URL endpoint returns fallback public URL; window.open may show error page
- Fail: 500 error on download URL endpoint

### 10.3 Partial Failures

**TC-10.3.1: Upload initiated but not completed**
- Actions: init-upload succeeds; PUT to signed URL succeeds; complete-upload never called (browser closed)
- Expected: document_version remains in state='uploading'; document row exists with status='draft'; no data corruption
- Fail: State inconsistency

**TC-10.3.2: Business created but template application fails**
- Preconditions: POST /api/businesses succeeds; POST /api/businesses/{id}/apply-template fails
- Expected: Business exists in DB but has no departments/capabilities; error shown to user; user can retry or reconfigure
- Fail: Business in inconsistent state with partial departments

**TC-10.3.3: Execution insert fails due to DB error**
- Actions: POST /api/executions/run with DB constraint violation
- Expected: HTTP 500; error message returned; no partial row inserted (transaction rolled back)
- Fail: Partial row or 200 response

### 10.4 Error Message Quality

**TC-10.4.1: Backend 404 errors include detail**
- Actions: GET /api/documents/init-upload with nonexistent business_id
- Expected: {"detail": "Business not found"} — not generic "Not Found"
- Fail: Generic error or no detail

**TC-10.4.2: Frontend displays backend error messages**
- Actions: Trigger any backend error
- Expected: Frontend shows the backend error message (detail or message field from JSON response)
- Fail: Generic "Request failed" shown instead of specific message

**TC-10.4.3: Pydantic validation errors**
- Actions: POST /api/businesses with empty body
- Expected: HTTP 422 with validation error details (Pydantic/FastAPI automatic)
- Fail: 500 or no error detail

---

## 11. Data Integrity & Database Assertions

### 11.1 Referential Integrity

**TC-11.1.1: business_departments references valid business and department**
- Actions: Query app.business_departments
- Expected: All business_id values exist in app.businesses; all department_id values exist in app.departments
- Fail: Orphan rows

**TC-11.1.2: business_capabilities references valid business and capability**
- Actions: Query app.business_capabilities
- Expected: All business_id values exist in app.businesses; all capability_id values exist in app.capabilities
- Fail: Orphan rows

**TC-11.1.3: capabilities reference valid department**
- Actions: Query app.capabilities
- Expected: All department_id values exist in app.departments
- Fail: Orphan capabilities

**TC-11.1.4: executions reference valid business**
- Actions: Query app.executions
- Expected: All business_id values exist in app.businesses (ON DELETE CASCADE protects this)
- Fail: Orphan executions

**TC-11.1.5: document_versions reference valid document**
- Actions: Query app.document_versions
- Expected: All document_id values exist in app.documents (ON DELETE CASCADE)
- Fail: Orphan versions

**TC-11.1.6: Business deletion cascades to business_departments and business_capabilities**
- Actions: DELETE FROM app.businesses WHERE business_id = {id}
- Expected: Related business_departments and business_capabilities rows deleted
- Fail: Orphan rows remain

### 11.2 Execution Record Correctness

**TC-11.2.1: Execution stores correct business_id, department_id, capability_id**
- Actions: Run execution; query app.executions
- Expected: All three IDs match what was sent in the request
- Fail: Wrong IDs

**TC-11.2.2: inputs_json stored correctly as JSONB**
- Actions: Run execution with {vendor: "Acme", amount: "500"}; query app.executions
- Expected: inputs_json = {"vendor": "Acme", "amount": "500"} as JSONB
- Fail: String instead of JSONB, or data lost

**TC-11.2.3: outputs_json stored correctly**
- Expected: outputs_json contains stub message and processed_inputs array
- Fail: Empty or malformed

**TC-11.2.4: created_at uses server timestamp**
- Expected: created_at is DEFAULT now() — server time, not client time
- Fail: Timestamp is null or incorrect

**TC-11.2.5: updated_at trigger fires on status change**
- Actions: If execution status is later updated (future feature)
- Expected: updated_at is automatically updated by trigger
- Note: Currently stub sets status='completed' on INSERT; trigger fires on UPDATE only
- Fail: N/A currently; future test point

### 11.3 Document + Version Correctness

**TC-11.3.1: Document row has correct tenant_id from business lookup**
- Actions: init-upload; query app.documents
- Expected: tenant_id matches the tenant_id from app.businesses for the given business_id
- Fail: Wrong tenant_id or null

**TC-11.3.2: Version number is monotonically increasing per document**
- Actions: Multiple uploads for same document (if supported via additional API)
- Expected: version_number increments: 1, 2, 3...
- Note: Current init-upload creates new document per call; multi-version support is a future enhancement
- Fail: Duplicate or non-sequential version numbers

**TC-11.3.3: content_hash and size_bytes set only after complete-upload**
- Actions: After init-upload, query version: content_hash and size_bytes should be null
- After complete-upload: content_hash and size_bytes should be set
- Fail: Set before complete-upload or null after

**TC-11.3.4: finalized_at set only after complete-upload**
- Expected: finalized_at is NULL after init-upload; set to now() after complete-upload
- Fail: Wrong timing

**TC-11.3.5: No destructive state transitions**
- Actions: Attempt to set state from 'available' back to 'uploading' via complete-upload
- Expected: complete-upload only sets state='available'; no endpoint reverses state (no destructive transitions available via API)
- Fail: State regression possible

### 11.4 Seed Data Integrity

**TC-11.4.1: Seven departments seeded**
- Actions: SELECT count(*) FROM app.departments
- Expected: 7 (finance, operations, hr, sales, legal, it, marketing)
- Fail: Wrong count

**TC-11.4.2: Each department has correct sort_order**
- Expected: finance=10, operations=20, hr=30, sales=40, legal=50, it=60, marketing=70
- Fail: Wrong sort orders

**TC-11.4.3: All capabilities have valid metadata_json**
- Actions: SELECT capability_id, metadata_json FROM app.capabilities WHERE metadata_json != '{}'
- Expected: Each non-empty metadata_json parses as valid JSON; "inputs" array elements have name, type, and label fields
- Fail: Invalid JSON or missing required fields

**TC-11.4.4: ON CONFLICT DO NOTHING prevents duplicate seeds**
- Actions: Apply business_os_schema.sql twice
- Expected: No errors; no duplicate rows
- Fail: Unique constraint violations

---

## 12. Build, Lint, and Quality Gates

### 12.1 Frontend Build

**TC-12.1.1: TypeScript compilation succeeds for new files**
- Actions: Run `npx tsc --noEmit`; filter output to src/app/(onboarding|app|documents) and src/components/bos and src/lib/(bos|business)
- Expected: Zero errors in new files
- Fail: Any TypeScript error in new code

**TC-12.1.2: Next.js build succeeds**
- Actions: Run `npm run build`
- Expected: Build completes without errors (pre-existing errors in lab/ files may exist)
- Fail: Build failure in new code

**TC-12.1.3: Tailwind classes resolve**
- Actions: Inspect built CSS
- Expected: All Tailwind classes used in new components are present in output CSS
- Fail: Missing classes causing unstyled elements

### 12.2 Backend Startup

**TC-12.2.1: Backend starts with valid env**
- Actions: cd backend; source .venv/bin/activate; uvicorn app.main:app --port 8000
- Expected: Server starts; "Application startup complete" in output
- Fail: Import errors, missing dependencies, or crash

**TC-12.2.2: All requirements installable**
- Actions: pip install -r requirements.txt
- Expected: All packages install (fastapi 0.115.6, uvicorn 0.34.0, psycopg 3.2.4, python-dotenv 1.0.1, pydantic 2.10.4, httpx 0.28.1)
- Fail: Version conflicts or missing packages

### 12.3 Static Analysis

**TC-12.3.1: No hardcoded department keys in nav components**
- Actions: Grep TopBar.tsx, Sidebar.tsx, BosAppShell.tsx for department key string literals
- Expected: None found (ICON_MAP contains icon identifiers, not department keys)
- Fail: Department keys hardcoded

**TC-12.3.2: No hardcoded capability keys in UI components**
- Actions: Grep ExecutionSurface.tsx, DocumentsView.tsx, HistoryView.tsx
- Expected: No capability key string literals
- Fail: Hardcoded keys

**TC-12.3.3: No secrets in committed files**
- Actions: Grep for SUPABASE_SERVICE_ROLE_KEY value, database passwords
- Expected: Only .env.example with placeholder values; no real credentials
- Fail: Real secrets in any committed file
- Note: .env.local at repo root currently contains a DATABASE_URL with password. This MUST be rotated and excluded from source control.

**TC-12.3.4: .env files in .gitignore**
- Actions: Check .gitignore
- Expected: .env, .env.local patterns present
- Fail: Env files not gitignored

### 12.4 Vendor-Neutral Repository Interface

**TC-12.4.1: UnstructuredRepository ABC defines required methods**
- Actions: Inspect unstructured_base.py
- Expected: Three abstract methods: generate_signed_upload_url, generate_signed_download_url, delete_object
- Fail: Missing methods

**TC-12.4.2: SupabaseStorageRepository implements all ABC methods**
- Actions: Inspect supabase_storage_repo.py
- Expected: All three methods implemented
- Fail: NotImplementedError on any method

**TC-12.4.3: SupabaseStorageRepository is substitutable**
- Expected: Any class implementing UnstructuredRepository can replace SupabaseStorageRepository (e.g., S3Repository, GCSRepository)
- Fail: SupabaseStorageRepository uses Supabase-specific logic in public interface

---

## 13. Cross-Domain "SaaS Killer" Proof Tests

### 13.1 Multi-Department Provisioning

**TC-13.1.1: Enterprise template provisions all 7 departments**
- Actions: Create business; apply enterprise template
- Expected: 7 departments appear in top bar; each has capabilities in sidebar
- Fail: Any department missing

**TC-13.1.2: UI adapts without code changes when departments change**
- Actions: Directly INSERT a new department into app.departments (key='compliance', label='Compliance', icon='shield', sort_order=55); add business_department row; add business_capabilities rows
- Expected: New "Compliance" department appears in top bar; capabilities appear in sidebar; no frontend code change needed
- Fail: New department not visible without code deployment

**TC-13.1.3: UI adapts when capabilities added**
- Actions: INSERT new capability for finance department (key='budget_planning', label='Budget Planning', kind='action', metadata_json with inputs)
- Expected: "Budget Planning" appears in Finance sidebar; execution surface renders with defined inputs
- Fail: New capability not visible

### 13.2 Cross-Domain Execution Consistency

**TC-13.2.1: Finance execution surface functions**
- Actions: Navigate to /app/finance/capability/invoice_processing; fill inputs; run
- Expected: Execution completes; result shown
- Fail: Error

**TC-13.2.2: HR execution surface functions identically**
- Actions: Navigate to /app/hr/capability/onboard_employee; fill inputs; run
- Expected: Execution completes; result shown; same behavior as finance
- Fail: Different behavior or error

**TC-13.2.3: Legal execution surface functions identically**
- Actions: Navigate to /app/legal/capability/compliance_check; fill inputs; run
- Expected: Same execution flow; different input fields based on metadata_json
- Fail: Error or inconsistent UX

**TC-13.2.4: IT execution surface functions identically**
- Actions: Navigate to /app/it/capability/incident_report
- Expected: Shows Severity (text) and Incident Description (textarea) inputs from metadata_json; Run works
- Fail: Wrong inputs or error

**TC-13.2.5: Marketing execution with file upload**
- Actions: Navigate to /app/marketing/capability/campaign_brief; fill fields; attach file
- Expected: Campaign Name (text), Brief Description (textarea), Brand Assets (file) rendered; file upload works; execution completes
- Fail: File upload fails or wrong fields

### 13.3 Document Management Across Domains

**TC-13.3.1: Documents scoped per department**
- Preconditions: Upload document in Finance scope; upload document in HR scope
- Actions: View Finance documents; view HR documents
- Expected: Finance view shows only Finance documents; HR view shows only HR documents
- Fail: Cross-department leakage

**TC-13.3.2: Global documents view shows all**
- Actions: Navigate to /documents (no department filter)
- Expected: All documents across all departments visible
- Fail: Missing documents

**TC-13.3.3: Department filter on global documents**
- Actions: Click Finance filter badge on /documents
- Expected: URL updates to /documents?department={finance_dept_id}; only Finance documents shown
- Fail: Wrong filter or all documents shown

### 13.4 History Across Domains

**TC-13.4.1: Run History capability scoped to department**
- Actions: Navigate to /app/finance/capability/finance_history
- Expected: Shows only executions for Finance department
- Fail: Shows executions from other departments

**TC-13.4.2: Execution detail expandable**
- Actions: Click an execution row
- Expected: Inputs and outputs JSON displayed; clicking again collapses
- Fail: No expansion or wrong data

---

## Appendix A: Known Gaps & Future Test Attachment Points

| Gap | Current Behavior | Future Test |
|-----|-----------------|-------------|
| Backend auth | No authentication middleware on FastAPI | Verify JWT/session validation on all endpoints |
| RLS enforcement | Backend uses direct DB connection, bypasses RLS | Verify per-request tenant context set |
| Tenant isolation | business_id scoping only; no tenant_id enforcement in API | Verify tenant_id-based data isolation |
| Execution engine | Stub: immediate completion | Verify queued → running → completed transitions; async job processing |
| Event tables | TODO in schema | Verify append-only event inserts for audit trail |
| Document versioning | init-upload creates new document each time | Support adding version to existing document_id |
| Execution department validation | No check that department_id belongs to business_id | Verify cross-reference validation |
| File type validation | No content_type or extension validation | Verify allowed file types |
| File size limits | No limits enforced | Verify max file size |
| Rate limiting | None | Verify per-endpoint rate limits |
| Slug uniqueness UX | DB constraint; error message is raw Postgres | Verify user-friendly slug conflict message |
| Concurrent uploads | No locking | Verify concurrent upload handling |

## Appendix B: Automation Framework Recommendations

| Category | Tool | Notes |
|----------|------|-------|
| Backend API | pytest + httpx | Test all endpoints; use test database |
| Frontend E2E | Playwright | Mobile emulation (iPhone 14); test full flows |
| Frontend Unit | React Testing Library + Jest | Context providers, component rendering |
| Database | pgTAP or pytest with psycopg | Verify schema, constraints, triggers, seeds |
| Visual Regression | Playwright screenshots | Capture desktop + mobile for each major view |
| Load Testing | Locust | Verify concurrent business provisioning + uploads |
| Security | OWASP ZAP | Scan API endpoints for injection, auth bypass |
