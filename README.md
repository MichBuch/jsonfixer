# JSON Fixer

Client-side JSON editor for large, deeply nested files. No server upload—all processing in browser.

## Features

- **Load**: File picker or test data (fruit, cars, deep hierarchy)
- **Edit**: Tree view with drag (↑↓), add (+), delete (×)
- **Sort**: Double-click to select, right-click → Sort A→Z, Z→A, numerical ↑↓ (at selected level only; source unchanged)
- **Compare**: Side-by-side source | editor | output
- **Save**: Downloads as `{filename}_copy.json`
- **Validate**: JSON validity + control-char check for API/DB safety

## Deployment

- **Demo**: Deploy to Vercel for web demo (client-side only)
- **Production**: Run locally behind firewall (`npm run build && npm start`)

## Tech

- Next.js 14, React 18
- Vanilla CSS, no 3rd-party UI libs

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Test Data

- `fruit-catalog.json` – fruit (attributes, classification, packaging)
- `vehicle-inventory.json` – cars/motorcycles
- `deep-hierarchy.json` – nested structure
