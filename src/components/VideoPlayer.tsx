import React, { useRef, useEffect, useState } from 'react';
import { CaptionWord, SubtitleStyleSettings } from '../types';
import { Move, ZoomIn, ZoomOut, RotateCw, Edit3, Check, X, ShieldAlert, Play, Pause, RotateCcw } from 'lucide-react';
import { applyCaptionFormatting, stripASSTags, generateCaptionFrames } from '../utils/captionFormatter';

interface VideoPlayerProps {
  videoUrl: string | null;
  words: CaptionWord[];
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  styleSettings: SubtitleStyleSettings;
  onUpdateStyleSettings: (settings: Partial<SubtitleStyleSettings>) => void;
  onUpdateWordText: (id: string, text: string) => void;
  seekTime: number | null;
  onSeekComplete: () => void;
  onCaptionClick?: () => void;
  onDisplaySizeChange?: (size: { width: number; height: number }) => void;
}

export default function VideoPlayer({ 
  videoUrl, 
  words, 
  currentTime,
  onTimeUpdate, 
  styleSettings,
  onUpdateStyleSettings,
  onUpdateWordText,
  seekTime,
  onSeekComplete,
  onCaptionClick,
  onDisplaySizeChange
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const captionOverlayRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialOffset, setInitialOffset] = useState({ x: 0, y: 0 });
  const [isSelected, setIsSelected] = useState(false);
  const [videoRatio, setVideoRatio] = useState<number>(9 / 16);
  
  const [editingWord, setEditingWord] = useState<CaptionWord | null>(null);
  const [editTextValue, setEditTextValue] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number>(340);
  const [localTime, setLocalTime] = useState(currentTime);
  const [highlightedWordId, setHighlightedWordId] = useState<string | null>(null);

  // requestAnimationFrame loop for word-level millisecond sync.
  // Throttled to ~30fps (every 2 frames) to avoid overwhelming low-end phones.
  // The parent's timeupdate fires at ~4fps which is too slow for word-level sync.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let rafId: number;
    let frameCount = 0;
    const tick = () => {
      frameCount++;
      // Update every 2nd frame (~30fps) — smooth enough for word-level sync,
      // light enough for low-end devices.
      if (frameCount % 2 === 0) {
        const t = video.currentTime;
        setLocalTime(t);
        let found: string | null = null;
        for (let i = 0; i < words.length; i++) {
          const w = words[i];
          if (t >= w.start_time && t <= w.end_time) {
            found = w.id;
            break;
          }
        }
        setHighlightedWordId(found);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [videoUrl, words]);

  // Phase 4: Fallback interval for low-end phones where RAF may drop frames.
  // This safety net fires at 10Hz to ensure localTime never gets stuck.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const fallback = setInterval(() => {
      if (!video.paused) {
        setLocalTime(video.currentTime);
      }
    }, 100);
    return () => clearInterval(fallback);
  }, [videoUrl]);

  const scaleFactor = containerWidth / 340;
  // Purely proportional so the export renderer can reproduce it EXACTLY at any
  // resolution (no clamp — a clamp would break editor/export parity).
  const bottomOffset = 96 * scaleFactor;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width) {
          setContainerWidth(entry.contentRect.width);
          onDisplaySizeChange?.({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });

    observer.observe(container);
    return () => {
      observer.unobserve(container);
    };
  }, [onDisplaySizeChange]);

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [videoUrl]);

  useEffect(() => {
    if (seekTime !== null && videoRef.current) {
      videoRef.current.currentTime = seekTime;
      onSeekComplete();
    }
  }, [seekTime, onSeekComplete]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      onTimeUpdate(video.currentTime);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [onTimeUpdate]);

  // Never show native/soft subtitle tracks from the media file (can look like ASS junk on screen)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const hideTracks = () => {
      try {
        for (let i = 0; i < video.textTracks.length; i++) {
          video.textTracks[i].mode = 'disabled';
        }
      } catch {
        /* ignore */
      }
    };

    hideTracks();
    video.addEventListener('loadedmetadata', hideTracks);
    if (video.textTracks) {
      video.textTracks.addEventListener?.('addtrack', hideTracks as any);
    }
    return () => {
      video.removeEventListener('loadedmetadata', hideTracks);
      if (video.textTracks) {
        video.textTracks.removeEventListener?.('addtrack', hideTracks as any);
      }
    };
  }, [videoUrl]);

  // Handle Dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (editingWord) return; // Disable drag during inline edit
    e.preventDefault();
    setIsDragging(true);
    setIsSelected(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitialOffset({ x: styleSettings.positionX * scaleFactor, y: styleSettings.positionY * scaleFactor });
    if (onCaptionClick) {
      onCaptionClick();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (editingWord) return;
    const touch = e.touches[0];
    setIsDragging(true);
    setIsSelected(true);
    setDragStart({ x: touch.clientX, y: touch.clientY });
    setInitialOffset({ x: styleSettings.positionX * scaleFactor, y: styleSettings.positionY * scaleFactor });
    if (onCaptionClick) {
      onCaptionClick();
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      
      const container = containerRef.current;
      const overlay = captionOverlayRef.current;
      if (container && overlay) {
        const containerRect = container.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();
        
        const targetX = initialOffset.x + dx;
        const targetY = initialOffset.y - dy;
        
        const halfRemainingWidth = Math.max(0, (containerRect.width - overlayRect.width) / 2);
        const clampedX = Math.max(-halfRemainingWidth, Math.min(halfRemainingWidth, targetX));
        
        const padding = 12;
        const minAvailableY = -bottomOffset + padding;
        const maxAvailableY = containerRect.height - overlayRect.height - bottomOffset - padding;
        const clampedY = Math.max(minAvailableY, Math.min(maxAvailableY, targetY));
        
        onUpdateStyleSettings({
          positionX: clampedX / scaleFactor,
          positionY: clampedY / scaleFactor,
        });
      } else {
        onUpdateStyleSettings({
          positionX: (initialOffset.x + dx) / scaleFactor,
          positionY: (initialOffset.y - dy) / scaleFactor,
        });
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      const touch = e.touches[0];
      const dx = touch.clientX - dragStart.x;
      const dy = touch.clientY - dragStart.y;
      
      const container = containerRef.current;
      const overlay = captionOverlayRef.current;
      if (container && overlay) {
        const containerRect = container.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();
        
        const targetX = initialOffset.x + dx;
        const targetY = initialOffset.y - dy;
        
        const halfRemainingWidth = Math.max(0, (containerRect.width - overlayRect.width) / 2);
        const clampedX = Math.max(-halfRemainingWidth, Math.min(halfRemainingWidth, targetX));
        
        const padding = 12;
        const minAvailableY = -bottomOffset + padding;
        const maxAvailableY = containerRect.height - overlayRect.height - bottomOffset - padding;
        const clampedY = Math.max(minAvailableY, Math.min(maxAvailableY, targetY));
        
        onUpdateStyleSettings({
          positionX: clampedX / scaleFactor,
          positionY: clampedY / scaleFactor,
        });
      } else {
        onUpdateStyleSettings({
          positionX: (initialOffset.x + dx) / scaleFactor,
          positionY: (initialOffset.y - dy) / scaleFactor,
        });
      }
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleEnd);
      // passive:false so preventDefault() can block page scroll while dragging.
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, dragStart, initialOffset, onUpdateStyleSettings, bottomOffset, scaleFactor]);

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (video.videoWidth && video.videoHeight) {
      setVideoRatio(video.videoWidth / video.videoHeight);
      // Force mobile browsers to decode and render first frame (prevents black screen)
      if (video.currentTime === 0 && !isNaN(video.duration) && video.duration > 0) {
        try {
          video.currentTime = 0.01;
        } catch {
          /* ignore */
        }
      }
    } else {
      setVideoRatio(1.0);
    }
  };

  // Click outside to deselect
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        (!optionsRef.current || !optionsRef.current.contains(target))
      ) {
        setIsSelected(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Active word index from the RAF-driven highlightedWordId (word-level, not phrase-level).
  const activeWordIndex = (() => {
    if (words.length === 0 || !highlightedWordId) {
      // No highlight: find closest word for display purposes
      if (words.length === 0) return -1;
      let closestIdx = 0;
      let minDiff = Math.abs(localTime - words[0].start_time);
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const diff = Math.min(Math.abs(localTime - w.start_time), Math.abs(localTime - w.end_time));
        if (diff < minDiff) { minDiff = diff; closestIdx = i; }
      }
      return minDiff < 3.0 ? closestIdx : -1;
    }
    return words.findIndex((w) => w.id === highlightedWordId);
  })();

  // Construct displayWords based on styleSettings.maxWordsPerScreen in a stable chunked block
  const displayWords = (() => {
    if (words.length === 0 || activeWordIndex === -1) return [];
    const frames = generateCaptionFrames(words, styleSettings.maxWordsPerScreen);
    return frames.find(frame => frame.some(w => w.id === words[activeWordIndex].id)) || frames[0] || [];
  })();

  const formatWordText = (text: string) => {
    // Always strip ASS tags first so layout codes never paint as caption text
    let formatted = applyCaptionFormatting(
      stripASSTags(text),
      styleSettings.showEmojis !== false,
      styleSettings.showPunctuation !== false,
      styleSettings.emojiStyle || 'vibes'
    );
    if (styleSettings.capitalization === 'all') return formatted.toUpperCase();
    if (styleSettings.capitalization === 'lower') return formatted.toLowerCase();
    if (styleSettings.capitalization === 'sentence') {
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }
    return formatted;
  };

  const handleEditClick = (word: CaptionWord, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setEditingWord(word);
    setEditTextValue(stripASSTags(word.word));
  };

  const handleSaveEdit = () => {
    if (editingWord) {
      onUpdateWordText(editingWord.id, stripASSTags(editTextValue));
      setEditingWord(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingWord(null);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-full px-2 gap-4">
      <div 
        ref={containerRef}
        style={(() => {
          // When the caption is selected the resize/rotate toolbar appears below,
          // so shrink the video a bit (but not too much) to keep everything on
          // screen. Size by the LIMITING dimension so the container ALWAYS matches
          // the real video aspect ratio (no letterbox top/bottom or sides) for
          // both landscape and portrait clips.
          const isShrunk = !!(isSelected && videoUrl && displayWords.length > 0 && !editingWord);
          const vOffset = isShrunk ? 320 : 150;
          const widthCap = videoRatio > 1.0
            ? 'calc(100vw - 24px)'
            : 'min(520px, calc(100vw - 24px))';
          return {
            aspectRatio: videoRatio,
            width: `min(${widthCap}, calc((100vh - ${vOffset}px) * ${videoRatio}))`,
            height: 'auto',
          } as React.CSSProperties;
        })()}
        className="relative mx-auto bg-gradient-to-b from-[#1a1a1a] to-black rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] flex items-center justify-center border-4 border-[#333] select-none transition-all duration-300"
      >
        {videoUrl ? (
          <>
          <video
            ref={videoRef}
            src={videoUrl}
            onLoadedMetadata={handleLoadedMetadata}
            className="w-full h-full object-contain cursor-pointer"
            playsInline
            preload="auto"
            onClick={() => {
              if (videoRef.current) {
                if (isPlaying) {
                  videoRef.current.pause();
                } else {
                  videoRef.current.play();
                }
              }
            }}
          />
          {/* Floating play/pause + speed control — always visible on top of video */}
          <div className="absolute top-2 right-2 flex items-center gap-2 z-40">
            <select
              onChange={(e) => {
                if (videoRef.current) videoRef.current.playbackRate = parseFloat(e.target.value);
              }}
              defaultValue="1"
              className="bg-black/60 text-white text-[13px] font-bold px-2.5 py-1.5 rounded-lg border border-white/20 backdrop-blur-sm cursor-pointer"
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
            <button
              onClick={() => {
                if (videoRef.current) {
                  isPlaying ? videoRef.current.pause() : videoRef.current.play();
                }
              }}
              className="bg-black/60 backdrop-blur-sm text-white p-2.5 rounded-lg border border-white/20 hover:bg-black/80 transition-colors cursor-pointer"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
            </button>
          </div>
          </>
        ) : (
          <div className="text-[#888888] flex flex-col items-center">
            <span className="text-sm font-bold uppercase tracking-wide">Upload a video to preview</span>
          </div>
        )}

        {/* Caption Overlay Container */}
        {videoUrl && displayWords.length > 0 && (
          <div 
            ref={captionOverlayRef}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            style={{
              transform: `translate(${styleSettings.positionX * scaleFactor}px, ${-styleSettings.positionY * scaleFactor}px) rotate(${styleSettings.rotation}deg)`,
              fontSize: `${Math.max(10, 32 * styleSettings.fontSize * scaleFactor)}px`,
              bottom: `${bottomOffset}px`,
              gap: `${8 * scaleFactor}px`,
              padding: `${Math.max(4, 8 * scaleFactor)}px ${Math.max(8, 16 * scaleFactor)}px`,
              touchAction: 'none',
            }}
            className={`absolute inset-x-0 mx-auto w-max max-w-[90%] flex flex-wrap justify-center items-center cursor-grab active:cursor-grabbing rounded-xl z-50 pointer-events-auto ${
              isDragging ? '' : 'transition-transform duration-100'
            } ${
              isSelected ? 'ring-2 ring-fuchsia-500 bg-black/40 ring-dashed' : 'hover:bg-black/10'
            }`}
          >
            {displayWords.map((w) => {
              // Word-level highlight: active only when video time is within this
              // word's exact start_time..end_time window. Freezes during silence.
              const isActive = highlightedWordId === w.id;
              
              // Apply customized styling based on settings
              let itemStyle: React.CSSProperties = {
                fontFamily: styleSettings.fontFamily === 'Impact' ? 'Impact, sans-serif' :
                            styleSettings.fontFamily === 'Courier' ? '"Courier New", Courier, monospace' :
                            styleSettings.fontFamily === 'Fredoka' ? '"Fredoka", "Inter", sans-serif' :
                            styleSettings.fontFamily === 'Space Grotesk' ? '"Space Grotesk", sans-serif' :
                            styleSettings.fontFamily === 'Playfair Display' ? '"Playfair Display", Georgia, serif' :
                            styleSettings.fontFamily === 'Pacifico' ? '"Pacifico", cursive' :
                            styleSettings.fontFamily === 'Black Han Sans' ? '"Black Han Sans", sans-serif' :
                            '"Helvetica Neue", Arial, sans-serif'
              };

              let itemClassName = "text-center transition-all ";

              if (styleSettings.fontFamily === 'Impact') {
                itemClassName += "font-black italic uppercase tracking-tight ";
              } else if (styleSettings.fontFamily === 'Courier') {
                itemClassName += "font-mono font-bold tracking-widest ";
              } else if (styleSettings.fontFamily === 'Fredoka') {
                itemClassName += "font-sans font-black tracking-wide rounded ";
              } else if (styleSettings.fontFamily === 'Playfair Display') {
                itemClassName += "font-serif font-black italic tracking-normal ";
              } else if (styleSettings.fontFamily === 'Pacifico') {
                itemClassName += "font-normal tracking-wide leading-relaxed ";
              } else if (styleSettings.fontFamily === 'Black Han Sans') {
                itemClassName += "font-sans font-black tracking-tight uppercase ";
              } else {
                itemClassName += "font-sans font-bold ";
              }

              if (isActive) {
                itemStyle.color = styleSettings.highlightColor;
                if (styleSettings.showBackground) {
                  itemStyle.backgroundColor = '#000000';
                  itemStyle.border = `2px solid ${styleSettings.highlightColor}`;
                  itemClassName += " px-3 py-1.5 rounded-lg shadow-xl ";
                }
                if (styleSettings.showBacklight) {
                  itemStyle.textShadow = `0 0 12px ${styleSettings.highlightColor}, 0 0 24px ${styleSettings.highlightColor}`;
                } else if (styleSettings.showShadow) {
                  itemStyle.textShadow = '4px 4px 0px #000';
                  itemClassName += " -webkit-text-stroke-2 ";
                } else {
                  itemStyle.textShadow = 'none';
                }
                if (styleSettings.preset === 'glitch') {
                  itemClassName += " style-glitch ";
                } else if (styleSettings.preset === 'pop') {
                  itemClassName += " style-pop ";
                } else if (styleSettings.preset === 'beast') {
                  itemClassName += " style-beast ";
                } else if (styleSettings.preset === 'bounce') {
                  itemClassName += " style-bounce ";
                } else if (styleSettings.preset === 'neon_glow' || styleSettings.preset === 'neon') {
                  itemClassName += " style-neon ";
                }
              } else {
                itemStyle.color = styleSettings.textColor;
                if (styleSettings.showShadow) {
                  itemStyle.textShadow = '4px 4px 0px #000';
                } else {
                  itemStyle.textShadow = 'none';
                }
                if (styleSettings.showSpotlight) {
                  itemStyle.opacity = 0.35;
                }
              }

              return (
                <div 
                  key={w.id} 
                  className="relative group"
                >
                  <span style={itemStyle} className={itemClassName}>
                    {formatWordText(w.word)}
                  </span>
                </div>
              );
            })}
          </div>
        )}



        {/* Edit Overlay Input Box */}
        {editingWord && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center p-4 z-40">
            <div className="bg-[#161616] border border-[#333] rounded-xl p-4 w-full max-w-[280px] flex flex-col gap-3 shadow-2xl">
              <div className="text-[12px] font-black uppercase text-fuchsia-500 tracking-wide flex items-center gap-1">
                <Edit3 className="w-3.5 h-3.5" /> Edit Subtitle Text
              </div>
              <input 
                type="text" 
                value={editTextValue}
                onChange={(e) => setEditTextValue(e.target.value)}
                className="bg-[#0A0A0A] border border-[#333] rounded px-3 py-2 text-white font-extrabold text-[16px] focus:outline-none focus:border-fuchsia-600"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit();
                  if (e.key === 'Escape') handleCancelEdit();
                }}
              />
              <div className="flex gap-2 justify-end">
                <button 
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 rounded bg-[#333] hover:bg-[#444] text-[12px] font-bold text-[#aaa] uppercase"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveEdit}
                  className="px-3 py-1.5 rounded bg-fuchsia-600 hover:bg-fuchsia-700 text-[12px] font-black text-white uppercase flex items-center gap-1"
                >
                  <Check className="w-3 h-3" /> Save
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Subtitle Positioning Toolbar */}
      {isSelected && videoUrl && displayWords.length > 0 && !editingWord && (
        <div 
          ref={optionsRef}
          className="w-full max-w-[min(520px,calc(100vw-24px))] md:max-w-[520px] bg-[#161616] border border-[#333] rounded-2xl p-3 flex flex-col gap-2.5 shadow-2xl z-30 transition-all duration-300 mt-3.5"
        >
          <div className="flex items-center justify-between border-b border-[#222] pb-1.5">
            <div className="text-[11px] font-extrabold text-white uppercase tracking-wide flex items-center gap-1.5">
              <Move className="w-4 h-4 text-fuchsia-500 animate-pulse" /> Caption Layout Studio
            </div>
            <button 
              onClick={() => {
                onUpdateStyleSettings({ positionX: 0, positionY: 0, rotation: 0, fontSize: 1.0 });
              }}
              className="text-[10px] font-black text-fuchsia-500 hover:text-fuchsia-400 hover:underline uppercase transition-colors"
            >
              Reset Position
            </button>
          </div>
          
          <div className="flex flex-col gap-2.5 text-xs font-semibold text-white">
            {/* Resize Control Section */}
            <div className="flex flex-col gap-1 bg-[#0c0c0c] p-2 rounded-xl border border-[#222]">
              <div className="flex justify-between items-center text-[#888] text-[9px] uppercase tracking-wider mb-0.5">
                <span>Resize</span>
                <span className="font-mono text-fuchsia-500 font-extrabold">{styleSettings.fontSize.toFixed(1)}x</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateStyleSettings({ fontSize: parseFloat(Math.max(0.1, styleSettings.fontSize - 0.1).toFixed(1)) })}
                  className="p-1 bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] rounded text-white hover:text-fuchsia-400 cursor-pointer active:scale-95 transition-all"
                  title="Decrease Size"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <input 
                  type="range" 
                  min="0.1" 
                  max="2.5" 
                  step="0.1" 
                  value={styleSettings.fontSize}
                  onChange={(e) => onUpdateStyleSettings({ fontSize: parseFloat(e.target.value) })}
                  className="flex-1 h-1 bg-[#252525] rounded appearance-none cursor-pointer accent-fuchsia-600"
                />
                <button
                  type="button"
                  onClick={() => onUpdateStyleSettings({ fontSize: parseFloat(Math.min(2.5, styleSettings.fontSize + 0.1).toFixed(1)) })}
                  className="p-1 bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] rounded text-white hover:text-fuchsia-400 cursor-pointer active:scale-95 transition-all"
                  title="Increase Size"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Rotate Control Section */}
            <div className="flex flex-col gap-1 bg-[#0c0c0c] p-2 rounded-xl border border-[#222]">
              <div className="flex justify-between items-center text-[#888] text-[9px] uppercase tracking-wider mb-0.5">
                <span>Rotate</span>
                <span className="font-mono text-fuchsia-500 font-extrabold">{styleSettings.rotation}°</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateStyleSettings({ rotation: Math.max(-45, styleSettings.rotation - 5) })}
                  className="p-1 bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] rounded text-white hover:text-fuchsia-400 cursor-pointer active:scale-95 transition-all"
                  title="Rotate Counter-Clockwise"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <input 
                  type="range" 
                  min="-45" 
                  max="45" 
                  step="1" 
                  value={styleSettings.rotation}
                  onChange={(e) => onUpdateStyleSettings({ rotation: parseInt(e.target.value) })}
                  className="flex-1 h-1 bg-[#252525] rounded appearance-none cursor-pointer accent-fuchsia-600"
                />
                <button
                  type="button"
                  onClick={() => onUpdateStyleSettings({ rotation: Math.min(45, styleSettings.rotation + 5) })}
                  className="p-1 bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] rounded text-white hover:text-fuchsia-400 cursor-pointer active:scale-95 transition-all"
                  title="Rotate Clockwise"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Color Palette Section */}
            <div className="flex flex-col gap-2 bg-[#0c0c0c] p-2 rounded-xl border border-[#222]">
              <div className="text-[#888] text-[9px] uppercase tracking-wider mb-0.5">Colors</div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-[#aaa] font-bold w-16 shrink-0">Highlight</label>
                <div className="flex gap-1 flex-wrap">
                  {['#C600DC','#FF3B30','#FF9500','#FFCC00','#34C759','#007AFF','#5856D6','#FF2D92','#A2845E','#FFFFFF'].map(c => (
                    <button key={c} onClick={() => onUpdateStyleSettings({ highlightColor: c })}
                      className={`w-5 h-5 rounded-full border-2 cursor-pointer transition-transform hover:scale-110 ${styleSettings.highlightColor === c ? 'border-white scale-110' : 'border-[#333]'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                  <input type="color" value={styleSettings.highlightColor}
                    onChange={(e) => onUpdateStyleSettings({ highlightColor: e.target.value })}
                    className="w-5 h-5 rounded cursor-pointer bg-transparent border-none p-0" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-[#aaa] font-bold w-16 shrink-0">Text</label>
                <div className="flex gap-1 flex-wrap">
                  {['#FFFFFF','#000000','#FF3B30','#FF9500','#FFCC00','#34C759','#007AFF','#5856D6','#C600DC','#A2845E'].map(c => (
                    <button key={c} onClick={() => onUpdateStyleSettings({ textColor: c })}
                      className={`w-5 h-5 rounded-full border-2 cursor-pointer transition-transform hover:scale-110 ${styleSettings.textColor === c ? 'border-white scale-110' : 'border-[#333]'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                  <input type="color" value={styleSettings.textColor}
                    onChange={(e) => onUpdateStyleSettings({ textColor: e.target.value })}
                    className="w-5 h-5 rounded cursor-pointer bg-transparent border-none p-0" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Caption Button at the bottom of the video container (outside) */}
      {videoUrl && words.length > 0 && activeWordIndex !== -1 && !editingWord && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const activeWord = words[activeWordIndex];
            setEditingWord(activeWord);
            setEditTextValue(stripASSTags(activeWord.word));
          }}
          className="w-full max-w-[min(520px,calc(100vw-24px))] md:max-w-[520px] bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-5 py-2.5 rounded-xl shadow-[0_4px_20px_rgba(219,39,119,0.4)] flex items-center justify-center gap-2 border border-fuchsia-400/30 active:scale-95 transition-transform font-bold text-xs uppercase cursor-pointer mt-3.5"
          style={{ minHeight: '44px' }}
        >
          <Edit3 className="w-5 h-5" />
          <span>Edit Caption</span>
        </button>
      )}

      {/* Play/Pause controls below container */}
      {videoUrl && (
        <div className="w-full max-w-[min(520px,calc(100vw-24px))] md:max-w-[520px] bg-[#161616] border border-[#333] rounded-xl p-3.5 flex flex-col gap-3 shadow-xl shrink-0 mt-3.5">
          
          {/* Custom Interactive Seek Bar */}
          <div className="w-full flex items-center gap-2.5">
            <span className="text-[10px] font-mono font-bold text-fuchsia-500 select-none">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min="0"
              max={videoRef.current && !isNaN(videoRef.current.duration) ? videoRef.current.duration : 100}
              step="0.05"
              value={currentTime}
              onChange={(e) => {
                const newTime = parseFloat(e.target.value);
                if (videoRef.current) {
                  videoRef.current.currentTime = newTime;
                  onTimeUpdate(newTime);
                }
              }}
              className="flex-1 h-1.5 bg-[#252525] rounded-lg appearance-none cursor-pointer accent-fuchsia-600 outline-none hover:bg-[#333] transition-colors"
            />
            <span className="text-[10px] font-mono font-bold text-[#888] select-none">
              {formatTime(videoRef.current?.duration || 0)}
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-[#252525] pt-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.play();
                  }
                }}
                className={`py-2 px-3.5 rounded-lg font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                  isPlaying 
                    ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/30' 
                    : 'bg-[#222] hover:bg-[#333] text-gray-300 border border-[#444]'
                }`}
              >
                <Play className="w-4 h-4 fill-current" /> Play
              </button>
              <button
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.pause();
                  }
                }}
                className={`py-2 px-3.5 rounded-lg font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                  !isPlaying 
                    ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/30' 
                    : 'bg-[#222] hover:bg-[#333] text-gray-300 border border-[#444]'
                }`}
              >
                <Pause className="w-4 h-4 fill-current animate-pulse" /> Pause
              </button>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = 0;
                    videoRef.current.play();
                  }
                }}
                className="py-1.5 px-2.5 rounded-lg bg-[#222] hover:bg-[#333] text-gray-400 hover:text-white border border-[#333] cursor-pointer transition-all active:scale-95 text-[10px] font-bold uppercase flex items-center gap-1"
                title="Restart Video"
              >
                <RotateCcw className="w-3 h-3" /> Replay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
