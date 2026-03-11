import { CheckCircle2 } from "lucide-react";
import { Verse } from "../../data/bibleData";
import { useEffect, useRef } from "react";

interface ChapterViewProps {
  verses: Verse[];
  currentVerseNumber: number;
  completedVerses: number[];
}

export function ChapterView({ verses, currentVerseNumber, completedVerses }: ChapterViewProps) {
  const currentVerseRef = useRef<HTMLDivElement>(null);

  // 현재 구절로 자동 스크롤
  useEffect(() => {
    if (currentVerseRef.current) {
      currentVerseRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentVerseNumber]);

  return (
    <div className="max-h-[400px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
      {verses.map((verse) => {
        const isCompleted = completedVerses.includes(verse.verse);
        const isCurrent = verse.verse === currentVerseNumber;

        return (
          <div
            key={verse.verse}
            ref={isCurrent ? currentVerseRef : null}
            className={`flex gap-4 p-4 rounded-lg transition-all ${
              isCurrent
                ? "bg-blue-100 border-2 border-blue-400 shadow-md"
                : isCompleted
                ? "bg-green-50"
                : "bg-white"
            }`}
          >
            <div className="flex-shrink-0 w-8 flex items-start justify-center pt-1">
              {isCompleted ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <span
                  className={`text-sm font-semibold ${
                    isCurrent ? "text-blue-600" : "text-gray-400"
                  }`}
                >
                  {verse.verse}
                </span>
              )}
            </div>
            <div
              className={`flex-1 leading-relaxed ${
                isCurrent
                  ? "text-gray-900 font-medium"
                  : isCompleted
                  ? "text-gray-700"
                  : "text-gray-300"
              }`}
            >
              {verse.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
