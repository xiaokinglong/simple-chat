"use client";

import { useState, useEffect, useRef } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import Loading from "@/components/loading";
import ReasoningComponent from "@/components/Reasoning";

import {
  ChatMessageSchema,
  ChatCompletionChunkSchema,
  ReasoningEventSchema,
} from "@/lib/schemas";
import type {
  ChatMessageType,
  ChatRequestType,
  ChoicesType,
} from "@/lib/schemas";

// TODO: 全局控制思考是否折叠
const reasoningIsOpen = true;

export default function ChatPage() {
  // 这样第二轮问完，第一轮的思考还留在第一条 AI 气泡里，不会被清掉
  type DisplayMessage = ChatMessageType & {
    reasoning?: string; // 这条 AI 消息的思考全文
    thinkingSeconds?: number; // 这条想了几秒
    reasoningOpen?: boolean; // 这条的折叠开还是收，默认收起
  };

  const scrollRef = useRef<HTMLDivElement>(null);

  // TODO: 请求数据的Loading控制
  const [fetchLoading, setFetchLoading] = useState(false);

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [userMessage, setUserMessage] = useState<string>("帮我查询账单");

  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    // TODO: 滚动到底部
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // TODO: 发送消息的函数
  const handleSend = async () => {
    if (!userMessage.trim()) return;

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

  // TODO: 获取消息
  const fetchMessage = async (params: ChatRequestType) => {
    setFetchLoading(true);

    // TODO: 不将 ai 的思考内容在次喂给大模型
    const clean = params.messages.map(({ role, content }) => {
      return {
        role,
        content,
      };
    });

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: clean,
      }),
    });

    setFetchLoading(false);

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
        let obj: unknown;
        try {
          obj = JSON.parse(data);
        } catch {
          continue;
        }
        // TODO: 先处理 reasoning
        const reasoningParsed = ReasoningEventSchema.safeParse(obj);

        if (reasoningParsed.success) {
          if (reasoningParsed.data.type === "reasoning") {
            setIsThinking(true);
            if (reasoningParsed.data.content) {
              const piece = reasoningParsed.data.content;
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                copy[copy.length - 1] = {
                  ...last,
                  reasoning: (last.reasoning ?? "") + piece,
                  reasoningOpen: reasoningIsOpen,
                };
                return copy;
              });
            }
          } else {
            // TODO: 思考结束
            setIsThinking(false);
            const seconds = reasoningParsed.data.seconds ?? 0;
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = {
                ...last,
                thinkingSeconds: seconds,
                reasoningOpen: reasoningIsOpen,
              };
              return copy;
            });
          }
          continue;
        }

        // 使用zod 校验数据的类型
        const chunk = ChatCompletionChunkSchema.safeParse(obj);
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

  // TODO: 更新最新的文本
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
                    <div className="mt-1 text-sm wrap-break-word whitespace-pre-wrap">
                      {t?.content}
                    </div>
                  </div>
                );
              } else {
                const isLast = index === messages.length - 1;
                return (
                  <div
                    key={index}
                    className="mb-2 rounded border p-2 align-sub"
                  >
                    {fetchLoading && <Loading />}
                    <div className="relative right-0 h-6 w-6 rounded-2xl bg-gray-300 text-center text-sm leading-[24px]">
                      ai
                    </div>

                    {/* TODO: 渲染ReasoningComponent */}
                    {t.reasoning && (
                      <ReasoningComponent
                        reasoning={t.reasoning}
                        thinkingSeconds={t.thinkingSeconds}
                        isOpen={t.reasoningOpen}
                        isThinking={isLast && isThinking}
                        onToggle={() =>
                          setMessages((prev) => {
                            const copy = [...prev];
                            copy[index] = {
                              ...copy[index],
                              reasoningOpen: !copy[index].reasoningOpen,
                            };
                            return copy;
                          })
                        }
                      />
                    )}
                    <div className="mt-1 text-sm wrap-break-word whitespace-pre-wrap">
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
