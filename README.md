# JSON Fixer

Client-side JSON editor for large, deeply nested files. No server upload—all processing in browser.

## Features

- **Load**: File picker or test data (fruit, cars, deep hierarchy)
- **Edit**: Tree view with drag (↑↓), sort (⇅), add (+), delete (×)
- **Compare**: Side-by-side source | editor | output
- **Save**: Downloads as `{filename}_copy.json`
- **Validate**: JSON validity + control-char check for API/DB safety

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
