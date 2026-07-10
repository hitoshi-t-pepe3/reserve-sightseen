import { HotelBasicInfo, SearchContext } from "@/lib/api";

export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  // チャット中にバックエンドのツールが検索したホテル。カード表示に使う。
  hotels?: HotelBasicInfo[];
  // ホテル検索時の条件（予約URLの日付・人数プリセットに使う）
  searchContext?: SearchContext;
}

export interface ChatRequest {
  message: string;
  conversationHistory: Message[];
}

export interface ChatResponse {
  message: string;
  toolsUsed?: string[];
}