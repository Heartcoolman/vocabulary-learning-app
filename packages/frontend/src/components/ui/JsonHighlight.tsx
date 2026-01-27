import { useMemo } from 'react';

interface JsonHighlightProps {
  data: unknown;
  className?: string;
}

/**
 * JSON 语法高亮组件
 * 为 JSON 数据提供语法高亮显示
 */
export function JsonHighlight({ data, className = '' }: JsonHighlightProps) {
  const highlighted = useMemo(() => {
    const json = JSON.stringify(data, null, 2);
    // 使用正则表达式匹配 JSON 的不同部分
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = 'text-amber-400'; // number
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'text-blue-400'; // key
            match = match.slice(0, -1); // remove trailing colon for styling
            return `<span class="${cls}">${escapeHtml(match)}</span>:`;
          } else {
            cls = 'text-green-400'; // string
          }
        } else if (/true|false/.test(match)) {
          cls = 'text-purple-400'; // boolean
        } else if (/null/.test(match)) {
          cls = 'text-gray-500'; // null
        }
        return `<span class="${cls}">${escapeHtml(match)}</span>`;
      },
    );
  }, [data]);

  return (
    <pre
      className={`overflow-x-auto whitespace-pre-wrap break-words rounded bg-gray-900 p-3 font-mono text-xs text-gray-100 ${className}`}
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
