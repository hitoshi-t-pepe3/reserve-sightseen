"use client";

import { Fragment } from "react";
import { Message } from "@/types/chat";

interface MessageBubbleProps {
  message: Message;
}

// [表示テキスト](URL) 形式の Markdown リンクのみを検出してクリック可能な <a> に変換する。
// 本格的な Markdown レンダラーは不要な用途（ホテル詳細メッセージの1リンクのみ等）のため、
// react-markdown 等の依存追加は避け、正規表現ベースの軽量パーサーで対応する。
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function renderMessageContent(content: string) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  MARKDOWN_LINK_PATTERN.lastIndex = 0;
  while ((match = MARKDOWN_LINK_PATTERN.exec(content)) !== null) {
    const [fullMatch, linkText, url] = match;
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={key++}>{content.slice(lastIndex, match.index)}</Fragment>
      );
    }
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
    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < content.length) {
    nodes.push(<Fragment key={key++}>{content.slice(lastIndex)}</Fragment>);
  }

  return nodes;
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
