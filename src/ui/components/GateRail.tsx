import type { GateCheck } from '../../domain/types';

export function GateRail({ gates }: { gates: GateCheck[] }) {
  return (
    <div className="gate-rail" aria-label="四道闸门">
      {gates.map((gate) => (
        <section className={`gate gate-${gate.status}`} key={gate.name}>
          <span>{gate.name}</span>
          <strong>{gate.status}</strong>
          <p>{gate.reason}</p>
        </section>
      ))}
    </div>
  );
}
