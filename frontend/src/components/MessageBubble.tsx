"use client";

import { Fragment } from "react";
import { Message } from "@/types/chat";

interface MessageBubbleProps {
  message: Message;
}

// Gemini の応答に含まれる最小限の Markdown（リンク・太字・見出し・箇条書き）だけを
// 正規表現で描画する。react-markdown 等の依存追加は避ける方針。
const INLINE_PATTERN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  INLINE_PATTERN.lastIndex = 0;
  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    const [fullMatch, boldText, linkText, url] = match;
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={key++}>{text.slice(lastIndex, match.index)}</Fragment>
      );
    }
    if (boldText !== undefined) {
      nodes.push(<strong key={key++}>{boldText}</strong>);
    } else {
      nodes.push(
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-blue-600 hover:text-blue-800 break-all"
        >
          {linkText}
        </a>
      );
    }
    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < text.length) {
    nodes.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);
  }

  return nodes;
}

function renderMessageContent(content: string) {
  return content.split("\n").map((line, i) => {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      return (
        <span key={i} className="block font-bold mt-2 mb-1">
          {renderInline(heading[1])}
        </span>
      );
    }
    const bullet = line.match(/^(\s*)[*-]\s+(.*)$/);
    if (bullet) {
      return (
        <span key={i} className="block">
          {bullet[1]}• {renderInline(bullet[2])}
        </span>
      );
    }
    return (
      <span key={i} className="block min-h-[1.25em]">
        {renderInline(line)}
      </span>
    );
  });
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}
    >
      <div
        className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
          isUser
            ? "bg-blue-600 text-white rounded-br-md"
            : "bg-gray-100 text-gray-900 rounded-bl-md"
        } ${message.isStreaming ? "animate-pulse" : ""}`}
      >
        <p className="whitespace-pre-wrap">{renderMessageContent(message.content)}</p>
        <span
          className={`text-xs mt-1 block text-right ${
            isUser ? "text-blue-100" : "text-gray-500"
          }`}
        >
          {message.timestamp.toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}
