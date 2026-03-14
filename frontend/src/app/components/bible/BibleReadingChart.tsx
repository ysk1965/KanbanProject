import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { CheckCircle2, Share2, MessageCircle, Link, Trophy } from "lucide-react";
import { Book } from "../../data/bibleData";

interface CompletedChapter {
  book: string;
  chapter: number;
  completedAt: number;
}

interface BibleReadingChartProps {
  books: Book[];
  completedChapters: CompletedChapter[];
}

export function BibleReadingChart({ books, completedChapters }: BibleReadingChartProps) {
  const isChapterCompleted = (bookName: string, chapterNumber: number) => {
    return completedChapters.some(
      (c) => c.book === bookName && c.chapter === chapterNumber
    );
  };

  const totalChapters = books.reduce((sum, book) => sum + book.chapters.length, 0);
  const completedCount = completedChapters.length;
  const progress = totalChapters > 0 ? (completedCount / totalChapters) * 100 : 0;
  const isAllCompleted = completedCount === totalChapters && totalChapters > 0;

  // 완료된 책 이름들
  const completedBookNames = books
    .filter((book) =>
      book.chapters.every((ch) => isChapterCompleted(book.name, ch.chapter))
    )
    .map((book) => book.name)
    .join(", ");

  const shareMessage = `${completedBookNames || books.map(b => b.name).join(", ")} 타자 성경 통독 완료!\n온라인으로 성경을 타이핑하며 통독했습니다.\n\n`;
  const siteUrl = window.location.href;

  const handleShareKakao = () => {
    if (navigator.share) {
      navigator.share({
        title: "성경 타자 통독 완료!",
        text: shareMessage,
        url: siteUrl,
      });
    } else {
      const text = encodeURIComponent(shareMessage + siteUrl);
      window.open(`https://story.kakao.com/share?url=${encodeURIComponent(siteUrl)}&text=${text}`, "_blank");
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareMessage + siteUrl);
      alert("링크가 복사되었습니다!");
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = shareMessage + siteUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      alert("링크가 복사되었습니다!");
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-bold mb-3 text-gray-800">성경 필사표</h3>
          <div className="text-sm text-gray-600 mb-3">
            전체 진행률: {completedCount} / {totalChapters} 장
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
            <div
              className="bg-gradient-to-r from-green-500 to-green-600 rounded-full h-3 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-right text-sm font-bold text-green-600">
            {Math.round(progress)}%
          </div>
        </div>

        <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
          {books.map((book) => {
            const bookCompletedCount = book.chapters.filter((ch) =>
              isChapterCompleted(book.name, ch.chapter)
            ).length;
            const bookProgress = (bookCompletedCount / book.chapters.length) * 100;

            return (
              <div key={book.name} className="space-y-3 pb-4 border-b border-gray-200 last:border-b-0">
                {/* 책 제목 및 진행률 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-lg text-gray-800">{book.name}</h4>
                    <span className="text-sm text-gray-600">
                      {bookCompletedCount}/{book.chapters.length}장
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 rounded-full h-2 transition-all duration-300"
                      style={{ width: `${bookProgress}%` }}
                    />
                  </div>
                </div>

                {/* 장 번호 그리드 */}
                <div className="grid grid-cols-10 gap-2">
                  {book.chapters.map((chapter) => {
                    const completed = isChapterCompleted(book.name, chapter.chapter);
                    return (
                      <div
                        key={chapter.chapter}
                        className={`relative aspect-square flex items-center justify-center rounded-md border-2 transition-all font-medium ${
                          completed
                            ? "bg-green-500 border-green-600 text-white shadow-md"
                            : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                        }`}
                      >
                        {completed && (
                          <CheckCircle2 className="w-3 h-3 absolute -top-1 -right-1 text-green-600 bg-white rounded-full" />
                        )}
                        <span className="text-sm">{chapter.chapter}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* 공유하기 버튼 */}
        <div className={`pt-4 border-t border-gray-200 ${isAllCompleted ? "" : "opacity-50"}`}>
          {isAllCompleted ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-green-600">
                <Trophy className="w-6 h-6" />
                <span className="font-bold text-lg">축하합니다! 통독을 완료했습니다!</span>
              </div>
              <p className="text-center text-sm text-gray-500 mb-3">
                완료 소식을 공유해보세요
              </p>
              <div className="flex justify-center gap-3">
                <Button
                  onClick={handleShareKakao}
                  className="bg-yellow-400 hover:bg-yellow-500 text-yellow-900"
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  카카오톡 공유
                </Button>
                <Button
                  onClick={handleCopyLink}
                  variant="outline"
                >
                  <Link className="w-4 h-4 mr-2" />
                  링크 복사
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-gray-400">
                <Share2 className="w-5 h-5" />
                <span className="font-medium">공유하기</span>
              </div>
              <p className="text-sm text-gray-400">
                모든 장을 완료하면 공유할 수 있습니다
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
