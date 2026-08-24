# TDX — Financial & Profit Tracking Application

TDX is a production-ready, mobile-first financial/profit tracking application built with React, TypeScript, Vite, Tailwind CSS, and Supabase.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS
- **Backend:** Supabase (PostgreSQL, Auth, Row Level Security)
- **Linting:** ESLint
- **Deployment:** Vercel

## Project Structure

```text
TDX/
├── src/
│   ├── components/     # Reusable UI components
│   ├── features/       # Feature-specific modules
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utility libraries
│   ├── services/       # API/service layer
│   └── types/          # TypeScript type definitions
├── public/             # Static assets
├── supabase/
│   └── migrations/     # Version-controlled SQL migrations
├── tests/              # Test files
├── docs/               # Documentation
├── .env.example        # Environment variable template
├── .gitignore
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Getting Started

### Prerequisites

- Node.js LTS
- npm
- Git
- Supabase account
- Vercel account (for deployment)

### Setup

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
cp .env.example .env
```

4. Start the development server:

```bash
npm run dev
```

### Available Scripts

```bash
npm run dev       # Start development server
npm run build     # Type-check and build for production
npm run lint      # Run ESLint
npm run preview   # Preview production build locally
```

## Development Phases

The project follows a phased development approach:

1. Project foundation
2. Database schema
3. Database security (RLS)
4. Authentication
5. UI component system
6. Application shell
7. Dashboard
8. Financial calculation engine
9. Transactions
10. Income
11. Expenses
12. Investments
13. Investment-return exclusion
14. Reports
15. Search/filter/sort
16. Charts
17. Profile
18. Settings
19. Responsive audit
20. Loading/error/empty states
21. Financial accuracy testing
22. Security audit
23. Automated testing
24. User-isolation testing
25. PWA
26. Production build
27. Deployment
28. Final end-to-end audit

## Security

- Row Level Security is enabled on all user-owned tables
- The service-role key is never exposed in frontend code
- Environment variables are never committed to Git
- User ownership is always derived from the authenticated Supabase user

## License

Private project.