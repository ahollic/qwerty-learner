import { TypingStateActionType } from '../store'
import { TypingContext } from '../store'
import type { UserInputLog } from '../store/type'
import type { WordWithIndex } from '@/typings'
import { useCallback, useContext, useMemo } from 'react'

function getWrongWords(words: WordWithIndex[], logs: UserInputLog[]): WordWithIndex[] {
  return logs
    .filter((log) => log.wrongCount > 0)
    .map((log) => words[log.index])
    .filter((w): w is WordWithIndex => w !== undefined)
}

function getUnfamiliarWords(words: WordWithIndex[], logs: UserInputLog[]): WordWithIndex[] {
  return logs
    .filter((log) => !log.isSkipped)
    .map((log) => words[log.index])
    .filter((w): w is WordWithIndex => w !== undefined)
}

export function useErrorWordPractice() {
  const ctx = useContext(TypingContext)
  if (!ctx) throw new Error('useErrorWordPractice must be used within TypingContext')
  const { state, dispatch } = ctx

  const isActive = state.isErrorWordPracticeMode

  const wrongWords = useMemo(
    () => getWrongWords(state.chapterData.words, state.chapterData.userInputLogs),
    [state.chapterData.words, state.chapterData.userInputLogs],
  )

  const startPractice = useCallback(() => {
    const words = getWrongWords(state.chapterData.words, state.chapterData.userInputLogs)
    if (words.length === 0) return

    dispatch({
      type: TypingStateActionType.START_ERROR_WORD_PRACTICE,
      payload: {
        wrongWords: words,
        originalChapterData: state.chapterData,
      },
    })
  }, [state.chapterData, dispatch])

  const exitPractice = useCallback(() => {
    dispatch({ type: TypingStateActionType.EXIT_ERROR_WORD_PRACTICE })
  }, [dispatch])

  /** 在错误单词练习模式中，完成最后一个单词后调用 */
  const handleLastWordInPractice = useCallback(
    (reloadWordComponent: () => void) => {
      const currentLog = state.chapterData.userInputLogs[state.chapterData.index]
      const hasError = currentLog?.currentAttemptError

      if (hasError) {
        // 当前单词有错误 -> 重复练习所有错误单词
        const remaining = getWrongWords(state.chapterData.words, state.chapterData.userInputLogs)
        dispatch({ type: TypingStateActionType.REPEAT_ERROR_WORDS, payload: { wrongWords: remaining } })
        reloadWordComponent()
      } else {
        // 当前单词正确
        const hasOtherWrong = state.chapterData.userInputLogs.some(
          (log, idx) => idx !== state.chapterData.index && (log.wrongCount > 0 || log.currentAttemptError),
        )

        if (hasOtherWrong) {
          // 标记当前为已掌握，重复练习剩余的
          const remaining = getWrongWords(state.chapterData.words, state.chapterData.userInputLogs)
          dispatch({ type: TypingStateActionType.REPEAT_ERROR_WORDS, payload: { wrongWords: remaining } })
          reloadWordComponent()
        } else {
          // 全部掌握，退出
          dispatch({ type: TypingStateActionType.EXIT_ERROR_WORD_PRACTICE })
        }
      }
    },
    [state.chapterData, dispatch],
  )

  const unfamiliarWords = useMemo(
    () => getUnfamiliarWords(state.chapterData.words, state.chapterData.userInputLogs),
    [state.chapterData.words, state.chapterData.userInputLogs],
  )

  const startUnfamiliarPractice = useCallback(() => {
    const words = getUnfamiliarWords(state.chapterData.words, state.chapterData.userInputLogs)
    if (words.length === 0) return

    dispatch({
      type: TypingStateActionType.START_ERROR_WORD_PRACTICE,
      payload: {
        wrongWords: words,
        originalChapterData: state.chapterData,
      },
    })
  }, [state.chapterData, dispatch])

  return { isActive, startPractice, exitPractice, handleLastWordInPractice, wrongWords, unfamiliarWords, startUnfamiliarPractice }
}
