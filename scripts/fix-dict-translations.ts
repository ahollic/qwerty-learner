#!/usr/bin/env node

/**
 * 词典释义批量修正工具
 *
 * 用法:
 *   npx tsx scripts/fix-dict-translations.ts scan                        # 扫描所有目标词典
 *   npx tsx scripts/fix-dict-translations.ts scan --dict CET4_T          # 扫描指定词典
 *   npx tsx scripts/fix-dict-translations.ts fix --dict CET4_T           # AI修正指定词典
 *   npx tsx scripts/fix-dict-translations.ts fix-all                     # AI修正所有目标词典
 *   npx tsx scripts/fix-dict-translations.ts review <report-file>        # 查看变更报告
 *   npx tsx scripts/fix-dict-translations.ts approve <report-file>       # 批量批准所有变更
 *   npx tsx scripts/fix-dict-translations.ts apply <report-file>         # 应用变更
 *   npx tsx scripts/fix-dict-translations.ts apply <report-file> --dry   # 预览变更(不写入)
 */
import { fixDict, fixDictFull } from './dict-fix/ai-fix-translations.js'
import { applyFixes } from './dict-fix/apply-fixes.js'
import { scanDict, scanAllDicts, summarizeIssues, listEnCnDicts, loadDict } from './dict-fix/detect-issues.js'
import { generateDiffReport, printDiffSummary, approveAll, loadDiffReport } from './dict-fix/review-changes.js'
import type { FixConfig, DictIssue, ReviewableFix } from './dict-fix/types.js'
import fs from 'fs'
import path from 'path'

// 加载配置
const configPath = path.resolve(process.cwd(), 'scripts/dict-fix/config.json')
const config: FixConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

// 解析参数
const args = process.argv.slice(2)
const command = args[0] || 'help'
const getFlag = (flag: string): string | null => {
  const idx = args.indexOf(flag)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null
}
const hasFlag = (flag: string): boolean => args.includes(flag)

function getApiKey(): string {
  const key = process.env[config.apiKeyEnvVar]
  if (!key) {
    console.error(`错误: 请设置环境变量 ${config.apiKeyEnvVar}`)
    console.error(`  export ${config.apiKeyEnvVar}=your_api_key_here`)
    process.exit(1)
  }
  return key
}

function ensureJsonExt(name: string): string {
  return name.endsWith('.json') ? name : `${name}.json`
}

async function main(): Promise<void> {
  switch (command) {
    case 'scan': {
      const dictArg = getFlag('--dict')
      if (dictArg) {
        const dictFile = ensureJsonExt(dictArg)
        console.log(`\n📋 扫描 ${dictFile}...`)
        const issues = scanDict(dictFile, config)
        const summary = summarizeIssues(issues)

        console.log(`\n问题统计:`)
        for (const [type, count] of Object.entries(summary)) {
          if (count > 0) console.log(`  ${type}: ${count}`)
        }
        console.log(`\n总计: ${issues.length} 个问题`)

        if (issues.length > 0) {
          console.log(`\n前 20 个问题:`)
          issues.slice(0, 20).forEach((issue, i) => {
            console.log(`  ${i + 1}. [${issue.issueType}] ${issue.word}: ${issue.detail}`)
          })
          if (issues.length > 20) {
            console.log(`  ... 还有 ${issues.length - 20} 个问题`)
          }
        }
      } else {
        console.log('\n📋 扫描所有目标词典...\n')
        const issues = scanAllDicts(config)
        const summary = summarizeIssues(issues)

        console.log(`\n=== 问题统计 ===`)
        for (const [type, count] of Object.entries(summary)) {
          console.log(`  ${type}: ${count}`)
        }
        console.log(`\n总计: ${issues.length} 个问题`)
      }
      break
    }

    case 'fix': {
      const dictArg = getFlag('--dict')
      if (!dictArg) {
        console.error('请指定词典: --dict <词典名>')
        process.exit(1)
      }

      const dictFile = ensureJsonExt(dictArg)
      console.log(`\n🔧 全量审核 ${dictFile}...`)

      // 先扫描规则问题作为参考
      const ruleIssues = scanDict(dictFile, config)
      if (ruleIssues.length > 0) {
        console.log(`规则检测到 ${ruleIssues.length} 个明确问题（仅供参考，全部词条都会发给 AI 审核）`)
      }

      // 全量审核：所有词都发给 AI
      const apiKey = getApiKey()
      const allWords = loadDict(dictFile)
      console.log(`共 ${allWords.length} 个词条，全部送审...`)

      const results = await fixDictFull(dictFile, allWords, config, apiKey)

      if (results.length === 0) {
        console.log('\n未发现需要修正的词条')
        break
      }

      // 生成报告
      printDiffSummary(results)
      const reportFile = generateDiffReport(results, dictFile)
      console.log(`\n报告已保存到: ${reportFile}`)
      console.log(`审核后运行: npx tsx scripts/fix-dict-translations.ts apply ${path.basename(reportFile)}`)
      break
    }

    case 'fix-all': {
      console.log('\n🔧 全量审核所有目标词典...\n')
      const apiKey = getApiKey()
      const allFixes: Array<{ file: string; fixes: ReviewableFix[] }> = []

      for (const dictName of config.targetDicts) {
        const dictFile = ensureJsonExt(dictName)
        const allWords = loadDict(dictFile)
        console.log(`\n--- ${dictFile} (${allWords.length} 词) ---`)

        const results = await fixDictFull(dictFile, allWords, config, apiKey)
        if (results.length === 0) {
          console.log(`✓ ${dictFile}: 无需修正`)
          continue
        }

        printDiffSummary(results)
        const reportFile = generateDiffReport(results, dictFile)
        console.log(`报告: ${reportFile}`)

        // 自动批准
        const reviewable = loadDiffReport(path.basename(reportFile))
        for (const fix of reviewable) {
          if (fix.status === 'pending') fix.status = 'approved'
        }
        allFixes.push({ file: dictFile, fixes: reviewable })
      }

      console.log(`\n=== 总计 ===`)
      let totalFixes = 0
      for (const { file, fixes } of allFixes) {
        totalFixes += fixes.filter((f) => f.status === 'approved').length
        console.log(`  ${file}: ${fixes.length} 条修正`)
      }
      console.log(`合计: ${totalFixes} 条修正`)
      break
    }

    case 'review': {
      const reportFile = args[1]
      if (!reportFile) {
        // 列出所有报告
        const diffDir = path.resolve(process.cwd(), 'scripts/diff-output')
        if (fs.existsSync(diffDir)) {
          const files = fs.readdirSync(diffDir).filter((f) => f.endsWith('.json'))
          if (files.length === 0) {
            console.log('没有变更报告')
          } else {
            console.log('可用报告:')
            files.forEach((f) => console.log(`  ${f}`))
          }
        }
        break
      }

      const fixes = loadDiffReport(reportFile)
      printDiffSummary(fixes)

      const approved = fixes.filter((f) => f.status === 'approved')
      const pending = fixes.filter((f) => f.status === 'pending')
      console.log(`\n已批准: ${approved.length}, 待审核: ${pending.length}`)
      break
    }

    case 'approve': {
      const reportFile = args[1]
      if (!reportFile) {
        console.error('请指定报告文件')
        process.exit(1)
      }
      const fixes = approveAll(reportFile)
      console.log(`已批准 ${fixes.filter((f) => f.status === 'approved').length} 条修正`)
      break
    }

    case 'apply': {
      const reportFile = args[1]
      if (!reportFile) {
        console.error('请指定报告文件')
        process.exit(1)
      }

      const dryRun = hasFlag('--dry')
      const fixes = loadDiffReport(reportFile)

      // 按词典分组应用
      const byDict = new Map<string, ReviewableFix[]>()
      for (const fix of fixes) {
        if (!byDict.has(fix.dictFile)) byDict.set(fix.dictFile, [])
        byDict.get(fix.dictFile)!.push(fix)
      }

      for (const [dictFile, dictFixes] of byDict) {
        applyFixes(dictFixes, dictFile, dryRun)
      }
      break
    }

    case 'list': {
      console.log('\n可用的英汉词典:')
      const dicts = listEnCnDicts()
      dicts.forEach((d) => console.log(`  ${d}`))
      console.log(`\n总计: ${dicts.length} 个词典`)
      break
    }

    default:
      console.log(`
词典释义批量修正工具

用法:
  scan [--dict <词典>]          扫描词典问题
  fix --dict <词典>             AI修正指定词典 (DeepSeek V3.2)
  fix-all                       AI修正所有目标词典
  review [报告文件]             查看/列出变更报告
  approve <报告文件>            批量批准变更
  apply <报告文件> [--dry]      应用变更 (加 --dry 预览)
  list                          列出所有英汉词典

环境变量:
  ${config.apiKeyEnvVar}         DeepSeek API Key

示例:
  export ${config.apiKeyEnvVar}=sk-xxx
  npx tsx scripts/fix-dict-translations.ts scan --dict CET4_T
  npx tsx scripts/fix-dict-translations.ts fix --dict CET4_T
  npx tsx scripts/fix-dict-translations.ts apply diff-output/CET4_T-xxx.json
      `)
  }
}

main().catch((err) => {
  console.error('错误:', err.message)
  process.exit(1)
})
