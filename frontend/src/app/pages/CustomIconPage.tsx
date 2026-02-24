import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Loader2 } from 'lucide-react';
import { ReferenceUpload } from '../components/customicon/ReferenceUpload';
import { StyleOptions, type StyleOptionsData } from '../components/customicon/StyleOptions';
import { IconNameInput } from '../components/customicon/IconNameInput';
import { ResultGallery } from '../components/customicon/ResultGallery';
import { customIconAPI } from '../utils/api';

type Step = 'upload' | 'configure' | 'generating' | 'result';

interface StyleAnalysis {
  style: string;
  stroke_weight: string;
  corner_radius: string;
  fill: string;
  detail: string;
  padding_ratio: number;
}

interface GenerateResult {
  job_id: string;
  sprite_sheet_url: string;
  icons: Array<{
    name: string;
    index: number;
    url: string;
    size: string;
  }>;
}

export function CustomIconPage() {
  const navigate = useNavigate();

  // State
  const [step, setStep] = useState<Step>('upload');
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [styleAnalysis, setStyleAnalysis] = useState<StyleAnalysis | null>(null);
  const [styleOptions, setStyleOptions] = useState<StyleOptionsData>({
    type: 'line',
    stroke_weight: 'medium',
    corner_radius: 'rounded',
    padding_ratio: 0.15,
    background: 'transparent',
  });
  const [iconNames, setIconNames] = useState<string[]>([]);
  const [layout, setLayout] = useState('4x4');
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Upload reference image
  const handleUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setError(null);
    try {
      // 로컬 blob URL로 미리보기 (서버 URL 대신 — 프로덕션에서 /uploads/ 미서빙)
      const localPreviewUrl = URL.createObjectURL(file);

      const data = await customIconAPI.uploadReference(file);
      setReferenceId(data.reference_id);
      setReferenceUrl(localPreviewUrl);

      // Auto-analyze style
      setIsAnalyzing(true);
      try {
        const analysis = await customIconAPI.analyzeStyle(data.reference_id);
        setStyleAnalysis(analysis);
        setStyleOptions((prev) => ({
          ...prev,
          type: analysis.style || prev.type,
          stroke_weight: analysis.stroke_weight || prev.stroke_weight,
          corner_radius: analysis.corner_radius || prev.corner_radius,
          padding_ratio: analysis.padding_ratio || prev.padding_ratio,
        }));
      } catch {
        // Style analysis failure is non-critical
        console.warn('Style analysis failed, using defaults');
      } finally {
        setIsAnalyzing(false);
      }

      setStep('configure');
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, []);

  // Generate icons
  const handleGenerate = useCallback(async () => {
    if (!referenceId || iconNames.length === 0) return;
    setStep('generating');
    setError(null);
    try {
      const data = await customIconAPI.generate({
        reference_id: referenceId,
        icon_names: iconNames,
        layout,
        style_options: {
          type: styleOptions.type,
          stroke_weight: styleOptions.stroke_weight,
          corner_radius: styleOptions.corner_radius,
          padding_ratio: styleOptions.padding_ratio,
          background: styleOptions.background,
          show_grid_lines: false,
        },
      });
      setResult(data);
      setStep('result');
    } catch (err: any) {
      setError(err?.message || 'Generation failed');
      setStep('configure');
    }
  }, [referenceId, iconNames, layout, styleOptions]);

  // Reset to start
  const handleReset = () => {
    setStep('upload');
    setReferenceId(null);
    setReferenceUrl(null);
    setStyleAnalysis(null);
    setStyleOptions({
      type: 'line',
      stroke_weight: 'medium',
      corner_radius: 'rounded',
      padding_ratio: 0.15,
      background: 'transparent',
    });
    setIconNames([]);
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-bridge-dark">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-bridge-obsidian border-b border-white/5 glass">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-bridge-accent" />
            <h1 className="font-serif font-bold text-white">Custom Icon Generator</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Step Indicator */}
        <div className="flex items-center gap-2">
          {(['upload', 'configure', 'result'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all
                  ${step === s || (step === 'generating' && s === 'configure')
                    ? 'bg-bridge-accent text-white'
                    : (step === 'result' || (step === 'configure' && s === 'upload'))
                      ? 'bg-bridge-accent/20 text-bridge-accent'
                      : 'bg-white/5 text-slate-600'}
                `}
              >
                {i + 1}
              </div>
              {i < 2 && (
                <div className={`w-8 h-px ${
                  (i === 0 && step !== 'upload') || (i === 1 && step === 'result')
                    ? 'bg-bridge-accent/50'
                    : 'bg-white/10'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Step: Upload */}
        {(step === 'upload' || step === 'configure' || step === 'generating') && (
          <ReferenceUpload
            referenceId={referenceId}
            referenceUrl={referenceUrl}
            onUpload={handleUpload}
            isUploading={isUploading}
          />
        )}

        {/* Analyzing indicator */}
        {isAnalyzing && (
          <div className="flex items-center gap-2 p-3 bg-bridge-accent/10 border border-bridge-accent/20 rounded-xl">
            <Loader2 className="w-4 h-4 text-bridge-accent animate-spin" />
            <span className="text-sm text-bridge-accent">Analyzing reference style...</span>
          </div>
        )}

        {/* Step: Configure */}
        {step === 'configure' && (
          <>
            <StyleOptions
              options={styleOptions}
              onChange={setStyleOptions}
              analysisResult={styleAnalysis}
            />

            <IconNameInput
              names={iconNames}
              onChange={setIconNames}
              layout={layout}
              onLayoutChange={setLayout}
            />

            <button
              onClick={handleGenerate}
              disabled={iconNames.length === 0}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-bridge-accent text-white
                rounded-xl font-bold hover:bg-bridge-accent/90
                hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4" />
              Generate Icons
            </button>
          </>
        )}

        {/* Step: Generating */}
        {step === 'generating' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-bridge-accent/10 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-bridge-accent animate-pulse" />
              </div>
              <div className="absolute inset-0 rounded-2xl border-2 border-bridge-accent/30 animate-ping" />
            </div>
            <div className="text-center">
              <p className="text-white font-bold">Generating icons...</p>
              <p className="text-sm text-slate-500 mt-1">This may take 15-30 seconds</p>
            </div>
          </div>
        )}

        {/* Step: Result */}
        {step === 'result' && result && (
          <>
            <ResultGallery
              jobId={result.job_id}
              spriteSheetUrl={result.sprite_sheet_url}
              icons={result.icons}
            />

            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="flex-1 px-6 py-3 bg-white/5 border border-white/10 text-white rounded-xl
                  hover:bg-white/10 transition-all"
              >
                Start Over
              </button>
              <button
                onClick={() => {
                  setStep('configure');
                  setResult(null);
                }}
                className="flex-1 px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold
                  hover:bg-bridge-accent/90 transition-all"
              >
                Regenerate
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default CustomIconPage;
