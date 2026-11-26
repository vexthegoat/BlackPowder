import React from 'react';
import { AlertTriangle, RotateCcw, RefreshCw, Copy, Check } from 'lucide-react';

export interface CrashInfo {
  title: string;
  message: string;
  stack?: string;
  source: 'react' | 'runtime' | 'promise' | 'simulation';
  timestamp: string;
  context?: string;
}

export function buildCrashInfo(
  error: unknown,
  source: CrashInfo['source'],
  context?: string
): CrashInfo {
  const errObj =
    error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : 'Unknown error');
  return {
    title:
      source === 'simulation'
        ? 'Battlefield Simulation Error'
        : source === 'promise'
          ? 'Unhandled Async Error'
          : source === 'runtime'
            ? 'Runtime Exception'
            : 'Interface Render Error',
    message: errObj.message || 'An unexpected error interrupted execution.',
    stack: errObj.stack,
    source,
    timestamp: new Date().toISOString(),
    context,
  };
}

export function formatCrashReport(info: CrashInfo): string {
  const lines = [
    `=== Blackpowder Sandbox Crash Report ===`,
    `Time: ${info.timestamp}`,
    `Source: ${info.source}`,
    `Title: ${info.title}`,
    `Message: ${info.message}`,
  ];
  if (info.context) {
    lines.push(`Context: ${info.context}`);
  }
  if (info.stack) {
    lines.push('', 'Stack Trace:', info.stack);
  }
  return lines.join('\n');
}

export function CrashReportScreen({
  crash,
  onRecover,
  onReload,
}: {
  crash: CrashInfo;
  onRecover?: () => void;
  onReload: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);

  const handleCopy = () => {
    const text = formatCrashReport(crash);
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="crash-handler-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#11100d]"
    >
      <div className="w-full max-w-xl rounded-lg border border-[#d6574f]/45 bg-[#1b1915] text-[#f4ece0] shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3.5 px-6 py-5 border-b border-[#c8a45d]/20 bg-[#211b19]">
          <div className="p-2.5 rounded border border-[#d6574f]/40 bg-[#361c1a] text-[#ef7b74] shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 id="crash-handler-title" className="font-display text-xl font-bold text-[#f7eee0]">
              {crash.title}
            </h1>
            <p className="text-xs text-[#cbbda6] mt-1">
              The crash handler intercepted an unexpected failure to prevent a frozen screen.
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-3.5 rounded border border-[#d6574f]/30 bg-[#151310] text-sm text-[#f2c6c2] font-mono break-words">
            {crash.message}
          </div>

          {crash.context && (
            <div className="text-xs text-[#b5a994]">
              Active State: {crash.context}
            </div>
          )}

          {crash.stack && (
            <div>
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="text-xs text-[#c8a45d] hover:underline cursor-pointer"
              >
                {showDetails ? 'Hide Stack Trace' : 'Show Stack Trace'}
              </button>
              {showDetails && (
                <pre className="mt-2 p-3 rounded border border-[#c8a45d]/20 bg-[#12100d] text-[11px] text-[#b5a994] font-mono overflow-x-auto max-h-44 sandbox-scroll">
                  {crash.stack}
                </pre>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            {onRecover && (
              <button
                type="button"
                onClick={onRecover}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded bg-[#c8a45d] hover:bg-[#d8b46d] text-[#17140e] font-semibold text-sm transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset &amp; Recover</span>
              </button>
            )}

            <button
              type="button"
              onClick={onReload}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded border border-[#c8a45d]/35 bg-[#23201a] hover:bg-[#2d2921] text-[#eee4d1] font-medium text-sm transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-[#c8a45d]" />
              <span>Reload Game</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded border border-[#c8a45d]/25 bg-[#1a1814] hover:bg-[#25221c] text-[#cbbda6] text-sm transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-[#6ec282]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Report</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ErrorBoundaryState {
  crash: CrashInfo | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { crash: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      crash: buildCrashInfo(error, 'react'),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    document.body.dataset.state = 'error';
    this.setState({
      crash: buildCrashInfo(
        error,
        'react',
        info.componentStack ? info.componentStack.trim().split('\n')[0] : undefined
      ),
    });
  }

  render() {
    if (this.state.crash) {
      return (
        <CrashReportScreen
          crash={this.state.crash}
          onRecover={() => {
            this.setState({ crash: null });
          }}
          onReload={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}
