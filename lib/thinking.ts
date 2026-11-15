// TODO: Thinking

export type ThinkFeedResult = {
  reasoning: string; // 这一片里属于思考的部分（<think> 和 </think> 之间）
  answer: string; // 这一片里属于回答的部分（</think> 之后，或没有 <think> 时的全部）
  thinkStarted: boolean; // 这一片里刚出现 <think>，前端可以把折叠打开显示“思考中...”
  thinkEnded: boolean; // 这一片里刚出现 </think>，前端可以把折叠收起、显示“已思考 X 秒”
};

export class ThinkSplitter {
  private inThink = false; // 当前是不是在 <think> 里面
  private buf = ""; // 没处理完的尾巴，可能是半个标签，如 "<th"

  // 每次流式来一片就调一次，返回这一片拆出来的思考 + 回答
  feed(text: string): ThinkFeedResult {
    console.log("ThinkSplitter.fedd");
    const out: ThinkFeedResult = {
      reasoning: "",
      answer: "",
      thinkStarted: false,
      thinkEnded: false,
    };
    // 把上次留的尾巴和这次的新文字拼起来再处理
    this.buf += text;

    // 循环处理，直到 buf 里没有完整的 <think> 或 </think> 为止
    while (this.buf.length > 0) {
      if (!this.inThink) {
        // 不在思考里：找 <think>
        const idx = this.buf.indexOf("<think>");
        if (idx >= 0) {
          // <think> 之前是回答，先吐出来；<think> 之后进思考状态
          out.answer += this.buf.slice(0, idx);
          this.buf = this.buf.slice(idx + "<think>".length);
          this.inThink = true;
          out.thinkStarted = true;
          continue;
        }
        // 没找到 <think>：检查 buf 末尾是不是半个 "<think>"，如 "<"、"<t"、"<th"
        // 是的话先留着，等下一片拼完整再判断；不是的话整段都是回答，直接吐出来
        const tail = this.partialTagTail(this.buf, "<think>");
        if (tail.length > 0) {
          out.answer += this.buf.slice(0, this.buf.length - tail.length);
          this.buf = tail;
        } else {
          out.answer += this.buf;
          this.buf = "";
        }
        break;
      } else {
        // 在思考里：找 </think>
        const idx = this.buf.indexOf("</think>");
        if (idx >= 0) {
          // </think> 之前是思考，先吐出来；</think> 之后出思考状态
          out.reasoning += this.buf.slice(0, idx);
          this.buf = this.buf.slice(idx + "</think>".length);
          this.inThink = false;
          out.thinkEnded = true;
          continue;
        }
        // 没找到 </think>：检查末尾是不是半个 "</think>"，是就留着，不是就整段都是思考
        const tail = this.partialTagTail(this.buf, "</think>");
        if (tail.length > 0) {
          out.reasoning += this.buf.slice(0, this.buf.length - tail.length);
          this.buf = tail;
        } else {
          out.reasoning += this.buf;
          this.buf = "";
        }
        break;
      }
    }
    return out;
  }

  // 流结束时调一次：把 buf 里剩下的半截也吐出来，别丢了最后一句话
  flush(): ThinkFeedResult {
    console.log("ThinkSplitter.flush");
    const out: ThinkFeedResult = {
      reasoning: "",
      answer: "",
      thinkStarted: false,
      thinkEnded: false,
    };
    if (!this.buf) return out;
    if (this.inThink) out.reasoning = this.buf;
    else out.answer = this.buf;
    this.buf = "";
    return out;
  }

  // 判断字符串末尾是不是 tag 的前缀（半个标签），如 "<"、"<t"、"</th"
  private partialTagTail(s: string, tag: string): string {
    console.log("ThinkSplitter.partialTagTail");

    for (let len = Math.min(s.length, tag.length - 1); len > 0; len--) {
      const tail = s.slice(s.length - len);
      if (tag.startsWith(tail)) return tail;
    }
    return "";
  }
}
