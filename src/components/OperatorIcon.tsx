/**
 * Displays the mobile carrier SVG icon based on the operator name stored in lead.operator.
 * Matches by substring (case-insensitive) so "Claro", "CLARO S/A", "Claro (portado)" all work.
 */

interface OperatorIconProps {
  operator: string | null | undefined;
  className?: string;
}

// ── Claro (red) ──
function ClaroIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label="Claro">
      <circle cx="16" cy="16" r="14" fill="#DA291C" />
      <circle cx="16" cy="16" r="6" fill="none" stroke="#fff" strokeWidth="2.5" />
      <line x1="16" y1="4" x2="16" y2="9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="16" y1="23" x2="16" y2="28" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="4" y1="16" x2="9" y2="16" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="23" y1="16" x2="28" y2="16" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// ── Vivo (purple) ──
function VivoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label="Vivo">
      <circle cx="16" cy="16" r="14" fill="#660099" />
      <text x="16" y="21" textAnchor="middle" fontSize="13" fontWeight="bold" fontFamily="Arial,sans-serif" fill="#fff">V</text>
    </svg>
  );
}

// ── Tim (blue) ──
function TimIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label="Tim">
      <circle cx="16" cy="16" r="14" fill="#004B93" />
      <text x="16" y="20.5" textAnchor="middle" fontSize="11" fontWeight="bold" fontFamily="Arial,sans-serif" fill="#fff">TIM</text>
    </svg>
  );
}

// ── Oi (yellow/orange) ──
function OiIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label="Oi">
      <circle cx="16" cy="16" r="14" fill="#F5A623" />
      <text x="16" y="21" textAnchor="middle" fontSize="14" fontWeight="bold" fontFamily="Arial,sans-serif" fill="#fff">Oi</text>
    </svg>
  );
}

// ── Algar (green) ──
function AlgarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label="Algar">
      <circle cx="16" cy="16" r="14" fill="#00A651" />
      <text x="16" y="20.5" textAnchor="middle" fontSize="9.5" fontWeight="bold" fontFamily="Arial,sans-serif" fill="#fff">ALG</text>
    </svg>
  );
}

// ── Nextel (yellow-green) ──
function NextelIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label="Nextel">
      <circle cx="16" cy="16" r="14" fill="#B8D432" />
      <text x="16" y="20.5" textAnchor="middle" fontSize="8" fontWeight="bold" fontFamily="Arial,sans-serif" fill="#333">NXT</text>
    </svg>
  );
}

// ── Sercomtel ──
function SercomtelIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label="Sercomtel">
      <circle cx="16" cy="16" r="14" fill="#0072BC" />
      <text x="16" y="20.5" textAnchor="middle" fontSize="7.5" fontWeight="bold" fontFamily="Arial,sans-serif" fill="#fff">SRC</text>
    </svg>
  );
}

// ── Fallback (generic) ──
function GenericIcon({ className, label }: { className?: string; label: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label={label}>
      <circle cx="16" cy="16" r="14" fill="#71717a" />
      <text x="16" y="20.5" textAnchor="middle" fontSize="9" fontWeight="bold" fontFamily="Arial,sans-serif" fill="#fff">
        {label.replace(/\s*\(portado\)/i, "").slice(0, 3).toUpperCase()}
      </text>
    </svg>
  );
}

const OPERATOR_MAP: [RegExp, React.FC<{ className?: string }>][] = [
  [/claro/i, ClaroIcon],
  [/vivo|telef[oô]nica/i, VivoIcon],
  [/tim\b/i, TimIcon],
  [/\boi\b/i, OiIcon],
  [/algar/i, AlgarIcon],
  [/nextel/i, NextelIcon],
  [/sercomtel/i, SercomtelIcon],
];

export default function OperatorIcon({ operator, className = "h-5 w-5" }: OperatorIconProps) {
  if (!operator) return null;

  for (const [regex, Icon] of OPERATOR_MAP) {
    if (regex.test(operator)) return <Icon className={className} />;
  }

  return <GenericIcon className={className} label={operator} />;
}

/** Extract just the operator name (without "portado" suffix) for tooltip */
export function getOperatorLabel(operator: string | null | undefined): string | null {
  if (!operator) return null;
  return operator.replace(/\s*\(portado\)/i, "").trim();
}
