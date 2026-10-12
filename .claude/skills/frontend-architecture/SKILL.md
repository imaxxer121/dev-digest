---
name: frontend-architecture
description: Apply DevDigest frontend architecture when editing client pages, components, query hooks or UI tests.
---

Use Next.js App Router pages for route-level data and navigation. Place page-local components under _components/<PascalCase>/, with index.ts exports. Put reused components in src/components and queries in src/lib/hooks. Keep UI copy in next-intl messages and use @devdigest/ui theme tokens. Test interactions with Testing Library, mock external hooks, and verify real UI states in the browser.
