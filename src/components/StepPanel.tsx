import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Zap, Cpu } from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export interface Step {
  title: string;
  content: string;
  latex?: string; // If present, renders with KaTeX
}

interface StepPanelProps {
  steps: Step[];
  result?: string | null;
  resultLatex?: string | null; // Optional LaTeX version of result
  error?: string | null;
  title?: string;
  source?: 'sympy' | 'fallback' | 'mathjs'; // Indicates where result came from
}

// ─── KaTeX renderer component ─────────────────────────────────────────────────
function MathDisplay({ latex, display = false }: { latex: string; display?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(latex, ref.current, {
        displayMode: display,
        throwOnError: false,
        strict: false,
        trust: true,
      });
    } catch {
      if (ref.current) ref.current.textContent = latex;
    }
  }, [latex, display]);
  return <span ref={ref} />;
}

// ─── Source badge ─────────────────────────────────────────────────────────────
function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const isSympy = source === 'sympy';
  const isFallback = source === 'fallback';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 8px',
      borderRadius: '20px',
      fontSize: '10px',
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      background: isSympy ? '#dcfce7' : isFallback ? '#fef9c3' : '#f1f5f9',
      color: isSympy ? '#166534' : isFallback ? '#854d0e' : '#475569',
      border: `1px solid ${isSympy ? '#bbf7d0' : isFallback ? '#fef08a' : '#e2e8f0'}`,
    }}>
      {isSympy ? <Zap size={9} /> : <Cpu size={9} />}
      {isSympy ? 'SymPy' : isFallback ? 'SciPy fallback' : 'math.js'}
    </span>
  );
}

export function StepPanel({
  steps,
  result,
  resultLatex,
  error,
  title = 'Solución Paso a Paso',
  source,
}: StepPanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      overflow: 'hidden',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '11px 14px',
          background: 'linear-gradient(90deg, #f8fafc, #f1f5f9)',
          border: 'none',
          borderBottom: open ? '1px solid #e2e8f0' : 'none',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 700,
          color: '#1e293b',
          letterSpacing: '0.01em',
          gap: '8px',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
            background: error ? '#ef4444' : result ? '#10b981' : '#7c3aed',
          }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </span>
          <SourceBadge source={source} />
        </span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      {open && (
        <div style={{ padding: '14px' }}>
          {/* Error banner */}
          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '9px 12px',
              color: '#dc2626',
              fontSize: '12px',
              marginBottom: '10px',
              fontFamily: 'monospace',
            }}>
              ⚠ {error}
            </div>
          )}

          {/* Result banner */}
          {result && !error && (
            <div style={{
              background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
              border: '1px solid #6ee7b7',
              borderRadius: '10px',
              padding: '11px 14px',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '18px' }}>✓</span>
              <div style={{ flex: 1 }}>
                {resultLatex ? (
                  <div style={{ fontSize: '15px', color: '#065f46' }}>
                    <MathDisplay latex={resultLatex} display />
                  </div>
                ) : (
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#065f46',
                  }}>
                    {result}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {steps.length === 0 && !error && !result && (
            <p style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center', margin: '8px 0', fontStyle: 'italic' }}>
              Ingresa los parámetros y presiona <strong>Calcular</strong>
            </p>
          )}

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                {/* Number badge */}
                <div style={{
                  minWidth: '24px', height: '24px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px',
                }}>
                  {i + 1}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Step title */}
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#7c3aed',
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    {step.title}
                  </div>

                  {/* Step content: LaTeX if available, else monospace text */}
                  {step.latex ? (
                    <div style={{
                      background: '#faf5ff',
                      border: '1px solid #e9d5ff',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      overflowX: 'auto',
                    }}>
                      <MathDisplay latex={step.latex} display={step.latex.length > 30} />
                      {/* Also show plain text below if different */}
                      {step.content && step.content !== step.latex && (
                        <pre style={{
                          fontSize: '11px',
                          color: '#64748b',
                          margin: '6px 0 0',
                          fontFamily: "'JetBrains Mono', monospace",
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          borderTop: '1px solid #e9d5ff',
                          paddingTop: '6px',
                        }}>
                          {step.content}
                        </pre>
                      )}
                    </div>
                  ) : (
                    <pre style={{
                      fontSize: '12px',
                      color: '#334155',
                      margin: 0,
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      background: '#f8fafc',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      lineHeight: '1.6',
                    }}>
                      {step.content}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
