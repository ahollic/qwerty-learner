import { useCallback, useEffect, useRef, useState } from 'react'

export interface ExampleSentenceResult {
  enSentence: string
  zhSentence: string
}

export interface UseExampleSentenceReturn {
  sentence: ExampleSentenceResult | null
  isLoading: boolean
  error: string | null
  generate: () => void
}

type ProviderConfig = {
  apiUrl: string
  apiKey: string
  model: string
  extraBody?: Record<string, unknown>
}

function getProviderConfig(): ProviderConfig {
  const provider = (import.meta.env.VITE_AI_PROVIDER as string) || 'deepseek'

  switch (provider) {
    case 'deepseek':
      return {
        apiUrl: 'https://api.deepseek.com/v1/chat/completions',
        apiKey: import.meta.env.VITE_DEEPSEEK_API_KEY as string,
        model: 'deepseek-chat', // DeepSeek V3.2
      }
    case 'zhipu':
      return {
        apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        apiKey: import.meta.env.VITE_ZHIPU_API_KEY as string,
        model: 'glm-4.7-flash',
        extraBody: { thinking: { type: 'disabled' } },
      }
    case 'siliconflow':
      return {
        apiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
        apiKey: import.meta.env.VITE_SILICONFLOW_API_KEY as string,
        model: 'Qwen/Qwen3-8B',
        extraBody: { enable_thinking: false },
      }
    default:
      return {
        apiUrl: 'https://api.deepseek.com/v1/chat/completions',
        apiKey: import.meta.env.VITE_DEEPSEEK_API_KEY as string,
        model: 'deepseek-chat',
      }
  }
}

const SYSTEM_PROMPT =
  '你是一个英语学习助手。请为用户给出的英语单词生成一个日常、地道、简短的英语例句，像母语者在真实生活中会说的话。要求：1) 场景贴近日常生活（如聊天、工作、购物等）；2) 用词自然，避免生硬翻译感；3) 优先使用口语化的短语和搭配。只返回 JSON 格式：{"en": "英文例句", "zh": "中文翻译"}，不要返回任何其他内容。'

function extractJSON(text: string): { en: string; zh: string } | null {
  // 先尝试直接 parse
  try {
    return JSON.parse(text)
  } catch {
    // 尝试用正则提取 JSON 对象
    const match = text.match(/\{[\s\S]*?"en"[\s\S]*?"zh"[\s\S]*?\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {
        return null
      }
    }
    return null
  }
}

export function useExampleSentence(word: string, trans?: string[]): UseExampleSentenceReturn {
  const [sentence, setSentence] = useState<ExampleSentenceResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentWordRef = useRef(word)

  // 切换单词时自动重置状态
  useEffect(() => {
    currentWordRef.current = word
    setSentence(null)
    setIsLoading(false)
    setError(null)
  }, [word])

  const generate = useCallback(async () => {
    const config = getProviderConfig()

    if (!config.apiKey) {
      const provider = (import.meta.env.VITE_AI_PROVIDER as string) || 'deepseek'
      const keyMap: Record<string, string> = {
        deepseek: 'VITE_DEEPSEEK_API_KEY',
        zhipu: 'VITE_ZHIPU_API_KEY',
        siliconflow: 'VITE_SILICONFLOW_API_KEY',
      }
      const keyName = keyMap[provider] || 'VITE_DEEPSEEK_API_KEY'
      setError(`未配置 API Key，请在 .env 文件中设置 ${keyName}`)
      return
    }

    setIsLoading(true)
    setError(null)

    const capturedWord = word

    try {
      const userContent =
        trans && trans.length > 0
          ? `请为单词 '${capturedWord}'（${trans.join('；')}）生成一个例句。`
          : `请为单词 '${capturedWord}' 生成一个例句。`

      const body: Record<string, unknown> = {
        model: config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_tokens: 128,
        temperature: 0.5,
        stream: true,
      }

      if (config.extraBody) {
        Object.assign(body, config.extraBody)
      }

      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      })

      // 检查 word 是否已变化（用户可能在请求期间切换单词）
      if (currentWordRef.current !== capturedWord) {
        return
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error?.message || `API 请求失败 (${response.status})`)
      }

      // 流式读取响应
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('无法读取响应流')
      }

      const decoder = new TextDecoder()
      let content = ''
      let buffer = ''

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // 检查 word 是否已变化
        if (currentWordRef.current !== capturedWord) {
          reader.cancel()
          return
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta?.content
            if (delta) {
              content += delta
            }
          } catch {
            // 忽略解析错误，继续读取
          }
        }
      }

      if (!content) {
        throw new Error('API 返回内容为空')
      }

      const parsed = extractJSON(content)
      if (!parsed || !parsed.en || !parsed.zh) {
        throw new Error('无法解析例句内容')
      }

      setSentence({ enSentence: parsed.en, zhSentence: parsed.zh })
    } catch (err) {
      if (currentWordRef.current !== capturedWord) {
        return
      }
      setError(err instanceof Error ? err.message : '生成例句失败，请重试')
    } finally {
      if (currentWordRef.current === capturedWord) {
        setIsLoading(false)
      }
    }
  }, [word, trans])

  return { sentence, isLoading, error, generate }
}
