import type { OrderStatus } from '../../types/domain'

interface TimelineStep {
  status: OrderStatus
  label: string
  hint: string
}

const STEPS: ReadonlyArray<TimelineStep> = [
  { status: 'NEW', label: 'Alındı', hint: 'Siparişiniz alındı' },
  { status: 'PREPARING', label: 'Hazırlanıyor', hint: 'Mutfakta hazırlanıyor' },
  { status: 'READY', label: 'Hazır', hint: 'Teslim alabilirsiniz' },
  { status: 'DELIVERED', label: 'Teslim edildi', hint: 'Afiyet olsun' },
]

export function OrderTimeline({ status }: { status: OrderStatus }) {
  const currentIndex = STEPS.findIndex((step) => step.status === status)

  return (
    <ol className="tracking-timeline list-unstyled" aria-label="Sipariş durumu">
      {STEPS.map((step, index) => {
        const done = currentIndex >= 0 && index < currentIndex
        const current = index === currentIndex
        return (
          <li
            key={step.status}
            className={`tracking-step${done ? ' is-done' : ''}${current ? ' is-current' : ''}`}
            aria-current={current ? 'step' : undefined}
          >
            <div className="dot" aria-hidden="true">
              {done ? '✓' : index + 1}
            </div>
            <div className="fw-semibold">{step.label}</div>
            <div>{step.hint}</div>
          </li>
        )
      })}
    </ol>
  )
}
