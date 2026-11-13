"use client";

import { useState, useEffect, useRef } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { ChatMessageSchema, ChatCompletionChunkSchema } from "@/lib/schemas";
import type {
  ChatMessageType,
  ChatRequestType,
  ChoicesType,
} from "@/lib/schemas";

export default function ChatPage() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [userMessage, setUserMessage] = useState<string>("介绍下你自己");

  useEffect(() => {
    // 滚动
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // 发送消息的函数
  const handleSend = async () => {
    const user: ChatMessageType = {
      role: "user",
      content: userMessage,
    };

    const next = [...messages, user];

    setMessages([
      ...next,
      {
        // client端先生成一个想对话能ai回答 结构能先出来 因为请求需要时间的 提高用户的体验吧
        role: "assistant",
        content: "",
      },
    ]);
    // 清空使用输入的值
    setUserMessage("");

    // 当对话条数比较多时 只去 最后的10条数 因为大模型是不没有记忆的
    const multiterm = next.length > 10 ? next.slice(-10) : next;

    await fetchMessage({ messages: multiterm });
  };

  const fetchMessage = async (params: ChatRequestType) => {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok || !res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf: string = "";
    let full: string = "";

    // 循环解析
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const data: string = line.slice(5).trim();
        if (data === "[DONE]") continue;
        // 使用zod 校验数据的类型
        const chunk = ChatCompletionChunkSchema.safeParse(JSON.parse(data));
        if (!chunk.success) continue;
        const choice: ChoicesType = chunk.data.choices[0];
        if (choice?.delta.content) {
          full += choice.delta.content;
          updateText(full);
        }
        if (choice?.finish_reason === "stop") return;
      }
    }
  };

  // 更新最新的文本
  const updateText = (text: string) => {
    setMessages((prev) => {
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], content: text };
      return next;
    });
  };

  return (
    <div className="flex h-full flex-1 flex-col">
      <div
        className="scrollbar-hide m-6  flex-1 overflow-y-auto"
        ref={scrollRef}
      >
        {messages.length == 0 ? (
          <div className="text-center">开始你的对话吧</div>
        ) : (
          <div>
            {messages.map((t, index: number) => {
              if (t?.role == "user") {
                return (
                  <div
                    key={index}
                    className="mb-2 rounded border p-2 align-sub"
                  >
                    <div className="relative right-0 h-6 w-6 rounded-2xl bg-gray-300 text-center text-sm leading-[24px]">
                      你
                    </div>
                    <div className="mt-1 text-sm break-words whitespace-pre-wrap">
                      {t?.content}
                    </div>
                  </div>
                );
              } else {
                return (
                  <div
                    key={index}
                    className="mb-2 rounded border p-2 align-sub"
                  >
                    <div className="relative right-0 h-6 w-6 rounded-2xl bg-gray-300 text-center text-sm leading-[24px]">
                      ai
                    </div>
                    <div className="mt-1 text-sm break-words whitespace-pre-wrap">
                      {t?.content}
                    </div>
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>
      <div className="m-6 mt-0 flex gap-2 rounded-2xl border p-3">
        <Input
          value={userMessage}
          onChange={(e) => setUserMessage(e.target?.value)}
        ></Input>
        <Button onClick={handleSend}>发送</Button>
      </div>
    </div>
  );
}
