import { Plyr, type PlyrProps } from 'plyr-react';
import { X } from 'lucide-react';
import { useEscClose } from '../hooks/useEscClose';

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
  useEscClose(true, onClose);

  const plyrSource: PlyrProps['source'] = {
    type: 'video',
    sources: [{ src: url }],
  };

  return (
    <div
      data-lightbox-overlay
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 pointer-events-auto"
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors z-10"
        aria-label="닫기"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        className="plyr-bridge-theme flex items-center justify-center max-w-[90vw] max-h-[90vh]"
        style={{ touchAction: 'manipulation' }}
      >
        <Plyr source={plyrSource} options={plyrOptions} />
      </div>
    </div>
  );
}
