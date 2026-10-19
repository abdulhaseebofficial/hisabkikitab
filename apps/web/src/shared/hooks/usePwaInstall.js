import { useState, useEffect, useCallback } from 'react';

let globalPrompt = null;
const listeners = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    globalPrompt = event;
    listeners.forEach((listener) => listener(globalPrompt));
  });

  window.addEventListener('appinstalled', () => {
    globalPrompt = null;
    listeners.forEach((listener) => listener(null));
  });
}

function checkIsInstalled() {
  if (typeof window === 'undefined') return false;
  const standaloneMedia = typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)').matches : false;
  return Boolean(
    standaloneMedia ||
    window.navigator.standalone === true ||
    (document.referrer && document.referrer.includes('android-app://'))
  );
}

function checkIsIos() {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
}

export default function usePwaInstall() {
  const [prompt, setPrompt] = useState(globalPrompt);
  const [isInstalled, setIsInstalled] = useState(checkIsInstalled());
  const [modalOpen, setModalOpen] = useState(false);
  const isIos = checkIsIos();

  useEffect(() => {
    const handlePromptChange = (newPrompt) => {
      setPrompt(newPrompt);
      setIsInstalled(checkIsInstalled());
    };

    listeners.add(handlePromptChange);

    const handleMediaChange = () => {
      setIsInstalled(checkIsInstalled());
    };

    const mediaQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)') : null;
    if (mediaQuery && mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
    }

    return () => {
      listeners.delete(handlePromptChange);
      if (mediaQuery && mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange);
      }
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (prompt) {
      prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        globalPrompt = null;
        setPrompt(null);
        setIsInstalled(true);
      }
      return choice ? choice.outcome : null;
    }
    // If native prompt is not available (e.g. iOS or manual browser), open guide modal
    setModalOpen(true);
    return 'modal_opened';
  }, [prompt]);

  return {
    canInstall: Boolean(prompt) || (isIos && !isInstalled),
    isPromptAvailable: Boolean(prompt),
    isInstalled,
    isIos,
    modalOpen,
    openModal: () => setModalOpen(true),
    closeModal: () => setModalOpen(false),
    triggerInstall,
  };
}
