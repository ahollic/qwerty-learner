import { loadDict, saveDict } from './detect-issues.js'
import type { Word, ReviewableFix } from './types.js'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const BACKUP_DIR = path.resolve(process.cwd(), 'scripts/backups')

/** 确保备份目录存在 */
function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }
}

/** 备份原始词典文件 */
export function backupDict(dictFile: string): string {
  ensureBackupDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFile = path.join(BACKUP_DIR, `${dictFile}.${timestamp}.bak`)
  const srcPath = path.resolve(process.cwd(), 'public/dicts', dictFile)
  fs.copyFileSync(srcPath, backupFile)
  return backupFile
}

/** 应用修正到词典文件 */
export function applyFixes(fixes: ReviewableFix[], dictFile: string, dryRun = false): number {
  // 只应用 approved 的修正
  const approvedFixes = fixes.filter((f) => f.status === 'approved')
  if (approvedFixes.length === 0) {
    console.log('没有已批准的修正需要应用')
    return 0
  }

  if (!dryRun) {
    // 备份
    const backupPath = backupDict(dictFile)
    console.log(`已备份到: ${backupPath}`)
  }

  // 加载词典
  const words: Word[] = loadDict(dictFile)

  // 建立修正索引
  const fixMap = new Map<string, ReviewableFix>()
  for (const fix of approvedFixes) {
    fixMap.set(fix.word, fix)
  }

  // 应用修正
  let appliedCount = 0
  for (const word of words) {
    const fix = fixMap.get(word.name)
    if (fix) {
      word.trans = fix.fixedTrans
      appliedCount++
    }
  }

  if (!dryRun) {
    saveDict(dictFile, words)
    console.log(`已应用 ${appliedCount} 条修正到 ${dictFile}`)

    // 同步词条数
    try {
      execSync('node scripts/update-dict-size.js', { cwd: process.cwd() })
      console.log('已同步词条数到 dictionary.ts')
    } catch {
      console.warn('⚠ 同步词条数失败，请手动运行: node scripts/update-dict-size.js')
    }
  } else {
    console.log(`[预览] 将应用 ${appliedCount} 条修正到 ${dictFile}`)
  }

  return appliedCount
}
