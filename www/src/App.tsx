import crossingsData from './data/crossings.json'
import type { CrossingRecord } from './lib/types'
import UnifiedChart from './components/UnifiedChart'
import './App.scss'

const crossings = crossingsData as CrossingRecord[]

function App() {
  return (
    <div className="app">
      <header>
        <h1>Hub Bound Travel</h1>
        <p className="subtitle">
          NJ&rarr;NY transit trends, 2014&ndash;2024.
          From <a href="https://www.nymtc.org/en-us/Data-and-Modeling/Transportation-Data-and-Statistics/Publications/Hub-Bound-Travel">NYMTC Hub Bound Travel</a> reports.
        </p>
      </header>
      <main>
        <section id="chart">
          <h2>NJ Sector passengers by mode/crossing</h2>
          <UnifiedChart data={crossings} />
        </section>
      </main>
      <footer>
        <p>
          Data: <a href="https://www.nymtc.org/en-us/Data-and-Modeling/Transportation-Data-and-Statistics/Publications/Hub-Bound-Travel">NYMTC Hub Bound Travel Reports</a>, 2014&ndash;2024.
        </p>
        <p>
          <a href="https://hudcostreets.org">Hudson County Complete Streets</a>
        </p>
      </footer>
    </div>
  )
}

export default App
