import { useCallback, useEffect, useRef, useState } from 'react'

type TTSProvider = 'siliconflow' | 'browser'

function getTTSProvider(): TTSProvider {
  return (import.meta.env.VITE_TTS_PROVIDER as TTSProvider) || 'siliconflow'
}

interface UseTTSHookReturn {
  isSpeaking: boolean
  isLoading: boolean
  error: string | null
  speak: (text: string) => void
  stop: () => void
}

export function useTTSHook(): UseTTSHookReturn {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  // 缓存：text -> blob URL，避免重复请求 API
  const cacheRef = useRef<Map<string, string>>(new Map())

  // 组件卸载时清理
  useEffect(() => {
    const cache = cacheRef.current
    return () => {
      cleanup()
      // 清理所有缓存
      cache.forEach((url) => URL.revokeObjectURL(url))
      cache.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cleanup = useCallback(() => {
    // 停止当前播放（不销毁缓存）
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current = null
    }
    // 取消进行中的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    // 停止浏览器 TTS
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
    setIsLoading(false)
  }, [])

  const playBlobUrl = useCallback((audioUrl: string) => {
    const audio = new Audio(audioUrl)
    audioRef.current = audio

    setIsSpeaking(true)
    setIsLoading(false)

    audio.onended = () => {
      audioRef.current = null
      setIsSpeaking(false)
    }

    audio.onerror = () => {
      audioRef.current = null
      setError('音频播放失败')
      setIsSpeaking(false)
    }

    audio.play()
  }, [])

  const speakWithSiliconflow = useCallback(
    async (text: string) => {
      const apiKey = import.meta.env.VITE_SILICONFLOW_API_KEY as string
      if (!apiKey) {
        setError('未配置 API Key，请在 .env 文件中设置 VITE_SILICONFLOW_API_KEY')
        return
      }

      // 停止当前播放
      cleanup()

      // 命中缓存，直接播放
      const cached = cacheRef.current.get(text)
      if (cached) {
        playBlobUrl(cached)
        return
      }

      const controller = new AbortController()
      abortControllerRef.current = controller

      setIsLoading(true)
      setError(null)

      try {
        // 利用 CosyVoice2 的 <|endofprompt|> 指令注入情感控制，提升语音自然度
        const ttsInput = `Speak in a natural, conversational tone as if chatting with a friend, with moderate pace and warm emotion.<|endofprompt|>${text}`

        const response = await fetch('https://api.siliconflow.cn/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'FunAudioLLM/CosyVoice2-0.5B',
            input: ttsInput,
            voice: 'FunAudioLLM/CosyVoice2-0.5B:diana',
            response_format: 'mp3',
            speed: 0.95,
            gain: 0,
          }),
          signal: controller.signal,
        })

        if (controller.signal.aborted) return

        if (!response.ok) {
          const errorData = await response.json().catch(() => null)
          throw new Error(errorData?.error?.message || `TTS 请求失败 (${response.status})`)
        }

        const blob = await response.blob()
        const audioUrl = URL.createObjectURL(blob)

        // 存入缓存
        cacheRef.current.set(text, audioUrl)

        playBlobUrl(audioUrl)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : '语音合成失败')
      } finally {
        setIsLoading(false)
      }
    },
    [cleanup, playBlobUrl],
  )

  const speakWithBrowser = useCallback(
    (text: string) => {
      cleanup()

      if (!window.speechSynthesis) {
        setError('当前浏览器不支持语音合成')
        return
      }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'en-US'
      utterance.rate = 0.9

      utterance.onend = () => {
        setIsSpeaking(false)
      }

      utterance.onerror = (e) => {
        setError(`语音合成失败: ${e.error}`)
        setIsSpeaking(false)
      }

      setIsSpeaking(true)
      window.speechSynthesis.speak(utterance)
    },
    [cleanup],
  )

  const speak = useCallback(
    (text: string) => {
      const provider = getTTSProvider()
      if (provider === 'browser') {
        speakWithBrowser(text)
      } else {
        speakWithSiliconflow(text)
      }
    },
    [speakWithSiliconflow, speakWithBrowser],
  )

  const stop = useCallback(() => {
    cleanup()
  }, [cleanup])

  return { isSpeaking, isLoading, error, speak, stop }
}
