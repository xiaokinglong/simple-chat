import { NextRequest, NextResponse } from "next/server";

import { ChatRequestSchema, ChatCompletionChunkSchema } from "@/lib/schemas";

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

    console.log(
      parsed.data.messages.map(({ role, content }) => ({
        role,
        content,
      })),
    );
    // 开始调用大模型的接口  这里使用的是 ollama本地跑的模型
    const LLMReuslt = await fetch(
      "http://localhost:11434/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen2.5:14b",
          messages: parsed.data.messages.map(({ role, content }) => ({
            role,
            content,
          })),
          stream: true, // 开启流
        }),
        signal: req.signal, // 前端关掉页面，后端也停掉 Ollama
      },
    );

    // 容错处理
    if (!LLMReuslt.ok || !LLMReuslt.body) {
      return NextResponse.json({
        status: LLMReuslt.status,
        message: await LLMReuslt.text(),
      });
    }

    // 可以直接透传不用解析
    // 处理大模型返回的流
    const stream = new ReadableStream({
      async start(controller) {
        const reader = LLMReuslt.body!.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buf: string = "";
        try {
          // 循环解析 chunk
          while (true) {
            const { done, value } = await reader.read();
            // 完成跳出循环
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const parts = buf.split("\n\n");
            buf = parts.pop() ?? "";
            for (const part of parts) {
              const line = part.trim();
              if (!line.startsWith("data:")) continue;
              // 去除 data:
              const data = line.slice(5).trim();
              if (data === "[DONE]") {
                controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                continue;
              }
              const chunk = ChatCompletionChunkSchema.safeParse(
                JSON.parse(data),
              );
              if (!chunk.success) {
                continue;
              }

              // 重新写入流
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(chunk.data)}\n\n`),
              );
            }
          }
        } catch (e) {
          console.log(e);
        } finally {
          controller.close();
        }
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
    return NextResponse.json({
      status: 200,
      message: "ai",
    });
  } catch (e) {
    return NextResponse.json({
      message: e,
      status: 500,
    });
  }
}
