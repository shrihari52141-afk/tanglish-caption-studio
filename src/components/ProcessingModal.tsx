import React, { useEffect, useState, useRef } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Clock, 
  Terminal, 
  Copy, 
  Check, 
  RefreshCw, 
  AlertTriangle,
  Zap,
  Sparkles,
  Volume2,
  FileAudio,
  Cpu,
  Layers,
  Languages,
  Mic,
  Film
} from 'lucide-react';
import { ProcessingStep } from '../types';

interface ProcessingModalProps {
  isOpen: boolean;
  steps: ProcessingStep[];
  logs: string[];
  startTime: number | null;
  hasFailed: boolean;
  activeModel?: string;
  onRetry: () => void;
  onCancel: () => void;
}

export const ProcessingModal: React.FC<ProcessingModalProps> = ({
  isOpen,
  steps,
  logs,
  startTime,
  hasFailed,
  activeModel = 'Gemini 3.5 + Nova 3 + Gemini 3.6 Flash',
  onRetry,
  onCancel
}) => {
  const [elapsedTotalMs, setElapsedTotalMs] = useState(0);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !startTime) {
      setElapsedTotalMs(0);
      return;
    }

    const interval = setInterval(() => {
      if (!hasFailed) {
        setElapsedTotalMs(Date.now() - startTime);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isOpen, startTime, hasFailed]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  if (!isOpen) return null;

  const formatTime = (ms: number) => {
    const totalSecs = ms / 1000;
    const mins = Math.floor(totalSecs / 60);
    const secs = (totalSecs % 60).toFixed(1);
    return `${mins.toString().padStart(2, '0')}:${parseFloat(secs) < 10 ? '0' : ''}${secs}s`;
  };

  const formatStepDuration = (ms?: number) => {
    if (ms == null) return '';
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const completedCount = steps.filter(s => s.status === 'completed').length;
  const inProgressIndex = steps.findIndex(s => s.status === 'in_progress');
  let calculatedProgress = 0;
  if (steps.length > 0) {
    calculatedProgress = (completedCount / steps.length) * 100;
    if (inProgressIndex !== -1) {
      calculatedProgress += (1 / steps.length) * 50;
    }
  }
  const progressPercent = Math.min(100, Math.max(5, Math.round(calculatedProgress)));

  let estimatedRemainingText = 'Estimating...';
  if (completedCount > 0 && elapsedTotalMs > 1000) {
    const avgMsPerStep = elapsedTotalMs / (completedCount + (inProgressIndex !== -1 ? 0.5 : 0));
    const remainingSteps = Math.max(0, steps.length - completedCount - (inProgressIndex !== -1 ? 0.5 : 0));
    const estRemainingMs = Math.round(avgMsPerStep * remainingSteps);
    estimatedRemainingText = formatTime(estRemainingMs);
  }

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n'));
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const getStepIcon = (step: ProcessingStep) => {
    switch (step.id) {
      case 'step-probe':
        return <FileAudio className="w-4 h-4" />;
      case 'step-gemini-transcribe':
        return <Mic className="w-4 h-4" />;
      case 'step-deepgram-original':
      case 'step-deepgram-dubbed':
        return <Volume2 className="w-4 h-4" />;
      case 'step-align':
        return <Layers className="w-4 h-4" />;
      case 'step-gemini-orchestrate':
        return <Cpu className="w-4 h-4" />;
      case 'step-dubbing-tts':
        return <Languages className="w-4 h-4" />;
      case 'step-editor':
        return <Film className="w-4 h-4" />;
      default:
        return <Sparkles className="w-4 h-4" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#121216] border border-[#2a2a35] rounded-3xl w-full max-w-xl shadow-[0_0_50px_rgba(192,38,211,0.25)] overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Top Header Bar */}
        <div className={`px-6 py-4 border-b ${hasFailed ? 'border-red-900/60 bg-red-950/40' : 'border-[#22222a] bg-[#16161c]'} flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              {!hasFailed ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fuchsia-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-fuchsia-500"></span>
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              )}
            </div>
            <div>
              <h2 className={`text-base font-black uppercase tracking-wider ${hasFailed ? 'text-red-400' : 'text-white'} flex items-center gap-2`}>
                {hasFailed ? 'Processing Failed' : 'AI Caption & Dubbing Pipeline'}
              </h2>
              <p className="text-xs text-gray-400 font-medium">
                {hasFailed ? 'An error interrupted pipeline execution' : 'Multi-stage AI processing actively running'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold ${hasFailed ? 'text-red-300 bg-red-500/10 border-red-500/30' : 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/30'} border rounded-full px-3 py-1 flex items-center gap-1.5 shadow-sm`}>
              <Cpu className="w-3 h-3 text-fuchsia-400" />
              {activeModel}
            </span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          
          {/* Main Progress & Total Timer Section */}
          <div className={`bg-[#181820] border ${hasFailed ? 'border-red-900/50' : 'border-[#262633]'} rounded-2xl p-4 space-y-3 shadow-inner`}>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-gray-300 font-bold uppercase tracking-wider">
                <Clock className="w-3.5 h-3.5 text-fuchsia-400" />
                <span>Elapsed:</span>
                <span className="font-mono text-white text-sm font-black tracking-normal">
                  {formatTime(elapsedTotalMs)}
                </span>
                {!hasFailed && (
                  <span className="text-gray-500 text-[11px] font-normal ml-2">
                    (Est. left: <strong className="text-fuchsia-300 font-mono">{estimatedRemainingText}</strong>)
                  </span>
                )}
              </div>
              <div className={`text-sm font-black font-mono ${hasFailed ? 'text-red-400' : 'text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-purple-400'}`}>
                {hasFailed ? 'FAILED' : `${progressPercent}%`}
              </div>
            </div>

            {/* Smooth Progress Bar */}
            <div className="w-full bg-[#0d0d12] rounded-full h-3.5 overflow-hidden border border-[#2a2a38] p-0.5 relative">
              <div 
                className={`h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_15px_rgba(217,70,239,0.6)] ${
                  hasFailed 
                    ? 'bg-gradient-to-r from-red-600 to-rose-600' 
                    : 'bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500'
                }`}
                style={{ width: `${hasFailed ? 100 : progressPercent}%` }}
              />
            </div>
          </div>

          {/* Pipeline Step List */}
          <div className="space-y-2.5">
            <div className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center justify-between px-1">
              <span>Pipeline Stages</span>
              <span className="text-[10px] text-gray-500 font-mono">
                {completedCount}/{steps.length} Completed
              </span>
            </div>

            <div className="space-y-2">
              {steps.map((step) => {
                const isCompleted = step.status === 'completed';
                const isInProgress = step.status === 'in_progress';
                const isFailed = step.status === 'failed';
                const isPending = step.status === 'pending';

                return (
                  <div
                    key={step.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-200 ${
                      isCompleted 
                        ? 'bg-[#141d17]/60 border-emerald-500/30 text-emerald-300'
                        : isInProgress
                        ? 'bg-fuchsia-950/30 border-fuchsia-500/50 text-white shadow-[0_0_15px_rgba(217,70,239,0.15)] animate-pulse'
                        : isFailed
                        ? 'bg-rose-950/50 border-rose-500/60 text-rose-300 ring-1 ring-rose-500/40'
                        : 'bg-[#15151c] border-[#22222c] text-gray-500 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                        isCompleted
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                          : isInProgress
                          ? 'bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-400'
                          : isFailed
                          ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                          : 'bg-[#1d1d26] border-[#2d2d3a] text-gray-500'
                      }`}>
                        {getStepIcon(step)}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold truncate">
                            {step.name}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">
                          {step.description}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {isCompleted && (
                        <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold px-2.5 py-1 rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{formatStepDuration(step.durationMs)}</span>
                        </div>
                      )}

                      {isInProgress && (
                        <div className="flex items-center gap-1.5 bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-300 text-[11px] font-bold px-2.5 py-1 rounded-full">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Running</span>
                        </div>
                      )}

                      {isFailed && (
                        <div className="flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[11px] font-bold px-2.5 py-1 rounded-full">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Failed</span>
                        </div>
                      )}

                      {isPending && (
                        <div className="flex items-center gap-1 bg-[#1a1a24] border border-[#2a2a38] text-gray-500 text-[10px] font-medium px-2 py-0.5 rounded-full">
                          <span>Pending</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Failure Alert Banner */}
          {hasFailed && (
            <div className="bg-rose-950/60 border border-rose-500/60 rounded-2xl p-4 space-y-3 animate-shake">
              <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Exact API / Server Error</span>
              </div>
              <p className="text-xs font-mono text-rose-200 bg-black/60 p-3 rounded-xl border border-rose-900/60 whitespace-pre-wrap leading-relaxed select-text">
                {logs[logs.length - 1] || 'An unexpected error occurred during processing.'}
              </p>
            </div>
          )}

          {/* Live Terminal Logs Drawer */}
          <div className="bg-[#0b0b0f] border border-[#23232f] rounded-2xl overflow-hidden">
            <div className="bg-[#14141c] px-4 py-2.5 border-b border-[#23232f] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-gray-300 font-bold">
                <Terminal className="w-3.5 h-3.5 text-fuchsia-400" />
                <span>Execution Log Window</span>
                <span className="text-[10px] text-gray-500 font-mono">({logs.length} events)</span>
              </div>

              <button
                onClick={handleCopyLogs}
                className="text-gray-400 hover:text-white text-[11px] flex items-center gap-1 py-1 px-2 rounded-lg bg-[#1e1e28] hover:bg-[#282836] transition-all cursor-pointer"
              >
                {copiedLogs ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedLogs ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            <div className="p-3 font-mono text-[11px] leading-relaxed max-h-36 overflow-y-auto custom-scrollbar space-y-1.5 select-text">
              {logs.map((log, index) => {
                const isErr = /error|fail|rejected/i.test(log);
                const isSuccess = /complete|ready|success|passed|locked/i.test(log);
                return (
                  <div 
                    key={index}
                    className={`flex items-start gap-2 py-0.5 ${
                      isErr 
                        ? 'text-rose-400 bg-rose-950/30 px-1.5 rounded' 
                        : isSuccess
                        ? 'text-emerald-300'
                        : 'text-gray-300'
                    }`}
                  >
                    <span className="text-gray-600 select-none shrink-0">{index + 1}.</span>
                    <span className="break-all">{log}</span>
                  </div>
                );
              })}
              <div ref={logsEndRef} />
            </div>
          </div>

        </div>

        {/* Modal Bottom Actions */}
        <div className="px-6 py-4 border-t border-[#22222a] bg-[#14141a] flex items-center justify-between gap-3">
          {hasFailed ? (
            <>
              <button
                onClick={onCancel}
                className="flex-1 bg-[#22222d] hover:bg-[#2c2c3a] text-gray-300 font-bold uppercase text-xs tracking-wider py-3 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 border border-[#333342] active:scale-95"
              >
                Choose Another Video
              </button>
              <button
                onClick={onRetry}
                className="flex-1 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white font-black uppercase text-xs tracking-wider py-3 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-fuchsia-600/20 active:scale-95"
              >
                <RefreshCw className="w-4 h-4 animate-spin" />
                Retry Processing
              </button>
            </>
          ) : (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-fuchsia-400" />
                <span>Synchronizing recognized words & timestamps...</span>
              </div>
              <button
                onClick={onCancel}
                className="bg-[#1e1e28] hover:bg-[#282836] text-gray-400 hover:text-white text-xs font-semibold py-2 px-3.5 rounded-lg border border-[#2e2e3e] transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
