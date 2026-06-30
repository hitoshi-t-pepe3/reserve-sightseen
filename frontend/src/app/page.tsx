import { ChatWindow } from "@/components/ChatWindow";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        <ChatWindow />
      </div>
    </main>
  );
}