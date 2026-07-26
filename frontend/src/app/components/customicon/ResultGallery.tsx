import { Download, ExternalLink } from "lucide-react";
import { resolveFileUrl } from "../../utils/api";

interface IconResult {
  name: string;
  index: number;
  url: string;
  size: string;
}

interface ResultGalleryProps {
  jobId: string;
  spriteSheetUrl: string;
  icons: IconResult[];
}

export function ResultGallery({
  jobId,
  spriteSheetUrl,
  icons,
}: ResultGalleryProps) {
  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(resolveFileUrl(url));
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const handleDownloadAll = async () => {
    for (const icon of icons) {
      await handleDownload(icon.url, `${icon.name}.png`);
      // 브라우저 다운로드 사이 약간의 딜레이
      await new Promise((r) => setTimeout(r, 300));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
          Generated Icons ({icons.length})
        </label>
        <button
          onClick={handleDownloadAll}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-bridge-accent text-white
            rounded-lg hover:bg-bridge-accent/90 transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          Download All
        </button>
      </div>

      {/* Sprite Sheet Preview */}
      <div className="p-3 bg-white/5 rounded-xl border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500 uppercase tracking-wider">
            Sprite Sheet
          </span>
          <button
            onClick={() => handleDownload(spriteSheetUrl, "sprite-sheet.png")}
            className="text-slate-500 hover:text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
        <img
          src={resolveFileUrl(spriteSheetUrl)}
          alt="Sprite Sheet"
          className="w-full rounded-lg bg-white/5"
        />
      </div>

      {/* Individual Icons Grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {icons.map((icon) => (
          <div
            key={icon.index}
            className="group relative flex flex-col items-center gap-1.5 p-3 bg-white/5
              rounded-xl border border-white/10 hover:border-white/20 transition-all"
          >
            <div className="relative w-full aspect-square rounded-lg bg-white/5 overflow-hidden">
              <img
                src={resolveFileUrl(icon.url)}
                alt={icon.name}
                className="w-full h-full object-contain p-1"
              />
              <button
                onClick={() => handleDownload(icon.url, `${icon.name}.png`)}
                className="absolute inset-0 flex items-center justify-center bg-black/50
                  opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Download className="w-5 h-5 text-white" />
              </button>
            </div>
            <span className="text-xs text-slate-400 truncate w-full text-center">
              {icon.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
