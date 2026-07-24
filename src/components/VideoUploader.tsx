import React, { useCallback, useRef, useState } from 'react'
import { LANGUAGES, TRANSLATION_MODES, EMOJI_STYLES, MODELS } from '../lib/types'

interface Props {
  onUpload: (opts: {
    file: File
    sourceLanguage: string
    translationMode: string
    useEmojis: boolean
    emojiStyle: string
    usePunctuation: boolean
    model: string
  }) => void
  disabled?: boolean
}

const ACCEPT = '.mp4,.mov,.avi,.mkv,.mp3,.wav,.m4a'

export default function VideoUploader({ onUpload, disabled }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [sourceLanguage, setSourceLanguage] = useState('Auto Detect')
  const [translationMode, setTranslationMode] = useState('Keep Original')
  const [useEmojis, setUseEmojis] = useState(true)
  const [emojiStyle, setEmojiStyle] = useState('Vibes')
  const [usePunctuation, setUsePunctuation] = useState(true)
  const [model, setModel] = useState('gemini-3.5-flash')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }, [])

  const handleStart = () => {
    if (!file) return
    onUpload({ file, sourceLanguage, translationMode, useEmojis, emojiStyle, usePunctuation, model })
  }

  const emojiIcons: Record<string, string> = { Vibes: '🔥', Minimal: '✨', Hype: '⚡', Sarcastic: '🙄' }

  return (
    <div className="max-w-2xl mx-auto animate-slide-up">
      <div className="bg-[#121218] border border-white/10 rounded-2xl p-8 space-y-6">

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !disabled && inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-300 select-none
            ${dragOver ? 'border-fuchsia-500 bg-fuchsia-500/10 scale-[1.01]' : 'border-[#2c2c2c] hover:border-fuchsia-500/40'}
            ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <input ref={inputRef} type="file" accept={ACCEPT} onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f) }} className="hidden" />
          <div className="text-5xl mb-4">{file ? '🎬' : '☁️'}</div>
          {file ? (
            <p className="text-white font-semibold">{file.name}</p>
          ) : (
            <>
              <p className="text-lg font-semibold text-white mb-1">Drag & drop video or audio file</p>
              <p className="text-sm text-[#94A3B8]">MP4, MOV, AVI, MKV, MP3, WAV, M4A</p>
              <span className="inline-block mt-4 px-4 py-2 bg-[#222] text-fuchsia-400 rounded-lg text-sm font-semibold hover:bg-[#333] transition-colors">Browse Files</span>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="text-xs text-[#94A3B8] block">
            Source Language
            <select value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value)}
              className="w-full mt-1.5 bg-[#1a1a22] border border-[#2c2c2c] text-white rounded-lg px-3 py-2.5 text-sm focus:border-fuchsia-500 outline-none">
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="text-xs text-[#94A3B8] block">
            Translation / Script Mode
            <select value={translationMode} onChange={(e) => setTranslationMode(e.target.value)}
              className="w-full mt-1.5 bg-[#1a1a22] border border-[#2c2c2c] text-white rounded-lg px-3 py-2.5 text-sm focus:border-fuchsia-500 outline-none">
              {TRANSLATION_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        </div>

        <label className="text-xs text-[#94A3B8] block">
          AI Model
          <select value={model} onChange={(e) => setModel(e.target.value)}
            className="w-full mt-1.5 bg-[#1a1a22] border border-[#2c2c2c] text-white rounded-lg px-3 py-2.5 text-sm focus:border-fuchsia-500 outline-none">
            {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        <div className="bg-[#1a1a22] border border-[#2c2c2c] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white font-medium">Enable Context Emojis</span>
            <button onClick={() => setUseEmojis(!useEmojis)}
              className={`w-11 h-6 rounded-full transition-colors duration-200 relative ${useEmojis ? 'bg-fuchsia-600' : 'bg-[#333]'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 ${useEmojis ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {useEmojis && (
            <div className="grid grid-cols-4 gap-2">
              {EMOJI_STYLES.map(s => (
                <button key={s} onClick={() => setEmojiStyle(s)}
                  className={`px-2 py-2 rounded-lg text-xs font-semibold transition-all duration-200
                    ${emojiStyle === s ? 'bg-fuchsia-600/30 text-fuchsia-300 border border-fuchsia-500/50' : 'bg-[#222] text-[#94A3B8] border border-transparent hover:bg-[#2a2a2a]'}`}>
                  {emojiIcons[s]} {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between bg-[#1a1a22] border border-[#2c2c2c] rounded-xl px-4 py-3">
          <span className="text-sm text-white font-medium">Use Punctuation & Capitalization</span>
          <button onClick={() => setUsePunctuation(!usePunctuation)}
            className={`w-11 h-6 rounded-full transition-colors duration-200 relative ${usePunctuation ? 'bg-fuchsia-600' : 'bg-[#333]'}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 ${usePunctuation ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <button onClick={handleStart} disabled={!file || disabled}
          className="w-full py-4 rounded-xl font-black text-white text-lg tracking-wide
            bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500
            disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-fuchsia-600/20">
          🚀 START AI TRANSCRIPTION
        </button>
      </div>
    </div>
  )
}