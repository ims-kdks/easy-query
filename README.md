# Easy Query

A high-performance, browser-based data viewer powered by **DuckDB-Wasm** and **Svelte 5**.

## Features

- **High Performance**: Handle GB-level CSV, TSV, Parquet, JSON, or JSONL datasets with virtual scrolling and streaming queries
- **SQL Queries**: Full SQL support via DuckDB - filter, aggregate, join, and transform your data
- **Infinite Scrolling**: Smooth virtual scrolling that loads data on-demand
- **Column Sorting**: Click-to-sort with ascending/descending toggle
- **Global Search**: Search across all columns instantly
- **Column Filtering**: Filter individual columns with pattern matching
- **Table Management**: Remove loaded tables from the session
- **Export Results**: Download query results as CSV, TSV, or Parquet
- **Session Restore (Chromium)**: Remember imported files (picker and drag-drop when supported) across page reloads
- **100% Client-Side**: All processing happens in your browser - no data is uploaded anywhere

## Tech Stack

- **Svelte 5** - Modern reactive UI framework with runes
- **DuckDB-Wasm** - In-browser analytical SQL database
- **CodeMirror 6** - SQL editor with syntax highlighting
- **Tailwind CSS** - Utility-first styling
- **Vite** - Fast build tool with WASM support

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or pnpm

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The static build will be in the `build/` directory. You can deploy this to any static hosting service (GitHub Pages, Netlify, Vercel, etc.).

### Quality Checks

```bash
# Type/lint checks (no auto-fixes)
npm run check

# Apply formatter/lint auto-fixes intentionally
npm run format
```

## Synthetic Demo Database

The deterministic synthetic urban-mobility Postgres dataset and seeding instructions live in
[`scripts/metro_move`](scripts/metro_move/README.md). The generated data is
fictional, contains no personal information, and does not incorporate third-party
datasets.

## Usage

1. **Load files**: Drag and drop CSV/TSV/Parquet/JSON/JSONL files anywhere on the page, or click the upload area to browse
2. **View your data**: The data table shows your data with virtual scrolling for large files
3. **Write SQL queries**: Use the SQL editor to query your data with full DuckDB SQL support
4. **Sort & Filter**: Use the filter bar for quick sorting and filtering without writing SQL
5. **Search**: Use global search to find values across all columns
6. **Export**: Download the current query result as CSV, TSV, or Parquet

## Performance Tips

- For files over 2GB, DuckDB uses streaming queries - only visible data is loaded
- Virtual scrolling means only ~50 rows are rendered at any time, regardless of file size
- Consider using Parquet format for repeated queries on the same data (10-100x faster)
