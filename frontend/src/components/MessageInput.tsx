"use client";

import { useEffect, useRef, useState, FormEvent, KeyboardEvent } from "react";

interface MessageInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

// Web Speech API（ブラウザ内蔵の音声認識）。Chrome/Edge/Android は SpeechRecognition
// または webkitSpeechRecognition が使える。非対応ブラウザではボタン自体を出さない
// （iOS はキーボードのマイクで音声入力できるため問題ない）。
function getSpeechRecognition(): (new () => any) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function MessageInput({
  onSend,
  disabled = false,
  placeholder = "メッセージを入力... (Enterで送信、Shift+Enterで改行)",
}: MessageInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  // 認識開始時点の入力値。認識結果はこれに追記する形で反映する
  const baseValueRef = useRef("");

  useEffect(() => {
    setSpeechSupported(!!getSpeechRecognition());
    return () => {
      recognitionRef.current?.abort?.();
    };
  }, []);

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop?.();
      return;
    }
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.interimResults = true;
    recognition.continuous = false;

    baseValueRef.current = value ? value + " " : "";

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setValue(baseValueRef.current + transcript);
    };
    recognition.onend = () => {
      setListening(false);
      textareaRef.current?.focus();
    };
    recognition.onerror = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none min-h-[48px] max-h-[150px]"
          style={{ lineHeight: "1.5" }}
        />
        {speechSupported && (
          <button
            type="button"
            onClick={toggleListening}
            disabled={disabled}
            title={listening ? "音声入力を停止" : "音声で入力"}
            className={`px-4 py-3 rounded-xl transition-colors flex items-center justify-center min-w-[48px] ${
              listening
                ? "bg-red-600 text-white animate-pulse"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
          </button>
        )}
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center min-w-[48px]"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </div>
    </form>
  );
}