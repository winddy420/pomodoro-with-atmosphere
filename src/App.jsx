import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Coffee, Brain, Armchair, Loader2, Eye, EyeOff, VolumeX, Volume2 } from 'lucide-react';

// --- Configuration ---
const MODES = {
  focus: {
    time: 25 * 60,
    label: 'Focus',
    color: 'text-rose-400',
    ringColor: 'stroke-rose-400',
    bgCategory: 'focus',
  },
  shortBreak: {
    time: 5 * 60,
    label: 'Short Break',
    color: 'text-teal-400',
    ringColor: 'stroke-teal-400',
    bgCategory: 'break',
  },
  longBreak: {
    time: 15 * 60,
    label: 'Long Break',
    color: 'text-indigo-400',
    ringColor: 'stroke-indigo-400',
    bgCategory: 'break',
  },
};

// ใช้ URL ของ GIF ที่มีความเคลื่อนไหวจริง (Cinemagraph style)
const INITIAL_BACKGROUNDS = {
  focus: [
    { id: 'city', name: 'City Traffic', url: 'https://media.giphy.com/media/u01ioCe6G8Uo/giphy.gif', type: 'image' }, // Traffic moving
    { id: 'forest', name: 'Flowing River', url: 'https://media.giphy.com/media/13vbPluEPUaMznq/giphy.gif', type: 'image' }, // Water flowing
    { id: 'park', name: 'Sunny Park', url: 'https://media.giphy.com/media/l41lFj8afX4e0Vdks/giphy.gif', type: 'image' }, // Trees/Nature moving
  ],
  break: [
    { id: 'bus', name: 'Bus Stop Rain', url: 'https://media.giphy.com/media/HUEyY65hH7cRy/giphy.gif', type: 'image' }, // Waiting in rain
    { id: 'camp', name: 'Cozy Campfire', url: 'https://media.giphy.com/media/3o7aCS5oOQeL8C7rKo/giphy.gif', type: 'image' }, // Fire burning
    { id: 'cafe', name: 'Coffee Shop', url: 'https://media.giphy.com/media/3o7TKrEzvJbsQNq60U/giphy.gif', type: 'image' }, // Coffee vibe
  ],
};

let ytApiPromise = null;
const PERSIST_KEY = 'minimal-focus-state-v1';
const loadYouTubeAPI = () => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    });
  }
  return ytApiPromise;
};

const App = () => {

  // --- State ---
  const [mode, setMode] = useState('focus');
  const [customTimes, setCustomTimes] = useState({
    focus: 25,
    shortBreak: 5,
    longBreak: 15,
  });
  const [durationDraft, setDurationDraft] = useState({
    focus: 25,
    shortBreak: 5,
    longBreak: 15,
  });
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [, setCycles] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [backgrounds, setBackgrounds] = useState(INITIAL_BACKGROUNDS);

  // State สำหรับเลือกพื้นหลัง (แยกจำของแต่ละโหมด)
  const [selectedBgId, setSelectedBgId] = useState({
    focus: INITIAL_BACKGROUNDS.focus[0].id,
    break: INITIAL_BACKGROUNDS.break[0].id,
  });
  const [newAtmosphere, setNewAtmosphere] = useState({
    name: '',
    category: 'focus',
    file: null,
    type: 'image',
    youtubeLink: '',
  });
  const [editName, setEditName] = useState('');
  const [editFile, setEditFile] = useState(null);
  const [editType, setEditType] = useState('image');
  const [editYoutubeLink, setEditYoutubeLink] = useState('');
  const [formMessage, setFormMessage] = useState(null);
  const [isManagerOpen, setIsManagerOpen] = useState(true);
  const [isYoutubeMuted, setIsYoutubeMuted] = useState(true);
  const [bgVolume, setBgVolume] = useState(40);
  const [audioInput, setAudioInput] = useState('');
  const [audioSource, setAudioSource] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioMuted, setAudioMuted] = useState(true);
  const [audioVolume, setAudioVolume] = useState(55);
  const [audioReady, setAudioReady] = useState(false);
  const [bgSwitchKey, setBgSwitchKey] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [hasHydrated, setHasHydrated] = useState(false);
  const [now, setNow] = useState(new Date());
  const [showAtmosphereUI, setShowAtmosphereUI] = useState(true);

  // State สำหรับ Gemini API feature
  const [quote, setQuote] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [apiError, setApiError] = useState(null);

  const timerRef = useRef(null);
  const blobUrlsRef = useRef([]);
  const bgPlayerRef = useRef(null);
  const musicPlayerRef = useRef(null);
  const bgQualityIntervalRef = useRef(null);
  const musicQualityIntervalRef = useRef(null);

  const registerBlobUrl = (url) => {
    blobUrlsRef.current.push(url);
  };

  const revokeIfBlob = (url) => {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  };

  useEffect(() => {
    const urls = blobUrlsRef.current;
    return () => {
      urls.forEach((url) => revokeIfBlob(url));
    };
  }, []);

  // Load persisted settings
  // Parse YouTube link to build embed URL (supports watch, shorts, youtu.be, playlist)
  const parseYouTubeLink = useCallback((link) => {
    try {
      const url = new URL(link);
      const playlistId = url.searchParams.get('list');
      let videoId = url.searchParams.get('v');
      if (!videoId) {
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts[0] === 'shorts' && parts[1]) videoId = parts[1];
        else if (parts[0] === 'embed' && parts[1]) videoId = parts[1];
        else if (parts.length >= 1) videoId = parts[parts.length - 1];
      }
      return { videoId, playlistId };
    } catch {
      return { videoId: null, playlistId: null };
    }
  }, []);

  const buildYouTubeEmbed = useCallback(
    (link) => {
      const trimmed = link.trim();
      const { videoId, playlistId } = parseYouTubeLink(trimmed);
      if (playlistId) {
        return `https://www.youtube.com/embed/videoseries?list=${playlistId}&autoplay=1&mute=1&controls=0&rel=0&loop=1&enablejsapi=1&playsinline=1`;
      }
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&rel=0&loop=1&playlist=${videoId}&enablejsapi=1&playsinline=1`;
      }
      return null;
    },
    [parseYouTubeLink],
  );

  const getYoutubeThumbnail = (bg) => {
    if (bg.type !== 'youtube') return null;
    const link = bg.source || bg.url;
    const { videoId } = parseYouTubeLink(link);
    if (!videoId) return null;
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  };

  const forceHighQuality = (player) => {
    if (!player?.setPlaybackQuality) return;
    const prefs = ['highres', 'hd2160', 'hd1440', 'hd1080', 'hd720'];
    for (const q of prefs) {
      player.setPlaybackQuality(q);
    }
  };
  const startQualityInterval = (ref, player) => {
    if (!player) return;
    if (ref.current) clearInterval(ref.current);
    ref.current = setInterval(() => forceHighQuality(player), 4000);
  };

  // --- Helpers ---
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const clampMinutes = (val) => {
    const num = Number(val);
    if (Number.isNaN(num)) return 1;
    return Math.min(180, Math.max(1, Math.round(num)));
  };

  const getModeSeconds = useCallback((modeKey) => clampMinutes(customTimes[modeKey]) * 60, [customTimes]);

  const sanitizeBackgroundsFromStorage = useCallback((stored) => {
    const fallback = JSON.parse(JSON.stringify(INITIAL_BACKGROUNDS));
    const out = { focus: [], break: [] };
    ['focus', 'break'].forEach((cat) => {
      const list = Array.isArray(stored?.[cat]) ? stored[cat] : [];
      list.forEach((bg) => {
        if (!bg?.id || !bg?.name || !bg?.url) return;
        if (bg.type === 'image' && typeof bg.url === 'string' && bg.url.startsWith('blob:')) return;
        out[cat].push({
          id: bg.id,
          name: bg.name,
          url: bg.url,
          type: bg.type || 'image',
          source: bg.source,
        });
      });
      if (out[cat].length === 0) out[cat] = fallback[cat];
    });
    return out;
  }, []);

  // Load persisted settings
  useEffect(() => {
    const savedKey = localStorage.getItem('geminiApiKey');
    if (savedKey) setApiKey(savedKey);

    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) {
      setHasHydrated(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed.customTimes) {
        setCustomTimes(parsed.customTimes);
        setDurationDraft(parsed.customTimes);
      }
      if (parsed.mode && MODES[parsed.mode]) setMode(parsed.mode);
      if (parsed.backgrounds) {
        const sanitized = sanitizeBackgroundsFromStorage(parsed.backgrounds);
        setBackgrounds(sanitized);
        setSelectedBgId({
          focus: sanitized.focus.find((bg) => bg.id === parsed.selectedBgId?.focus)?.id || sanitized.focus[0].id,
          break: sanitized.break.find((bg) => bg.id === parsed.selectedBgId?.break)?.id || sanitized.break[0].id,
        });
      }
      if (typeof parsed.isYoutubeMuted === 'boolean') setIsYoutubeMuted(parsed.isYoutubeMuted);
      if (typeof parsed.bgVolume === 'number') setBgVolume(parsed.bgVolume);
      if (typeof parsed.audioVolume === 'number') setAudioVolume(parsed.audioVolume);
      if (typeof parsed.audioMuted === 'boolean') setAudioMuted(parsed.audioMuted);
      if (typeof parsed.audioSource === 'string' && parsed.audioSource.trim()) {
        const embed = buildYouTubeEmbed(parsed.audioSource);
        if (embed) {
          setAudioSource(parsed.audioSource);
          setAudioInput(parsed.audioSource);
          setAudioUrl(embed);
        }
      }
    } catch (e) {
      console.error('Persist load failed', e);
    } finally {
      setHasHydrated(true);
    }
  }, [sanitizeBackgroundsFromStorage, buildYouTubeEmbed]);

  // Persist settings
  useEffect(() => {
    if (!hasHydrated) return;
    localStorage.setItem('geminiApiKey', apiKey);
    const payload = {
      mode,
      backgrounds,
      selectedBgId,
      customTimes,
      isYoutubeMuted,
      bgVolume,
      audioInput,
      audioSource,
      audioUrl,
      audioMuted,
      audioVolume,
    };
    localStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
  }, [
    apiKey,
    mode,
    backgrounds,
    selectedBgId,
    customTimes,
    isYoutubeMuted,
    bgVolume,
    audioInput,
    audioSource,
    audioUrl,
    audioMuted,
    audioVolume,
    hasHydrated,
  ]);

  const getCurrentBg = () => {
    const category = MODES[mode].bgCategory;
    const selected = backgrounds[category].find((bg) => bg.id === selectedBgId[category]);
    return selected || backgrounds[category][0];
  };

  const setBgForCategory = (bg) => {
    const category = MODES[mode].bgCategory;
    setImageLoaded(false); // Reset load state when changing
    setSelectedBgId((prev) => ({
      ...prev,
      [category]: bg.id,
    }));
  };

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const formatClock = () =>
    now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

  // Utility function for exponential backoff (required for robustness)
  const exponentialBackoffFetch = async (url, options, maxRetries = 3) => {
    let lastError = null;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        lastError = error;
        console.error(`Attempt ${i + 1} failed:`, error);
        if (i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  };

  // Gemini API call function to generate an inspirational quote
  const generateInspirationQuote = async () => {
    setIsGenerating(true);
    setQuote(null);
    setApiError(null);

    if (!apiKey.trim()) {
      setIsGenerating(false);
      setApiError('กรุณาใส่ Gemini API Key ใน Manage Atmosphere');
      return;
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey.trim()}`;

    const systemPrompt =
      'You are a motivational and calming coach. Respond with a single, short, profound quote about focus, relaxation, or productivity. The quote should be self-contained and ready to be displayed. Do not add any introductory or concluding remarks (like "Here is a quote:").';

    // Use Thai and English prompts for better grounding/relevance if needed, but here a simple prompt works.
    const userQuery = 'Generate an inspiring quote for a pomodoro break in simple Thai or English.';

    const payload = {
      contents: [{ parts: [{ text: userQuery }] }],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
    };

    try {
      const result = await exponentialBackoffFetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || 'ไม่สามารถสร้างข้อความสร้างแรงบันดาลใจได้';
      setQuote(text.trim());
    } catch (error) {
      console.error('Gemini API Error:', error);
      setApiError('การสร้างแรงบันดาลใจล้มเหลว โปรดลองอีกครั้ง');
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Effects ---
  // Timer Logic
  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      clearInterval(timerRef.current);
      if (mode === 'focus') setCycles((c) => c + 1);
      // Clear quote when switching out of break mode
      setQuote(null);
    }
    return () => clearInterval(timerRef.current);
  }, [isActive, timeLeft, mode]);

  // Mode Switching
  const switchMode = (newMode) => {
    setMode(newMode);
    setIsActive(false);
    setTimeLeft(getModeSeconds(newMode));
    setQuote(null); // Clear quote when mode changes
    setApiError(null);
  };

  // Atmosphere management
  useEffect(() => {
    const category = MODES[mode].bgCategory;
    const selected = backgrounds[category].find((bg) => bg.id === selectedBgId[category]) || backgrounds[category][0];
    setEditName(selected?.name || '');
    setEditType(selected?.type || 'image');
    setEditYoutubeLink(selected?.type === 'youtube' ? selected.source || '' : '');
    setEditFile(null);
  }, [mode, backgrounds, selectedBgId]);

  // Sync time when mode changes or durations are updated
  useEffect(() => {
    setTimeLeft(getModeSeconds(mode));
    setIsActive(false);
  }, [mode, customTimes, getModeSeconds]);

  const handleAddAtmosphere = (e) => {
    e.preventDefault();
    setFormMessage(null);
    const name = newAtmosphere.name.trim();
    const { file, category, type, youtubeLink } = newAtmosphere;

    if (!name) {
      setFormMessage('กรุณาตั้งชื่อ Atmosphere');
      return;
    }

    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (type === 'youtube') {
      if (!youtubeLink.trim()) {
        setFormMessage('กรุณาใส่ลิงก์ YouTube');
        return;
      }
      const embed = buildYouTubeEmbed(youtubeLink);
      if (!embed) {
        setFormMessage('ลิงก์ YouTube ไม่ถูกต้อง');
        return;
      }
      setBackgrounds((prev) => ({
        ...prev,
        [category]: [...prev[category], { id, name, url: embed, type: 'youtube', source: youtubeLink }],
      }));
    } else {
      if (!file) {
        setFormMessage('กรุณาอัปโหลดภาพหรือ GIF');
        return;
      }
      const url = URL.createObjectURL(file);
      registerBlobUrl(url);
      setBackgrounds((prev) => ({
        ...prev,
        [category]: [...prev[category], { id, name, url, type: 'image' }],
      }));
    }

    setSelectedBgId((prev) => ({ ...prev, [category]: id }));
    setImageLoaded(false);
    setNewAtmosphere({ name: '', category, file: null, type, youtubeLink: '' });
    setFormMessage('เพิ่ม Atmosphere ใหม่แล้ว');
  };

  const handleNewFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    setNewAtmosphere((prev) => ({ ...prev, file }));
  };

  const handleEditFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    setEditFile(file);
  };

  const handleUpdateCurrent = (e) => {
    e.preventDefault();
    setFormMessage(null);
    const category = MODES[mode].bgCategory;
    const current = getCurrentBg();
    if (!current) return;
    const name = editName.trim() || current.name;

    if (editType === 'youtube') {
      if (!editYoutubeLink.trim()) {
        setFormMessage('กรุณาใส่ลิงก์ YouTube');
        return;
      }
      const embed = buildYouTubeEmbed(editYoutubeLink);
      if (!embed) {
        setFormMessage('ลิงก์ YouTube ไม่ถูกต้อง');
        return;
      }
      if (current.type === 'image') revokeIfBlob(current.url);
      setBackgrounds((prev) => ({
        ...prev,
        [category]: prev[category].map((bg) =>
          bg.id === current.id ? { ...bg, name, url: embed, type: 'youtube', source: editYoutubeLink } : bg,
        ),
      }));
    } else {
      if (current.type === 'youtube' && !editFile) {
        setFormMessage('อัปโหลดไฟล์เพื่อสลับจาก YouTube เป็นภาพ');
        return;
      }
      let url = current.url;
      if (editFile) {
        const newUrl = URL.createObjectURL(editFile);
        registerBlobUrl(newUrl);
        url = newUrl;
        if (current.type === 'image') revokeIfBlob(current.url);
      }
      setBackgrounds((prev) => ({
        ...prev,
        [category]: prev[category].map((bg) =>
          bg.id === current.id ? { ...bg, name, url, type: 'image', source: undefined } : bg,
        ),
      }));
    }

    setImageLoaded(false);
    setEditFile(null);
    setFormMessage('บันทึกการแก้ไขแล้ว');
  };

  const handleDeleteCurrent = () => {
    setFormMessage(null);
    const category = MODES[mode].bgCategory;
    const current = getCurrentBg();
    if (!current) return;
    const remaining = backgrounds[category].filter((bg) => bg.id !== current.id);
    if (remaining.length < 1) {
      setFormMessage('ต้องเหลืออย่างน้อย 1 Atmosphere ต่อหมวด');
      return;
    }
    revokeIfBlob(current.url);
    setBackgrounds((prev) => ({ ...prev, [category]: remaining }));
    setSelectedBgId((prev) => ({ ...prev, [category]: remaining[0].id }));
    setImageLoaded(false);
    setFormMessage('ลบ Atmosphere แล้ว');
  };

  const masterMuted = isYoutubeMuted && audioMuted;
  const handleToggleMasterMute = () => {
    const player = bgPlayerRef.current;
    const musicPlayer = musicPlayerRef.current;
    if (!masterMuted) {
      setIsYoutubeMuted(true);
      setAudioMuted(true);
      player?.mute?.();
      musicPlayer?.mute?.();
    } else {
      const safeBgVol = bgVolume === 0 ? 30 : bgVolume;
      const safeAudioVol = audioVolume === 0 ? 40 : audioVolume;
      setBgVolume(safeBgVol);
      setAudioVolume(safeAudioVol);
      setIsYoutubeMuted(false);
      setAudioMuted(false);
      player?.setVolume?.(safeBgVol);
      player?.unMute?.();
      musicPlayer?.setVolume?.(safeAudioVol);
      musicPlayer?.unMute?.();
    }
  };

  const currentBgData = getCurrentBg();
  useEffect(() => {
    setImageLoaded(false);
    setBgSwitchKey((k) => k + 1);
  }, [currentBgData.id]);

  // --- YouTube player wiring ---
  useEffect(() => {
    if (currentBgData.type !== 'youtube') {
      bgPlayerRef.current?.destroy?.();
      bgPlayerRef.current = null;
      return;
    }

    const source = currentBgData.source || currentBgData.url || '';
    const { videoId, playlistId } = parseYouTubeLink(source);
    if (!videoId && !playlistId) return;

    setImageLoaded(false);
    let cancelled = false;

    const setup = async () => {
      const YT = await loadYouTubeAPI();
      if (!YT || cancelled) return;

      if (bgPlayerRef.current) {
        bgPlayerRef.current.destroy();
        bgPlayerRef.current = null;
      }

      const playerVars = {
        autoplay: 1,
        controls: 0,
        rel: 0,
        loop: 1,
        playsinline: 1,
        modestbranding: 1,
        enablejsapi: 1,
        vq: 'highres',
        mute: isYoutubeMuted ? 1 : 0,
      };
      if (playlistId) {
        playerVars.listType = 'playlist';
        playerVars.list = playlistId;
      } else if (videoId) {
        playerVars.playlist = videoId;
      }

      bgPlayerRef.current = new YT.Player('bg-player', {
        height: '100%',
        width: '100%',
        videoId: playlistId ? undefined : videoId,
        playerVars,
        events: {
          onReady: (event) => {
            if (cancelled) return;
            if (isYoutubeMuted) event.target.mute?.();
            else event.target.unMute?.();
            forceHighQuality(event.target);
            startQualityInterval(bgQualityIntervalRef, event.target);
            event.target.playVideo();
            setImageLoaded(true);
          },
          onPlaybackQualityChange: (event) => {
            if (cancelled) return;
            forceHighQuality(event.target);
          },
          onStateChange: (event) => {
            if (cancelled) return;
            if (event.data === YT.PlayerState.ENDED) {
              event.target.seekTo(0);
              event.target.playVideo();
            }
            if (event.data === YT.PlayerState.PLAYING) {
              if (isYoutubeMuted) event.target.mute?.();
              else event.target.unMute?.();
              forceHighQuality(event.target);
              startQualityInterval(bgQualityIntervalRef, event.target);
            }
            if (event.data === YT.PlayerState.CUED) {
              forceHighQuality(event.target);
            }
          },
        },
      });
    };

    setup();
    return () => {
      cancelled = true;
      const intervalId = bgQualityIntervalRef.current;
      if (intervalId) clearInterval(intervalId);
      bgQualityIntervalRef.current = null;
    };
    // do not rebuild player on mute/volume toggles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBgData, parseYouTubeLink, bgSwitchKey]);

  // Apply mute/volume to background video without reloading
  useEffect(() => {
    const player = bgPlayerRef.current;
    if (!player || typeof player.setVolume !== 'function') return;
    player.setVolume(bgVolume);
    if (isYoutubeMuted) {
      player.mute?.();
    } else {
      player.unMute?.();
    }
  }, [isYoutubeMuted, bgVolume]);

  // Build music player when URL changes
  useEffect(() => {
    musicPlayerRef.current?.destroy?.();
    musicPlayerRef.current = null;
    setAudioReady(false);
    if (!audioUrl) return;

    let cancelled = false;
    const { videoId } = parseYouTubeLink(audioSource || audioUrl);
    if (!videoId) return;

    const setup = async () => {
      const YT = await loadYouTubeAPI();
      if (!YT || cancelled) return;

      const playerVars = {
        autoplay: 1,
        controls: 0,
        rel: 0,
        loop: 1,
        playsinline: 1,
        modestbranding: 1,
        origin: window.location.origin,
        enablejsapi: 1,
        vq: 'highres',
      };
      playerVars.playlist = videoId;

      musicPlayerRef.current = new YT.Player('music-player', {
        height: '1',
        width: '1',
        videoId,
        playerVars,
        events: {
          onReady: (event) => {
            if (cancelled) return;
            setAudioReady(true);
            if (!audioMuted) {
              event.target.unMute?.();
              event.target.setVolume(Math.max(1, audioVolume || 0));
              event.target.playVideo?.();
            }
            forceHighQuality(event.target);
            startQualityInterval(musicQualityIntervalRef, event.target);
          },
          onPlaybackQualityChange: (event) => {
            if (cancelled) return;
            forceHighQuality(event.target);
          },
          onStateChange: (event) => {
            if (cancelled) return;
            if (event.data === YT.PlayerState.ENDED) {
              event.target.seekTo?.(0);
              event.target.playVideo?.();
            }
            if (event.data === YT.PlayerState.PLAYING) {
              if (audioMuted) event.target.mute?.();
              else event.target.unMute?.();
              forceHighQuality(event.target);
            }
            if (event.data === YT.PlayerState.CUED) {
              forceHighQuality(event.target);
            }
          },
        },
      });
    };

    setup();
    return () => {
      cancelled = true;
      musicPlayerRef.current?.destroy?.();
      musicPlayerRef.current = null;
      setAudioReady(false);
      const intervalId = musicQualityIntervalRef.current;
      if (intervalId) clearInterval(intervalId);
      musicQualityIntervalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, audioSource, parseYouTubeLink]);

  // Apply mute/volume to ready player
  useEffect(() => {
    if (!audioReady || !musicPlayerRef.current?.setVolume) return;
    const player = musicPlayerRef.current;
    const vol = Math.max(1, audioVolume || 0);
    player.setVolume(vol);
    if (audioMuted) {
      player.mute && player.mute();
    } else {
      player.unMute && player.unMute();
    }
  }, [audioMuted, audioVolume, audioReady]);

  useEffect(() => {
    return () => {
      bgPlayerRef.current?.destroy?.();
      musicPlayerRef.current?.destroy?.();
    };
  }, []);

  // --- Calculations ---
  const totalTime = getModeSeconds(mode);
  const progress = ((totalTime - timeLeft) / totalTime) * 100;
  const radius = 120;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center font-sans bg-black">
      {/* --- Moving Background Layer (GIF) --- */}
      <div className="fixed inset-0 z-0">
        {/* Loading Indicator */}
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-0">
            <Loader2 className="animate-spin text-white/30" size={48} />
          </div>
        )}

        {/* Background Image/GIF/YouTube */}
        <div
          key={bgSwitchKey}
          className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
        >
          {currentBgData.type === 'youtube' ? (
            <div className="w-full h-full">
              <div
                id="bg-player"
                className="w-full h-full pointer-events-none transition-transform duration-700 ease-out"
                style={{ transform: imageLoaded ? 'scale(1)' : 'scale(1.03)' }}
              />
            </div>
          ) : (
            <img
              key={currentBgData.id}
              src={currentBgData.url}
              alt="background"
              onLoad={() => setImageLoaded(true)}
              className="w-full h-full object-cover transition-transform duration-700 ease-out"
              style={{ transform: imageLoaded ? 'scale(1)' : 'scale(1.03)' }}
            />
          )}
          {/* Overlay: Darker to make text pop over busy backgrounds */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"></div>
        </div>
      </div>

      {/* --- Header --- */}
      <div className="absolute top-6 left-0 right-0 flex flex-col items-center z-20 gap-2 px-4">
        <div className="text-white/80 text-xs tracking-[0.4em] uppercase font-light drop-shadow-lg border-b border-white/20 pb-2 px-8 text-center">
          Minimal Focus
        </div>
      </div>
      <div className="fixed top-6 right-4 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={handleToggleMasterMute}
          className="text-white/90 bg-black/70 border border-white/15 p-2 rounded-full backdrop-blur hover:bg-black/80 transition-colors shadow-lg"
          aria-label={masterMuted ? 'Unmute all' : 'Mute all'}
          title={masterMuted ? 'Unmute all audio' : 'Mute all audio'}
        >
          {masterMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        {!showAtmosphereUI && (
          <button
            type="button"
            onClick={() => setShowAtmosphereUI(true)}
            className="text-white/80 bg-black/60 border border-white/15 p-2 rounded-full backdrop-blur hover:bg-black/70 transition-colors"
            aria-label="Show Atmosphere/Settings"
          >
            <Eye size={16} />
          </button>
        )}
      </div>

      {/* --- Main Content --- */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-md px-4">
        {/* Timer Display */}
        <div className="relative flex items-center justify-center mb-8 mt-12 md:mt-14 group">
          {/* Breathing Circle Effect (Only active when timer is running) */}
          <div
            className={`absolute w-80 h-80 rounded-full border border-white/30 opacity-20 transform transition-all duration-[4000ms] ease-in-out ${isActive ? 'scale-110 opacity-30' : 'scale-100 opacity-5'}`}
          ></div>
          <div
            className={`absolute w-72 h-72 rounded-full border border-white/20 opacity-20 transform transition-all duration-[4000ms] delay-100 ease-in-out ${isActive ? 'scale-105 opacity-20' : 'scale-95 opacity-5'}`}
          ></div>

          {/* SVG Timer Ring */}
          <svg className="transform -rotate-90 w-72 h-72 drop-shadow-2xl" viewBox="0 0 280 280">
            {/* Track */}
            <circle cx="140" cy="140" r={radius} stroke="white" strokeWidth="2" fill="transparent" className="opacity-10" />
            {/* Progress */}
            <circle
              cx="140"
              cy="140"
              r={radius}
              stroke="currentColor"
              strokeWidth="5"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className={`transition-all duration-1000 ease-linear ${MODES[mode].ringColor} drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]`}
            />
          </svg>

          {/* Time Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white gap-2">
            <span
              className={`text-7xl font-light tracking-tighter tabular-nums drop-shadow-2xl transition-colors duration-500 ${isActive ? 'text-white' : 'text-white/90'}`}
            >
              {formatTime(timeLeft)}
            </span>
            <span className={`text-sm mt-3 tracking-[0.2em] uppercase font-medium transition-colors duration-300 ${MODES[mode].color}`}>
              {isActive ? 'Flowing' : MODES[mode].label}
            </span>
            <span className="text-sm text-white/90 bg-black/70 border border-white/10 px-3 py-1 rounded-full backdrop-blur">
              {formatClock()}
            </span>
          </div>
        </div>

        {showAtmosphereUI && (
          <>
            {/* --- Background Selector (Improved Visibility) --- */}
            <div className="w-full mb-8">
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-[10px] text-white/40 uppercase tracking-wider">Select Atmosphere</span>
                <button
                  type="button"
                  onClick={() => setShowAtmosphereUI((v) => !v)}
                  className="text-white/70 hover:text-white p-1 rounded-full bg-black/40 border border-white/10 backdrop-blur transition-colors"
                  aria-label={showAtmosphereUI ? 'Hide Atmosphere/Settings' : 'Show Atmosphere/Settings'}
                >
                  {showAtmosphereUI ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="flex justify-center gap-3 overflow-x-auto py-2 px-4 no-scrollbar">
                {backgrounds[MODES[mode].bgCategory].map((bg) => (
                  <button
                    key={bg.id}
                    onClick={() => setBgForCategory(bg)}
                    className={`group relative flex flex-col items-center gap-2 transition-all duration-300 ${currentBgData.id === bg.id ? 'scale-105 opacity-100' : 'opacity-50 hover:opacity-80'}`}
                  >
                    <div
                      className={`w-12 h-12 rounded-xl overflow-hidden border-2 transition-colors ${
                        currentBgData.id === bg.id ? `border-${MODES[mode].color.split('-')[1]}-400` : 'border-transparent'
                      }`}
                    >
                      {bg.type === 'youtube' ? (
                        (() => {
                          const thumb = getYoutubeThumbnail(bg);
                          return thumb ? (
                            <img src={thumb} alt={bg.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-red-600/70 text-white text-[10px] font-semibold flex items-center justify-center">
                              YT
                            </div>
                          );
                        })()
                      ) : (
                        <img src={bg.url} alt={bg.name} className="w-full h-full object-cover" />
                      )}
                    </div>
                    <span className="text-[10px] text-white font-medium whitespace-nowrap">{bg.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* --- Atmosphere Manager --- */}
            <div className="w-full mb-8 bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] text-white/50 uppercase tracking-[0.25em]">Settings & Manage Atmosphere</span>
                  {formMessage && <span className="text-[11px] text-emerald-200 mt-1">{formMessage}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => setIsManagerOpen((v) => !v)}
                  className="text-white/80 hover:text-white text-xs px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 transition-colors"
                >
                  {isManagerOpen ? 'Collapse' : 'Expand'}
                </button>
              </div>

              <div
                className={`space-y-4 transition-[max-height,opacity] duration-500 ease-in-out ${
                  isManagerOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
                } overflow-hidden`}
                aria-hidden={!isManagerOpen}
              >
                {/* Durations */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
                  <div className="text-[11px] text-white/60 uppercase tracking-[0.16em]">ตั้งค่าเวลา (นาที)</div>
                  <form
                    className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const sanitized = {
                        focus: clampMinutes(durationDraft.focus),
                        shortBreak: clampMinutes(durationDraft.shortBreak),
                        longBreak: clampMinutes(durationDraft.longBreak),
                      };
                      setDurationDraft(sanitized);
                      setCustomTimes(sanitized);
                      setIsActive(false);
                      setTimeLeft(getModeSeconds(mode));
                      setFormMessage('อัปเดตเวลาเรียบร้อย');
                    }}
                  >
                    {[
                      { key: 'focus', label: 'Focus' },
                      { key: 'shortBreak', label: 'Short Break' },
                      { key: 'longBreak', label: 'Long Break' },
                    ].map((item) => (
                      <div key={item.key} className="flex flex-col gap-1">
                        <label className="text-[11px] text-white/60">{item.label}</label>
                        <input
                          type="number"
                          min="1"
                          max="180"
                          value={durationDraft[item.key]}
                          onChange={(e) =>
                            setDurationDraft((prev) => ({
                              ...prev,
                              [item.key]: e.target.value,
                            }))
                          }
                          className="w-full bg-black/30 border border-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-white/40"
                        />
                      </div>
                    ))}
                    <div className="sm:col-span-3 flex justify-end">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-lg border border-white/15 transition-colors"
                      >
                        บันทึกเวลา
                      </button>
                    </div>
                  </form>
                </div>

                {/* Add new */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                  <div className="text-[11px] text-white/60 uppercase tracking-[0.16em]">เพิ่ม Atmosphere ใหม่</div>
                  <form onSubmit={handleAddAtmosphere} className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={newAtmosphere.category}
                        onChange={(e) => setNewAtmosphere((prev) => ({ ...prev, category: e.target.value }))}
                        className="bg-black/30 border border-white/10 text-white text-xs rounded-lg px-3 py-2 outline-none focus:border-white/40"
                      >
                        <option value="focus">Focus</option>
                        <option value="break">Break</option>
                      </select>
                      <select
                        value={newAtmosphere.type}
                        onChange={(e) => setNewAtmosphere((prev) => ({ ...prev, type: e.target.value }))}
                        className="bg-black/30 border border-white/10 text-white text-xs rounded-lg px-3 py-2 outline-none focus:border-white/40"
                      >
                        <option value="image">Upload</option>
                        <option value="youtube">YouTube</option>
                      </select>
                      <input
                        type="text"
                        value={newAtmosphere.name}
                        onChange={(e) => setNewAtmosphere((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="ชื่อ Atmosphere ใหม่"
                        className="col-span-3 bg-black/30 border border-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-white/40"
                      />
                    </div>
                    {newAtmosphere.type === 'youtube' ? (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="url"
                          value={newAtmosphere.youtubeLink}
                          onChange={(e) => setNewAtmosphere((prev) => ({ ...prev, youtubeLink: e.target.value }))}
                          placeholder="ลิงก์ YouTube (video / playlist / live)"
                          className="flex-1 bg-black/30 border border-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-white/40"
                        />
                        <button
                          type="submit"
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          เพิ่ม Atmosphere
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row items-center gap-2">
                        <input
                          type="file"
                          accept="image/gif,image/apng,image/webp,image/jpeg,image/png"
                          onChange={handleNewFileChange}
                          className="text-[11px] text-white/70"
                        />
                        <button
                          type="submit"
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          เพิ่ม Atmosphere
                        </button>
                      </div>
                    )}
                  </form>
                </div>

                {/* Edit current */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                  <div className="text-[11px] text-white/60 uppercase tracking-[0.16em]">
                    แก้ไข Atmosphere ปัจจุบัน ({MODES[mode].label})
                  </div>
                  <form onSubmit={handleUpdateCurrent} className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="col-span-2 bg-black/30 border border-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-white/40"
                        placeholder="ชื่อ Atmosphere"
                      />
                      <select
                        value={editType}
                        onChange={(e) => setEditType(e.target.value)}
                        className="bg-black/30 border border-white/10 text-white text-xs rounded-lg px-3 py-2 outline-none focus:border-white/40"
                      >
                        <option value="image">Upload</option>
                        <option value="youtube">YouTube</option>
                      </select>
                    </div>
                    {editType === 'youtube' ? (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="url"
                          value={editYoutubeLink}
                          onChange={(e) => setEditYoutubeLink(e.target.value)}
                          placeholder="ลิงก์ YouTube (video / playlist / live)"
                          className="flex-1 bg-black/30 border border-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-white/40"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleDeleteCurrent}
                            className="px-3 py-2 bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            ลบ
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            บันทึก
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="file"
                          accept="image/gif,image/apng,image/webp,image/jpeg,image/png"
                          onChange={handleEditFileChange}
                          className="text-[11px] text-white/70"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleDeleteCurrent}
                            className="px-3 py-2 bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            ลบ
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            บันทึก
                          </button>
                        </div>
                      </div>
                    )}
                  </form>

                  {currentBgData.type === 'youtube' && (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-white/60">
                        <span>เสียงวิดีโอพื้นหลัง</span>
                        <span>{bgVolume}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const next = !isYoutubeMuted;
                            setIsYoutubeMuted(next);
                            if (bgPlayerRef.current) {
                              if (next) bgPlayerRef.current.mute();
                              else {
                                if (bgVolume === 0) {
                                  setBgVolume(30);
                                  bgPlayerRef.current.setVolume(30);
                                }
                                bgPlayerRef.current.unMute();
                              }
                            }
                          }}
                          className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg border border-white/15 backdrop-blur transition-colors"
                        >
                          {isYoutubeMuted ? '🔇 เปิดเสียงวีดีโอ' : '🔊 ปิดเสียงวีดีโอ'}
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={bgVolume}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setBgVolume(val);
                            if (bgPlayerRef.current) {
                              bgPlayerRef.current.setVolume(val);
                              if (val === 0) {
                                setIsYoutubeMuted(true);
                                bgPlayerRef.current.mute();
                              } else if (isYoutubeMuted) {
                                setIsYoutubeMuted(false);
                                bgPlayerRef.current.unMute();
                              }
                            }
                          }}
                          className="flex-1 accent-white/80"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Background music */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                  <div className="text-[11px] text-white/60 uppercase tracking-[0.16em]">Background Music (YouTube)</div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="url"
                      value={audioInput}
                      onChange={(e) => setAudioInput(e.target.value)}
                      placeholder="ลิงก์ YouTube (video/playlist/live) สำหรับเสียง"
                      className="flex-1 bg-black/30 border border-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-white/40"
                    />
                    <button
                      type="button"
                  onClick={() => {
                    setFormMessage(null);
                    if (!audioInput.trim()) {
                      setFormMessage('กรุณาใส่ลิงก์เสียง YouTube');
                      return;
                    }
                    const embed = buildYouTubeEmbed(audioInput);
                    if (!embed) {
                      setFormMessage('ลิงก์ YouTube ไม่ถูกต้อง');
                      return;
                    }
                    setAudioUrl(embed);
                    setAudioSource(audioInput.trim());
                    setAudioMuted(false);
                    if (audioVolume === 0) setAudioVolume(40);
                    setFormMessage('ตั้งค่าเสียงพื้นหลังแล้ว');
                  }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      ตั้งค่า
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <button
                    type="button"
                    onClick={() => {
                      if (!audioUrl) return;
                      const next = !audioMuted;
                      setAudioMuted(next);
                      const player = musicPlayerRef.current;
                      if (player && typeof player.setVolume === 'function') {
                        if (next) {
                          player.mute && player.mute();
                        } else {
                          if (audioVolume === 0) {
                            setAudioVolume(40);
                            player.setVolume(40);
                          }
                          player.unMute && player.unMute();
                        }
                      }
                    }}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg border border-white/15 backdrop-blur transition-colors disabled:opacity-40"
                    disabled={!audioUrl}
                  >
                        {audioMuted ? '🔇 เปิดเสียงเพลง' : '🔊 ปิดเสียงเพลง'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAudioUrl('');
                          setAudioSource('');
                          setAudioInput('');
                          setFormMessage('ลบเสียงพื้นหลังแล้ว');
                        }}
                        className="px-3 py-2 bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                        disabled={!audioUrl}
                      >
                        ลบเสียง
                      </button>
                      {audioSource && <span className="text-[11px] text-white/60 truncate">Source: {audioSource}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-white/60">ระดับเสียง</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={audioVolume}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setAudioVolume(val);
                        if (musicPlayerRef.current) {
                          musicPlayerRef.current.setVolume(val);
                          if (val === 0) {
                            setAudioMuted(true);
                            musicPlayerRef.current.mute && musicPlayerRef.current.mute();
                          } else if (audioMuted) {
                            setAudioMuted(false);
                            musicPlayerRef.current.unMute && musicPlayerRef.current.unMute();
                          }
                        }
                      }}
                      className="flex-1 accent-white/80"
                      disabled={!audioUrl}
                  />
                      <span className="text-[11px] text-white/70 w-10 text-right">{audioVolume}%</span>
                    </div>
                  </div>
                </div>

                {/* Gemini API Key */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                  <div className="text-[11px] text-white/60 uppercase tracking-[0.16em]">Gemini API Key</div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        setApiKey(val);
                        localStorage.setItem('geminiApiKey', val);
                      }}
                      placeholder="ใส่ API Key เพื่อใช้ Break Inspiration"
                      className="flex-1 bg-black/30 border border-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-white/40"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setApiKey('');
                        localStorage.removeItem('geminiApiKey');
                        setFormMessage('ลบ API Key แล้ว');
                      }}
                      className="px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      ลบ
                    </button>
                  </div>
                  <div className="text-[11px] text-white/50">Key ถูกเก็บใน localStorage บนเบราว์เซอร์คุณ</div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* --- Quote Generator (Gemini Feature) --- */}
        {(mode === 'shortBreak' || mode === 'longBreak') && (
          <div className="flex flex-col items-center mb-6">
            <button
              onClick={generateInspirationQuote}
              disabled={isGenerating || isActive} // Disable during timer run
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider shadow-md transition-colors disabled:opacity-50 ${
                MODES[mode].bgCategory === 'break' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : ''
              }`}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>✨ Get Break Inspiration</>
              )}
            </button>
            {quote && (
              <div className="mt-4 p-3 bg-white/10 rounded-lg max-w-xs text-center text-sm italic text-white/90 shadow-inner border border-white/10">
                "{quote}"
              </div>
            )}
            {apiError && (
              <div className="mt-4 p-2 bg-red-600/80 rounded-lg text-center text-xs text-white">
                {apiError}
              </div>
            )}
          </div>
        )}

        {/* --- Main Controls --- */}
        <div className="flex items-center gap-8 mb-10">
          {/* Reset */}
          <button
            onClick={() => {
              setIsActive(false);
              setTimeLeft(MODES[mode].time);
            }}
            className="group p-4 rounded-full bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white hover:scale-105 transition-all"
            title="Reset Timer"
          >
            <RotateCcw size={20} className="group-hover:-rotate-90 transition-transform duration-500" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={() => setIsActive(!isActive)}
            className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.3)] transition-all transform hover:scale-105 active:scale-95 bg-white text-slate-900"
          >
            {isActive ? <Pause size={32} fill="currentColor" className="opacity-80" /> : <Play size={32} fill="currentColor" className="ml-1 opacity-80" />}
          </button>

          {/* Skip (Hidden functional logic placeholder if needed) */}
          <div className="w-[54px]"></div>
        </div>

        {/* --- Mode Selector --- */}
        <div className="flex gap-2 p-1.5 bg-black/40 backdrop-blur-xl rounded-2xl border border-white/5 shadow-xl">
          <button
            onClick={() => switchMode('focus')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all duration-300 ${
              mode === 'focus' ? 'bg-rose-500 text-white shadow-lg shadow-rose-900/20' : 'text-white/40 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Brain size={14} />
            Focus
          </button>
          <button
            onClick={() => switchMode('shortBreak')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all duration-300 ${
              mode === 'shortBreak' ? 'bg-teal-500 text-white shadow-lg shadow-teal-900/20' : 'text-white/40 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Coffee size={14} />
            Break
          </button>
          <button
            onClick={() => switchMode('longBreak')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all duration-300 ${
              mode === 'longBreak' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-900/20' : 'text-white/40 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Armchair size={14} />
            Long
          </button>
        </div>
      </div>

      {/* Hidden YouTube music player target */}
      <div id="music-player" className="w-1 h-1 absolute opacity-0 pointer-events-none" aria-hidden="true"></div>
    </div>
  );
};

export default App;
