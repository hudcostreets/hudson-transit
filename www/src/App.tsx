import { useState } from 'react'
import modesData from './data/modes.json'
import crossingsData from './data/crossings.json'
import type { ModeRecord, CrossingRecord } from './lib/types'
import { COLOR_SCHEMES } from './lib/colors'
import { ColorContext } from './lib/ColorContext'
import PeakScatter from './components/PeakScatter'
import PeakBar from './components/PeakBar'
import PeakPctBar from './components/PeakPctBar'
import DayBar from './components/DayBar'
import DayPctBar from './components/DayPctBar'
import RecoveryLine from './components/RecoveryLine'
import Toggle from './components/Toggle'
import './App.scss'

const modes = modesData as ModeRecord[]
const crossings = crossingsData as CrossingRecord[]

const NAV = [
  { id: 'peak-scatter', label: 'Peak Scatter' },
  { id: 'peak-bar', label: 'Peak Bar' },
  { id: 'day', label: '24hr' },
  { id: 'recovery', label: 'Recovery' },
]

const UNIT_OPTIONS = ['#', '%']

function App() {
  const [schemeIdx, setSchemeIdx] = useState(0)
  const [peakUnit, setPeakUnit] = useState('#')
  const [dayUnit, setDayUnit] = useState('#')
  const scheme = COLOR_SCHEMES[schemeIdx]

  return (
    <ColorContext value={scheme}>
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
            <span className="nav-separator" />
            <select
              value={schemeIdx}
              onChange={e => setSchemeIdx(Number(e.target.value))}
              className="scheme-select"
            >
              {COLOR_SCHEMES.map((s, i) => (
                <option key={s.name} value={i}>{s.name}</option>
              ))}
            </select>
          </nav>
        </header>
        <main>
          <section id="peak-scatter">
            <h2>NJ&rarr;NY passengers, by mode/location</h2>
            <p className="chart-subtitle">8-9am, Fall business day</p>
            <PeakScatter data={crossings} />
          </section>
          <section id="peak-bar">
            <h2>NJ&rarr;NY passengers, by mode/location</h2>
            <p className="chart-subtitle">8-9am, Fall business day</p>
            <Toggle options={UNIT_OPTIONS} value={peakUnit} onChange={setPeakUnit} />
            {peakUnit === '#'
              ? <PeakBar data={crossings} />
              : <PeakPctBar data={crossings} />
            }
          </section>
          <section id="day">
            <h2>NJ&rarr;NY crossings on a Fall business day</h2>
            <Toggle options={UNIT_OPTIONS} value={dayUnit} onChange={setDayUnit} />
            {dayUnit === '#'
              ? <DayBar data={modes} />
              : <DayPctBar data={modes} />
            }
          </section>
          <section id="recovery">
            <h2>Recovery from COVID</h2>
            <p className="chart-subtitle">NJ&rarr;NY mode volumes as % of 2019 level</p>
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
    </ColorContext>
  )
}

export default App
