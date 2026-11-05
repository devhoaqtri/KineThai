/**
 * The page a challenge link opens: a word held back as a mystery, with a box to
 * guess it.
 *
 * The point of the whole feature is that the LINK gives nothing away, so nothing
 * here may either until the reader has had a go: the answer is not in the heading,
 * the URL, or the page metadata (see the route's head — a link preview that
 * printed the word would end the game in the chat thread).
 *
 * Exports: ChallengePage
 * Depends on: router, useServedWord, answerPattern, vocabulary.css
 */

import { Link, useParams } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { useServedWord } from "../hooks/useServedWord";
import { MarkedText } from "./MarkedText";
import "../vocabulary.css";

/** Compare a guess the way a person means it: case and spacing do not count. */
function matches(guess: string, answer: string): boolean {
  const tidy = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  return tidy(guess) === tidy(answer);
}

/**
 * Guess-the-word page for a shared code.
 * @returns The mystery, or a "code not found" state.
 */
export function ChallengePage(): React.ReactElement {
  const { code = "" } = useParams({ strict: false }) as { code?: string };
  const lookup = useMemo(() => (code ? { code } : null), [code]);
  const { word: served } = useServedWord(lookup);
  const word = code ? served : null;
  const [guess, setGuess] = useState("");
  const [wrong, setWrong] = useState(0);
  const [solved, setSolved] = useState(false);

  if (word === undefined) {
    return (
      <main className="vocabulary-shell vocab-challenge-shell" aria-busy="true">
        <div className="vocab-challenge-card">
          <p className="vocab-challenge-eyebrow">Đang tải câu đố…</p>
        </div>
      </main>
    );
  }

  if (!word) {
    return (
      <main className="vocabulary-shell vocab-challenge-shell">
        <div className="vocab-challenge-card">
          <h1 className="vocab-challenge-title">Không tìm thấy từ này</h1>
          <p className="vocab-challenge-body">
            Mã <strong>{code.toUpperCase()}</strong> không còn trong kho từ. Có thể bạn chép thiếu
            một ký tự, hoặc từ đó đã được thay.
          </p>
          <Link className="vocab-light-button" to="/feed">
            Mở luồng từ vựng
          </Link>
        </div>
      </main>
    );
  }

  const letters = word.word.replace(/[^\p{L}]/gu, "").length;
  const initial = word.word[0]?.toUpperCase() ?? "";

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!word || solved) return;
    if (matches(guess, word.word)) setSolved(true);
    else setWrong((count) => count + 1);
  }

  return (
    <main className="vocabulary-shell vocab-challenge-shell">
      <div className="vocab-challenge-card">
        <p className="vocab-challenge-eyebrow">Bạn bè thách bạn đoán từ này</p>

        {/* The clue, never the answer. */}
        {/* MarkedText, like the definition below: the deck's /…/ marks must never
            reach a reader as literal slashes. */}
        {word.leadVi && (
          <p className="vocab-challenge-clue">
            <MarkedText text={word.leadVi} />
          </p>
        )}
        <p className="vocab-challenge-hint">
          Gồm <strong>{letters}</strong> chữ cái, bắt đầu bằng <strong>{initial}</strong>
        </p>

        {solved ? (
          <div className="vocab-challenge-answer">
            <h1 className="vocab-challenge-word" lang="en">
              {word.word}
            </h1>
            {word.ipa && (
              <p className="vocab-challenge-ipa" lang="en">
                {word.ipa}
              </p>
            )}
            <p className="vocab-challenge-def" lang="vi">
              <MarkedText text={word.defVi} />
            </p>
            <p className="vocab-challenge-body">
              Đoán đúng rồi! Giờ tới lượt bạn thách người khác.
            </p>
            <Link className="vocab-light-button" to="/feed">
              Học thêm từ mới
            </Link>
          </div>
        ) : (
          <form className="vocab-challenge-form" onSubmit={onSubmit}>
            <label className="sr-only" htmlFor="vocab-guess">
              Từ bạn đoán
            </label>
            <input
              id="vocab-guess"
              className="vocab-challenge-input"
              value={guess}
              onChange={(event) => setGuess(event.target.value)}
              placeholder="Đoán thử xem…"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              lang="en"
            />
            <button className="vocab-challenge-send" type="submit" aria-label="Gửi câu trả lời">
              <Send size={17} />
            </button>
            {wrong > 0 && (
              <p className="vocab-challenge-wrong" role="status">
                Chưa đúng — thử lại nha ({wrong} lần)
              </p>
            )}
          </form>
        )}

        <Link className="vocab-challenge-back" to="/feed">
          <ArrowLeft size={15} aria-hidden="true" />
          Về luồng từ vựng
        </Link>
      </div>
    </main>
  );
}
