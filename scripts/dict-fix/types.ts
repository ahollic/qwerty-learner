/** 词典词条结构 */
export interface Word {
  name: string
  trans: string[]
  usphone?: string
  ukphone?: string
  notation?: string
}

/** 检测到的问题类型 */
export type IssueType = 'placeholder' | 'too_long' | 'oversimplified' | 'no_phonetic' | 'inaccurate'

/** 检测到的释义问题 */
export interface DictIssue {
  word: string
  dictFile: string
  issueType: IssueType
  currentTrans: string[]
  detail: string
  confidence: number // 0-1, 越高越确定是问题
}

/** AI 修正结果 */
export interface FixResult {
  word: string
  dictFile: string
  originalTrans: string[]
  fixedTrans: string[]
  autoApproved: boolean // 仅格式优化等小改动自动通过
  issueType: IssueType
}

/** 审核状态 */
export type ReviewStatus = 'pending' | 'approved' | 'rejected'

/** 带审核状态的修正结果 */
export interface ReviewableFix extends FixResult {
  status: ReviewStatus
  reviewerNote?: string
}

/** 工具配置 */
export interface FixConfig {
  apiEndpoint: string
  model: string
  apiKeyEnvVar: string
  batchSize: number
  targetDicts: string[]
  rules: {
    maxTranslationLength: number
    minTranslationCount: number
    placeholderValues: string[]
  }
}
