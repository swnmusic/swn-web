(() => {
  "use strict";

  /*
   * SWN real audio layer
   * Add this file after the existing inline script in music.html:
   * <script src="swn-real-player.js"></script>
   */

  const tracks = [
    {
      title: "I Tango You",
      fallbackDuration: 278,
        sources: {
          original: {
            lossless: "AUDIO/i-tango-you-original-24-48.flac",
            standard: "AUDIO/i-tango-you-original-320.mp3"
          },
          instrumental: {
            lossless: "AUDIO/i-tango-you-instrumental-24-48.flac",
            standard: "AUDIO/i-tango-you-instrumental-320.mp3"
          },
          acappella: {
            lossless: "AUDIO/i-tango-you-acappella-24-48.flac",
            standard: "AUDIO/i-tango-you-acappella-320.mp3"
          }
        }
    },
    {
      title: "Believe in Yourself",
      fallbackDuration: 248,
      sources: {}
    },
    {
      title: "Slow Down",
      fallbackDuration: 276,
      sources: {}
    },
    {
      title: "Is It You",
      fallbackDuration: 255,
      sources: {}
    }
  ];

  const audio = document.createElement("audio");
  audio.id = "swnAudioPlayer";
  audio.preload = "metadata";
  audio.controls = false;
  audio.style.display = "none";
  document.body.appendChild(audio);

  function replaceWithClone(id) {
    const original = document.getElementById(id);
    if (!original) {
      throw new Error(`Missing required SWN player element: ${id}`);
    }
    const clone = original.cloneNode(true);
    original.replaceWith(clone);
    return clone;
  }

  // Replacing these nodes removes the simulated-player event listeners.
  const playButton = replaceWithClone("playButton");
  const previousButton = replaceWithClone("previousButton");
  const nextButton = replaceWithClone("nextButton");
  const waveformShell = replaceWithClone("waveformShell");
  const versionOptions = replaceWithClone("versionOptions");
  const qualityOptions = replaceWithClone("qualityOptions");
  const trackList = replaceWithClone("trackList");
  const volumeControl = replaceWithClone("volumeControl");

  const waveform = waveformShell.querySelector("#waveform");
  const playhead = waveformShell.querySelector("#playhead");
  const elapsedTime = document.getElementById("elapsedTime");
  const totalTime = document.getElementById("totalTime");
  const trackTitle = document.getElementById("trackTitle");
  const trackNumber = document.getElementById("trackNumber");
  const versionName = document.getElementById("versionName");
  const qualityBadge = document.getElementById("qualityBadge");
  const coverWrap = document.getElementById("coverWrap");
    const coverVideo = document.querySelector(".cover-video");
  const heroCopy = document.querySelector(".hero-copy");

  if (heroCopy) {
    heroCopy.textContent =
      "Original, instrumental and a cappella versions presented inside the same listening experience. I Tango You now streams in MP3 320 kbps and FLAC 24-bit / 48 kHz.";
  }

  const supportsFlac = Boolean(
    audio.canPlayType("audio/flac") || audio.canPlayType("audio/x-flac")
  );

  const state = {
    trackIndex: 0,
    version: "Original",
    quality: supportsFlac ? "lossless" : "standard",
    available: false,
    loading: false,
    pendingTime: 0,
    pendingPlay: false,
    fallbackAttempted: false
  };

  const qualityText = {
    lossless: "Studio Lossless · FLAC · 24-bit / 48 kHz",
    standard: "Standard · MP3 · 320 kbps"
  };

  function configureQualityButtons() {
    const buttons = Array.from(
      qualityOptions.querySelectorAll(".option-button")
    );

    if (buttons[0]) {
      buttons[0].dataset.qualityKey = "lossless";
      buttons[0].innerHTML = `
        <span class="option-main">
          <span class="option-dot"></span>
          Studio Lossless
        </span>
        <span class="option-meta">FLAC · 24-bit / 48 kHz</span>
      `;
      buttons[0].disabled = !supportsFlac;
      buttons[0].title = supportsFlac
        ? "Stream the 24-bit / 48 kHz FLAC"
        : "FLAC playback is not supported by this browser";
    }

    if (buttons[1]) {
      buttons[1].dataset.qualityKey = "standard";
      buttons[1].innerHTML = `
        <span class="option-main">
          <span class="option-dot"></span>
          Standard
        </span>
        <span class="option-meta">MP3 · 320 kbps</span>
      `;
      buttons[1].disabled = false;
      buttons[1].title = "Stream the 320 kbps MP3";
    }
  }

  function formatTime(seconds) {
    const safeSeconds = Number.isFinite(seconds)
      ? Math.max(0, Math.floor(seconds))
      : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return (
      String(minutes).padStart(2, "0") +
      ":" +
      String(remainingSeconds).padStart(2, "0")
    );
  }

  function currentTrack() {
    return tracks[state.trackIndex];
  }

  function currentSource() {
    const track = currentTrack();
    return track.sources?.[state.version]?.[state.quality] || "";
  }

  function currentDuration() {
    if (
      state.available &&
      Number.isFinite(audio.duration) &&
      audio.duration > 0
    ) {
      return audio.duration;
    }
    return currentTrack().fallbackDuration;
  }

  function updateOptionButtons() {
    versionOptions
      .querySelectorAll("[data-version]")
      .forEach((button) => {
        button.classList.toggle(
          "active",
          button.dataset.version === state.version
        );
      });

    qualityOptions
      .querySelectorAll("[data-quality-key]")
      .forEach((button) => {
        button.classList.toggle(
          "active",
          button.dataset.qualityKey === state.quality
        );
      });
  }

  function updateWaveformProgress() {
    const duration = currentDuration();
    const progress =
      duration > 0
        ? Math.min(1, Math.max(0, (audio.currentTime || 0) / duration))
        : 0;

    playhead.style.left = `${progress * 100}%`;

    const bars = waveform.querySelectorAll(".wave-bar");
    const activeBars = Math.floor(progress * bars.length);
    bars.forEach((bar, index) => {
      bar.classList.toggle("active", index <= activeBars);
    });

    waveformShell.setAttribute(
      "aria-valuenow",
      String(Math.round(progress * 100))
    );
  }

  function renderTrackList() {
    trackList.innerHTML = "";

    tracks.forEach((track, index) => {
      const hasAudio = Object.keys(track.sources).length > 0;
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "track-row" + (index === state.trackIndex ? " active" : "");
      button.innerHTML = `
        <span class="track-index">${String(index + 1).padStart(2, "0")}</span>
        <span class="track-row-title">${track.title}</span>
        <span class="track-duration">${formatTime(track.fallbackDuration)}</span>
        <span class="track-mini-wave">${
          index === state.trackIndex ? "▥" : hasAudio ? "◇" : "·"
        }</span>
      `;
      if (!hasAudio) {
        button.title = "Coming soon";
      }
      button.addEventListener("click", () => loadTrack(index, true));
      trackList.appendChild(button);
    });
  }

  function updateDisplay() {
    const track = currentTrack();
    const isPlaying = !audio.paused && !audio.ended;

    trackTitle.textContent = track.title;
    trackNumber.textContent =
      `Track ${String(state.trackIndex + 1).padStart(2, "0")} / ` +
      String(tracks.length).padStart(2, "0");

    elapsedTime.textContent = formatTime(audio.currentTime || 0);
    totalTime.textContent = formatTime(currentDuration());

    if (state.loading) {
      versionName.textContent = `${state.version} version · Loading…`;
    } else if (!state.available) {
      versionName.textContent = `${state.version} version · Coming soon`;
    } else {
      versionName.textContent = `${state.version} version`;
    }

    qualityBadge.textContent = qualityText[state.quality];
    playButton.textContent = isPlaying ? "Ⅱ" : "▶";
    playButton.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
    playButton.disabled = !state.available && !state.loading;
    playButton.style.opacity = playButton.disabled ? "0.45" : "1";
    playButton.style.cursor = playButton.disabled ? "not-allowed" : "pointer";

    waveform.classList.toggle("playing", isPlaying);
    coverWrap.classList.toggle("playing", isPlaying);

    updateOptionButtons();
    updateWaveformProgress();
    renderTrackList();
  }

  function clearAudio() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    state.available = false;
    state.loading = false;
    state.pendingTime = 0;
    state.pendingPlay = false;
  }

  function loadCurrentSource({ startTime = 0, autoplay = false } = {}) {
    const source = currentSource();

    if (!source) {
      clearAudio();
      updateDisplay();
      return;
    }

    state.available = true;
    state.loading = true;
    state.pendingTime = Math.max(0, startTime);
    state.pendingPlay = Boolean(autoplay);
    state.fallbackAttempted = false;

    audio.pause();
    audio.src = new URL(source, document.baseURI).href;
    audio.load();
    updateDisplay();
  }

  function togglePlayback() {
    if (!state.available) {
      return;
    }

    if (audio.paused) {
      audio.play().catch((error) => {
        console.error("SWN playback could not start:", error);
        updateDisplay();
      });
    } else {
      audio.pause();
    }
  }

  function loadTrack(index, autoplay) {
    const normalizedIndex =
      (index + tracks.length) % tracks.length;

    state.trackIndex = normalizedIndex;
    state.version = "Original";
    loadCurrentSource({ startTime: 0, autoplay });
  }

  function previousTrack() {
    if (state.available && audio.currentTime > 4) {
      audio.currentTime = 0;
      updateDisplay();
      return;
    }
    loadTrack(state.trackIndex - 1, !audio.paused);
  }

  function nextTrack() {
    loadTrack(state.trackIndex + 1, !audio.paused);
  }

  function seekToRatio(ratio) {
    if (!state.available || !Number.isFinite(audio.duration)) {
      return;
    }

    const clampedRatio = Math.min(1, Math.max(0, ratio));
    audio.currentTime = clampedRatio * audio.duration;
    updateDisplay();
  }

  function seekFromPointer(clientX) {
    const bounds = waveformShell.getBoundingClientRect();
    if (bounds.width <= 0) {
      return;
    }
    seekToRatio((clientX - bounds.left) / bounds.width);
  }

  playButton.addEventListener("click", togglePlayback);
  previousButton.addEventListener("click", previousTrack);
  nextButton.addEventListener("click", nextTrack);

  waveformShell.addEventListener("click", (event) => {
    seekFromPointer(event.clientX);
  });

  waveformShell.addEventListener("keydown", (event) => {
    if (!state.available) {
      return;
    }

    if (event.key === "ArrowRight") {
      audio.currentTime = Math.min(
        currentDuration(),
        audio.currentTime + 5
      );
      updateDisplay();
    }

    if (event.key === "ArrowLeft") {
      audio.currentTime = Math.max(0, audio.currentTime - 5);
      updateDisplay();
    }
  });

  versionOptions
    .querySelectorAll("[data-version]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const wasPlaying = !audio.paused;
        state.version = button.dataset.version;
        loadCurrentSource({ startTime: 0, autoplay: wasPlaying });
      });
    });

  qualityOptions
    .querySelectorAll(".option-button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        if (button.disabled) {
          return;
        }

        const qualityKey = button.dataset.qualityKey;
        if (!qualityKey || qualityKey === state.quality) {
          return;
        }

        const wasPlaying = !audio.paused;
        const savedTime = audio.currentTime || 0;
        state.quality = qualityKey;
        loadCurrentSource({
          startTime: savedTime,
          autoplay: wasPlaying
        });
      });
    });

  volumeControl.addEventListener("input", () => {
    audio.volume = Math.min(
      1,
      Math.max(0, Number(volumeControl.value) / 100)
    );
  });

  audio.addEventListener("loadedmetadata", () => {
    state.loading = false;

    try {
      audio.currentTime = Math.min(
        state.pendingTime,
        Math.max(0, audio.duration - 0.05)
      );
    } catch (error) {
      console.warn("SWN player could not restore playback position:", error);
    }

    const shouldPlay = state.pendingPlay;
    state.pendingPlay = false;
    state.pendingTime = 0;

    updateDisplay();

    if (shouldPlay) {
      audio.play().catch((error) => {
        console.error("SWN playback could not resume:", error);
        updateDisplay();
      });
    }
  });

  audio.addEventListener("timeupdate", updateDisplay);
    audio.addEventListener("play", () => {
      if (coverVideo) {
        coverVideo.play().catch(() => {});
      }
      updateDisplay();
    });

    audio.addEventListener("pause", () => {
      if (coverVideo) {
        coverVideo.pause();
      }
      updateDisplay();
    });

    audio.addEventListener("ended", () => {
      audio.currentTime = 0;

      if (coverVideo) {
        coverVideo.pause();
        coverVideo.currentTime = 0;
      }

      updateDisplay();
    });
  

  audio.addEventListener("error", () => {
    if (
      state.available &&
      state.quality === "lossless" &&
      !state.fallbackAttempted &&
      currentTrack().sources?.[state.version]?.standard
    ) {
      const savedTime = audio.currentTime || state.pendingTime || 0;
      const wasPlaying = state.pendingPlay || !audio.paused;
      state.fallbackAttempted = true;
      state.quality = "standard";
      loadCurrentSource({
        startTime: savedTime,
        autoplay: wasPlaying
      });
      return;
    }

    state.loading = false;
    state.available = false;
    updateDisplay();
  });

  configureQualityButtons();
  audio.volume = Math.min(
    1,
    Math.max(0, Number(volumeControl.value) / 100)
  );
  loadCurrentSource({ startTime: 0, autoplay: false });
})();
