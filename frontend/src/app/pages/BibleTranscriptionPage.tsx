import { useState, useEffect, useRef } from "react";
import { ChapterView } from "../components/bible/ChapterView";
import { TypingInput } from "../components/bible/TypingInput";
import { BibleReadingChart } from "../components/bible/BibleReadingChart";
import { ChapterCompleteModal } from "../components/bible/ChapterCompleteModal";
import { bibleBooks, Verse } from "../data/bibleData";
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Button } from "../components/ui/button";

interface CompletedVerse {
  book: string;
  chapter: number;
  verse: number;
  completedAt: number;
}

interface CompletedChapter {
  book: string;
  chapter: number;
  completedAt: number;
}

export default function BibleTranscriptionPage() {
  const [selectedBook, setSelectedBook] = useState(bibleBooks[0].name);
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [currentVerseNumber, setCurrentVerseNumber] = useState(1);
  const [completedVerses, setCompletedVerses] = useState<CompletedVerse[]>([]);
  const [completedChapters, setCompletedChapters] = useState<CompletedChapter[]>([]);
  const [showChapterComplete, setShowChapterComplete] = useState(false);
  const [showReadingChart, setShowReadingChart] = useState(false);
  const chapterButtonRefs = useRef<{ [key: number]: HTMLButtonElement | null }>({});

  // 선택된 장이 변경되면 해당 버튼으로 스크롤
  useEffect(() => {
    const button = chapterButtonRefs.current[selectedChapter];
    if (button) {
      button.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [selectedChapter]);

  // LocalStorage에서 진행 상황 불러오기
  useEffect(() => {
    const savedVerses = localStorage.getItem("bible-transcription-progress");
    if (savedVerses) {
      try {
        setCompletedVerses(JSON.parse(savedVerses));
      } catch (e) {
        console.error("Failed to load progress", e);
      }
    }

    const savedChapters = localStorage.getItem("bible-completed-chapters");
    if (savedChapters) {
      try {
        setCompletedChapters(JSON.parse(savedChapters));
      } catch (e) {
        console.error("Failed to load chapters", e);
      }
    }
  }, []);

  // 진행 상황 저장
  const saveProgress = (newCompleted: CompletedVerse[]) => {
    setCompletedVerses(newCompleted);
    localStorage.setItem("bible-transcription-progress", JSON.stringify(newCompleted));
  };

  const saveCompletedChapters = (newCompleted: CompletedChapter[]) => {
    setCompletedChapters(newCompleted);
    localStorage.setItem("bible-completed-chapters", JSON.stringify(newCompleted));
  };

  const currentBook = bibleBooks.find((book) => book.name === selectedBook);
  const currentChapter = currentBook?.chapters.find((ch) => ch.chapter === selectedChapter);
  const currentVerse = currentChapter?.verses.find((v) => v.verse === currentVerseNumber);

  // 현재 장에서 완료된 절 번호들
  const completedVersesInChapter = completedVerses
    .filter((v) => v.book === selectedBook && v.chapter === selectedChapter)
    .map((v) => v.verse);

  // 장이 완성되었는지 체크
  const isChapterComplete = (book: string, chapter: number) => {
    return completedChapters.some((c) => c.book === book && c.chapter === chapter);
  };

  const handleComplete = () => {
    const newCompleted: CompletedVerse = {
      book: selectedBook,
      chapter: selectedChapter,
      verse: currentVerseNumber,
      completedAt: Date.now(),
    };

    // 이미 완료된 절이 아닌 경우에만 추가
    const alreadyCompleted = completedVerses.some(
      (v) => v.book === selectedBook && v.chapter === selectedChapter && v.verse === currentVerseNumber
    );

    let updated = completedVerses;
    if (!alreadyCompleted) {
      updated = [...completedVerses, newCompleted];
      saveProgress(updated);
    }

    // 다음 절로 이동
    if (currentChapter) {
      const currentIndex = currentChapter.verses.findIndex((v) => v.verse === currentVerseNumber);
      if (currentIndex < currentChapter.verses.length - 1) {
        setCurrentVerseNumber(currentChapter.verses[currentIndex + 1].verse);
      } else {
        // 마지막 절이면 장 완성 체크
        checkChapterCompletion(updated);
      }
    }
  };

  const checkChapterCompletion = (allCompletedVerses: CompletedVerse[]) => {
    if (!currentChapter) return;

    // 현재 장의 모든 절이 완료되었는지 확인
    const allVersesCompleted = currentChapter.verses.every((verse) =>
      allCompletedVerses.some(
        (v) => v.book === selectedBook && v.chapter === selectedChapter && v.verse === verse.verse
      )
    );

    if (allVersesCompleted && !isChapterComplete(selectedBook, selectedChapter)) {
      // 장 완성!
      const newChapter: CompletedChapter = {
        book: selectedBook,
        chapter: selectedChapter,
        completedAt: Date.now(),
      };
      saveCompletedChapters([...completedChapters, newChapter]);
      setShowChapterComplete(true);
    }
  };

  const handleNextChapter = () => {
    setShowChapterComplete(false);

    // 다음 장으로 이동
    if (currentBook) {
      const currentChapterIndex = currentBook.chapters.findIndex((ch) => ch.chapter === selectedChapter);
      if (currentChapterIndex < currentBook.chapters.length - 1) {
        const nextChapter = currentBook.chapters[currentChapterIndex + 1];
        setSelectedChapter(nextChapter.chapter);
        // 완성되지 않은 첫 번째 절 찾기
        const firstIncompleteVerse = findFirstIncompleteVerse(selectedBook, nextChapter.chapter, nextChapter.verses);
        setCurrentVerseNumber(firstIncompleteVerse);
      } else {
        // 다음 책으로
        const currentBookIndex = bibleBooks.findIndex((b) => b.name === selectedBook);
        if (currentBookIndex < bibleBooks.length - 1) {
          const nextBook = bibleBooks[currentBookIndex + 1];
          setSelectedBook(nextBook.name);
          const firstChapter = nextBook.chapters[0];
          setSelectedChapter(firstChapter.chapter);
          const firstIncompleteVerse = findFirstIncompleteVerse(nextBook.name, firstChapter.chapter, firstChapter.verses);
          setCurrentVerseNumber(firstIncompleteVerse);
        }
      }
    }
  };

  const handleBookChange = (bookName: string) => {
    setSelectedBook(bookName);
    const newBook = bibleBooks.find((b) => b.name === bookName);
    if (newBook) {
      const firstChapter = newBook.chapters[0];
      setSelectedChapter(firstChapter.chapter);
      // 완성되지 않은 첫 번째 절 찾기
      const firstIncompleteVerse = findFirstIncompleteVerse(bookName, firstChapter.chapter, firstChapter.verses);
      setCurrentVerseNumber(firstIncompleteVerse);
    }
  };

  const handleChapterChange = (chapter: number) => {
    setSelectedChapter(chapter);
    const newChapter = currentBook?.chapters.find((ch) => ch.chapter === chapter);
    if (newChapter) {
      // 완성되지 않은 첫 번째 절 찾기
      const firstIncompleteVerse = findFirstIncompleteVerse(selectedBook, chapter, newChapter.verses);
      setCurrentVerseNumber(firstIncompleteVerse);
    }
  };

  const findFirstIncompleteVerse = (book: string, chapter: number, verses: Verse[]) => {
    for (const verse of verses) {
      const isCompleted = completedVerses.some(
        (v) => v.book === book && v.chapter === chapter && v.verse === verse.verse
      );
      if (!isCompleted) {
        return verse.verse;
      }
    }
    // 모두 완성된 경우 첫 번째 절 반환
    return verses[0].verse;
  };

  const totalVersesInChapter = currentChapter?.verses.length || 0;
  const completedCount = completedVersesInChapter.length;
  const chapterProgress = totalVersesInChapter > 0 ? (completedCount / totalVersesInChapter) * 100 : 0;
  const isCurrentChapterComplete = isChapterComplete(selectedBook, selectedChapter);

  // 이전/다음 장 존재 여부 확인
  const canGoPreviousChapter = () => {
    if (!currentBook) return false;
    const currentChapterIndex = currentBook.chapters.findIndex((ch) => ch.chapter === selectedChapter);
    if (currentChapterIndex > 0) return true;
    // 이전 책이 있는지 확인
    const currentBookIndex = bibleBooks.findIndex((b) => b.name === selectedBook);
    return currentBookIndex > 0;
  };

  const canGoNextChapter = () => {
    if (!currentBook) return false;
    const currentChapterIndex = currentBook.chapters.findIndex((ch) => ch.chapter === selectedChapter);
    if (currentChapterIndex < currentBook.chapters.length - 1) return true;
    // 다음 책이 있는지 확인
    const currentBookIndex = bibleBooks.findIndex((b) => b.name === selectedBook);
    return currentBookIndex < bibleBooks.length - 1;
  };

  const handlePreviousChapter = () => {
    if (!currentBook) return;
    const currentChapterIndex = currentBook.chapters.findIndex((ch) => ch.chapter === selectedChapter);

    if (currentChapterIndex > 0) {
      // 현재 책의 이전 장으로
      const prevChapter = currentBook.chapters[currentChapterIndex - 1];
      setSelectedChapter(prevChapter.chapter);
      const firstIncompleteVerse = findFirstIncompleteVerse(selectedBook, prevChapter.chapter, prevChapter.verses);
      setCurrentVerseNumber(firstIncompleteVerse);
    } else {
      // 이전 책의 마지막 장으로
      const currentBookIndex = bibleBooks.findIndex((b) => b.name === selectedBook);
      if (currentBookIndex > 0) {
        const prevBook = bibleBooks[currentBookIndex - 1];
        const lastChapter = prevBook.chapters[prevBook.chapters.length - 1];
        setSelectedBook(prevBook.name);
        setSelectedChapter(lastChapter.chapter);
        const firstIncompleteVerse = findFirstIncompleteVerse(prevBook.name, lastChapter.chapter, lastChapter.verses);
        setCurrentVerseNumber(firstIncompleteVerse);
      }
    }
  };

  const handleGoNextChapter = () => {
    if (!currentBook) return;
    const currentChapterIndex = currentBook.chapters.findIndex((ch) => ch.chapter === selectedChapter);

    if (currentChapterIndex < currentBook.chapters.length - 1) {
      // 현재 책의 다음 장으로
      const nextChapter = currentBook.chapters[currentChapterIndex + 1];
      setSelectedChapter(nextChapter.chapter);
      const firstIncompleteVerse = findFirstIncompleteVerse(selectedBook, nextChapter.chapter, nextChapter.verses);
      setCurrentVerseNumber(firstIncompleteVerse);
    } else {
      // 다음 책의 첫 장으로
      const currentBookIndex = bibleBooks.findIndex((b) => b.name === selectedBook);
      if (currentBookIndex < bibleBooks.length - 1) {
        const nextBook = bibleBooks[currentBookIndex + 1];
        const firstChapter = nextBook.chapters[0];
        setSelectedBook(nextBook.name);
        setSelectedChapter(firstChapter.chapter);
        const firstIncompleteVerse = findFirstIncompleteVerse(nextBook.name, firstChapter.chapter, firstChapter.verses);
        setCurrentVerseNumber(firstIncompleteVerse);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="max-w-5xl mx-auto space-y-4 p-4">
        {/* 페이지 타이틀 */}
        <div className="text-center py-6">
          <div className="inline-flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-4 rounded-2xl shadow-lg">
            <BookOpen className="w-8 h-8" />
            <h1 className="text-2xl font-bold tracking-wide">온라인 타자 성경 통독</h1>
          </div>
        </div>

        {/* 상단: 책 선택 + 필사표 버튼 */}
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-white rounded-lg shadow-sm p-4">
            {bibleBooks.length === 1 ? (
              // 성경이 하나뿐일 때 큰 제목으로 표시
              <div className="flex items-center justify-center py-2">
                <h1 className="text-2xl font-bold text-gray-800">{bibleBooks[0].name}</h1>
                {(() => {
                  const completedInBook = bibleBooks[0].chapters.filter((ch) =>
                    isChapterComplete(bibleBooks[0].name, ch.chapter)
                  ).length;
                  const totalInBook = bibleBooks[0].chapters.length;
                  return completedInBook > 0 ? (
                    <span className="ml-3 text-sm text-green-600 font-medium">
                      {completedInBook}/{totalInBook}장 완료
                    </span>
                  ) : null;
                })()}
              </div>
            ) : (
              // 성경이 여러 개일 때 탭으로 표시
              <Tabs value={selectedBook} onValueChange={handleBookChange}>
                <TabsList className={`grid w-full grid-cols-${bibleBooks.length}`}>
                  {bibleBooks.map((book) => {
                    const completedInBook = book.chapters.filter((ch) =>
                      isChapterComplete(book.name, ch.chapter)
                    ).length;
                    const totalInBook = book.chapters.length;
                    return (
                      <TabsTrigger key={book.name} value={book.name} className="relative">
                        {book.name}
                        {completedInBook > 0 && (
                          <span className="ml-2 text-xs text-green-600">
                            {completedInBook}/{totalInBook}
                          </span>
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>
            )}
          </div>

          <Button
            onClick={() => setShowReadingChart(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-6 shadow-sm"
          >
            <BookOpen className="w-5 h-5 mr-2" />
            성경 필사표
          </Button>
        </div>

        {/* 장 선택 (좌우 스크롤) */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {currentBook?.chapters.map((chapter) => {
              const completed = isChapterComplete(selectedBook, chapter.chapter);
              const isSelected = selectedChapter === chapter.chapter;
              return (
                <button
                  key={chapter.chapter}
                  ref={(el) => { chapterButtonRefs.current[chapter.chapter] = el; }}
                  onClick={() => handleChapterChange(chapter.chapter)}
                  className={`flex-shrink-0 px-6 py-3 rounded-lg font-semibold transition-all border-2 ${
                    isSelected
                      ? "bg-blue-500 text-white border-blue-600 shadow-md"
                      : completed
                      ? "bg-green-50 text-green-700 border-green-300 hover:bg-green-100"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {chapter.chapter}장
                    {completed && <CheckCircle2 className="w-4 h-4" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 메인: 장 제목 + 화살표 */}
        <div className="bg-gradient-to-r from-slate-100 to-blue-100 rounded-lg shadow-sm">
          <div className="flex items-center justify-between px-4 py-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePreviousChapter}
              disabled={!canGoPreviousChapter()}
              className="hover:bg-white/50"
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>

            <h2 className="text-2xl font-bold text-gray-800 flex-1 text-center">
              {selectedBook} {selectedChapter}장
            </h2>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleGoNextChapter}
              disabled={!canGoNextChapter()}
              className="hover:bg-white/50"
            >
              <ChevronRight className="w-6 h-6" />
            </Button>
          </div>
        </div>

        {/* 진행도 */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">
              진행률: {Math.round(chapterProgress)}%
            </span>
            <span className="text-sm font-medium text-gray-600">
              {completedCount} / {totalVersesInChapter}절
            </span>
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 ease-out"
              style={{ width: `${chapterProgress}%` }}
            />
          </div>
        </div>

        {/* 구절 목록 */}
        {currentChapter && (
          <ChapterView
            verses={currentChapter.verses}
            currentVerseNumber={currentVerseNumber}
            completedVerses={completedVersesInChapter}
          />
        )}

        {/* 타이핑 입력 영역 */}
        {isCurrentChapterComplete ? (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-12 shadow-sm border-2 border-green-200">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle2 className="w-16 h-16 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-green-800">모두 완성된 장입니다</h3>
              <p className="text-green-700">
                {selectedBook} {selectedChapter}장의 모든 절을 완성하셨습니다!
              </p>
            </div>
          </div>
        ) : (
          currentVerse && (
            <TypingInput
              targetText={currentVerse.text}
              verseNumber={currentVerse.verse}
              onComplete={handleComplete}
            />
          )
        )}

        {/* 성경 필사표 모달 */}
        {showReadingChart && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowReadingChart(false)}
            />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-4xl max-h-[90dvh] overflow-y-auto mx-4">
              <div className="bg-white rounded-xl shadow-2xl">
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
                  <h2 className="text-2xl font-bold text-gray-800">성경 필사표</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowReadingChart(false)}
                  >
                    <span className="text-2xl text-gray-500 hover:text-gray-700">×</span>
                  </Button>
                </div>
                <div className="p-6">
                  <BibleReadingChart
                    books={bibleBooks}
                    completedChapters={completedChapters}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* 장 완성 모달 */}
        <ChapterCompleteModal
          show={showChapterComplete}
          book={selectedBook}
          chapter={selectedChapter}
          onNext={handleNextChapter}
        />

        {/* 푸터 */}
        <footer className="mt-8 text-center text-xs text-gray-400">
          <p>Copyright © 2026 by Sungrak Church All Rights Reserved.</p>
        </footer>
      </div>
    </div>
  );
}
