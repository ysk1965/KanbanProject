import { useState, useRef, useEffect } from "react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { RotateCcw } from "lucide-react";

interface TypingInputProps {
  targetText: string;
  verseNumber: number;
  onComplete: () => void;
}

export function TypingInput({ targetText, verseNumber, onComplete }: TypingInputProps) {
  const [userInput, setUserInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setUserInput("");
    inputRef.current?.focus();
  }, [verseNumber]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const input = e.target.value;

    // 타겟 텍스트보다 긴 입력 방지
    if (input.length > targetText.length) {
      return;
    }

    setUserInput(input);

    // 완료 체크 - 모든 글자가 정확히 일치해야 함
    if (input.length === targetText.length && input === targetText) {
      setTimeout(() => {
        onComplete();
      }, 300);
    }
  };

  const handleReset = () => {
    setUserInput("");
    inputRef.current?.focus();
  };

  const getDisplayText = () => {
    return targetText.split("").map((char, index) => {
      if (index < userInput.length) {
        const isCorrect = userInput[index] === char;
        return (
          <span
            key={index}
            className={isCorrect ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50 line-through"}
          >
            {char}
          </span>
        );
      }
      if (index === userInput.length) {
        // 현재 입력할 글자 강조
        return (
          <span key={index} className="text-gray-900 bg-yellow-200 font-bold">
            {char}
          </span>
        );
      }
      return (
        <span key={index} className="text-gray-400">
          {char}
        </span>
      );
    });
  };

  const progress = targetText.length > 0 ? (userInput.length / targetText.length) * 100 : 0;

  return (
    <Card className="p-6 sticky bottom-6 shadow-xl">
      <div className="space-y-4">
        {/* 미리보기 영역 */}
        <div className="bg-gray-50 p-4 rounded-lg border-2 border-gray-200">
          <div className="text-sm font-medium text-gray-600 mb-2">{verseNumber}절</div>
          <div className="text-lg leading-relaxed font-serif min-h-[60px]">
            {getDisplayText()}
          </div>
        </div>

        {/* 입력 영역 */}
        <div className="relative">
          <textarea
            ref={inputRef}
            value={userInput}
            onChange={handleInputChange}
            className="w-full h-24 p-4 text-lg leading-relaxed border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-serif resize-none"
            placeholder="여기에 위 구절을 입력하세요..."
            spellCheck={false}
          />
        </div>

        {/* 진행률 및 정보 */}
        <div className="flex items-center gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex justify-between text-sm text-gray-600">
              <span>진행률: {Math.round(progress)}%</span>
              <span>
                {userInput.length} / {targetText.length}자
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
