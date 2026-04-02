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

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  const cleanup = useCallback(() => {
    // 停止 siliconflow audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.onended = null
      audioRef.current.onerror = null
      URL.revokeObjectURL(audioRef.current.src)
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

  const speakWithSiliconflow = useCallback(
    async (text: string) => {
      const apiKey = import.meta.env.VITE_SILICONFLOW_API_KEY as string
      if (!apiKey) {
        setError('未配置 API Key，请在 .env 文件中设置 VITE_SILICONFLOW_API_KEY')
        return
      }

      // 先清理之前的播放
      cleanup()

      const controller = new AbortController()
      abortControllerRef.current = controller

      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch('https://api.siliconflow.cn/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'FunAudioLLM/CosyVoice2-0.5B',
            input: text,
            voice: 'FunAudioLLM/CosyVoice2-0.5B:alex',
            response_format: 'mp3',
            speed: 1,
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
        const audio = new Audio(audioUrl)
        audioRef.current = audio

        setIsSpeaking(true)
        setIsLoading(false)

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl)
          audioRef.current = null
          setIsSpeaking(false)
        }

        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl)
          audioRef.current = null
          setError('音频播放失败')
          setIsSpeaking(false)
        }

        await audio.play()
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : '语音合成失败')
      } finally {
        setIsLoading(false)
      }
    },
    [cleanup],
  )

  const speakWithBrowser = useCallback(
    (text: string) => {
      // 先清理之前的播放
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
