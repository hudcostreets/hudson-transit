import './Toggle.scss'

interface ToggleProps {
  options: string[]
  value: string
  onChange: (value: string) => void
}

export default function Toggle({ options, value, onChange }: ToggleProps) {
  return (
    <div className="toggle">
      {options.map(opt => (
        <button
          key={opt}
          className={opt === value ? 'active' : ''}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
