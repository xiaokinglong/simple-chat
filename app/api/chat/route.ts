import { NextRequest, NextResponse } from "next/server";

import { ChatRequestSchema, ChatCompletionChunkSchema } from "@/lib/schemas";

import { ThinkSplitter } from "@/lib/thinking";

const MODEL = "qwen3:14b";

export async function POST(req: NextRequest) {
  try {
    // 获取client的参数
    const body = await req.json();
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        status: 400,
        message: "参数不对",
        error: parsed.error.issues,
      });
    }

    const history = parsed.data.messages.map(({ role, content }) => {
      return { role, content };
    });

    const messages = [{ role: "system", content: "你是AI助手" }, ...history];

    const stream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();

        // 拆 <think> 用的，一个请求只建一个，别每片新建
        const splitter = new ThinkSplitter();
        // 计算think的时间
        let thinkingStartAt = 0;
        let isThinking = false;

        // TODO: 请求大模型
        const res = await fetch("http://localhost:11434/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            messages,
            stream: true,
          }),
          signal: req.signal,
        });

        if (!res.ok || !res.body) {
          controller.error(new Error(`Ollama ${res.status}`));
          return;
        }

        const reader = res.body.getReader();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") break;
            // TODO: 使用zod 校验数据

            const chunk = ChatCompletionChunkSchema.safeParse(JSON.parse(data));
            if (!chunk.success) continue;
            const delta = chunk.data.choices[0]?.delta;
            if (!delta) continue;

            // TODO: 开始处理 Think
            const reasoningText =
              delta.reasoning ?? delta.reasoning_content ?? "";

            // TODO: 把模型的思考,推给前端
            if (reasoningText) {
              if (!isThinking) {
                isThinking = true;
                thinkingStartAt = Date.now();
              }
              // 写入流
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "reasoning", content: reasoningText })}\n\n`,
                ),
              );
            }

            const text = delta.content ?? "";
            // TODO: 模型思考结束
            if (text && isThinking && !reasoningText) {
              isThinking = false;
              const seconds = Math.max(
                0,
                (Date.now() - thinkingStartAt) / 1000,
              );

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "reasoning_done", seconds: Number(seconds.toFixed(1)) })}\n\n`,
                ),
              );
            }

            if (!text) continue;

            // TODO: 兜底处理：万一某版本又把 <think> 塞回 content，才走 ThinkSplitter；正常 Ollama /v1 这里 text 已是纯回答
            const r = splitter.feed(text);

            if (r.thinkStarted && !isThinking) {
              isThinking = true;
              thinkingStartAt = Date.now();
            }

            // 有思考文字：发 reasoning 事件，前端拼到折叠里，不拼进气泡
            if (r.reasoning) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "reasoning", content: r.reasoning })}\n\n`,
                ),
              );
            }

            if (r.thinkEnded && isThinking) {
              isThinking = false;
              const seconds = Math.max(
                0,
                (Date.now() - thinkingStartAt) / 1000,
              );
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "reasoning_done", seconds: Number(seconds.toFixed(1)) })}\n\n`,
                ),
              );
            }

            // 有回答文字：按原来的聊天片原样发，前端拼到气泡里
            if (r.answer) {
              const answerChunk = {
                ...chunk.data,
                choices: [
                  {
                    index: 0,
                    delta: { role: "assistant", content: r.answer },
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(answerChunk)}\n\n`),
              );
            }
          }
        }

        // 流结束了，把 splitter 里剩下的半截也吐出来，别丢最后一句话
        const tail = splitter.flush();
        if (tail.reasoning) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "reasoning", content: tail.reasoning })}\n\n`,
            ),
          );
        }

        if (tail.answer) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                id: "chatcmpl-local",
                object: "chat.completion.chunk",
                model: MODEL,
                choices: [
                  {
                    index: 0,
                    delta: { role: "assistant", content: tail.answer },
                    finish_reason: null,
                  },
                ],
              })}\n\n`,
            ),
          );
        }

        // 如果思考到最后都没出 </think>（模型截断了），也要补一个 reasoning_done，不然前端一直显示“思考中...”
        if (isThinking) {
          const seconds = Math.max(0, (Date.now() - thinkingStartAt) / 1000);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "reasoning_done", seconds: Number(seconds.toFixed(1)) })}\n\n`,
            ),
          );
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return NextResponse.json({
      message: e,
      status: 500,
    });
  }
}
