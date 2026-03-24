import { HotkeysProvider, LookupModal, Omnibar, ShortcutsModal, SpeedDial, type SpeedDialAction } from 'use-kbd'
import 'use-kbd/styles.css'
import crossingsData from './data/crossings.json'
import vehiclesData from './data/vehicles.json'
import hourlyData from './data/hourly.json'
import peakData from './data/peak_accumulation.json'
import type { CrossingRecord } from './lib/types'
import type { HourlyRecord, PeakRecord } from './lib/hourly-types'
import UnifiedChart from './components/UnifiedChart'
import SectorChart from './components/SectorChart'
import HourlyChart from './components/HourlyChart'
import PeakChart from './components/PeakChart'
import ModeShareChart from './components/ModeShareChart'
import { SDTooltipRenderer } from './components/Tooltip'
import './App.scss'

const crossings = crossingsData as CrossingRecord[]
const vehicles = vehiclesData as CrossingRecord[]
const hourly = hourlyData as HourlyRecord[]
const peak = peakData as PeakRecord[]

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '1em', height: '1em' }}>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}

function ThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '1em', height: '1em' }}>
      <path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" />
    </svg>
  )
}

const sdActions: SpeedDialAction[] = [
  {
    key: 'github',
    label: 'GitHub',
    icon: <GitHubIcon />,
    href: 'https://github.com/hudcostreets/hudson-transit',
  },
  {
    key: 'theme',
    label: 'Cycle theme (Shift+T)',
    icon: <ThemeIcon />,
    onClick: () => {
      // Dispatch the registered keyboard action
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'T', shiftKey: true, bubbles: true }))
    },
  },
]

const showNyc = location.pathname.startsWith('/nyc')
const clean = new URLSearchParams(location.search).has('clean')

function App() {
  return (
    <HotkeysProvider config={{ storageKey: 'hub-bound-travel' }}>
      <div className="app">
        <main>
          <section id="chart">
            <UnifiedChart data={crossings} clean={clean} />
          </section>
          <section id="map">
          </section>
          {showNyc && <>
            <section id="hourly">
              <HourlyChart data={hourly} />
            </section>
            <section id="mode-share">
              <ModeShareChart data={hourly} />
            </section>
            <section id="sectors">
              <SectorChart data={vehicles} />
            </section>
            <section id="peak">
              <PeakChart data={peak} />
            </section>
          </>}
        </main>
        <footer>
          <p className="subtitle">
            Travel into Manhattan&rsquo;s Central Business District (below 60th St), 2014&ndash;2024.
            From <a href="https://www.nymtc.org/en-us/Data-and-Modeling/Transportation-Data-and-Statistics/Publications/Hub-Bound-Travel">NYMTC Hub Bound Travel</a> reports.
          </p>
          <p>
            <a href="https://hudcostreets.org">Hudson County Complete Streets</a>
          </p>
        </footer>
      </div>
      <Omnibar />
      <ShortcutsModal editable />
      <LookupModal />
      {!clean && <SpeedDial actions={sdActions} chevronMode="badge" TooltipRenderer={SDTooltipRenderer} />}
    </HotkeysProvider>
  )
}

export default App
