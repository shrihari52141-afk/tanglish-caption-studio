import React, { useState, useRef, useCallback } from 'react'
import { MODELS, LANGUAGES } from '../lib/types'
import type { WordTiming } from '../lib/types'

interface Props {
  onReturnToStudio: () => void
}

const MIDDLE_TABS = ['System Prompt', 'Algorithm', 'Schema', '11 Keys', 'Logs', 'Raw Output'] as const
const QUICK_ACTIONS = ['Fix word #2', 'Add 150ms delay', 'Enforce 30% hotwords', 'Optimize for Tanglish']

export default function TestBench({ onReturnToStudio }: Props) {
  const [videoUrl, setVideoUrl] = useState('')
  const [words, setWords] = useState<WordTiming[]>([])
  const [selectedWord, setSelectedWord] = useState<string | null>(null)
  const [middleTab, setMiddleTab] = useState<string>('System Prompt')
  const [systemPrompt, setSystemPrompt] = useState('You are an elite multilingual speech-to-text engine...')
  const [algoCode, setAlgoCode] = useState('// JS timing normalization code\npause_after_ms = next.start_ms - current.end_ms')
  const [schema, setSchema] = useState('{\n  "language": "auto",\n  "words": []\n}')
  const [keys, setKeys] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const [rawOutput, setRawOutput] = useState('')
  const [model, setModel] = useState('gemini-3.5-flash')
  const [language, setLanguage] = useState('Auto Detect')
  const [chatMessages, setChatMessages] = useState<{ role: string; text: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [running, setRunning] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => { setVideoUrl(URL.createObjectURL(f)) }

  const runTest = async () => {
    if (!videoUrl) return
    setRunning(true)
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Starting test transcription with ${model}...`])
    try {
      const blob = await fetch(videoUrl).then(r => r.blob())
      const fd = new FormData()
      fd.append('media', blob, 'test.mp4')
      fd.append('sourceLanguage', language)
      fd.append('scriptMode', 'TRANSLITERATION_ROMAN')
      fd.append('useEmojis', 'true')
      fd.append('emojiStyle', 'Vibes')
      fd.append('model', model)
      const res = await fetch('/api/test-bench/transcribe', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.words) {
        setWords(data.words)
        setRawOutput(JSON.stringify(data, null, 2))
        setLogs(prev => [...prev, `Done! ${data.words.length} words aligned.`])
      } else {
        setLogs(prev => [...prev, `Error: ${data.error || 'Unknown'}`])
      }
    } catch (err: any) {
      setLogs(prev => [...prev, `Fetch error: ${err.message}`])
    }
    setRunning(false)
  }

  const syncStart = () => {
    if (!selectedWord || !videoRef.current) return
    setWords(prev => prev.map(w => w.id === selectedWord ? { ...w, start_time: videoRef.current!.currentTime, start_ms: Math.round(videoRef.current!.currentTime * 1000) } : w))
  }

  const syncEnd = () => {
    if (!selectedWord || !videoRef.current) return
    setWords(prev => prev.map(w => w.id === selectedWord ? { ...w, end_time: videoRef.current!.currentTime, end_ms: Math.round(videoRef.current!.currentTime * 1000) } : w))
  }

  const shiftAll = (ms: number) => {
    setWords(prev => prev.map(w => ({
      ...w,
      start_time: Math.max(0.05, w.start_time + ms / 1000),
      end_time: w.end_time + ms / 1000,
      start_ms: Math.max(50, w.start_ms + ms),
      end_ms: w.end_ms + ms
    })))
  }

  const sendChat = async () => {
    if (!chatInput.trim()) return
    const msg = chatInput.trim()
    setChatMessages(prev => [...prev, { role: 'user', text: msg }])
    setChatInput('')
    try {
      const res = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, words, model })
      })
      const data = await res.json()
      setChatMessages(prev => [...prev, { role: 'ai', text: data.reply || 'No response' }])
    } catch {
      setChatMessages(prev => [...prev, { role: 'ai', text: 'Copilot unavailable. Check server.' }])
    }
  }

  const exportSettings = () => {
    const content = `=== TANGLISH CAPTION STUDIO TEST BENCH EXPORT ===\n\n--- SYSTEM PROMPT ---\n${systemPrompt}\n\n--- ALGORITHM CODE ---\n${algoCode}\n\n--- RESPONSE SCHEMA ---\n${schema}\n\n--- API KEYS ---\n${keys}\n\n--- WORD TIMESTAMPS ---\n${JSON.stringify(words, null, 2)}`
    const blob = new Blob([content], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `testbench_export_${Date.now()}.txt`
    a.click()
  }

  return (
    <div className="h-[calc(100vh-48px)] flex bg-[#070709] text-white">
      <div className="w-1/4 border-r border-white/10 flex flex-col overflow-y-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-widest text-[#94A3B8]">Media & Sync</h2>
          <button onClick={() => fileRef.current?.click()} className="text-xs px-2 py-1 bg-[#222] rounded hover:bg-[#333] transition-colors">Upload</button>
          <input ref={fileRef} type="file" accept=".mp4,.mov,.wav,.mp3" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>
        {videoUrl && (
          <video ref={videoRef} src={videoUrl} controls className="w-full rounded-lg bg-black" />
        )}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-[#666] uppercase">Word Sync Adjuster</p>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {words.map((w, i) => (
              <button key={w.id} onClick={() => setSelectedWord(w.id)}
                className={`w-full text-left px-2 py-1 rounded text-[11px] font-mono transition-colors ${selectedWord === w.id ? 'bg-fuchsia-600/30 text-fuchsia-300' : 'text-[#888] hover:bg-[#1a1a22]'}`}>
                {i + 1}. {w.text} <span className="text-[#555]">({w.start_time.toFixed(2)}s)</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button onClick={syncStart} className="px-2 py-1.5 bg-[#222] rounded text-[10px] font-bold hover:bg-[#333] transition-colors">⏱ Sync Start</button>
            <button onClick={syncEnd} className="px-2 py-1.5 bg-[#222] rounded text-[10px] font-bold hover:bg-[#333] transition-colors">⏱ Sync End</button>
            <button onClick={() => shiftAll(-100)} className="px-2 py-1.5 bg-[#222] rounded text-[10px] font-bold hover:bg-[#333] transition-colors">-100ms All</button>
            <button onClick={() => shiftAll(100)} className="px-2 py-1.5 bg-[#222] rounded text-[10px] font-bold hover:bg-[#333] transition-colors">+100ms All</button>
          </div>
        </div>
      </div>

      <div className="w-2/4 border-r border-white/10 flex flex-col">
        <div className="p-4 border-b border-white/10 space-y-3">
          <div className="flex items-center gap-3">
            <button onClick={runTest} disabled={running}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white text-xs font-black hover:opacity-90 disabled:opacity-40 transition-opacity">
              {running ? '⏳ Running...' : '⚡ Run Test Transcription'}
            </button>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="bg-[#1a1a22] border border-[#2c2c2c] rounded-lg px-2 py-1.5 text-xs text-white">
              {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="bg-[#1a1a22] border border-[#2c2c2c] rounded-lg px-2 py-1.5 text-xs text-white">
              {LANGUAGES.slice(0, 7).map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <button onClick={exportSettings} className="ml-auto px-3 py-1.5 bg-[#222] rounded-lg text-[10px] font-bold text-[#94A3B8] hover:text-white transition-colors">📥 Export .txt</button>
          </div>
        </div>
        <div className="flex border-b border-white/10">
          {MIDDLE_TABS.map(t => (
            <button key={t} onClick={() => setMiddleTab(t)}
              className={`px-3 py-2 text-[10px] font-bold transition-colors ${middleTab === t ? 'text-fuchsia-400 border-b-2 border-fuchsia-500' : 'text-[#555] hover:text-[#888]'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1 p-4 overflow-y-auto">
          {middleTab === 'System Prompt' && <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="w-full h-full bg-[#0d0d12] border border-[#2c2c2c] rounded-lg p-3 text-xs font-mono text-[#94A3B8] resize-none outline-none focus:border-fuchsia-500/50" />}
          {middleTab === 'Algorithm' && <textarea value={algoCode} onChange={(e) => setAlgoCode(e.target.value)} className="w-full h-full bg-[#0d0d12] border border-[#2c2c2c] rounded-lg p-3 text-xs font-mono text-green-400/80 resize-none outline-none focus:border-fuchsia-500/50" />}
          {middleTab === 'Schema' && <textarea value={schema} onChange={(e) => setSchema(e.target.value)} className="w-full h-full bg-[#0d0d12] border border-[#2c2c2c] rounded-lg p-3 text-xs font-mono text-yellow-400/80 resize-none outline-none focus:border-fuchsia-500/50" />}
          {middleTab === '11 Keys' && <textarea value={keys} onChange={(e) => setKeys(e.target.value)} placeholder="Paste 11 API keys, one per line..." className="w-full h-full bg-[#0d0d12] border border-[#2c2c2c] rounded-lg p-3 text-xs font-mono text-[#94A3B8] resize-none outline-none focus:border-fuchsia-500/50" />}
          {middleTab === 'Logs' && (
            <div className="h-full bg-[#0d0d12] border border-[#2c2c2c] rounded-lg p-3 overflow-y-auto font-mono text-[11px] space-y-0.5">
              {logs.map((l, i) => <div key={i} className="text-[#94A3B8]"><span className="text-fuchsia-500 mr-1">›</span>{l}</div>)}
              {logs.length === 0 && <div className="text-[#444]">No logs yet. Run a test transcription.</div>}
            </div>
          )}
          {middleTab === 'Raw Output' && (
            <pre className="h-full bg-[#0d0d12] border border-[#2c2c2c] rounded-lg p-3 overflow-auto text-[11px] font-mono text-emerald-400/80">{rawOutput || 'No output yet.'}</pre>
          )}
        </div>
      </div>

      <div className="w-1/4 flex flex-col">
        <div className="p-4 border-b border-white/10">
          <h2 className="text-xs font-black uppercase tracking-widest text-[#94A3B8]">🤖 AI Copilot</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {chatMessages.map((m, i) => (
            <div key={i} className={`text-xs rounded-lg p-3 ${m.role === 'user' ? 'bg-fuchsia-600/20 text-fuchsia-200 ml-6' : 'bg-[#1a1a22] text-[#94A3B8] mr-6'}`}>
              {m.text}
            </div>
          ))}
          {chatMessages.length === 0 && <p className="text-xs text-[#444] text-center mt-8">Ask the AI Copilot to fix timing, adjust prompts, or optimize captions.</p>}
        </div>
        <div className="p-4 border-t border-white/10 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.map(a => (
              <button key={a} onClick={() => { setChatInput(a) }}
                className="px-2 py-1 bg-[#1a1a22] border border-[#2c2c2c] rounded-full text-[9px] text-[#94A3B8] hover:border-fuchsia-500/40 hover:text-fuchsia-300 transition-colors">
                {a}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendChat() }}
              placeholder="Ask AI Copilot..."
              className="flex-1 bg-[#1a1a22] border border-[#2c2c2c] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-fuchsia-500" />
            <button onClick={sendChat} className="px-3 py-2 bg-fuchsia-600 rounded-lg text-white text-xs font-bold hover:bg-fuchsia-500 transition-colors">Send</button>
          </div>
        </div>
      </div>
    </div>
  )
}