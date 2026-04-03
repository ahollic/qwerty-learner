import type { Word, DictIssue, IssueType, FixConfig } from './types.js'
import fs from 'fs'
import path from 'path'

const DICTS_DIR = path.resolve(process.cwd(), 'public/dicts')

/** 加载词典 */
export function loadDict(filename: string): Word[] {
  const filepath = path.join(DICTS_DIR, filename.endsWith('.json') ? filename : `${filename}.json`)
  if (!fs.existsSync(filepath)) {
    throw new Error(`词典文件不存在: ${filepath}`)
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'))
}

/** 保存词典 */
export function saveDict(filename: string, words: Word[]): void {
  const filepath = path.join(DICTS_DIR, filename.endsWith('.json') ? filename : `${filename}.json`)
  fs.writeFileSync(filepath, JSON.stringify(words, null, 2) + '\n', 'utf-8')
}

/** 获取所有英汉词典文件名 */
export function listEnCnDicts(): string[] {
  const files = fs.readdirSync(DICTS_DIR).filter((f) => f.endsWith('.json'))
  return files.filter((f) => {
    try {
      const data: Word[] = JSON.parse(fs.readFileSync(path.join(DICTS_DIR, f), 'utf-8'))
      if (!data.length) return false
      const sample = data[0]
      const trans = sample.trans
      return Array.isArray(trans) && trans.some((t: string) => /[\u4e00-\u9fff]/.test(t))
    } catch {
      return false
    }
  })
}

/** 检测单个词条的问题 */
function detectWordIssues(word: Word, dictFile: string, config: FixConfig): DictIssue[] {
  const issues: DictIssue[] = []
  const { rules } = config

  if (!Array.isArray(word.trans)) return issues

  // 规则1: 占位符检测
  for (const t of word.trans) {
    if (rules.placeholderValues.includes(t.trim())) {
      issues.push({
        word: word.name,
        dictFile,
        issueType: 'placeholder',
        currentTrans: word.trans,
        detail: `释义为占位符: "${t}"`,
        confidence: 1.0,
      })
      break
    }
  }

  // 规则2: 超长释义
  for (const t of word.trans) {
    if (t.length > rules.maxTranslationLength) {
      issues.push({
        word: word.name,
        dictFile,
        issueType: 'too_long',
        currentTrans: word.trans,
        detail: `释义过长 (${t.length} 字符): "${t.substring(0, 50)}..."`,
        confidence: 0.7,
      })
      break
    }
  }

  // 规则3: 释义过简 (仅有1条且很短)
  if (word.trans.length === 1 && word.trans[0].length < 4 && /[\u4e00-\u9fff]/.test(word.trans[0])) {
    issues.push({
      word: word.name,
      dictFile,
      issueType: 'oversimplified',
      currentTrans: word.trans,
      detail: `释义可能不完整: "${word.trans[0]}"`,
      confidence: 0.4,
    })
  }

  return issues
}

/** 对单个词典进行问题扫描 */
export function scanDict(dictFile: string, config: FixConfig): DictIssue[] {
  const words = loadDict(dictFile)
  const issues: DictIssue[] = []

  for (const word of words) {
    issues.push(...detectWordIssues(word, dictFile, config))
  }

  return issues
}

/** 扫描所有目标词典 */
export function scanAllDicts(config: FixConfig): DictIssue[] {
  const allIssues: DictIssue[] = []

  for (const dictFile of config.targetDicts) {
    const filename = dictFile.endsWith('.json') ? dictFile : `${dictFile}.json`
    console.log(`扫描 ${filename}...`)
    const issues = scanDict(filename, config)
    allIssues.push(...issues)
    console.log(`  发现 ${issues.length} 个问题`)
  }

  return allIssues
}

/** 按问题类型统计 */
export function summarizeIssues(issues: DictIssue[]): Record<IssueType, number> {
  const summary: Record<IssueType, number> = {
    placeholder: 0,
    too_long: 0,
    oversimplified: 0,
    no_phonetic: 0,
    inaccurate: 0,
  }
  for (const issue of issues) {
    summary[issue.issueType]++
  }
  return summary
}
