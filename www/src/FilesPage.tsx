import { BrowserRouter } from 'react-router-dom'
import { FileTree } from '@rdub/file-tree/react'
import { HttpStore } from '@rdub/file-tree/stores/http'
import './App.scss'

// Served by the `hbt-www` Worker from the HCCS R2 bucket `hbt` (`worker/index.ts`).
const store = HttpStore('/api/files', { describe: 'r2://hbt/' })

export default function FilesPage() {
  return (
    <BrowserRouter>
      <div className="files-page">
        <p className="files-intro">
          <a href="/">Hub Bound Travel</a>: source reports and extracted data.{' '}
          <code>raw/</code> mirrors the <a href="https://www.nymtc.org/Data-and-Modeling/Transportation-Data-and-Statistics/Publications/Hub-Bound-Travel">NYMTC Hub Bound Travel</a> PDFs
          and Excel appendices (2014&ndash;2024); <code>data/</code> is what this site's charts are built from.
        </p>
        <FileTree store={store} routeBase="/files" title="Files" />
      </div>
    </BrowserRouter>
  )
}
