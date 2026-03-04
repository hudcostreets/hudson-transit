import modesData from './data/modes.json'
import crossingsData from './data/crossings.json'
import type { ModeRecord, CrossingRecord } from './lib/types'
import PeakScatter from './components/PeakScatter'
import PeakBar from './components/PeakBar'
import PeakPctBar from './components/PeakPctBar'
import DayBar from './components/DayBar'
import DayPctBar from './components/DayPctBar'
import RecoveryLine from './components/RecoveryLine'
import './App.scss'

const modes = modesData as ModeRecord[]
const crossings = crossingsData as CrossingRecord[]

const NAV = [
  { id: 'peak-scatter', label: 'Peak Scatter' },
  { id: 'peak-bar', label: 'Peak Bar' },
  { id: 'peak-pct', label: 'Peak %' },
  { id: 'day', label: '24hr' },
  { id: 'day-pct', label: '24hr %' },
  { id: 'recovery', label: 'Recovery' },
]

function App() {
  return (
    <div className="app">
      <header>
        <h1>Hudson River Crossing Transit Data</h1>
        <p className="subtitle">
          NJ&rarr;NY transit trends, 2014&ndash;2024.
          From <a href="https://www.nymtc.org/en-us/Data-and-Modeling/Transportation-Data-and-Statistics/Publications/Hub-Bound-Travel">NYMTC Hub Bound Travel</a> reports.
        </p>
        <nav>
          {NAV.map(({ id, label }) => (
            <a key={id} href={`#${id}`}>{label}</a>
          ))}
        </nav>
      </header>
      <main>
        <section id="peak-scatter">
          <PeakScatter data={crossings} />
        </section>
        <section id="peak-bar">
          <PeakBar data={crossings} />
        </section>
        <section id="peak-pct">
          <PeakPctBar data={crossings} />
        </section>
        <section id="day">
          <DayBar data={modes} />
        </section>
        <section id="day-pct">
          <DayPctBar data={modes} />
        </section>
        <section id="recovery">
          <RecoveryLine data={modes} />
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
