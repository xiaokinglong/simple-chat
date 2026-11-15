// TODO: Reasoning 前端渲染组件
type ReasoningComponentProps = {
  reasoning?: string;
  thinkingSeconds?: number;
  isOpen?: boolean; // 开还是收，父组件说了算
  isThinking?: boolean; // 只有最后一条正在思考时 true
  searchKeywords?: string[]; // 可选，联网版才传
  sources?: { title: string; url: string }[]; // 可选，联网版才传
  onToggle: () => void;
};

export default function ReasoningComponent({
  reasoning,
  thinkingSeconds = 0,
  isOpen = false,
  isThinking = false,
  searchKeywords,
  sources,
  onToggle,
}: ReasoningComponentProps) {
  if (!reasoning && !searchKeywords?.length && !sources?.length) return null;
  return (
    <div className="mt-2 rounded border bg-gray-50 p-3 text-sm">
      <button className="font-medium text-gray-600" onClick={onToggle}>
        {isThinking
          ? "思考中..."
          : `已思考 ${thinkingSeconds} 秒 ${isOpen ? "▼" : "▶"}`}
      </button>
      {isOpen && (
        <div className="mt-2 text-xs whitespace-pre-wrap text-gray-500">
          {reasoning}
        </div>
      )}
    </div>
  );
}
