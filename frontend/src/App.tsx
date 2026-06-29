import React, { useState, useEffect, useRef, useMemo } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Search,
  RotateCw,
  Tv,
  Star,
  AlertTriangle,
  Radio,
  ChevronLeft,
  Clock
} from 'lucide-react';
import type { Channel, SportEvent } from './types';

const LOGO_GRADIENTS = [
  'linear-gradient(135deg, #c6ff00 0%, #a2d200 100%)',
  'linear-gradient(135deg, #00f0ff 0%, #00bcce 100%)',
  'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
  'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
  'linear-gradient(135deg, #0f172a 0%, #c6ff00 100%)',
  'linear-gradient(135deg, #0f172a 0%, #00f0ff 100%)',
  'linear-gradient(135deg, #111827 0%, #374151 100%)',
  'linear-gradient(135deg, #00f0ff 0%, #c6ff00 100%)',
];

function getChannelGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return LOGO_GRADIENTS[Math.abs(hash) % LOGO_GRADIENTS.length];
}

function getChannelInitials(name: string): string {
  const cleanName = name.replace(/HD|FHD|UHD|US|UK|RO|ES|FR|IT|DE|IN/gi, '').trim();
  const parts = cleanName.split(/\s+/).filter(p => p.length > 0);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function getCountdown(startStr: string, _tick: number): string {
  if (!startStr) return '';
  const start = new Date(startStr.replace(' ', 'T') + 'Z');
  const now = new Date();
  const diff = start.getTime() - now.getTime();

  if (diff <= 0) return 'LIVE';

  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const [view, setView] = useState<'home' | 'watching'>('home');
  const [watchingEvent, setWatchingEvent] = useState<SportEvent | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const API_BASE = window.location.origin;

  useEffect(() => {
    const storedFavs = localStorage.getItem('iptv_favorites');
    if (storedFavs) setFavorites(JSON.parse(storedFavs));
    loadChannels(true);

    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  const loadChannels = async (initial = false) => {
    try {
      const res = await fetch(`${API_BASE}/api/channels`);
      const data = await res.json();
      if (data.success) {
        setChannels(data.channels);
        if (initial && data.channels.length > 0) {
          setSelectedChannel(data.channels[0]);
        }
      }
    } catch (e: any) {
    }
  };

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let updated;
    if (favorites.includes(id)) {
      updated = favorites.filter(fId => fId !== id);
    } else {
      updated = [...favorites, id];
    }
    setFavorites(updated);
    localStorage.setItem('iptv_favorites', JSON.stringify(updated));
  };

  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) return channels;
    const q = searchQuery.toLowerCase();
    return channels.filter(ch => ch.name.toLowerCase().includes(q));
  }, [channels, searchQuery]);

  const watchingSidebarChannels = useMemo(() => {
    if (watchingEvent) {
      const ids = new Set(watchingEvent.channels.map(ch => ch.id));
      return channels.filter(ch => ids.has(ch.id));
    }
    return channels;
  }, [watchingEvent, channels]);

  const watchingFilteredChannels = useMemo(() => {
    if (!searchQuery.trim()) return watchingSidebarChannels;
    const q = searchQuery.toLowerCase();
    return watchingSidebarChannels.filter(ch => ch.name.toLowerCase().includes(q));
  }, [watchingSidebarChannels, searchQuery]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selectedChannel) return;

    setIsLoadingStream(true);
    setStreamError(null);
    setIsPlaying(false);

    const proxiedUrl = `${API_BASE}/api/proxy?url=${encodeURIComponent(selectedChannel.url)}&ua=${encodeURIComponent(selectedChannel.userAgent || '')}&referer=${encodeURIComponent(selectedChannel.referer || '')}`;

    if (Hls.isSupported()) {
      if (hlsRef.current) hlsRef.current.destroy();

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferSize: 30 * 1000 * 1000,
      });

      hlsRef.current = hls;
      hls.loadSource(proxiedUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoadingStream(false);
        video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error('HLS error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setStreamError('Gagal memuat stream. Masalah koneksi server.');
              setIsLoadingStream(false);
              hls.destroy();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setStreamError('Gagal memutar stream HLS.');
              setIsLoadingStream(false);
              hls.destroy();
              break;
          }
        }
      });

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = proxiedUrl;
      video.addEventListener('loadedmetadata', () => {
        setIsLoadingStream(false);
        video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      });
      video.addEventListener('error', () => {
        setStreamError('Format video tidak didukung oleh browser Anda.');
        setIsLoadingStream(false);
      });
    } else {
      setStreamError('Browser Anda tidak mendukung pemutaran HLS (.m3u8).');
      setIsLoadingStream(false);
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [selectedChannel]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) { video.pause(); setIsPlaying(false); }
    else { video.play().then(() => setIsPlaying(true)).catch(console.error); }
  };

  const handleMuteToggle = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const newVolume = parseFloat(e.target.value);
    video.volume = newVolume;
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) { video.muted = false; setIsMuted(false); }
    else if (newVolume === 0 && !isMuted) { video.muted = true; setIsMuted(true); }
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  };

  const reloadStream = () => {
    if (!selectedChannel) return;
    const temp = selectedChannel;
    setSelectedChannel(null);
    setTimeout(() => { setSelectedChannel(temp); }, 100);
  };

  // === EVENTS STATE ===
  const [events, setEvents] = useState<Record<string, SportEvent[]>>({});
  const eventTabs = useMemo(() => Object.keys(events), [events]);
  const [countdownTick, setCountdownTick] = useState(0);

  useEffect(() => {
    fetch(`${API_BASE}/api/events`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setEvents(data.categories);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setCountdownTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const handleSelectChannel = (ch: Channel) => {
    setSelectedChannel(ch);
    setView('watching');
  };

  const handleSelectEvent = (ev: SportEvent) => {
    if (ev.channels.length > 0) {
      setSelectedChannel(ev.channels[0]);
    }
    setWatchingEvent(ev);
    setView('watching');
  };

  const goHome = () => {
    setView('home');
    setWatchingEvent(null);
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    setSelectedChannel(null);
  };

  // === RENDER HELPERS ===

  const renderChannelCard = (ch: Channel, isRelated = false) => {
    const isFavorite = favorites.includes(ch.id);
    return (
      <div
        key={ch.id}
        className={`channel-card ${selectedChannel?.id === ch.id && view === 'watching' ? 'active' : ''}`}
        onClick={() => handleSelectChannel(ch)}
      >
        <div className="card-content-wrapper">
          <div className="channel-logo-placeholder" style={{ background: getChannelGradient(ch.name) }}>
            {ch.logo ? (
              <img className="channel-logo-img" src={ch.logo} alt="" loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <span className="channel-logo-initials">{getChannelInitials(ch.name)}</span>
            )}
          </div>
          <div className="channel-info">
            <span className="channel-name" title={ch.name}>{ch.name}</span>
            <span className="channel-group-tag">{ch.group}</span>
          </div>
          {!isRelated && (
            <button className={`fav-btn ${isFavorite ? 'is-favorite' : ''}`} onClick={(e) => toggleFavorite(ch.id, e)}
              title={isFavorite ? 'Hapus dari favorit' : 'Tambah ke favorit'}>
              <Star style={{ fill: isFavorite ? 'currentColor' : 'none' }} />
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderPlayer = () => (
    <section className="player-section">
      {selectedChannel ? (
        <div className="video-container" ref={containerRef}>
          <video ref={videoRef} className="video-player" playsInline />
          {isLoadingStream && (
            <div className="player-state-overlay">
              <div className="spinner"></div>
              <p>Menghubungkan ke saluran dan buffering segmen media...</p>
            </div>
          )}
          {streamError && (
            <div className="player-state-overlay">
              <AlertTriangle size={48} style={{ color: 'var(--error)' }} />
              <h3>Gagal Memutar Saluran</h3>
              <p>{streamError}</p>
              <button className="refresh-button" style={{ width: 'auto', padding: '8px 16px', marginTop: '12px' }} onClick={reloadStream}>
                <RotateCw size={14} style={{ marginRight: '6px' }} /> Coba Lagi
              </button>
            </div>
          )}
          <div className="custom-controls-overlay">
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: isPlaying ? '100%' : '0%' }}></div>
            </div>
            <div className="controls-row">
              <div className="controls-left">
                <button className="control-btn" onClick={handlePlayPause}>{isPlaying ? <Pause /> : <Play />}</button>
                <div className="volume-wrapper">
                  <button className="control-btn" onClick={handleMuteToggle}>{isMuted ? <VolumeX /> : <Volume2 />}</button>
                  <input type="range" min="0" max="1" step="0.05" value={volume} onChange={handleVolumeChange} className="volume-slider" />
                </div>
                <button className="live-indicator" onClick={reloadStream} title="Refresh stream"><span>Live</span></button>
              </div>
              <div className="controls-right">
                <button className="control-btn" onClick={toggleFullscreen} title="Fullscreen">
                  {isFullscreen ? <Minimize2 /> : <Maximize2 />}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="video-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', background: 'radial-gradient(circle, #131522 0%, #08090f 100%)' }}>
          <Tv size={64} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
          <p style={{ color: 'var(--text-secondary)' }}>Pilih saluran untuk memulai</p>
        </div>
      )}
    </section>
  );

  const renderEventCard = (ev: SportEvent) => {
    const countdown = getCountdown(ev.start, countdownTick);
    const isLive = ev.status === 'LIVE' || countdown === 'LIVE';
    return (
      <div className="event-card" onClick={() => handleSelectEvent(ev)}>
        <div className="event-card-body">
          <div className="event-card-top">
            {isLive && <span className="event-live-badge">LIVE</span>}
            {!isLive && countdown && (
              <span className="event-countdown">
                <Clock size={12} />
                {countdown}
              </span>
            )}
            {ev.tournament && <span className="event-tournament">{ev.tournament}</span>}
          </div>
          <div className="event-name">{ev.event}</div>
          <div className="event-meta">
            <Radio size={12} />
            <span>{ev.channels.length} channel{ev.channels.length > 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      <main className={`main-content ${view === 'watching' ? 'watching' : ''}`}>
        {/* Top Navigation Bar */}
        <div className="top-nav">
          <div className="top-nav-left">
            <Tv size={22} className="gradient-text" style={{ strokeWidth: 3 }} />
            <h1 className="top-nav-brand">LZVR<span className="gradient-text">IPTV</span></h1>
            {view === 'watching' && watchingEvent && (
              <div className="top-nav-event">
                <span className="top-nav-event-name">{watchingEvent.event}</span>
                {watchingEvent.tournament && <span className="top-nav-event-tournament">{watchingEvent.tournament}</span>}
              </div>
            )}
          </div>
          {view === 'watching' && (
            <div className="top-nav-right">
              <button className="back-btn" onClick={goHome}>
                <ChevronLeft size={18} />
                <span>Kembali</span>
              </button>
            </div>
          )}
        </div>

        {view === 'home' ? (
          <>
            {/* Hero Events Section */}
            {eventTabs.length > 0 && (
              <section className="hero-section">
                <div className="hero-header">
                  <h2>Live Sports</h2>
                  <div className="stats-badges">
                    <div className="stat-badge live">Live</div>
                  </div>
                </div>
                <div className="event-grid">
                  {eventTabs.flatMap(tab => events[tab]).map((ev, i) => (
                    <div key={i}>
                      {renderEventCard(ev)}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Channel Grid */}
            <section className="channel-grid-section">
              <div className="grid-section-header">
                <div className="grid-section-left">
                  <div className="grid-section-title">
                    <h3>Semua Channel</h3>
                    <span className="category-count">{filteredChannels.length}</span>
                  </div>
                  <div className="search-input-wrapper" style={{ maxWidth: '280px' }}>
                    <Search className="search-icon" size={16} />
                    <input
                      type="text"
                      placeholder="Cari saluran..."
                      className="search-input"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="channel-grid">
                {filteredChannels.length > 0 ? (
                  filteredChannels.map(ch => renderChannelCard(ch))
                ) : (
                  <div className="grid-empty">
                    <Radio size={24} style={{ opacity: 0.5 }} />
                    <p>Tidak ada saluran yang cocok</p>
                  </div>
                )}
              </div>
            </section>
          </>
        ) : (
          <>
            <div className="watching-body">
              <div className="watching-player-area">
                {renderPlayer()}
              </div>
              <aside className="watching-sidebar">
                <div className="watching-sidebar-header">
                  <div className="search-input-wrapper">
                    <Search className="search-icon" size={16} />
                    <input
                      type="text"
                      placeholder={watchingEvent ? 'Cari dalam event...' : 'Cari saluran...'}
                      className="search-input"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="watching-sidebar-list">
                  {watchingFilteredChannels.map(ch => renderChannelCard(ch))}
                </div>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
