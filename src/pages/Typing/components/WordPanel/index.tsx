import { TypingContext, TypingStateActionType } from '../../store'
import type { TypingState } from '../../store/type'
import PrevAndNextWord from '../PrevAndNextWord'
import Progress from '../Progress'
import Phonetic from './components/Phonetic'
import Translation from './components/Translation'
import WordComponent from './components/Word'
import { usePrefetchPronunciationSound } from '@/hooks/usePronunciation'
import { isReviewModeAtom, isShowPrevAndNextWordAtom, loopWordConfigAtom, phoneticConfigAtom, reviewModeInfoAtom } from '@/store'
import type { Word } from '@/typings'
import { useAtomValue, useSetAtom } from 'jotai'
import { useCallback, useContext, useMemo, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'

export default function WordPanel() {
  // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
  const { state, dispatch } = useContext(TypingContext)!
  const phoneticConfig = useAtomValue(phoneticConfigAtom)
  const isShowPrevAndNextWord = useAtomValue(isShowPrevAndNextWordAtom)
  const [wordComponentKey, setWordComponentKey] = useState(0)
  const [currentWordExerciseCount, setCurrentWordExerciseCount] = useState(0)
  const { times: loopWordTimes } = useAtomValue(loopWordConfigAtom)
  // 在错误单词练习模式下，强制单个单词循环为1次
  const effectiveLoopTimes = state.isErrorWordPracticeMode ? 1 : loopWordTimes
  const currentWord = state.chapterData.words[state.chapterData.index]
  const nextWord = state.chapterData.words[state.chapterData.index + 1] as Word | undefined

  const setReviewModeInfo = useSetAtom(reviewModeInfoAtom)
  const isReviewMode = useAtomValue(isReviewModeAtom)

  const prevIndex = useMemo(() => {
    const newIndex = state.chapterData.index - 1
    return newIndex < 0 ? 0 : newIndex
  }, [state.chapterData.index])
  const nextIndex = useMemo(() => {
    const newIndex = state.chapterData.index + 1
    return newIndex > state.chapterData.words.length - 1 ? state.chapterData.words.length - 1 : newIndex
  }, [state.chapterData.index, state.chapterData.words.length])

  usePrefetchPronunciationSound(nextWord?.name)

  const reloadCurrentWordComponent = useCallback(() => {
    setWordComponentKey((old) => old + 1)
  }, [])

  const updateReviewRecord = useCallback(
    (state: TypingState) => {
      setReviewModeInfo((old) => ({
        ...old,
        reviewRecord: old.reviewRecord ? { ...old.reviewRecord, index: state.chapterData.index } : undefined,
      }))
    },
    [setReviewModeInfo],
  )

  const onFinish = useCallback(() => {
    // 获取当前单词的日志
    const currentWordLog = state.chapterData.userInputLogs[state.chapterData.index]
    const isLastWord = state.chapterData.index === state.chapterData.words.length - 1

    // 无错误就通过模式：如果本轮尝试有错误，则重复；如果本轮尝试正确，则继续
    const shouldRepeatForUntilCorrect = effectiveLoopTimes === 'untilCorrect' && currentWordLog && currentWordLog.currentAttemptError

    // 如果是数字循环模式且还没达到指定次数，则继续循环
    const shouldLoopForNumeric = typeof effectiveLoopTimes === 'number' && currentWordExerciseCount < effectiveLoopTimes - 1

    // 决定是否需要重复当前单词
    const shouldLoopCurrentWord = !isLastWord && (shouldLoopForNumeric || shouldRepeatForUntilCorrect)

    if (shouldLoopCurrentWord) {
      // 重复当前单词
      setCurrentWordExerciseCount((old) => old + 1)
      dispatch({ type: TypingStateActionType.LOOP_CURRENT_WORD })
      reloadCurrentWordComponent()
    } else if (state.chapterData.index < state.chapterData.words.length - 1) {
      // 进入下一个单词
      setCurrentWordExerciseCount(0)
      if (isReviewMode) {
        dispatch({
          type: TypingStateActionType.NEXT_WORD,
          payload: {
            updateReviewRecord,
          },
        })
      } else {
        dispatch({ type: TypingStateActionType.NEXT_WORD })
      }
    } else {
      // 用户完成当前章节
      if (state.isErrorWordPracticeMode) {
        const currentWordLog = state.chapterData.userInputLogs[state.chapterData.index]

        // 检查当前单词在本轮是否有新错误
        if (currentWordLog && !currentWordLog.currentAttemptError) {
          // 本轮正确完成且无错误，检查是否还有其他错误单词
          const hasOtherWrongWords = state.chapterData.userInputLogs.some(
            (log, idx) => idx !== state.chapterData.index && log.wrongCount > 0,
          )

          if (hasOtherWrongWords) {
            // 还有其他错误单词，标记当前单词为已掌握并重复练习
            dispatch({ type: TypingStateActionType.MARK_WORD_MASTERED, payload: { wordIndex: state.chapterData.index } })
            dispatch({ type: TypingStateActionType.REPEAT_ERROR_WORDS })
          } else {
            // 当前单词是最后一个错误单词，直接退出错误单词练习模式
            dispatch({ type: TypingStateActionType.EXIT_ERROR_WORD_PRACTICE })
          }
        } else {
          // 当前单词有错误，需要重复练习所有仍有错误的单词
          dispatch({ type: TypingStateActionType.REPEAT_ERROR_WORDS })
        }
      } else {
        // 正常章节完成
        dispatch({ type: TypingStateActionType.FINISH_CHAPTER })
        if (isReviewMode) {
          setReviewModeInfo((old) => ({ ...old, reviewRecord: old.reviewRecord ? { ...old.reviewRecord, isFinished: true } : undefined }))
        }
      }
    }
  }, [
    state.chapterData.index,
    state.chapterData.words.length,
    state.chapterData.userInputLogs,
    state.isErrorWordPracticeMode,
    currentWordExerciseCount,
    effectiveLoopTimes,
    dispatch,
    reloadCurrentWordComponent,
    isReviewMode,
    updateReviewRecord,
    setReviewModeInfo,
  ])

  const onSkipWord = useCallback(
    (type: 'prev' | 'next') => {
      if (type === 'prev') {
        dispatch({ type: TypingStateActionType.SKIP_2_WORD_INDEX, newIndex: prevIndex })
      }

      if (type === 'next') {
        dispatch({ type: TypingStateActionType.SKIP_2_WORD_INDEX, newIndex: nextIndex })
      }
    },
    [dispatch, prevIndex, nextIndex],
  )

  useHotkeys(
    'Ctrl + Shift + ArrowLeft',
    (e) => {
      e.preventDefault()
      onSkipWord('prev')
    },
    { preventDefault: true },
  )

  useHotkeys(
    'Ctrl + Shift + ArrowRight',
    (e) => {
      e.preventDefault()
      onSkipWord('next')
    },
    { preventDefault: true },
  )
  const [isShowTranslation, setIsHoveringTranslation] = useState(false)

  const handleShowTranslation = useCallback((checked: boolean) => {
    setIsHoveringTranslation(checked)
  }, [])

  useHotkeys(
    'tab',
    () => {
      handleShowTranslation(true)
    },
    { enableOnFormTags: true, preventDefault: true },
    [],
  )

  useHotkeys(
    'tab',
    () => {
      handleShowTranslation(false)
    },
    { enableOnFormTags: true, keyup: true, preventDefault: true },
    [],
  )

  const shouldShowTranslation = useMemo(() => {
    return isShowTranslation || state.isTransVisible
  }, [isShowTranslation, state.isTransVisible])

  return (
    <div className="container flex h-full w-full flex-col items-center justify-center">
      <div className="container flex h-24 w-full shrink-0 grow-0 justify-between px-12 pt-10">
        {isShowPrevAndNextWord && state.isTyping && (
          <>
            <PrevAndNextWord type="prev" />
            <PrevAndNextWord type="next" />
          </>
        )}
      </div>
      <div className="container flex flex-grow flex-col items-center justify-center">
        {currentWord && (
          <div className="relative flex w-full justify-center">
            {!state.isTyping && (
              <div className="absolute flex h-full w-full justify-center">
                <div className="z-10 flex w-full items-center backdrop-blur-sm">
                  <p className="w-full select-none text-center text-xl text-gray-600 dark:text-gray-50">
                    按任意键{state.timerData.time ? '继续' : '开始'}
                  </p>
                </div>
              </div>
            )}
            <div className="relative">
              <WordComponent word={currentWord} onFinish={onFinish} key={wordComponentKey} />
              {phoneticConfig.isOpen && <Phonetic word={currentWord} />}
              <Translation
                trans={currentWord.trans.join('；')}
                showTrans={shouldShowTranslation}
                onMouseEnter={() => handleShowTranslation(true)}
                onMouseLeave={() => handleShowTranslation(false)}
              />
            </div>
          </div>
        )}
      </div>
      <Progress className={`mb-10 mt-auto ${state.isTyping ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  )
}
