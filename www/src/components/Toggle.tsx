import { useState, type ReactNode } from 'react'
import { useFloating, useHover, useInteractions, offset, flip, shift, FloatingPortal } from '@floating-ui/react'
import './Toggle.scss'

export interface ToggleOption<V extends string = string> {
  value: V
  label: ReactNode
  tooltip?: string
}

interface ToggleProps<V extends string = string> {
  options: ToggleOption<V>[]
  value: V
  onChange: (value: V) => void
  prefix?: ReactNode
}

function TooltipButton<V extends string>({ opt, active, onClick }: {
  opt: ToggleOption<V>
  active: boolean
  onClick: () => void
}) {
  const [open, setOpen] = useState(false)
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom',
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  })
  const hover = useHover(context, { delay: { open: 400, close: 0 } })
  const { getReferenceProps, getFloatingProps } = useInteractions([hover])

  return (
    <>
      <button
        ref={refs.setReference}
        className={active ? 'active' : ''}
        onClick={onClick}
        {...getReferenceProps()}
      >
        {opt.label}
      </button>
      {opt.tooltip && open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            className="toggle-tooltip"
            style={floatingStyles}
            {...getFloatingProps()}
          >
            {opt.tooltip}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}

export default function Toggle<V extends string>({ options, value, onChange, prefix }: ToggleProps<V>) {
  return (
    <div className="toggle">
      {prefix && <span className="toggle-prefix">{prefix}</span>}
      {options.map(opt => (
        <TooltipButton
          key={opt.value}
          opt={opt}
          active={opt.value === value}
          onClick={() => onChange(opt.value)}
        />
      ))}
    </div>
  )
}
