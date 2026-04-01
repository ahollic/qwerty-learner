import { useExampleSentence } from '@/hooks/useExampleSentence'
import { Sparkles, RotateCw, Loader2 } from 'lucide-react'

export interface ExampleSentenceProps {
  word: string
  trans?: string[]
}

export default function ExampleSentence({ word, trans }: ExampleSentenceProps) {
  const { sentence, isLoading, error, generate } = useExampleSentence(word, trans)

  // 初始状态：显示按钮
  if (!sentence && !isLoading && !error) {
    return (
      <div className="flex justify-center pb-4 pt-1">
        <button
          onClick={generate}
          className="flex items-center gap-1.5 rounded-md px-3 py-1 text-sm text-indigo-400 transition-colors hover:bg-indigo-50 hover:text-indigo-500 dark:text-indigo-400 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-300"
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI 例句
        </button>
      </div>
    )
  }

  // 加载状态
  if (isLoading) {
    return (
      <div className="flex justify-center pb-4 pt-1">
        <div className="flex items-center gap-1.5 px-3 py-1 text-sm text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          生成中...
        </div>
      </div>
    )
  }

  // 错误状态
  if (error) {
    return (
      <div className="flex justify-center pb-4 pt-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-red-400">{error}</span>
          <button
            onClick={generate}
            className="flex items-center gap-1 text-indigo-400 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            <RotateCw className="h-3.5 w-3.5" />
            重试
          </button>
        </div>
      </div>
    )
  }

  // 完成状态：显示例句
  if (sentence) {
    return (
      <div className="flex justify-center pb-4 pt-1">
        <div className="max-w-md rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
          <div className="mb-1 text-xs font-medium text-gray-400 dark:text-gray-500">📖 例句</div>
          <p className="text-base leading-relaxed text-gray-800 dark:text-gray-200">{sentence.enSentence}</p>
          <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{sentence.zhSentence}</p>
          <div className="mt-2 flex justify-end">
            <button
              onClick={generate}
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              <RotateCw className="h-3 w-3" />
              重新生成
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
