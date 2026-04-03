import type { FixResult, ReviewableFix, ReviewStatus } from './types.js'
import fs from 'fs'
import path from 'path'

const DIFF_DIR = path.resolve(process.cwd(), 'scripts/diff-output')

/** 确保 diff-output 目录存在 */
function ensureDiffDir(): void {
  if (!fs.existsSync(DIFF_DIR)) {
    fs.mkdirSync(DIFF_DIR, { recursive: true })
  }
}

/** 生成变更报告 */
export function generateDiffReport(fixes: FixResult[], dictFile: string): string {
  ensureDiffDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const baseName = dictFile.replace('.json', '')
  const reportFile = path.join(DIFF_DIR, `${baseName}-${timestamp}.json`)

  const reviewable: ReviewableFix[] = fixes.map((fix) => ({
    ...fix,
    status: fix.autoApproved ? ('approved' as ReviewStatus) : ('pending' as ReviewStatus),
  }))

  fs.writeFileSync(reportFile, JSON.stringify(reviewable, null, 2), 'utf-8')
  return reportFile
}

/** 加载已有的 diff 报告 */
export function loadDiffReport(reportFile: string): ReviewableFix[] {
  const filepath = reportFile.includes('/') ? reportFile : path.join(DIFF_DIR, reportFile)
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'))
}

/** 保存审核后的报告 */
export function saveReviewedReport(fixes: ReviewableFix[], reportFile: string): void {
  const filepath = reportFile.includes('/') ? reportFile : path.join(DIFF_DIR, reportFile)
  fs.writeFileSync(filepath, JSON.stringify(fixes, null, 2), 'utf-8')
}

/** 打印变更摘要到终端 */
export function printDiffSummary(fixes: FixResult[]): void {
  console.log('\n=== 变更摘要 ===\n')

  const autoApproved = fixes.filter((f) => f.autoApproved)
  const needsReview = fixes.filter((f) => !f.autoApproved)

  for (const fix of fixes) {
    const marker = fix.autoApproved ? '✓' : '✗'
    console.log(`${marker} ${fix.word}: ${JSON.stringify(fix.originalTrans)} → ${JSON.stringify(fix.fixedTrans)}`)
  }

  console.log(`\n--- 统计 ---`)
  console.log(`总计: ${fixes.length} 条`)
  console.log(`自动通过: ${autoApproved.length} 条 (仅格式优化)`)
  console.log(`需审核: ${needsReview.length} 条 (释义有变化)`)
}

/** 批量批准所有待审核项 */
export function approveAll(reportFile: string): ReviewableFix[] {
  const fixes = loadDiffReport(reportFile)
  for (const fix of fixes) {
    if (fix.status === 'pending') {
      fix.status = 'approved'
    }
  }
  saveReviewedReport(fixes, reportFile)
  return fixes
}
