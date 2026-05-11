# ACU Project (HRIS)

A Next.js-based Human Resource Information System (HRIS) application focused on viewing and managing data from Acumatica.

## Project Overview

- **Framework:** Next.js 16.2.6 (App Router)
- **Library:** React 19.2.4
- **Architecture:** Modern MVC / BFF (Backend-for-Frontend)
- **Styling:** Vanilla CSS (Strictly avoid utility frameworks unless requested)
- **Data Source:** Acumatica ERP via REST API

## Architecture: Modern MVC

To ensure scalability and clean separation of concerns, the project follows an MVC-inspired pattern adapted for Next.js:

1.  **Models (`src/lib/models` & `src/lib/services`):**
    *   **Models:** Define data structures and validation schemas (e.g., Zod).
    *   **Services:** Handle direct communication with Acumatica, data transformation, and business logic. This acts as the "Source of Truth".
2.  **Views (`src/components` & `app/` layouts):**
    *   Purely presentational React components.
    *   Focus on UI/UX and accessibility.
3.  **Controllers (`app/**/page.js` & `src/lib/actions`):**
    *   **Pages:** Act as the entry-point controllers that orchestrate data fetching from Services and passing it to Components.
    *   **Server Actions:** Handle mutations and user interactions that require server-side logic.

## Building and Running

- **Development:** `npm run dev`
- **Build:** `npm run build`
- **Production Start:** `npm run start`
- **Linting:** `npm run lint`

## Development Conventions

- **Path Aliases:** Always use `@/*` for root-relative imports.
- **Styling:** Follow the minimalist CSS pattern in `styles/`. Prefer modularity.
- **Data Fetching:** Prefer Server Components for data fetching to keep Acumatica credentials secure.
- **Transformation:** Always transform Acumatica's raw JSON response into clean Application Models in the Service layer before it reaches the UI.

## Important Note for AI Agents

Refer to `node_modules/next/dist/docs/` for version-specific documentation of Next.js 16.2.6. Pay close attention to `AGENTS.md` for breaking changes in this custom version.
