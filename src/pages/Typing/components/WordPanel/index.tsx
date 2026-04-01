import { useErrorWordPractice } from '../../hooks/useErrorWordPractice'
import { TypingContext, TypingStateActionType } from '../../store'
import type { TypingState } from '../../store/type'
import PrevAndNextWord from '../PrevAndNextWord'
import Progress from '../Progress'
import ExampleSentence from './components/ExampleSentence'
import Phonetic from './components/Phonetic'
import Translation from './components/Translation'
import WordComponent from './components/Word'
import { usePrefetchPronunciationSound } from '@/hooks/usePronunciation'
import { isReviewModeAtom, isShowPrevAndNextWordAtom, loopWordConfigAtom, phoneticConfigAtom, reviewModeInfoAtom } from '@/store'
import type { Word } from '@/typings'
import { useAtomValue, useSetAtom } from 'jotai'
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'

export default function WordPanel() {
  // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
  const { state, dispatch } = useContext(TypingContext)!
  const phoneticConfig = useAtomValue(phoneticConfigAtom)
  const isShowPrevAndNextWord = useAtomValue(isShowPrevAndNextWordAtom)
  const [wordComponentKey, setWordComponentKey] = useState(0)
  const [currentWordExerciseCount, setCurrentWordExerciseCount] = useState(0)
  const { times: loopWordTimes } = useAtomValue(loopWordConfigAtom)
  const errorPractice = useErrorWordPractice()
  // 在错误单词练习模式下，强制单个单词循环为1次
  const effectiveLoopTimes = errorPractice.isActive ? 1 : loopWordTimes
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
    const currentWordLog = state.chapterData.userInputLogs[state.chapterData.index]
    const isLastWord = state.chapterData.index === state.chapterData.words.length - 1

    const shouldRepeatForUntilCorrect = effectiveLoopTimes === 'untilCorrect' && currentWordLog?.currentAttemptError
    const shouldLoopForNumeric = typeof effectiveLoopTimes === 'number' && currentWordExerciseCount < effectiveLoopTimes - 1
    const shouldLoopCurrentWord = !isLastWord && (shouldLoopForNumeric || shouldRepeatForUntilCorrect)

    if (shouldLoopCurrentWord) {
      setCurrentWordExerciseCount((old) => old + 1)
      dispatch({ type: TypingStateActionType.LOOP_CURRENT_WORD })
      reloadCurrentWordComponent()
    } else if (!isLastWord) {
      setCurrentWordExerciseCount(0)
      dispatch({
        type: TypingStateActionType.NEXT_WORD,
        ...(isReviewMode ? { payload: { updateReviewRecord } } : {}),
      })
    } else if (errorPractice.isActive) {
      errorPractice.handleLastWordInPractice(reloadCurrentWordComponent)
    } else {
      dispatch({ type: TypingStateActionType.FINISH_CHAPTER })
      if (isReviewMode) {
        setReviewModeInfo((old) => ({ ...old, reviewRecord: old.reviewRecord ? { ...old.reviewRecord, isFinished: true } : undefined }))
      }
    }
  }, [
    state.chapterData.index,
    state.chapterData.words.length,
    state.chapterData.userInputLogs,
    currentWordExerciseCount,
    effectiveLoopTimes,
    dispatch,
    reloadCurrentWordComponent,
    isReviewMode,
    updateReviewRecord,
    setReviewModeInfo,
    errorPractice,
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

  const handleSkipAsFamiliar = useCallback(() => {
    if (!state.isTyping) return
    dispatch({ type: TypingStateActionType.SKIP_WORD_AS_FAMILIAR })
    reloadCurrentWordComponent()
  }, [state.isTyping, dispatch, reloadCurrentWordComponent])

  // 处理练习模式下通过 Esc 跳过最后一个单词的情况
  const lastWordSkippedInPractice = useRef(false)
  // 当 words 列表变化（新一轮练习开始）时重置
  useEffect(() => {
    lastWordSkippedInPractice.current = false
  }, [state.chapterData.words])
  useEffect(() => {
    if (
      errorPractice.isActive &&
      state.chapterData.words.length > 0 &&
      state.chapterData.userInputLogs[state.chapterData.index]?.isSkipped &&
      !lastWordSkippedInPractice.current
    ) {
      lastWordSkippedInPractice.current = true
      errorPractice.handleLastWordInPractice(reloadCurrentWordComponent)
    }
  }, [errorPractice, state.chapterData, reloadCurrentWordComponent])

  useHotkeys(
    'escape',
    () => {
      handleSkipAsFamiliar()
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
                <div className="z-10 flex w-full flex-col items-center backdrop-blur-sm">
                  <p className="w-full select-none text-center text-xl text-gray-600 dark:text-gray-50">
                    按任意键{state.timerData.time ? '继续' : '开始'}
                  </p>
                  <p className="mt-1 w-full select-none text-center text-xs text-gray-400 dark:text-gray-400">按 Esc 跳过熟悉的单词</p>
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
              <ExampleSentence word={currentWord.name} trans={currentWord.trans} />
            </div>
          </div>
        )}
      </div>
      <Progress className={`mb-10 mt-auto ${state.isTyping ? 'opacity-100' : 'opacity-0'}`} />
      {state.isTyping && (
        <div className="pb-4 text-xs text-gray-400 dark:text-gray-500">
          按 <kbd className="rounded border border-gray-300 px-1 py-0.5 text-xs dark:border-gray-600">Esc</kbd> 跳过熟悉的单词
        </div>
      )}
    </div>
  )
}
