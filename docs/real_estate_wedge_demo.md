# Real Estate Wedge Demo

1. Start backend:
```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

2. Start frontend:
```bash
cd repo-b
npm run dev
```

3. Create a business from `/onboarding`, then open `/app/real-estate`.

4. Seed demo data from the page (`Seed Demo Data`) or create trust + loan manually.

5. Navigate trust -> loan and run:
- add a surveillance snapshot
- run re-underwrite once (version 1)
- run re-underwrite with changed cap rate (version 2)
- confirm diff appears in the run panel

6. Create workout case/action and event with document ID attachment to verify round-trip.

