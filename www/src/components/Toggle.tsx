import type { ReactNode } from 'react'
import './Toggle.scss'

export interface ToggleOption<V extends string = string> {
  value: V
  label: ReactNode
}

interface ToggleProps<V extends string = string> {
  options: ToggleOption<V>[]
  value: V
  onChange: (value: V) => void
}

export default function Toggle<V extends string>({ options, value, onChange }: ToggleProps<V>) {
  return (
    <div className="toggle">
      {options.map(opt => (
        <button
          key={opt.value}
          className={opt.value === value ? 'active' : ''}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
