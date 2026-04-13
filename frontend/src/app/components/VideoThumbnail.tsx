import { useState } from 'react';
import { useVideoThumbnail } from '../hooks/useVideoThumbnail';
import { Film } from 'lucide-react';

interface VideoThumbnailProps {
  videoUrl: string;
  serverThumbnailUrl?: string | null;
  className?: string;
  alt?: string;
}

export function VideoThumbnail({ videoUrl, serverThumbnailUrl, className, alt }: VideoThumbnailProps) {
  const [serverFailed, setServerFailed] = useState(false);

  const effectiveServerUrl = serverFailed ? null : serverThumbnailUrl;

  const generatedThumbnail = useVideoThumbnail(
    videoUrl,
    !effectiveServerUrl
  );

  const thumbnailSrc = effectiveServerUrl || generatedThumbnail;

  if (thumbnailSrc) {
    return (
      <img
        src={thumbnailSrc}
        alt={alt || 'Video thumbnail'}
        className={className}
        loading="lazy"
        onError={() => {
          if (!serverFailed && serverThumbnailUrl) {
            setServerFailed(true);
          }
        }}
      />
    );
  }

  return (
    <div className={`bg-black/40 flex items-center justify-center ${className || ''}`}>
      <Film className="h-6 w-6 text-slate-400" />
    </div>
  );
}
