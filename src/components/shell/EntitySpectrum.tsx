const ENTITIES = ["application", "api", "compute", "messaging", "data", "security", "capability"] as const;

const ACCENT: Record<(typeof ENTITIES)[number], string> = {
  application: "bg-entity-application-accent",
  api: "bg-entity-api-accent",
  compute: "bg-entity-compute-accent",
  messaging: "bg-entity-messaging-accent",
  data: "bg-entity-data-accent",
  security: "bg-entity-security-accent",
  capability: "bg-entity-capability-accent",
};

/** Decorative band of the seven entity accents: Atlas's visual signature. Carries no information. */
export function EntitySpectrum({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`flex h-1 overflow-hidden rounded-full ${className}`}>
      {ENTITIES.map((entity) => (
        <span key={entity} className={`flex-1 ${ACCENT[entity]}`} />
      ))}
    </span>
  );
}
