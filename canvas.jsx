import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, RefreshCw, Pin, Layers, X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, FileText, Image as ImageIcon, FileCode, Film, File } from 'lucide-react';

// ============================================================
// PROJECT CANVAS - v1
// Calm, minimalist infinite canvas for versioned project artefacts
// ============================================================

const PROJECT_KEY = 'canvas:default-project';
const STORAGE_LIMIT = 4 * 1024 * 1024; // 4MB safety margin under 5MB limit

// Parse filename: "prefix__name-v3.ext" → { prefix, name, version, ext }
function parseFilename(filename) {
  const dotIdx = filename.lastIndexOf('.');
  const ext = dotIdx >= 0 ? filename.slice(dotIdx + 1).toLowerCase() : '';
  const base = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;
  
  const versionMatch = base.match(/^(.+?)-v(\d+)$/);
  const nameWithoutVersion = versionMatch ? versionMatch[1] : base;
  const version = versionMatch ? parseInt(versionMatch[2], 10) : 1;
  
  const prefixMatch = nameWithoutVersion.match(/^([^_]+)__(.+)$/);
  const prefix = prefixMatch ? prefixMatch[1] : 'general';
  const name = prefixMatch ? prefixMatch[2] : nameWithoutVersion;
  
  return { prefix, name, version, ext, fullBase: nameWithoutVersion };
}

function fileTypeFromExt(ext) {
  if (['md', 'txt'].includes(ext)) return 'note';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
  if (['html', 'htm'].includes(ext)) return 'html';
  if (ext === 'pdf') return 'pdf';
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  return 'file';
}

function TypeIcon({ type, className }) {
  const props = { className, strokeWidth: 1.5, size: 14 };
  if (type === 'note') return <FileText {...props} />;
  if (type === 'image') return <ImageIcon {...props} />;
  if (type === 'html') return <FileCode {...props} />;
  if (type === 'pdf') return <FileText {...props} />;
  if (type === 'video') return <Film {...props} />;
  return <File {...props} />;
}

// ============================================================
// Storage helpers
// ============================================================
async function loadProject() {
  try {
    const result = await window.storage.get(PROJECT_KEY);
    return result ? JSON.parse(result.value) : null;
  } catch {
    return null;
  }
}

async function saveProject(state) {
  try {
    const serialised = JSON.stringify(state);
    if (serialised.length > STORAGE_LIMIT) {
      // Strip inline content from largest items if over limit
      const slim = { ...state, cards: state.cards.map(c => ({
        ...c,
        versions: c.versions.map(v => v.content && v.content.length > 100000 ? { ...v, content: null, contentStripped: true } : v)
      }))};
      await window.storage.set(PROJECT_KEY, JSON.stringify(slim));
      return { trimmed: true };
    }
    await window.storage.set(PROJECT_KEY, serialised);
    return { trimmed: false };
  } catch (e) {
    console.error('Save failed:', e);
    return { error: e };
  }
}

// ============================================================
// Read a file via FileSystem API
// ============================================================
async function readFileEntry(handle) {
  const file = await handle.getFile();
  const ext = handle.name.split('.').pop().toLowerCase();
  const type = fileTypeFromExt(ext);
  const isSmall = file.size <= STORAGE_LIMIT;
  
  let content = null;
  let dataUrl = null;
  
  if (isSmall) {
    if (type === 'note' || type === 'html') {
      content = await file.text();
    } else if (type === 'image' || type === 'pdf' || type === 'video') {
      // Store as data URL for inline use
      const buf = await file.arrayBuffer();
      const blob = new Blob([buf], { type: file.type || 'application/octet-stream' });
      dataUrl = await new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.readAsDataURL(blob);
      });
    }
  }
  
  return {
    filename: handle.name,
    size: file.size,
    lastModified: file.lastModified,
    content,
    dataUrl,
    inline: isSmall && (content !== null || dataUrl !== null),
  };
}

// ============================================================
// Detect mobile
// ============================================================
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

// ============================================================
// Main app
// ============================================================
export default function ProjectCanvas() {
  const isMobile = useIsMobile();
  const [state, setState] = useState({
    projectName: 'Untitled Project',
    cards: [],
    canvasView: { x: 0, y: 0, zoom: 1 },
  });
  const [loaded, setLoaded] = useState(false);
  const [activeCardId, setActiveCardId] = useState(null);
  const [openCardId, setOpenCardId] = useState(null);
  const [folderHandle, setFolderHandle] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmChanges, setConfirmChanges] = useState(null);
  const [versionStackOpen, setVersionStackOpen] = useState(null);

  // Load saved state
  useEffect(() => {
    loadProject().then(saved => {
      if (saved) setState(saved);
      setLoaded(true);
    });
  }, []);

  // Persist state
  useEffect(() => {
    if (loaded) saveProject(state);
  }, [state, loaded]);

  // Cmd-K to open search
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(s => !s);
      }
      if (e.key === 'Escape') {
        setShowSearch(false);
        setOpenCardId(null);
        setActiveCardId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ============================================================
  // Sync workflow
  // ============================================================
  const requestFolder = useCallback(async () => {
    if (!window.showDirectoryPicker) {
      setSyncStatus({ error: 'Folder access not supported in this browser. Use Chrome, Edge, or Arc.' });
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      setFolderHandle(handle);
      await scanFolder(handle);
    } catch (e) {
      if (e.name !== 'AbortError') setSyncStatus({ error: e.message });
    }
  }, [state]);

  const scanFolder = useCallback(async (handle) => {
    setSyncStatus({ scanning: true });
    const found = [];
    try {
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          const file = await readFileEntry(entry);
          found.push(file);
        }
      }
    } catch (e) {
      setSyncStatus({ error: e.message });
      return;
    }
    // Group by base (prefix__name) to build version stacks
    const grouped = {};
    found.forEach(f => {
      const parsed = parseFilename(f.filename);
      const key = parsed.fullBase;
      if (!grouped[key]) grouped[key] = { parsed, versions: [] };
      grouped[key].versions.push({ ...f, ...parsed });
    });
    Object.values(grouped).forEach(g => g.versions.sort((a, b) => b.version - a.version));
    
    // Build a diff against current state
    const changes = [];
    Object.entries(grouped).forEach(([key, group]) => {
      const existing = state.cards.find(c => c.key === key);
      if (!existing) {
        changes.push({ type: 'new', key, group });
      } else {
        const newVersions = group.versions.filter(v => !existing.versions.find(ev => ev.version === v.version));
        if (newVersions.length > 0) {
          changes.push({ type: 'updated', key, group, existing, newVersions });
        }
      }
    });
    
    if (changes.length === 0) {
      setSyncStatus({ noChanges: true });
      setTimeout(() => setSyncStatus(null), 2000);
    } else {
      setConfirmChanges(changes);
      setSyncStatus(null);
    }
  }, [state]);

  const applySyncChanges = useCallback(() => {
    setState(prev => {
      const cardsCopy = [...prev.cards];
      let yOffset = 0;
      confirmChanges.forEach(change => {
        if (change.type === 'new') {
          // Place new cards at a reasonable position
          cardsCopy.push({
            id: crypto.randomUUID(),
            key: change.key,
            prefix: change.group.parsed.prefix,
            name: change.group.parsed.name,
            type: fileTypeFromExt(change.group.parsed.ext),
            versions: change.group.versions,
            pinnedVersion: change.group.versions[0].version,
            x: 100 + (cardsCopy.length % 4) * 320,
            y: 100 + Math.floor(cardsCopy.length / 4) * 240 + yOffset,
          });
        } else {
          const idx = cardsCopy.findIndex(c => c.key === change.key);
          if (idx >= 0) {
            const merged = [...change.newVersions, ...cardsCopy[idx].versions]
              .sort((a, b) => b.version - a.version);
            cardsCopy[idx] = { ...cardsCopy[idx], versions: merged };
            // Keep existing pinned version (don't auto-promote new versions)
          }
        }
      });
      return { ...prev, cards: cardsCopy };
    });
    setConfirmChanges(null);
  }, [confirmChanges]);

  // ============================================================
  // Card actions
  // ============================================================
  const updateCard = useCallback((id, updates) => {
    setState(prev => ({
      ...prev,
      cards: prev.cards.map(c => c.id === id ? { ...c, ...updates } : c),
    }));
  }, []);

  const pinVersion = useCallback((cardId, version) => {
    updateCard(cardId, { pinnedVersion: version });
  }, [updateCard]);

  // Filtered cards for search
  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return state.cards;
    const q = searchQuery.toLowerCase();
    return state.cards.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.prefix.toLowerCase().includes(q)
    );
  }, [state.cards, searchQuery]);

  if (!loaded) {
    return <div className="h-screen w-screen flex items-center justify-center bg-stone-50 text-stone-400 font-serif italic">Loading canvas…</div>;
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-stone-50 text-stone-800" style={{ fontFamily: 'ui-sans-serif, system-ui' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500&display=swap');
        .serif { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; }
        .sans { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
        .canvas-bg {
          background-image: radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px);
          background-size: 28px 28px;
        }
        .card-shadow { box-shadow: 0 1px 0 rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.06); }
        .card-shadow-active { box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(180,83,9,0.4); }
        .pin-dot { background: #b45309; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
      `}</style>
      
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-30 px-6 py-4 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto">
          <input
            value={state.projectName}
            onChange={e => setState(prev => ({ ...prev, projectName: e.target.value }))}
            className="sans bg-transparent text-xs uppercase tracking-[0.18em] text-stone-500 focus:text-stone-800 focus:outline-none w-64"
          />
        </div>
        <div className="pointer-events-auto flex items-center gap-3">
          <button onClick={() => setShowSearch(true)} className="sans text-xs text-stone-400 hover:text-stone-700 transition flex items-center gap-1.5">
            <Search size={13} strokeWidth={1.5} />
            <span className="hidden sm:inline">{isMobile ? '' : '⌘K'}</span>
          </button>
        </div>
      </header>

      {/* Canvas or Mobile view */}
      {isMobile ? (
        <MobileView 
          cards={filteredCards} 
          onOpen={setOpenCardId}
          onPinVersion={pinVersion}
        />
      ) : (
        <Canvas
          state={state}
          setState={setState}
          cards={filteredCards}
          activeCardId={activeCardId}
          setActiveCardId={setActiveCardId}
          onOpenCard={setOpenCardId}
          onPinVersion={pinVersion}
          onUpdateCard={updateCard}
          versionStackOpen={versionStackOpen}
          setVersionStackOpen={setVersionStackOpen}
        />
      )}

      {/* Sync button */}
      {!isMobile && (
        <div className="absolute bottom-6 right-6 z-30 flex flex-col items-end gap-2">
          {syncStatus?.error && (
            <div className="sans text-xs bg-red-50 text-red-700 border border-red-100 px-3 py-2 rounded max-w-xs">
              {syncStatus.error}
            </div>
          )}
          {syncStatus?.noChanges && (
            <div className="sans text-xs bg-stone-100 text-stone-600 border border-stone-200 px-3 py-2 rounded">
              Nothing new to sync
            </div>
          )}
          <button
            onClick={() => folderHandle ? scanFolder(folderHandle) : requestFolder()}
            disabled={syncStatus?.scanning}
            className="sans flex items-center gap-2 bg-stone-800 hover:bg-stone-900 text-stone-50 text-xs px-4 py-2.5 rounded-full transition shadow-lg disabled:opacity-50"
          >
            <RefreshCw size={13} strokeWidth={1.8} className={syncStatus?.scanning ? 'animate-spin' : ''} />
            {folderHandle ? 'Sync' : 'Connect folder'}
          </button>
          {state.cards.length > 0 && (
            <div className="sans text-[10px] uppercase tracking-wider text-stone-400">
              {state.cards.length} {state.cards.length === 1 ? 'artefact' : 'artefacts'}
            </div>
          )}
        </div>
      )}

      {/* Mobile sync note */}
      {isMobile && state.cards.length === 0 && (
        <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center">
          <p className="serif italic text-stone-500 text-lg leading-relaxed">
            This canvas is empty.<br />
            Sync from a folder on your desktop to populate it.
          </p>
        </div>
      )}

      {/* Empty state desktop */}
      {!isMobile && state.cards.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="serif italic text-stone-400 text-2xl mb-2">An empty canvas.</p>
            <p className="sans text-xs text-stone-400 uppercase tracking-wider">
              Connect a folder to begin
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      {showSearch && (
        <SearchOverlay
          query={searchQuery}
          setQuery={setSearchQuery}
          cards={state.cards}
          onSelect={(card) => {
            setShowSearch(false);
            setSearchQuery('');
            setOpenCardId(card.id);
          }}
          onClose={() => { setShowSearch(false); setSearchQuery(''); }}
        />
      )}

      {/* Sync confirmation */}
      {confirmChanges && (
        <SyncConfirm
          changes={confirmChanges}
          onConfirm={applySyncChanges}
          onCancel={() => setConfirmChanges(null)}
        />
      )}

      {/* Open card modal */}
      {openCardId && (
        <CardModal
          card={state.cards.find(c => c.id === openCardId)}
          onClose={() => setOpenCardId(null)}
          onPinVersion={pinVersion}
        />
      )}
    </div>
  );
}

// ============================================================
// Infinite Canvas (desktop)
// ============================================================
function Canvas({ state, setState, cards, activeCardId, setActiveCardId, onOpenCard, onPinVersion, onUpdateCard, versionStackOpen, setVersionStackOpen }) {
  const canvasRef = useRef(null);
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);
  const [draggingCard, setDraggingCard] = useState(null);
  
  const view = state.canvasView;
  
  const setView = useCallback((updater) => {
    setState(prev => ({ 
      ...prev, 
      canvasView: typeof updater === 'function' ? updater(prev.canvasView) : updater 
    }));
  }, [setState]);

  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      const newZoom = Math.max(0.2, Math.min(3, view.zoom * (1 + delta)));
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const worldX = (mx - view.x) / view.zoom;
      const worldY = (my - view.y) / view.zoom;
      setView({
        x: mx - worldX * newZoom,
        y: my - worldY * newZoom,
        zoom: newZoom,
      });
    } else {
      setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
  }, [view, setView]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const onMouseDown = (e) => {
    if (e.target === canvasRef.current || e.target.dataset.canvasBg) {
      setPanning(true);
      setPanStart({ x: e.clientX - view.x, y: e.clientY - view.y });
      setActiveCardId(null);
      setVersionStackOpen(null);
    }
  };

  const onMouseMove = (e) => {
    if (panning && panStart) {
      setView(v => ({ ...v, x: e.clientX - panStart.x, y: e.clientY - panStart.y }));
    } else if (draggingCard) {
      const dx = (e.clientX - draggingCard.startMouseX) / view.zoom;
      const dy = (e.clientY - draggingCard.startMouseY) / view.zoom;
      onUpdateCard(draggingCard.id, {
        x: draggingCard.startX + dx,
        y: draggingCard.startY + dy,
      });
    }
  };

  const onMouseUp = () => {
    setPanning(false);
    setPanStart(null);
    setDraggingCard(null);
  };

  const startCardDrag = (e, card) => {
    e.stopPropagation();
    setDraggingCard({
      id: card.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: card.x,
      startY: card.y,
    });
  };

  return (
    <div
      ref={canvasRef}
      data-canvas-bg
      className="absolute inset-0 canvas-bg cursor-grab active:cursor-grabbing select-none"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{ backgroundPosition: `${view.x}px ${view.y}px` }}
    >
      <div
        className="absolute origin-top-left"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
        }}
      >
        {cards.map(card => (
          <CanvasCard
            key={card.id}
            card={card}
            isActive={activeCardId === card.id}
            isFaded={!cards.find(c => c.id === card.id)}
            zoom={view.zoom}
            onActivate={() => setActiveCardId(card.id)}
            onOpen={() => onOpenCard(card.id)}
            onStartDrag={(e) => startCardDrag(e, card)}
            onPinVersion={(v) => onPinVersion(card.id, v)}
            versionStackOpen={versionStackOpen === card.id}
            toggleVersionStack={() => setVersionStackOpen(s => s === card.id ? null : card.id)}
          />
        ))}
      </div>
      
      {/* Zoom controls */}
      <div className="absolute bottom-6 left-6 z-20 flex items-center gap-1 bg-white/80 backdrop-blur border border-stone-200 rounded-full px-1 py-1">
        <button onClick={() => setView(v => ({ ...v, zoom: Math.max(0.2, v.zoom - 0.1) }))} className="p-1.5 text-stone-500 hover:text-stone-800 transition">
          <ZoomOut size={14} strokeWidth={1.5} />
        </button>
        <span className="sans text-[10px] text-stone-500 w-10 text-center">{Math.round(view.zoom * 100)}%</span>
        <button onClick={() => setView(v => ({ ...v, zoom: Math.min(3, v.zoom + 0.1) }))} className="p-1.5 text-stone-500 hover:text-stone-800 transition">
          <ZoomIn size={14} strokeWidth={1.5} />
        </button>
        <button onClick={() => setView({ x: 0, y: 0, zoom: 1 })} className="sans text-[10px] text-stone-400 hover:text-stone-700 px-2 transition">
          Reset
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Individual card on canvas
// ============================================================
function CanvasCard({ card, isActive, zoom, onActivate, onOpen, onStartDrag, onPinVersion, versionStackOpen, toggleVersionStack }) {
  const pinned = card.versions.find(v => v.version === card.pinnedVersion) || card.versions[0];
  const hasNewerDraft = card.versions.some(v => v.version > card.pinnedVersion);
  const hasMultipleVersions = card.versions.length > 1;
  
  // Card sizes by type
  const sizes = {
    note: { w: 280, h: 180 },
    image: { w: 280, h: 220 },
    html: { w: 320, h: 220 },
    pdf: { w: 280, h: 320 },
    video: { w: 320, h: 200 },
    file: { w: 240, h: 140 },
  };
  const size = sizes[card.type] || sizes.file;
  
  // At low zoom, show just label
  const showSimplified = zoom < 0.5;

  return (
    <div
      className="absolute group"
      style={{ left: card.x, top: card.y, width: size.w, height: size.h }}
      onMouseDown={onStartDrag}
      onClick={(e) => { e.stopPropagation(); onActivate(); }}
      onDoubleClick={(e) => { e.stopPropagation(); onOpen(); }}
    >
      <div
        className={`bg-white rounded-lg overflow-hidden h-full transition-all ${isActive ? 'card-shadow-active' : 'card-shadow'}`}
      >
        {showSimplified ? (
          <div className="h-full flex items-center justify-center p-4">
            <div className="text-center">
              <div className="sans text-[10px] uppercase tracking-wider text-stone-400 mb-1">{card.prefix}</div>
              <div className="serif text-lg text-stone-800">{card.name}</div>
            </div>
          </div>
        ) : (
          <>
            {/* Card header */}
            <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2 border-b border-stone-100">
              <div className="min-w-0 flex-1">
                <div className="sans text-[10px] uppercase tracking-wider text-stone-400 mb-0.5 flex items-center gap-1.5">
                  <TypeIcon type={card.type} className="text-stone-400" />
                  <span>{card.prefix}</span>
                </div>
                <div className="serif text-base text-stone-800 truncate" title={card.name}>{card.name}</div>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                {hasMultipleVersions && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleVersionStack(); }}
                    className="relative p-1 text-stone-400 hover:text-stone-700 transition"
                    title="Versions"
                  >
                    <Layers size={13} strokeWidth={1.5} />
                    {hasNewerDraft && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                    )}
                  </button>
                )}
                <span className="sans text-[10px] text-stone-400">v{card.pinnedVersion}</span>
                <div className="w-1 h-1 rounded-full pin-dot" title="Pinned"></div>
              </div>
            </div>
            
            {/* Card body - preview */}
            <div className="p-4 h-full overflow-hidden">
              <CardPreview card={card} pinned={pinned} isActive={isActive} />
            </div>
          </>
        )}
      </div>

      {/* Version stack popover */}
      {versionStackOpen && !showSimplified && (
        <div
          className="absolute top-0 left-full ml-3 z-40 bg-white rounded-lg card-shadow w-56 overflow-hidden"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sans text-[10px] uppercase tracking-wider text-stone-400 px-4 pt-3 pb-1">Versions</div>
          <div className="max-h-64 overflow-y-auto">
            {card.versions.map(v => (
              <button
                key={v.version}
                onClick={() => onPinVersion(v.version)}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-stone-50 transition ${v.version === card.pinnedVersion ? 'bg-amber-50/40' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="serif text-sm text-stone-800">v{v.version}</div>
                  <div className="sans text-[10px] text-stone-400 truncate">{v.filename}</div>
                </div>
                {v.version === card.pinnedVersion ? (
                  <div className="flex items-center gap-1 text-amber-700">
                    <div className="w-1.5 h-1.5 rounded-full pin-dot"></div>
                    <span className="sans text-[10px]">pinned</span>
                  </div>
                ) : v.version > card.pinnedVersion ? (
                  <span className="sans text-[10px] text-amber-600">newer</span>
                ) : (
                  <span className="sans text-[10px] text-stone-400">older</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Card preview content (in-card, scaled)
// ============================================================
function CardPreview({ card, pinned, isActive }) {
  if (!pinned) return <div className="serif italic text-stone-400 text-sm">No data</div>;
  
  if (!pinned.inline) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center">
        <div className="serif italic text-stone-400 text-sm mb-1">File too large to preview</div>
        <div className="sans text-[10px] text-stone-400">Double-click to open</div>
      </div>
    );
  }
  
  if (card.type === 'note') {
    return (
      <div className="h-full overflow-hidden">
        <div className="serif text-sm text-stone-700 leading-relaxed line-clamp-6 whitespace-pre-wrap">
          {pinned.content?.slice(0, 400) || ''}
        </div>
      </div>
    );
  }
  
  if (card.type === 'image' && pinned.dataUrl) {
    return (
      <div className="h-full flex items-center justify-center overflow-hidden">
        <img src={pinned.dataUrl} alt={card.name} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }
  
  if (card.type === 'html' && pinned.content) {
    if (isActive) {
      return (
        <iframe
          srcDoc={pinned.content}
          sandbox="allow-same-origin"
          className="w-full h-full border-0 bg-white"
          title={card.name}
        />
      );
    }
    return (
      <div className="h-full overflow-hidden relative">
        <iframe
          srcDoc={pinned.content}
          sandbox="allow-same-origin"
          className="w-full h-full border-0 bg-white pointer-events-none"
          title={card.name}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/10 flex items-end justify-center pb-2">
          <span className="sans text-[10px] text-stone-400 bg-white/80 px-2 py-0.5 rounded">click to activate</span>
        </div>
      </div>
    );
  }
  
  if (card.type === 'pdf' && pinned.dataUrl) {
    if (isActive) {
      return (
        <iframe
          src={pinned.dataUrl}
          className="w-full h-full border-0 bg-white"
          title={card.name}
        />
      );
    }
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <FileText size={32} strokeWidth={1} className="text-stone-300 mx-auto mb-2" />
          <div className="sans text-[10px] text-stone-400">click to view PDF</div>
        </div>
      </div>
    );
  }
  
  if (card.type === 'video' && pinned.dataUrl) {
    return (
      <video src={pinned.dataUrl} controls={isActive} className="w-full h-full object-contain" />
    );
  }
  
  return (
    <div className="h-full flex items-center justify-center text-center">
      <div>
        <div className="serif italic text-stone-400 text-sm mb-1">{card.versions[0]?.ext?.toUpperCase()} file</div>
        <div className="sans text-[10px] text-stone-400">Double-click to download</div>
      </div>
    </div>
  );
}

// ============================================================
// Full-screen card modal
// ============================================================
function CardModal({ card, onClose, onPinVersion }) {
  const [currentVersion, setCurrentVersion] = useState(card.pinnedVersion);
  const version = card.versions.find(v => v.version === currentVersion);

  if (!card) return null;
  
  return (
    <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 text-stone-50">
        <div className="min-w-0">
          <div className="sans text-[10px] uppercase tracking-wider text-stone-400 mb-0.5">{card.prefix}</div>
          <div className="serif text-xl truncate">{card.name}</div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {card.versions.length > 1 && (
            <select
              value={currentVersion}
              onChange={e => setCurrentVersion(parseInt(e.target.value))}
              className="sans bg-stone-800 text-stone-100 text-xs rounded px-2 py-1.5 border border-stone-700"
            >
              {card.versions.map(v => (
                <option key={v.version} value={v.version}>
                  v{v.version} {v.version === card.pinnedVersion ? '(pinned)' : v.version > card.pinnedVersion ? '(newer)' : ''}
                </option>
              ))}
            </select>
          )}
          {currentVersion !== card.pinnedVersion && (
            <button
              onClick={() => onPinVersion(card.id, currentVersion)}
              className="sans flex items-center gap-1.5 text-xs bg-amber-700 hover:bg-amber-800 text-stone-50 px-3 py-1.5 rounded transition"
            >
              <Pin size={12} strokeWidth={1.8} /> Pin this version
            </button>
          )}
          <button onClick={onClose} className="text-stone-400 hover:text-stone-100 transition p-1">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <div className="flex-1 bg-stone-50 mx-6 mb-6 rounded-lg overflow-hidden">
        <ModalContent card={card} version={version} />
      </div>
    </div>
  );
}

function ModalContent({ card, version }) {
  if (!version) return null;
  
  if (!version.inline) {
    return (
      <div className="h-full flex items-center justify-center text-center p-8">
        <div>
          <div className="serif text-stone-500 text-lg mb-2">File too large to preview inline</div>
          <div className="sans text-xs text-stone-400">{version.filename} · {(version.size / 1024 / 1024).toFixed(1)}MB</div>
        </div>
      </div>
    );
  }
  
  if (card.type === 'note') {
    return (
      <div className="h-full overflow-y-auto px-12 py-10">
        <div className="serif text-lg text-stone-800 leading-relaxed max-w-2xl mx-auto whitespace-pre-wrap">
          {version.content}
        </div>
      </div>
    );
  }
  
  if (card.type === 'image' && version.dataUrl) {
    return (
      <div className="h-full overflow-auto flex items-center justify-center p-4 bg-stone-100">
        <img src={version.dataUrl} alt={card.name} className="max-w-full max-h-full" />
      </div>
    );
  }
  
  if (card.type === 'html' && version.content) {
    return (
      <iframe
        srcDoc={version.content}
        sandbox="allow-same-origin allow-scripts"
        className="w-full h-full border-0 bg-white"
        title={card.name}
      />
    );
  }
  
  if (card.type === 'pdf' && version.dataUrl) {
    return (
      <iframe
        src={version.dataUrl}
        className="w-full h-full border-0 bg-white"
        title={card.name}
      />
    );
  }
  
  if (card.type === 'video' && version.dataUrl) {
    return (
      <div className="h-full flex items-center justify-center bg-stone-900">
        <video src={version.dataUrl} controls className="max-w-full max-h-full" />
      </div>
    );
  }
  
  return (
    <div className="h-full flex items-center justify-center text-center p-8">
      <div>
        <div className="serif text-stone-500 text-lg mb-3">{version.ext.toUpperCase()} file</div>
        {version.dataUrl && (
          <a href={version.dataUrl} download={version.filename} className="sans inline-flex items-center gap-2 text-xs bg-stone-800 text-stone-50 px-4 py-2 rounded hover:bg-stone-900 transition">
            <Download size={13} strokeWidth={1.5} /> Download {version.filename}
          </a>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Mobile view: vertical list grouped by prefix
// ============================================================
function MobileView({ cards, onOpen, onPinVersion }) {
  const grouped = useMemo(() => {
    const g = {};
    cards.forEach(c => {
      if (!g[c.prefix]) g[c.prefix] = [];
      g[c.prefix].push(c);
    });
    return g;
  }, [cards]);
  
  return (
    <div className="absolute inset-0 pt-16 pb-6 overflow-y-auto">
      <div className="px-4 space-y-8">
        {Object.entries(grouped).map(([prefix, items]) => (
          <div key={prefix}>
            <div className="sans text-[10px] uppercase tracking-[0.18em] text-stone-400 mb-3 px-1">
              {prefix}
            </div>
            <div className="space-y-2">
              {items.map(card => {
                const pinned = card.versions.find(v => v.version === card.pinnedVersion) || card.versions[0];
                const hasNewer = card.versions.some(v => v.version > card.pinnedVersion);
                return (
                  <button
                    key={card.id}
                    onClick={() => onOpen(card.id)}
                    className="w-full bg-white card-shadow rounded-lg p-4 text-left active:scale-[0.98] transition-transform"
                  >
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div className="serif text-base text-stone-800 truncate flex-1">{card.name}</div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="sans text-[10px] text-stone-400">v{card.pinnedVersion}</span>
                        <div className="w-1 h-1 rounded-full pin-dot"></div>
                      </div>
                    </div>
                    <div className="sans text-[10px] text-stone-400 flex items-center gap-2">
                      <TypeIcon type={card.type} className="text-stone-400" />
                      <span>{card.type}</span>
                      {card.versions.length > 1 && (
                        <>
                          <span>·</span>
                          <span>{card.versions.length} versions</span>
                          {hasNewer && <span className="text-amber-600">· newer draft</span>}
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Search overlay
// ============================================================
function SearchOverlay({ query, setQuery, cards, onSelect, onClose }) {
  const matches = useMemo(() => {
    if (!query.trim()) return cards.slice(0, 8);
    const q = query.toLowerCase();
    return cards.filter(c => c.name.toLowerCase().includes(q) || c.prefix.toLowerCase().includes(q)).slice(0, 8);
  }, [query, cards]);

  return (
    <div className="fixed inset-0 z-40 bg-stone-900/30 backdrop-blur-sm flex items-start justify-center pt-32" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-md mx-4 overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search artefacts…"
          className="sans w-full px-5 py-4 text-base outline-none border-b border-stone-100"
        />
        <div className="max-h-80 overflow-y-auto">
          {matches.length === 0 ? (
            <div className="serif italic text-stone-400 text-sm px-5 py-4">No matches</div>
          ) : (
            matches.map(card => (
              <button
                key={card.id}
                onClick={() => onSelect(card)}
                className="w-full text-left px-5 py-3 hover:bg-stone-50 transition flex items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="sans text-[10px] uppercase tracking-wider text-stone-400 mb-0.5">{card.prefix}</div>
                  <div className="serif text-sm text-stone-800 truncate">{card.name}</div>
                </div>
                <span className="sans text-[10px] text-stone-400">v{card.pinnedVersion}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sync confirmation modal
// ============================================================
function SyncConfirm({ changes, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-lg w-full max-w-md overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-stone-100">
          <div className="sans text-[10px] uppercase tracking-wider text-stone-400 mb-1">Sync</div>
          <div className="serif text-lg text-stone-800">
            {changes.length} {changes.length === 1 ? 'change' : 'changes'} found
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {changes.map((change, i) => (
            <div key={i} className="px-6 py-3 border-b border-stone-50 last:border-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="serif text-sm text-stone-800 truncate">{change.group.parsed.name}</div>
                  <div className="sans text-[10px] text-stone-400">{change.group.parsed.prefix}</div>
                </div>
                <div className="sans text-[10px] flex-shrink-0">
                  {change.type === 'new' ? (
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">new</span>
                  ) : (
                    <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded">+{change.newVersions.length} version{change.newVersions.length === 1 ? '' : 's'}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 flex items-center justify-end gap-2 bg-stone-50">
          <button onClick={onCancel} className="sans text-xs text-stone-500 hover:text-stone-800 px-3 py-2 transition">
            Cancel
          </button>
          <button onClick={onConfirm} className="sans text-xs bg-stone-800 hover:bg-stone-900 text-stone-50 px-4 py-2 rounded transition">
            Apply changes
          </button>
        </div>
        <div className="px-6 pb-4">
          <p className="serif italic text-[11px] text-stone-400 leading-relaxed">
            New versions are added without changing what's pinned. You stay in control of the working version.
          </p>
        </div>
      </div>
    </div>
  );
}
