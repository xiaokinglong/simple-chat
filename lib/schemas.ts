import { z } from "zod";

// 消息
export const ChatMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["assistant", "user"]),
  content: z.string(),
});

export type ChatMessageType = z.infer<typeof ChatMessageSchema>;

// 消息请求体
export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
});

export type ChatRequestType = z.infer<typeof ChatRequestSchema>;

export const DeltaSchema = z.object({
  role: z.enum(["assistant"]).optional(),
  content: z.string().nullable().optional(),
  reasoning_content: z.string().nullable().optional(),
});

export type DeltaType = z.infer<typeof DeltaSchema>;

export const ChoicesSchema = z.object({
  index: z.number().int(),
  delta: DeltaSchema,
  finish_reason: z.enum(["stop"]).nullable(),
});

export type ChoicesType = z.infer<typeof ChoicesSchema>;

export const ChatCompletionChunkSchema = z.object({
  id: z.string(),
  object: z.string(),
  created: z.number(),
  model: z.string(),
  choices: z.array(ChoicesSchema),
});
export type ChatCompletionChunkType = z.infer<typeof ChatCompletionChunkSchema>;
