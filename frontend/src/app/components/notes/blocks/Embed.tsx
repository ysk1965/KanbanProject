import { useState, useRef } from 'react';
import { createReactBlockSpec } from '@blocknote/react';

function getYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function getVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(\d+)/);
  return m ? m[1] : null;
}

function getEmbedType(url: string): 'youtube' | 'vimeo' | 'link' {
  if (getYouTubeId(url)) return 'youtube';
  if (getVimeoId(url)) return 'vimeo';
  return 'link';
}

function getEmbedUrl(url: string): string | null {
  const ytId = getYouTubeId(url);
  if (ytId) return `https://www.youtube.com/embed/${ytId}`;
  const vmId = getVimeoId(url);
  if (vmId) return `https://player.vimeo.com/video/${vmId}`;
  return null;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export const Embed = createReactBlockSpec(
  {
    type: 'embed' as const,
    propSchema: {
      url: { default: '' },
      caption: { default: '' },
    },
    content: 'none',
  },
  {
    render: (props) => {
      const url = (props.block.props as { url: string }).url;
      const caption = (props.block.props as { caption: string }).caption;
      const [inputValue, setInputValue] = useState('');
      const [isEditing, setIsEditing] = useState(!url);
      const inputRef = useRef<HTMLInputElement>(null);

      const handleSubmit = () => {
        const trimmed = inputValue.trim();
        if (!trimmed) return;

        let finalUrl = trimmed;
        if (!/^https?:\/\//i.test(finalUrl)) {
          finalUrl = 'https://' + finalUrl;
        }

        props.editor.updateBlock(props.block, {
          props: { url: finalUrl } as any,
        });
        setIsEditing(false);
      };

      if (isEditing || !url) {
        return (
          <div className="bn-embed bn-embed-input" contentEditable={false}>
            <div className="bn-embed-input-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </div>
            <input
              ref={inputRef}
              type="text"
              className="bn-embed-url-input"
              placeholder="Paste a link (YouTube, Vimeo, or any URL)..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              autoFocus
            />
            {inputValue.trim() && (
              <button className="bn-embed-submit" onClick={handleSubmit}>
                Embed
              </button>
            )}
          </div>
        );
      }

      const embedUrl = getEmbedUrl(url);
      const type = getEmbedType(url);

      if (embedUrl && (type === 'youtube' || type === 'vimeo')) {
        return (
          <div className="bn-embed bn-embed-video" contentEditable={false}>
            <div className="bn-embed-iframe-wrapper">
              <iframe
                src={embedUrl}
                title={caption || 'Embedded video'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="bn-embed-footer">
              <span className="bn-embed-domain">{getDomain(url)}</span>
              <button
                className="bn-embed-edit-btn"
                onClick={() => {
                  setInputValue(url);
                  setIsEditing(true);
                }}
              >
                Edit
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="bn-embed bn-embed-card" contentEditable={false}>
          <a href={url} target="_blank" rel="noopener noreferrer" className="bn-embed-card-link">
            <div className="bn-embed-card-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </div>
            <div className="bn-embed-card-body">
              <span className="bn-embed-card-url">{url}</span>
              <span className="bn-embed-card-domain">{getDomain(url)}</span>
            </div>
          </a>
          <button
            className="bn-embed-edit-btn"
            onClick={() => {
              setInputValue(url);
              setIsEditing(true);
            }}
          >
            Edit
          </button>
        </div>
      );
    },
    toExternalHTML: (props) => {
      const url = (props.block.props as { url: string }).url;
      if (!url) return <div data-block-type="embed" />;

      const embedUrl = getEmbedUrl(url);
      if (embedUrl) {
        return (
          <div data-block-type="embed" data-url={url}>
            <iframe src={embedUrl} title="Embedded content" />
          </div>
        );
      }

      return (
        <div data-block-type="embed" data-url={url}>
          <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
        </div>
      );
    },
    parse: (el) => {
      if (el.getAttribute('data-block-type') === 'embed') {
        return { url: el.getAttribute('data-url') || '' };
      }
      // Parse standalone iframes (YouTube embeds from other editors)
      if (el.tagName === 'IFRAME') {
        const src = el.getAttribute('src') || '';
        // Convert embed URLs back to watch URLs
        const ytMatch = src.match(/youtube\.com\/embed\/([^?]+)/);
        if (ytMatch) return { url: `https://www.youtube.com/watch?v=${ytMatch[1]}` };
        const vmMatch = src.match(/player\.vimeo\.com\/video\/(\d+)/);
        if (vmMatch) return { url: `https://vimeo.com/${vmMatch[1]}` };
        return { url: src };
      }
      return undefined;
    },
  }
);
