import { useState, type ReactNode } from 'react'
import { useFloating, useHover, useInteractions, offset, flip, shift, FloatingPortal } from '@floating-ui/react'
import type { Placement } from '@floating-ui/react'

/** Inline abbreviation with tooltip on hover */
export function Abbr({ title, children }: { title: string, children: ReactNode }) {
  return (
    <Tooltip title={title} placement="top">
      <abbr style={{ textDecoration: 'underline dotted', textUnderlineOffset: '0.15em', cursor: 'help' }}>{children}</abbr>
    </Tooltip>
  )
}

export default function Tooltip({ title, children, placement = 'bottom' }: {
  title: string
  children: ReactNode
  placement?: Placement
}) {
  const [open, setOpen] = useState(false)
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  })
  const hover = useHover(context)
  const { getReferenceProps, getFloatingProps } = useInteractions([hover])

  return (
    <>
      <span ref={refs.setReference} style={{ display: 'inline-flex' }} {...getReferenceProps()}>
        {children}
      </span>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            className="toggle-tooltip"
            style={floatingStyles}
            {...getFloatingProps()}
          >
            {title}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}

/** Ref-based tooltip renderer for SpeedDial (no wrapper node) */
export function SDTooltipRenderer({ title, anchor }: { title: string; anchor: HTMLElement }) {
  const { refs, floatingStyles } = useFloating({
    elements: { reference: anchor },
    placement: 'left',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  })
  return (
    <FloatingPortal>
      <div ref={refs.setFloating} className="toggle-tooltip" style={floatingStyles}>
        {title}
      </div>
    </FloatingPortal>
  )
}
