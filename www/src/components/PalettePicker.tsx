import { useState } from 'react'
import { useFloating, useClick, useDismiss, useInteractions, offset, flip, shift, FloatingPortal } from '@floating-ui/react'
import type { ToggleOption } from './Toggle'
import './PalettePicker.scss'

export default function PalettePicker<V extends string>({ options, value, onChange }: {
  options: ToggleOption<V>[]
  value: V
  onChange: (value: V) => void
}) {
  const [open, setOpen] = useState(false)
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-end',
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  })
  const click = useClick(context)
  const dismiss = useDismiss(context)
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss])

  return (
    <>
      <button
        ref={refs.setReference}
        className="palette-trigger"
        {...getReferenceProps()}
        aria-label="Color scheme"
      >
        🎨
      </button>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            className="palette-popover"
            style={floatingStyles}
            {...getFloatingProps()}
          >
            {options.map(opt => (
              <button
                key={opt.value}
                className={`palette-option${opt.value === value ? ' active' : ''}`}
                onClick={() => { onChange(opt.value); setOpen(false) }}
              >
                {opt.label}
                <span className="palette-option-name">{opt.tooltip ?? opt.value}</span>
              </button>
            ))}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
