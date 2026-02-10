import { useEffect } from 'react';
import { Plyr, type PlyrProps } from 'plyr-react';
import { X } from 'lucide-react';

interface VideoLightboxProps {
  url: string;
  onClose: () => void;
}

const plyrOptions: PlyrProps['options'] = {
  controls: [
    'play-large',
    'rewind',
    'play',
    'fast-forward',
    'progress',
    'current-time',
    'duration',
    'mute',
    'volume',
    'settings',
    'fullscreen',
  ],
  seekTime: 10,
  speed: {
    selected: 1,
    options: [0.5, 0.75, 1, 1.25, 1.5, 2],
  },
  keyboard: {
    focused: true,
    global: true,
  },
  tooltips: {
    controls: true,
    seek: true,
  },
  autoplay: true,
};

export function VideoLightbox({ url, onClose }: VideoLightboxProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const plyrSource: PlyrProps['source'] = {
    type: 'video',
    sources: [{ src: url }],
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={e => e.stopPropagation()}
      onClick={e => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        onClick={e => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors z-10"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        className="w-full max-w-[90vw] max-h-[90vh] plyr-bridge-theme"
        onClick={e => e.stopPropagation()}
      >
        <Plyr source={plyrSource} options={plyrOptions} />
      </div>
    </div>
  );
}
