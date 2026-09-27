import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// `/files/*` is its own chunk: `App` statically imports the full dataset
// (~18MB), which the file browser doesn't need.
const Page = location.pathname.startsWith('/files')
  ? lazy(() => import('./FilesPage.tsx'))
  : lazy(() => import('./App.tsx'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense>
      <Page />
    </Suspense>
  </StrictMode>,
)
