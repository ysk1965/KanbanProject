import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, Trophy } from "lucide-react";
import { Button } from "../ui/button";

interface ChapterCompleteModalProps {
  show: boolean;
  book: string;
  chapter: number;
  onNext: () => void;
}

export function ChapterCompleteModal({ show, book, chapter, onNext }: ChapterCompleteModalProps) {
  const handleNext = () => {
    onNext();
  };

  return (
    <AnimatePresence>
      {show && (
        <>
          {/* 배경 오버레이 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={handleNext}
          />

          {/* 모달 */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4"
          >
            <div className="text-center space-y-6">
              {/* 아이콘 */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="flex justify-center"
              >
                <div className="relative">
                  <Trophy className="w-20 h-20 text-yellow-500" />
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.4 }}
                    className="absolute -top-2 -right-2"
                  >
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  </motion.div>
                </div>
              </motion.div>

              {/* 텍스트 */}
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-gray-800">축하합니다!</h2>
                <p className="text-lg text-gray-600">
                  <span className="font-semibold text-blue-600">
                    {book} {chapter}장
                  </span>
                  을 완성하셨습니다
                </p>
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">장 필사 완료</span>
                </div>
              </div>

              {/* 버튼 */}
              <Button
                onClick={handleNext}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-6 text-lg"
              >
                다음 장으로 계속하기
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
