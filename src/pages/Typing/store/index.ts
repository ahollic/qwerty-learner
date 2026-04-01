import type { ChapterData, TypingState, UserInputLog } from './type'
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
  originalTimerData: undefined,
}

export const initialUserInputLog: UserInputLog = {
  index: 0,
  correctCount: 0,
  wrongCount: 0,
  LetterMistakes: {},
  currentAttemptError: false,
  isSkipped: false,
}

function makeFreshLogs(count: number): UserInputLog[] {
  return Array.from({ length: count }, (_, index) => ({ ...structuredClone(initialUserInputLog), index }))
}

function restoreFromOriginal(state: TypingState): TypingState {
  const newState = structuredClone(initialState)
  newState.chapterData = structuredClone(state.originalChapterData!)
  // 恢复原始计时数据，避免退出练习模式后章节耗时和 WPM 变为 0/Infinity
  if (state.originalTimerData) {
    newState.timerData = structuredClone(state.originalTimerData)
  }
  newState.isFinished = true
  newState.isTransVisible = state.isTransVisible
  // 标记为正在保存记录，防止退出练习模式后重复触发 saveChapterRecord
  newState.isSavingRecord = true
  return newState
}

function startPracticeWithWords(state: TypingState, wrongWords: WordWithIndex[], originalChapterData: ChapterData): TypingState {
  const newState = structuredClone(initialState)
  newState.chapterData.words = wrongWords.map((w) => ({ ...structuredClone(w) }))
  newState.chapterData.userInputLogs = makeFreshLogs(wrongWords.length)
  newState.isErrorWordPracticeMode = true
  newState.isTransVisible = state.isTransVisible
  newState.originalChapterData = structuredClone(originalChapterData)
  // 保存原始计时数据，用于退出练习模式时恢复
  newState.originalTimerData = structuredClone(state.timerData)
  return newState
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
  SKIP_WORD_AS_FAMILIAR = 'SKIP_WORD_AS_FAMILIAR',
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
  | { type: TypingStateActionType.START_ERROR_WORD_PRACTICE; payload: { wrongWords: WordWithIndex[]; originalChapterData: ChapterData } }
  | { type: TypingStateActionType.EXIT_ERROR_WORD_PRACTICE }
  | { type: TypingStateActionType.REPEAT_ERROR_WORDS; payload: { wrongWords: WordWithIndex[] } }
  | { type: TypingStateActionType.SKIP_WORD_AS_FAMILIAR }

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
      newState.chapterData.userInputLogs = makeFreshLogs(words.length)
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
      state.chapterData.userInputLogs[state.chapterData.index].correctCount += 1
      break
    }
    case TypingStateActionType.REPORT_WRONG_WORD: {
      state.chapterData.wrongCount += 1
      const wordLog = state.chapterData.userInputLogs[state.chapterData.index]
      wordLog.wrongCount += 1
      wordLog.currentAttemptError = true
      wordLog.LetterMistakes = mergeLetterMistake(wordLog.LetterMistakes, action.payload.letterMistake)
      break
    }
    case TypingStateActionType.NEXT_WORD: {
      state.chapterData.index += 1
      state.chapterData.wordCount += 1
      state.isShowSkip = false
      if (state.chapterData.index < state.chapterData.userInputLogs.length) {
        state.chapterData.userInputLogs[state.chapterData.index].currentAttemptError = false
      }
      action?.payload?.updateReviewRecord?.(state)
      break
    }
    case TypingStateActionType.LOOP_CURRENT_WORD:
      state.isShowSkip = false
      state.chapterData.wordCount += 1
      state.chapterData.userInputLogs[state.chapterData.index].currentAttemptError = false
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
      newState.chapterData.userInputLogs = makeFreshLogs(state.chapterData.words.length)
      newState.isTyping = true
      newState.chapterData.words = action.shouldShuffle ? shuffle(state.chapterData.words) : state.chapterData.words
      newState.isTransVisible = state.isTransVisible
      newState.isErrorWordPracticeMode = state.isErrorWordPracticeMode
      newState.originalChapterData = state.originalChapterData
      newState.originalTimerData = state.originalTimerData
      return newState
    }
    case TypingStateActionType.NEXT_CHAPTER: {
      const newState = structuredClone(initialState)
      newState.chapterData.userInputLogs = makeFreshLogs(state.chapterData.words.length)
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
      state.timerData.wpm = newTime === 0 ? 0 : Math.round((state.chapterData.wordCount / newTime) * 60)
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
    case TypingStateActionType.START_ERROR_WORD_PRACTICE:
      return startPracticeWithWords(state, action.payload.wrongWords, action.payload.originalChapterData)

    case TypingStateActionType.EXIT_ERROR_WORD_PRACTICE:
      return state.originalChapterData ? restoreFromOriginal(state) : state

    case TypingStateActionType.REPEAT_ERROR_WORDS: {
      const { wrongWords } = action.payload
      if (wrongWords.length > 0) {
        const newState = structuredClone(initialState)
        newState.chapterData.words = wrongWords.map((w) => ({ ...structuredClone(w) }))
        newState.chapterData.userInputLogs = makeFreshLogs(wrongWords.length)
        newState.isErrorWordPracticeMode = true
        newState.isTransVisible = state.isTransVisible
        newState.originalChapterData = state.originalChapterData
        newState.originalTimerData = state.originalTimerData
        return newState
      }
      return state.originalChapterData ? restoreFromOriginal(state) : state
    }
    case TypingStateActionType.SKIP_WORD_AS_FAMILIAR: {
      state.chapterData.userInputLogs[state.chapterData.index].isSkipped = true
      state.chapterData.wordCount += 1
      state.isShowSkip = false
      const skipNewIndex = state.chapterData.index + 1
      if (skipNewIndex >= state.chapterData.words.length) {
        if (state.isErrorWordPracticeMode) {
          // 练习模式下跳过最后一个单词，不结束章节，保持 isTyping
          // 由 WordPanel 通过 useEffect 检测 isSkipped 变化后调用 handleLastWordInPractice
          state.isTyping = true
        } else {
          state.isTyping = false
          state.isFinished = true
        }
      } else {
        state.chapterData.index = skipNewIndex
      }
      break
    }
    default: {
      return state
    }
  }
}

export const TypingContext = createContext<{ state: TypingState; dispatch: Dispatch } | null>(null)
