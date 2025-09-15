import type { TypingState, UserInputLog } from './type'
import type { WordWithIndex } from '@/typings'
import type { LetterMistakes } from '@/utils/db/record'
import '@/utils/db/review-record'
import { mergeLetterMistake } from '@/utils/db/utils'
import shuffle from '@/utils/shuffle'
import { createContext } from 'react'

export const initialState: TypingState = {
  chapterData: {
    words: [],
    index: 0,
    wordCount: 0,
    correctCount: 0,
    wrongCount: 0,
    wordRecordIds: [],
    userInputLogs: [],
  },
  timerData: {
    time: 0,
    accuracy: 0,
    wpm: 0,
  },
  isTyping: false,
  isFinished: false,
  isShowSkip: false,
  isTransVisible: true,
  isLoopSingleWord: false,
  isSavingRecord: false,
  isErrorWordPracticeMode: false,
  originalChapterData: undefined,
}

export const initialUserInputLog: UserInputLog = {
  index: 0,
  correctCount: 0,
  wrongCount: 0,
  LetterMistakes: {},
}

export enum TypingStateActionType {
  SETUP_CHAPTER = 'SETUP_CHAPTER',
  SET_IS_SKIP = 'SET_IS_SKIP',
  SET_IS_TYPING = 'SET_IS_TYPING',
  TOGGLE_IS_TYPING = 'TOGGLE_IS_TYPING',
  REPORT_WRONG_WORD = 'REPORT_WRONG_WORD',
  REPORT_CORRECT_WORD = 'REPORT_CORRECT_WORD',
  NEXT_WORD = 'NEXT_WORD',
  LOOP_CURRENT_WORD = 'LOOP_CURRENT_WORD',
  FINISH_CHAPTER = 'FINISH_CHAPTER',
  INCREASE_WRONG_WORD = 'INCREASE_WRONG_WORD',
  SKIP_WORD = 'SKIP_WORD',
  SKIP_2_WORD_INDEX = 'SKIP_2_WORD_INDEX',
  REPEAT_CHAPTER = 'REPEAT_CHAPTER',
  NEXT_CHAPTER = 'NEXT_CHAPTER',
  TOGGLE_WORD_VISIBLE = 'TOGGLE_WORD_VISIBLE',
  TOGGLE_TRANS_VISIBLE = 'TOGGLE_TRANS_VISIBLE',
  TICK_TIMER = 'TICK_TIMER',
  ADD_WORD_RECORD_ID = 'ADD_WORD_RECORD_ID',
  SET_IS_SAVING_RECORD = 'SET_IS_SAVING_RECORD',
  SET_IS_LOOP_SINGLE_WORD = 'SET_IS_LOOP_SINGLE_WORD',
  TOGGLE_IS_LOOP_SINGLE_WORD = 'TOGGLE_IS_LOOP_SINGLE_WORD',
  SET_REVISION_INDEX = 'SET_REVISION_INDEX',
  START_ERROR_WORD_PRACTICE = 'START_ERROR_WORD_PRACTICE',
  EXIT_ERROR_WORD_PRACTICE = 'EXIT_ERROR_WORD_PRACTICE',
  REPEAT_ERROR_WORDS = 'REPEAT_ERROR_WORDS',
  MARK_WORD_MASTERED = 'MARK_WORD_MASTERED',
}

export type TypingStateAction =
  | { type: TypingStateActionType.SETUP_CHAPTER; payload: { words: WordWithIndex[]; shouldShuffle: boolean; initialIndex?: number } }
  | { type: TypingStateActionType.SET_IS_SKIP; payload: boolean }
  | { type: TypingStateActionType.SET_IS_TYPING; payload: boolean }
  | { type: TypingStateActionType.TOGGLE_IS_TYPING }
  | { type: TypingStateActionType.REPORT_WRONG_WORD; payload: { letterMistake: LetterMistakes } }
  | { type: TypingStateActionType.REPORT_CORRECT_WORD }
  | {
      type: TypingStateActionType.NEXT_WORD
      payload?: {
        updateReviewRecord?: (state: TypingState) => void
      }
    }
  | { type: TypingStateActionType.LOOP_CURRENT_WORD }
  | { type: TypingStateActionType.FINISH_CHAPTER }
  | { type: TypingStateActionType.SKIP_WORD }
  | { type: TypingStateActionType.SKIP_2_WORD_INDEX; newIndex: number }
  | { type: TypingStateActionType.REPEAT_CHAPTER; shouldShuffle: boolean }
  | { type: TypingStateActionType.NEXT_CHAPTER }
  | { type: TypingStateActionType.TOGGLE_TRANS_VISIBLE }
  | { type: TypingStateActionType.TICK_TIMER; addTime?: number }
  | { type: TypingStateActionType.ADD_WORD_RECORD_ID; payload: number }
  | { type: TypingStateActionType.SET_IS_SAVING_RECORD; payload: boolean }
  | { type: TypingStateActionType.SET_IS_LOOP_SINGLE_WORD; payload: boolean }
  | { type: TypingStateActionType.TOGGLE_IS_LOOP_SINGLE_WORD }
  | { type: TypingStateActionType.START_ERROR_WORD_PRACTICE }
  | { type: TypingStateActionType.EXIT_ERROR_WORD_PRACTICE }
  | { type: TypingStateActionType.REPEAT_ERROR_WORDS }
  | { type: TypingStateActionType.MARK_WORD_MASTERED; payload: { wordIndex: number } }

type Dispatch = (action: TypingStateAction) => void

export const typingReducer = (state: TypingState, action: TypingStateAction) => {
  switch (action.type) {
    case TypingStateActionType.SETUP_CHAPTER: {
      const newState = structuredClone(initialState)
      const words = action.payload.shouldShuffle ? shuffle(action.payload.words) : action.payload.words
      let initialIndex = action.payload.initialIndex ?? 0
      if (initialIndex >= words.length) {
        initialIndex = 0
      }
      newState.chapterData.index = initialIndex
      newState.chapterData.words = words
      newState.chapterData.userInputLogs = words.map((_, index) => ({ ...structuredClone(initialUserInputLog), index }))

      return newState
    }
    case TypingStateActionType.SET_IS_SKIP:
      state.isShowSkip = action.payload
      break
    case TypingStateActionType.SET_IS_TYPING:
      state.isTyping = action.payload
      break

    case TypingStateActionType.TOGGLE_IS_TYPING:
      state.isTyping = !state.isTyping
      break
    case TypingStateActionType.REPORT_CORRECT_WORD: {
      state.chapterData.correctCount += 1

      const wordLog = state.chapterData.userInputLogs[state.chapterData.index]
      wordLog.correctCount += 1
      break
    }
    case TypingStateActionType.REPORT_WRONG_WORD: {
      state.chapterData.wrongCount += 1

      const letterMistake = action.payload.letterMistake
      const wordLog = state.chapterData.userInputLogs[state.chapterData.index]
      wordLog.wrongCount += 1
      wordLog.LetterMistakes = mergeLetterMistake(wordLog.LetterMistakes, letterMistake)
      break
    }
    case TypingStateActionType.NEXT_WORD: {
      state.chapterData.index += 1
      state.chapterData.wordCount += 1
      state.isShowSkip = false

      if (action?.payload?.updateReviewRecord) {
        action.payload.updateReviewRecord(state)
      }
      break
    }
    case TypingStateActionType.LOOP_CURRENT_WORD:
      state.isShowSkip = false
      state.chapterData.wordCount += 1
      break
    case TypingStateActionType.FINISH_CHAPTER:
      state.chapterData.wordCount += 1
      state.isTyping = false
      state.isFinished = true
      state.isShowSkip = false
      break
    case TypingStateActionType.SKIP_WORD: {
      const newIndex = state.chapterData.index + 1
      if (newIndex >= state.chapterData.words.length) {
        state.isTyping = false
        state.isFinished = true
      } else {
        state.chapterData.index = newIndex
      }
      state.isShowSkip = false
      break
    }
    case TypingStateActionType.SKIP_2_WORD_INDEX: {
      const newIndex = action.newIndex
      if (newIndex >= state.chapterData.words.length) {
        state.isTyping = false
        state.isFinished = true
      }
      state.chapterData.index = newIndex
      break
    }
    case TypingStateActionType.REPEAT_CHAPTER: {
      const newState = structuredClone(initialState)
      newState.chapterData.userInputLogs = state.chapterData.words.map((_, index) => ({ ...structuredClone(initialUserInputLog), index }))
      newState.isTyping = true
      newState.chapterData.words = action.shouldShuffle ? shuffle(state.chapterData.words) : state.chapterData.words
      newState.isTransVisible = state.isTransVisible
      newState.isErrorWordPracticeMode = state.isErrorWordPracticeMode
      newState.originalChapterData = state.originalChapterData
      return newState
    }
    case TypingStateActionType.NEXT_CHAPTER: {
      const newState = structuredClone(initialState)
      newState.chapterData.userInputLogs = state.chapterData.words.map((_, index) => ({ ...structuredClone(initialUserInputLog), index }))
      newState.isTyping = true
      newState.isTransVisible = state.isTransVisible
      return newState
    }
    case TypingStateActionType.TOGGLE_TRANS_VISIBLE:
      state.isTransVisible = !state.isTransVisible
      break
    case TypingStateActionType.TICK_TIMER: {
      const increment = action.addTime === undefined ? 1 : action.addTime
      const newTime = state.timerData.time + increment
      const inputSum =
        state.chapterData.correctCount + state.chapterData.wrongCount === 0
          ? 1
          : state.chapterData.correctCount + state.chapterData.wrongCount

      state.timerData.time = newTime
      state.timerData.accuracy = Math.round((state.chapterData.correctCount / inputSum) * 100)
      state.timerData.wpm = Math.round((state.chapterData.wordCount / newTime) * 60)
      break
    }
    case TypingStateActionType.ADD_WORD_RECORD_ID: {
      state.chapterData.wordRecordIds.push(action.payload)
      break
    }
    case TypingStateActionType.SET_IS_SAVING_RECORD: {
      state.isSavingRecord = action.payload
      break
    }
    case TypingStateActionType.SET_IS_LOOP_SINGLE_WORD: {
      state.isLoopSingleWord = action.payload
      break
    }
    case TypingStateActionType.TOGGLE_IS_LOOP_SINGLE_WORD: {
      state.isLoopSingleWord = !state.isLoopSingleWord
      break
    }
    case TypingStateActionType.START_ERROR_WORD_PRACTICE: {
      // 获取错误单词
      const wrongWords = state.chapterData.userInputLogs
        .filter((log) => log.wrongCount > 0)
        .map((log) => state.chapterData.words[log.index])
        .filter((word) => word !== undefined)

      if (wrongWords.length > 0) {
        // 重新设置章节数据为错误单词
        const newState = structuredClone(initialState)
        newState.chapterData.words = wrongWords
        newState.chapterData.userInputLogs = wrongWords.map((_, index) => ({ ...structuredClone(initialUserInputLog), index }))
        newState.isErrorWordPracticeMode = true
        newState.isTransVisible = state.isTransVisible
        newState.originalChapterData = structuredClone(state.chapterData)

        return newState
      }
      // 如果没有错误单词，保持当前状态不变
      return state
    }
    case TypingStateActionType.EXIT_ERROR_WORD_PRACTICE: {
      if (state.originalChapterData) {
        // 恢复到原始章节数据
        const newState = structuredClone(initialState)
        newState.chapterData = structuredClone(state.originalChapterData)
        newState.isErrorWordPracticeMode = false
        newState.isFinished = true
        newState.isTransVisible = state.isTransVisible
        newState.originalChapterData = undefined

        return newState
      }
      break
    }
    case TypingStateActionType.REPEAT_ERROR_WORDS: {
      // 在错误单词练习模式下，只练习仍有错误的单词
      const wrongWords = state.chapterData.userInputLogs
        .filter((log) => log.wrongCount > 0)
        .map((log) => state.chapterData.words[log.index])
        .filter((word) => word !== undefined)

      if (wrongWords.length > 0) {
        // 重新设置章节数据为仍有错误的单词
        const newState = structuredClone(initialState)
        newState.chapterData.words = wrongWords
        // 保持原有的错误计数信息，只重置索引
        newState.chapterData.userInputLogs = wrongWords.map((_, index) => {
          const originalLog = state.chapterData.userInputLogs.find(
            (log) => state.chapterData.words[log.index]?.name === wrongWords[index]?.name,
          )
          return {
            ...structuredClone(initialUserInputLog),
            index,
            wrongCount: originalLog?.wrongCount || 0,
            correctCount: originalLog?.correctCount || 0,
            LetterMistakes: originalLog?.LetterMistakes || {},
          }
        })
        newState.isErrorWordPracticeMode = true
        newState.isTransVisible = state.isTransVisible
        newState.originalChapterData = state.originalChapterData

        return newState
      } else {
        // 没有错误单词了，退出错误单词练习模式
        if (state.originalChapterData) {
          const newState = structuredClone(initialState)
          newState.chapterData = structuredClone(state.originalChapterData)
          newState.isErrorWordPracticeMode = false
          newState.isFinished = true
          newState.isTransVisible = state.isTransVisible
          newState.originalChapterData = undefined

          return newState
        }
        // 如果没有原始章节数据，保持当前状态不变
        return state
      }
    }
    case TypingStateActionType.MARK_WORD_MASTERED: {
      // 在错误单词练习模式下，标记某个单词为已掌握（将wrongCount设为0）
      const wordIndex = action.payload.wordIndex
      if (wordIndex >= 0 && wordIndex < state.chapterData.userInputLogs.length) {
        state.chapterData.userInputLogs[wordIndex].wrongCount = 0
      }
      break
    }
    default: {
      return state
    }
  }
}

export const TypingContext = createContext<{ state: TypingState; dispatch: Dispatch } | null>(null)
